import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import * as Tuple from "effect/Tuple";
import { Id } from "../_generated/id";
import { CanvasItem } from "../canvasItem";

// One row shape per kind, so a note with a Ref or an image with text cannot be stored. The image
// shape is the one every row had before notes, so those rows stay valid.
export default Table.make(() =>
  CanvasItem.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        workspaceId: Id("workspaces"),
        canvasId: Id("canvases"),
        rev: Schema.Int,
      }),
    ),
  ),
)
  .index("by_canvas_and_key", ["canvasId", "key"])
  .index("by_canvas_and_rev", ["canvasId", "rev"])
  .index("by_ref", ["refId"]);
