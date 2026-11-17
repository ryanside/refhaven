import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import * as Tuple from "effect/Tuple";
import { Id } from "../_generated/id";
import { CanvasItem } from "../canvasItem";

// One row shape per kind, so a note with a Ref, an image with text, or a group with a place cannot
// be stored. `parent` is optional, so the rows from before groups stay valid.
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
