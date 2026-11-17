import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import databaseSchema from "./_generated/schema";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";
import collections from "./collections.spec";
import { galleryItem } from "./library.impl";
import { RefNotFound } from "./library.spec";
import { addMember, ownedCollection } from "./membership";
import RequireWorkspace from "./middleware/RequireWorkspace.impl";
import { CurrentWorkspace } from "./middleware/RequireWorkspace.spec";

const create = FunctionImpl.make(databaseSchema, collections, "create", ({ name }) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const writer = yield* DatabaseWriter;
    return yield* writer.table("collections").insert({ workspaceId, name });
  }).pipe(Effect.orDie),
);

const list = FunctionImpl.make(databaseSchema, collections, "list", () =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const reader = yield* DatabaseReader;
    const found = yield* reader
      .table("collections")
      .index("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    return found.map(({ _id, name }) => ({ collectionId: _id, name }));
  }).pipe(Effect.orDie),
);

const rename = FunctionImpl.make(databaseSchema, collections, "rename", ({ collectionId, name }) =>
  Effect.gen(function* () {
    yield* ownedCollection(collectionId);
    const writer = yield* DatabaseWriter;
    yield* writer.table("collections").patch(collectionId, { name }).pipe(Effect.orDie);
    return null;
  }),
);

// A typed error is thrown as a ConvexError, so Convex rolls back every write of a failed call.
const addRefs = FunctionImpl.make(
  databaseSchema,
  collections,
  "addRefs",
  ({ collectionId, refIds }) =>
    Effect.gen(function* () {
      yield* ownedCollection(collectionId);
      const { workspaceId } = yield* CurrentWorkspace;
      const reader = yield* DatabaseReader;
      yield* Effect.forEach(
        refIds,
        (refId) =>
          Effect.gen(function* () {
            const ref = yield* reader
              .table("refs")
              .get(refId)
              .pipe(Effect.mapError(() => new RefNotFound()));
            if (ref.workspaceId !== workspaceId) {
              return yield* new RefNotFound();
            }
            yield* addMember(collectionId, refId);
          }),
        { discard: true },
      );
      return null;
    }),
);

const removeRefs = FunctionImpl.make(
  databaseSchema,
  collections,
  "removeRefs",
  ({ collectionId, refIds }) =>
    Effect.gen(function* () {
      yield* ownedCollection(collectionId);
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
              .first()
              .pipe(Effect.orDie);
            if (Option.isSome(membership)) {
              yield* writer.table("collectionRefs").delete(membership.value._id);
            }
          }),
        { discard: true },
      );
      return null;
    }),
);

const refs = FunctionImpl.make(
  databaseSchema,
  collections,
  "refs",
  ({ collectionId, paginationOpts }) =>
    Effect.gen(function* () {
      yield* ownedCollection(collectionId);
      const reader = yield* DatabaseReader;
      const result = yield* reader
        .table("collectionRefs")
        .index("by_collection", (q) => q.eq("collectionId", collectionId), "desc")
        .paginate(paginationOpts)
        .pipe(Effect.orDie);
      const page = yield* Effect.forEach(result.page, ({ refId }) =>
        reader.table("refs").get(refId).pipe(Effect.orDie, Effect.flatMap(galleryItem)),
      );
      return { ...result, page };
    }),
);

export default GroupImpl.make(databaseSchema, collections).pipe(
  Layer.provide(create),
  Layer.provide(list),
  Layer.provide(rename),
  Layer.provide(addRefs),
  Layer.provide(removeRefs),
  Layer.provide(refs),
  Layer.provide(RequireWorkspace),
  GroupImpl.finalize,
);
