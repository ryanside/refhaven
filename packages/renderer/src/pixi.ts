import type { Camera, SceneItem } from "@refhaven/scene";
import { stackOrder, worldToScreen } from "@refhaven/scene";
import { Application, Sprite, Texture } from "pixi.js";
import type { Renderer } from "./index";

export async function createPixiRenderer(container: HTMLElement): Promise<Renderer> {
  const app = new Application();
  await app.init({
    preference: "webgl",
    resizeTo: container,
    autoStart: false,
    autoDensity: true,
    resolution: window.devicePixelRatio,
    backgroundAlpha: 0,
  });
  container.appendChild(app.canvas);

  let camera: Camera = { x: 0, y: 0, zoom: 1 };
  let reorder = false;
  const textures = new Map<string, { texture: Texture; source: ImageBitmap }>();
  const drawn = new Map<string, { item: SceneItem; sprite: Sprite }>();

  const evict = (key: string) => {
    const entry = textures.get(key);
    if (!entry) return;
    for (const { sprite } of drawn.values()) {
      if (sprite.texture === entry.texture) sprite.texture = Texture.EMPTY;
    }
    entry.texture.destroy(true);
    entry.source.close();
    textures.delete(key);
  };

  return {
    setCamera(next) {
      camera = next;
    },
    upsertItems(items) {
      for (const item of items) {
        const existing = drawn.get(item.key);
        if (existing) {
          reorder ||= existing.item.z !== item.z;
          existing.item = item;
          continue;
        }
        const sprite = new Sprite();
        sprite.anchor.set(0.5);
        drawn.set(item.key, { item, sprite });
        reorder = true;
      }
    },
    removeItems(keys) {
      for (const key of keys) {
        drawn.get(key)?.sprite.destroy();
        drawn.delete(key);
      }
    },
    uploadTexture(key, source) {
      evict(key);
      textures.set(key, { texture: Texture.from(source), source });
    },
    evictTexture: evict,
    draw() {
      if (reorder) {
        reorder = false;
        app.stage.removeChildren();
        const ordered = [...drawn.values()].sort((a, b) => stackOrder(a.item, b.item));
        for (const { sprite } of ordered) app.stage.addChild(sprite);
      }
      // Positions are made camera-relative here, in float64, so the GPU
      // only ever sees small float32 screen coordinates.
      for (const { item, sprite } of drawn.values()) {
        const texture = textures.get(item.texture)?.texture;
        sprite.visible = texture !== undefined;
        if (!texture) continue;
        const screen = worldToScreen(camera, item);
        sprite.texture = texture;
        sprite.position.set(screen.x, screen.y);
        // The size comes from the item, so a texture of any resolution covers the same area.
        sprite.scale.set(
          (item.width * camera.zoom) / texture.width,
          (item.height * camera.zoom) / texture.height,
        );
        sprite.rotation = item.rotation;
      }
      app.render();
    },
    destroy() {
      // Destroying the stage frees only the textures its sprites show. An uploaded texture that
      // no sprite shows, such as a thumbnail its display copy replaced, is freed here.
      for (const key of textures.keys()) evict(key);
      app.destroy(true, { children: true });
      drawn.clear();
    },
  };
}
