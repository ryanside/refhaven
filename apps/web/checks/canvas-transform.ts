import { api } from "@refhaven/backend/api";
import {
  type Handle,
  type Point,
  type Rect,
  frameOf,
  handleAt,
  handles,
  minFrameEdge,
} from "@refhaven/scene";
import type { ConvexHttpClient } from "convex/browser";
import type { Page } from "playwright";
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
  type PageView,
  type Rgb,
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
  solidPng,
  toPage,
  toWorld,
  until,
  waitForCanvas,
  refOf,
  openCanvas,
} from "./canvas-screen";

const red = { name: "red.png", color: [210, 40, 40] as Rgb, width: 600, height: 400 };
const blue = { name: "blue.png", color: [40, 60, 210] as Rgb, width: 400, height: 400 };

const canvasUrl = `${appUrl}/library?view=canvas`;
const { watch: watchConsole, assertClean: assertCleanConsole } = consoleWatch();

type Op = { op: string; key?: string; fields?: Record<string, unknown> };

const snapshotOf = (owner: ConvexHttpClient) => openCanvas(owner, {});

const rectFor = (item: Item): Rect => ({
  x: item.x,
  y: item.y,
  width: item.width * item.scale,
  height: item.height * item.scale,
  rotation: item.rotation,
});

const round = ({ x, y }: Point): Point => ({ x: Math.round(x), y: Math.round(y) });

