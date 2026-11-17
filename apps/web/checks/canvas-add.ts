import { api } from "@refhaven/backend/api";
import type { Id } from "@refhaven/backend/id";
import { placedEdge, zAbove } from "@refhaven/scene";
import type { ConvexHttpClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
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

type Item = FunctionReturnType<typeof api.canvas.open>["items"][number];

const stamp = Date.now().toString(36);

const save = async (page: Page, files: ReadonlyArray<{ name: string; buffer: Buffer }>) => {
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
};

const refIdsByName = async (client: ConvexHttpClient) =>
  new Map(
    (
      await client.query(api.library.list, { paginationOpts: { numItems: 100, cursor: null } })
    ).page.map((item) => [item.fileName, item.refId]),
  );

const members = async (client: ConvexHttpClient, collectionId: Id<"collections">) =>
  (
    await client.query(api.collections.refs, {
      collectionId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  ).page.map((item) => item.refId as string);

const longerEdge = (item: Item) => Math.max(item.width, item.height) * item.scale;
const onTop = (item: Item, others: ReadonlyArray<Item>) =>
  others.every((other) => other.key === item.key || other.z < item.z);

const base32 = "0123456789abcdefghjkmnpqrstvwxyz";

/**
 * A well-formed ID of the same table as `id` that no document has. Nothing deletes a Ref, so a
 * check cannot get one any other way. A Convex ID is base32 of the table number, 16 bytes, and a
 * Fletcher-16 checksum mod 256 of those.
 */
const missingId = <T extends string>(id: T): T => {
  let bits = 0;
  let value = 0;
  const bytes: Array<number> = [];
  for (const character of id) {
    value = ((value << 5) | base32.indexOf(character)) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 255);
    }
  }
  const body = bytes.slice(0, -2);
  body[body.length - 1] = body[body.length - 1]! ^ 1;
  let sum = 0;
  let sumOfSums = 0;
  for (const byte of body) {
    sum = (sum + byte) & 255;
    sumOfSums = (sumOfSums + sum) & 255;
  }
  let encoded = "";
  bits = 0;
  value = 0;
  for (const byte of [...body, sum, sumOfSums]) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += base32[(value >> bits) & 31];
    }
  }
  return encoded as T;
};

