import { api } from "@refhaven/backend/api";
import type { Id } from "@refhaven/backend/id";
import { type NoteColor, boundsOf } from "@refhaven/scene";
import type { ConvexHttpClient } from "convex/browser";
import type { Page } from "playwright";
import {
  assert,
  cardNamed,
  clientFor,
  openPageWithPasskeyDevice,
  outcome,
  pngOf,
  rows,
  signInWithPasskey,
} from "./browser";
import { type Item, refOf, openCanvas, canvasChanges, collectionCanvas } from "./canvas-screen";

const stamp = Date.now().toString(36);
const cards = (page: Page) => page.locator("[data-ref-id]");

const save = async (page: Page, files: Array<{ name: string; buffer: Buffer }>) => {
  const before = await cards(page).count();
  const outcomes = page.locator('[role="status"] li');
  const reported = await outcomes.count();
  await page
    .getByLabel("Add images")
    .setInputFiles(files.map((file) => ({ ...file, mimeType: "image/png" })));
  await outcomes.nth(reported + files.length - 1).waitFor({ timeout: 60_000 });
  const refused = await page
    .locator('[role="status"] li:not([data-outcome="saved"])')
    .allTextContents();
  if (refused.length > 0) {
    throw new Error(`FAIL the page saves every image it is given: ${refused.join(", ")}`);
  }
  await cards(page)
    .nth(before + files.length - 1)
    .waitFor();
  return Promise.all(
    files.map(
      async ({ name }) => (await cardNamed(page, name).getAttribute("data-ref-id")) as Id<"refs">,
    ),
  );
};

type NoteFields = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  text: string;
  color: NoteColor;
  width: number;
  height: number;
};

const note = (key: string, fields: Partial<NoteFields> = {}) => ({
  op: "addNote" as const,
  key,
  x: 100,
  y: -300,
  scale: 1,
  rotation: 0,
  text: "first note",
  color: "blue" as NoteColor,
  width: 120,
  height: 34,
  ...fields,
});

/** An item's fields as a client sees them, in one order, for comparing. */
const shape = (item: Item | undefined) =>
  JSON.stringify(Object.entries(item ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)));

