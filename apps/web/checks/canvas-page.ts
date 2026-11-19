import { api } from "@refhaven/backend/api";
import { type Point, topmostAt } from "@refhaven/scene";
import type { ConvexHttpClient } from "convex/browser";
import type { Page, Route } from "playwright";
import {
  appUrl,
  assert,
  clientFor,
  consoleWatch,
  openPageWithPasskeyDevice,
  signInWithPasskey,
} from "./browser";
import {
  canvasViewport,
  type Item,
  type Rgb,
  exposedPoint,
  near,
  pageView,
  pixelAt,
  readout,
  rectOf,
  rectOnPage,
  sameRect,
  screenshot,
  settle,
  showRect,
  sized,
  solidPng,
  toPage,
  toWorld,
  until,
  waitForCanvas,
  worldSize,
  refOf,
  openCanvas,
  canvasChanges,
} from "./canvas-screen";

type Snapshot = Awaited<ReturnType<typeof openCanvas>>;

const images = [
  { name: "red.png", color: [210, 40, 40], width: 600, height: 400 },
  { name: "blue.png", color: [40, 60, 210], width: 400, height: 400 },
  { name: "green.png", color: [40, 170, 70], width: 3000, height: 2000 },
] as const;

const canvasUrl = `${appUrl}/library?view=canvas`;
const { watch: watchConsole, assertClean: assertCleanConsole } = consoleWatch();

const showCanvas = async (page: Page, count: number) => {
  await page.goto(canvasUrl);
  await waitForCanvas(page, count);
};

const colorOf = (item: Item, refs: ReadonlyMap<string, Rgb>) => refs.get(refOf(item))!;

const drag = async (page: Page, from: Point, by: Point) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 8 });
  await page.mouse.up();
};

const click = async (page: Page, at: Point, shift = false) => {
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.click(at.x, at.y);
  if (shift) await page.keyboard.up("Shift");
};

const ctrlWheel = async (page: Page, at: Point, deltaY: number) => {
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, deltaY);
  await page.keyboard.up("Control");
};

const snapshotOf = (owner: ConvexHttpClient) => openCanvas(owner, {});

const changesSince = (owner: ConvexHttpClient, canvasId: Snapshot["canvasId"], rev: number) =>
  canvasChanges(owner, { canvasId, rev });

