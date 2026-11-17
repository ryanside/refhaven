import { createHash } from "node:crypto";
import { api } from "@refhaven/backend/api";
import type { Id } from "@refhaven/backend/id";
import type { ConvexHttpClient } from "convex/browser";
import type { Page } from "playwright";
import {
  appUrl,
  assert,
  clientFor,
  consoleWatch,
  openPageWithPasskeyDevice,
  outcome,
  pngOf,
  rows,
  signInWithPasskey,
} from "./browser";
import { refOf, openCanvas, canvasChanges, type Item } from "./canvas-screen";

const stamp = Date.now().toString(36);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const find = (items: ReadonlyArray<Item>, refId: string) =>
  items.find((item) => refOf(item) === refId);
const placeOf = (item: Item | undefined) =>
  item && JSON.stringify([item.key, item.x, item.y, item.scale, item.z]);

/** The changes since `rev` are one item, under `key`, with `deletedAt`, at a rev raised by one. */
const oneChange = (
  changes: Awaited<ReturnType<typeof canvasChanges>>,
  rev: number,
  key: string,
  deletedAt: number | undefined,
) =>
  changes.rev === rev + 1 &&
  changes.items.length === 1 &&
  changes.items[0]!.key === key &&
  changes.items[0]!.deletedAt === deletedAt;

const cards = (page: Page) => page.locator("[data-ref-id]");
const cardIds = async (page: Page) =>
  (
    await cards(page).evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-ref-id")),
    )
  ).join();

const save = async (page: Page, files: Array<{ name: string; buffer: Buffer }>) => {
  const outcomes = page.locator('[role="status"] li');
  const reported = await outcomes.count();
  const shown = await cards(page).count();
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
    .nth(shown + files.length - 1)
    .waitFor();
  return cards(page).evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-ref-id") as Id<"refs">),
  );
};

const firstPage = { paginationOpts: { numItems: 100, cursor: null } };
const libraryOf = async (client: ConvexHttpClient) =>
  (await client.query(api.library.list, firstPage)).page.map((item) => item.refId as string);
const trashOf = async (client: ConvexHttpClient) =>
  (await client.query(api.library.trash, firstPage)).page.map((item) => item.refId as string);
const galleryOf = async (client: ConvexHttpClient, collectionId: Id<"collections">) =>
  (await client.query(api.collections.refs, { collectionId, ...firstPage })).page.map(
    (item) => item.refId as string,
  );
const refRow = async (refId: string) => (await rows("refs")).find((row) => row._id === refId);
const revOf = async (client: ConvexHttpClient, canvasId: Id<"canvases">) =>
  (await canvasChanges(client, { canvasId, rev: 0 })).rev;

const evidence = process.env.EVIDENCE;
const { watch: watchConsole, assertClean: assertCleanConsole } = consoleWatch();

const until = async (condition: () => Promise<boolean>, message: string) => {
  for (let tries = 0; tries < 75; tries++) {
    if (await condition()) return;
    await Bun.sleep(200);
  }
  throw new Error(`FAIL timed out waiting until ${message}`);
};

const shownOnCanvas = async (page: Page) =>
  Number(await page.getByTestId("canvas-readout").getAttribute("data-items"));

