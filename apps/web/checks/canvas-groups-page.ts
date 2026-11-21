import { api } from "@refhaven/backend/api";
import type { Id } from "@refhaven/backend/id";
import type { Point } from "@refhaven/scene";
import type { Page } from "playwright";
import {
  assert,
  cardNamed,
  consoleWatch,
  openPageWithPasskeyDevice,
  signInWithPasskey,
} from "./browser";
import {
  canvasViewport,
  type PageView,
  exposedPoint,
  type Rgb,
  pageView,
  readout,
  rectOnPage,
  sameRect,
  screenshot,
  settle,
  showRect,
  solidPng,
  toPage,
  until,
  collectionCanvas,
} from "./canvas-screen";

const images = {
  red: [210, 40, 40],
  green: [40, 170, 60],
  blue: [40, 80, 210],
} satisfies Record<string, Rgb>;

const { watch: watchConsole, assertClean: assertCleanConsole } = consoleWatch();

type Op = { op: string; key?: string; fields?: Record<string, unknown> };

const round = ({ x, y }: Point): Point => ({ x: Math.round(x), y: Math.round(y) });

const { browser, page } = await openPageWithPasskeyDevice();
watchConsole(page);
const applied: Array<ReadonlyArray<Op>> = [];
page.on("websocket", (socket) =>
  socket.on("framesent", ({ payload }) => {
    const message = JSON.parse(String(payload)) as {
      type?: string;
      udfPath?: string;
      args?: Array<{ ops: Array<Op> }>;
    };
    if (message.type === "Mutation" && message.udfPath === "canvas:apply") {
      applied.push(message.args![0]!.ops);
    }
  }),
);

const opsOf = (calls: ReadonlyArray<ReadonlyArray<Op>>) =>
  calls.map((ops) =>
    ops.map((op) => (op.op === "patch" ? `patch ${Object.keys(op.fields ?? {}).sort()}` : op.op)),
  );
const showOps = (since: number) => JSON.stringify(opsOf(applied.slice(since)));

const shown = (on: Page, count: number) =>
  until(
    () => readout(on),
    (r) => r.items === count,
    `${count} items in the readout`,
  );
const selectedOn = (on: Page, count: number) =>
  until(
    () => readout(on),
    (r) => r.selected === count,
    `${count} selected`,
  );
const outlined = async () =>
  (
    await page
      .locator("[data-outline-key]")
      .evaluateAll((elements) => elements.map((element) => element.dataset.outlineKey!))
  ).sort();

