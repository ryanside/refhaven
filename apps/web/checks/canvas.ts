import { api } from "@refhaven/backend/api";
import { type Box, boundsOf } from "@refhaven/scene";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import type { Page } from "playwright";
import {
  assert,
  clientFor,
  convexUrl,
  openPageWithPasskeyDevice,
  outcome,
  pngOf,
  rows,
  signInWithPasskey,
} from "./browser";

type Item = FunctionReturnType<typeof api.canvas.open>["items"][number];

const boxOf = (item: Item) => boundsOf([item])!;
const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const noneOverlap = (items: ReadonlyArray<Item>) =>
  items.every((item, index) =>
    items.slice(index + 1).every((other) => !overlaps(boxOf(item), boxOf(other))),
  );
const same = (a: ReadonlyArray<Item | undefined>, b: ReadonlyArray<Item | undefined>) => {
  const canonical = (items: ReadonlyArray<Item | undefined>) =>
    JSON.stringify(
      items
        .map((item) => Object.entries(item ?? {}).sort(([x], [y]) => (x < y ? -1 : 1)))
        .sort((x, y) => (JSON.stringify(x) < JSON.stringify(y) ? -1 : 1)),
    );
  return canonical(a) === canonical(b);
};
const byKey = (items: ReadonlyArray<Item>) => new Map(items.map((item) => [item.key, item]));
const sizes = (items: ReadonlyArray<Item>) =>
  items.map(({ width, height }) => `${width}x${height}`).sort();

const cards = (page: Page) => page.locator("[data-ref-id]");

const save = async (page: Page, files: Array<{ name: string; buffer: Buffer }>) => {
  const before = await cards(page).count();
  await page
    .getByLabel("Add images")
    .setInputFiles(files.map((file) => ({ ...file, mimeType: "image/png" })));
  await cards(page)
    .nth(before + files.length - 1)
    .waitFor();
};

const stamp = Date.now().toString(36);

const anonymous = new ConvexHttpClient(convexUrl());
assert(
  (await outcome(anonymous.mutation(api.canvas.open, {}))) === "NotSignedIn",
  "opening a canvas without a session fails with NotSignedIn",
);

