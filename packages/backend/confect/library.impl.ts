import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { Id } from "./_generated/id";
import refs from "./_generated/refs";
import databaseSchema from "./_generated/schema";
import { DatabaseReader, DatabaseWriter, MutationRunner } from "./_generated/services";
import {
  type Sha256,
  maxImageBytes,
  originalKey,
  signedUrlSeconds,
  sniffImageType,
  sniffedBytes,
} from "./blob";
import library, {
  ImageTooLarge,
  RefNotFound,
  UnsupportedImage,
  UploadNotFound,
} from "./library.spec";
import RequireWorkspace from "./middleware/RequireWorkspace.impl";
import { CurrentWorkspace } from "./middleware/RequireWorkspace.spec";
import { r2 } from "./r2";

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

const prepareUpload = FunctionImpl.make(databaseSchema, library, "prepareUpload", ({ sha256 }) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    if (Option.isSome(yield* storedBlob(workspaceId, sha256))) {
      return { status: "stored" as const };
    }
    const { url } = yield* Effect.promise(() =>
      r2.generateUploadUrl(originalKey(workspaceId, sha256)),
    );
    return { status: "upload" as const, url };
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

const save = FunctionImpl.make(databaseSchema, library, "save", (image) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const stored = yield* inspectUpload(originalKey(workspaceId, image.sha256));
    const { runMutation } = yield* MutationRunner;
    return yield* runMutation(refs.internal.library.record, { ...image, ...stored }).pipe(
      Effect.orDie,
    );
  }),
);

const record = FunctionImpl.make(
  databaseSchema,
  library,
  "record",
  ({ sha256, fileName, width, height, byteSize, mimeType }) =>
    Effect.gen(function* () {
      const { workspaceId } = yield* CurrentWorkspace;
      const writer = yield* DatabaseWriter;
      const existing = yield* storedBlob(workspaceId, sha256);
      const blobId = Option.isSome(existing)
        ? existing.value._id
        : yield* writer
            .table("blobs")
            .insert({ workspaceId, sha256, byteSize, mimeType, width, height });
      const refId = yield* writer
        .table("refs")
        .insert({ workspaceId, blobs: { original: blobId }, fileName });
      return { refId, duplicate: Option.isSome(existing) };
    }).pipe(Effect.orDie),
);

const list = FunctionImpl.make(databaseSchema, library, "list", ({ paginationOpts }) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const reader = yield* DatabaseReader;
    const result = yield* reader
      .table("refs")
      .index("by_workspace", (q) => q.eq("workspaceId", workspaceId), "desc")
      .paginate(paginationOpts);
    const page = yield* Effect.forEach(result.page, (ref) =>
      reader
        .table("blobs")
        .get(ref.blobs.original)
        .pipe(
          Effect.map((blob) => ({
            refId: ref._id,
            fileName: ref.fileName,
            width: blob.width,
            height: blob.height,
            savedAt: ref._creationTime,
          })),
        ),
    );
    return { ...result, page };
  }).pipe(Effect.orDie),
);

const urls = FunctionImpl.make(databaseSchema, library, "urls", ({ refIds }) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* CurrentWorkspace;
    const reader = yield* DatabaseReader;
    return yield* Effect.forEach(refIds, (refId) =>
      Effect.gen(function* () {
        const ref = yield* reader
          .table("refs")
          .get(refId)
          .pipe(Effect.mapError(() => new RefNotFound()));
        if (ref.workspaceId !== workspaceId) {
          return yield* new RefNotFound();
        }
        const blob = yield* reader.table("blobs").get(ref.blobs.original).pipe(Effect.orDie);
        const url = yield* Effect.promise(() =>
          r2.getUrl(originalKey(workspaceId, blob.sha256), { expiresIn: signedUrlSeconds }),
        );
        return { refId, url };
      }),
    );
  }),
);

export default GroupImpl.make(databaseSchema, library).pipe(
  Layer.provide(prepareUpload),
  Layer.provide(save),
  Layer.provide(record),
  Layer.provide(list),
  Layer.provide(urls),
  Layer.provide(RequireWorkspace),
  GroupImpl.finalize,
);
