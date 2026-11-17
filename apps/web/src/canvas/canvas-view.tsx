import { QueryResult, useMutation, useQuery } from "@confect/react";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import type { Renderer } from "@refhaven/renderer";
import { createPixiRenderer } from "@refhaven/renderer/pixi";
import {
  type CanvasItem,
  type Drop,
  type ImageRole,
  type Point,
  type SceneItem,
  type SceneStore,
  createSceneStore,
  imageRole,
  itemsInView,
  placedEdge,
  placementGap,
  screenToWorld,
  worldToScreen,
} from "@refhaven/scene";
import * as Result from "effect/Result";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { type PlaceAt, SaveImages } from "@/library/save-images";
import { type Need, type Sign, createTextureLoader, textureKey } from "./textures";

/** A change list longer than this is replaced by a new snapshot. */
const snapshotAfterChanges = 200;

/** Textures load for items this many screen pixels outside the viewport too. */
const loadMargin = 256;

type Base = { canvasId: Id<"canvases">; rev: number };

/** The canvas of a set: the collection's, or the whole library's when `collectionId` is absent. */
export function CanvasView({
  collectionId,
  children,
}: {
  collectionId?: Id<"collections">;
  children: ReactNode;
}) {
  const [store] = useState(createSceneStore);
  const host = useRef<HTMLDivElement>(null);
  const outlines = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<string>();

  const open = useMutation(refs.public.canvas.open);
  const apply = useMutation(refs.public.canvas.apply);
  const urls = useMutation(refs.public.library.urls);
  const [base, setBase] = useState<Base>();
  const snapshotting = useRef(false);

  const takeSnapshot = useCallback(async () => {
    if (snapshotting.current) return;
    snapshotting.current = true;
    try {
      const opened = await open(collectionId === undefined ? {} : { collectionId });
      if (Result.isFailure(opened)) {
        setProblem(opened.failure._tag);
        return;
      }
      if (store.loadSnapshot(opened.success)) {
        setBase({ canvasId: opened.success.canvasId, rev: opened.success.rev });
      }
    } finally {
      snapshotting.current = false;
    }
  }, [collectionId, open, store]);

  useEffect(() => {
    void takeSnapshot();
  }, [takeSnapshot]);

  const changes = useQuery(refs.public.canvas.changes, base ?? "skip");
  useEffect(() => {
    if (!QueryResult.isSuccess(changes)) return;
    store.applyChanges(changes.value);
    if (changes.value.items.length > snapshotAfterChanges) void takeSnapshot();
  }, [changes, store, takeSnapshot]);

  const save = useRef((drop: Drop) => store.reject(drop.save));
  useEffect(() => {
    save.current = (drop) => {
      if (!base) return store.reject(drop.save);
      apply({
        canvasId: base.canvasId,
        ops: drop.moves.map(({ key, x, y }) => ({ op: "patch" as const, key, fields: { x, y } })),
      }).then(
        (result) => {
          if (Result.isSuccess(result)) {
            store.acknowledge(drop.save, result.success);
          } else {
            store.reject(drop.save);
            setProblem("A move could not be saved.");
          }
        },
        () => {
          store.reject(drop.save);
          setProblem("A move could not be saved.");
        },
      );
    };
  }, [apply, base, store]);

  // An upload can outlast the first snapshot, so a placement reads the canvas when it runs.
  const latestBase = useRef(base);
  useEffect(() => {
    latestBase.current = base;
  }, [base]);
  // The images of one drop or paste go in a row from its point, a placed image's longer edge plus
  // the gap apart, so they never overlap.
  const placeAt = useCallback<PlaceAt>(
    (at) => {
      const box = host.current!.getBoundingClientRect();
      const start = screenToWorld(
        store.camera(),
        at ? { x: at.x - box.left, y: at.y - box.top } : { x: box.width / 2, y: box.height / 2 },
      );
      let placed = 0;
      return async (refId) => {
        const x = start.x + placed++ * (placedEdge + placementGap);
        const canvasId = latestBase.current?.canvasId;
        const result = canvasId
          ? await apply({ canvasId, ops: [{ op: "add", refId, x, y: start.y }] })
          : null;
        if (!result || Result.isFailure(result)) setProblem("An image could not be placed.");
      };
    },
    [apply, store],
  );

  useEffect(() => {
    const sign: Sign = async (refIds, role) => {
      const result = await urls({ refIds: refIds as Array<Id<"refs">>, role });
      return Result.isSuccess(result) ? result.success : [];
    };
    return drive(store, host.current!, outlines.current!, sign, (drop) => save.current(drop));
  }, [store, urls]);

  return (
    <main className="relative flex-1 overflow-hidden">
      <div ref={host} data-testid="canvas" className="absolute inset-0 touch-none select-none" />
      <div ref={outlines} className="pointer-events-none absolute inset-0" />
      <div className="absolute top-3 left-3 flex flex-col gap-1 rounded-md border bg-background p-2">
        {children}
        <SaveImages collectionId={collectionId} placeAt={placeAt} />
        <Readout store={store} />
        {problem ? <p role="alert">{problem}</p> : null}
      </div>
    </main>
  );
}

