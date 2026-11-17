import { api } from "@refhaven/backend/api";
import { type Point, placedEdge, placementGap } from "@refhaven/scene";
import type { ConvexHttpClient } from "convex/browser";
import type { Page } from "playwright";
import {
  appUrl,
  assert,
  type Carried,
  clientFor,
  consoleWatch,
  openPageWithPasskeyDevice,
  send,
  signInWithPasskey,
} from "./browser";
import {
  type Item,
  type Rgb,
  near,
  pageView,
  pixelAt,
  rectOf,
  rectOnPage,
  sameRect,
  screenshot,
  settle,
  showRect,
  solidPng,
  readout,
  toPage,
  toWorld,
  until,
  waitForCanvas,
} from "./canvas-screen";

const canvas = '[data-testid="canvas"]';
const libraryCanvas = `${appUrl}/library?view=canvas`;
const { watch: watchConsole, assertClean: assertCleanConsole } = consoleWatch();

const image = async (page: Page, name: string, color: Rgb, width: number, height: number) => ({
  carried: {
    name,
    mimeType: "image/png",
    buffer: await solidPng(page, color, width, height),
  } satisfies Carried,
  color,
});

const saved = (page: Page, count: number) =>
  page
    .locator('[role="status"] li[data-outcome="saved"]')
    .nth(count - 1)
    .waitFor({ timeout: 60_000 });

const refIdOf = async (client: ConvexHttpClient, name: string) =>
  (
    await client.query(api.library.list, { paginationOpts: { numItems: 100, cursor: null } })
  ).page.find((item) => item.fileName === name)?.refId;

const itemOf = (items: ReadonlyArray<Item>, refId: string | undefined) =>
  items.find((item) => item.refId === refId);

const at = (item: Item | undefined, world: Point) =>
  item !== undefined && Math.abs(item.x - world.x) < 1e-6 && Math.abs(item.y - world.y) < 1e-6;

