import { usePaginatedQuery } from "@confect/react";
import refs from "@refhaven/backend/refs";
import type { Renderer } from "@refhaven/renderer";
import { createPixiRenderer } from "@refhaven/renderer/pixi";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRefUrls } from "@/library/use-ref-urls";

export const Route = createFileRoute("/_app/lab/texture")({
  component: TextureLab,
});

const drawnImages = 4;
const itemSize = 256;
const firstItemCenter = { x: 160, y: 160 };
const itemSpacing = 280;

type Drawn =
  | { status: "drawn"; textures: number; firstItemPixel: string }
  | { status: "failed"; error: string };

function TextureLab() {
  const library = usePaginatedQuery(refs.public.library.list, {}, { initialNumItems: drawnImages });
  const items = useMemo(() => library.results.slice(0, drawnImages), [library.results]);
  const urls = useRefUrls(useMemo(() => items.map((item) => item.refId), [items]));
  const ready = items.length > 0 && items.every((item) => urls.has(item.refId));

  const host = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<Renderer>();
  const [drawn, setDrawn] = useState<Drawn>();

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false;
    let created: Renderer | undefined;
    void createPixiRenderer(container).then((next) => {
      if (disposed) {
        next.destroy();
        return;
      }
      created = next;
      setRenderer(next);
    });
    return () => {
      disposed = true;
      created?.destroy();
      setRenderer(undefined);
    };
  }, []);

  useEffect(() => {
    const container = host.current;
    if (!renderer || !ready || !container) return;
    let current = true;
    const drawImages = async () => {
      for (const [index, item] of items.entries()) {
        const response = await fetch(urls.get(item.refId)!.url);
        const bitmap = await createImageBitmap(await response.blob());
        if (!current) return;
        renderer.uploadTexture(item.refId, bitmap);
        renderer.upsertItems([
          {
            key: item.refId,
            texture: item.refId,
            x: firstItemCenter.x + index * itemSpacing,
            y: firstItemCenter.y,
            scale: itemSize / Math.max(item.width, item.height),
            rotation: 0,
            z: String(index).padStart(4, "0"),
          },
        ]);
      }
      renderer.draw();
      setDrawn({
        status: "drawn",
        textures: items.length,
        firstItemPixel: readPixel(container, firstItemCenter),
      });
    };
    drawImages().catch((error: unknown) => {
      if (current) setDrawn({ status: "failed", error: String(error) });
    });
    return () => {
      current = false;
    };
  }, [renderer, ready, items, urls]);

  return (
    <main className="flex flex-col gap-3 p-6">
      <h1 className="font-medium">Lab: R2 image as a WebGL texture</h1>
      <p>
        This draws the {drawnImages} newest images of your{" "}
        <Link to="/library" className="underline">
          library
        </Link>{" "}
        with the PixiJS renderer.
      </p>
      <p
        data-testid="drawn"
        data-status={drawn?.status}
        data-textures={drawn?.status === "drawn" ? drawn.textures : undefined}
        data-first-item-pixel={drawn?.status === "drawn" ? drawn.firstItemPixel : undefined}
      >
        {drawn === undefined
          ? "Nothing drawn yet."
          : drawn.status === "failed"
            ? drawn.error
            : `${drawn.textures} textures drawn. The first item's center pixel is ${drawn.firstItemPixel}.`}
      </p>
      <div ref={host} className="h-80 w-full border" />
    </main>
  );
}

function readPixel(container: HTMLElement, point: { x: number; y: number }) {
  const canvas = container.querySelector("canvas");
  const gl = canvas?.getContext("webgl2");
  if (!canvas || !gl) return "unreadable";
  const ratio = canvas.width / canvas.clientWidth;
  const pixel = new Uint8Array(4);
  gl.readPixels(
    Math.round(point.x * ratio),
    canvas.height - Math.round(point.y * ratio),
    1,
    1,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixel,
  );
  return `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
}
