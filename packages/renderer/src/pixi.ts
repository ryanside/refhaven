import type { Camera, SceneItem } from "@refhaven/scene";
import { worldToScreen } from "@refhaven/scene";
import { Application, Sprite, Texture } from "pixi.js";
import type { Renderer } from "./index";

const drawOrder = (a: SceneItem, b: SceneItem) =>
  a.z < b.z ? -1 : a.z > b.z ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

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
      textures.get(key)?.destroy(true);
      textures.set(key, Texture.from(source));
    },
    evictTexture(key) {
      const texture = textures.get(key);
      if (!texture) return;
      for (const { sprite } of drawn.values()) {
        if (sprite.texture === texture) sprite.texture = Texture.EMPTY;
      }
      texture.destroy(true);
      textures.delete(key);
    },
    draw() {
      if (reorder) {
        reorder = false;
        app.stage.removeChildren();
        const ordered = [...drawn.values()].sort((a, b) => drawOrder(a.item, b.item));
        for (const { sprite } of ordered) app.stage.addChild(sprite);
      }
      // Positions are made camera-relative here, in float64, so the GPU
      // only ever sees small float32 screen coordinates.
      for (const { item, sprite } of drawn.values()) {
        const texture = textures.get(item.texture);
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
      app.destroy(true, { children: true, texture: true });
      textures.clear();
      drawn.clear();
    },
  };
}
