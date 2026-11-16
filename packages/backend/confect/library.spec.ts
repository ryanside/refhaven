import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "./_generated/id";
import { ImageMimeType, Sha256 } from "./blob";
import RequireWorkspace from "./middleware/RequireWorkspace.spec";

const Dimension = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65_535 }));

const savedImage = {
  sha256: Sha256,
  fileName: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(255)),
  width: Dimension,
  height: Dimension,
};

const SavedRef = Schema.Struct({ refId: Id("refs"), duplicate: Schema.Boolean });

export class UploadNotFound extends Schema.TaggedError<UploadNotFound>()("UploadNotFound", {}) {}

export class UnsupportedImage extends Schema.TaggedError<UnsupportedImage>()(
  "UnsupportedImage",
  {},
) {}

export class ImageTooLarge extends Schema.TaggedError<ImageTooLarge>()("ImageTooLarge", {
  maxBytes: Schema.Int,
}) {}

export class RefNotFound extends Schema.TaggedError<RefNotFound>()("RefNotFound", {}) {}

export default GroupSpec.make()
  .middleware(RequireWorkspace)
  .addFunction(
    FunctionSpec.publicMutation({
      name: "prepareUpload",
      args: () => ({ sha256: Sha256 }),
      returns: () =>
        Schema.Union([
          Schema.Struct({ status: Schema.Literal("stored") }),
          Schema.Struct({ status: Schema.Literal("upload"), url: Schema.String }),
        ]),
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "save",
      args: () => savedImage,
      returns: () => SavedRef,
      error: () => Schema.Union([UploadNotFound, UnsupportedImage, ImageTooLarge]),
    }),
  )
  .addFunction(
    FunctionSpec.internalMutation({
      name: "record",
      args: () => ({ ...savedImage, byteSize: Schema.Int, mimeType: ImageMimeType }),
      returns: () => SavedRef,
    }),
  )
  .addFunction(
    FunctionSpec.publicPaginatedQuery({
      name: "list",
      item: () =>
        Schema.Struct({
          refId: Id("refs"),
          fileName: Schema.String,
          width: Schema.Int,
          height: Schema.Int,
          savedAt: Schema.Number,
        }),
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "urls",
      args: () => ({ refIds: Schema.Array(Id("refs")).check(Schema.isMaxLength(100)) }),
      returns: () => Schema.Array(Schema.Struct({ refId: Id("refs"), url: Schema.String })),
      error: () => RefNotFound,
    }),
  );
