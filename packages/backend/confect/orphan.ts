import * as Effect from "effect/Effect";
import type { OrphansDoc } from "./_generated/docs";
import type { Id } from "./_generated/id";
import { DatabaseReader } from "./_generated/services";
import { type Sha256, originalKey, variantKey } from "./blob";

export const storedBlob = (workspaceId: Id<"workspaces">, sha256: Sha256) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader
      .table("blobs")
      .index("by_workspace_and_sha256", (q) =>
        q.eq("workspaceId", workspaceId).eq("sha256", sha256),
      )
      .first();
  }).pipe(Effect.orDie);

/** The upload of these bytes that no save has recorded yet. A workspace has at most one. */
export const pendingUpload = (workspaceId: Id<"workspaces">, sha256: Sha256) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader
      .table("pendingUploads")
      .index("by_workspace_and_sha256", (q) =>
        q.eq("workspaceId", workspaceId).eq("sha256", sha256),
      )
      .first();
  }).pipe(Effect.orDie);

export const orphanKeys = (orphan: OrphansDoc) => [
  originalKey(orphan),
  ...orphan.variants.map((role) => variantKey(orphan, role)),
];