const centerOf = (box: { x: number; y: number; width: number; height: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

const { browser, page } = await openPageWithPasskeyDevice();
watchConsole(page);
try {
  await page.setViewportSize({ width: 1400, height: 900 });
  await signInWithPasskey(page, `check-canvas-drop-${Date.now().toString(36)}`);
  const owner = await clientFor(page);
  await page.goto(libraryCanvas);
  await waitForCanvas(page, 0);

  const red = await image(page, "red.png", [210, 40, 40], 600, 300);
  const blue = await image(page, "blue.png", [40, 60, 210], 300, 600);
  let view = await pageView(page);
  const dropAt = { x: Math.round(view.box.x + 700), y: Math.round(view.box.y + 500) };
  const dropWorld = toWorld(view, dropAt);
  const dropped = await send(page, "drop", [red.carried, blue.carried], canvas, dropAt);
  await saved(page, 2);
  await waitForCanvas(page, 2);
  const redId = await refIdOf(owner, "red.png");
  const blueId = await refIdOf(owner, "blue.png");
  const afterDrop = await owner.mutation(api.canvas.open, {});
  const redItem = itemOf(afterDrop.items, redId);
  const blueItem = itemOf(afterDrop.items, blueId);
  assert(
    dropped === "taken" &&
      afterDrop.items.length === 2 &&
      at(redItem, dropWorld) &&
      at(blueItem, { x: dropWorld.x + placedEdge + placementGap, y: dropWorld.y }),
    `two files dropped on the library's canvas are saved, the first centered on the drop point ${dropWorld.x}, ${dropWorld.y} and the second ${placedEdge + placementGap} units to its right: ${afterDrop.items.map(({ x, y }) => `${x}, ${y}`).join(" and ")}`,
  );
  view = await pageView(page);
  let png = await screenshot(page, "01-dropped-two.png");
  for (const [item, color] of [
    [redItem!, red.color],
    [blueItem!, blue.color],
  ] as const) {
    const expected = rectOnPage(view, item);
    const found = rectOf(png, color);
    assert(
      sameRect(found, expected, 2),
      `the dropped ${item.width}x${item.height} image is drawn at ${showRect(found)}, where canvas.open puts it: ${showRect(expected)}`,
    );
  }

  const board = await owner.mutation(api.collections.create, { name: "Board" });
  await page.goto(`${appUrl}/c/${board}?view=canvas`);
  await waitForCanvas(page, 0);
  const yellow = await image(page, "yellow.png", [220, 200, 40], 500, 300);
  view = await pageView(page);
  const boardDropAt = { x: Math.round(view.box.x + 800), y: Math.round(view.box.y + 400) };
  const boardWorld = toWorld(view, boardDropAt);
  await send(page, "drop", [yellow.carried], canvas, boardDropAt);
  await saved(page, 1);
  await waitForCanvas(page, 1);
  const yellowId = await refIdOf(owner, "yellow.png");
  const boardMembers = (
    await owner.query(api.collections.refs, {
      collectionId: board,
      paginationOpts: { numItems: 100, cursor: null },
    })
  ).page.map((item) => item.refId);
  const onBoard = await owner.mutation(api.canvas.open, { collectionId: board });
  png = await screenshot(page, "02-collection-drop.png");
  assert(
    boardMembers.join() === yellowId &&
      onBoard.items.length === 1 &&
      at(itemOf(onBoard.items, yellowId), boardWorld) &&
      near(pixelAt(png, boardDropAt), yellow.color),
    `a file dropped on a collection's canvas is in the collection and drawn on that canvas at the drop point ${boardWorld.x}, ${boardWorld.y}`,
  );

  await page.goto(libraryCanvas);
  await waitForCanvas(page, 3);
  const green = await image(page, "green.png", [40, 170, 70], 400, 400);
  view = await pageView(page);
  const middle = centerOf(view.box);
  const middleWorld = toWorld(view, middle);
  const pasted = await send(page, "paste", [green.carried], "body");
  await saved(page, 1);
  await waitForCanvas(page, 4);
  const greenItem = itemOf(
    (await owner.mutation(api.canvas.open, {})).items,
    await refIdOf(owner, "green.png"),
  );
  png = await screenshot(page, "03-pasted.png");
  assert(
    pasted === "taken" && at(greenItem, middleWorld) && near(pixelAt(png, middle), green.color),
    `a pasted image lands at the center of the view, ${middleWorld.x.toFixed(1)}, ${middleWorld.y.toFixed(1)}, and is drawn there`,
  );

  const orange = await image(page, "orange.png", [240, 140, 20], 300, 300);
  await page.getByLabel("Add images").setInputFiles([orange.carried]);
  await saved(page, 2);
  await waitForCanvas(page, 5);
  const orangeItem = itemOf(
    (await owner.mutation(api.canvas.open, {})).items,
    await refIdOf(owner, "orange.png"),
  );
  png = await screenshot(page, "04-picked.png");
  assert(
    at(orangeItem, middleWorld) &&
      orangeItem!.z > greenItem!.z &&
      near(pixelAt(png, middle), orange.color),
    "an image picked with Add images in the canvas's panel lands at the center of the view, on top",
  );

  const second = await page.context().newPage();
  watchConsole(second);
  await second.setViewportSize({ width: 1400, height: 900 });
  await second.goto(libraryCanvas);
  await waitForCanvas(second, 5);
  const purple = await image(page, "purple.png", [150, 40, 200], 200, 200);
  view = await pageView(page);
  const purpleAt = { x: Math.round(view.box.x + 1200), y: Math.round(view.box.y + 700) };
  await send(page, "drop", [purple.carried], canvas, purpleAt);
  await waitForCanvas(second, 6);
  const purpleItem = itemOf(
    (await owner.mutation(api.canvas.open, {})).items,
    await refIdOf(owner, "purple.png"),
  );
  const secondView = await pageView(second);
  const shown = await until(
    async () => {
      await settle(second);
      return pixelAt(await screenshot(second), toPage(secondView, purpleItem!));
    },
    (pixel) => near(pixel, purple.color),
    "the second page to draw the dropped image",
  );
  await screenshot(second, "05-second-page.png");
  assert(
    near(shown, purple.color),
    `a second page with the same canvas open shows an image dropped in the first, without a reload: ${shown}`,
  );
  await second.close();

  // A drop that comes before the first snapshot. Every message from the server is held back, so the
  // canvas is still empty when the file is dropped, and the snapshot then fits the camera.
  const late = await page.context().newPage();
  watchConsole(late);
  await late.setViewportSize({ width: 1400, height: 900 });
  await late.routeWebSocket(/convex\.cloud/, (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => server.send(message));
    server.onMessage((message) => setTimeout(() => socket.send(message), 1500));
  });
  await late.goto(libraryCanvas);
  await late.locator(canvas).waitFor();
  const atDrop = await readout(late);
  const pink = await image(late, "pink.png", [240, 90, 170], 200, 200);
  const lateBox = (await late.locator(canvas).boundingBox())!;
  const lateAt = { x: Math.round(lateBox.x + 900), y: Math.round(lateBox.y + 300) };
  await send(late, "drop", [pink.carried], canvas, lateAt);
  await waitForCanvas(late, 7);
  const pinkItem = itemOf(
    (await owner.mutation(api.canvas.open, {})).items,
    await refIdOf(owner, "pink.png"),
  );
  const lateView = await pageView(late);
  const landed = toPage(lateView, pinkItem!);
  assert(
    atDrop.items === 0 &&
      JSON.stringify(atDrop.camera) !== JSON.stringify(lateView.camera) &&
      Math.abs(landed.x - lateAt.x) < 1 &&
      Math.abs(landed.y - lateAt.y) < 1,
    `a file dropped before the canvas has loaded lands under the drop point ${lateAt.x}, ${lateAt.y} once the view has been fitted: ${landed.x.toFixed(1)}, ${landed.y.toFixed(1)}, with ${atDrop.items} items and the camera at ${JSON.stringify(atDrop.camera)} when dropped and ${JSON.stringify(lateView.camera)} after`,
  );
  await late.close();

  const outcomes = page.locator('[role="status"] li');
  const unsaved = async () => {
    const items = (await owner.mutation(api.canvas.open, {})).items.length;
    return `${await outcomes.count()} outcomes, ${items} items`;
  };
  const before = await unsaved();
  const text = {
    dragover: await send(page, "dragover", "some text", canvas),
    drop: await send(page, "drop", "some text", canvas, purpleAt),
    paste: await send(page, "paste", "some text", canvas),
  };
  assert(
    Object.values(text).every((result) => result === "left alone") && (await unsaved()) === before,
    `on the canvas a drag or a paste with no file is left alone and saves nothing: ${JSON.stringify(text)}`,
  );
  const teal = await image(page, "teal.png", [30, 200, 200], 40, 40);
  await send(page, "dragstart", [teal.carried], canvas);
  const own = {
    dragover: await send(page, "dragover", [teal.carried], canvas),
    drop: await send(page, "drop", [teal.carried], canvas, purpleAt),
  };
  await send(page, "dragend", [teal.carried], canvas);
  assert(
    own.dragover === "refused" && own.drop === "refused" && (await unsaved()) === before,
    `on the canvas a drag that starts on the page is refused and saves nothing: ${JSON.stringify(own)}`,
  );
  await page.evaluate(() => {
    const field = document.createElement("textarea");
    field.dataset.testid = "field";
    document.body.append(field);
  });
  const intoField = await send(page, "paste", [teal.carried], '[data-testid="field"]');
  await page.evaluate(() => document.querySelector('[data-testid="field"]')!.remove());
  assert(
    intoField === "left alone" && (await unsaved()) === before,
    `on the canvas a paste into a text field is left to the field: ${intoField}`,
  );

  assertCleanConsole();
} finally {
  await browser.close();
}
