import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { expect, test } from "vitest";
import { SourceUrl, TagName } from "./refFields";

const decoded = <S extends Schema.Decoder<unknown>>(schema: S, input: string) =>
  Option.getOrNull(Schema.decodeUnknownOption(schema)(input));

test.each([
  ["Mood", "mood"],
  [" mood ", "mood"],
  ["MOOD", "mood"],
  ["  Light \t and   Shadow ", "light and shadow"],
  ["x".repeat(50), "x".repeat(50)],
  ["", null],
  ["   ", null],
  ["x".repeat(51), null],
])("the tag %j is %j", (input, expected) => {
  expect(decoded(TagName, input)).toBe(expected);
});

test.each([
  ["https://example.com/a?b=c", "https://example.com/a?b=c"],
  [" http://example.com ", "http://example.com"],
  [`https://example.com/${"x".repeat(2028)}`, `https://example.com/${"x".repeat(2028)}`],
  [`https://example.com/${"x".repeat(2029)}`, null],
  ["javascript:alert(1)", null],
  ["data:text/html,x", null],
  ["ftp://example.com", null],
  ["not a url", null],
  ["", null],
])("the source %j is %j", (input, expected) => {
  expect(decoded(SourceUrl, input)).toBe(expected);
});
