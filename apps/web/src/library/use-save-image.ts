import { useAction, useMutation } from "@confect/react";
import { Sha256 } from "@refhaven/backend/blob";
import refs from "@refhaven/backend/refs";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { useCallback } from "react";

export type SaveOutcome =
  | { status: "saved"; duplicate: boolean }
  | { status: "rejected"; reason: string };

const rejected = (reason: string): SaveOutcome => ({ status: "rejected", reason });

async function sha256Of(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"));
  return Schema.decodeSync(Sha256)(hex.join(""));
}

async function pixelSizeOf(file: File) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/** Saves one image file into the library. The bytes go straight to R2, and only when the library does not hold them yet. */
export function useSaveImage() {
  const prepareUpload = useMutation(refs.public.library.prepareUpload);
  const save = useAction(refs.public.library.save);

  return useCallback(
    async (file: File): Promise<SaveOutcome> => {
      const size = await pixelSizeOf(file);
      if (!size) return rejected("UnsupportedImage");
      const sha256 = await sha256Of(file);

      const prepared = await prepareUpload({ sha256 });
      if (Result.isFailure(prepared)) return rejected(prepared.failure._tag);
      if (prepared.success.status === "upload") {
        const uploaded = await fetch(prepared.success.url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!uploaded.ok) return rejected("UploadFailed");
      }

      const saved = await save({ sha256, fileName: file.name, ...size });
      return Result.isFailure(saved)
        ? rejected(saved.failure._tag)
        : { status: "saved", duplicate: saved.success.duplicate };
    },
    [prepareUpload, save],
  );
}
