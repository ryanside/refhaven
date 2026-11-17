import * as Effect from "effect/Effect";
import type { RefsDoc } from "./_generated/docs";
import type { Id } from "./_generated/id";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";
import { RefNotFound } from "./library.spec";
import { CurrentWorkspace } from "./middleware/RequireWorkspace.spec";
import { searchTextOf } from "./searchText";

/** A Ref is live when it has no `deletedAt`, and in the trash otherwise. Every reader shows live Refs only. */
export const isLive = (ref: RefsDoc) => ref.deletedAt === undefined;

/** The workspace's live Refs, newest first. The index form of `isLive`. */
export const liveRefs = Effect.gen(function* () {
  const { workspaceId } = yield* CurrentWorkspace;
  const reader = yield* DatabaseReader;
  return reader
    .table("refs")
    .index(
      "by_workspace_and_deletedAt",
      (q) => q.eq("workspaceId", workspaceId).eq("deletedAt", undefined),
      "desc",
    );
});

/** A missing Ref and another workspace's fail alike, so the error does not tell them apart. */
export const ownedRef = (refId: Id<"refs">) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const reader = yield* DatabaseReader;
    const ref = yield* reader
      .table("refs")
      .get(refId)
      .pipe(Effect.mapError(() => new RefNotFound()));
    if (ref.workspaceId !== workspaceId) {
      return yield* new RefNotFound();
    }
    return ref;
  });

/** An owned Ref that is not in the trash. A Ref in the trash fails as a missing one does. */
export const ownedLiveRef = (refId: Id<"refs">) =>
  Effect.gen(function* () {
    const ref = yield* ownedRef(refId);
    if (!isLive(ref)) {
      return yield* new RefNotFound();
    }
    return ref;
  });

/**
 * Writes a Ref's `searchText` from its name, note, source, and tags as they stand in this
 * transaction. Every write that changes one of them calls it after the change.
 */
export const writeSearchText = (refId: Id<"refs">) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const ref = yield* reader.table("refs").get(refId);
    const tags = yield* reader
      .table("tags")
      .index("by_ref", (q) => q.eq("refId", refId))
      .collect();
    yield* writer.table("refs").patch(refId, {
      searchText: searchTextOf(
        ref,
        tags.map(({ name }) => name),
      ),
    });
  }).pipe(Effect.orDie);
