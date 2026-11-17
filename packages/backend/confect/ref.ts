import * as Effect from "effect/Effect";
import type { RefsDoc } from "./_generated/docs";
import type { Id } from "./_generated/id";
import { DatabaseReader } from "./_generated/services";
import { RefNotFound } from "./library.spec";
import { CurrentWorkspace } from "./middleware/RequireWorkspace.spec";

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
