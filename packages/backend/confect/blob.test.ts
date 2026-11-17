import * as Schema from "effect/Schema";
import { expect, test } from "vitest";
import { Sha256, originalKey, servedKey, sniffImageType, variantKey, variantSize } from "./blob";

const bytes = (...parts: Array<string | number>) =>
  Uint8Array.from(
    parts.flatMap((part) =>
      typeof part === "number" ? [part] : Array.from(part, (character) => character.charCodeAt(0)),
    ),
  );

test.each([
  ["image/png", bytes(0x89, "PNG\r\n", 0x1a, 0x0a, 0, 0, 0, 0x0d)],
  ["image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, "JFIF", 0, 1)],
  ["image/gif", bytes("GIF89a", 1, 0, 1, 0, 0, 0)],
  ["image/webp", bytes("RIFF", 0x24, 0, 0, 0, "WEBP")],
  ["image/avif", bytes(0, 0, 0, 0x1c, "ftyp", "avif")],
])("the first bytes of a file identify %s", (type, head) => {
  expect(sniffImageType(head)).toBe(type);
});

test.each([
  ["HTML that claims to be an image", bytes("<!DOCTYPE html>")],
  ["SVG, which is XML and not a raster format", bytes("<svg xmlns='h")],
  ["an MP4, which shares the ftyp box with AVIF", bytes(0, 0, 0, 0x20, "ftyp", "isom")],
  ["an empty file", bytes()],
])("%s is not an accepted image", (_name, head) => {
  expect(sniffImageType(head)).toBeNull();
});

test("a SHA-256 is 64 lowercase hex characters", () => {
  const valid = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
  const decode = Schema.decodeUnknownSync(Sha256);

  expect(decode(valid)).toBe(valid);
  expect(() => decode(valid.toUpperCase())).toThrow();
  expect(() => decode(valid.slice(1))).toThrow();
  expect(() => decode(`../${valid}`)).toThrow();
});

const sha256 = Schema.decodeUnknownSync(Sha256)(
  "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
);

test("an original's object key sits under its workspace and is named by its hash", () => {
  expect(originalKey("ws1", sha256)).toBe(
    "w/ws1/o/9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  );
});

test("a variant's object key is named by the original's hash and the role's file", () => {
  expect(variantKey("ws1", sha256, "thumbnail")).toBe(`w/ws1/v/${sha256}/512.webp`);
  expect(variantKey("ws1", sha256, "display")).toBe(`w/ws1/v/${sha256}/2048.webp`);
});

test.each([
  ["a landscape image", { width: 3000, height: 2000 }, "thumbnail", { width: 512, height: 341 }],
  ["a landscape image", { width: 3000, height: 2000 }, "display", { width: 2048, height: 1365 }],
  ["a portrait image", { width: 1000, height: 4000 }, "thumbnail", { width: 128, height: 512 }],
  ["a thin strip", { width: 10_000, height: 1 }, "thumbnail", { width: 512, height: 1 }],
  [
    "an image one pixel past the edge",
    { width: 513, height: 513 },
    "thumbnail",
    { width: 512, height: 512 },
  ],
] as const)("%s gets a %s whose longer edge is the role's edge", (_name, original, role, size) => {
  expect(variantSize(original, role)).toEqual(size);
});

test.each([
  ["an image exactly at the edge", { width: 512, height: 300 }, "thumbnail"],
  ["a small image", { width: 300, height: 300 }, "thumbnail"],
  ["an image between the two edges", { width: 1500, height: 1000 }, "display"],
] as const)("%s gets no %s, because the original serves in its place", (_name, original, role) => {
  expect(variantSize(original, role)).toBeNull();
});

test("a role is served from its variant when the Blob has one, and from the original otherwise", () => {
  const variant = { byteSize: 1, width: 512, height: 341 };
  const withThumbnail = { sha256, variants: { thumbnail: variant } };

  expect(servedKey("ws1", withThumbnail, "thumbnail")).toBe(variantKey("ws1", sha256, "thumbnail"));
  expect(servedKey("ws1", withThumbnail, "display")).toBe(originalKey("ws1", sha256));
  expect(servedKey("ws1", withThumbnail, "original")).toBe(originalKey("ws1", sha256));
  expect(servedKey("ws1", { sha256 }, "thumbnail")).toBe(originalKey("ws1", sha256));
});
