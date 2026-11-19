import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";

// A canvas without a `collectionId` is the canvas of a library from before only collections had
// one. The rows stay, with their items. No canvas function reads or writes them. The trash still
// raises their `rev` and the purge deletes their items, through `by_ref`.
export default Table.make(() =>
  Schema.Struct({
    workspaceId: Id("workspaces"),
    collectionId: Schema.optionalKey(Id("collections")),
    rev: Schema.Int,
  }),
).index("by_workspace_and_collection", ["workspaceId", "collectionId"]);
