import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { Id } from "./_generated/id";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";
import { CollectionNotFound } from "./collection";
import { CurrentWorkspace } from "./middleware/RequireWorkspace.spec";

/** A missing collection and another workspace's fail alike, so the error does not tell them apart. */
export const ownedCollection = (collectionId: Id<"collections">) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const reader = yield* DatabaseReader;
    const found = yield* reader
      .table("collections")
      .get(collectionId)
      .pipe(Effect.mapError(() => new CollectionNotFound()));
    if (found.workspaceId !== workspaceId) {
      return yield* new CollectionNotFound();
    }
    return found;
  });

// A mutation is serializable, so reading the membership before the insert keeps a Ref in a
// collection at most once, even when two calls add it at the same moment.
export const addMember = (collectionId: Id<"collections">, refId: Id<"refs">) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const existing = yield* reader
      .table("collectionRefs")
      .index("by_collection_and_ref", (q) => q.eq("collectionId", collectionId).eq("refId", refId))
      .first();
    if (Option.isNone(existing)) {
      yield* writer.table("collectionRefs").insert({ workspaceId, collectionId, refId });
    }
  }).pipe(Effect.orDie);

/** The canvas of a set: the collection's, or the whole library's when `collectionId` is absent. */
export const canvasOf = (collectionId: Id<"collections"> | undefined) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const reader = yield* DatabaseReader;
    return yield* reader
      .table("canvases")
      .index("by_workspace_and_collection", (q) =>
        q.eq("workspaceId", workspaceId).eq("collectionId", collectionId),
      )
      .first();
  }).pipe(Effect.orDie);

/**
 * Takes Refs out of a collection. A collection's canvas shows only members, so each Ref's item on
 * that canvas is marked removed too, stamped with `canvas.rev`. The caller raises the canvas's rev
 * to it, once per call.
 */
export const leaveCollection = (
  collectionId: Id<"collections">,
  refIds: ReadonlyArray<Id<"refs">>,
  canvas: { readonly canvasId: Id<"canvases">; readonly rev: number } | undefined,
) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    yield* Effect.forEach(
      refIds,
      (refId) =>
        Effect.gen(function* () {
          const membership = yield* reader
            .table("collectionRefs")
            .index("by_collection_and_ref", (q) =>
              q.eq("collectionId", collectionId).eq("refId", refId),
            )
            .first();
          if (Option.isSome(membership)) {
            yield* writer.table("collectionRefs").delete(membership.value._id);
          }
          if (canvas === undefined) return;
          const item = yield* reader
            .table("canvasItems")
            .index("by_canvas_and_key", (q) => q.eq("canvasId", canvas.canvasId).eq("key", refId))
            .first();
          if (Option.isSome(item) && item.value.deletedAt === undefined) {
            yield* writer
              .table("canvasItems")
              .patch(item.value._id, { deletedAt: Date.now(), rev: canvas.rev });
          }
        }),
      { discard: true },
    );
  }).pipe(Effect.orDie);
