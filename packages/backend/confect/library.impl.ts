import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { RefsDoc } from "./_generated/docs";
import type { Id } from "./_generated/id";
import refs from "./_generated/refs";
import databaseSchema from "./_generated/schema";
import { DatabaseReader, DatabaseWriter, MutationRunner } from "./_generated/services";
import {
  type Sha256,
  maxImageBytes,
  originalKey,
  servedKey,
  signedUrlSeconds,
  sniffImageType,
  sniffedBytes,
  variantKey,
  variantRoles,
} from "./blob";
import library, { ImageTooLarge, UnsupportedImage, UploadNotFound } from "./library.spec";
import { addMember, ownedCollection } from "./membership";
import RequireWorkspace from "./middleware/RequireWorkspace.impl";
import { CurrentWorkspace } from "./middleware/RequireWorkspace.spec";
import { hashBoundUpload, r2 } from "./r2";
import { holdsEveryWord } from "./searchText";
import { isLive, liveRefs, ownedRef, writeSearchText } from "./ref";

const storedBlob = (workspaceId: Id<"workspaces">, sha256: Sha256) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader
      .table("blobs")
      .index("by_workspace_and_sha256", (q) =>
        q.eq("workspaceId", workspaceId).eq("sha256", sha256),
      )
      .first();
  }).pipe(Effect.orDie);

// A variant is not bound to a hash. The browser makes it, so the server has no hash to hold it to.
const variantUpload = (key: string) =>
  Effect.promise(() => r2.generateUploadUrl(key)).pipe(
    Effect.map(({ url }) => ({ url, headers: {} })),
  );

const prepareUpload = FunctionImpl.make(
  databaseSchema,
  library,
  "prepareUpload",
  ({ sha256, roles }) =>
    Effect.gen(function* () {
      const { workspaceId } = yield* CurrentWorkspace;
      const stored = Option.getOrUndefined(yield* storedBlob(workspaceId, sha256));
      const original = stored
        ? []
        : [
            {
              role: "original" as const,
              ...(yield* Effect.promise(() =>
                hashBoundUpload(originalKey(workspaceId, sha256), sha256),
              )),
            },
          ];
      const variants = yield* Effect.forEach(
        variantRoles.filter((role) => roles.includes(role) && !stored?.variants?.[role]),
        (role) =>
          variantUpload(variantKey(workspaceId, sha256, role)).pipe(
            Effect.map((upload) => ({ role, ...upload })),
          ),
      );
      return [...original, ...variants];
    }),
);

/** Reads the size and the real type of an uploaded object from R2 with one ranged request. */
const inspectUpload = (key: string) =>
  Effect.gen(function* () {
    const url = yield* Effect.promise(() => r2.getUrl(key, { expiresIn: 60 }));
    const response = yield* Effect.promise(() =>
      fetch(url, { headers: { Range: `bytes=0-${sniffedBytes - 1}` } }),
    );
    if (response.status === 404) {
      return yield* new UploadNotFound();
    }
    // R2 answers 416 to a ranged request for an empty object.
    if (response.status === 416) {
      return yield* new UnsupportedImage();
    }
    const byteSize = Number(response.headers.get("content-range")?.split("/")[1]);
    if (response.status !== 206 || !Number.isInteger(byteSize)) {
      return yield* Effect.die(
        new Error(`R2 answered ${response.status} to the ranged request for an upload`),
      );
    }
    const mimeType = sniffImageType(
      new Uint8Array(yield* Effect.promise(() => response.arrayBuffer())),
    );
    if (mimeType === null) {
      return yield* new UnsupportedImage();
    }
    if (byteSize > maxImageBytes) {
      return yield* new ImageTooLarge({ maxBytes: maxImageBytes });
    }
    return { byteSize, mimeType };
  });

const save = FunctionImpl.make(databaseSchema, library, "save", ({ variants, ...image }) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const stored = yield* inspectUpload(originalKey(workspaceId, image.sha256));
    const storedVariants = yield* Effect.forEach(
      variantRoles.flatMap((role) => {
        const size = variants[role];
        return size ? [{ role, size }] : [];
      }),
      ({ role, size }) =>
        Effect.gen(function* () {
          const { byteSize, mimeType } = yield* inspectUpload(
            variantKey(workspaceId, image.sha256, role),
          );
          if (mimeType !== "image/webp") {
            return yield* new UnsupportedImage();
          }
          return [role, { byteSize, ...size }] as const;
        }),
    );
    const { runMutation } = yield* MutationRunner;
    return yield* runMutation(refs.internal.library.record, {
      ...image,
      ...stored,
      variants: Object.fromEntries(storedVariants),
    }).pipe(Effect.catchTags({ NotSignedIn: Effect.die, SchemaError: Effect.die }));
  }),
);

