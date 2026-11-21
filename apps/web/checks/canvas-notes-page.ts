import { api } from "@refhaven/backend/api";
import type { Id } from "@refhaven/backend/id";
import { type Point, boundsOf } from "@refhaven/scene";
import type { PNG } from "pngjs";
import type { Page } from "playwright";
import {
  appUrl,
  assert,
  consoleWatch,
  openPageWithPasskeyDevice,
  signInWithPasskey,
} from "./browser";
import {
  canvasViewport,
  type Item,
  type PageView,
  type Rect,
  type Rgb,
  near,
  pageView,
  pixelAt,
  readout,
  rectOnPage,
  screenshot,
  settle,
  solidPng,
  toPage,
  until,
  waitForCanvas,
  collectionCanvas,
} from "./canvas-screen";

/** The colors the page draws the note color names in. */
const ink = {
  black: [28, 25, 23],
  blackOnDark: [250, 250, 249],
  blue: [37, 99, 235],
  red: [220, 38, 38],
} satisfies Record<string, Rgb>;
const images = { yellow: [220, 200, 40], teal: [40, 170, 170] } satisfies Record<string, Rgb>;

const { watch: watchConsole, assertClean: assertCleanConsole } = consoleWatch();

type Op = { op: string; key?: string; fields?: Record<string, unknown>; text?: string };
type Note = Extract<Item, { kind: "note" }>;

const round = ({ x, y }: Point): Point => ({ x: Math.round(x), y: Math.round(y) });

/** How many pixels of the rectangle are near the color. */
const inkIn = (png: PNG, rect: Rect, color: Rgb) => {
  let count = 0;
  for (let y = Math.ceil(rect.top); y < rect.bottom; y++) {
    for (let x = Math.ceil(rect.left); x < rect.right; x++) {
      if (near(pixelAt(png, { x, y }), color)) count += 1;
    }
  }
  return count;
};

