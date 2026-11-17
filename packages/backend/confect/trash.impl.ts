import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { RefsDoc } from "./_generated/docs";
import refs from "./_generated/refs";
import databaseSchema from "./_generated/schema";
import { DatabaseReader, DatabaseWriter, MutationRunner } from "./_generated/services";
import { variantRoles } from "./blob";
import { orphanKeys, storedBlob } from "./orphan";
import { deleteObject } from "./r2";
import { sweepMs, trashMs } from "./trash";
import trash from "./trash.spec";

const batchSize = 50;

/**
 * Deletes a Ref and every row that points at it. Its canvas items go as rows, with no new rev:
 * every canvas heard that they were removed when the Ref went to the trash. When no other Ref
 * points at its Blob, the Blob row goes too, and an orphan row keeps its objects for the sweep.
 */
const purgeRef = (ref: RefsDoc, now: number) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const tags = yield* reader
      .table("tags")
      .index("by_ref", (q) => q.eq("refId", ref._id))
      .collect();
    yield* Effect.forEach(tags, ({ _id }) => writer.table("tags").delete(_id), { discard: true });
    const memberships = yield* reader
      .table("collectionRefs")
      .index("by_ref", (q) => q.eq("refId", ref._id))
      .collect();
    yield* Effect.forEach(memberships, ({ _id }) => writer.table("collectionRefs").delete(_id), {
      discard: true,
    });
    const items = yield* reader
      .table("canvasItems")
      .index("by_ref", (q) => q.eq("refId", ref._id))
      .collect();
    yield* Effect.forEach(items, ({ _id }) => writer.table("canvasItems").delete(_id), {
      discard: true,
    });
    yield* writer.table("refs").delete(ref._id);

    const shared = yield* reader
      .table("refs")
      .index("by_blob", (q) => q.eq("blobs.original", ref.blobs.original))
      .first();
    if (Option.isSome(shared)) return;
    const blob = yield* reader.table("blobs").get(ref.blobs.original);
    yield* writer.table("blobs").delete(blob._id);
    yield* writer.table("orphans").insert({
      workspaceId: blob.workspaceId,
      sha256: blob.sha256,
      variants: variantRoles.filter((role) => blob.variants?.[role]),
      orphanedAt: now,
    });
  }).pipe(Effect.orDie);

const purgeBatch = FunctionImpl.make(databaseSchema, trash, "purgeBatch", ({ pretend }) =>
  Effect.gen(function* () {
    const now = pretend?.now ?? Date.now();
    const reader = yield* DatabaseReader;
    const expired = pretend
      ? yield* reader
          .table("refs")
          .index("by_workspace_and_deletedAt", (q) =>
            q
              .eq("workspaceId", pretend.workspaceId)
              .gt("deletedAt", undefined)
              .lt("deletedAt", now - trashMs),
          )
          .take(batchSize)
      : yield* reader
          .table("refs")
          .index("by_deletedAt", (q) => q.gt("deletedAt", undefined).lt("deletedAt", now - trashMs))
          .take(batchSize);
    yield* Effect.forEach(expired, (ref) => purgeRef(ref, now), { discard: true });
    return expired.length;
  }).pipe(Effect.orDie),
);

const purge = FunctionImpl.make(databaseSchema, trash, "purge", (args) =>
  Effect.gen(function* () {
    const { runMutation } = yield* MutationRunner;
    let purged = 0;
    for (;;) {
      const batch = yield* runMutation(refs.internal.trash.purgeBatch, args);
      purged += batch;
      if (batch < batchSize) return purged;
    }
  }).pipe(Effect.orDie),
);

/**
 * Deletes the orphan rows a week old and returns their objects' keys. A Blob row of the same
 * bytes means a save took the objects back, so that row's keys are not returned.
 */
const sweepBatch = FunctionImpl.make(databaseSchema, trash, "sweepBatch", ({ pretend }) =>
  Effect.gen(function* () {
    const now = pretend?.now ?? Date.now();
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const due = pretend
      ? yield* reader
          .table("orphans")
          .index("by_workspace_and_orphanedAt", (q) =>
            q.eq("workspaceId", pretend.workspaceId).lt("orphanedAt", now - sweepMs),
          )
          .take(batchSize)
      : yield* reader
          .table("orphans")
          .index("by_orphanedAt", (q) => q.lt("orphanedAt", now - sweepMs))
          .take(batchSize);
    const keys = yield* Effect.forEach(due, (orphan) =>
      Effect.gen(function* () {
        yield* writer.table("orphans").delete(orphan._id);
        const stored = yield* storedBlob(orphan.workspaceId, orphan.sha256);
        return Option.isSome(stored) ? [] : orphanKeys(orphan);
      }),
    );
    return { swept: due.length, keys: keys.flat() };
  }).pipe(Effect.orDie),
);

// The objects are deleted only after the mutation that let them go has committed.
const sweep = FunctionImpl.make(databaseSchema, trash, "sweep", (args) =>
  Effect.gen(function* () {
    const { runMutation } = yield* MutationRunner;
    let swept = 0;
    let deleted = 0;
    for (;;) {
      const batch = yield* runMutation(refs.internal.trash.sweepBatch, args);
      yield* Effect.forEach(batch.keys, (key) => Effect.promise(() => deleteObject(key)), {
        discard: true,
      });
      swept += batch.swept;
      deleted += batch.keys.length;
      if (batch.swept < batchSize) return { swept, deleted };
    }
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, trash).pipe(
  Layer.provide(purgeBatch),
  Layer.provide(purge),
  Layer.provide(sweepBatch),
  Layer.provide(sweep),
  GroupImpl.finalize,
);
