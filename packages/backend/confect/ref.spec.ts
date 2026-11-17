import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "./_generated/id";
import { ImageMimeType } from "./blob";
import { RefNotFound } from "./library.spec";
import RequireWorkspace from "./middleware/RequireWorkspace.spec";
import { FileName, Note, SourceUrl, TagNames } from "./refFields";

/** One image with everything its page shows. */
const RefDetails = Schema.Struct({
  fileName: Schema.String,
  note: Schema.NullOr(Schema.String),
  sourceUrl: Schema.NullOr(Schema.String),
  tags: Schema.Array(Schema.String),
  width: Schema.Int,
  height: Schema.Int,
  byteSize: Schema.Int,
  mimeType: ImageMimeType,
  savedAt: Schema.Number,
  deletedAt: Schema.NullOr(Schema.Number),
  collections: Schema.Array(
    Schema.Struct({ collectionId: Id("collections"), name: Schema.String }),
  ),
});

const tagChange = () => ({ refId: Id("refs"), names: TagNames });

export default GroupSpec.make()
  .middleware(RequireWorkspace)
  .addFunction(
    FunctionSpec.publicQuery({
      name: "get",
      args: () => ({ refId: Id("refs") }),
      returns: () => RefDetails,
      error: () => RefNotFound,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "update",
      args: () => ({
        refId: Id("refs"),
        fileName: Schema.optionalKey(FileName),
        note: Schema.optionalKey(Schema.NullOr(Note)),
        sourceUrl: Schema.optionalKey(Schema.NullOr(SourceUrl)),
      }),
      returns: () => Schema.Null,
      error: () => RefNotFound,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "addTags",
      args: tagChange,
      returns: () => Schema.Null,
      error: () => RefNotFound,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "removeTags",
      args: tagChange,
      returns: () => Schema.Null,
      error: () => RefNotFound,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "tags",
      returns: () => Schema.Array(Schema.String),
    }),
  );
