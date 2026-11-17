import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";

// A Ref with a `deletedAt` is in the trash. Convex indexes a missing field as `undefined`, which
// sorts before every number, so `by_workspace_and_deletedAt` lists live Refs with `undefined` and
// trashed Refs above it, in the order they were deleted.
export default Table.make(() =>
  Schema.Struct({
    workspaceId: Id("workspaces"),
    blobs: Schema.Struct({ original: Id("blobs") }),
    fileName: Schema.String,
    deletedAt: Schema.optionalKey(Schema.Number),
  }),
).index("by_workspace_and_deletedAt", ["workspaceId", "deletedAt"]);
