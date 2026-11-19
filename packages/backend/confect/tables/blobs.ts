import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";
import { ImageMimeType, Sha256, ThumbHash, Variants } from "../blob";

export default Table.make(() =>
  Schema.Struct({
    workspaceId: Id("workspaces"),
    sha256: Sha256,
    // The upload the objects came in by, which names their keys. A Blob saved before uploads had
    // IDs has none.
    upload: Schema.optionalKey(Id("pendingUploads")),
    byteSize: Schema.Int,
    mimeType: ImageMimeType,
    width: Schema.Int,
    height: Schema.Int,
    thumbHash: Schema.optionalKey(ThumbHash),
    variants: Schema.optionalKey(Variants),
  }),
).index("by_workspace_and_sha256", ["workspaceId", "sha256"]);
