import { api } from "@refhaven/backend/api";
import type { Id } from "@refhaven/backend/id";
import { type Point, boundsOf } from "@refhaven/scene";
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
  exposedPoint,
  pageView,
  readout,
  rectOf,
  rectOnPage,
  sameRect,
  screenshot,
  showRect,
  solidPng,
  toPage,
  until,
  waitForCanvas,
} from "./canvas-screen";

const images = [
  { name: "red.png", color: [210, 40, 40], width: 400, height: 300 },
  { name: "blue.png", color: [40, 60, 210], width: 300, height: 300 },
  { name: "green.png", color: [40, 170, 70], width: 300, height: 400 },
] as const;

const canvasUrl = `${appUrl}/library?view=canvas`;
const evidence = process.env.EVIDENCE;
const { watch: watchConsole, assertClean: assertCleanConsole } = consoleWatch();

const snapshotOf = (owner: ConvexHttpClient) => owner.mutation(api.canvas.open, {});

const libraryOf = async (owner: ConvexHttpClient) =>
  (
    await owner.query(api.library.list, { paginationOpts: { numItems: 100, cursor: null } })
  ).page.map((item) => item.refId as string);

const galleryOf = async (owner: ConvexHttpClient, collectionId: Id<"collections">) =>
  (
    await owner.query(api.collections.refs, {
      collectionId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  ).page.map((item) => item.refId as string);

const find = (items: ReadonlyArray<Item>, key: string) => items.find((item) => item.key === key);

const placeOf = (item: Item | undefined) =>
  item && { x: item.x, y: item.y, scale: item.scale, z: item.z };

const samePlace = (a: Item | undefined, b: Item | undefined) =>
  a !== undefined && JSON.stringify(placeOf(a)) === JSON.stringify(placeOf(b));

const drag = async (page: Page, from: Point, by: Point) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 8 });
  await page.mouse.up();
};

const click = (page: Page, at: Point) => page.mouse.click(at.x, at.y);

const press = (page: Page, keys: string) => page.keyboard.press(keys);

const selected = async (page: Page, count: number) =>
  until(
    () => readout(page),
    (r) => r.selected === count,
    `${count} selected in the readout`,
  );