function Readout({ store }: { store: SceneStore }) {
  const { items, selected, camera } = useSyncExternalStore(store.subscribe, store.summary);
  return (
    <p
      data-testid="canvas-readout"
      data-items={items}
      data-zoom={camera.zoom * 100}
      data-camera-x={camera.x}
      data-camera-y={camera.y}
      data-selected={selected}
    >
      {items} images, {Math.round(camera.zoom * 100)}%, at {Math.round(camera.x)},{" "}
      {Math.round(camera.y)}, {selected} selected
    </p>
  );
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches("input, textarea, select, button"));

/** Wires input, textures, and drawing to the store. Draws once per animation frame after a change. */
function drive(
  store: SceneStore,
  host: HTMLDivElement,
  outlines: HTMLDivElement,
  sign: Sign,
  save: (drop: Drop) => void,
) {
  let renderer: Renderer | undefined;
  let textures: ReturnType<typeof createTextureLoader> | undefined;
  let frame = 0;
  let disposed = false;
  let spaceHeld = false;
  let pointerId: number | null = null;
  const drawn = new Map<string, SceneItem>();

  const requestDraw = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(draw);
  };

  const textureFor = (item: CanvasItem, wanted: ImageRole): Need => {
    const display = { refId: item.refId, role: "display" } as const;
    const thumbnail = { refId: item.refId, role: "thumbnail" } as const;
    if (wanted === "display" && textures!.has(display)) return display;
    if (textures!.has(thumbnail) || !textures!.has(display)) return thumbnail;
    return display;
  };

  function draw() {
    frame = 0;
    if (!renderer || !textures) return;
    const camera = store.camera();
    const viewport = store.viewport();
    const items = store.items();
    const roles = new Map(
      itemsInView(items, camera, viewport, loadMargin).map((item) => [
        item.key,
        imageRole(item, camera.zoom * devicePixelRatio),
      ]),
    );
    const byKey = new Map(items.map((item) => [item.key, item]));
    const near = [...roles].map(([key, role]) => ({ refId: byKey.get(key)!.refId, role }));
    textures.update([
      ...near.map(({ refId }) => ({ refId, role: "thumbnail" as const })),
      ...near.filter(({ role }) => role === "display"),
    ]);

    const visible = new Set(itemsInView(items, camera, viewport, 0).map(({ key }) => key));
    let thumbnails = 0;
    const displays: Array<string> = [];
    const changed: Array<SceneItem> = [];
    for (const item of items) {
      const need = textureFor(item, roles.get(item.key) ?? "thumbnail");
      if (visible.has(item.key) && textures.has(need)) {
        if (need.role === "display") displays.push(item.key);
        else thumbnails += 1;
      }
      const next: SceneItem = {
        key: item.key,
        texture: textureKey(need),
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation,
        z: item.z,
      };
      const before = drawn.get(item.key);
      if (
        !before ||
        (Object.keys(next) as Array<keyof SceneItem>).some((field) => before[field] !== next[field])
      ) {
        drawn.set(item.key, next);
        changed.push(next);
      }
    }
    const gone = [...drawn.keys()].filter((key) => !byKey.has(key));
    for (const key of gone) drawn.delete(key);
    renderer.removeItems(gone);
    renderer.upsertItems(changed);
    renderer.setCamera(camera);
    renderer.draw();
    host.dataset.shownThumbnails = String(thumbnails);
    host.dataset.displayKeys = displays.join(" ");
    drawOutlines(outlines, store, byKey);
  }

  void createPixiRenderer(host).then((created) => {
    if (disposed) {
      created.destroy();
      return;
    }
    renderer = created;
    textures = createTextureLoader(created, sign, requestDraw);
    requestDraw();
  });
  const unsubscribe = store.subscribe(requestDraw);

  const resize = new ResizeObserver(() =>
    store.setViewport({ width: host.clientWidth, height: host.clientHeight }),
  );
  resize.observe(host);

  const at = (event: MouseEvent): Point => {
    const box = host.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const onPointerDown = (event: PointerEvent) => {
    if (pointerId !== null) return;
    if (event.button === 1 || (event.button === 0 && spaceHeld)) {
      event.preventDefault();
      store.startPan(at(event));
    } else if (event.button === 0) {
      store.press(at(event), event.shiftKey);
    } else {
      return;
    }
    pointerId = event.pointerId;
    host.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId === pointerId) store.move(at(event));
  };
  // A release outside the window, or a switch to another window, sends no pointerup. The gesture
  // ends on a lost capture and on blur too, or the next pointer move would keep dragging.
  const endGesture = () => {
    if (pointerId === null) return;
    const ended = pointerId;
    pointerId = null;
    if (host.hasPointerCapture(ended)) host.releasePointerCapture(ended);
    const drop = store.release();
    if (drop) save(drop);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId === pointerId) endGesture();
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const perUnit = [1, 16, host.clientHeight][event.deltaMode] ?? 1;
    const delta = { x: event.deltaX * perUnit, y: event.deltaY * perUnit };
    if (event.ctrlKey) {
      store.zoom(at(event), Math.exp(-delta.y / 200));
    } else {
      store.scroll(delta);
    }
  };
  const setSpace = (held: boolean) => {
    spaceHeld = held;
    host.style.cursor = held ? "grab" : "";
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== "Space" || typing(event.target)) return;
    event.preventDefault();
    setSpace(true);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code === "Space") setSpace(false);
  };
  const onBlur = () => {
    setSpace(false);
    endGesture();
  };

  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerup", onPointerUp);
  host.addEventListener("pointercancel", onPointerUp);
  host.addEventListener("lostpointercapture", onPointerUp);
  host.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    unsubscribe();
    resize.disconnect();
    host.removeEventListener("pointerdown", onPointerDown);
    host.removeEventListener("pointermove", onPointerMove);
    host.removeEventListener("pointerup", onPointerUp);
    host.removeEventListener("pointercancel", onPointerUp);
    host.removeEventListener("lostpointercapture", onPointerUp);
    host.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    textures?.stop();
    renderer?.destroy();
  };
}

/** Keeps one outline element per selected item over its screen rectangle. */
function drawOutlines(
  layer: HTMLDivElement,
  store: SceneStore,
  byKey: ReadonlyMap<string, CanvasItem>,
) {
  const camera = store.camera();
  const selection = store.selection();
  for (const element of [...layer.children] as Array<HTMLElement>) {
    if (!selection.has(element.dataset.outlineKey!)) element.remove();
  }
  for (const key of selection) {
    const item = byKey.get(key);
    if (!item) continue;
    let element = layer.querySelector<HTMLElement>(`[data-outline-key="${CSS.escape(key)}"]`);
    if (!element) {
      element = document.createElement("div");
      element.dataset.outlineKey = key;
      element.className = "absolute border-2 border-primary";
      layer.appendChild(element);
    }
    const center = worldToScreen(camera, item);
    const width = item.width * camera.zoom;
    const height = item.height * camera.zoom;
    element.style.left = `${center.x - width / 2}px`;
    element.style.top = `${center.y - height / 2}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    element.style.transform = `rotate(${item.rotation}rad)`;
  }
}
