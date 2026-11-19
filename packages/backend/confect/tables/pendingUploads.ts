import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";
import { Sha256 } from "../blob";

// One row is an upload of bytes that the workspace has no Blob row for. Its ID is part of the
// objects' keys. A save deletes the row and writes the ID into the new Blob row. Until then every
// `prepareUpload` of the same bytes gets this row, so two pages that save one image at once share
// its objects. A row whose page never saved stays, and so do its objects: nothing deletes them.
export default Table.make(() =>
  Schema.Struct({
    workspaceId: Id("workspaces"),
    sha256: Sha256,
  }),
).index("by_workspace_and_sha256", ["workspaceId", "sha256"]);
