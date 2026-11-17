import { isZ, maxNoteText, noteColors } from "@refhaven/scene";
import * as Schema from "effect/Schema";
import { Id } from "./_generated/id";

/** The fields of an item that an edit can change, whatever its kind. */
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

/** The fields of a note that an edit can change. `width` and `height` are its box at scale 1. */
export const noteFields = {
  text: Schema.String.check(
    Schema.isMaxLength(maxNoteText),
    Schema.makeFilter((text: string) => text.trim() !== "", {
      expected: "text that is not only spaces",
    }),
  ),
  color: Schema.Literals(noteColors),
  width: Schema.Finite.check(Schema.isGreaterThan(0)),
  height: Schema.Finite.check(Schema.isGreaterThan(0)),
};

/** An image's or a note's group: the key of a live group item on the same canvas. */
const parent = Schema.optionalKey(ItemKey);

const deletedAt = Schema.optionalKey(Schema.Number);

const placedFields = { key: ItemKey, ...itemTransform, parent, deletedAt };

/** An image's `width` and `height` are its Ref's pixel size, so a client can hit-test with no join. */
export const ImageItem = Schema.Struct({
  kind: Schema.Literal("image"),
  refId: Id("refs"),
  width: Schema.Int,
  height: Schema.Int,
  ...placedFields,
});

export const NoteItem = Schema.Struct({
  kind: Schema.Literal("note"),
  ...noteFields,
  ...placedFields,
});

/**
 * A group has no place, size, or `z` of its own, and no parent. Its members are the images and
 * notes whose `parent` is its key.
 */
export const GroupItem = Schema.Struct({
  kind: Schema.Literal("group"),
  key: ItemKey,
  deletedAt,
});

/** An item as a client sees it. */
export const CanvasItem = Schema.Union([ImageItem, NoteItem, GroupItem]);

/** The fields a patch may set on an item of each kind. */
export const patchable = {
  image: new Set([...Object.keys(itemTransform), "parent"]),
  note: new Set([...Object.keys(itemTransform), ...Object.keys(noteFields), "parent"]),
  group: new Set<string>(),
};
