import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

export const FileName = Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(255));

export const Note = Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(10_000));

// The page shows a source as a link, so a `javascript:` or `data:` URL must never be stored.
const isWebUrl = (value: string) =>
  URL.canParse(value) && ["http:", "https:"].includes(new URL(value).protocol);

export const SourceUrl = Schema.Trim.check(
  Schema.isMaxLength(2048),
  Schema.makeFilter(isWebUrl, { expected: "an http or https URL" }),
);

/** "Mood", " mood ", and "MOOD" are one tag: trimmed, inner spaces collapsed, and lowercased. */
export const TagName = Schema.String.pipe(
  Schema.decode(
    SchemaTransformation.transform({
      decode: (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase(),
      encode: (name: string) => name,
    }),
  ),
).check(Schema.isNonEmpty(), Schema.isMaxLength(50));

export const TagNames = Schema.Array(TagName).check(Schema.isMaxLength(20));
