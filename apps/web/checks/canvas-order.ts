import { api } from "@refhaven/backend/api";
import { type Point, boundsOf } from "@refhaven/scene";
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
  type Item,
  type PageView,
  type Rgb,
  near,
  pageView,
  pixelAt,
  readout,
  screenshot,
  settle,
  solidPng,
  toPage,
  until,
  waitForCanvas,
  refOf,
  collectionCanvas,
} from "./canvas-screen";

const images = {
  red: [210, 40, 40],
  green: [40, 170, 60],
  blue: [40, 60, 210],
} satisfies Record<string, Rgb>;
type Color = keyof typeof images;

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

const selected = (count: number) =>
  until(
    () => readout(page),
    (r) => r.selected === count,
    `${count} selected`,
  );

const outlined = async () =>
  (
    await page
      .locator("[data-outline-key]")
      .evaluateAll((elements) => elements.map((element) => element.dataset.outlineKey!))
  ).sort();

const marquee = page.locator("[data-marquee]");

/** Drags from one page point to another. `during` runs with the button still down. */
const drag = async (from: Point, to: Point, shift = false, during?: () => Promise<void>) => {
  const [start, end] = [round(from), round(to)];
  await page.mouse.move(start.x, start.y);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await settle(page);
  await during?.();
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
  await settle(page);
};

const click = async (at: Point, shift = false) => {
  if (shift) await page.keyboard.down("Shift");
  const { x, y } = round(at);
  await page.mouse.click(x, y);
  if (shift) await page.keyboard.up("Shift");
  await settle(page);
};

const fieldsOf = (calls: ReadonlyArray<ReadonlyArray<Op>>) =>
  calls.map((ops) =>
    ops.map((op) => `${op.op} ${op.key} ${Object.keys(op.fields ?? {}).sort()}`).sort(),
  );