const first = await openPageWithPasskeyDevice();
const second = await openPageWithPasskeyDevice();
watchConsole(first.page);
watchConsole(second.page);
try {
  const { page } = first;
  await signInWithPasskey(page, `check-trash-a-${stamp}`);
  const buffers = await Promise.all(
    ["rgb(200, 30, 30)", "rgb(30, 30, 200)", "rgb(30, 160, 30)", "rgb(200, 200, 30)"].map(
      (color, index) => pngOf(page, color, 300 + index * 40, 260),
    ),
  );
  const [eBuffer] = buffers.slice(3);
  const saved = await save(
    page,
    buffers.map((buffer, index) => ({ name: `image-${index}.png`, buffer })),
  );
  const [e, d, c, a] = saved as [Id<"refs">, Id<"refs">, Id<"refs">, Id<"refs">];
  const owner = await clientFor(page);

  await owner.mutation(api.library.remove, { refIds: [d] });
  assert(
    !(await libraryOf(owner)).includes(d) && (await trashOf(owner)).join() === d,
    "a Ref deleted before any canvas opened leaves the library and is the one image in the trash",
  );

  const board = await owner.mutation(api.collections.create, { name: "Board" });
  await owner.mutation(api.collections.addRefs, { collectionId: board, refIds: [a, c] });
  const library = await openCanvas(owner, {});
  const collection = await openCanvas(owner, { collectionId: board });
  assert(
    !find(library.items, d) && library.items.length === 3 && collection.items.length === 2,
    `canvas.open places only live Refs: ${library.items.length} on the library's canvas, ${collection.items.length} on the collection's`,
  );
  await owner.mutation(api.canvas.apply, {
    canvasId: library.canvasId,
    ops: [
      { op: "patch", key: a, fields: { x: 5555, y: -2222 } },
      { op: "remove", key: c },
    ],
  });
  const libraryBefore = await openCanvas(owner, {});
  const collectionBefore = await openCanvas(owner, { collectionId: board });
  const aOnLibrary = find(libraryBefore.items, a)!;
  const aOnCollection = find(collectionBefore.items, a)!;
  assert(
    aOnLibrary.x === 5555 && aOnLibrary.y === -2222 && !find(libraryBefore.items, c),
    "before the delete, the image is moved on the library's canvas and a second image is removed from it",
  );

  const canvasPage = await page.context().newPage();
  watchConsole(canvasPage);
  await canvasPage.goto(`${appUrl}/library?view=canvas`);
  await until(
    async () => (await shownOnCanvas(canvasPage)) === 2,
    "a second page shows the canvas",
  );
  await canvasPage.evaluate(() => {
    document.body.dataset.loadedOnce = "yes";
  });

  await page.locator(`[data-ref-id="${a}"]`).getByRole("button", { name: "Delete" }).click();
  await page.locator(`[data-ref-id="${a}"]`).waitFor({ state: "detached" });
  assert(
    (await cards(page).count()) === 2,
    "clicking Delete on a card takes the card out of the library's gallery",
  );
  await page.getByRole("link", { name: "Trash", exact: true }).click();
  await page.getByRole("heading", { name: "Trash" }).waitFor();
  await page.locator(`[data-ref-id="${d}"]`).waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>("[data-ref-id] img")].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  await page.screenshot({ path: `${evidence}/01-trash.png`, fullPage: true });
  assert(
    (await cardIds(page)) === [a, d].join() && (await page.getByLabel("Add images").count()) === 0,
    "the Trash link opens /trash, which shows the deleted images newest deleted first with their thumbnails, and no file input",
  );
  await until(
    async () => (await shownOnCanvas(canvasPage)) === 1,
    "the open canvas page drops the image",
  );
  assert(
    (await canvasPage.evaluate(() => document.body.dataset.loadedOnce)) === "yes",
    "a second page with the library's canvas open drops the image without a reload: 2 images, then 1",
  );

  const deletedRow = await refRow(a);
  assert(
    typeof deletedRow?.deletedAt === "number" &&
      !(await libraryOf(owner)).includes(a) &&
      (await trashOf(owner))[0] === a,
    `remove gives the Ref's row a deletedAt, takes it out of library.list, and puts it first in library.trash: ${deletedRow?.deletedAt}`,
  );
  assert(
    !(await galleryOf(owner, board)).includes(a) &&
      (await rows("collectionRefs")).some((row) => row.collectionId === board && row.refId === a),
    "the image leaves the collection's gallery, and its membership row is still there",
  );

  const libraryGone = await canvasChanges(owner, {
    canvasId: library.canvasId,
    rev: libraryBefore.rev,
  });
  const collectionGone = await canvasChanges(owner, {
    canvasId: collection.canvasId,
    rev: collectionBefore.rev,
  });
  assert(
    oneChange(libraryGone, libraryBefore.rev, a, deletedRow.deletedAt) &&
      oneChange(collectionGone, collectionBefore.rev, a, deletedRow.deletedAt),
    `canvas.changes on both canvases reports the image's item with the delete's deletedAt, at a rev raised by one: ${libraryBefore.rev} to ${libraryGone.rev}, ${collectionBefore.rev} to ${collectionGone.rev}`,
  );
  const libraryOpened = await openCanvas(owner, {});
  const collectionOpened = await openCanvas(owner, { collectionId: board });
  assert(
    !find(libraryOpened.items, a) &&
      !find(collectionOpened.items, a) &&
      libraryOpened.rev === libraryGone.rev &&
      collectionOpened.rev === collectionGone.rev,
    "canvas.open returns neither item, and places nothing",
  );

  await owner.mutation(api.library.remove, { refIds: [a] });
  assert(
    (await refRow(a))?.deletedAt === deletedRow.deletedAt &&
      (await revOf(owner, library.canvasId)) === libraryGone.rev &&
      (await revOf(owner, collection.canvasId)) === collectionGone.rev,
    "deleting again keeps the first deletedAt and raises no canvas's rev",
  );

  const other = await owner.mutation(api.collections.create, { name: "Other" });
  assert(
    (await outcome(
      owner.mutation(api.collections.addRefs, { collectionId: other, refIds: [a] }),
    )) === "RefNotFound" && (await galleryOf(owner, other)).length === 0,
    "a Ref in the trash cannot be added to a collection: RefNotFound",
  );
  const patchA = { op: "patch" as const, key: a, fields: { x: 1 } };
  assert(
    (await outcome(
      owner.mutation(api.canvas.apply, { canvasId: library.canvasId, ops: [patchA] }),
    )) === "ItemNotFound" &&
      (await outcome(
        owner.mutation(api.canvas.apply, {
          canvasId: collection.canvasId,
          ops: [{ op: "remove", key: a }],
        }),
      )) === "ItemNotFound" &&
      (await revOf(owner, library.canvasId)) === libraryGone.rev &&
      (await galleryOf(owner, board)).length === 1,
    "an item of a Ref in the trash cannot be patched or removed on either canvas: ItemNotFound, and nothing is written",
  );

  const [original] = await owner.mutation(api.library.urls, { refIds: [a], role: "original" });
  assert(
    sha256(new Uint8Array(await (await fetch(original!.url)).arrayBuffer())) ===
      sha256(buffers[0]!),
    "library.urls still signs the Ref in the trash, and R2 serves its original byte-exact",
  );

  await signInWithPasskey(second.page, `check-trash-b-${stamp}`);
  const [foreign] = await save(second.page, [{ name: "theirs.png", buffer: buffers[1]! }]);
  const intruder = await clientFor(second.page);
  assert(
    (await outcome(intruder.mutation(api.library.remove, { refIds: [e] }))) === "RefNotFound" &&
      (await outcome(intruder.mutation(api.library.restore, { refIds: [a] }))) === "RefNotFound" &&
      (await refRow(e))?.deletedAt === undefined &&
      (await refRow(a))?.deletedAt === deletedRow.deletedAt,
    "a second user gets RefNotFound from remove and restore on the first user's Refs, which stay as they were",
  );
  assert(
    (await outcome(owner.mutation(api.library.remove, { refIds: [e, foreign!] }))) ===
      "RefNotFound" &&
      (await refRow(e))?.deletedAt === undefined &&
      (await refRow(foreign!))?.deletedAt === undefined,
    "a remove of one own Ref and one foreign Ref fails with RefNotFound and trashes neither",
  );

  await page.locator(`[data-ref-id="${a}"]`).getByRole("button", { name: "Restore" }).click();
  await page.locator(`[data-ref-id="${a}"]`).waitFor({ state: "detached" });
  const leftInTrash = await cardIds(page);
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await page.locator(`[data-ref-id="${a}"]`).waitFor();
  await until(
    async () => (await shownOnCanvas(canvasPage)) === 2,
    "the open canvas page shows the image again",
  );
  await canvasPage.screenshot({ path: `${evidence}/02-canvas-after-restore.png` });
  assert(
    leftInTrash === d &&
      (await page.locator(`[data-ref-id="${a}"]`).count()) === 1 &&
      (await canvasPage.evaluate(() => document.body.dataset.loadedOnce)) === "yes",
    "clicking Restore on /trash takes the card out of the trash, back into the library's gallery and onto the open canvas page",
  );
  assert(
    (await refRow(a))?.deletedAt === undefined &&
      (await libraryOf(owner)).includes(a) &&
      (await galleryOf(owner, board)).includes(a) &&
      !(await trashOf(owner)).includes(a),
    "restore takes the Ref out of the trash, back into the library and the collection",
  );
  const libraryBack = await canvasChanges(owner, {
    canvasId: library.canvasId,
    rev: libraryGone.rev,
  });
  const collectionBack = await canvasChanges(owner, {
    canvasId: collection.canvasId,
    rev: collectionGone.rev,
  });
  assert(
    oneChange(libraryBack, libraryGone.rev, a, undefined) &&
      oneChange(collectionBack, collectionGone.rev, a, undefined) &&
      placeOf(libraryBack.items[0]) === placeOf(aOnLibrary) &&
      placeOf(collectionBack.items[0]) === placeOf(aOnCollection),
    `canvas.changes on both canvases reports the item back, with no deletedAt and the key, position, scale, and z it had: ${placeOf(libraryBack.items[0])}`,
  );
  assert(
    find((await openCanvas(owner, {})).items, a)?.x === 5555,
    "the item moved on the library's canvas before the delete is at its moved position",
  );

  await owner.mutation(api.library.restore, { refIds: [a] });
  assert(
    (await refRow(a))?.deletedAt === undefined &&
      (await revOf(owner, library.canvasId)) === libraryBack.rev &&
      (await revOf(owner, collection.canvasId)) === collectionBack.rev,
    "restoring again changes nothing and raises no canvas's rev",
  );

  const beforeC = await openCanvas(owner, {});
  await owner.mutation(api.library.remove, { refIds: [c] });
  const cInTrash =
    typeof (await refRow(c))?.deletedAt === "number" &&
    !find((await openCanvas(owner, { collectionId: board })).items, c);
  await owner.mutation(api.library.restore, { refIds: [c] });
  const afterC = await openCanvas(owner, {});
  assert(
    cInTrash &&
      (await refRow(c))?.deletedAt === undefined &&
      !find(afterC.items, c) &&
      afterC.rev === beforeC.rev &&
      find((await openCanvas(owner, { collectionId: board })).items, c) !== undefined,
    "an item removed from the library's canvas before the delete stays removed after the restore, and the image is back on the collection's canvas",
  );

  await owner.mutation(api.library.restore, { refIds: [d] });
  const placed = await openCanvas(owner, {});
  const dItem = find(placed.items, d);
  assert(
    placed.rev === afterC.rev + 1 && dItem?.key === d && dItem.deletedAt === undefined,
    `a Ref deleted before any canvas placed it is placed by the first open after its restore, at rev ${placed.rev}`,
  );

  await owner.mutation(api.library.remove, { refIds: [e] });
  await page.locator(`[data-ref-id="${e}"]`).waitFor({ state: "detached" });
  const [again] = await save(page, [{ name: "again.png", buffer: eBuffer! }]);
  const blobOf = async (refId: string) => (await refRow(refId))?.blobs.original;
  assert(
    again !== e &&
      (await libraryOf(owner)).includes(again!) &&
      (await trashOf(owner)).includes(e) &&
      (await blobOf(again!)) === (await blobOf(e)),
    "saving the bytes of a Ref in the trash adds a second, live Ref on the same Blob",
  );
  assertCleanConsole();
} finally {
  await first.browser.close();
  await second.browser.close();
}
