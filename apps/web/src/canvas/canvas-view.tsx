import { QueryResult, useMutation, useQuery } from "@confect/react";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import type { Renderer } from "@refhaven/renderer";
import { Button } from "@refhaven/ui/components/button";
import { createPixiRenderer } from "@refhaven/renderer/pixi";
import {
  type CanvasItem,
  type Drop,
  type Entry,
  type History,
  type ImageRole,
  type ItemOp,
  type Point,
  type SceneItem,
  type SceneStore,
  addEntry,
  createHistory,
  createSceneStore,
  imageRole,
  itemsInView,
  placedEdge,
  placementGap,
  removalEntry,
  screenToWorld,
  worldToScreen,
} from "@refhaven/scene";
import { useHotkeys } from "@tanstack/react-hotkeys";
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
import { type Action, keymap } from "./keymap";
import { type Need, type Sign, createTextureLoader, textureKey } from "./textures";

/** A change list longer than this is replaced by a new snapshot. */
const snapshotAfterChanges = 200;

/** Textures load for items this many screen pixels outside the viewport too. */
const loadMargin = 256;

type Base = { canvasId: Id<"canvases">; rev: number };

const toApplyOp = (op: ItemOp) => (op.op === "add" ? { ...op, refId: op.refId as Id<"refs"> } : op);

/**
 * Resolves when the store has applied the server's `rev`. The wait is bounded, so a change list
 * that never arrives cannot hold up the edits that follow.
 */
const reached = (store: SceneStore, rev: number) =>
  new Promise<void>((resolve) => {
    if (store.rev() >= rev) return resolve();
    const done = () => {
      clearTimeout(timer);
      stop();
      resolve();
    };
    const stop = store.subscribe(() => {
      if (store.rev() >= rev) done();
    });
    const timer = setTimeout(done, 5000);
  });