const first = await openPageWithPasskeyDevice();
const second = await openPageWithPasskeyDevice();
try {
  const { page } = first;
  await signInWithPasskey(page, `check-canvas-add-a-${stamp}`);
  const owner = await clientFor(page);
  await save(page, [
    { name: "a.png", buffer: await pngOf(page, "rgb(200, 30, 30)", 600, 300) },
    { name: "b.png", buffer: await pngOf(page, "rgb(30, 30, 200)", 300) },
    { name: "c.png", buffer: await pngOf(page, "rgb(30, 160, 30)", 200, 500) },
    { name: "trashed.png", buffer: await pngOf(page, "rgb(90, 90, 90)", 100) },
  ]);
  const opened = await owner.mutation(api.canvas.open, {});
  const { canvasId } = opened;
  await save(page, [
    { name: "fresh.png", buffer: await pngOf(page, "rgb(200, 200, 30)", 800, 200) },
    { name: "f.png", buffer: await pngOf(page, "rgb(30, 200, 200)", 120, 360) },
    { name: "g.png", buffer: await pngOf(page, "rgb(200, 30, 200)", 360, 120) },
  ]);
  const ids = await refIdsByName(owner);
  const [a, b, c, trashed, fresh, f, g] = [
    "a.png",
    "b.png",
    "c.png",
    "trashed.png",
    "fresh.png",
    "f.png",
    "g.png",
  ].map((name) => ids.get(name)!);
  assert(
    opened.items.length === 4 && [a, b, c, trashed, fresh, f, g].every(Boolean),
    `the library's canvas holds the 4 images saved before it opened, and 3 more are saved after: ${opened.items.length} items`,
  );

  const changesSince = (rev: number) => owner.query(api.canvas.changes, { canvasId, rev });
  const libraryRows = async () =>
    (await rows("canvasItems")).filter((row) => row.canvasId === canvasId);

  const freshRev = await owner.mutation(api.canvas.apply, {
    canvasId,
    ops: [{ op: "add", refId: fresh!, x: 1234.5, y: -678 }],
  });
  const sinceOpened = await changesSince(opened.rev);
  const added = sinceOpened.items[0]!;
  assert(
    freshRev === opened.rev + 1 &&
      sinceOpened.rev === freshRev &&
      sinceOpened.items.length === 1 &&
      added.key === fresh &&
      added.refId === fresh &&
      added.x === 1234.5 &&
      added.y === -678 &&
      added.width === 800 &&
      added.height === 200 &&
      Math.abs(longerEdge(added) - placedEdge) < 1e-9 &&
      added.deletedAt === undefined &&
      onTop(added, opened.items),
    `add places a Ref with no item at the given point, keyed by its Ref's ID, above every other item, with its longer edge at ${longerEdge(added)}, and changes reports it at rev ${opened.rev} to ${freshRev}`,
  );

  // The patch lifts an item above every other one, in the same call as the adds. Each add must
  // still land above it, whether it comes before the patch or after.
  const [lifted] = zAbove(
    [...opened.items, added].map((item) => item.z),
    1,
  );
  const mixedRev = await owner.mutation(api.canvas.apply, {
    canvasId,
    ops: [
      { op: "add", refId: f!, x: 0, y: 3000 },
      { op: "patch", key: c!, fields: { x: 42, z: lifted! } },
      { op: "add", refId: g!, x: 500, y: 3000 },
    ],
  });
  const sinceFresh = await changesSince(freshRev);
  const byRef = new Map(sinceFresh.items.map((item) => [item.refId as string, item]));
  const mixedRows = (await libraryRows()).filter((row) => row.rev === mixedRev);
  assert(
    mixedRev === freshRev + 1 &&
      sinceFresh.rev === mixedRev &&
      sinceFresh.items.length === 3 &&
      byRef.get(c!)?.x === 42 &&
      byRef.get(f!)?.y === 3000 &&
      byRef.get(g!)?.x === 500 &&
      byRef.get(c!)?.z === lifted &&
      lifted! < byRef.get(f!)!.z &&
      byRef.get(f!)!.z < byRef.get(g!)!.z &&
      onTop(byRef.get(f!)!, [...opened.items, added]) &&
      mixedRows.length === 3,
    `one call with two adds and a patch raises rev once, ${freshRev} to ${mixedRev}, stamps the 3 items it wrote, and stacks the adds in order above every item, the one the patch lifted included`,
  );

  const removedRev = await owner.mutation(api.canvas.apply, {
    canvasId,
    ops: [{ op: "remove", key: b! }],
  });
  const afterRemove = await owner.mutation(api.canvas.open, {});
  assert(
    afterRemove.rev === removedRev && afterRemove.items.every((item) => item.refId !== b),
    `on the library's canvas open does not place a removed item's Ref again: ${afterRemove.items.length} items at rev ${afterRemove.rev}`,
  );
  const backRev = await owner.mutation(api.canvas.apply, {
    canvasId,
    ops: [{ op: "add", refId: b!, x: -500, y: -250 }],
  });
  const [back] = (await changesSince(removedRev)).items;
  const reopened = await owner.mutation(api.canvas.open, {});
  const bRows = (await libraryRows()).filter((row) => row.refId === b);
  assert(
    backRev === removedRev + 1 &&
      back !== undefined &&
      back.key === b &&
      back.x === -500 &&
      back.y === -250 &&
      back.deletedAt === undefined &&
      onTop(back, afterRemove.items) &&
      reopened.rev === backRev &&
      reopened.items.some((item) => item.key === b && item.x === -500) &&
      bRows.length === 1 &&
      bRows[0].deletedAt === undefined,
    `add brings a removed item back at the new point with no deletedAt, and the canvas still holds ${bRows.length} row for that Ref`,
  );

  const movedRev = await owner.mutation(api.canvas.apply, {
    canvasId,
    ops: [{ op: "add", refId: c!, x: 9000, y: 9100 }],
  });
  const [moved] = (await changesSince(backRev)).items;
  const cRows = (await libraryRows()).filter((row) => row.refId === c);
  assert(
    movedRev === backRev + 1 &&
      moved !== undefined &&
      moved.key === c &&
      moved.x === 9000 &&
      moved.y === 9100 &&
      cRows.length === 1,
    `add for a Ref with a live item moves it and makes no second row: ${cRows.length} row`,
  );

  const board = await owner.mutation(api.collections.create, { name: "Board" });
  await owner.mutation(api.collections.addRefs, { collectionId: board, refIds: [a!] });
  const boardCanvas = await owner.mutation(api.canvas.open, { collectionId: board });
  const boardAddRev = await owner.mutation(api.canvas.apply, {
    canvasId: boardCanvas.canvasId,
    ops: [{ op: "add", refId: fresh!, x: 10, y: 20 }],
  });
  const boardAfter = await owner.mutation(api.canvas.open, { collectionId: board });
  const freshOnBoard = boardAfter.items.find((item) => item.key === fresh);
  assert(
    boardAddRev === boardCanvas.rev + 1 &&
      (await members(owner, board)).includes(fresh!) &&
      freshOnBoard?.x === 10 &&
      freshOnBoard.y === 20 &&
      boardAfter.rev === boardAddRev &&
      (await changesSince(movedRev)).rev === movedRev,
    "add on a collection's canvas for a Ref outside the collection makes it a member and places it there, and the library's canvas is not written",
  );

  await owner.mutation(api.library.remove, { refIds: [trashed!] });
  const libraryRev = (await changesSince(movedRev)).rev;
  await signInWithPasskey(second.page, `check-canvas-add-b-${stamp}`);
  await save(second.page, [
    { name: "foreign.png", buffer: await pngOf(second.page, "rgb(10, 90, 160)", 50) },
  ]);
  const other = await clientFor(second.page);
  const foreign = (await refIdsByName(other)).get("foreign.png")!;
  const missing = missingId(a!);
  const refused = {
    foreign: await outcome(
      owner.mutation(api.canvas.apply, {
        canvasId,
        ops: [{ op: "add", refId: foreign, x: 0, y: 0 }],
      }),
    ),
    missing: await outcome(
      owner.mutation(api.canvas.apply, {
        canvasId,
        ops: [{ op: "add", refId: missing, x: 0, y: 0 }],
      }),
    ),
    trashed: await outcome(
      owner.mutation(api.canvas.apply, {
        canvasId,
        ops: [{ op: "add", refId: trashed!, x: 0, y: 0 }],
      }),
    ),
  };
  assert(
    Object.values(refused).every((result) => result === "RefNotFound"),
    `add of another user's Ref, a missing Ref, and a Ref in the trash fails with RefNotFound: ${JSON.stringify(refused)}`,
  );
  const goodThenBad = await outcome(
    owner.mutation(api.canvas.apply, {
      canvasId: boardCanvas.canvasId,
      ops: [
        { op: "add", refId: b!, x: 1, y: 1 },
        { op: "add", refId: foreign, x: 2, y: 2 },
      ],
    }),
  );
  const boardSince = await owner.query(api.canvas.changes, {
    canvasId: boardCanvas.canvasId,
    rev: boardAddRev,
  });
  assert(
    goodThenBad === "RefNotFound" &&
      boardSince.rev === boardAddRev &&
      boardSince.items.length === 0 &&
      !(await members(owner, board)).includes(b!) &&
      (await changesSince(libraryRev)).rev === libraryRev,
    `a call that mixes a good add with a bad one fails with ${goodThenBad} and writes nothing: no item, no membership, rev ${boardSince.rev}`,
  );

  assert(
    (await outcome(
      other.mutation(api.canvas.apply, {
        canvasId,
        ops: [{ op: "add", refId: foreign, x: 0, y: 0 }],
      }),
    )) === "CanvasNotFound" && (await changesSince(libraryRev)).rev === libraryRev,
    "a second user gets CanvasNotFound from an add on the first user's canvas, which stays as it was",
  );
} finally {
  await first.browser.close();
  await second.browser.close();
}
