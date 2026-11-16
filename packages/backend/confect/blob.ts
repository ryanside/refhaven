import * as Schema from "effect/Schema";

export const Sha256 = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)).pipe(
  Schema.brand("Sha256"),
);
export type Sha256 = typeof Sha256.Type;

export const ImageMimeType = Schema.Literals([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);
export type ImageMimeType = typeof ImageMimeType.Type;

export const maxImageBytes = 50 * 1024 * 1024;

export const signedUrlSeconds = 60 * 60;

export const originalKey = (workspaceId: string, sha256: Sha256) => `w/${workspaceId}/o/${sha256}`;

export const sniffedBytes = 12;

const startsWith = (bytes: Uint8Array, signature: ReadonlyArray<number>, offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

const ascii = (text: string) => Array.from(text, (character) => character.charCodeAt(0));

/** Reads the image type from the first bytes of a file, so the server never trusts a client's claim. */
export function sniffImageType(head: Uint8Array): ImageMimeType | null {
  if (startsWith(head, [0x89, ...ascii("PNG\r\n"), 0x1a, 0x0a])) return "image/png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(head, ascii("GIF87a")) || startsWith(head, ascii("GIF89a"))) return "image/gif";
  if (startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8)) return "image/webp";
  if (
    startsWith(head, ascii("ftyp"), 4) &&
    (startsWith(head, ascii("avif"), 8) || startsWith(head, ascii("avis"), 8))
  ) {
    return "image/avif";
  }
  return null;
}