/** The canvas of a set: the collection's, or the whole library's when `collectionId` is absent. */
export function CanvasView({
  collectionId,
  children,
}: {
  collectionId?: Id<"collections">;
  children: ReactNode;
}) {
  const [store] = useState(createSceneStore);
  const [history] = useState(createHistory);
  const host = useRef<HTMLDivElement>(null);
  const outlines = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<string>();

  const open = useMutation(refs.public.canvas.open);
  const apply = useMutation(refs.public.canvas.apply);
  const urls = useMutation(refs.public.library.urls);
  const [base, setBase] = useState<Base>();
  const [offCanvas, setOffCanvas] = useState(0);
  const snapshotting = useRef(false);

  const takeSnapshot = useCallback(
    async (placeRemoved = false) => {
      if (snapshotting.current) return;
      snapshotting.current = true;
      try {
        const opened = await open(
          collectionId === undefined ? { placeRemoved } : { collectionId, placeRemoved },
        );
        if (Result.isFailure(opened)) {
          setProblem(opened.failure._tag);
          return;
        }
        if (store.loadSnapshot(opened.success)) {
          setBase({ canvasId: opened.success.canvasId, rev: opened.success.rev });
          setOffCanvas(opened.success.removed);
          // Putting images back is an edit like a drop, so it can be undone and it empties redo.
          if (placeRemoved && opened.success.placed > 0) {
            history.record(addEntry(opened.success.items.slice(-opened.success.placed)));
          }
        }
      } finally {
        snapshotting.current = false;
      }
    },
    [collectionId, history, open, store],
  );

  useEffect(() => {
    void takeSnapshot();
  }, [takeSnapshot]);

  const changes = useQuery(refs.public.canvas.changes, base ?? "skip");
  useEffect(() => {
    if (!QueryResult.isSuccess(changes)) return;
    store.applyChanges(changes.value);
    if (changes.value.items.length > snapshotAfterChanges) void takeSnapshot();
  }, [changes, store, takeSnapshot]);

  // An upload can outlast the first snapshot, so a call reads the canvas when it runs.
  const latestBase = useRef(base);
  useEffect(() => {
    latestBase.current = base;
  }, [base]);

  /** Saves ops with one call, and settles the hold that shows their positions. */
  const send = useCallback(
    async (ops: ReadonlyArray<ItemOp>, save: number) => {
      const canvasId = latestBase.current?.canvasId;
      const result = canvasId
        ? await apply({ canvasId, ops: ops.map(toApplyOp) }).catch(() => null)
        : null;
      if (result && Result.isSuccess(result)) {
        store.acknowledge(save, result.success);
        return result.success;
      }
      store.reject(save);
      return null;
    },
    [apply, store],
  );

  // Every edit and every undo runs after the one before it has reached this page through
  // `canvas.changes`. Removals and adds show only then, so an undo pressed right after one, or
  // twice in a row, would otherwise be judged against a canvas that has not changed yet.
  const queue = useRef(Promise.resolve());
  /** Runs `save` in turn. It resolves to the rev it wrote, or null when it wrote nothing. */
  const inOrder = useCallback(
    (save: () => Promise<number | null>) => {
      queue.current = queue.current.then(async () => {
        const rev = await save();
        if (rev !== null) await reached(store, rev);
      });
      return queue.current;
    },
    [store],
  );

  /** Records an edit for undo and saves it. An edit that is not saved leaves the stack. */
  const edit = useCallback(
    (entry: Entry, save: number, failure: string) => {
      history.record(entry);
      return inOrder(async () => {
        const rev = await send(entry.redo, save);
        if (rev === null) {
          history.drop(entry);
          setProblem(failure);
        }
        return rev;
      });
    },
    [history, inOrder, send],
  );

  // A gesture holds the places its items had when it began. Undoing under it would leave those
  // places stale, so history and removal wait for the pointer to let go.
  const step = useCallback(
    (direction: "undo" | "redo") =>
      void inOrder(async () => {
        if (store.gesture().kind !== "idle") return null;
        const entry = direction === "undo" ? history.undo() : history.redo();
        if (!entry) return null;
        const ops = entry[direction];
        const rev = store.applies(ops) ? await send(ops, store.hold(ops)) : null;
        if (rev === null) {
          history.drop(entry);
          setProblem(`That change could not be ${direction === "undo" ? "undone" : "redone"}.`);
        }
        return rev;
      }),
    [history, inOrder, send, store],
  );

  const removeSelection = useCallback(() => {
    if (store.gesture().kind !== "idle") return;
    const selection = store.selection();
    const chosen = store.items().filter((item) => selection.has(item.key));
    if (chosen.length === 0) return;
    store.clearSelection();
    const entry = removalEntry(chosen);
    void edit(entry, store.hold(entry.redo), "An image could not be removed.");
  }, [edit, store]);

  const actions: Record<Action, () => void> = {
    remove: removeSelection,
    undo: () => step("undo"),
    redo: () => step("redo"),
    selectAll: store.selectAll,
    clearSelection: store.clearSelection,
  };
  useHotkeys(
    keymap.map(({ hotkey, action }) => ({ hotkey, callback: actions[action] })),
    { ignoreInputs: true },
  );

  const onDrop = useRef((drop: Drop) => store.reject(drop.save));
  useEffect(() => {
    onDrop.current = (drop) => void edit(drop.entry, drop.save, "A move could not be saved.");
  }, [edit]);
  // The images of one drop or paste go in a row from its point, a placed image's longer edge plus
  // the gap apart, so they never overlap.
  const placeAt = useCallback<PlaceAt>(
    (at) => {
      const box = host.current!.getBoundingClientRect();
      const toWorld = () =>
        screenToWorld(
          store.camera(),
          at ? { x: at.x - box.left, y: at.y - box.top } : { x: box.width / 2, y: box.height / 2 },
        );
      // The first snapshot fits the camera to the items. A point read before that would end up
      // somewhere else on screen, so a drop that comes earlier is read when its first image is placed.
      let start = latestBase.current ? toWorld() : null;
      let placed = 0;
      return async (refId) => {
        start ??= toWorld();
        const x = start.x + placed++ * (placedEdge + placementGap);
        const entry = addEntry([{ refId, x, y: start.y }]);
        await edit(entry, store.hold(entry.redo), "An image could not be placed.");
      };
    },
    [edit, store],
  );

  useEffect(() => {
    const sign: Sign = async (refIds, role) => {
      const result = await urls({ refIds: refIds as Array<Id<"refs">>, role });
      return Result.isSuccess(result) ? result.success : [];
    };
    return drive(store, host.current!, outlines.current!, sign, (drop) => onDrop.current(drop));
  }, [store, urls]);

  return (
    <main className="relative flex-1 overflow-hidden">
      <div ref={host} data-testid="canvas" className="absolute inset-0 touch-none select-none" />
      <div ref={outlines} className="pointer-events-none absolute inset-0" />
      <div
        data-testid="canvas-panel"
        className="absolute top-3 left-3 flex flex-col gap-1 rounded-md border bg-background p-2"
      >
        {children}
        <SaveImages collectionId={collectionId} placeAt={placeAt} />
        <EditButtons
          store={store}
          history={history}
          removeLabel={collectionId === undefined ? "Remove from canvas" : "Remove from collection"}
          actions={actions}
        />
        {offCanvas > 0 ? (
          <div className="flex items-center gap-2">
            <p data-testid="off-canvas" data-count={offCanvas}>
              {offCanvas === 1
                ? "1 image of the library is not on this canvas."
                : `${offCanvas} images of the library are not on this canvas.`}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void inOrder(() => takeSnapshot(true).then(() => null))}
            >
              Put them back
            </Button>
          </div>
        ) : null}
        <Readout store={store} />
        {problem ? <p role="alert">{problem}</p> : null}
      </div>
    </main>
  );
}

function EditButtons({
  store,
  history,
  removeLabel,
  actions,
}: {
  store: SceneStore;
  history: History;
  removeLabel: string;
  actions: Record<Action, () => void>;
}) {
  const { selected } = useSyncExternalStore(store.subscribe, store.summary);
  const { canUndo, canRedo } = useSyncExternalStore(history.subscribe, history.summary);
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={selected === 0} onClick={actions.remove}>
        {removeLabel}
      </Button>
      <Button variant="outline" size="sm" disabled={!canUndo} onClick={actions.undo}>
        Undo
      </Button>
      <Button variant="outline" size="sm" disabled={!canRedo} onClick={actions.redo}>
        Redo
      </Button>
    </div>
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
