import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "./_generated/id";
import { canvasItemFields } from "./canvasItem";
import RequireUser from "./middleware/RequireUser.spec";

export const CanvasItem = Schema.Struct(canvasItemFields);

export class CanvasNotFound extends Schema.TaggedError<CanvasNotFound>()("CanvasNotFound", {}) {}

export default GroupSpec.make()
  .middleware(RequireUser)
  .addFunction(
    FunctionSpec.publicMutation({
      name: "seed",
      args: () => ({
        count: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5000 })),
      }),
      returns: () => Id("canvases"),
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "items",
      args: () => ({ canvasId: Id("canvases") }),
      returns: () => Schema.Array(CanvasItem),
      error: () => CanvasNotFound,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "itemsSince",
      args: () => ({ canvasId: Id("canvases"), rev: Schema.Int }),
      returns: () => Schema.Struct({ rev: Schema.Int, items: Schema.Array(CanvasItem) }),
      error: () => CanvasNotFound,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "moveItems",
      args: () => ({
        canvasId: Id("canvases"),
        moves: Schema.Array(
          Schema.Struct({
            key: Schema.String,
            x: Schema.Finite,
            y: Schema.Finite,
          }),
        ),
      }),
      returns: () => Schema.Int,
      error: () => CanvasNotFound,
    }),
  );
