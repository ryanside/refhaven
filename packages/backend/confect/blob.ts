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

export const variantSpecs = {
  thumbnail: { maxEdge: 512, file: "512.webp" },
  display: { maxEdge: 2048, file: "2048.webp" },
} as const;
export type VariantRole = keyof typeof variantSpecs;
export const VariantRole = Schema.Literals(["thumbnail", "display"] satisfies Array<VariantRole>);
export const variantRoles = VariantRole.literals;

export const ImageRole = Schema.Literals(["original", ...variantRoles]);
export type ImageRole = typeof ImageRole.Type;

/** The variant's key is named by the original's hash, so every Ref that shares the Blob shares it. */
export const variantKey = (workspaceId: string, sha256: Sha256, role: VariantRole) =>
  `w/${workspaceId}/v/${sha256}/${variantSpecs[role].file}`;

type PixelSize = { width: number; height: number };

/** The size of a role's variant, or null when the original is small enough to serve in its place. */
export function variantSize({ width, height }: PixelSize, role: VariantRole): PixelSize | null {
  const { maxEdge } = variantSpecs[role];
  const longerEdge = Math.max(width, height);
  if (longerEdge <= maxEdge) return null;
  const scale = maxEdge / longerEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export const Variant = Schema.Struct({
  byteSize: Schema.Int,
  width: Schema.Int,
  height: Schema.Int,
});
export const Variants = Schema.Struct({
  thumbnail: Schema.optionalKey(Variant),
  display: Schema.optionalKey(Variant),
});
export type Variants = typeof Variants.Type;

/** The object to serve for a role: its variant when the Blob has one, and the original otherwise. */
export function servedKey(
  workspaceId: string,
  blob: { sha256: Sha256; variants?: Variants },
  role: ImageRole,
) {
  return role !== "original" && blob.variants?.[role]
    ? variantKey(workspaceId, blob.sha256, role)
    : originalKey(workspaceId, blob.sha256);
}

/** A ThumbHash in base64. A ThumbHash is at most 25 bytes. */
export const ThumbHash = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9+/]{4,36}={0,2}$/));

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
