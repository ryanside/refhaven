import type { Id } from "@refhaven/backend/id";
import { expect, test } from "vitest";
import { refIdsToSign, usableForMs } from "./use-ref-urls";

const fresh = "fresh" as Id<"refs">;
const aging = "aging" as Id<"refs">;
const unknown = "unknown" as Id<"refs">;
const now = 10_000_000;

test("a URL is signed again once it is past its usable life, and an unknown ref is signed", () => {
  const known = new Map([
    [fresh, { url: "https://example.test/fresh", signedAt: now - usableForMs + 1 }],
    [aging, { url: "https://example.test/aging", signedAt: now - usableForMs }],
  ]);

  expect(refIdsToSign([fresh, aging, unknown], known, now)).toEqual([aging, unknown]);
});

test("a URL stops being used before the server lets it expire", async () => {
  const { signedUrlSeconds } = await import("@refhaven/backend/blob");

  expect(usableForMs).toBeLessThan(signedUrlSeconds * 1000);
});
