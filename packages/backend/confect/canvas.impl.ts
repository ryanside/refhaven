import {
  type Placement,
  type Size,
  boundsOf,
  placeBeside,
  placedScale,
  zAbove,
} from "@refhaven/scene";
import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { CanvasItemsDoc, CanvasesDoc, RefsDoc } from "./_generated/docs";
import type { Id } from "./_generated/id";
import databaseSchema from "./_generated/schema";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";
import canvas, {
  CanvasNotFound,
  FieldNotOnItem,
  GroupNotFound,
  ItemNotFound,
  KeyTaken,
  type Op,
} from "./canvas.spec";
import { patchable } from "./canvasItem";
import { addMember, canvasOf, leaveCollection, ownedCollection } from "./membership";
import RequireWorkspace from "./middleware/RequireWorkspace.impl";
import { CurrentWorkspace } from "./middleware/RequireWorkspace.spec";
import { isLive, liveRefs, ownedLiveRef } from "./ref";

const ownedCanvas = (canvasId: Id<"canvases">) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const reader = yield* DatabaseReader;
    const found = yield* reader
      .table("canvases")
      .get(canvasId)
      .pipe(Effect.mapError(() => new CanvasNotFound()));
    if (found.workspaceId !== workspaceId) {
      return yield* new CanvasNotFound();
    }
    return found;
  });

const toItem = ({ _id, _creationTime, workspaceId, canvasId, rev, ...item }: CanvasItemsDoc) =>
  item;

const itemsOf = (canvasId: Id<"canvases">) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader
      .table("canvasItems")
      .index("by_canvas_and_key", (q) => q.eq("canvasId", canvasId))
      .collect();
  }).pipe(Effect.orDie);

/** The items that have a place, which every kind but a group has. */
const placedOf = (items: ReadonlyArray<CanvasItemsDoc>) =>
  items.flatMap((item) => (item.kind === "group" ? [] : [item]));

/**
 * When the item went out of view with its Ref: the time its Ref went to the trash. A note and a
 * group have no Ref, so only their own `deletedAt` removes them.
 */
const trashedAt = (item: CanvasItemsDoc) =>
  item.kind !== "image"
    ? Effect.succeed(undefined)
    : Effect.gen(function* () {
        const reader = yield* DatabaseReader;
        return (yield* reader.table("refs").get(item.refId)).deletedAt;
      }).pipe(Effect.orDie);

const sizeOf = (ref: RefsDoc) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const { width, height } = yield* reader.table("blobs").get(ref.blobs.original);
    return { refId: ref._id, width, height };
  }).pipe(Effect.orDie);

/** A new item for a Ref. Its key is the Ref's ID, so a canvas holds at most one item per Ref. */
const imageItem = (placed: Size & Placement & { readonly refId: Id<"refs"> }, z: string) => ({
  key: placed.refId,
  kind: "image" as const,
  ...placed,
  rotation: 0,
  flipX: false,
  flipY: false,
  opacity: 1,
  grayscale: false,
  z,
});

/**
 * Opens or makes the canvas of a set, and places each Ref of the set that has no item. On the
 * library's canvas a Ref whose item was removed stays off it, unless `placeRemoved` asks for it,
 * and `removed` counts the Refs that stay off.
 */
