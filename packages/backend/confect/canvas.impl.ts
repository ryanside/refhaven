import { boundsOf, placeBeside, zAbove } from "@refhaven/scene";
import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { CanvasItemsDoc } from "./_generated/docs";
import type { Id } from "./_generated/id";
import databaseSchema from "./_generated/schema";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";
import canvas, { CanvasNotFound, ItemNotFound } from "./canvas.spec";
import { canvasOf, leaveCollection, ownedCollection } from "./membership";
import RequireWorkspace from "./middleware/RequireWorkspace.impl";
import { CurrentWorkspace } from "./middleware/RequireWorkspace.spec";

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
    const items = yield* reader
      .table("canvasItems")
      .index("by_canvas_and_key", (q) => q.eq("canvasId", canvasId))
      .collect();
    const shown = items.filter((item) => item.deletedAt === undefined);

    // On the library's canvas a removed item still counts as placed, so a Ref removed from it is
    // not placed again. On a collection's canvas removal means leaving the collection, so a member
    // with a removed item was added again, and its item comes back.
    const placedRefs = new Set(
      (collectionId === undefined ? items : shown).map((item) => item.refId),
    );
    const setRefIds =
      collectionId === undefined
        ? (yield* reader
            .table("refs")
            .index("by_workspace", (q) => q.eq("workspaceId", workspaceId))
            .collect()).map((ref) => ref._id)
        : (yield* reader
            .table("collectionRefs")
            .index("by_collection", (q) => q.eq("collectionId", collectionId))
            .collect()).map((member) => member.refId);
    const unplaced = setRefIds.filter((refId) => !placedRefs.has(refId));
    if (unplaced.length === 0) {
      return { canvasId, rev: openedRev, items: shown.map(toItem) };
    }

    const sizes = yield* Effect.forEach(unplaced, (refId) =>
      Effect.gen(function* () {
        const ref = yield* reader.table("refs").get(refId);
        const { width, height } = yield* reader.table("blobs").get(ref.blobs.original);
        return { refId, width, height };
      }),
    );
    const rev = openedRev + 1;
    const added = Arr.zip(
      placeBeside(boundsOf(shown), sizes),
      zAbove(
        items.map((item) => item.z),
        sizes.length,
      ),
    ).map(([placed, z]) => ({
      key: placed.refId,
      kind: "image" as const,
      ...placed,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      grayscale: false,
      z,
    }));
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

const changes = FunctionImpl.make(databaseSchema, canvas, "changes", ({ canvasId, rev }) =>
  Effect.gen(function* () {
    const found = yield* ownedCanvas(canvasId);
    const reader = yield* DatabaseReader;
    const items = yield* reader
      .table("canvasItems")
      .index("by_canvas_and_rev", (q) => q.eq("canvasId", canvasId).gt("rev", rev))
      .collect()
      .pipe(Effect.orDie);
    return { rev: found.rev, items: items.map(toItem) };
  }),
);

// A typed error is thrown as a ConvexError, so Convex rolls back every write of a failed call.
const apply = FunctionImpl.make(databaseSchema, canvas, "apply", ({ canvasId, ops }) =>
  Effect.gen(function* () {
    const found = yield* ownedCanvas(canvasId);
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const rev = found.rev + 1;
    yield* writer.table("canvases").patch(canvasId, { rev }).pipe(Effect.orDie);
    yield* Effect.forEach(
      ops,
      (op) =>
        Effect.gen(function* () {
          const item = yield* reader
            .table("canvasItems")
            .get("by_canvas_and_key", canvasId, op.key)
            .pipe(Effect.mapError(() => new ItemNotFound({ key: op.key })));
          if (item.deletedAt !== undefined) {
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
