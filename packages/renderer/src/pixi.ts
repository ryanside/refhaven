import type { Camera, SceneItem } from "@refhaven/scene";
import { worldToScreen } from "@refhaven/scene";
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
  const textures = new Map<string, Texture>();
  const drawn = new Map<string, { item: SceneItem; sprite: Sprite }>();

  return {
    setCamera(next) {
      camera = next;
    },
    upsertItems(items) {
      for (const item of items) {
        const existing = drawn.get(item.key);
        if (existing) {
          existing.item = item;
          continue;
        }
        const sprite = new Sprite();
        sprite.anchor.set(0.5);
        drawn.set(item.key, { item, sprite });
      }
      app.stage.removeChildren();
      const ordered = [...drawn.values()].sort((a, b) =>
        a.item.z < b.item.z ? -1 : a.item.z > b.item.z ? 1 : 0,
      );
      for (const { sprite } of ordered) app.stage.addChild(sprite);
    },
    removeItems(keys) {
      for (const key of keys) {
        drawn.get(key)?.sprite.destroy();
        drawn.delete(key);
      }
    },
    uploadTexture(key, source) {
      textures.get(key)?.destroy(true);
      textures.set(key, Texture.from(source));
    },
    evictTexture(key) {
      textures.get(key)?.destroy(true);
      textures.delete(key);
    },
    draw() {
      // Positions are made camera-relative here, in float64, so the GPU
      // only ever sees small float32 screen coordinates.
      for (const { item, sprite } of drawn.values()) {
        const texture = textures.get(item.texture);
        sprite.visible = texture !== undefined;
        if (!texture) continue;
        const screen = worldToScreen(camera, item);
        sprite.texture = texture;
        sprite.position.set(screen.x, screen.y);
        sprite.scale.set(item.scale * camera.zoom);
        sprite.rotation = item.rotation;
      }
      app.render();
    },
    destroy() {
      app.destroy(true, { children: true, texture: true });
      textures.clear();
      drawn.clear();
    },
  };
}