const openSet = (collectionId: Id<"collections"> | undefined, placeRemoved: boolean) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const existing = Option.getOrUndefined(yield* canvasOf(collectionId));
    const { _id: canvasId, rev: openedRev } = existing ?? {
      _id: yield* writer
        .table("canvases")
        .insert(
          collectionId === undefined
            ? { workspaceId, rev: 0 }
            : { workspaceId, collectionId, rev: 0 },
        ),
      rev: 0,
    };
    const items = yield* itemsOf(canvasId);
    const live = (
      collectionId === undefined
        ? yield* (yield* liveRefs).collect()
        : yield* Effect.forEach(
            yield* reader
              .table("collectionRefs")
              .index("by_collection", (q) => q.eq("collectionId", collectionId))
              .collect(),
            (member) => reader.table("refs").get(member.refId),
          )
    ).filter(isLive);
    const liveIds = new Set(live.map((ref) => ref._id));
    const shown = items.filter(
      (item) => item.deletedAt === undefined && (item.kind !== "image" || liveIds.has(item.refId)),
    );
    const refsOf = (list: ReadonlyArray<CanvasItemsDoc>) =>
      new Set(list.flatMap((item) => (item.kind === "image" ? [item.refId] : [])));

    // On the library's canvas a removed item still counts as placed, so a Ref removed from it is
    // not placed again. On a collection's canvas removal means leaving the collection, so a member
    // with a removed item was added again, and its item comes back.
    const placedRefs = refsOf(collectionId === undefined && !placeRemoved ? items : shown);
    const shownRefs = refsOf(shown);
    const unplaced = live.filter((ref) => !placedRefs.has(ref._id));
    const removed = live.filter((ref) => !shownRefs.has(ref._id)).length - unplaced.length;
    if (unplaced.length === 0) {
      return { canvasId, rev: openedRev, items: shown.map(toItem), placed: 0, removed };
    }

    const sizes = yield* Effect.forEach(unplaced, sizeOf);
    const rev = openedRev + 1;
    const added = Arr.zip(
      placeBeside(boundsOf(placedOf(shown)), sizes),
      zAbove(
        placedOf(items).map((item) => item.z),
        sizes.length,
      ),
    ).map(([placed, z]) => imageItem(placed, z));
    const itemIdByKey = new Map(items.map((item) => [item.key, item._id]));
    yield* writer.table("canvases").patch(canvasId, { rev });
    yield* Effect.forEach(
      added,
      (item) => {
        const itemId = itemIdByKey.get(item.key);
        return itemId === undefined
          ? writer.table("canvasItems").insert({ workspaceId, canvasId, rev, ...item })
          : writer.table("canvasItems").patch(itemId, { ...item, rev, deletedAt: undefined });
      },
      { discard: true },
    );
    return {
      canvasId,
      rev,
      items: [...shown.map(toItem), ...added],
      placed: added.length,
      removed,
    };
  }).pipe(Effect.orDie);

const open = FunctionImpl.make(
  databaseSchema,
  canvas,
  "open",
  ({ collectionId, placeRemoved = false }) =>
    Effect.gen(function* () {
      if (collectionId !== undefined) {
        yield* ownedCollection(collectionId);
      }
      return yield* openSet(collectionId, placeRemoved);
    }),
);

// An item of a Ref in the trash goes out as removed, at the time of the delete. Trashing and
// restoring a Ref stamp its items, so the client hears of both.
const changes = FunctionImpl.make(databaseSchema, canvas, "changes", ({ canvasId, rev }) =>
  Effect.gen(function* () {
    const found = yield* ownedCanvas(canvasId);
    const reader = yield* DatabaseReader;
    const items = yield* reader
      .table("canvasItems")
      .index("by_canvas_and_rev", (q) => q.eq("canvasId", canvasId).gt("rev", rev))
      .collect()
      .pipe(Effect.orDie);
    const shown = yield* Effect.forEach(items, (item) =>
      Effect.map(trashedAt(item), (trashed) => {
        const deletedAt = item.deletedAt ?? trashed;
        return deletedAt === undefined ? toItem(item) : { ...toItem(item), deletedAt };
      }),
    );
    return { rev: found.rev, items: shown };
  }),
);

/**
 * Puts a Ref on a canvas at a point and on top: inserts its item, brings a removed one back, or
 * moves a live one. On a collection's canvas the Ref also joins the collection, because that
 * canvas shows only members.
 */
