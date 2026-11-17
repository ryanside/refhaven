import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { Id } from "./_generated/id";
import databaseSchema from "./_generated/schema";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";
import RequireWorkspace from "./middleware/RequireWorkspace.impl";
import { CurrentWorkspace } from "./middleware/RequireWorkspace.spec";
import { ownedLiveRef, ownedRef, writeSearchText } from "./ref";
import ref from "./ref.spec";

const tagsOf = (refId: Id<"refs">) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader
      .table("tags")
      .index("by_ref", (q) => q.eq("refId", refId))
      .collect();
  }).pipe(Effect.orDie);

// A Ref in the trash answers too, because the trash page links to its page.
const get = FunctionImpl.make(databaseSchema, ref, "get", ({ refId }) =>
  Effect.gen(function* () {
    const found = yield* ownedRef(refId);
    const reader = yield* DatabaseReader;
    const blob = yield* reader.table("blobs").get(found.blobs.original).pipe(Effect.orDie);
    const memberships = yield* reader
      .table("collectionRefs")
      .index("by_ref", (q) => q.eq("refId", refId))
      .collect()
      .pipe(Effect.orDie);
    const collections = yield* Effect.forEach(memberships, ({ collectionId }) =>
      reader
        .table("collections")
        .get(collectionId)
        .pipe(
          Effect.orDie,
          Effect.map(({ name }) => ({ collectionId, name })),
        ),
    );
    return {
      fileName: found.fileName,
      note: found.note ?? null,
      sourceUrl: found.sourceUrl ?? null,
      tags: (yield* tagsOf(refId)).map(({ name }) => name),
      width: blob.width,
      height: blob.height,
      byteSize: blob.byteSize,
      mimeType: blob.mimeType,
      savedAt: found._creationTime,
      deletedAt: found.deletedAt ?? null,
      collections,
    };
  }),
);

// `null` clears a field, which a patch does by setting it to undefined. An absent key is left alone.
const update = FunctionImpl.make(
  databaseSchema,
  ref,
  "update",
  ({ refId, fileName, note, sourceUrl }) =>
    Effect.gen(function* () {
      yield* ownedLiveRef(refId);
      const writer = yield* DatabaseWriter;
      yield* writer
        .table("refs")
        .patch(refId, {
          ...(fileName === undefined ? {} : { fileName }),
          ...(note === undefined ? {} : { note: note ?? undefined }),
          ...(sourceUrl === undefined ? {} : { sourceUrl: sourceUrl ?? undefined }),
        })
        .pipe(Effect.orDie);
      yield* writeSearchText(refId);
      return null;
    }),
);

// A mutation is serializable, so reading the Ref's tags before the inserts keeps each tag on a
// Ref at most once, even when two calls add it at the same moment.
const addTags = FunctionImpl.make(databaseSchema, ref, "addTags", ({ refId, names }) =>
  Effect.gen(function* () {
    yield* ownedLiveRef(refId);
    const { workspaceId } = yield* CurrentWorkspace;
    const writer = yield* DatabaseWriter;
    const existing = new Set((yield* tagsOf(refId)).map(({ name }) => name));
    yield* Effect.forEach(
      Arr.dedupe(names).filter((name) => !existing.has(name)),
      (name) => writer.table("tags").insert({ workspaceId, refId, name }).pipe(Effect.orDie),
      { discard: true },
    );
    yield* writeSearchText(refId);
    return null;
  }),
);

const removeTags = FunctionImpl.make(databaseSchema, ref, "removeTags", ({ refId, names }) =>
  Effect.gen(function* () {
    yield* ownedLiveRef(refId);
    const writer = yield* DatabaseWriter;
    yield* Effect.forEach(
      (yield* tagsOf(refId)).filter(({ name }) => names.includes(name)),
      (tag) => writer.table("tags").delete(tag._id),
      { discard: true },
    );
    yield* writeSearchText(refId);
    return null;
  }),
);

// One range over every tag row of the workspace, sorted by name, so equal names sit together.
const tags = FunctionImpl.make(databaseSchema, ref, "tags", () =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const reader = yield* DatabaseReader;
    const rows = yield* reader
      .table("tags")
      .index("by_workspace_and_name", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    return Arr.dedupeAdjacent(rows.map(({ name }) => name));
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, ref).pipe(
  Layer.provide(get),
  Layer.provide(update),
  Layer.provide(addTags),
  Layer.provide(removeTags),
  Layer.provide(tags),
  Layer.provide(RequireWorkspace),
  GroupImpl.finalize,
);
