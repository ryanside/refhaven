import { isZ } from "@refhaven/scene";
import * as Schema from "effect/Schema";
import { Id } from "./_generated/id";

/** The fields of an item that an edit can change. */
export const itemTransform = {
  x: Schema.Finite,
  y: Schema.Finite,
  scale: Schema.Finite.check(Schema.isGreaterThan(0)),
  rotation: Schema.Finite,
  flipX: Schema.Boolean,
  flipY: Schema.Boolean,
  opacity: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  grayscale: Schema.Boolean,
  z: Schema.String.check(Schema.makeFilter(isZ, { expected: "a fractional index key" })),
};

export const ItemKey = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(64));

/** An item as a client sees it. `width` and `height` are the Ref's pixel size, so a client can hit-test with no join. */
export const canvasItemFields = {
  key: ItemKey,
  kind: Schema.Literal("image"),
  refId: Id("refs"),
  width: Schema.Int,
  height: Schema.Int,
  ...itemTransform,
  deletedAt: Schema.optionalKey(Schema.Number),
};