const place = (
  found: CanvasesDoc,
  rev: number,
  { refId, x, y }: { readonly refId: Id<"refs">; readonly x: number; readonly y: number },
  z: string,
) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const ref = yield* ownedLiveRef(refId);
    if (found.collectionId !== undefined) {
      yield* addMember(found.collectionId, refId);
    }
    const existing = yield* reader
      .table("canvasItems")
      .index("by_canvas_and_key", (q) => q.eq("canvasId", found._id).eq("key", refId))
      .first()
      .pipe(Effect.orDie);
    if (Option.isSome(existing)) {
      return yield* writer
        .table("canvasItems")
        .patch(existing.value._id, { x, y, z, rev, deletedAt: undefined })
        .pipe(Effect.orDie);
    }
    const size = yield* sizeOf(ref);
    yield* writer
      .table("canvasItems")
      .insert({
        workspaceId,
        canvasId: found._id,
        rev,
        ...imageItem({ ...size, x, y, scale: placedScale(size) }, z),
      })
      .pipe(Effect.orDie);
  });

/**
 * The removed row of `kind` under a key the client made, to bring back, or none when the key is
 * free. Any other row under the key fails the call.
 */
const removedUnder = (found: CanvasesDoc, key: string, kind: "note" | "group") =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const existing = yield* reader
      .table("canvasItems")
      .index("by_canvas_and_key", (q) => q.eq("canvasId", found._id).eq("key", key))
      .first()
      .pipe(Effect.orDie);
    if (
      Option.isSome(existing) &&
      (existing.value.kind !== kind || existing.value.deletedAt === undefined)
    ) {
      return yield* new KeyTaken({ key });
    }
    return Option.map(existing, (row) => row._id);
  });

/**
 * Puts a note on a canvas under the key the client made: inserts it, or brings back the removed
 * note under that key with the values the op names.
 */
const putNote = (
  found: CanvasesDoc,
  rev: number,
  { op, key, ...note }: Extract<typeof Op.Type, { readonly op: "addNote" }>,
  z: string,
) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const writer = yield* DatabaseWriter;
    const removed = yield* removedUnder(found, key, "note");
    if (Option.isSome(removed)) {
      return yield* writer
        .table("canvasItems")
        .patch(removed.value, { ...note, z, rev, deletedAt: undefined })
        .pipe(Effect.orDie);
    }
    yield* writer
      .table("canvasItems")
      .insert({
        workspaceId,
        canvasId: found._id,
        rev,
        key,
        kind: "note",
        ...note,
        flipX: false,
        flipY: false,
        opacity: 1,
        grayscale: false,
        z,
      })
      .pipe(Effect.orDie);
  });

/** Puts a group on a canvas under the key the client made, or brings back the removed one. */
const putGroup = (found: CanvasesDoc, rev: number, key: string) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const writer = yield* DatabaseWriter;
    const removed = yield* removedUnder(found, key, "group");
    yield* (
      Option.isSome(removed)
        ? writer.table("canvasItems").patch(removed.value, { rev, deletedAt: undefined })
        : writer
            .table("canvasItems")
            .insert({ workspaceId, canvasId: found._id, rev, key, kind: "group" })
    ).pipe(Effect.orDie);
  });

/**
 * Removes a group and takes every item out of it, removed items too, so none comes back into a
 * group that is gone. Its members stay on the canvas.
 */
const removeGroup = (group: CanvasItemsDoc, rev: number) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    yield* writer.table("canvasItems").patch(group._id, { deletedAt: Date.now(), rev });
    const members = yield* reader
      .table("canvasItems")
      .index("by_canvas_and_parent", (q) =>
        q.eq("canvasId", group.canvasId).eq("parent", group.key),
      )
      .collect();
    yield* Effect.forEach(
      members,
      (member) => writer.table("canvasItems").patch(member._id, { parent: undefined, rev }),
      { discard: true },
    );
  }).pipe(Effect.orDie);

