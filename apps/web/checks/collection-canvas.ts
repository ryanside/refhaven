import { api } from "@refhaven/backend/api";
import type { Id } from "@refhaven/backend/id";
import { boundsOf } from "@refhaven/scene";
import type { ConvexHttpClient } from "convex/browser";
import type { Page } from "playwright";
import {
  assert,
  clientFor,
  openPageWithPasskeyDevice,
  outcome,
  pngOf,
  rows,
  signInWithPasskey,
} from "./browser";
import { refOf, openCanvas, canvasChanges, type Item } from "./canvas-screen";

const stamp = Date.now().toString(36);
const sorted = (values: ReadonlyArray<string>) => [...values].sort().join();
const refIdsOf = (items: ReadonlyArray<Item>) => sorted(items.map((item) => refOf(item)));
const find = (items: ReadonlyArray<Item>, refId: string) =>
  items.find((item) => refOf(item) === refId);

const cards = (page: Page) => page.locator("[data-ref-id]");

const save = async (page: Page, files: Array<{ name: string; buffer: Buffer }>) => {
  const outcomes = page.locator('[role="status"] li');
  await page
    .getByLabel("Add images")
    .setInputFiles(files.map((file) => ({ ...file, mimeType: "image/png" })));
  await outcomes.nth(files.length - 1).waitFor({ timeout: 60_000 });
  const refused = await page
    .locator('[role="status"] li:not([data-outcome="saved"])')
    .allTextContents();
  if (refused.length > 0) {
    throw new Error(`FAIL the page saves every image it is given: ${refused.join(", ")}`);
  }
  await cards(page)
    .nth(files.length - 1)
    .waitFor();
  return cards(page).evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-ref-id") as Id<"refs">),
  );
};

