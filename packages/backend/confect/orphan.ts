import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { OrphansDoc } from "./_generated/docs";
import type { Id } from "./_generated/id";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";
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

/** A save of bytes whose objects wait for the sweep takes them back, so the sweep leaves them. */
export const takeBack = (workspaceId: Id<"workspaces">, sha256: Sha256) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const orphan = yield* reader
      .table("orphans")
      .index("by_workspace_and_sha256", (q) =>
        q.eq("workspaceId", workspaceId).eq("sha256", sha256),
      )
      .first();
    if (Option.isSome(orphan)) {
      yield* writer.table("orphans").delete(orphan.value._id);
    }
  }).pipe(Effect.orDie);

export const orphanKeys = ({ workspaceId, sha256, variants }: OrphansDoc) => [
  originalKey(workspaceId, sha256),
  ...variants.map((role) => variantKey(workspaceId, sha256, role)),
];
