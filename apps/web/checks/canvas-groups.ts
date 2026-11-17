import { api } from "@refhaven/backend/api";
import type { Id } from "@refhaven/backend/id";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
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

type Listed = FunctionReturnType<typeof api.canvas.open>["items"][number];

const stamp = Date.now().toString(36);
const cards = (page: Page) => page.locator("[data-ref-id]");

const save = async (page: Page, names: ReadonlyArray<string>) => {
  const before = await cards(page).count();
  const outcomes = page.locator('[role="status"] li');
  const reported = await outcomes.count();
  await page.getByLabel("Add images").setInputFiles(
    await Promise.all(
      names.map(async (name, index) => ({
        name,
        mimeType: "image/png",
        buffer: await pngOf(page, `rgb(${40 + index * 50}, 90, 160)`, 300, 200),
      })),
    ),
  );
  await outcomes.nth(reported + names.length - 1).waitFor({ timeout: 60_000 });
  await cards(page)
    .nth(before + names.length - 1)
    .waitFor();
  return Promise.all(
    names.map(
      async (name) =>
        (await cards(page).filter({ hasText: name }).getAttribute("data-ref-id")) as Id<"refs">,
    ),
  );
};

const parentOf = (items: ReadonlyArray<Listed>, key: string) => {
  const item = items.find((candidate) => candidate.key === key);
  return item === undefined ? "absent" : item.kind === "group" ? "a group" : item.parent;
};
const groupsOf = (items: ReadonlyArray<Listed>) =>
  items.flatMap((item) => (item.kind === "group" ? [item.key] : [])).sort();

