import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";
import { Sha256, VariantRole } from "../blob";

// One row is the objects of a Blob row that the purge deleted at `orphanedAt`: the same workspace,
// hash, and upload, which name their keys. A week later the sweep deletes the objects from R2 and
// then the row. No later save can get those keys, because a save of the same bytes is a new
// upload with a new ID.
export default Table.make(() =>
  Schema.Struct({
    workspaceId: Id("workspaces"),
    sha256: Sha256,
    upload: Schema.optionalKey(Id("pendingUploads")),
    variants: Schema.Array(VariantRole),
    orphanedAt: Schema.Number,
  }),
)
  .index("by_workspace_and_orphanedAt", ["workspaceId", "orphanedAt"])
  .index("by_orphanedAt", ["orphanedAt"]);