const record = FunctionImpl.make(
  databaseSchema,
  library,
  "record",
  ({ sha256, fileName, width, height, byteSize, mimeType, thumbHash, variants, collectionId }) =>
    Effect.gen(function* () {
      if (collectionId !== undefined) {
        yield* ownedCollection(collectionId);
      }
      const { workspaceId } = yield* CurrentWorkspace;
      const writer = yield* DatabaseWriter;
      const existing = Option.getOrUndefined(yield* storedBlob(workspaceId, sha256));
      const blobId = existing
        ? existing._id
        : yield* writer
            .table("blobs")
            .insert({
              workspaceId,
              sha256,
              byteSize,
              mimeType,
              width,
              height,
              thumbHash,
              variants,
            })
            .pipe(Effect.orDie);
      if (
        existing &&
        (existing.thumbHash === undefined ||
          variantRoles.some((role) => variants[role] && !existing.variants?.[role]))
      ) {
        yield* writer
          .table("blobs")
          .patch(existing._id, {
            thumbHash: existing.thumbHash ?? thumbHash,
            variants: { ...variants, ...existing.variants },
          })
          .pipe(Effect.orDie);
      }
      const refId = yield* writer
        .table("refs")
        .insert({ workspaceId, blobs: { original: blobId }, fileName })
        .pipe(Effect.orDie);
      yield* writeSearchText(refId);
      if (collectionId !== undefined) {
        yield* addMember(collectionId, refId);
      }
      return { refId, duplicate: existing !== undefined };
    }),
);

export const galleryItem = (ref: RefsDoc) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const blob = yield* reader.table("blobs").get(ref.blobs.original);
    return {
      refId: ref._id,
      fileName: ref.fileName,
      width: blob.width,
      height: blob.height,
      thumbHash: blob.thumbHash ?? null,
      savedAt: ref._creationTime,
    };
  }).pipe(Effect.orDie);

const list = FunctionImpl.make(databaseSchema, library, "list", ({ paginationOpts }) =>
  Effect.gen(function* () {
    const result = yield* (yield* liveRefs).paginate(paginationOpts);
    return { ...result, page: yield* Effect.forEach(result.page, galleryItem) };
  }).pipe(Effect.orDie),
);

/** The most images a filtered gallery shows. */
const filterLimit = 200;

// A search reads at most 1,024 results, so every kind of filter reads at most that many Refs.
const scanLimit = 1024;

const memberIds = (collectionId: Id<"collections">) =>
  Effect.gen(function* () {
    yield* ownedCollection(collectionId);
    const reader = yield* DatabaseReader;
    const memberships = yield* reader
      .table("collectionRefs")
      .index("by_collection", (q) => q.eq("collectionId", collectionId))
      .collect()
      .pipe(Effect.orDie);
    return new Set(memberships.map(({ refId }) => refId));
  });

/**
 * Reads the Refs to check: the search results in relevance order when there is a search text,
 * else the Refs of the tag, newest tagged first, else the whole library, newest first. Then keeps
 * the live ones that hold every word of the search, carry the tag, and sit in the collection.
 */
const filter = FunctionImpl.make(databaseSchema, library, "filter", ({ q, tag, collectionId }) =>
  Effect.gen(function* () {
    const members = collectionId === undefined ? undefined : yield* memberIds(collectionId);
    const { workspaceId } = yield* CurrentWorkspace;
    const reader = yield* DatabaseReader;
    const tagged =
      tag === undefined
        ? undefined
        : yield* reader
            .table("tags")
            .index(
              "by_workspace_and_name",
              (range) => range.eq("workspaceId", workspaceId).eq("name", tag),
              "desc",
            )
            .collect()
            .pipe(Effect.orDie);
    const scanned =
      q !== undefined
        ? yield* reader
            .table("refs")
            .search("search_text", (search) =>
              search
                .search("searchText", q)
                .eq("workspaceId", workspaceId)
                .eq("deletedAt", undefined),
            )
            .take(scanLimit)
            .pipe(Effect.orDie)
        : tagged !== undefined
          ? yield* Effect.forEach(tagged.slice(0, scanLimit), ({ refId }) =>
              reader.table("refs").get(refId).pipe(Effect.orDie),
            )
          : yield* (yield* liveRefs).take(scanLimit).pipe(Effect.orDie);
    const taggedIds = tagged && new Set(tagged.map(({ refId }) => refId));
    const matches = scanned.filter(
      (ref) =>
        isLive(ref) &&
        (q === undefined || holdsEveryWord(ref.searchText ?? "", q)) &&
        (taggedIds?.has(ref._id) ?? true) &&
        (members?.has(ref._id) ?? true),
    );
    return {
      items: yield* Effect.forEach(matches.slice(0, filterLimit), galleryItem),
      more: matches.length > filterLimit || scanned.length === scanLimit,
    };
  }),
);

