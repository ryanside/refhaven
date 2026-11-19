import { maxOpsPerCall } from "@refhaven/scene";
import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";
import { Id } from "./_generated/id";
import { CollectionNotFound } from "./collection";
import { CanvasItem, ItemKey, itemTransform, noteFields } from "./canvasItem";
import { RefNotFound } from "./library.spec";
import RequireWorkspace from "./middleware/RequireWorkspace.spec";

export const Op = Schema.Union([
  Schema.Struct({
    op: Schema.Literal("patch"),
    key: ItemKey,
    // A note's own fields too. Which of these an item takes depends on its kind, so apply checks it.
    // A `parent` of null takes the item out of its group.
    fields: Schema.Struct({
      ...itemTransform,
      ...noteFields,
      parent: Schema.NullOr(ItemKey),
    }).mapFields(Struct.map(Schema.optionalKey)),
  }),
  Schema.Struct({ op: Schema.Literal("remove"), key: ItemKey }),
  // Without a `z` the item goes on top. Undoing a removal names the `z` the item had.
  Schema.Struct({
    op: Schema.Literal("add"),
    refId: Id("refs"),
    x: itemTransform.x,
    y: itemTransform.y,
    z: Schema.optionalKey(itemTransform.z),
  }),
  // A note under a key the client made. Under the key of a removed note it brings that row back.
  Schema.Struct({
    op: Schema.Literal("addNote"),
    key: ItemKey,
    x: itemTransform.x,
    y: itemTransform.y,
    scale: itemTransform.scale,
    rotation: itemTransform.rotation,
    z: Schema.optionalKey(itemTransform.z),
    ...noteFields,
  }),
  // A group under a key the client made. Under the key of a removed group it brings that row back.
  Schema.Struct({ op: Schema.Literal("addGroup"), key: ItemKey }),
]);

export class CanvasNotFound extends Schema.TaggedError<CanvasNotFound>()("CanvasNotFound", {}) {}

export class ItemNotFound extends Schema.TaggedError<ItemNotFound>()("ItemNotFound", {
  key: Schema.String,
}) {}

/** A note's or a group's key that a live item, or a removed item of another kind, already has. */
export class KeyTaken extends Schema.TaggedError<KeyTaken>()("KeyTaken", {
  key: Schema.String,
}) {}

/** A patch of a field that the item's kind does not have, such as a note's text on an image. */
export class FieldNotOnItem extends Schema.TaggedError<FieldNotOnItem>()("FieldNotOnItem", {
  key: Schema.String,
  field: Schema.String,
}) {}

/** A `parent` that names no group of the canvas, live or removed. */
export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()("GroupNotFound", {
  key: Schema.String,
}) {}

export default GroupSpec.make()
  .middleware(RequireWorkspace)
  .addFunction(
    FunctionSpec.publicMutation({
      name: "open",
      args: () => ({ collectionId: Id("collections") }),
      returns: () =>
        Schema.Struct({
          canvasId: Id("canvases"),
          rev: Schema.Int,
          items: Schema.Array(CanvasItem),
          // The last `placed` items are the ones this call put on the canvas.
          placed: Schema.Int,
        }),
      error: () => CollectionNotFound,
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
        ops: Schema.Array(Op).check(Schema.isMinLength(1), Schema.isMaxLength(maxOpsPerCall)),
      }),
      returns: () => Schema.Int,
      error: () =>
        Schema.Union([
          CanvasNotFound,
          ItemNotFound,
          RefNotFound,
          KeyTaken,
          FieldNotOnItem,
          GroupNotFound,
        ]),
    }),
  );
