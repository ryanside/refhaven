import * as Schema from "effect/Schema";

export const CollectionName = Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(100));

export class CollectionNotFound extends Schema.TaggedError<CollectionNotFound>()(
  "CollectionNotFound",
  {},
) {}