try {
  await page.setViewportSize(canvasViewport);
  await signInWithPasskey(page, `check-canvas-order-${Date.now().toString(36)}`);
  const main = await collectionCanvas(page);
  const canvasUrl = `${main.url}?view=canvas`;
  await page.getByLabel("Add images").setInputFiles(
    await Promise.all(
      (Object.entries(images) as Array<[Color, Rgb]>).map(async ([name, color]) => ({
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
  const refIdOf = async (name: Color) =>
    (await cardNamed(page, `${name}.png`).getAttribute("data-ref-id"))!;
  const refs = {
    red: await refIdOf("red"),
    green: await refIdOf("green"),
    blue: await refIdOf("blue"),
  };

  const owner = main.client;
  const placed = await main.open();
  const canvasId = placed.canvasId;
  const keyOf = (name: Color) => placed.items.find((item) => refOf(item) === refs[name])!.key;
  const key = { red: keyOf("red"), green: keyOf("green"), blue: keyOf("blue") };
  const colorOfKey = new Map((Object.keys(key) as Array<Color>).map((name) => [key[name], name]));
  const layOut = (places: Record<Color, Point & { rotation?: number; z?: string }>) =>
    owner.mutation(api.canvas.apply, {
      canvasId,
      ops: (Object.keys(places) as Array<Color>).map((name) => ({
        op: "patch" as const,
        key: key[name],
        fields: { rotation: 0, ...places[name] },
      })),
    });
  await layOut({ red: { x: 0, y: 0 }, green: { x: 600, y: 0 }, blue: { x: 1200, y: 0 } });

  await page.getByRole("link", { name: "Canvas" }).click();
  await page.waitForURL(canvasUrl);
  await waitForCanvas(page, 3);
  const view = await pageView(page);
  const at = (world: Point) => toPage(view, world);

  const second = await page.context().newPage();
  watchConsole(second);
  await second.setViewportSize(canvasViewport);
  await second.goto(canvasUrl);
  await waitForCanvas(second, 3);
  const secondView = await pageView(second);

  // A marquee dragged up and to the left, from empty canvas below green to above red.
  const rev = (await main.open()).rev;
  let calls = applied.length;
  let during = {
    shown: 0,
    box: null as { x: number; y: number; width: number; height: number } | null,
  };
  await drag(at({ x: 700, y: 350 }), at({ x: -100, y: -100 }), false, async () => {
    during = { shown: await marquee.count(), box: await marquee.boundingBox() };
    await screenshot(page, "01-marquee-drag.png");
  });
  await selected(2);
  const marqueeCorner = at({ x: -100, y: -100 });
  assert(
    during.shown === 1 &&
      during.box !== null &&
      Math.abs(during.box.x - marqueeCorner.x) <= 2 &&
      Math.abs(during.box.y - marqueeCorner.y) <= 2 &&
      Math.abs(during.box.width - 800 * view.camera.zoom) <= 2 &&
      Math.abs(during.box.height - 450 * view.camera.zoom) <= 2,
    `the marquee is drawn from the press to the pointer during the drag: ${during.box?.width.toFixed(1)} by ${during.box?.height.toFixed(1)} px at ${during.box?.x.toFixed(1)}, ${during.box?.y.toFixed(1)}`,
  );
  assert((await marquee.count()) === 0, "the marquee is gone after the release");
  assert(
    JSON.stringify(await outlined()) === JSON.stringify([key.red, key.green].sort()),
    "a marquee around red and green selects exactly those two",
  );
  assert(
    applied.length === calls && (await main.open()).rev === rev,
    "the marquee made no apply call",
  );

  await drag(at({ x: 1100, y: 350 }), at({ x: 900, y: 150 }), true);
  await selected(3);
  assert(
    JSON.stringify(await outlined()) === JSON.stringify(Object.values(key).sort()) &&
      applied.length === calls,
    "a marquee with Shift held around blue adds it to the selection, with no apply call",
  );

  await layOut({
    red: { x: 0, y: 0 },
    green: { x: 600, y: 0 },
    blue: { x: 1200, y: 0, rotation: Math.PI / 4 },
  });
  const turned = await until(
    () => main.open(),
    (s) => s.items.some((item) => item.key === key.blue && item.rotation !== 0),
    "blue to turn",
  );
  await page.waitForFunction(
    (blueKey) =>
      document
        .querySelector<HTMLElement>(`[data-outline-key="${blueKey}"]`)
        ?.style.transform.includes("0.78"),
    key.blue,
  );
  await page.keyboard.press("Escape");
  await selected(0);
  const blueItem = turned.items.find((item) => item.key === key.blue)!;
  const upright = boundsOf([blueItem])!;
  const corner = { left: 930, top: -270, right: 1000, bottom: -200 };
  assert(
    corner.left < upright.right &&
      upright.left < corner.right &&
      corner.top < upright.bottom &&
      upright.top < corner.bottom,
    "the rectangle to drag overlaps the upright box around the turned blue image",
  );
  await drag(at({ x: corner.right, y: corner.bottom }), at({ x: corner.left, y: corner.top }));
  await settle(page);
  const afterCorner = (await readout(page)).selected;
  await drag(at({ x: 1180, y: -320 }), at({ x: 1220, y: -260 }));
  const afterTip = (await readout(page)).selected;
  assert(
    afterCorner === 0 && afterTip === 1 && (await outlined()).join() === key.blue,
    `a marquee over only the upright box's corner selects nothing (${afterCorner}), and one over the turned image's tip selects it (${afterTip})`,
  );

  await page.keyboard.press("ControlOrMeta+a");
  await selected(3);
  await click(at({ x: 300, y: 350 }));
  await selected(0);
  assert(
    applied.length === calls,
    "a press on empty canvas with no movement clears the selection and saves nothing",
  );

  let before = await main.open();
  let drawnDuring = -1;
  await drag(at({ x: 0, y: 0 }), at({ x: 0, y: 60 }), false, async () => {
    drawnDuring = await marquee.count();
  });
  let after = await until(
    () => main.open(),
    (s) => s.rev > before.rev,
    "the drag to save",
  );
  const red = after.items.find((item) => item.key === key.red)!;
  assert(
    drawnDuring === 0 &&
      red.y > 50 &&
      JSON.stringify(fieldsOf(applied.slice(calls))) === JSON.stringify([[`patch ${key.red} x,y`]]),
    `a press on an image and a drag moves it (to y ${red.y.toFixed(1)}) and draws no marquee`,
  );

  await layOut({
    red: { x: 0, y: 0, z: "a1" },
    green: { x: 200, y: 0, z: "a2" },
    blue: { x: 1200, y: 0, z: "a0" },
  });
  const overlap = { x: 100, y: 0 };
  const colorAt = async (on: Page, onView: PageView, world: Point) =>
    pixelAt(await screenshot(on), round(toPage(onView, world)));
  const shows = (on: Page, onView: PageView, color: Color, label: string) =>
    until(
      () => colorAt(on, onView, overlap),
      (pixel) => near(pixel, images[color]),
      label,
    );
  await shows(page, view, "green", "green on top at the overlap");
  await click(at(overlap));
  await selected(1);
  assert(
    (await outlined()).join() === key.green &&
      near(await colorAt(page, view, overlap), images.green),
    "a click on the overlap selects green, the image on top, and the pixels there are green",
  );

  const zOrder = (snapshot: { items: ReadonlyArray<Item> }) =>
    [...snapshot.items]
      .sort((m, n) => (m.z < n.z ? -1 : m.z > n.z ? 1 : 0))
      .map((item) => colorOfKey.get(item.key))
      .join(" < ");
  // The second page must show green on top first, or red there afterwards would prove nothing.
  await shows(second, secondView, "green", "green on top on the second page before the command");
  before = await main.open();
  calls = applied.length;
  await page.getByRole("button", { name: "Send to back" }).click();
  after = await until(
    () => main.open(),
    (s) => s.rev > before.rev,
    "send to back to save",
  );
  await shows(page, view, "red", "red on top at the overlap after send to back");
  await screenshot(page, "02-send-to-back.png");
  assert(
    JSON.stringify(fieldsOf(applied.slice(calls))) === JSON.stringify([[`patch ${key.green} z`]]) &&
      after.rev === before.rev + 1,
    "send to back is one apply call that patches only green's z",
  );
  assert(
    zOrder(after) === "green < blue < red",
    `canvas.open returns the new order: ${zOrder(after)}`,
  );
  await click(at(overlap));
  assert(
    (await outlined()).join() === key.red,
    "the pixels at the overlap are red, and a click there selects red",
  );
  assert(
    near(await shows(second, secondView, "red", "red on the second page"), images.red),
    "the second page shows red on top at the overlap without a reload",
  );

  await click(at({ x: 300, y: 0 }));
  await click(at({ x: 1200, y: 0 }), true);
  await selected(2);
  before = after;
  calls = applied.length;
  await page.getByRole("button", { name: "Bring to front" }).click();
  after = await until(
    () => main.open(),
    (s) => s.rev > before.rev,
    "bring to front to save",
  );
  await shows(page, view, "green", "green on top at the overlap after bring to front");
  assert(
    zOrder(after) === "red < green < blue" &&
      JSON.stringify(fieldsOf(applied.slice(calls))) ===
        JSON.stringify([[`patch ${key.blue} z`, `patch ${key.green} z`].sort()]),
    `bring to front on green and blue puts both above red in their order (${zOrder(after)}), in one apply call of z patches`,
  );
  const fronted = after;

  calls = applied.length;
  await page.keyboard.press("ControlOrMeta+z");
  after = await until(
    () => main.open(),
    (s) => s.rev > fronted.rev,
    "the undo to save",
  );
  const zs = (snapshot: { items: ReadonlyArray<Item> }) =>
    Object.fromEntries(snapshot.items.map((item) => [colorOfKey.get(item.key), item.z]));
  await shows(page, view, "red", "red on top after the undo");
  assert(
    JSON.stringify(zs(after)) === JSON.stringify(zs(before)) && applied.length === calls + 1,
    `undo restores the old z values in one call: ${JSON.stringify(zs(after))}`,
  );
  const undone = after;
  await page.keyboard.press("ControlOrMeta+Shift+z");
  after = await until(
    () => main.open(),
    (s) => s.rev > undone.rev,
    "the redo to save",
  );
  await shows(page, view, "green", "green on top after the redo");
  assert(
    JSON.stringify(zs(after)) === JSON.stringify(zs(fronted)) && applied.length === calls + 2,
    "redo applies the new z values in one call",
  );

  await click(at({ x: -150, y: 0 }));
  await selected(1);
  before = after;
  calls = applied.length;
  await page.keyboard.press("]");
  after = await until(
    () => main.open(),
    (s) => s.rev > before.rev,
    "] to save",
  );
  await shows(page, view, "red", "red on top after ]");
  assert(
    zOrder(after) === "green < blue < red" &&
      JSON.stringify(fieldsOf(applied.slice(calls))) === JSON.stringify([[`patch ${key.red} z`]]),
    `] brings red to the front with one z patch: ${zOrder(after)}`,
  );
  before = after;
  calls = applied.length;
  await page.keyboard.press("[");
  after = await until(
    () => main.open(),
    (s) => s.rev > before.rev,
    "[ to save",
  );
  await shows(page, view, "green", "green on top after [");
  assert(
    zOrder(after) === "red < green < blue" &&
      JSON.stringify(fieldsOf(applied.slice(calls))) === JSON.stringify([[`patch ${key.red} z`]]),
    `[ sends red to the back with one z patch: ${zOrder(after)}`,
  );

  calls = applied.length;
  await page.keyboard.press("[");
  await settle(page);
  assert(
    applied.length === calls && (await main.open()).rev === after.rev,
    "[ on an image already at the back makes no call",
  );

  await page.evaluate(() => {
    const field = document.createElement("input");
    field.setAttribute("aria-label", "Probe");
    document.querySelector('[data-testid="canvas-readout"]')!.after(field);
  });
  const field = page.getByLabel("Probe");
  await field.focus();
  await page.keyboard.press("]");
  await page.keyboard.press("[");
  await settle(page);
  assert(
    (await field.inputValue()) === "][" &&
      applied.length === calls &&
      (await main.open()).rev === after.rev,
    `with a text field focused, ] and [ type into it ("${await field.inputValue()}") and make no call`,
  );
  await page.evaluate(() => document.querySelector('input[aria-label="Probe"]')!.remove());

  await page.keyboard.press("Escape");
  await selected(0);
  await page.keyboard.press("]");
  await page.keyboard.press("[");
  await settle(page);
  const disabled = await Promise.all(
    ["Bring to front", "Send to back"].map((name) =>
      page.getByRole("button", { name }).isDisabled(),
    ),
  );
  assert(
    disabled.every(Boolean) && applied.length === calls && (await main.open()).rev === after.rev,
    "with nothing selected, both buttons are disabled and both keys make no call",
  );

  assertCleanConsole();
} finally {
  await browser.close();
}
