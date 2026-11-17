import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";
import { Sha256, VariantRole } from "../blob";

// One row is the objects of bytes whose last Blob row the purge deleted at `orphanedAt`. The sweep
// deletes the objects from R2 a week later. A save of the same bytes deletes the row first.
export default Table.make(() =>
  Schema.Struct({
    workspaceId: Id("workspaces"),
    sha256: Sha256,
    variants: Schema.Array(VariantRole),
    orphanedAt: Schema.Number,
  }),
)
  .index("by_workspace_and_sha256", ["workspaceId", "sha256"])
  .index("by_workspace_and_orphanedAt", ["workspaceId", "orphanedAt"])
  .index("by_orphanedAt", ["orphanedAt"]);
