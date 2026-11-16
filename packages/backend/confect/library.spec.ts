import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "./_generated/id";
import {
  ImageMimeType,
  ImageRole,
  Sha256,
  ThumbHash,
  VariantRole,
  Variants,
  variantSpecs,
} from "./blob";
import RequireWorkspace from "./middleware/RequireWorkspace.spec";

const Dimension = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65_535 }));

const variantSizeUpTo = (maxEdge: number) => {
  const Edge = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: maxEdge }));
  return Schema.Struct({ width: Edge, height: Edge });
};

const savedImage = {
  sha256: Sha256,
  fileName: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(255)),
  width: Dimension,
  height: Dimension,
  thumbHash: ThumbHash,
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
      args: () => ({ sha256: Sha256, roles: Schema.Array(VariantRole) }),
      returns: () => Schema.Array(Schema.Struct({ role: ImageRole, url: Schema.String })),
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "save",
      args: () => ({
        ...savedImage,
        variants: Schema.Struct({
          thumbnail: Schema.optionalKey(variantSizeUpTo(variantSpecs.thumbnail.maxEdge)),
          display: Schema.optionalKey(variantSizeUpTo(variantSpecs.display.maxEdge)),
        }),
      }),
      returns: () => SavedRef,
      error: () => Schema.Union([UploadNotFound, UnsupportedImage, ImageTooLarge]),
    }),
  )
  .addFunction(
    FunctionSpec.internalMutation({
      name: "record",
      args: () => ({
        ...savedImage,
        byteSize: Schema.Int,
        mimeType: ImageMimeType,
        variants: Variants,
      }),
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
          thumbHash: Schema.NullOr(Schema.String),
          savedAt: Schema.Number,
        }),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "urls",
      args: () => ({
        refIds: Schema.Array(Id("refs")).check(Schema.isMaxLength(100)),
        role: ImageRole,
      }),
      returns: () => Schema.Array(Schema.Struct({ refId: Id("refs"), url: Schema.String })),
      error: () => RefNotFound,
    }),
  );
