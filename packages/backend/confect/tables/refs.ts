import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";

export default Table.make(() =>
  Schema.Struct({
    workspaceId: Id("workspaces"),
    blobs: Schema.Struct({ original: Id("blobs") }),
    fileName: Schema.String,
  }),
).index("by_workspace", ["workspaceId"]);
