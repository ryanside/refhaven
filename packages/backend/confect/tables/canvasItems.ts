import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";
import { canvasItemFields } from "../canvasItem";

export default Table.make(() =>
  Schema.Struct({
    canvasId: Id("canvases"),
    rev: Schema.Int,
    ...canvasItemFields,
  }),
)
  .index("by_canvas_and_key", ["canvasId", "key"])
  .index("by_canvas_and_rev", ["canvasId", "rev"]);
