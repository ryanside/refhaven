import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";

// A Ref with a `deletedAt` is in the trash. Convex indexes a missing field as `undefined`, which
// sorts before every number, so `by_workspace_and_deletedAt` lists live Refs with `undefined` and
// trashed Refs above it, in the order they were deleted.
// `searchText` is derived from the name, note, source, and tags by `writeSearchText`. A Ref saved
// before it existed lacks it until `search.backfill` runs.
export default Table.make(() =>
  Schema.Struct({
    workspaceId: Id("workspaces"),
    blobs: Schema.Struct({ original: Id("blobs") }),
    fileName: Schema.String,
    note: Schema.optionalKey(Schema.String),
    sourceUrl: Schema.optionalKey(Schema.String),
    deletedAt: Schema.optionalKey(Schema.Number),
    searchText: Schema.optionalKey(Schema.String),
  }),
)
  .index("by_workspace_and_deletedAt", ["workspaceId", "deletedAt"])
  .searchIndex("search_text", {
    searchField: "searchText",
    filterFields: ["workspaceId", "deletedAt"],
  });
