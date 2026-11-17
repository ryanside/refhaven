import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "./_generated/id";
import { CollectionName, CollectionNotFound } from "./collection";
import { GalleryItem, RefNotFound } from "./library.spec";
import RequireWorkspace from "./middleware/RequireWorkspace.spec";

const RefIds = Schema.Array(Id("refs")).check(Schema.isMaxLength(100));

export default GroupSpec.make()
  .middleware(RequireWorkspace)
  .addFunction(
    FunctionSpec.publicMutation({
      name: "create",
      args: () => ({ name: CollectionName }),
      returns: () => Id("collections"),
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      returns: () =>
        Schema.Array(Schema.Struct({ collectionId: Id("collections"), name: Schema.String })),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "rename",
      args: () => ({ collectionId: Id("collections"), name: CollectionName }),
      returns: () => Schema.Null,
      error: () => CollectionNotFound,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "addRefs",
      args: () => ({ collectionId: Id("collections"), refIds: RefIds }),
      returns: () => Schema.Null,
      error: () => Schema.Union([CollectionNotFound, RefNotFound]),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "removeRefs",
      args: () => ({ collectionId: Id("collections"), refIds: RefIds }),
      returns: () => Schema.Null,
      error: () => CollectionNotFound,
    }),
  )
  .addFunction(
    FunctionSpec.publicPaginatedQuery({
      name: "refs",
      args: () => ({ collectionId: Id("collections") }),
      item: () => GalleryItem,
      error: () => CollectionNotFound,
    }),
  );
