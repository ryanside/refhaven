import type { Renderer } from "@refhaven/renderer";
import { afterEach, expect, test, vi } from "vitest";
import { createTextureLoader } from "./textures";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("a load that fails is tried again after a wait, with no new input, and not before", async () => {
  vi.useFakeTimers();
  const uploaded: Array<string> = [];
  const renderer = {
    uploadTexture: (key: string) => uploaded.push(key),
    evictTexture: () => {},
  } as unknown as Renderer;
  let fetches = 0;
  vi.stubGlobal("fetch", async () => {
    fetches += 1;
    if (fetches === 1) throw new TypeError("network changed");
    return new Response("bytes");
  });
  vi.stubGlobal("createImageBitmap", async () => ({ close: () => {} }));

  const need = { refId: "ref1", role: "thumbnail" } as const;
  const sign = async (refIds: ReadonlyArray<string>) =>
    refIds.map((refId) => ({ refId, url: `https://images.test/${refId}` }));
  const redraw = () => loader.update([need]);
  const loader = createTextureLoader(renderer, sign, redraw);

  loader.update([need]);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetches).toBe(1);
  expect(uploaded).toEqual([]);

  loader.update([need]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetches).toBe(1);

  await vi.advanceTimersByTimeAsync(1500);
  expect(fetches).toBe(2);
  expect(uploaded).toEqual(["ref1/thumbnail"]);
  expect(loader.has(need)).toBe(true);
});