const gripCenter = async (page: Page, name: Handle | "rotate") => {
  const box = (await page.locator(`[data-handle="${name}"]`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, size: box.width };
};

const dragTo = async (page: Page, from: Point, to: Point, shift = false) => {
  await page.mouse.move(from.x, from.y);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
};

const click = async (page: Page, at: Point, shift = false) => {
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.click(Math.round(at.x), Math.round(at.y));
  if (shift) await page.keyboard.up("Shift");
};

const selected = (page: Page, count: number) =>
  until(
    () => readout(page),
    (r) => r.selected === count,
    `${count} selected`,
  );

const angleAround = (center: Point, point: Point) =>
  Math.atan2(point.y - center.y, point.x - center.x);

const sweep = (center: Point, from: Point, to: Point) => {
  const swept = angleAround(center, to) - angleAround(center, from);
  return Math.atan2(Math.sin(swept), Math.cos(swept));
};

const degrees = (radians: number) => ((radians * 180) / Math.PI).toFixed(3);

/** Every handle's center is on its point of the frame, and the rotate handle is 24 px above the top edge's middle. */
const handlesOnFrame = async (page: Page, view: PageView, frame: Rect) => {
  let worst = 0;
  for (const name of Object.keys(handles) as Array<Handle>) {
    const shown = await gripCenter(page, name);
    const expected = toPage(view, handleAt(frame, name));
    worst = Math.max(worst, Math.hypot(shown.x - expected.x, shown.y - expected.y));
  }
  const top = toPage(view, handleAt(frame, "n"));
  const rotate = await gripCenter(page, "rotate");
  const expected = {
    x: top.x + 24 * Math.sin(frame.rotation),
    y: top.y - 24 * Math.cos(frame.rotation),
  };
  return Math.max(worst, Math.hypot(rotate.x - expected.x, rotate.y - expected.y));
};

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

/** Runs a gesture and waits for its save. Returns the ops of each apply call it made. */
const savedBy = async (owner: ConvexHttpClient, gesture: () => Promise<void>) => {
  const before = await snapshotOf(owner);
  const calls = applied.length;
  await gesture();
  const after = await until(
    () => snapshotOf(owner),
    (s) => s.rev > before.rev,
    "the gesture to save",
  );
  await settle(page);
  return { before, after, calls: applied.slice(calls), rose: after.rev - before.rev };
};

const patchedFields = (calls: ReadonlyArray<ReadonlyArray<Op>>) =>
  calls.map((ops) => ops.map((op) => `${op.op} ${Object.keys(op.fields ?? {}).sort()}`).join("; "));

try {
  await page.setViewportSize(canvasViewport);
  await signInWithPasskey(page, `check-canvas-transform-${Date.now().toString(36)}`);
  await page.getByLabel("Add images").setInputFiles(
    await Promise.all(
      [red, blue].map(async ({ name, color, width, height }) => ({
        name,
        mimeType: "image/png",
        buffer: await solidPng(page, color, width, height),
      })),
    ),
  );
  await page
    .locator('[role="status"] li[data-outcome="saved"]')
    .nth(1)
    .waitFor({ timeout: 60_000 });
  const refIdOf = async (name: string) =>
    (await page.locator("[data-ref-id]").filter({ hasText: name }).getAttribute("data-ref-id"))!;
  const redRef = await refIdOf(red.name);
  const blueRef = await refIdOf(blue.name);

  const owner = await clientFor(page);
  const placed = await snapshotOf(owner);
  const keyOf = (refId: string) => placed.items.find((item) => refOf(item) === refId)!.key;
  const redKey = keyOf(redRef);
  const blueKey = keyOf(blueRef);
  await owner.mutation(api.canvas.apply, {
    canvasId: placed.canvasId,
    ops: [
      { op: "patch", key: blueKey, fields: { x: 0, y: 0 } },
      { op: "patch", key: redKey, fields: { x: 700, y: 0 } },
    ],
  });
  const itemOf = (snapshot: { items: ReadonlyArray<Item> }, key: string) =>
    snapshot.items.find((item) => item.key === key)!;

  await page.getByRole("link", { name: "Canvas" }).click();
  await page.waitForURL(canvasUrl);
  await waitForCanvas(page, 2);
  const view = await pageView(page);

  const second = await page.context().newPage();
  watchConsole(second);
  await second.setViewportSize(canvasViewport);
  await second.goto(canvasUrl);
  await waitForCanvas(second, 2);
  const secondView = await pageView(second);

  let now = await snapshotOf(owner);
  await click(page, toPage(view, itemOf(now, redKey)));
  await selected(page, 1);
  await settle(page);
  const handleCount = await page.locator("[data-frame] [data-handle]").count();
  const offFrame = await handlesOnFrame(page, view, rectFor(itemOf(now, redKey)));
  await screenshot(page, "01-handles.png");
  assert(
    handleCount === 9 && offFrame < 1,
    `selecting one image shows ${handleCount} handles on its frame, each within ${offFrame.toFixed(2)} px of its corner, edge middle, or the rotate point`,
  );
  await page.keyboard.press("Escape");
  await selected(page, 0);
  await settle(page);
  assert(
    (await page.locator("[data-handle]").count()) === 0 &&
      (await page.locator("[data-frame]").count()) === 0,
    "selecting nothing shows no frame and no handles",
  );

  await click(page, toPage(view, itemOf(now, redKey)));
  await selected(page, 1);
  await settle(page);
  const cornerStart = round(await gripCenter(page, "se"));
  const corner = await savedBy(owner, () =>
    dragTo(page, cornerStart, { x: cornerStart.x + 120, y: cornerStart.y + 60 }),
  );
  const redBefore = itemOf(corner.before, redKey);
  const redCorner = itemOf(corner.after, redKey);
  const startRect = rectFor(redBefore);
  const reach = { x: startRect.width, y: startRect.height };
  const cornerFactor =
    1 + (120 * reach.x + 60 * reach.y) / view.camera.zoom / (reach.x ** 2 + reach.y ** 2);
  const fixedBefore = toPage(view, handleAt(startRect, "nw"));
  const fixedAfter = toPage(view, handleAt(rectFor(redCorner), "nw"));
  assert(
    corner.rose === 1 &&
      corner.calls.length === 1 &&
      patchedFields(corner.calls)[0] === "patch scale,x,y" &&
      Math.abs(redCorner.scale / redBefore.scale - cornerFactor) < 1e-9 &&
      redCorner.rotation === redBefore.rotation &&
      Math.hypot(fixedAfter.x - fixedBefore.x, fixedAfter.y - fixedBefore.y) < 1e-6,
    `dragging the bottom-right handle out by 120, 60 px scales the image by ${(redCorner.scale / redBefore.scale).toFixed(4)} (expected ${cornerFactor.toFixed(4)}), keeps its top-left corner at ${fixedAfter.x.toFixed(2)}, ${fixedAfter.y.toFixed(2)}, and saves one apply call: ${patchedFields(corner.calls).join(" | ")}`,
  );
  await page.keyboard.press("Escape");
  await settle(page);
  const drawnCorner = rectOf(await screenshot(page, "02-corner-resized.png"), red.color)!;
  const expectedCorner = rectOnPage(view, redCorner);
  assert(
    sameRect(drawnCorner, expectedCorner, 2) &&
      Math.abs(
        (drawnCorner.right - drawnCorner.left) / (drawnCorner.bottom - drawnCorner.top) - 1.5,
      ) < 0.01,
    `the enlarged image is drawn at ${showRect(drawnCorner)}, where canvas.open puts it (${showRect(expectedCorner)}), with its width over its height still 1.5: ${((drawnCorner.right - drawnCorner.left) / (drawnCorner.bottom - drawnCorner.top)).toFixed(3)}`,
  );
  const shownInSecond = await until(
    async () => {
      await settle(second);
      return rectOf(await screenshot(second), red.color);
    },
    (rect) => sameRect(rect, rectOnPage(secondView, redCorner), 2),
    "the second page to show the resize",
  );
  assert(
    sameRect(shownInSecond, rectOnPage(secondView, redCorner), 2),
    `a second page shows the resize without a reload, at ${showRect(shownInSecond)}`,
  );

  await click(page, toPage(view, redCorner));
  await selected(page, 1);
  await settle(page);
  const edgeStart = round(await gripCenter(page, "w"));
  const edge = await savedBy(owner, () =>
    dragTo(page, edgeStart, { x: edgeStart.x - 80, y: edgeStart.y + 30 }),
  );
  const redEdge = itemOf(edge.after, redKey);
  const edgeFactor = 1 + 80 / view.camera.zoom / rectFor(redCorner).width;
  const middleBefore = handleAt(rectFor(redCorner), "e");
  const middleAfter = handleAt(rectFor(redEdge), "e");
  assert(
    edge.rose === 1 &&
      edge.calls.length === 1 &&
      patchedFields(edge.calls)[0] === "patch scale,x,y" &&
      Math.abs(redEdge.scale / redCorner.scale - edgeFactor) < 1e-9 &&
      Math.hypot(middleAfter.x - middleBefore.x, middleAfter.y - middleBefore.y) < 1e-6,
    `dragging the left edge's handle out by 80 px, and 30 px down, scales both sides by ${(redEdge.scale / redCorner.scale).toFixed(4)} (expected ${edgeFactor.toFixed(4)}) and keeps the right edge's middle at ${middleAfter.x.toFixed(2)}, ${middleAfter.y.toFixed(2)}, in one apply call`,
  );

  const floorStart = round(await gripCenter(page, "se"));
  const floor = await savedBy(owner, () => dragTo(page, floorStart, { x: 500, y: 150 }));
  const redFloor = itemOf(floor.after, redKey);
  const floorRect = rectFor(redFloor);
  const nwBefore = handleAt(rectFor(redEdge), "nw");
  const nwAfter = handleAt(floorRect, "nw");
  await settle(page);
  await screenshot(page, "03-floor.png");
  assert(
    floor.rose === 1 &&
      redFloor.scale > 0 &&
      Math.abs(Math.max(floorRect.width, floorRect.height) * view.camera.zoom - minFrameEdge) <
        1e-6 &&
      Math.hypot(nwAfter.x - nwBefore.x, nwAfter.y - nwBefore.y) < 1e-6 &&
      redFloor.x > nwBefore.x &&
      redFloor.y > nwBefore.y,
    `dragging the bottom-right handle far past the top-left corner stops at the floor: scale ${redFloor.scale.toFixed(5)}, a longer edge of ${(Math.max(floorRect.width, floorRect.height) * view.camera.zoom).toFixed(3)} px, still below and right of the fixed corner, so it did not flip`,
  );

  const undoResize = await savedBy(owner, () => page.keyboard.press("ControlOrMeta+z"));
  const redUndone = itemOf(undoResize.after, redKey);
  const redoResize = await savedBy(owner, () => page.keyboard.press("ControlOrMeta+Shift+z"));
  const redRedone = itemOf(redoResize.after, redKey);
  const undoAgain = await savedBy(owner, () => page.keyboard.press("ControlOrMeta+z"));
  const redBack = itemOf(undoAgain.after, redKey);
  const sameTransform = (a: Item, b: Item) =>
    a.x === b.x && a.y === b.y && a.scale === b.scale && a.rotation === b.rotation;
  assert(
    sameTransform(redUndone, redEdge) &&
      sameTransform(redRedone, redFloor) &&
      sameTransform(redBack, redEdge) &&
      [undoResize, redoResize, undoAgain].every(
        ({ calls, rose }) => rose === 1 && patchedFields(calls)[0] === "patch scale,x,y",
      ),
    `undo after a resize restores scale ${redEdge.scale.toFixed(5)} and x, y ${redEdge.x.toFixed(2)}, ${redEdge.y.toFixed(2)}, and redo applies scale ${redFloor.scale.toFixed(5)} again, one apply call each`,
  );

  const turnStart = round(await gripCenter(page, "rotate"));
  const center = toPage(view, redEdge);
  const turnEnd = round({ x: center.x + 250, y: center.y });
  const turn = await savedBy(owner, () => dragTo(page, turnStart, turnEnd));
  const redTurned = itemOf(turn.after, redKey);
  const expectedTurn = sweep(center, turnStart, turnEnd);
  assert(
    turn.rose === 1 &&
      turn.calls.length === 1 &&
      patchedFields(turn.calls)[0] === "patch rotation" &&
      Math.abs(redTurned.rotation - expectedTurn) < 1e-9 &&
      Math.abs(redTurned.rotation - Math.PI / 2) < 0.01 &&
      redTurned.scale === redEdge.scale &&
      Math.hypot(redTurned.x - redEdge.x, redTurned.y - redEdge.y) < 1e-9,
    `dragging the rotate handle a quarter turn around the center gives a rotation of ${degrees(redTurned.rotation)} degrees, in one apply call that names only the rotation, because one image turned about its own center does not move: ${patchedFields(turn.calls).join(" | ")}`,
  );
  const turnedLength = rectFor(redTurned).width;
  const onlyTurned = toPage(view, { x: redTurned.x, y: redTurned.y - 0.4 * turnedLength });
  const onlyUpright = toPage(view, { x: redTurned.x + 0.45 * turnedLength, y: redTurned.y });
  await settle(page);
  const png = await screenshot(page, "04-turned-enlarged.png");
  assert(
    near(pixelAt(png, onlyTurned), red.color) && !near(pixelAt(png, onlyUpright), red.color),
    `the wide image now covers a tall area: red at ${onlyTurned.x.toFixed(0)}, ${onlyTurned.y.toFixed(0)}, which only the turned image covers (${pixelAt(png, onlyTurned)}), and not at ${onlyUpright.x.toFixed(0)}, ${onlyUpright.y.toFixed(0)}, which only the upright one covered (${pixelAt(png, onlyUpright)})`,
  );
  const secondShows = await until(
    async () => {
      await settle(second);
      const shot = await screenshot(second);
      const at = (point: Point) => pixelAt(shot, toPage(secondView, toWorld(view, point)));
      return { turned: at(onlyTurned), upright: at(onlyUpright) };
    },
    (shown) => near(shown.turned, red.color) && !near(shown.upright, red.color),
    "the second page to show the turn",
  );
  await screenshot(second, "05-second-page.png");
  assert(
    near(secondShows.turned, red.color) && !near(secondShows.upright, red.color),
    "a second page shows the turn without a reload",
  );
  await second.close();

  await page.keyboard.press("Escape");
  await selected(page, 0);
  await click(page, onlyTurned);
  await selected(page, 1);
  await settle(page);
  const selectedByNew = await page.locator(`[data-outline-key="${redKey}"]`).count();
  await click(page, onlyUpright);
  const afterOld = await selected(page, 0);
  assert(
    selectedByNew === 1 && afterOld.selected === 0,
    "after a resize and a turn, a click inside the new footprint selects the image, and a click inside the old footprint but outside the new one selects nothing",
  );

  const undoTurn = await savedBy(owner, () => page.getByRole("button", { name: "Undo" }).click());
  const redoTurn = await savedBy(owner, () => page.getByRole("button", { name: "Redo" }).click());
  const undoTurnAgain = await savedBy(owner, () =>
    page.getByRole("button", { name: "Undo" }).click(),
  );
  assert(
    sameTransform(itemOf(undoTurn.after, redKey), redEdge) &&
      sameTransform(itemOf(redoTurn.after, redKey), redTurned) &&
      sameTransform(itemOf(undoTurnAgain.after, redKey), redEdge) &&
      [undoTurn, redoTurn, undoTurnAgain].every(
        ({ calls, rose }) => rose === 1 && patchedFields(calls)[0] === "patch rotation",
      ),
    `undo after a turn restores rotation ${degrees(redEdge.rotation)}, and redo turns it to ${degrees(redTurned.rotation)} degrees again, one apply call each that names only the rotation`,
  );

  await click(page, toPage(view, redEdge));
  await selected(page, 1);
  await settle(page);
  const snapStart = round(await gripCenter(page, "rotate"));
  const radius = Math.hypot(snapStart.x - center.x, snapStart.y - center.y);
  const snapEnd = round({
    x: center.x + radius * Math.cos((-40 * Math.PI) / 180),
    y: center.y + radius * Math.sin((-40 * Math.PI) / 180),
  });
  const snapped = await savedBy(owner, () => dragTo(page, snapStart, snapEnd, true));
  const redSnapped = itemOf(snapped.after, redKey);
  assert(
    snapped.rose === 1 && Math.abs(redSnapped.rotation - Math.PI / 4) < 1e-12,
    `with Shift held, a turn of ${degrees(sweep(center, snapStart, snapEnd))} degrees gives exactly ${degrees(redSnapped.rotation)}`,
  );

  await page.keyboard.press("Escape");
  await click(page, toPage(view, itemOf(snapped.after, blueKey)));
  await click(page, toPage(view, redSnapped), true);
  await selected(page, 2);
  await settle(page);
  const pairFrame = frameOf(snapped.after.items.map(rectFor))!;
  const pairOff = await handlesOnFrame(page, view, pairFrame);
  await screenshot(page, "06-two-selected.png");
  assert(
    pairOff < 1 && pairFrame.rotation === 0,
    `two selected images have one upright frame around both, its handles within ${pairOff.toFixed(2)} px of its points`,
  );
  const pairStart = round(await gripCenter(page, "sw"));
  const pairResize = await savedBy(owner, () =>
    dragTo(page, pairStart, { x: pairStart.x + 100, y: pairStart.y - 50 }),
  );
  const fixedCorner = handleAt(pairFrame, "ne");
  const pairFactor = itemOf(pairResize.after, blueKey).scale / itemOf(snapped.after, blueKey).scale;
  const onLines = [blueKey, redKey].every((key) => {
    const was = itemOf(snapped.after, key);
    const is = itemOf(pairResize.after, key);
    return (
      Math.abs(is.scale / was.scale - pairFactor) < 1e-9 &&
      Math.abs(is.x - (fixedCorner.x + (was.x - fixedCorner.x) * pairFactor)) < 1e-6 &&
      Math.abs(is.y - (fixedCorner.y + (was.y - fixedCorner.y) * pairFactor)) < 1e-6
    );
  });
  assert(
    pairResize.rose === 1 &&
      pairResize.calls.length === 1 &&
      patchedFields(pairResize.calls)[0] === "patch scale,x,y; patch scale,x,y" &&
      pairFactor < 1 &&
      onLines,
    `resizing two selected images scales both by ${pairFactor.toFixed(4)} and moves their centers along the lines from the fixed top-right corner, in one apply call: ${patchedFields(pairResize.calls).join(" | ")}`,
  );

  const pairNow = frameOf(pairResize.after.items.map(rectFor))!;
  const pairCenter = toPage(view, pairNow);
  const pairTurnStart = round(await gripCenter(page, "rotate"));
  const pairTurnEnd = round({
    x: pairCenter.x + 200 * Math.cos((-30 * Math.PI) / 180),
    y: pairCenter.y + 200 * Math.sin((-30 * Math.PI) / 180),
  });
  const pairTurn = await savedBy(owner, () => dragTo(page, pairTurnStart, pairTurnEnd));
  const pairAngle = sweep(pairCenter, pairTurnStart, pairTurnEnd);
  const turnedAbout = [blueKey, redKey].every((key) => {
    const was = itemOf(pairResize.after, key);
    const is = itemOf(pairTurn.after, key);
    const dx = was.x - pairNow.x;
    const dy = was.y - pairNow.y;
    return (
      Math.abs(is.rotation - was.rotation - pairAngle) < 1e-9 &&
      Math.abs(is.x - (pairNow.x + dx * Math.cos(pairAngle) - dy * Math.sin(pairAngle))) < 1e-6 &&
      Math.abs(is.y - (pairNow.y + dx * Math.sin(pairAngle) + dy * Math.cos(pairAngle))) < 1e-6
    );
  });
  await settle(page);
  await screenshot(page, "07-two-turned.png");
  assert(
    pairTurn.rose === 1 &&
      pairTurn.calls.length === 1 &&
      patchedFields(pairTurn.calls)[0] === "patch rotation,x,y; patch rotation,x,y" &&
      turnedAbout,
    `turning two selected images grows each rotation by ${degrees(pairAngle)} degrees and turns their centers about the frame's center, in one apply call`,
  );

  now = await snapshotOf(owner);
  const redNow = itemOf(now, redKey);
  await page.keyboard.press("Escape");
  await click(page, toPage(view, redNow));
  await selected(page, 1);
  const sizes: Array<string> = [];
  let worstOff = 0;
  for (const deltaY of [0, -300, 600]) {
    if (deltaY !== 0) {
      const before = (await readout(page)).camera.zoom;
      await page.mouse.move(Math.round(toPage(view, redNow).x), Math.round(toPage(view, redNow).y));
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, deltaY);
      await page.keyboard.up("Control");
      await until(
        () => readout(page),
        (r) => r.camera.zoom !== before,
        "the zoom to change",
      );
    }
    await settle(page);
    const zoomed = await pageView(page);
    worstOff = Math.max(worstOff, await handlesOnFrame(page, zoomed, rectFor(redNow)));
    const boxes = await page.locator("[data-handle]").evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return `${box.width.toFixed(1)}x${box.height.toFixed(1)}`;
      }),
    );
    sizes.push(`${Math.round(zoomed.camera.zoom * 100)}%: ${[...new Set(boxes)].join(",")}`);
  }
  await screenshot(page, "08-zoomed-out.png");
  const shapes = sizes.map((line) => line.split(": ")[1]);
  assert(
    new Set(shapes).size === 1 && !shapes[0]!.includes(",") && worstOff < 1,
    `handles keep their size on screen at every zoom and stay on the frame, within ${worstOff.toFixed(2)} px: ${sizes.join("; ")}`,
  );
  assertCleanConsole();
} finally {
  await browser.close();
}
