import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";

// A canvas with no `collectionId` is the whole library's. Convex indexes a missing field as
// `undefined`, so `by_workspace_and_collection` finds the library's canvas with that value.
export default Table.make(() =>
  Schema.Struct({
    workspaceId: Id("workspaces"),
    collectionId: Schema.optionalKey(Id("collections")),
    rev: Schema.Int,
  }),
).index("by_workspace_and_collection", ["workspaceId", "collectionId"]);