const galleryOf = async (client: ConvexHttpClient, collectionId: Id<"collections">) =>
  (
    await client.query(api.collections.refs, {
      collectionId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  ).page.map((item) => item.refId as string);

const libraryOf = async (client: ConvexHttpClient) =>
  (
    await client.query(api.library.list, { paginationOpts: { numItems: 100, cursor: null } })
  ).page.map((item) => item.refId as string);

const first = await openPageWithPasskeyDevice();
const second = await openPageWithPasskeyDevice();
try {
  const { page } = first;
  await signInWithPasskey(page, `check-collection-canvas-a-${stamp}`);
  const saved = await save(
    page,
    await Promise.all(
      [
        "rgb(200, 30, 30)",
        "rgb(30, 30, 200)",
        "rgb(30, 160, 30)",
        "rgb(200, 200, 30)",
        "rgb(120, 30, 160)",
      ].map(async (color, index) => ({
        name: `image-${index}.png`,
        buffer: await pngOf(page, color, 300 + index * 40, 260),
      })),
    ),
  );
  const owner = await clientFor(page);
  const [kept, applied, leftA, leftB, outside] = saved as [
    Id<"refs">,
    Id<"refs">,
    Id<"refs">,
    Id<"refs">,
    Id<"refs">,
  ];
  const members = [kept, applied, leftA, leftB];
  const board = await owner.mutation(api.collections.create, { name: "Board" });
  await owner.mutation(api.collections.addRefs, { collectionId: board, refIds: members });

  const library = await openCanvas(owner, {});
  const collection = await openCanvas(owner, { collectionId: board });
  assert(
    refIdsOf(collection.items) === sorted(members) &&
      collection.items.every((item) => item.key === refOf(item)),
    `a collection's canvas holds exactly its members, each under its Ref's ID: ${collection.items.length} of ${saved.length} images`,
  );
  assert(
    refIdsOf(library.items) === sorted(saved),
    `the library's canvas still holds every Ref: ${library.items.length} items`,
  );
  assert(
    collection.canvasId !== library.canvasId &&
      (await openCanvas(owner, { collectionId: board })).canvasId === collection.canvasId &&
      (await openCanvas(owner, {})).canvasId === library.canvasId,
    "the two canvases have different IDs, and each open finds its own again",
  );

  const movedRev = await owner.mutation(api.canvas.apply, {
    canvasId: collection.canvasId,
    ops: [{ op: "patch", key: kept, fields: { x: 7777, y: -333 } }],
  });
  const libraryAfterMove = await openCanvas(owner, {});
  const movedThere = find((await openCanvas(owner, { collectionId: board })).items, kept)!;
  assert(
    movedThere.x === 7777 &&
      libraryAfterMove.rev === library.rev &&
      find(libraryAfterMove.items, kept)!.x === find(library.items, kept)!.x &&
      find(libraryAfterMove.items, kept)!.y === find(library.items, kept)!.y,
    `a move on the collection's canvas leaves the item's position on the library's canvas unchanged: ${find(libraryAfterMove.items, kept)!.x} there, 7777 here`,
  );
  const libraryMovedRev = await owner.mutation(api.canvas.apply, {
    canvasId: library.canvasId,
    ops: [{ op: "patch", key: leftA, fields: { x: -4444 } }],
  });
  const collectionAfterLibraryMove = await canvasChanges(owner, {
    canvasId: collection.canvasId,
    rev: movedRev,
  });
  assert(
    libraryMovedRev === library.rev + 1 &&
      find((await openCanvas(owner, {})).items, leftA)!.x === -4444 &&
      collectionAfterLibraryMove.rev === movedRev &&
      collectionAfterLibraryMove.items.length === 0,
    "a move on the library's canvas is saved there at one new rev, and writes nothing to the collection's canvas",
  );

  const libraryBeforeRemove = await openCanvas(owner, {});
  const removedRev = await owner.mutation(api.canvas.apply, {
    canvasId: collection.canvasId,
    ops: [{ op: "remove", key: applied }],
  });
  const [removedItem] = (
    await canvasChanges(owner, { canvasId: collection.canvasId, rev: movedRev })
  ).items;
  assert(
    removedRev === movedRev + 1 &&
      removedItem?.key === applied &&
      typeof removedItem.deletedAt === "number" &&
      !(await galleryOf(owner, board)).includes(applied) &&
      (await openCanvas(owner, { collectionId: board })).removed === 0,
    "removing an item from the collection's canvas removes the image from the collection: its gallery no longer lists it, and the canvas counts no image off it",
  );
  const libraryAfterRemove = await openCanvas(owner, {});
  assert(
    (await libraryOf(owner)).includes(applied) &&
      libraryAfterRemove.rev === libraryBeforeRemove.rev &&
      JSON.stringify(find(libraryAfterRemove.items, applied)) ===
        JSON.stringify(find(libraryBeforeRemove.items, applied)),
    "the image stays in the library, and its item on the library's canvas is left as it was",
  );

  const removedRefsRev = (await canvasChanges(owner, { canvasId: collection.canvasId, rev: 0 }))
    .rev;
  await owner.mutation(api.collections.removeRefs, {
    collectionId: board,
    refIds: [leftA, leftB],
  });
  const leftCanvas = await canvasChanges(owner, {
    canvasId: collection.canvasId,
    rev: removedRefsRev,
  });
  assert(
    leftCanvas.rev === removedRefsRev + 1 &&
      sorted(leftCanvas.items.map((item) => item.key)) === sorted([leftA, leftB]) &&
      leftCanvas.items.every((item) => typeof item.deletedAt === "number"),
    `collections.removeRefs of two Refs shows in canvas.changes as both items with a deletedAt, and raises rev once: ${removedRefsRev} to ${leftCanvas.rev}`,
  );
  assert(
    sorted(await galleryOf(owner, board)) === kept &&
      (await openCanvas(owner, { collectionId: board })).items.length === 1,
    "the collection and its canvas now hold only the image that stayed",
  );

  const beforeReturn = await openCanvas(owner, { collectionId: board });
  const layout = boundsOf(beforeReturn.items)!;
  await owner.mutation(api.collections.addRefs, {
    collectionId: board,
    refIds: [applied, leftA],
  });
  const returned = await openCanvas(owner, { collectionId: board });
  const back = [applied, leftA].map((refId) => find(returned.items, refId));
  assert(
    returned.rev === beforeReturn.rev + 1 &&
      back.every(
        (item) =>
          item !== undefined &&
          item.key === refOf(item) &&
          item.deletedAt === undefined &&
          boundsOf([item])!.left > layout.right,
      ),
    `adding two removed Refs again and opening places them again under the same keys, with no deletedAt, to the right of the layout at rev ${returned.rev}`,
  );
  const sinceReturn = await canvasChanges(owner, {
    canvasId: collection.canvasId,
    rev: beforeReturn.rev,
  });
  const itemRows = (await rows("canvasItems")).filter(
    (row) => row.canvasId === collection.canvasId,
  );
  assert(
    sorted(sinceReturn.items.map((item) => item.key)) === sorted([applied, leftA]) &&
      sinceReturn.items.every((item) => item.deletedAt === undefined) &&
      itemRows.length === members.length &&
      new Set(itemRows.map((row) => row.key)).size === members.length &&
      itemRows
        .filter((row) => row.deletedAt !== undefined)
        .map((row) => row.key)
        .join() === leftB,
    `canvas.changes reports the returned items, and the canvas still holds one row per Ref: ${itemRows.length} rows, one of them removed`,
  );

  const libraryBeforeOwnRemove = await openCanvas(owner, {});
  await owner.mutation(api.canvas.apply, {
    canvasId: library.canvasId,
    ops: [{ op: "remove", key: kept }],
  });
  const libraryAfterOwnRemove = await openCanvas(owner, {});
  assert(
    libraryAfterOwnRemove.rev === libraryBeforeOwnRemove.rev + 1 &&
      !find(libraryAfterOwnRemove.items, kept) &&
      (await openCanvas(owner, {})).rev === libraryAfterOwnRemove.rev &&
      libraryAfterOwnRemove.removed === libraryBeforeOwnRemove.removed + 1,
    "on the library's canvas a removed item is still not placed again by open, and it counts as one more image off the canvas",
  );
  assert(
    (await galleryOf(owner, board)).includes(kept) &&
      find((await openCanvas(owner, { collectionId: board })).items, kept)?.x === 7777,
    "a removal on the library's canvas leaves the image in the collection and on the collection's canvas",
  );

  const race = await owner.mutation(api.collections.create, { name: "Race" });
  await owner.mutation(api.collections.addRefs, { collectionId: race, refIds: [kept, outside] });
  const [raceA, raceB] = await Promise.all([
    openCanvas(owner, { collectionId: race }),
    openCanvas(owner, { collectionId: race }),
  ]);
  const raceCanvases = (await rows("canvases")).filter((row) => row.collectionId === race);
  const raceRows = (await rows("canvasItems")).filter((row) => row.canvasId === raceA.canvasId);
  assert(
    raceA.canvasId === raceB.canvasId &&
      raceCanvases.length === 1 &&
      raceRows.length === 2 &&
      sorted(raceRows.map((row) => row.refId)) === sorted([kept, outside]),
    `two opens at once for a new collection make one canvas and place each member once: ${raceCanvases.length} canvas, ${raceRows.length} items`,
  );

  const unopened = await owner.mutation(api.collections.create, { name: "Unopened" });
  await owner.mutation(api.collections.addRefs, { collectionId: unopened, refIds: [kept] });
  await owner.mutation(api.collections.removeRefs, { collectionId: unopened, refIds: [kept] });
  assert(
    (await galleryOf(owner, unopened)).length === 0 &&
      (await rows("canvases")).every((row) => row.collectionId !== unopened),
    "removeRefs on a collection whose canvas was never opened takes the image out and makes no canvas",
  );

  await signInWithPasskey(second.page, `check-collection-canvas-b-${stamp}`);
  const other = await clientFor(second.page);
  assert(
    (await outcome(openCanvas(other, { collectionId: board }))) === "CollectionNotFound" &&
      (await rows("canvases")).filter((row) => row.collectionId === board).length === 1,
    "a second user gets CollectionNotFound from open on the first user's collection, and it makes nothing",
  );
  assert(
    (await outcome(canvasChanges(other, { canvasId: collection.canvasId, rev: 0 }))) ===
      "CanvasNotFound" &&
      (await outcome(
        other.mutation(api.canvas.apply, {
          canvasId: collection.canvasId,
          ops: [{ op: "remove", key: kept }],
        }),
      )) === "CanvasNotFound" &&
      (await galleryOf(owner, board)).includes(kept),
    "a second user gets CanvasNotFound from changes and apply on the first user's collection's canvas, and the image stays in it",
  );

  const own = await other.mutation(api.collections.create, { name: "Mine" });
  const ownCollection = await openCanvas(other, { collectionId: own });
  const [ownLibrary, ownLibraryAgain] = await Promise.all([
    openCanvas(other, {}),
    openCanvas(other, {}),
  ]);
  const otherWorkspace = (await rows("collections")).find((row) => row._id === own)!.workspaceId;
  const otherCanvases = (await rows("canvases")).filter(
    (row) => row.workspaceId === otherWorkspace,
  );
  assert(
    ownLibrary.canvasId === ownLibraryAgain.canvasId &&
      ownLibrary.canvasId !== ownCollection.canvasId &&
      otherCanvases.length === 2 &&
      otherCanvases.filter((row) => row.collectionId === undefined).length === 1,
    "in a workspace whose collection has a canvas, two opens at once of the library make one library canvas",
  );
} finally {
  await first.browser.close();
  await second.browser.close();
}
