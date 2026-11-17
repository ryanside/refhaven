import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";

// `by_collection` lists a collection's Refs in the order they were added. `by_collection_and_ref`
// finds one membership, and lists them in ID order.
export default Table.make(() =>
  Schema.Struct({
    workspaceId: Id("workspaces"),
    collectionId: Id("collections"),
    refId: Id("refs"),
  }),
)
  .index("by_collection", ["collectionId"])
  .index("by_collection_and_ref", ["collectionId", "refId"]);