const { browser, page } = await openPageWithPasskeyDevice();
watchConsole(page);
try {
  await page.setViewportSize(canvasViewport);
  await signInWithPasskey(page, `check-canvas-page-${Date.now().toString(36)}`);
  await page.getByLabel("Add images").setInputFiles(
    await Promise.all(
      images.map(async ({ name, color, width, height }) => ({
        name,
        mimeType: "image/png",
        buffer: await solidPng(page, color, width, height),
      })),
    ),
  );
  await page
    .locator('[role="status"] li[data-outcome="saved"]')
    .nth(2)
    .waitFor({ timeout: 60_000 });
  const refIds: Array<string> = [];
  for (const { name } of images) {
    refIds.push(
      (await page.locator("[data-ref-id]").filter({ hasText: name }).getAttribute("data-ref-id"))!,
    );
  }
  const refColors = new Map(images.map(({ color }, index) => [refIds[index]!, color as Rgb]));

  await page.getByRole("link", { name: "Canvas" }).click();
  await page.waitForURL(canvasUrl);
  await showCanvas(page, 3);
  const owner = await clientFor(page);
  const opened = await snapshotOf(owner);
  const { canvasId } = opened;
  const [red, blue, green] = refIds.map((refId) =>
    opened.items.find((item) => refOf(item) === refId)!,
  ) as [Item, Item, Item];

  let view = await pageView(page);
  let png = await screenshot(page, "01-opened.png");
  for (const item of opened.items) {
    const expected = rectOnPage(view, item);
    const found = rectOf(png, colorOf(item, refColors));
    assert(
      sameRect(found, expected, 2) &&
        near(pixelAt(png, toPage(view, item)), colorOf(item, refColors)),
      `the image ${item.width}x${item.height} is drawn in its color at ${showRect(found)}, where canvas.open and the camera put it: ${showRect(expected)}`,
    );
  }
  const emptyPoint = { x: view.box.x + view.box.width - 30, y: view.box.y + view.box.height - 30 };
  assert(
    !topmostAt(sized(opened.items), toWorld(view, emptyPoint)) &&
      images.every(({ color }) => !near(pixelAt(png, emptyPoint), color)),
    `empty canvas shows no image color: ${pixelAt(png, emptyPoint)}`,
  );

  const redCenter = toPage(view, red);
  await page.mouse.move(redCenter.x, redCenter.y);
  await page.mouse.wheel(80, 150);
  const scrolled = await until(
    () => readout(page),
    (r) => r.camera.y !== view.camera.y && r.camera.x !== view.camera.x,
    "the wheel to pan",
  );
  assert(
    Math.abs(scrolled.camera.x - (view.camera.x + 80 / view.camera.zoom)) < 1e-6 &&
      Math.abs(scrolled.camera.y - (view.camera.y + 150 / view.camera.zoom)) < 1e-6 &&
      scrolled.camera.zoom === view.camera.zoom,
    `the wheel pans by the scrolled amount: 80, 150 px at ${Math.round(view.camera.zoom * 100)}% moves the camera ${(scrolled.camera.x - view.camera.x).toFixed(2)}, ${(scrolled.camera.y - view.camera.y).toFixed(2)} world units`,
  );
  await settle(page);
  view = await pageView(page);
  png = await screenshot(page);
  assert(
    near(pixelAt(png, toPage(view, red)), colorOf(red, refColors)) &&
      Math.abs(toPage(view, red).y - (redCenter.y - 150)) < 0.5,
    "the image moved up 150 px and left 80 px on screen with the pan",
  );

  const redOnPage = toPage(view, red);
  const cursor = { x: Math.round(redOnPage.x), y: Math.round(redOnPage.y) };
  const worldUnderCursor = toWorld(view, cursor);
  await ctrlWheel(page, cursor, -100);
  const zoomed = await until(
    () => readout(page),
    (r) => r.camera.zoom !== view.camera.zoom,
    "Ctrl+wheel to zoom",
  );
  view = await pageView(page);
  const stillUnder = toWorld(view, cursor);
  await settle(page);
  png = await screenshot(page, "02-zoomed.png");
  assert(
    zoomed.camera.zoom > scrolled.camera.zoom &&
      Math.abs(stillUnder.x - worldUnderCursor.x) < 1e-6 &&
      Math.abs(stillUnder.y - worldUnderCursor.y) < 1e-6 &&
      near(pixelAt(png, cursor), colorOf(red, refColors)),
    `Ctrl+wheel zooms toward the cursor, from ${(scrolled.camera.zoom * 100).toFixed(1)}% to ${(zoomed.camera.zoom * 100).toFixed(1)}%, and keeps world point ${worldUnderCursor.x.toFixed(2)}, ${worldUnderCursor.y.toFixed(2)} under it`,
  );

  for (let step = 0; step < 12; step++) await ctrlWheel(page, cursor, -1000);
  const maxed = await until(
    () => readout(page),
    (r) => r.camera.zoom === 64,
    "zoom to reach 6400%",
  );
  await ctrlWheel(page, cursor, -1000);
  await settle(page);
  assert(
    (await readout(page)).camera.zoom === 64 && maxed.camera.zoom === 64,
    "zoom stops at 6400%",
  );
  for (let step = 0; step < 15; step++) await ctrlWheel(page, cursor, 1000);
  await until(
    () => readout(page),
    (r) => r.camera.zoom === 0.01,
    "zoom to reach 1%",
  );
  await ctrlWheel(page, cursor, 1000);
  await settle(page);
  assert((await readout(page)).camera.zoom === 0.01, "zoom stops at 1%");

  await showCanvas(page, 3);
  view = await pageView(page);
  await click(page, toPage(view, red));
  await until(
    () => readout(page),
    (r) => r.selected === 1,
    "a click to select",
  );
  await settle(page);
  const outline = await page.locator(`[data-outline-key="${red.key}"]`).boundingBox();
  const redRect = rectOnPage(view, red);
  assert(
    outline !== null &&
      sameRect(
        {
          left: outline.x,
          top: outline.y,
          right: outline.x + outline.width,
          bottom: outline.y + outline.height,
        },
        redRect,
        1,
      ),
    `a click selects the image under the cursor, and its outline covers its screen rectangle ${showRect(redRect)}`,
  );
  await click(page, toPage(view, blue), true);
  await until(
    () => readout(page),
    (r) => r.selected === 2,
    "shift-click to add",
  );
  await settle(page);
  assert(
    (await page.locator("[data-outline-key]").count()) === 2,
    "shift-click adds a second image to the selection",
  );
  await screenshot(page, "03-two-selected.png");
  await click(page, emptyPoint);
  await until(
    () => readout(page),
    (r) => r.selected === 0,
    "a click on empty canvas to clear",
  );
  await settle(page);
  assert(
    (await page.locator("[data-outline-key]").count()) === 0,
    "a click on empty canvas clears the selection",
  );

  const before = await snapshotOf(owner);
  await drag(page, toPage(view, red), { x: 120, y: 60 });
  await until(
    () => snapshotOf(owner),
    (s) => s.rev === before.rev + 1,
    "the drag to save",
  );
  const oneMove = await changesSince(owner, canvasId, before.rev);
  const movedRed = oneMove.items[0]!;
  assert(
    oneMove.items.length === 1 &&
      movedRed.key === red.key &&
      Math.abs(movedRed.x - (red.x + 120 / view.camera.zoom)) < 1e-6 &&
      Math.abs(movedRed.y - (red.y + 60 / view.camera.zoom)) < 1e-6 &&
      (await snapshotOf(owner)).items.find((item) => item.key === red.key)!.x === movedRed.x,
    `dragging one image by 120, 60 px saves only it, moved ${(movedRed.x - red.x).toFixed(2)}, ${(movedRed.y - red.y).toFixed(2)} world units, and canvas.open returns the new position`,
  );

  await click(page, toPage(view, movedRed));
  await click(page, toPage(view, blue), true);
  await until(
    () => readout(page),
    (r) => r.selected === 2,
    "two images to be selected",
  );
  const beforePair = await snapshotOf(owner);
  await drag(page, toPage(view, blue), { x: -80, y: 100 });
  await until(
    () => snapshotOf(owner),
    (s) => s.rev > beforePair.rev,
    "the pair drag to save",
  );
  const pair = await changesSince(owner, canvasId, beforePair.rev);
  const shift = { x: -80 / view.camera.zoom, y: 100 / view.camera.zoom };
  const pairRed = pair.items.find((item) => item.key === red.key);
  const pairBlue = pair.items.find((item) => item.key === blue.key);
  assert(
    pair.rev === beforePair.rev + 1 &&
      pair.items.length === 2 &&
      Math.abs(pairRed!.x - (movedRed.x + shift.x)) < 1e-6 &&
      Math.abs(pairRed!.y - (movedRed.y + shift.y)) < 1e-6 &&
      Math.abs(pairBlue!.x - (blue.x + shift.x)) < 1e-6 &&
      Math.abs(pairBlue!.y - (blue.y + shift.y)) < 1e-6,
    `dragging with two images selected moves both by ${shift.x.toFixed(2)}, ${shift.y.toFixed(2)} world units in one apply call: rev ${beforePair.rev} to ${pair.rev}`,
  );

  const beforeClick = await snapshotOf(owner);
  await click(page, toPage(view, green));
  await until(
    () => readout(page),
    (r) => r.selected === 1,
    "a click on the green image",
  );
  const overlapTarget = { x: pairBlue!.x + 100, y: pairBlue!.y };
  const redNow = toPage(view, pairRed!);
  const onto = toPage(view, overlapTarget);
  await drag(page, redNow, { x: onto.x - redNow.x, y: onto.y - redNow.y });
  await until(
    () => snapshotOf(owner),
    (s) => s.rev > beforeClick.rev,
    "the overlap drag to save",
  );
  const afterClick = await changesSince(owner, canvasId, beforeClick.rev);
  assert(
    afterClick.rev === beforeClick.rev + 1 &&
      afterClick.items.length === 1 &&
      afterClick.items[0]!.key === red.key,
    `a click that does not move saves nothing: the next save raised rev from ${beforeClick.rev} to ${afterClick.rev} and wrote only the dragged image`,
  );

  const overlapping = (await snapshotOf(owner)).items;
  const inBoth = { x: overlapTarget.x - 50, y: overlapTarget.y };
  const expectedTop = topmostAt(sized(overlapping), inBoth)!;
  const covered = sized(overlapping).filter(
    (item) => topmostAt([item], inBoth) !== undefined,
  ).length;
  await click(page, toPage(view, inBoth));
  await until(
    () => readout(page),
    (r) => r.selected === 1,
    "a click in the overlap",
  );
  await settle(page);
  png = await screenshot(page, "04-overlap.png");
  assert(
    covered === 2 &&
      (await page.locator(`[data-outline-key="${expectedTop.key}"]`).count()) === 1 &&
      near(pixelAt(png, toPage(view, inBoth)), colorOf(expectedTop, refColors)),
    `a click where two images overlap selects the topmost, z ${expectedTop.z}, which is also the color drawn there`,
  );

  await page.reload();
  await showCanvas(page, 3);
  view = await pageView(page);
  png = await screenshot(page, "05-reloaded.png");
  const saved = (await snapshotOf(owner)).items;
  for (const item of saved) {
    const point = exposedPoint(item, saved);
    assert(
      near(pixelAt(png, toPage(view, point)), colorOf(item, refColors)),
      `after a reload the ${item.width}x${item.height} image is drawn at its saved position ${item.x.toFixed(1)}, ${item.y.toFixed(1)}`,
    );
  }

  const second = await page.context().newPage();
  watchConsole(second);
  await second.setViewportSize(canvasViewport);
  await showCanvas(second, 3);
  const greenSaved = saved.find((item) => item.key === green.key)!;
  await drag(page, toPage(view, greenSaved), { x: -100, y: -50 });
  const greenMoved = await until(
    async () => (await snapshotOf(owner)).items.find((item) => item.key === green.key)!,
    (item) => item.x !== greenSaved.x,
    "the move in the first page to save",
  );
  // The image's center stays inside its old rectangle, so it cannot show the move. These two
  // points can: one the move newly covers, and one it leaves.
  const { width: greenWidth, height: greenHeight } = worldSize(greenMoved);
  const middle = (greenMoved.x + greenSaved.x) / 2;
  const newlyCovered = { x: middle - greenWidth / 2, y: greenMoved.y + greenHeight / 4 };
  const leftBehind = { x: middle + greenWidth / 2, y: greenSaved.y };
  const afterMove = saved.map((item) => (item.key === green.key ? greenMoved : item));
  if (topmostAt(sized(afterMove), newlyCovered)?.key !== green.key) {
    throw new Error("FAIL the point the move newly covers is hidden by another image");
  }
  const secondView = await pageView(second);
  const greenColor = colorOf(green, refColors);
  const shownInSecond = await until(
    async () => {
      await settle(second);
      const png = await screenshot(second);
      return {
        newlyCovered: pixelAt(png, toPage(secondView, newlyCovered)),
        leftBehind: pixelAt(png, toPage(secondView, leftBehind)),
      };
    },
    (shown) => near(shown.newlyCovered, greenColor) && !near(shown.leftBehind, greenColor),
    "the second page to show the move",
  );
  await screenshot(second, "06-second-page.png");
  assert(
    near(shownInSecond.newlyCovered, greenColor) && !near(shownInSecond.leftBehind, greenColor),
    `a second page of the same user shows a move made in the first one, without a reload: the newly covered point is ${shownInSecond.newlyCovered} and the vacated point is ${shownInSecond.leftBehind}`,
  );
  await second.close();

  const held: Array<Route> = [];
  const displayResponses: Array<{ path: string; status: number }> = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.endsWith("/2048.webp")) {
      displayResponses.push({
        path: url.pathname.replace(/[0-9a-f]{56}/, "…"),
        status: response.status(),
      });
    }
  });
  const isDisplayCopy = (url: URL) => url.pathname.endsWith("/2048.webp");
  await page.route(isDisplayCopy, (route) => {
    held.push(route);
  });
  await page.reload();
  await showCanvas(page, 3);
  view = await pageView(page);
  const centerOfView = { x: view.box.x + view.box.width / 2, y: view.box.y + view.box.height / 2 };
  const greenNow = toPage(view, greenMoved);
  await page.mouse.move(centerOfView.x, centerOfView.y);
  await page.mouse.wheel(greenNow.x - centerOfView.x, greenNow.y - centerOfView.y);
  await settle(page);
  for (let step = 0; step < 20 && (await readout(page)).camera.zoom * 400 < 640; step++) {
    await ctrlWheel(page, centerOfView, -40);
  }
  await until(
    () => Promise.resolve(held.length),
    (count) => count > 0,
    "a request for 2048.webp",
  );
  await settle(page);
  view = await pageView(page);
  const greenRect = rectOnPage(view, greenMoved);
  const displayKeys = async () =>
    (await page.getByTestId("canvas").getAttribute("data-display-keys"))!.split(" ");
  const thumbnailShown = !(await displayKeys()).includes(green.key);
  const withThumbnail = rectOf(
    await screenshot(page, "07-thumbnail.png"),
    colorOf(green, refColors),
  );
  for (const route of held) await route.continue();
  await page.unroute(isDisplayCopy);
  await page.locator(`[data-testid="canvas"][data-display-keys~="${green.key}"]`).waitFor();
  await settle(page);
  const withDisplay = rectOf(await screenshot(page, "08-display.png"), colorOf(green, refColors));
  assert(
    thumbnailShown &&
      sameRect(withThumbnail, greenRect, 2) &&
      sameRect(withDisplay, greenRect, 2) &&
      sameRect(withDisplay, withThumbnail!, 1),
    `at ${Math.round(view.camera.zoom * 100)}% the 3000x2000 image is ${Math.round(greenRect.right - greenRect.left)} px wide on screen, and it covers ${showRect(withThumbnail)} with its thumbnail and ${showRect(withDisplay)} with its 2048 px copy`,
  );
  assert(
    displayResponses.length > 0 && displayResponses.every(({ status }) => status === 200),
    `the 2048 px copy loaded from ${displayResponses.map(({ path, status }) => `${path} (${status})`).join(", ")}`,
  );

  await showCanvas(page, 3);
  view = await pageView(page);
  const beforeBlur = await snapshotOf(owner);
  const dragged = beforeBlur.items.find((item) => item.key === red.key)!;
  const grab = toPage(view, exposedPoint(dragged, beforeBlur.items));
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 40, grab.y + 20, { steps: 4 });
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const dropped = await until(
    async () => (await snapshotOf(owner)).items.find((item) => item.key === red.key)!,
    (item) => item.x !== dragged.x,
    "the drag that a blur interrupted to save",
  );
  await page.mouse.move(grab.x + 300, grab.y + 200, { steps: 4 });
  await page.mouse.up();
  await click(page, toPage(view, exposedPoint(dropped, [dropped])));
  await until(
    () => readout(page),
    (r) => r.selected === 1,
    "a click after the interrupted drag to select",
  );
  const afterBlur = await snapshotOf(owner);
  const settled = afterBlur.items.find((item) => item.key === red.key)!;
  assert(
    Math.abs(dropped.x - dragged.x - 40 / view.camera.zoom) < 0.01 &&
      Math.abs(dropped.y - dragged.y - 20 / view.camera.zoom) < 0.01 &&
      settled.x === dropped.x &&
      settled.y === dropped.y &&
      afterBlur.rev === beforeBlur.rev + 1,
    `a drag that the window losing focus interrupts is saved once where it was, and later pointer moves do not move the image: rev ${beforeBlur.rev} to ${afterBlur.rev}`,
  );

  const yellow = { name: "yellow.png", color: [220, 200, 40] as Rgb, width: 500, height: 300 };
  const board = await owner.mutation(api.collections.create, { name: "Board" });
  await owner.mutation(api.collections.addRefs, {
    collectionId: board,
    refIds: [refOf(red), refOf(blue)],
  });
  await page.goto(`${appUrl}/library`);
  await page.locator(`[data-collection-id="${board}"]`).click();
  await page.waitForURL(`${appUrl}/c/${board}`);
  await page.getByRole("heading", { name: "Board" }).waitFor();
  await page.getByLabel("Add images").setInputFiles([
    {
      name: yellow.name,
      mimeType: "image/png",
      buffer: await solidPng(page, yellow.color, yellow.width, yellow.height),
    },
  ]);
  const savedLine = page.locator('[role="status"] li').first();
  await savedLine.waitFor({ timeout: 60_000 });
  if ((await savedLine.getAttribute("data-outcome")) !== "saved") {
    throw new Error(
      `FAIL the collection's page saves ${yellow.name}: ${await savedLine.textContent()}`,
    );
  }
  const yellowRefId = (await page
    .locator("[data-ref-id]")
    .filter({ hasText: yellow.name })
    .getAttribute("data-ref-id"))!;
  refColors.set(yellowRefId, yellow.color);
  await page.getByRole("link", { name: "Canvas" }).click();
  await page.waitForURL(`${appUrl}/c/${board}?view=canvas`);
  await waitForCanvas(page, 3);
  const collectionSnapshot = () => openCanvas(owner, { collectionId: board });
  const inCollection = await collectionSnapshot();
  view = await pageView(page);
  png = await screenshot(page, "09-collection-canvas.png");
  assert(
    (await readout(page)).items === 3 &&
      inCollection.canvasId !== canvasId &&
      inCollection.items
        .map((item) => refOf(item))
        .sort()
        .join() === [refOf(red), refOf(blue), yellowRefId].sort().join(),
    "the collection's canvas page shows its 3 members in the readout, from its own canvas",
  );
  for (const item of inCollection.items) {
    const expected = rectOnPage(view, item);
    const found = rectOf(png, colorOf(item, refColors));
    assert(
      sameRect(found, expected, 2),
      `on the collection's canvas the ${item.width}x${item.height} image is drawn at ${showRect(found)}, where its canvas puts it: ${showRect(expected)}`,
    );
  }
  assert(
    rectOf(png, colorOf(green, refColors)) === null,
    "the image that is not in the collection is not drawn on its canvas",
  );

  const libraryBeforeDrag = await snapshotOf(owner);
  const redThere = inCollection.items.find((item) => item.key === red.key)!;
  await drag(page, toPage(view, redThere), { x: 100, y: 40 });
  await until(
    collectionSnapshot,
    (s) => s.rev === inCollection.rev + 1,
    "the drag on the collection's canvas to save",
  );
  const collectionMove = await changesSince(owner, inCollection.canvasId, inCollection.rev);
  const libraryAfterDrag = await snapshotOf(owner);
  const redInLibrary = libraryBeforeDrag.items.find((item) => item.key === red.key)!;
  assert(
    collectionMove.items.length === 1 &&
      collectionMove.items[0]!.key === red.key &&
      Math.abs(collectionMove.items[0]!.x - (redThere.x + 100 / view.camera.zoom)) < 1e-6 &&
      Math.abs(collectionMove.items[0]!.y - (redThere.y + 40 / view.camera.zoom)) < 1e-6 &&
      libraryAfterDrag.rev === libraryBeforeDrag.rev &&
      libraryAfterDrag.items.find((item) => item.key === red.key)!.x === redInLibrary.x &&
      libraryAfterDrag.items.find((item) => item.key === red.key)!.y === redInLibrary.y,
    "a drag on the collection's canvas is saved to that canvas and not to the library's",
  );

  await page.getByRole("link", { name: "refhaven" }).click();
  await page.waitForURL(`${appUrl}/library`);
  await page.getByRole("link", { name: "Canvas" }).click();
  await page.waitForURL(canvasUrl);
  await waitForCanvas(page, 4);
  view = await pageView(page);
  png = await screenshot(page, "10-library-after-collection.png");
  const libraryLayout = (await snapshotOf(owner)).items;
  for (const item of libraryLayout) {
    const point = exposedPoint(item, libraryLayout);
    assert(
      near(pixelAt(png, toPage(view, point)), colorOf(item, refColors)),
      `going from the collection's canvas to the library's shows the library's layout: the ${item.width}x${item.height} image is at ${item.x.toFixed(1)}, ${item.y.toFixed(1)}`,
    );
  }

  await page.goBack();
  await page.goBack();
  await page.waitForURL(`${appUrl}/c/${board}?view=canvas`);
  await waitForCanvas(page, 3);
  view = await pageView(page);
  png = await screenshot(page, "11-collection-again.png");
  const collectionLayout = (await collectionSnapshot()).items;
  for (const item of collectionLayout) {
    const point = exposedPoint(item, collectionLayout);
    assert(
      near(pixelAt(png, toPage(view, point)), colorOf(item, refColors)),
      `going back to the collection's canvas shows its own layout: the ${item.width}x${item.height} image is at ${item.x.toFixed(1)}, ${item.y.toFixed(1)}`,
    );
  }

  assertCleanConsole();
} finally {
  await browser.close();
}
