import * as Schema from "effect/Schema";
import { expect, test } from "vitest";
import { Sha256, originalKey, sniffImageType } from "./blob";

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

test("an original's object key sits under its workspace and is named by its hash", () => {
  const sha256 = Schema.decodeUnknownSync(Sha256)(
    "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  );

  expect(originalKey("ws1", sha256)).toBe(
    "w/ws1/o/9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  );
});
