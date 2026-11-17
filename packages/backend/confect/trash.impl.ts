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
import { sweepLockMs, sweepMs, trashMs } from "./trash";
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
 * Begins the sweep of the orphan rows a week old: sets `sweepingAt` on each and returns its
 * objects' keys. From then on no save of those bytes goes on, until `sweepDone` deletes the row.
 * A row that another sweep set less than `sweepLockMs` ago is left to that sweep. `more` says
 * whether to ask again.
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
    const mine = due.filter(
      ({ sweepingAt }) => sweepingAt === undefined || now - sweepingAt >= sweepLockMs,
    );
    const sweeping = yield* Effect.forEach(mine, (orphan) =>
      Effect.gen(function* () {
        // `record` deletes the orphan row when it inserts a Blob row, so the two never coexist.
        // Read again all the same, because a wrong delete here cannot be undone.
        if (Option.isSome(yield* storedBlob(orphan.workspaceId, orphan.sha256))) {
          yield* writer.table("orphans").delete(orphan._id);
          return [];
        }
        yield* writer.table("orphans").patch(orphan._id, { sweepingAt: now });
        return [{ orphanId: orphan._id, keys: orphanKeys(orphan) }];
      }),
    );
    return { sweeping: sweeping.flat(), more: due.length === batchSize && mine.length > 0 };
  }).pipe(Effect.orDie),
);

const sweepDone = FunctionImpl.make(databaseSchema, trash, "sweepDone", ({ orphanIds }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    yield* Effect.forEach(orphanIds, (orphanId) => writer.table("orphans").delete(orphanId), {
      discard: true,
    });
    return null;
  }).pipe(Effect.orDie),
);

// Each batch's objects are deleted between the mutation that sets `sweepingAt` on its rows and
// the one that deletes them, so a save never records bytes that this is deleting. A delete of an
// object that is already gone succeeds, so a sweep that died halfway is finished by a later one.
const sweep = FunctionImpl.make(databaseSchema, trash, "sweep", (args) =>
  Effect.gen(function* () {
    const { runMutation } = yield* MutationRunner;
    let swept = 0;
    let deleted = 0;
    for (;;) {
      const batch = yield* runMutation(refs.internal.trash.sweepBatch, args);
      const keys = batch.sweeping.flatMap((orphan) => orphan.keys);
      yield* Effect.forEach(keys, (key) => Effect.promise(() => deleteObject(key)), {
        discard: true,
      });
      yield* runMutation(refs.internal.trash.sweepDone, {
        orphanIds: batch.sweeping.map(({ orphanId }) => orphanId),
      });
      swept += batch.sweeping.length;
      deleted += keys.length;
      if (!batch.more) return { swept, deleted };
    }
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, trash).pipe(
  Layer.provide(purgeBatch),
  Layer.provide(purge),
  Layer.provide(sweepBatch),
  Layer.provide(sweepDone),
  Layer.provide(sweep),
  GroupImpl.finalize,
);