try {
  await page.setViewportSize(canvasViewport);
  await signInWithPasskey(page, `check-canvas-groups-page-${Date.now().toString(36)}`);
  const main = await collectionCanvas(page);
  const canvasUrl = `${main.url}?view=canvas`;
  await page.getByLabel("Add images").setInputFiles(
    await Promise.all(
      (Object.entries(images) as Array<[keyof typeof images, Rgb]>).map(async ([name, color]) => ({
        name: `${name}.png`,
        mimeType: "image/png",
        buffer: await solidPng(page, color, 400, 400),
      })),
    ),
  );
  await page
    .locator('[role="status"] li[data-outcome="saved"]')
    .nth(2)
    .waitFor({ timeout: 60_000 });
  const refIdOf = async (name: string) =>
    (await cardNamed(page, `${name}.png`).getAttribute("data-ref-id")) as Id<"refs">;
  const [redRef, greenRef, blueRef] = await Promise.all(["red", "green", "blue"].map(refIdOf));

  const owner = main.client;
  const placed = await main.open();
  const { canvasId } = placed;
  const keyOf = (refId: string) =>
    placed.items.find((item) => item.kind === "image" && item.refId === refId)!.key;
  const [red, green, blue, label] = [keyOf(redRef!), keyOf(greenRef!), keyOf(blueRef!), "label"];
  await owner.mutation(api.canvas.apply, {
    canvasId,
    ops: [
      { op: "patch", key: red, fields: { x: 0, y: 0, z: "a1" } },
      { op: "patch", key: green, fields: { x: 550, y: 0, z: "a2" } },
      { op: "patch", key: blue, fields: { x: 1100, y: 0, z: "a3" } },
      {
        op: "addNote",
        key: label,
        x: 1100,
        y: 300,
        scale: 2,
        rotation: 0,
        z: "a4",
        text: "Studies",
        color: "black",
        width: 90,
        height: 34,
      },
    ],
  });
  const snapshot = async () => {
    const items = (await main.open()).items;
    return { items, of: (key: string) => items.find((item) => item.key === key)! };
  };
  const groupsNow = async () =>
    (await owner.mutation(api.canvas.open, { collectionId: main.collectionId })).items
      .flatMap((item) => (item.kind === "group" ? [item.key] : []))
      .sort();

  await page.getByRole("link", { name: "Canvas" }).click();
  await page.waitForURL(canvasUrl);
  await page.locator('[data-testid="canvas"][data-shown-thumbnails="3"]').waitFor();
  await shown(page, 4);
  await settle(page);
  const second = await page.context().newPage();
  watchConsole(second);
  await second.setViewportSize(canvasViewport);
  await second.goto(canvasUrl);
  await second.locator('[data-testid="canvas"][data-shown-thumbnails="3"]').waitFor();
  await shown(second, 4);

  /** A point of the item that no other item covers. */
  const pointOn = async (view: PageView, key: string): Promise<Point> => {
    const { items, of } = await snapshot();
    return round(toPage(view, exposedPoint(of(key), items)));
  };
  const view = await pageView(page);
  const secondView = await pageView(second);
  const on = (key: string) => pointOn(view, key);

  const click = async (at: Point, shift = false) => {
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.click(at.x, at.y);
    if (shift) await page.keyboard.up("Shift");
    await settle(page);
  };
  const drag = async (from: Point, to: Point) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    await settle(page);
  };
  const empty = round(toPage(view, { x: 275, y: 380 }));
  const clickEmpty = async () => {
    await click(empty);
    await selectedOn(page, 0);
  };
  const groupButton = page.getByRole("button", { name: "Group", exact: true });
  const ungroupButton = page.getByRole("button", { name: "Ungroup" });
  const enabled = async () => [await groupButton.isEnabled(), await ungroupButton.isEnabled()];

  const noneSelected = await enabled();
  await click(await on(red));
  await selectedOn(page, 1);
  const oneSelected = await enabled();
  await click(await on(green), true);
  await selectedOn(page, 2);
  const twoSelected = await enabled();
  assert(
    JSON.stringify([noneSelected, oneSelected, twoSelected]) ===
      JSON.stringify([
        [false, false],
        [false, false],
        [true, false],
      ]),
    `Group is enabled only with two items or more selected, and Ungroup only with a group in the selection: none ${noneSelected}, one ${oneSelected}, two ${twoSelected}`,
  );

  let calls = applied.length;
  await page.keyboard.press("ControlOrMeta+g");
  const afterGroup = await until(
    snapshot,
    ({ of }) => of(red).parent !== undefined,
    "the group to save",
  );
  const redGreen = afterGroup.of(red).parent!;
  await until(
    enabled,
    ([group, ungroup]) => !group! && ungroup!,
    "the buttons to follow the group",
  );
  assert(
    afterGroup.of(green).parent === redGreen &&
      afterGroup.of(blue).parent === undefined &&
      (await groupsNow()).join() === redGreen &&
      showOps(calls) === JSON.stringify([["addGroup", "patch parent", "patch parent"]]) &&
      (await readout(page)).selected === 2,
    `Mod+G groups the two selected images in one call that adds the group and patches each parent, and the selection stays: ${showOps(calls)}`,
  );

  await clickEmpty();
  await click(await on(red));
  await selectedOn(page, 2);
  const frame = (await page.locator("[data-frame]").boundingBox())!;
  const { of } = await snapshot();
  const [redRect, greenRect] = [rectOnPage(view, of(red)), rectOnPage(view, of(green))];
  const around = {
    left: Math.min(redRect.left, greenRect.left),
    top: Math.min(redRect.top, greenRect.top),
    right: Math.max(redRect.right, greenRect.right),
    bottom: Math.max(redRect.bottom, greenRect.bottom),
  };
  const frameRect = {
    left: frame.x,
    top: frame.y,
    right: frame.x + frame.width,
    bottom: frame.y + frame.height,
  };
  await screenshot(page, "01-group-selected.png");
  assert(
    (await outlined()).join() === [red, green].sort().join() && sameRect(frameRect, around, 3),
    `a click on empty canvas clears the selection, and then a click on one member selects both, with an outline on each and one frame around both at ${showRect(frameRect)}`,
  );

  const secondGreen = await pointOn(secondView, green);
  await until(
    async () => {
      await second.mouse.click(secondGreen.x, secondGreen.y);
      return readout(second);
    },
    (r) => r.selected === 2,
    "a click on the second page to select the group",
  );
  assert(
    true,
    "a second page with the canvas open selects both members on a click, with no reload",
  );

  const before = await snapshot();
  calls = applied.length;
  const from = await on(red);
  await drag(from, { x: from.x + 120, y: from.y + 60 });
  const moved = await until(
    snapshot,
    ({ of }) => of(red).x !== before.of(red).x,
    "the drag to save",
  );
  const shift = (key: string) => ({
    x: moved.of(key).x - before.of(key).x,
    y: moved.of(key).y - before.of(key).y,
  });
  const expected = { x: 120 / view.camera.zoom, y: 60 / view.camera.zoom };
  assert(
    [red, green].every(
      (key) =>
        Math.abs(shift(key).x - expected.x) < 0.01 && Math.abs(shift(key).y - expected.y) < 0.01,
    ) &&
      moved.of(blue).x === before.of(blue).x &&
      showOps(calls) === JSON.stringify([["patch x,y", "patch x,y"]]),
    `dragging one member moves both by ${expected.x.toFixed(2)}, ${expected.y.toFixed(2)} world units in one call, and the image outside the group stays: ${showOps(calls)}`,
  );

  calls = applied.length;
  const grip = (await page.locator('[data-handle="se"]').boundingBox())!;
  const corner = round({ x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 });
  await drag(corner, { x: corner.x + 60, y: corner.y + 30 });
  const resized = await until(
    snapshot,
    ({ of }) => of(red).scale !== moved.of(red).scale,
    "the resize to save",
  );
  const factor = (key: string) => resized.of(key).scale / moved.of(key).scale;
  assert(
    factor(red) > 1.05 &&
      Math.abs(factor(red) - factor(green)) < 1e-9 &&
      resized.of(blue).scale === moved.of(blue).scale &&
      showOps(calls) === JSON.stringify([["patch scale,x,y", "patch scale,x,y"]]),
    `resizing by a corner handle scales both members by ${factor(red).toFixed(3)} in one call: ${showOps(calls)}`,
  );

  await click(await on(blue), true);
  await selectedOn(page, 3);
  const withThird = await outlined();
  await click(await on(green), true);
  await selectedOn(page, 1);
  assert(
    withThird.join() === [red, green, blue].sort().join() && (await outlined()).join() === blue,
    "a shift-click on a third image adds it, and a shift-click on a member removes the whole group",
  );

  await clickEmpty();
  const { of: ofNow } = await snapshot();
  const redNow = ofNow(red);
  const redBox = rectOnPage(view, redNow);
  const start = round({ x: (redBox.left + redBox.right) / 2, y: redBox.bottom + 60 });
  await drag(start, { x: start.x + 20, y: redBox.bottom - 20 });
  await selectedOn(page, 2);
  assert(
    (await outlined()).join() === [red, green].sort().join(),
    "a marquee that touches one member selects both",
  );

  await click(await on(blue));
  await selectedOn(page, 1);
  await click(await on(label), true);
  await selectedOn(page, 2);
  calls = applied.length;
  await groupButton.click();
  const withNote = await until(
    snapshot,
    ({ of }) => of(label).parent !== undefined,
    "the image and the note to group",
  );
  const blueLabel = withNote.of(label).parent!;
  await clickEmpty();
  await click(await on(label));
  await selectedOn(page, 2);
  const noteGroup = await outlined();
  const labelAt = await on(label);
  await page.mouse.dblclick(labelAt.x, labelAt.y);
  const editor = page.getByLabel("Note", { exact: true });
  await editor.waitFor();
  const text = await editor.inputValue();
  await page.keyboard.press("Escape");
  await settle(page);
  assert(
    withNote.of(blue).parent === blueLabel &&
      blueLabel !== redGreen &&
      showOps(calls) === JSON.stringify([["addGroup", "patch parent", "patch parent"]]) &&
      noteGroup.join() === [blue, label].sort().join() &&
      text === "Studies",
    `the Group button groups an image and a note, a click on the note selects both, and a double click on it opens its editor with "${text}"`,
  );

  await click(await on(red));
  await selectedOn(page, 2);
  calls = applied.length;
  await page.keyboard.press("ControlOrMeta+Shift+g");
  const without = (key: string) => (groups: ReadonlyArray<string>) => !groups.includes(key);
  const withGroup = (key: string) => (groups: ReadonlyArray<string>) => groups.includes(key);
  await until(groupsNow, without(redGreen), "the ungroup to save");
  const ungroupOps = showOps(calls);
  await clickEmpty();
  await click(await on(red));
  await selectedOn(page, 1);
  const ungroupedDisabled = await enabled();
  assert(
    ungroupOps === JSON.stringify([["remove"]]) &&
      (await groupsNow()).join() === blueLabel &&
      (await outlined()).join() === red &&
      ungroupedDisabled[1] === false,
    `Mod+Shift+G ungroups in one call of one remove, and then a click selects one image, with Ungroup disabled: ${ungroupOps}`,
  );

  calls = applied.length;
  await page.keyboard.press("ControlOrMeta+z");
  await until(groupsNow, withGroup(redGreen), "the undo to regroup");
  const undone = await snapshot();
  await clickEmpty();
  await click(await on(green));
  await selectedOn(page, 2);
  const undoOps = showOps(calls);
  calls = applied.length;
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await until(groupsNow, without(redGreen), "the redo to ungroup");
  await clickEmpty();
  await click(await on(green));
  await selectedOn(page, 1);
  assert(
    undone.of(red).parent === redGreen &&
      undone.of(green).parent === redGreen &&
      undoOps === JSON.stringify([["addGroup"]]) &&
      showOps(calls) === JSON.stringify([["remove"]]),
    `undo brings the group back under its key in one call that patches no member (${undoOps}), and a click then selects both. Redo removes it again (${showOps(calls)})`,
  );

  // A member whose image is in the trash for the whole of an ungroup and its undo.
  await page.keyboard.press("ControlOrMeta+z");
  await until(groupsNow, withGroup(redGreen), "the group to come back");
  await owner.mutation(api.library.remove, { refIds: [greenRef!] });
  await shown(page, 3);
  await click(await on(red));
  await selectedOn(page, 1);
  await page.keyboard.press("ControlOrMeta+Shift+g");
  await until(groupsNow, without(redGreen), "the ungroup with a member in the trash");
  await page.keyboard.press("ControlOrMeta+z");
  await until(groupsNow, withGroup(redGreen), "the undo with a member in the trash");
  await owner.mutation(api.library.restore, { refIds: [greenRef!] });
  await shown(page, 4);
  await clickEmpty();
  await click(await on(red));
  await selectedOn(page, 2);
  const withRestored = await outlined();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await until(groupsNow, without(redGreen), "the redo to ungroup again");
  await clickEmpty();
  assert(
    withRestored.join() === [red, green].sort().join(),
    "a group that is removed and brought back by undo while a member's image is in the trash holds that member again after the restore: a click on the other selects both",
  );

  await click(await on(blue));
  await selectedOn(page, 2);
  calls = applied.length;
  await page.keyboard.press("Delete");
  await shown(page, 2);
  const deleteOps = showOps(calls);
  calls = applied.length;
  await page.keyboard.press("ControlOrMeta+z");
  await shown(page, 4);
  const back = await snapshot();
  await clickEmpty();
  await click(await on(blue));
  await selectedOn(page, 2);
  assert(
    deleteOps === JSON.stringify([["remove", "remove"]]) &&
      back.of(blue).parent === blueLabel &&
      back.of(label).parent === blueLabel &&
      JSON.stringify(opsOf(applied.slice(calls)).map((ops) => ops.sort())) ===
        JSON.stringify([["add", "addNote"]]) &&
      (await outlined()).join() === [blue, label].sort().join(),
    `Delete with a group selected removes both items (${deleteOps}), and undo brings both back still grouped (${showOps(calls)})`,
  );

  await click(await on(green));
  await selectedOn(page, 1);
  await click(await on(blue), true);
  await selectedOn(page, 3);
  calls = applied.length;
  await page.keyboard.press("ControlOrMeta+g");
  const regrouped = await until(
    snapshot,
    ({ of }) => of(label).parent !== blueLabel,
    "the three items to group",
  );
  const all = regrouped.of(green).parent!;
  await clickEmpty();
  await click(await on(label));
  await selectedOn(page, 3);
  await screenshot(page, "02-group-of-two-images-and-a-note.png");
  assert(
    regrouped.of(blue).parent === all &&
      regrouped.of(label).parent === all &&
      all !== blueLabel &&
      (await groupsNow()).includes(blueLabel) &&
      (await outlined()).join() === [green, blue, label].sort().join(),
    "grouping an image with a group moves the group's members into the new group, leaves the old group empty, and a click on the note selects all three",
  );

  assertCleanConsole();
} finally {
  await browser.close();
}