const first = await openPageWithPasskeyDevice();
const second = await openPageWithPasskeyDevice();
try {
  const { page } = first;
  await signInWithPasskey(page, `check-canvas-a-${stamp}`);
  await save(page, [
    { name: "wide.png", buffer: await pngOf(page, "rgb(200, 30, 30)", 1200, 800) },
    { name: "square.png", buffer: await pngOf(page, "rgb(30, 30, 200)", 300) },
    { name: "tall.png", buffer: await pngOf(page, "rgb(30, 160, 30)", 400, 1200) },
  ]);
  if (process.env.EVIDENCE) {
    await page.screenshot({ path: `${process.env.EVIDENCE}/01-saved.png`, fullPage: true });
  }
  const savedRefIds = await cards(page).evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-ref-id")!),
  );

  const owner = await clientFor(page);
  const opened = await owner.mutation(api.canvas.open, {});
  assert(
    opened.items.length === 3 &&
      opened.items
        .map((item) => item.refId)
        .sort()
        .join() === [...savedRefIds].sort().join() &&
      sizes(opened.items).join() === "1200x800,300x300,400x1200",
    `open places one item per saved Ref, with the Ref's pixel size: ${sizes(opened.items)}`,
  );
  assert(
    noneOverlap(opened.items),
    `the placed items do not overlap: ${opened.items.map((item) => JSON.stringify(boxOf(item)))}`,
  );

  const reopened = await owner.mutation(api.canvas.open, {});
  assert(
    reopened.rev === opened.rev &&
      reopened.canvasId === opened.canvasId &&
      same(reopened.items, opened.items),
    `a second open places nothing and keeps rev ${opened.rev}: ${reopened.rev}`,
  );

  await save(page, [
    { name: "later.png", buffer: await pngOf(page, "rgb(200, 200, 30)", 640, 480) },
  ]);
  const grown = await owner.mutation(api.canvas.open, {});
  const earlier = byKey(opened.items);
  const added = grown.items.filter((item) => !earlier.has(item.key));
  const layout = boundsOf(opened.items)!;
  assert(
    grown.rev === opened.rev + 1 &&
      grown.items.length === 4 &&
      added.length === 1 &&
      `${added[0]!.width}x${added[0]!.height}` === "640x480" &&
      grown.items.every((item) => !earlier.has(item.key) || same([earlier.get(item.key)], [item])),
    `after one more save, open places only that image and leaves the others as they were: ${sizes(added)}`,
  );
  assert(
    boxOf(added[0]!).left > layout.right && noneOverlap(grown.items),
    `the new image sits to the right of the layout: its left edge ${boxOf(added[0]!).left} > ${layout.right}`,
  );

  const { canvasId } = grown;
  const [moved, xOnly, removed] = grown.items;
  const movedRev = await owner.mutation(api.canvas.apply, {
    canvasId,
    ops: [{ op: "patch", key: moved!.key, fields: { x: 5000, y: -250 } }],
  });
  const sinceGrown = await owner.query(api.canvas.changes, { canvasId, rev: grown.rev });
  assert(
    movedRev === grown.rev + 1 &&
      sinceGrown.rev === movedRev &&
      sinceGrown.items.length === 1 &&
      sinceGrown.items[0]!.key === moved!.key &&
      sinceGrown.items[0]!.x === 5000 &&
      sinceGrown.items[0]!.y === -250,
    `one patch moves one item, and changes since the snapshot returns only that item at its new position: ${JSON.stringify(sinceGrown.items.map(({ key, x, y }) => ({ key, x, y })))}`,
  );

  const xOnlyRev = await owner.mutation(api.canvas.apply, {
    canvasId,
    ops: [{ op: "patch", key: xOnly!.key, fields: { x: xOnly!.x + 10 } }],
  });
  const [patched] = (await owner.query(api.canvas.changes, { canvasId, rev: movedRev })).items;
  assert(
    same([patched], [{ ...xOnly!, x: xOnly!.x + 10 }]),
    `a patch that names only x leaves every other field as it was: ${JSON.stringify(patched)}`,
  );

  const removedRev = await owner.mutation(api.canvas.apply, {
    canvasId,
    ops: [{ op: "remove", key: removed!.key }],
  });
  const [gone] = (await owner.query(api.canvas.changes, { canvasId, rev: xOnlyRev })).items;
  assert(
    gone?.key === removed!.key && typeof gone.deletedAt === "number",
    `a removed item shows in changes with its deletedAt: ${gone?.deletedAt}`,
  );
  const afterRemove = await owner.mutation(api.canvas.open, {});
  assert(
    afterRemove.rev === removedRev &&
      afterRemove.items.length === 3 &&
      afterRemove.items.every((item) => item.refId !== removed!.refId),
    `open leaves the removed item out and does not place its Ref again: ${afterRemove.items.length} items at rev ${afterRemove.rev}`,
  );

  const mixed = await outcome(
    owner.mutation(api.canvas.apply, {
      canvasId,
      ops: [
        { op: "patch", key: moved!.key, fields: { x: -9999 } },
        { op: "patch", key: "no-such-key", fields: { x: 1 } },
      ],
    }),
  );
  const afterMixed = await owner.query(api.canvas.changes, { canvasId, rev: removedRev });
  assert(
    mixed === "ItemNotFound" && afterMixed.rev === removedRev && afterMixed.items.length === 0,
    `a call with a valid op and an unknown key fails with ${mixed}, and writes nothing: rev ${afterMixed.rev}, ${afterMixed.items.length} changes`,
  );
  assert(
    (await outcome(
      owner.mutation(api.canvas.apply, {
        canvasId,
        ops: [{ op: "patch", key: removed!.key, fields: { x: 1 } }],
      }),
    )) === "ItemNotFound",
    "a patch to a removed item fails with ItemNotFound",
  );

  for (const [label, fields] of [
    ["a scale of 0", { scale: 0 }],
    ["an opacity of 2", { opacity: 2 }],
    ["a non-finite x", { x: Infinity }],
    ["a z that is not a fractional index", { z: "hello" }],
  ] as const) {
    const refused = await outcome(
      owner.mutation(api.canvas.apply, {
        canvasId,
        ops: [{ op: "patch", key: moved!.key, fields }],
      }),
    );
    assert(refused.startsWith("refused"), `${label} is ${refused}`);
  }
  const final = await owner.query(api.canvas.changes, { canvasId, rev: removedRev });
  assert(final.rev === removedRev, "none of the refused calls raised rev");

  const workspaceId = (await rows("refs")).find((ref) => ref._id === savedRefIds[0])!.workspaceId;
  const canvasRows = (await rows("canvases")).filter((row) => row.workspaceId === workspaceId);
  const itemRows = byKey((await rows("canvasItems")).filter((row) => row.canvasId === canvasId));
  assert(
    canvasRows.length === 1 &&
      canvasRows[0]._id === canvasId &&
      canvasRows[0].rev === removedRev &&
      itemRows.size === 4 &&
      [...itemRows.values()].every((row) => row.workspaceId === workspaceId),
    `the database holds one canvas at rev ${canvasRows[0]?.rev} and 4 items for this workspace`,
  );
  const movedRow = itemRows.get(moved!.key)!;
  const xOnlyRow = itemRows.get(xOnly!.key)!;
  const removedRow = itemRows.get(removed!.key)!;
  assert(
    movedRow.x === 5000 &&
      movedRow.y === -250 &&
      movedRow.rev === movedRev &&
      xOnlyRow.x === xOnly!.x + 10 &&
      xOnlyRow.y === xOnly!.y &&
      xOnlyRow.rev === xOnlyRev &&
      typeof removedRow.deletedAt === "number" &&
      removedRow.rev === removedRev,
    "the rows hold each patch and the removal, stamped with the rev of the call that wrote it",
  );

  const bothRev = await owner.mutation(api.canvas.apply, {
    canvasId,
    ops: [
      { op: "patch", key: moved!.key, fields: { rotation: 1 } },
      { op: "patch", key: xOnly!.key, fields: { rotation: 2 } },
    ],
  });
  const sinceRemoved = await owner.query(api.canvas.changes, { canvasId, rev: removedRev });
  assert(
    bothRev === removedRev + 1 &&
      sinceRemoved.rev === bothRev &&
      same(sinceRemoved.items, [
        { ...moved!, x: 5000, y: -250, rotation: 1 },
        { ...xOnly!, x: xOnly!.x + 10, rotation: 2 },
      ]),
    `one call with two ops raises rev once, and changes returns both items: rev ${removedRev} to ${bothRev}, ${sinceRemoved.items.length} items`,
  );

  await signInWithPasskey(second.page, `check-canvas-b-${stamp}`);
  const other = await clientFor(second.page);
  assert(
    (await outcome(other.query(api.canvas.changes, { canvasId, rev: 0 }))) === "CanvasNotFound",
    "a second user gets CanvasNotFound from changes on the first user's canvas",
  );
  assert(
    (await outcome(
      other.mutation(api.canvas.apply, {
        canvasId,
        ops: [{ op: "remove", key: moved!.key }],
      }),
    )) === "CanvasNotFound",
    "a second user gets CanvasNotFound from apply on the first user's canvas",
  );
  const [own, ownAgain] = await Promise.all([
    other.mutation(api.canvas.open, {}),
    other.mutation(api.canvas.open, {}),
  ]);
  assert(
    own.canvasId !== canvasId && own.rev === 0 && own.items.length === 0,
    `the second user's open returns their own empty canvas: ${own.items.length} items at rev ${own.rev}`,
  );
  const otherWorkspaceId = (await rows("canvases")).find(
    (row) => row._id === own.canvasId,
  )!.workspaceId;
  assert(
    ownAgain.canvasId === own.canvasId &&
      (await rows("canvases")).filter((row) => row.workspaceId === otherWorkspaceId).length === 1,
    "two opens at once for a new workspace make one canvas",
  );

  await save(second.page, [
    { name: "one.png", buffer: await pngOf(second.page, "rgb(10, 90, 160)", 500, 300) },
    { name: "two.png", buffer: await pngOf(second.page, "rgb(160, 90, 10)", 300, 500) },
  ]);
  await Promise.all([other.mutation(api.canvas.open, {}), other.mutation(api.canvas.open, {})]);
  const settled = await other.mutation(api.canvas.open, {});
  assert(
    settled.items.length === 2 &&
      new Set(settled.items.map((item) => item.refId)).size === 2 &&
      (await rows("canvasItems")).filter((row) => row.canvasId === own.canvasId).length === 2,
    `two opens at once place each new image once: ${settled.items.length} items at rev ${settled.rev}`,
  );
} finally {
  await first.browser.close();
  await second.browser.close();
}
