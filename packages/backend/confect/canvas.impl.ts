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
import canvas, { CanvasNotFound, ItemNotFound } from "./canvas.spec";
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

/** Opens or makes the canvas of a set, and places each Ref of the set that has no item. */
const openSet = (collectionId: Id<"collections"> | undefined) =>
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
    const shown = items.filter((item) => item.deletedAt === undefined && liveIds.has(item.refId));

    // On the library's canvas a removed item still counts as placed, so a Ref removed from it is
    // not placed again. On a collection's canvas removal means leaving the collection, so a member
    // with a removed item was added again, and its item comes back.
    const placedRefs = new Set(
      (collectionId === undefined ? items : shown).map((item) => item.refId),
    );
    const unplaced = live.filter((ref) => !placedRefs.has(ref._id));
    if (unplaced.length === 0) {
      return { canvasId, rev: openedRev, items: shown.map(toItem) };
    }

    const sizes = yield* Effect.forEach(unplaced, sizeOf);
    const rev = openedRev + 1;
    const added = Arr.zip(
      placeBeside(boundsOf(shown), sizes),
      zAbove(
        items.map((item) => item.z),
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
    return { canvasId, rev, items: [...shown.map(toItem), ...added] };
  }).pipe(Effect.orDie);

const open = FunctionImpl.make(databaseSchema, canvas, "open", ({ collectionId }) =>
  Effect.gen(function* () {
    if (collectionId !== undefined) {
      yield* ownedCollection(collectionId);
    }
    return yield* openSet(collectionId);
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
      reader
        .table("refs")
        .get(item.refId)
        .pipe(
          Effect.orDie,
          Effect.map((ref) => {
            const deletedAt = item.deletedAt ?? ref.deletedAt;
            return deletedAt === undefined ? toItem(item) : { ...toItem(item), deletedAt };
          }),
        ),
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

// A typed error is thrown as a ConvexError, so Convex rolls back every write of a failed call.
const apply = FunctionImpl.make(databaseSchema, canvas, "apply", ({ canvasId, ops }) =>
  Effect.gen(function* () {
    const found = yield* ownedCanvas(canvasId);
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const rev = found.rev + 1;
    yield* writer.table("canvases").patch(canvasId, { rev }).pipe(Effect.orDie);
    const adds = ops.flatMap((op, index) => (op.op === "add" ? [index] : []));
    const below =
      adds.length === 0
        ? []
        : [
            ...(yield* itemsOf(canvasId)).map((item) => item.z),
            ...ops.flatMap((op) =>
              op.op === "patch" && op.fields.z !== undefined ? [op.fields.z] : [],
            ),
          ];
    const addedZ = new Map(Arr.zip(adds, zAbove(below, adds.length)));
    yield* Effect.forEach(
      ops,
      (op, index) =>
        Effect.gen(function* () {
          if (op.op === "add") {
            return yield* place(found, rev, op, addedZ.get(index)!);
          }
          const item = yield* reader
            .table("canvasItems")
            .get("by_canvas_and_key", canvasId, op.key)
            .pipe(Effect.mapError(() => new ItemNotFound({ key: op.key })));
          const ref = yield* reader.table("refs").get(item.refId).pipe(Effect.orDie);
          if (item.deletedAt !== undefined || !isLive(ref)) {
            return yield* new ItemNotFound({ key: op.key });
          }
          if (op.op === "remove" && found.collectionId !== undefined) {
            return yield* leaveCollection(found.collectionId, [item.refId], { canvasId, rev });
          }
          yield* writer
            .table("canvasItems")
            .patch(
              item._id,
              op.op === "patch" ? { ...op.fields, rev } : { deletedAt: Date.now(), rev },
            )
            .pipe(Effect.orDie);
        }),
      { discard: true },
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