/** How many pixels differ between two screenshots inside the rectangle. */
const changedIn = (a: PNG, b: PNG, rect: Rect) => {
  let count = 0;
  for (let y = Math.ceil(rect.top); y < rect.bottom; y++) {
    for (let x = Math.ceil(rect.left); x < rect.right; x++) {
      if (!near(pixelAt(a, { x, y }), pixelAt(b, { x, y }))) count += 1;
    }
  }
  return count;
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

const items = (count: number, on: Page = page) =>
  until(
    () => readout(on),
    (r) => r.items === count,
    `${count} items in the readout`,
  );
const selected = (count: number) =>
  until(
    () => readout(page),
    (r) => r.selected === count,
    `${count} selected`,
  );

const click = async (at: Point, shift = false) => {
  if (shift) await page.keyboard.down("Shift");
  const { x, y } = round(at);
  await page.mouse.click(x, y);
  if (shift) await page.keyboard.up("Shift");
  await settle(page);
};

const drag = async (from: Point, to: Point) => {
  const [start, end] = [round(from), round(to)];
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
  await settle(page);
};

const dblclick = async (at: Point) => {
  const { x, y } = round(at);
  await page.mouse.dblclick(x, y);
};

const gripCenter = async (name: string) => {
  const box = (await page.locator(`[data-handle="${name}"]`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const editor = page.getByLabel("Note", { exact: true });

const opsOf = (calls: ReadonlyArray<ReadonlyArray<Op>>) =>
  calls.map((ops) =>
    ops.map((op) => (op.op === "patch" ? `patch ${Object.keys(op.fields ?? {}).sort()}` : op.op)),
  );

try {
  await page.setViewportSize(canvasViewport);
  await signInWithPasskey(page, `check-canvas-notes-page-${Date.now().toString(36)}`);
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
    .nth(1)
    .waitFor({ timeout: 60_000 });
  const refIdOf = async (name: string) =>
    (await page
      .locator("[data-ref-id]")
      .filter({ hasText: `${name}.png` })
      .getAttribute("data-ref-id")) as Id<"refs">;
  const yellowRef = await refIdOf("yellow");
  const tealRef = await refIdOf("teal");

  const owner = main.client;
  const snapshot = main.open;
  const placed = await snapshot();
  const { canvasId } = placed;
  const imageKey = (refId: string) =>
    placed.items.find((item) => item.kind === "image" && item.refId === refId)!.key;
  const yellow = imageKey(yellowRef);
  const teal = imageKey(tealRef);
  await owner.mutation(api.canvas.apply, {
    canvasId,
    ops: [
      { op: "patch", key: yellow, fields: { x: 0, y: 0, z: "a1" } },
      { op: "patch", key: teal, fields: { x: 700, y: 0, z: "a2" } },
    ],
  });

  await page.getByRole("link", { name: "Canvas" }).click();
  await page.waitForURL(canvasUrl);
  await waitForCanvas(page, 2);
  const view: PageView = await pageView(page);
  const at = (world: Point) => toPage(view, world);

  const second = await page.context().newPage();
  watchConsole(second);
  await second.setViewportSize(canvasViewport);
  await second.goto(canvasUrl);
  await waitForCanvas(second, 2);
  const secondView = await pageView(second);

  const noteIn = async (key?: string) =>
    (await snapshot()).items.find(
      (item): item is Note => item.kind === "note" && (key === undefined || item.key === key),
    );
  // Inside the outline that a selected note has, which is drawn in a near-black color.
  const inkOn = async (on: Page, onView: PageView, note: Note, color: Rgb) => {
    const { left, top, right, bottom } = rectOnPage(onView, note);
    return inkIn(
      await screenshot(on),
      { left: left + 4, top: top + 4, right: right - 4, bottom: bottom - 4 },
      color,
    );
  };

  let calls = applied.length;
  await page.getByRole("button", { name: "Add note" }).click();
  await editor.waitFor();
  const opened = (await editor.boundingBox())!;
  const center = { x: view.box.x + view.box.width / 2, y: view.box.y + view.box.height / 2 };
  assert(
    Math.abs(opened.x + opened.width / 2 - center.x) <= 6 &&
      Math.abs(opened.y + opened.height / 2 - center.y) <= 6 &&
      (await editor.evaluate((element) => element === document.activeElement)),
    `Add note opens a focused editor at the center of the view: its center ${(opened.x + opened.width / 2).toFixed(0)}, ${(opened.y + opened.height / 2).toFixed(0)}, the view's ${center.x}, ${center.y}`,
  );
  await page.keyboard.type("Zebra stripes note");
  await page.keyboard.press("ControlOrMeta+Enter");
  await items(3);
  const first = await until(noteIn, (note) => note !== undefined, "the note to save");
  await until(
    () => inkOn(page, view, first!, ink.black),
    (count) => count > 20,
    "black text inside the note's box",
  );
  await screenshot(page, "01-note-added.png");
  assert(
    (await editor.count()) === 0 &&
      first!.text === "Zebra stripes note" &&
      first!.color === "black" &&
      JSON.stringify(opsOf(applied.slice(calls))) === JSON.stringify([["addNote"]]),
    `typing and Mod+Enter close the editor and save the note in one addNote call, the readout counts 3 items, and the note's box has black pixels: ${first!.width.toFixed(1)} by ${first!.height.toFixed(1)} at ${first!.x.toFixed(1)}, ${first!.y.toFixed(1)}`,
  );
  const key = first!.key;
  await items(3, second);
  assert(true, "the second page shows the new note without a reload");

  // On the dark page the canvas is dark, and black text would not show there.
  const chooseTheme = async (name: string) => {
    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name, exact: true }).click();
  };
  await chooseTheme("Dark");
  const lightOnDark = await until(
    () => inkOn(page, view, first!, ink.blackOnDark),
    (count) => count > 20,
    "the black note's text to turn near white on the dark page",
  );
  const blackOnDark = await inkOn(page, view, first!, ink.black);
  await screenshot(page, "01-note-on-dark.png");
  await chooseTheme("Light");
  const blackAgain = await until(
    () => inkOn(page, view, first!, ink.black),
    (count) => count > 20,
    "the note's text to turn black again on the light page",
  );
  // A few pixels on the edge of light text pass through the black ink's color, so some are counted.
  assert(
    lightOnDark > 20 && blackAgain > 20 && blackOnDark < blackAgain / 4,
    `on the dark page a black note is drawn near white, ${lightOnDark} pixels with ${blackOnDark} near black on its edges, and black again on the light page, ${blackAgain} pixels`,
  );

  let note = first!;
  const noteCenter = () => at(note);
  let before = await screenshot(page);
  calls = applied.length;
  await dblclick(noteCenter());
  await editor.waitFor();
  assert(
    (await editor.inputValue()) === "Zebra stripes note",
    "a double click opens the editor with the note's text",
  );
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Zebra and a longer line of text");
  await click(at({ x: 350, y: 400 }));
  note = (await until(
    noteIn,
    (found) => found?.text === "Zebra and a longer line of text",
    "the edit to save",
  ))!;
  await until(
    async () => changedIn(before, await screenshot(page), rectOnPage(view, note)),
    (count) => count > 50,
    "the note's pixels to change",
  );
  assert(
    note.width > first!.width &&
      JSON.stringify(opsOf(applied.slice(calls))) ===
        JSON.stringify([["patch height,text,width,x,y"]]) &&
      Math.abs(note.x - note.width / 2 - (first!.x - first!.width / 2)) < 1e-6,
    `leaving the editor saves the new text and its measured box in one patch, keeps the top-left corner, and changes the pixels: ${note.width.toFixed(1)} wide`,
  );

  calls = applied.length;
  await dblclick(noteCenter());
  await editor.waitFor();
  await page.keyboard.type(" discarded");
  await page.keyboard.press("Escape");
  await settle(page);
  assert(
    (await editor.count()) === 0 &&
      applied.length === calls &&
      (await noteIn(key))?.text === "Zebra and a longer line of text",
    "Escape closes the editor and discards the edit, with no call",
  );

  await click(noteCenter());
  await selected(1);
  await dblclick(noteCenter());
  await editor.waitFor();
  await page.keyboard.press("End");
  await page.keyboard.press("n");
  const typedN = await editor.inputValue();
  await page.keyboard.press("Backspace");
  const afterBackspace = await editor.inputValue();
  await page.keyboard.press("ControlOrMeta+a");
  const range = await editor.evaluate((element: HTMLTextAreaElement) => [
    element.selectionStart,
    element.selectionEnd,
    element.value.length,
  ]);
  await page.keyboard.press("Backspace");
  const afterClear = await editor.inputValue();
  const typing = await readout(page);
  await page.keyboard.press("Escape");
  await settle(page);
  assert(
    typedN === "Zebra and a longer line of textn" &&
      afterBackspace === "Zebra and a longer line of text" &&
      range[0] === 0 &&
      range[1] === range[2] &&
      afterClear === "" &&
      typing.items === 3 &&
      typing.selected === 1 &&
      applied.length === calls &&
      (await noteIn(key))?.text === "Zebra and a longer line of text",
    `in the editor, n, Backspace, and Mod+A edit the text ("${typedN}", "${afterBackspace}", all selected, then "${afterClear}"), add no note, remove nothing, and select nothing more: ${typing.items} items, ${typing.selected} selected`,
  );

  await selected(1);
  calls = applied.length;
  await page.getByLabel("Note color").selectOption("blue");
  note = (await until(noteIn, (found) => found?.color === "blue", "the color to save"))!;
  await until(
    () => inkOn(page, view, note, ink.blue),
    (count) => count > 20,
    "blue text inside the note's box",
  );
  assert(
    (await inkOn(page, view, note, ink.black)) === 0 &&
      JSON.stringify(opsOf(applied.slice(calls))) === JSON.stringify([["patch color"]]),
    `choosing blue patches only the color, and the note's pixels turn from black to blue: ${await inkOn(page, view, note, ink.black)} black, ${JSON.stringify(opsOf(applied.slice(calls)))}`,
  );
  await until(
    () => inkOn(second, secondView, note, ink.blue),
    (count) => count > 20,
    "blue text on the second page",
  );
  assert(true, "the second page shows the note's new color without a reload");

  calls = applied.length;
  const dragged = note;
  await drag(noteCenter(), at({ x: dragged.x - 200, y: dragged.y - 150 }));
  note = (await until(noteIn, (found) => found!.x < dragged.x - 150, "the drag to save"))!;
  assert(
    Math.abs(note.x - (dragged.x - 200)) < 2 &&
      Math.abs(note.y - (dragged.y - 150)) < 2 &&
      JSON.stringify(opsOf(applied.slice(calls))) === JSON.stringify([["patch x,y"]]),
    `dragging the note moves it and saves x and y: now at ${note.x.toFixed(1)}, ${note.y.toFixed(1)}`,
  );

  calls = applied.length;
  const corner = await gripCenter("se");
  await drag(corner, { x: corner.x + 60, y: corner.y + 20 });
  const resized = (await until(
    noteIn,
    (found) => found!.scale > note.scale,
    "the resize to save",
  ))!;
  assert(
    JSON.stringify(opsOf(applied.slice(calls))) === JSON.stringify([["patch scale,x,y"]]) &&
      Math.abs(
        resized.x - (resized.width * resized.scale) / 2 - (note.x - (note.width * note.scale) / 2),
      ) < 1,
    `dragging the bottom-right handle scales the note to ${resized.scale.toFixed(3)} about its top-left corner`,
  );
  note = resized;

  calls = applied.length;
  const rotate = await gripCenter("rotate");
  const pivot = at(note);
  await drag(rotate, { x: pivot.x + 200, y: pivot.y });
  const turned = (await until(noteIn, (found) => found!.rotation !== 0, "the turn to save"))!;
  assert(
    Math.abs(turned.rotation - Math.PI / 2) < 0.1 &&
      JSON.stringify(opsOf(applied.slice(calls))) === JSON.stringify([["patch rotation"]]),
    `dragging the rotate handle a quarter turn turns the note to ${((turned.rotation * 180) / Math.PI).toFixed(1)} degrees and saves only the rotation`,
  );
  calls = applied.length;
  await page.keyboard.press("ControlOrMeta+z");
  note = (await until(noteIn, (found) => found!.rotation === 0, "the turn's undo"))!;
  assert(applied.length === calls + 1, "undo takes the turn back in one call");

  const overlapping = await until(noteIn, (found) => found !== undefined, "the note");
  const noteBox = boundsOf([overlapping!])!;
  const yellowBox = boundsOf((await snapshot()).items.filter((item) => item.key === yellow))!;
  assert(
    noteBox.left < yellowBox.right && noteBox.right > yellowBox.left,
    "the note now overlaps the yellow image",
  );
  await until(
    () => inkOn(page, view, note, ink.blue),
    (count) => count > 20,
    "the note drawn over the yellow image",
  );
  calls = applied.length;
  await page.getByRole("button", { name: "Send to back" }).click();
  const sent = (await until(noteIn, (found) => found!.z < "a1", "send to back to save"))!;
  const sentRect = rectOnPage(view, sent);
  const yellowRect = rectOnPage(
    view,
    (await snapshot()).items.find((item) => item.key === yellow)!,
  );
  const covered = {
    left: Math.max(sentRect.left, yellowRect.left),
    top: Math.max(sentRect.top, yellowRect.top),
    right: Math.min(sentRect.right, yellowRect.right),
    bottom: Math.min(sentRect.bottom, yellowRect.bottom),
  };
  await until(
    async () => inkIn(await screenshot(page), covered, ink.blue),
    (count) => count === 0,
    "the yellow image over the note",
  );
  assert(
    JSON.stringify(opsOf(applied.slice(calls))) === JSON.stringify([["patch z"]]) && sent.z < "a1",
    `send to back puts the note under the yellow image it overlaps (z ${sent.z} < a1), and no blue shows where they overlap`,
  );
  await page.keyboard.press("ControlOrMeta+z");
  note = (await until(noteIn, (found) => found!.z > "a2", "the order's undo"))!;

  await page.keyboard.press("Escape");
  await selected(0);
  calls = applied.length;
  const noteRect = rectOnPage(view, note);
  const tealRect = rectOnPage(
    view,
    (await snapshot()).items.find((item) => item.key === teal)!,
  );
  assert(
    noteRect.right > yellowRect.right + 30,
    "part of the note lies to the right of the yellow image, where a marquee can reach it alone",
  );
  await drag(
    { x: yellowRect.right + 15, y: Math.min(noteRect.top, tealRect.top) - 20 },
    { x: tealRect.left + 40, y: Math.max(noteRect.bottom, tealRect.top + 40) + 10 },
  );
  await selected(2);
  const outlined = (
    await page
      .locator("[data-outline-key]")
      .evaluateAll((elements) => elements.map((element) => element.dataset.outlineKey!))
  ).sort();
  assert(
    JSON.stringify(outlined) === JSON.stringify([key, teal].sort()) && applied.length === calls,
    "a marquee over the note and the teal image selects exactly those two, with no call",
  );
  const tealBefore = (await snapshot()).items.find((item) => item.key === teal)!;
  await drag(at(note), at({ x: note.x, y: note.y + 80 }));
  const together = await until(
    snapshot,
    (s) => s.items.find((item) => item.key === teal)!.y > tealBefore.y + 50,
    "the mixed drag to save",
  );
  const movedNote = together.items.find((item) => item.key === key)!;
  assert(
    Math.abs(movedNote.y - note.y - 80) < 2 &&
      JSON.stringify(opsOf(applied.slice(calls))) === JSON.stringify([["patch x,y", "patch x,y"]]),
    "dragging a selection of a note and an image moves both in one call",
  );
  note = movedNote as Note;

  await page.keyboard.press("Escape");
  await selected(0);
  await page.getByLabel("Note color").selectOption("red");
  await page.getByRole("button", { name: "Add note" }).click();
  await editor.waitFor();
  await page.keyboard.type("A red label");
  await page.keyboard.press("ControlOrMeta+Enter");
  await items(4);
  const red = (await until(
    async () => (await snapshot()).items.find((item) => item.kind === "note" && item.key !== key),
    (found) => found !== undefined,
    "the red note to save",
  )) as Note;
  await click(at(note));
  await selected(1);
  await until(
    () => inkOn(page, view, red, ink.red),
    (count) => count > 20,
    "red text in the second note",
  );
  await screenshot(page, "02-two-notes-one-selected.png");
  assert(red.color === "red", "a note added after choosing red with nothing selected is red");

  calls = applied.length;
  const removedFrom = note;
  await page.keyboard.press("Delete");
  await items(3);
  await items(3, second);
  assert(
    (await noteIn(key)) === undefined &&
      JSON.stringify(opsOf(applied.slice(calls))) === JSON.stringify([["remove"]]),
    "Delete removes the selected note in one call, and the second page drops it without a reload",
  );
  await page.keyboard.press("ControlOrMeta+z");
  await items(4);
  const restored = (await until(
    noteIn.bind(null, key),
    (found) => found !== undefined,
    "the undo",
  ))!;
  const fields = (found: Note) =>
    JSON.stringify([
      found.text,
      found.color,
      found.x,
      found.y,
      found.z,
      found.scale,
      found.width,
      found.height,
    ]);
  assert(
    fields(restored) === fields(removedFrom),
    `undo brings the note back with its text, color, place, z, scale, and box: ${fields(restored)}`,
  );

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add note" }).click();
  await editor.waitFor();
  await page.keyboard.type("Temporary");
  await page.keyboard.press("ControlOrMeta+Enter");
  await items(5);
  await until(
    snapshot,
    (s) => s.items.some((item) => item.kind === "note" && item.text === "Temporary"),
    "the temporary note to save",
  );
  await page.keyboard.press("ControlOrMeta+z");
  await items(4);
  assert(
    !(await snapshot()).items.some((item) => item.kind === "note" && item.text === "Temporary"),
    "undo of an added note removes it",
  );

  await dblclick(at(restored));
  await editor.waitFor();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Edited once");
  await page.keyboard.press("ControlOrMeta+Enter");
  await until(noteIn.bind(null, key), (found) => found?.text === "Edited once", "the edit");
  await page.keyboard.press("ControlOrMeta+z");
  const reverted = await until(
    noteIn.bind(null, key),
    (found) => found?.text === restored.text,
    "the edit's undo",
  );
  assert(
    reverted!.width === restored.width && reverted!.x === restored.x,
    "undo of an edit restores the old text and its box",
  );

  // More text than a note may hold. The editor must stop at the limit, because the server refuses
  // a longer note and a refused save would lose what was typed.
  await page.getByRole("button", { name: "Add note" }).click();
  await editor.waitFor();
  await page.keyboard.insertText("w".repeat(2100));
  const held = (await editor.inputValue()).length;
  await page.keyboard.press("ControlOrMeta+Enter");
  await items(5);
  const long = await until(
    async () =>
      (await snapshot()).items.find((item) => item.kind === "note" && item.text.startsWith("www")),
    (found) => found !== undefined,
    "the long note to save",
  );
  assert(
    held === 2000 && long?.kind === "note" && long.text.length === 2000,
    `the editor stops a note at 2,000 characters, and what it holds is saved: ${held} held`,
  );
  await page.keyboard.press("ControlOrMeta+z");
  await items(4);

  calls = applied.length;
  await page.getByRole("button", { name: "Add note" }).click();
  await editor.waitFor();
  await click(at({ x: 350, y: 400 }));
  assert(
    (await editor.count()) === 0 && applied.length === calls && (await readout(page)).items === 4,
    "a new note left with no text is never made",
  );
  await dblclick(at(restored));
  await editor.waitFor();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("   ");
  await click(at({ x: 350, y: 400 }));
  await items(3);
  assert(
    (await noteIn(key)) === undefined &&
      JSON.stringify(opsOf(applied.slice(calls))) === JSON.stringify([["remove"]]),
    "a note committed with only spaces is removed",
  );

  await second.goto(`${appUrl}/library`);
  await second.locator("[data-ref-id]").nth(1).waitFor();
  const libraryCards = await second.locator("[data-ref-id]").count();
  const libraryText = await second.locator("body").innerText();
  await second.goto(`${main.url}?view=gallery`);
  await second.locator("[data-ref-id]").nth(1).waitFor();
  const collectionCards = await second.locator("[data-ref-id]").count();
  const collectionText = await second.locator("body").innerText();
  const found = await Promise.all(
    ["red", "label", "zebra"].map(
      async (q) => (await owner.query(api.library.filter, { q })).items.length,
    ),
  );
  assert(
    libraryCards === 2 &&
      collectionCards === 2 &&
      !libraryText.includes("red label") &&
      !collectionText.includes("red label") &&
      found.every((count) => count === 0),
    `a note on a collection's canvas is not in the library's gallery (${libraryCards} cards), the collection's gallery (${collectionCards}), or search (${found.join(", ")} results)`,
  );

  assertCleanConsole();
} finally {
  await browser.close();
}
