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