/** Fails unless each key names a live group of the canvas. */
const liveGroups = (canvasId: Id<"canvases">, keys: ReadonlySet<string>) =>
  Effect.forEach(
    keys,
    (key) =>
      Effect.gen(function* () {
        const reader = yield* DatabaseReader;
        const group = yield* reader
          .table("canvasItems")
          .index("by_canvas_and_key", (q) => q.eq("canvasId", canvasId).eq("key", key))
          .first()
          .pipe(Effect.orDie);
        if (
          Option.isNone(group) ||
          group.value.kind !== "group" ||
          group.value.deletedAt !== undefined
        ) {
          return yield* new GroupNotFound({ key });
        }
      }),
    { discard: true },
  );

// A typed error is thrown as a ConvexError, so Convex rolls back every write of a failed call.
const apply = FunctionImpl.make(databaseSchema, canvas, "apply", ({ canvasId, ops }) =>
  Effect.gen(function* () {
    const found = yield* ownedCanvas(canvasId);
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const rev = found.rev + 1;
    yield* writer.table("canvases").patch(canvasId, { rev }).pipe(Effect.orDie);
    // An add with no z goes above every item, and above every z that this call writes.
    const zOf = (op: (typeof ops)[number]) =>
      op.op === "patch" ? op.fields.z : op.op === "add" || op.op === "addNote" ? op.z : undefined;
    const adds = ops.flatMap((op, index) =>
      (op.op === "add" || op.op === "addNote") && op.z === undefined ? [index] : [],
    );
    const below =
      adds.length === 0
        ? []
        : [
            ...placedOf(yield* itemsOf(canvasId)).map((item) => item.z),
            ...ops.flatMap((op) => zOf(op) ?? []),
          ];
    const addedZ = new Map(Arr.zip(adds, zAbove(below, adds.length)));
    yield* Effect.forEach(
      ops,
      (op, index) =>
        Effect.gen(function* () {
          if (op.op === "add") {
            return yield* place(found, rev, op, op.z ?? addedZ.get(index)!);
          }
          if (op.op === "addNote") {
            return yield* putNote(found, rev, op, op.z ?? addedZ.get(index)!);
          }
          if (op.op === "addGroup") {
            return yield* putGroup(found, rev, op.key);
          }
          const item = yield* reader
            .table("canvasItems")
            .get("by_canvas_and_key", canvasId, op.key)
            .pipe(Effect.mapError(() => new ItemNotFound({ key: op.key })));
          if (item.deletedAt !== undefined || (yield* trashedAt(item)) !== undefined) {
            return yield* new ItemNotFound({ key: op.key });
          }
          if (op.op === "remove") {
            if (item.kind === "group") {
              return yield* removeGroup(item, rev);
            }
            if (item.kind === "image" && found.collectionId !== undefined) {
              return yield* leaveCollection(found.collectionId, [item.refId], { canvasId, rev });
            }
            return yield* writer
              .table("canvasItems")
              .patch(item._id, { deletedAt: Date.now(), rev })
              .pipe(Effect.orDie);
          }
          const field = Object.keys(op.fields).find((name) => !patchable[item.kind].has(name));
          if (field !== undefined) {
            return yield* new FieldNotOnItem({ key: op.key, field });
          }
          const { parent, ...fields } = op.fields;
          yield* writer
            .table("canvasItems")
            .patch(
              item._id,
              parent === undefined
                ? { ...fields, rev }
                : { ...fields, parent: parent ?? undefined, rev },
            )
            .pipe(Effect.orDie);
        }),
      { discard: true },
    );
    // Checked after every op, so one call can add a group and put items in it.
    yield* liveGroups(
      canvasId,
      new Set(
        ops.flatMap((op) => (op.op === "patch" && op.fields.parent ? [op.fields.parent] : [])),
      ),
    );
    return rev;
  }),
);

export default GroupImpl.make(databaseSchema, canvas).pipe(
  Layer.provide(open),
  Layer.provide(changes),
  Layer.provide(apply),
  Layer.provide(RequireWorkspace),
  GroupImpl.finalize,
);
