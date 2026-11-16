import * as Schema from "effect/Schema";

export const canvasItemFields = {
  key: Schema.String,
  kind: Schema.Literal("image"),
  refId: Schema.String,
  x: Schema.Finite,
  y: Schema.Finite,
  scale: Schema.Finite,
  rotation: Schema.Finite,
  flipX: Schema.Boolean,
  flipY: Schema.Boolean,
  opacity: Schema.Finite,
  grayscale: Schema.Boolean,
  z: Schema.String,
};