const first = await openPageWithPasskeyDevice();
const second = await openPageWithPasskeyDevice();
try {
  const { page } = first;
  await signInWithPasskey(page, `check-canvas-notes-a-${stamp}`);
  const main = await collectionCanvas(page);
  const [kept, trashed] = (await save(page, [
    { name: "kept.png", buffer: await pngOf(page, "rgb(200, 30, 30)", 400, 300) },
    { name: "trashed.png", buffer: await pngOf(page, "rgb(30, 30, 200)", 300, 300) },
  ])) as [Id<"refs">, Id<"refs">];
  const owner = main.client;
  const opened = await main.open();
  const { canvasId } = opened;
  const changesSince = (rev: number) => canvasChanges(owner, { canvasId, rev });
  const revNow = async () => (await main.open()).rev;

  const added = await owner.mutation(api.canvas.apply, {
    canvasId,
    ops: [note("note-a"), note("note-b", { x: 400, color: "red", text: "second" })],
  });
  const reopened = await main.open();
  const sinceOpen = await changesSince(opened.rev);
  const noteA = reopened.items.find((item) => item.key === "note-a");
  const expected = { ...note("note-a"), kind: "note" };
  assert(
    added === opened.rev + 1 &&
      reopened.rev === added &&
      noteA?.kind === "note" &&
      (Object.keys(expected) as Array<keyof typeof expected>).every(
        (field) => field === "op" || (noteA as Record<string, unknown>)[field] === expected[field],
      ) &&
      shape(sinceOpen.items.find((item) => item.key === "note-a")) === shape(noteA) &&
      sinceOpen.items.length === 2 &&
      sinceOpen.rev === added,
    `one call adds two notes at one new rev (${opened.rev} to ${added}), and open and changes return each with its key, text, color, box, and place: ${shape(noteA)}`,
  );

  const refusals = [
    ["empty text", note("bad-1", { text: "" })],
    ["text of only spaces", note("bad-2", { text: "   " })],
    ["text of 2,001 characters", note("bad-3", { text: "x".repeat(2001) })],
    ["a color outside the list", note("bad-4", { color: "pink" as NoteColor })],
    ["a box of width 0", note("bad-5", { width: 0 })],
    ["a key of 65 characters", note("k".repeat(65))],
  ] as const;
  for (const [label, op] of refusals) {
    const refused = await outcome(
      owner.mutation(api.canvas.apply, {
        canvasId,
        ops: [note(`fine-${label.length}`), op],
      }),
    );
    assert(refused.startsWith("refused"), `a note with ${label} is ${refused}`);
  }
  assert(
    (await changesSince(added)).items.length === 0 && (await revNow()) === added,
    "none of the refused notes, nor the valid note beside each, was written, and rev stayed",
  );
  assert(
    (await outcome(
      owner.mutation(api.canvas.apply, {
        canvasId,
        ops: [note("y".repeat(64), { text: "x".repeat(2000) })],
      }),
    )) === "accepted",
    "a note with a key of 64 characters and text of 2,000 characters is accepted",
  );
  const afterLimits = await revNow();

  const imageKey = opened.items.find((item) => refOf(item) === kept)!.key;
  for (const [label, key] of [
    ["a live note", "note-a"],
    ["a live image", imageKey],
  ] as const) {
    const taken = await outcome(
      owner.mutation(api.canvas.apply, { canvasId, ops: [note(key, { text: "over it" })] }),
    );
    assert(taken === "KeyTaken", `a note under the key of ${label} fails with ${taken}`);
  }
  assert((await revNow()) === afterLimits, "the refused notes wrote nothing");

  const removedRev = await owner.mutation(api.canvas.apply, {
    canvasId,
    ops: [{ op: "remove", key: "note-b" }],
  });
  const [removedB] = (await changesSince(afterLimits)).items;
  assert(
    removedB?.key === "note-b" && typeof removedB.deletedAt === "number",
    "a removed note shows in changes with its deletedAt",
  );
  const rowsOfB = async () =>
    (await rows("canvasItems")).filter((row) => row.canvasId === canvasId && row.key === "note-b");
  const [rowBefore] = await rowsOfB();
  const back = note("note-b", { x: -50, y: 900, text: "back again", color: "green", scale: 2 });
  const backRev = await owner.mutation(api.canvas.apply, { canvasId, ops: [back] });
  const backRows = await rowsOfB();
  const [backItem] = (await changesSince(removedRev)).items;
  assert(
    backRev === removedRev + 1 &&
      backRows.length === 1 &&
      backRows[0]._id === rowBefore._id &&
      backItem?.kind === "note" &&
      backItem.deletedAt === undefined &&
      backItem.text === "back again" &&
      backItem.color === "green" &&
      backItem.x === -50 &&
      backItem.scale === 2,
    `a note under the key of a removed note brings that row back with the new values: ${shape(backItem)}`,
  );

  const fieldOnImage = await outcome(
    owner.mutation(api.canvas.apply, {
      canvasId,
      ops: [
        { op: "patch", key: "note-a", fields: { x: 1 } },
        { op: "patch", key: imageKey, fields: { text: "an image has no text" } },
      ],
    }),
  );
  assert(
    fieldOnImage === "FieldNotOnItem" &&
      (await changesSince(backRev)).items.length === 0 &&
      (await revNow()) === backRev,
    `a patch of text on an image fails with ${fieldOnImage}, and the note's patch beside it is not written`,
  );
  const boxOnImage = await outcome(
    owner.mutation(api.canvas.apply, {
      canvasId,
      ops: [{ op: "patch", key: imageKey, fields: { width: 10 } }],
    }),
  );
  assert(boxOnImage === "FieldNotOnItem", `a patch of an image's width fails with ${boxOnImage}`);
  const patchedRev = await owner.mutation(api.canvas.apply, {
    canvasId,
    ops: [
      { op: "patch", key: "note-a", fields: { x: 777 } },
      {
        op: "patch",
        key: "note-b",
        fields: { text: "edited", color: "orange", width: 90, height: 40 },
      },
    ],
  });
  const patched = (await changesSince(backRev)).items;
  const patchedA = patched.find((item) => item.key === "note-a");
  const patchedB = patched.find((item) => item.key === "note-b");
  assert(
    patchedRev === backRev + 1 &&
      shape(patchedA) === shape({ ...noteA!, x: 777 }) &&
      patchedB?.kind === "note" &&
      patchedB.text === "edited" &&
      patchedB.color === "orange" &&
      patchedB.width === 90 &&
      patchedB.height === 40 &&
      patchedB.x === -50,
    "a patch of x on a note moves it alone, and a patch of a note's text, color, and box sets them",
  );

  const board = await owner.mutation(api.collections.create, { name: "Board" });
  await owner.mutation(api.collections.addRefs, { collectionId: board, refIds: [kept] });
  const boardCanvas = await openCanvas(owner, { collectionId: board });
  await owner.mutation(api.canvas.apply, {
    canvasId: boardCanvas.canvasId,
    ops: [note("board-note", { text: "on the board" })],
  });
  const memberships = async () =>
    (await rows("collectionRefs")).filter((row) => row.collectionId === board);
  const collectionRow = async () => (await rows("collections")).find((row) => row._id === board);
  const [membersBefore, collectionBefore] = [await memberships(), await collectionRow()];
  await owner.mutation(api.canvas.apply, {
    canvasId: boardCanvas.canvasId,
    ops: [{ op: "remove", key: "board-note" }],
  });
  const boardAfter = await openCanvas(owner, { collectionId: board });
  assert(
    JSON.stringify(await memberships()) === JSON.stringify(membersBefore) &&
      membersBefore.length === 1 &&
      JSON.stringify(await collectionRow()) === JSON.stringify(collectionBefore) &&
      boardAfter.items.length === 1 &&
      refOf(boardAfter.items[0]!) === kept,
    "removing a note on a collection's canvas removes no membership and changes no collection",
  );

  const notesBefore = (await main.open()).items.filter((item) => item.kind === "note");
  const noteRows = async () =>
    JSON.stringify(
      (await rows("canvasItems"))
        .filter((row) => row.canvasId === canvasId && row.kind === "note")
        .sort((a, b) => (a.key < b.key ? -1 : 1)),
    );
  const noteRowsBefore = await noteRows();
  await owner.mutation(api.library.remove, { refIds: [trashed] });
  const whileTrashed = await main.open();
  await owner.mutation(api.library.restore, { refIds: [trashed] });
  const restored = await main.open();
  const notesOf = (items: ReadonlyArray<Item>) =>
    items
      .filter((item) => item.kind === "note")
      .map(shape)
      .sort()
      .join();
  assert(
    notesBefore.length === 3 &&
      notesOf(whileTrashed.items) === notesOf(notesBefore) &&
      notesOf(restored.items) === notesOf(notesBefore) &&
      !whileTrashed.items.some((item) => item.kind === "image" && item.refId === trashed) &&
      restored.items.some((item) => item.kind === "image" && item.refId === trashed) &&
      (await noteRows()) === noteRowsBefore,
    "deleting an image to the trash and restoring it leaves every note's row as it was",
  );

  const [later] = (await save(page, [
    { name: "later.png", buffer: await pngOf(page, "rgb(30, 160, 30)", 500, 250) },
  ])) as [Id<"refs">];
  const grown = await main.open();
  const placed = grown.items.find((item) => item.kind === "image" && item.refId === later);
  const layout = boundsOf(grown.items.filter((item) => item !== placed))!;
  assert(
    grown.placed === 1 &&
      placed !== undefined &&
      boundsOf([placed])!.left > layout.right &&
      notesOf(grown.items) === notesOf(notesBefore),
    `open on a canvas with notes places a new image to the right of the layout, notes included: left ${boundsOf([placed!])?.left} > ${layout.right}`,
  );

  await signInWithPasskey(second.page, `check-canvas-notes-b-${stamp}`);
  const other: ConvexHttpClient = await clientFor(second.page);
  assert(
    (await outcome(other.mutation(api.canvas.apply, { canvasId, ops: [note("intruder")] }))) ===
      "CanvasNotFound",
    "a second user gets CanvasNotFound when adding a note to the first user's canvas",
  );
  assert(
    (await rows("canvasItems")).every((row) => row.key !== "intruder"),
    "the second user's note was not written",
  );
} finally {
  await first.browser.close();
  await second.browser.close();
}