const trash = FunctionImpl.make(databaseSchema, library, "trash", ({ paginationOpts }) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const reader = yield* DatabaseReader;
    const result = yield* reader
      .table("refs")
      .index(
        "by_workspace_and_deletedAt",
        (q) => q.eq("workspaceId", workspaceId).gt("deletedAt", undefined),
        "desc",
      )
      .paginate(paginationOpts);
    const page = yield* Effect.forEach(result.page, (ref) =>
      galleryItem(ref).pipe(Effect.map((item) => ({ ...item, deletedAt: ref.deletedAt! }))),
    );
    return { ...result, page };
  }).pipe(Effect.orDie),
);

// A mutation, not a query. Convex caches a query's result, so a query would keep handing out
// the same signed URL after it expired. A Ref in the trash is signed too, for the trash page.
const urls = FunctionImpl.make(databaseSchema, library, "urls", ({ refIds, role }) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const reader = yield* DatabaseReader;
    return yield* Effect.forEach(refIds, (refId) =>
      Effect.gen(function* () {
        const ref = yield* ownedRef(refId);
        const blob = yield* reader.table("blobs").get(ref.blobs.original).pipe(Effect.orDie);
        const url = yield* Effect.promise(() =>
          r2.getUrl(servedKey(workspaceId, blob, role), { expiresIn: signedUrlSeconds }),
        );
        return { refId, url };
      }),
    );
  }),
);

/**
 * Moves Refs into the trash, or out of it when `deletedAt` is undefined. A Ref already there is
 * left alone. Canvases learn of it from `canvas.changes`, so each shown item of a moved Ref is
 * stamped with a new rev of its canvas, raised once per canvas.
 */
const setTrashed = (refIds: ReadonlyArray<Id<"refs">>, deletedAt: number | undefined) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const moving = (yield* Effect.forEach(Arr.dedupe(refIds), ownedRef)).filter(
      (ref) => isLive(ref) === (deletedAt !== undefined),
    );
    yield* Effect.forEach(
      moving,
      (ref) => writer.table("refs").patch(ref._id, { deletedAt }).pipe(Effect.orDie),
      { discard: true },
    );
    const items = yield* Effect.forEach(moving, (ref) =>
      reader
        .table("canvasItems")
        .index("by_ref", (q) => q.eq("refId", ref._id))
        .collect()
        .pipe(Effect.orDie),
    );
    const byCanvas = Arr.groupBy(
      items.flat().filter((item) => item.deletedAt === undefined),
      (item) => item.canvasId,
    );
    yield* Effect.forEach(
      Object.values(byCanvas),
      (canvasItems) =>
        Effect.gen(function* () {
          const canvasId = canvasItems[0].canvasId;
          const { rev } = yield* reader.table("canvases").get(canvasId);
          yield* writer.table("canvases").patch(canvasId, { rev: rev + 1 });
          yield* Effect.forEach(
            canvasItems,
            (item) => writer.table("canvasItems").patch(item._id, { rev: rev + 1 }),
            { discard: true },
          );
        }).pipe(Effect.orDie),
      { discard: true },
    );
    return null;
  });

// A typed error is thrown as a ConvexError, so Convex rolls back every write of a failed call.
const remove = FunctionImpl.make(databaseSchema, library, "remove", ({ refIds }) =>
  setTrashed(refIds, Date.now()),
);

const restore = FunctionImpl.make(databaseSchema, library, "restore", ({ refIds }) =>
  setTrashed(refIds, undefined),
);

export default GroupImpl.make(databaseSchema, library).pipe(
  Layer.provide(prepareUpload),
  Layer.provide(save),
  Layer.provide(record),
  Layer.provide(list),
  Layer.provide(filter),
  Layer.provide(trash),
  Layer.provide(urls),
  Layer.provide(remove),
  Layer.provide(restore),
  Layer.provide(RequireWorkspace),
  GroupImpl.finalize,
);
