import { useAction, useMutation } from "@confect/react";
import {
  type ImageRole,
  Sha256,
  type VariantRole,
  variantRoles,
  variantSize,
} from "@refhaven/backend/blob";
import refs from "@refhaven/backend/refs";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { useCallback } from "react";
import { rgbaToThumbHash } from "thumbhash";

export type SaveOutcome =
  | { status: "saved"; duplicate: boolean }
  | { status: "rejected"; reason: string };

const rejected = (reason: string): SaveOutcome => ({ status: "rejected", reason });

const thumbHashMaxEdge = 100;

async function sha256Of(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"));
  return Schema.decodeSync(Sha256)(hex.join(""));
}

function drawn(bitmap: ImageBitmap, width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  return { canvas, context };
}

function thumbHashOf(bitmap: ImageBitmap) {
  const scale = Math.min(1, thumbHashMaxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const { data } = drawn(bitmap, width, height).context.getImageData(0, 0, width, height);
  return btoa(String.fromCharCode(...rgbaToThumbHash(width, height, data)));
}

/** WebP copies of the image for the given roles, or none when the browser cannot encode WebP. */
async function variantsOf(bitmap: ImageBitmap, roles: ReadonlyArray<VariantRole>) {
  const variants = await Promise.all(
    roles.map(async (role) => {
      const size = variantSize(bitmap, role)!;
      const bytes = await drawn(bitmap, size.width, size.height).canvas.convertToBlob({
        type: "image/webp",
      });
      return { role, size, bytes };
    }),
  );
  // Safari answers a WebP request with a PNG.
  return variants.every(({ bytes }) => bytes.type === "image/webp") ? variants : [];
}

/**
 * Saves one image file into the library, with a thumbnail, a display copy, and a ThumbHash
 * made in the browser. The bytes go straight to R2, and only when the library lacks them.
 */
export function useSaveImage() {
  const prepareUpload = useMutation(refs.public.library.prepareUpload);
  const save = useAction(refs.public.library.save);

  return useCallback(
    (file: File): Promise<SaveOutcome> => {
      const saveImage = async (bitmap: ImageBitmap): Promise<SaveOutcome> => {
        const sha256 = await sha256Of(file);
        const prepared = await prepareUpload({
          sha256,
          roles: variantRoles.filter((role) => variantSize(bitmap, role) !== null),
        });
        if (Result.isFailure(prepared)) return rejected(prepared.failure._tag);

        const uploads = prepared.success;
        const variants = await variantsOf(
          bitmap,
          variantRoles.filter((role) => uploads.some((upload) => upload.role === role)),
        );
        const bodies = new Map<ImageRole, Blob>([
          ["original", file],
          ...variants.map(({ role, bytes }) => [role, bytes] as const),
        ]);
        const uploaded = await Promise.all(
          uploads.flatMap(({ role, url }) => {
            const body = bodies.get(role);
            return body
              ? [fetch(url, { method: "PUT", body, headers: { "Content-Type": body.type } })]
              : [];
          }),
        );
        if (uploaded.some((response) => !response.ok)) return rejected("UploadFailed");

        const saved = await save({
          sha256,
          fileName: file.name,
          width: bitmap.width,
          height: bitmap.height,
          thumbHash: thumbHashOf(bitmap),
          variants: Object.fromEntries(variants.map(({ role, size }) => [role, size])),
        });
        return Result.isFailure(saved)
          ? rejected(saved.failure._tag)
          : { status: "saved", duplicate: saved.success.duplicate };
      };

      const decodeAndSave = async () => {
        const bitmap = await createImageBitmap(file).catch(() => null);
        if (!bitmap) return rejected("UnsupportedImage");
        try {
          return await saveImage(bitmap);
        } finally {
          bitmap.close();
        }
      };
      // A network error or a server fault rejects. The caller still gets an outcome for the file.
      return decodeAndSave().catch(() => rejected("Failed"));
    },
    [prepareUpload, save],
  );
}