const first = await openPageWithPasskeyDevice();
const second = await openPageWithPasskeyDevice();
try {
  const { page } = first;
  await signInWithPasskey(page, `check-canvas-groups-a-${stamp}`);
  const [a, b, c] = (await save(page, ["a.png", "b.png", "c.png"])) as [
    Id<"refs">,
    Id<"refs">,
    Id<"refs">,
  ];
  const owner = await clientFor(page);
  const open = () => owner.mutation(api.canvas.open, {});
  const opened = await open();
  const { canvasId } = opened;
  const changesSince = (rev: number) => owner.query(api.canvas.changes, { canvasId, rev });
  const apply = (ops: FunctionArgs<typeof api.canvas.apply>["ops"]) =>
    owner.mutation(api.canvas.apply, { canvasId, ops });
  const itemRows = async () =>
    (await rows("canvasItems")).filter((row) => row.canvasId === canvasId);

  const grouped = await apply([
    { op: "addGroup", key: "g1" },
    { op: "patch", key: a, fields: { parent: "g1" } },
    { op: "patch", key: b, fields: { parent: "g1" } },
  ]);
  const afterGroup = await open();
  const sinceOpened = await changesSince(opened.rev);
  const group = afterGroup.items.find((item) => item.key === "g1");
  assert(
    grouped === opened.rev + 1 &&
      afterGroup.rev === grouped &&
      group?.kind === "group" &&
      Object.keys(group).sort().join() === "key,kind" &&
      parentOf(afterGroup.items, a) === "g1" &&
      parentOf(afterGroup.items, b) === "g1" &&
      parentOf(afterGroup.items, c) === undefined &&
      sinceOpened.rev === grouped &&
      sinceOpened.items.length === 3 &&
      groupsOf(sinceOpened.items).join() === "g1" &&
      parentOf(sinceOpened.items, a) === "g1" &&
      parentOf(sinceOpened.items, b) === "g1",
    `one call adds a group and puts two images in it at one new rev (${opened.rev} to ${grouped}), and open and changes return the group, with no place, and both parents: ${JSON.stringify(group)}`,
  );

  const removedMember = await apply([{ op: "remove", key: a }]);
  const afterMemberRemoved = await open();
  assert(
    groupsOf(afterMemberRemoved.items).join() === "g1" &&
      parentOf(afterMemberRemoved.items, a) === "absent" &&
      parentOf(afterMemberRemoved.items, b) === "g1" &&
      (await changesSince(grouped)).items.length === 1,
    `removing one member at rev ${removedMember} writes only it, and leaves the group and the other member's parent`,
  );

  const putBack = await owner.mutation(api.canvas.open, { placeRemoved: true });
  const afterPutBack = await open();
  await apply([{ op: "remove", key: a }]);
  assert(
    putBack.placed === 1 &&
      parentOf(putBack.items, a) === "g1" &&
      parentOf(afterPutBack.items, a) === "g1",
    "an open that puts a removed member back returns it with its parent, as the next open does",
  );

  await owner.mutation(api.library.remove, { refIds: [b] });
  const whileTrashed = await open();
  const bRow = (await itemRows()).find((row) => row.key === b);
  await owner.mutation(api.library.restore, { refIds: [b] });
  const restored = await open();
  assert(
    parentOf(whileTrashed.items, b) === "absent" &&
      bRow?.parent === "g1" &&
      bRow.deletedAt === undefined &&
      parentOf(restored.items, b) === "g1" &&
      groupsOf(restored.items).join() === "g1",
    "deleting a member's image to the trash hides its item and keeps its parent, and a restore puts it back in its group",
  );

  // The group is removed while one member is off the canvas and the other's image is in the trash.
  await owner.mutation(api.library.remove, { refIds: [b] });
  const beforeUngroup = (await open()).rev;
  const ungrouped = await apply([{ op: "remove", key: "g1" }]);
  const sinceUngroup = await changesSince(beforeUngroup);
  await owner.mutation(api.library.restore, { refIds: [b] });
  const afterUngroup = await open();
  const aRow = (await itemRows()).find((row) => row.key === a);
  assert(
    groupsOf(afterUngroup.items).length === 0 &&
      parentOf(afterUngroup.items, b) === "g1" &&
      sinceUngroup.rev === ungrouped &&
      sinceUngroup.items.length === 1 &&
      sinceUngroup.items[0]!.key === "g1" &&
      sinceUngroup.items[0]!.deletedAt !== undefined &&
      aRow?.deletedAt !== undefined &&
      aRow.parent === "g1",
    `removing a group at rev ${ungrouped} writes only the group, and each member keeps a parent that names no group on the canvas`,
  );

  const board = await owner.mutation(api.collections.create, { name: "Board" });
  await owner.mutation(api.collections.addRefs, { collectionId: board, refIds: [c] });
  const boardCanvas = await owner.mutation(api.canvas.open, { collectionId: board });
  await owner.mutation(api.canvas.apply, {
    canvasId: boardCanvas.canvasId,
    ops: [{ op: "addGroup", key: "board-group" }],
  });
  await apply([{ op: "addGroup", key: "g2" }]);
  const beforeRefusals = (await open()).rev;
  for (const [label, parent] of [
    ["a missing key", "nope"],
    ["an image's key", b],
    ["a group of another canvas", "board-group"],
  ] as const) {
    const refused = await outcome(
      apply([
        { op: "patch", key: b, fields: { x: 5 } },
        { op: "patch", key: c, fields: { parent: "g2" } },
        { op: "patch", key: c, fields: { parent } },
      ]),
    );
    assert(refused === "GroupNotFound", `a parent that names ${label} fails with ${refused}`);
  }
  assert(
    (await changesSince(beforeRefusals)).items.length === 0 &&
      (await open()).rev === beforeRefusals,
    "none of the refused parents, nor the valid patches beside each, was written, and rev stayed",
  );

  for (const [label, op] of [
    ["a place", { op: "addGroup", key: "g-placed", x: 0, y: 0 }],
    ["a Ref", { op: "addGroup", key: "g-ref", refId: a }],
    ["a parent", { op: "addGroup", key: "g-nested", parent: "g2" }],
  ] as const) {
    const refused = await outcome(apply([op as never]));
    assert(refused.startsWith("refused"), `a group with ${label} is ${refused}`);
  }
  const nested = await outcome(apply([{ op: "patch", key: "g2", fields: { parent: "g2" } }]));
  const placed = await outcome(apply([{ op: "patch", key: "g2", fields: { x: 1 } }]));
  assert(
    nested === "FieldNotOnItem" &&
      placed === "FieldNotOnItem" &&
      (await open()).rev === beforeRefusals &&
      (await itemRows()).every((row) => !String(row.key).startsWith("g-")),
    `a patch of a parent on a group fails with ${nested}, and of a place with ${placed}, and nothing was written`,
  );

  const linked = await apply([{ op: "patch", key: c, fields: { parent: "g1" } }]);
  const whileRemoved = await open();
  assert(
    whileRemoved.rev === linked &&
      parentOf(whileRemoved.items, c) === "g1" &&
      groupsOf(whileRemoved.items).join() === "g2",
    "a parent may name a removed group, which is how an undo gives an item back the parent it had",
  );

  const g1Row = async () => (await itemRows()).find((row) => row.key === "g1");
  const removedRow = await g1Row();
  const revived = await apply([{ op: "addGroup", key: "g1" }]);
  const revivedRow = await g1Row();
  const afterRevive = await open();
  assert(
    revivedRow?._id === removedRow?._id &&
      revivedRow?.deletedAt === undefined &&
      revivedRow?.rev === revived &&
      (await changesSince(linked)).items.length === 1 &&
      groupsOf(afterRevive.items).join() === "g1,g2" &&
      parentOf(afterRevive.items, b) === "g1" &&
      parentOf(afterRevive.items, c) === "g1",
    "adding a group under a removed group's key brings that row back and writes nothing else, and its members are in it again: the one whose image was in the trash when the group was removed too",
  );

  await owner.mutation(api.library.remove, { refIds: [b] });
  await apply([{ op: "remove", key: "g1" }]);
  await apply([{ op: "addGroup", key: "g1" }]);
  await owner.mutation(api.library.restore, { refIds: [b] });
  const afterHiddenUndo = await open();
  const beforeTaken = afterHiddenUndo.rev;
  assert(
    parentOf(afterHiddenUndo.items, b) === "g1" &&
      groupsOf(afterHiddenUndo.items).join() === "g1,g2",
    "a group removed and brought back while a member's image is in the trash has that member again after the restore",
  );
  for (const [label, key] of [
    ["a live group", "g1"],
    ["a live image", c],
  ] as const) {
    const taken = await outcome(apply([{ op: "addGroup", key }]));
    assert(taken === "KeyTaken", `a group under the key of ${label} fails with ${taken}`);
  }
  assert((await open()).rev === beforeTaken, "the refused groups wrote nothing");

  const [later] = (await save(page, ["later.png"])) as [Id<"refs">];
  const grown = await open();
  assert(
    grown.placed === 1 &&
      grown.items.some((item) => item.kind === "image" && item.refId === later) &&
      groupsOf(grown.items).join() === "g1,g2" &&
      grown.removed === 1,
    `open on a canvas with groups places a new image and counts the one removed image off it: placed ${grown.placed}, removed ${grown.removed}`,
  );

  await signInWithPasskey(second.page, `check-canvas-groups-b-${stamp}`);
  const other = await clientFor(second.page);
  const intrusions = [
    await outcome(
      other.mutation(api.canvas.apply, {
        canvasId,
        ops: [{ op: "addGroup", key: "intruder" }],
      }),
    ),
    await outcome(
      other.mutation(api.canvas.apply, {
        canvasId,
        ops: [{ op: "remove", key: "g1" }],
      }),
    ),
    await outcome(other.query(api.canvas.changes, { canvasId, rev: 0 })),
  ];
  assert(
    intrusions.every((result) => result === "CanvasNotFound") &&
      (await rows("canvasItems")).every((row) => row.key !== "intruder") &&
      groupsOf((await open()).items).join() === "g1,g2",
    `a second user gets CanvasNotFound when adding or removing a group on the first user's canvas, or reading its changes: ${intrusions.join(", ")}`,
  );
} finally {
  await first.browser.close();
  await second.browser.close();
}
