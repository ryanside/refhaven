import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";
import { Id } from "./_generated/id";
import { ItemKey, canvasItemFields, itemTransform } from "./canvasItem";
import RequireWorkspace from "./middleware/RequireWorkspace.spec";

export const CanvasItem = Schema.Struct(canvasItemFields);

const Op = Schema.Union([
  Schema.Struct({
    op: Schema.Literal("patch"),
    key: ItemKey,
    fields: Schema.Struct(itemTransform).mapFields(Struct.map(Schema.optionalKey)),
  }),
  Schema.Struct({ op: Schema.Literal("remove"), key: ItemKey }),
]);

export class CanvasNotFound extends Schema.TaggedError<CanvasNotFound>()("CanvasNotFound", {}) {}

export class ItemNotFound extends Schema.TaggedError<ItemNotFound>()("ItemNotFound", {
  key: Schema.String,
}) {}

export default GroupSpec.make()
  .middleware(RequireWorkspace)
  .addFunction(
    FunctionSpec.publicMutation({
      name: "open",
      args: () => ({}),
      returns: () =>
        Schema.Struct({
          canvasId: Id("canvases"),
          rev: Schema.Int,
          items: Schema.Array(CanvasItem),
        }),
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "changes",
      args: () => ({ canvasId: Id("canvases"), rev: Schema.Int }),
      returns: () => Schema.Struct({ rev: Schema.Int, items: Schema.Array(CanvasItem) }),
      error: () => CanvasNotFound,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "apply",
      args: () => ({
        canvasId: Id("canvases"),
        ops: Schema.Array(Op).check(Schema.isMinLength(1), Schema.isMaxLength(1000)),
      }),
      returns: () => Schema.Int,
      error: () => Schema.Union([CanvasNotFound, ItemNotFound]),
    }),
  );
