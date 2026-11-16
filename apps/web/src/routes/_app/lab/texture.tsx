import { QueryResult, useQuery } from "@confect/react";
import { useUploadFile } from "@convex-dev/r2/react";
import { api } from "@refhaven/backend/api";
import refs from "@refhaven/backend/refs";
import type { Renderer } from "@refhaven/renderer";
import { createPixiRenderer } from "@refhaven/renderer/pixi";
import { Button } from "@refhaven/ui/components/button";
import { Input } from "@refhaven/ui/components/input";
import { Label } from "@refhaven/ui/components/label";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/_app/lab/texture")({
  component: TextureLab,
});

const firstItemCenter = { x: 160, y: 160 };
const itemSpacing = 280;

type Drawn =
  | { status: "drawn"; textures: number; firstItemPixel: string }
  | { status: "failed"; error: string };

function TextureLab() {
  const uploadFile = useUploadFile(api.images);
  const result = useQuery(refs.public.images.list, {});
  const images = QueryResult.isSuccess(result) ? result.value : undefined;

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
    if (!renderer || !images || !container) return;
    let current = true;
    const drawImages = async () => {
      for (const [index, image] of images.entries()) {
        const response = await fetch(image.url);
        const bitmap = await createImageBitmap(await response.blob());
        if (!current) return;
        renderer.uploadTexture(image.key, bitmap);
        renderer.upsertItems([
          {
            key: image.key,
            texture: image.key,
            x: firstItemCenter.x + index * itemSpacing,
            y: firstItemCenter.y,
            scale: 1,
            rotation: 0,
            z: String(index).padStart(4, "0"),
          },
        ]);
      }
      renderer.draw();
      setDrawn({
        status: "drawn",
        textures: images.length,
        firstItemPixel: readPixel(container, firstItemCenter),
      });
    };
    drawImages().catch((error: unknown) => {
      if (current) setDrawn({ status: "failed", error: String(error) });
    });
    return () => {
      current = false;
    };
  }, [renderer, images]);

  return (
    <main className="flex flex-col gap-3 p-6">
      <h1 className="font-medium">Lab: R2 image as a WebGL texture</h1>
      <form
        className="flex items-end gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const file = new FormData(form).get("image");
          if (!(file instanceof File) || file.size === 0) return;
          try {
            await uploadFile(file);
            form.reset();
          } catch (error) {
            setDrawn({ status: "failed", error: String(error) });
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="image">Image</Label>
          <Input id="image" name="image" type="file" accept="image/*" />
        </div>
        <Button type="submit">Upload</Button>
      </form>
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
