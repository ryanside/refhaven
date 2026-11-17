import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";

// One row is one tag on one Ref. `by_ref` lists a Ref's tags in the order they were added.
// `by_workspace_and_name` lists the Refs of one tag, and the workspace's tag names in order.
export default Table.make(() =>
  Schema.Struct({
    workspaceId: Id("workspaces"),
    refId: Id("refs"),
    name: Schema.String,
  }),
)
  .index("by_ref", ["refId"])
  .index("by_workspace_and_name", ["workspaceId", "name"]);