const { browser, page } = await openPageWithPasskeyDevice();
watchConsole(page);
try {
  await page.setViewportSize({ width: 1400, height: 900 });
  await signInWithPasskey(page, `check-canvas-undo-${Date.now().toString(36)}`);
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
  const owner = await clientFor(page);
  await page.goto(canvasUrl);
  await waitForCanvas(page, 3);
  const opened = await snapshotOf(owner);
  const refIdOf = async (name: string) =>
    (
      await owner.query(api.library.list, { paginationOpts: { numItems: 100, cursor: null } })
    ).page.find((item) => item.fileName === name)!.refId as string;
  const [red, blue, green] = (await Promise.all(images.map(({ name }) => refIdOf(name)))).map(
    (refId) => find(opened.items, refId)!,
  ) as [Item, Item, Item];
  const colorOf = new Map<string, Rgb>(
    [red, blue, green].map((item, index) => [item.key, images[index]!.color as Rgb]),
  );
  const pointOf = async (item: Item) =>
    toPage(await pageView(page), exposedPoint(item, (await snapshotOf(owner)).items));
  const drawnAt = async (item: Item, name?: string) => {
    await waitForCanvas(page, (await readout(page)).items);
    const expected = rectOnPage(await pageView(page), item);
    const found = rectOf(await screenshot(page, name), colorOf.get(item.key)!);
    // A selected image's 2 px outline covers its edges.
    return { ok: sameRect(found, expected, 3), found, expected };
  };
  const button = (name: string) => page.getByRole("button", { name, exact: true });

  assert(
    (await button("Undo").isDisabled()) && (await button("Redo").isDisabled()),
    "a new canvas page has nothing to undo or redo, and both buttons are disabled",
  );

  await click(page, await pointOf(red));
  await selected(page, 1);
  const beforeDelete = await snapshotOf(owner);
  await press(page, "Delete");
  await until(
    () => readout(page),
    (r) => r.items === 2 && r.selected === 0,
    "Delete to remove the image",
  );
  const afterDelete = await snapshotOf(owner);
  assert(
    afterDelete.rev === beforeDelete.rev + 1 &&
      find(afterDelete.items, red.key) === undefined &&
      (await libraryOf(owner)).includes(red.refId),
    `Delete removes the selected image with one apply call, rev ${beforeDelete.rev} to ${afterDelete.rev}: canvas.open no longer returns it, and the library's gallery still lists it`,
  );

  await press(page, "ControlOrMeta+z");
  await until(
    () => readout(page),
    (r) => r.items === 3,
    "Mod+Z to bring the image back",
  );
  const afterUndo = await snapshotOf(owner);
  const back = await drawnAt(find(afterUndo.items, red.key)!, "01-removal-undone.png");
  assert(
    afterUndo.rev === afterDelete.rev + 1 &&
      samePlace(find(afterUndo.items, red.key), red) &&
      back.ok,
    `Mod+Z brings the image back with one call at the same position, scale, and z ${JSON.stringify(placeOf(red))}, drawn at ${showRect(back.found)}, where it was: ${showRect(back.expected)}`,
  );

  await press(page, "ControlOrMeta+Shift+z");
  await until(
    () => readout(page),
    (r) => r.items === 2,
    "Mod+Shift+Z to remove it again",
  );
  assert(
    find((await snapshotOf(owner)).items, red.key) === undefined &&
      (await button("Redo").isDisabled()),
    "Mod+Shift+Z removes the image again, and leaves nothing to redo",
  );
  await button("Undo").click();
  await until(
    () => readout(page),
    (r) => r.items === 3,
    "the Undo button to bring the image back",
  );
  assert(
    samePlace(find((await snapshotOf(owner)).items, red.key), red),
    "the Undo button brings it back where it was",
  );

  await drag(page, await pointOf(red), { x: 90, y: 50 });
  const moved = await until(
    async () => find((await snapshotOf(owner)).items, red.key)!,
    (item) => item.x !== red.x,
    "the drag to save",
  );
  await press(page, "ControlOrMeta+z");
  const unmoved = await until(
    async () => find((await snapshotOf(owner)).items, red.key)!,
    (item) => item.x === red.x,
    "Mod+Z to undo the move",
  );
  const unmovedOnPage = await drawnAt(unmoved, "02-move-undone.png");
  assert(
    unmoved.y === red.y && unmovedOnPage.ok,
    `undo puts a dragged image back at ${red.x.toFixed(1)}, ${red.y.toFixed(1)} in canvas.open and on the page, at ${showRect(unmovedOnPage.found)}`,
  );
  await press(page, "Control+y");
  const redone = await until(
    async () => find((await snapshotOf(owner)).items, red.key)!,
    (item) => item.x === moved.x,
    "Ctrl+Y to redo the move",
  );
  const redoneOnPage = await drawnAt(redone);
  assert(
    redone.y === moved.y && redoneOnPage.ok,
    `Ctrl+Y redoes it: the image is at ${moved.x.toFixed(1)}, ${moved.y.toFixed(1)} again, drawn at ${showRect(redoneOnPage.found)}`,
  );

  const pairBefore = await snapshotOf(owner);
  await click(page, await pointOf(redone));
  await page.keyboard.down("Shift");
  await click(page, await pointOf(blue));
  await page.keyboard.up("Shift");
  await selected(page, 2);
  await drag(page, await pointOf(blue), { x: -60, y: 70 });
  const pairMoved = await until(
    () => snapshotOf(owner),
    (s) => s.rev === pairBefore.rev + 1,
    "the pair drag to save",
  );
  await press(page, "ControlOrMeta+z");
  const pairUndone = await until(
    () => snapshotOf(owner),
    (s) => s.rev === pairMoved.rev + 1,
    "Mod+Z to undo the pair",
  );
  assert(
    find(pairMoved.items, blue.key)!.x !== blue.x &&
      samePlace(find(pairUndone.items, red.key), find(pairBefore.items, red.key)) &&
      samePlace(find(pairUndone.items, blue.key), find(pairBefore.items, blue.key)),
    `two images moved together are undone together with one apply call: rev ${pairMoved.rev} to ${pairUndone.rev}`,
  );

  assert(await button("Redo").isEnabled(), "after an undo, Redo is enabled");
  await press(page, "Escape");
  await selected(page, 0);
  const greenBefore = find(pairUndone.items, green.key)!;
  await drag(page, await pointOf(green), { x: 70, y: -40 });
  await until(
    async () => find((await snapshotOf(owner)).items, green.key)!,
    (item) => item.x !== greenBefore.x,
    "the green drag to save",
  );
  assert(await button("Redo").isDisabled(), "a new edit after an undo disables Redo");

  const blueBefore = find((await snapshotOf(owner)).items, blue.key)!;
  await drag(page, await pointOf(blue), { x: 0, y: 80 });
  await until(
    async () => find((await snapshotOf(owner)).items, blue.key)!,
    (item) => item.y !== blueBefore.y,
    "the blue drag to save",
  );
  await owner.mutation(api.canvas.apply, {
    canvasId: opened.canvasId,
    ops: [{ op: "remove", key: blue.key }],
  });
  await until(
    () => readout(page),
    (r) => r.items === 2,
    "the page to hear of the removal from another call",
  );
  const beforeFailedUndo = await snapshotOf(owner);
  await press(page, "ControlOrMeta+z");
  await page.getByText("That change could not be undone.").waitFor();
  const afterFailedUndo = await snapshotOf(owner);
  assert(
    afterFailedUndo.rev === beforeFailedUndo.rev &&
      JSON.stringify(afterFailedUndo.items) === JSON.stringify(beforeFailedUndo.items),
    "undo of a move whose image another call removed shows 'That change could not be undone.' and changes nothing",
  );
  await press(page, "ControlOrMeta+z");
  const greenUndone = await until(
    async () => find((await snapshotOf(owner)).items, green.key)!,
    (item) => item.x === greenBefore.x,
    "the next undo to undo the green drag",
  );
  assert(
    greenUndone.y === greenBefore.y,
    "the next undo still works: it puts the green image back where it was before its drag",
  );

  await page.evaluate(() => {
    const field = document.createElement("input");
    field.setAttribute("aria-label", "Probe");
    field.value = "abc";
    document.querySelector('[data-testid="canvas-readout"]')!.after(field);
  });
  await click(page, await pointOf(greenUndone));
  await selected(page, 1);
  const beforeTyping = await snapshotOf(owner);
  const field = page.getByLabel("Probe");
  await field.focus();
  await field.press("End");
  await press(page, "Backspace");
  const afterBackspace = await field.inputValue();
  await press(page, "ControlOrMeta+a");
  await page.keyboard.type("x");
  const afterSelectAll = await field.inputValue();
  await press(page, "Delete");
  await press(page, "Escape");
  const typedReadout = await readout(page);
  assert(
    afterBackspace === "ab" &&
      afterSelectAll === "x" &&
      typedReadout.items === 2 &&
      typedReadout.selected === 1 &&
      (await snapshotOf(owner)).rev === beforeTyping.rev,
    `with a text field focused, Backspace and Mod+A edit the text ("${afterBackspace}", then "${afterSelectAll}"), and no shortcut touches the canvas: ${typedReadout.items} images, ${typedReadout.selected} selected, no apply call`,
  );
  await page.evaluate(() => document.querySelector('input[aria-label="Probe"]')!.remove());

  await press(page, "ControlOrMeta+a");
  const all = await selected(page, 2);
  await press(page, "Escape");
  const none = await selected(page, 0);
  assert(
    all.selected === all.items && none.selected === 0,
    `Mod+A selects every item (${all.selected} of ${all.items}), and Escape clears the selection (${none.selected})`,
  );

  await page.reload();
  await waitForCanvas(page, 2);
  const offCanvas = page.getByTestId("off-canvas");
  const offText = await offCanvas.textContent();
  if (evidence) {
    await page.getByTestId("canvas-panel").screenshot({ path: `${evidence}/03-panel.png` });
  }
  assert(
    (await offCanvas.getAttribute("data-count")) === "1" &&
      offText === "1 image of the library is not on this canvas.",
    `after a reload the library's canvas says: ${offText}`,
  );
  const beforePutBack = await snapshotOf(owner);
  await button("Put them back").click();
  await until(
    () => readout(page),
    (r) => r.items === 3,
    "Put them back to place the image",
  );
  const putBack = await snapshotOf(owner);
  const blueBack = find(putBack.items, blue.key);
  const layout = boundsOf(beforePutBack.items)!;
  assert(
    putBack.rev === beforePutBack.rev + 1 &&
      blueBack !== undefined &&
      boundsOf([blueBack])!.left > layout.right &&
      (await offCanvas.count()) === 0,
    `Put them back places the image to the right of the layout, its left edge ${boundsOf([blueBack!])?.left.toFixed(1)} > ${layout.right.toFixed(1)}, and the line goes away`,
  );
  const again = await owner.mutation(api.canvas.open, { placeRemoved: true });
  assert(
    again.rev === putBack.rev && again.removed === 0,
    `a second ask to put them back finds nothing to place: rev stays ${putBack.rev}`,
  );

  const dropColor: Rgb = [220, 200, 40];
  const dropped: Carried = {
    name: "yellow.png",
    mimeType: "image/png",
    buffer: await solidPng(page, dropColor, 500, 300),
  };
  const view = await pageView(page);
  await send(page, "drop", [dropped], '[data-testid="canvas"]', {
    x: Math.round(view.box.x + 700),
    y: Math.round(view.box.y + 450),
  });
  await until(
    () => readout(page),
    (r) => r.items === 4,
    "the dropped image to land",
  );
  const yellow = await refIdOf("yellow.png");
  await press(page, "ControlOrMeta+z");
  await until(
    () => readout(page),
    (r) => r.items === 3,
    "Mod+Z to undo the drop",
  );
  assert(
    find((await snapshotOf(owner)).items, yellow) === undefined &&
      (await libraryOf(owner)).includes(yellow),
    "an image dropped on the canvas and then undone leaves the canvas and stays in the library",
  );

  const board = await owner.mutation(api.collections.create, { name: "Board" });
  await owner.mutation(api.collections.addRefs, {
    collectionId: board,
    refIds: [red.refId, green.refId],
  });
  await page.goto(`${appUrl}/c/${board}?view=canvas`);
  await waitForCanvas(page, 2);
  const inBoard = await owner.mutation(api.canvas.open, { collectionId: board });
  const redInBoard = find(inBoard.items, red.key)!;
  await click(page, toPage(await pageView(page), exposedPoint(redInBoard, inBoard.items)));
  await selected(page, 1);
  assert(
    (await button("Remove from collection").count()) === 1 &&
      (await button("Remove from canvas").count()) === 0,
    "on a collection's canvas the button says Remove from collection",
  );
  await press(page, "Delete");
  await until(
    () => readout(page),
    (r) => r.items === 1,
    "Delete on the collection's canvas",
  );
  assert(
    !(await galleryOf(owner, board)).includes(red.refId) &&
      (await libraryOf(owner)).includes(red.refId),
    "on a collection's canvas Delete takes the image out of the collection, and it stays in the library",
  );
  await press(page, "ControlOrMeta+z");
  await until(
    () => readout(page),
    (r) => r.items === 2,
    "Mod+Z on the collection's canvas",
  );
  const boardBack = await owner.mutation(api.canvas.open, { collectionId: board });
  assert(
    (await galleryOf(owner, board)).includes(red.refId) &&
      samePlace(find(boardBack.items, red.key), redInBoard),
    "undo puts the image back in the collection and on its canvas, at the same position, scale, and z",
  );
  await screenshot(page, "04-collection-undone.png");

  assertCleanConsole();
} finally {
  await browser.close();
}
