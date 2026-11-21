import { api } from "@refhaven/backend/api";
import { type ImageRole, signedUrlSeconds } from "@refhaven/backend/blob";
import type { Id } from "@refhaven/backend/id";
import { useConvex } from "convex/react";
import { useEffect, useState } from "react";

type SignedUrl = { url: string; signedAt: number };
type SignedUrls = ReadonlyMap<Id<"refs">, SignedUrl>;

const urlsPerCall = 100;
const retryAfterMs = 5000;
export const usableForMs = (signedUrlSeconds - 10 * 60) * 1000;

export function refIdsToSign(refIds: ReadonlyArray<Id<"refs">>, known: SignedUrls, now: number) {
  return refIds.filter((refId) => {
    const signed = known.get(refId);
    return !signed || now - signed.signedAt >= usableForMs;
  });
}

/**
 * Signed URLs by ref for one role of each image. A URL is kept until shortly before it
 * expires, because a new URL for the same image makes the browser download the image again.
 */
export function useRefUrls(refIds: ReadonlyArray<Id<"refs">>, role: ImageRole) {
  const convex = useConvex();
  const [signed, setSigned] = useState<SignedUrls>(new Map());
  const [recheck, setRecheck] = useState(0);
  // A new array of the same IDs, as a render makes, must not sign them again.
  const wanted = refIds.join(" ");

  useEffect(() => {
    const refIds = wanted === "" ? [] : (wanted.split(" ") as Array<Id<"refs">>);
    const now = Date.now();
    const toSign = refIdsToSign(refIds, signed, now);
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recheckIn = (ms: number) => {
      timer = setTimeout(() => setRecheck((count) => count + 1), ms);
    };

    if (toSign.length > 0) {
      convex.mutation(api.library.urls, { refIds: toSign.slice(0, urlsPerCall), role }).then(
        (fresh) => {
          if (!current) return;
          setSigned(
            (known) =>
              new Map([
                ...known,
                ...fresh.map(({ refId, url }) => [refId, { url, signedAt: now }] as const),
              ]),
          );
        },
        () => {
          if (current) recheckIn(retryAfterMs);
        },
      );
    } else if (refIds.length > 0) {
      const oldest = Math.min(...refIds.map((refId) => signed.get(refId)!.signedAt));
      recheckIn(oldest + usableForMs - now);
    }

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [convex, wanted, role, signed, recheck]);

  return signed;
}
