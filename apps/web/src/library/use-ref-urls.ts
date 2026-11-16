import { api } from "@refhaven/backend/api";
import { signedUrlSeconds } from "@refhaven/backend/blob";
import type { Id } from "@refhaven/backend/id";
import { useConvex } from "convex/react";
import { useEffect, useState } from "react";

type SignedUrl = { url: string; signedAt: number };

const urlsPerCall = 100;
const usableForMs = (signedUrlSeconds / 2) * 1000;

/**
 * Signed image URLs by ref. A URL is fetched once and kept, because a new URL for the same
 * image would make the browser download the image again.
 */
export function useRefUrls(refIds: ReadonlyArray<Id<"refs">>) {
  const convex = useConvex();
  const [signed, setSigned] = useState<ReadonlyMap<Id<"refs">, SignedUrl>>(new Map());

  useEffect(() => {
    const now = Date.now();
    const missing = refIds.filter((refId) => {
      const known = signed.get(refId);
      return !known || now - known.signedAt > usableForMs;
    });
    if (missing.length === 0) return;

    let current = true;
    void convex
      .mutation(api.library.urls, { refIds: missing.slice(0, urlsPerCall) })
      .then((fresh) => {
        if (!current) return;
        setSigned(
          (known) =>
            new Map([
              ...known,
              ...fresh.map(({ refId, url }) => [refId, { url, signedAt: now }] as const),
            ]),
        );
      });
    return () => {
      current = false;
    };
  }, [convex, refIds, signed]);

  return signed;
}
