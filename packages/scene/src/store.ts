import { fitCamera, panBy, zoomAt } from "./camera";
import { topmostAt } from "./hit";
import { type Camera, type Point, screenToWorld } from "./index";
import type { Size } from "./layout";

/** An image on the canvas, sized in world units. */
export type CanvasItem = Point &
  Size & {
    readonly key: string;
    readonly refId: string;
    readonly rotation: number;
    readonly z: string;
  };

/** An item as the server sends it, with the image's pixel size and a scale. */
export type ServerItem = Point &
  Size & {
    readonly key: string;
    readonly refId: string;
    readonly scale: number;
    readonly rotation: number;
    readonly z: string;
    readonly deletedAt?: number;
  };

export type ServerState = { readonly rev: number; readonly items: ReadonlyArray<ServerItem> };

/**
 * The pointer's one gesture. A press on an item starts a drag that has not `moved` yet. Releasing it
 * then is a click. `collapseTo` is the item a click selects alone, when the press kept a larger
 * selection so that the drag could move all of it.
 */
export type Gesture =
  | { readonly kind: "idle" }
  | { readonly kind: "panning"; readonly last: Point }
  | {
      readonly kind: "dragging";
      readonly from: Point;
      readonly fromWorld: Point;
      readonly pointer: Point;
      readonly moved: boolean;
      readonly origins: ReadonlyMap<string, Point>;
      readonly collapseTo: string | null;
    };

/** The moves of one finished drag, to save as one call. */
export type Drop = {
  readonly save: number;
  readonly moves: ReadonlyArray<Point & { readonly key: string }>;
};

/** What React reads. A new object only when one of its values changes. */
export type Summary = {
  readonly items: number;
  readonly selected: number;
  readonly camera: Camera;
};

/** A press must travel this far, in screen pixels, before it moves anything. */
export const dragThreshold = 3;

const fromServer = ({ scale, deletedAt, ...item }: ServerItem): CanvasItem => ({
  ...item,
  width: item.width * scale,
  height: item.height * scale,
});

/**
 * The canvas's state outside React: items, camera, selection, and gesture. A moved item keeps its
 * local position from the start of the drag until the server state includes the save.
 */
export function createSceneStore() {
  let rev = -1;
  let fitted = false;
  let viewport: Size = { width: 0, height: 0 };
  let camera: Camera = { x: 0, y: 0, zoom: 1 };
  let gesture: Gesture = { kind: "idle" };
  let selection: ReadonlySet<string> = new Set();
  let saves = 0;
  const server = new Map<string, CanvasItem>();
  const pending = new Map<string, Point & { save: number; rev: number | null }>();
  const listeners = new Set<() => void>();

  let shown: ReadonlyArray<CanvasItem> | null = null;
  let summary: Summary = { items: 0, selected: 0, camera };

  const changed = () => {
    shown = null;
    const next = { items: server.size, selected: selection.size, camera };
    if (
      next.items !== summary.items ||
      next.selected !== summary.selected ||
      next.camera !== summary.camera
    ) {
      summary = next;
    }
    for (const listener of listeners) listener();
  };

  const dragOffset = (): Point | null => {
    if (gesture.kind !== "dragging" || !gesture.moved) return null;
    const at = screenToWorld(camera, gesture.pointer);
    return { x: at.x - gesture.fromWorld.x, y: at.y - gesture.fromWorld.y };
  };

  const items = (): ReadonlyArray<CanvasItem> => {
    if (shown) return shown;
    const offset = dragOffset();
    shown = [...server.values()].map((item) => {
      const origin = gesture.kind === "dragging" ? gesture.origins.get(item.key) : undefined;
      if (offset && origin) return { ...item, x: origin.x + offset.x, y: origin.y + offset.y };
      const local = pending.get(item.key);
      return local ? { ...item, x: local.x, y: local.y } : item;
    });
    return shown;
  };

  const settle = () => {
    for (const [key, local] of pending) {
      if ((local.rev !== null && local.rev <= rev) || !server.has(key)) pending.delete(key);
    }
  };

  const setCamera = (next: Camera) => {
    camera = next;
    changed();
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    summary: () => summary,
    items,
    camera: () => camera,
    viewport: () => viewport,
    selection: () => selection,
    gesture: () => gesture,

    /**
     * Replaces every item with a snapshot, and returns whether it did. A snapshot older than the
     * state the store already holds is left out, because it would undo changes applied since.
     * The first snapshot also fits the camera to the items.
     */
    loadSnapshot(snapshot: ServerState) {
      if (snapshot.rev < rev) return false;
      rev = snapshot.rev;
      server.clear();
      for (const item of snapshot.items) server.set(item.key, fromServer(item));
      selection = new Set([...selection].filter((key) => server.has(key)));
      settle();
      if (!fitted) {
        fitted = true;
        camera = fitCamera(viewport, server.values());
      }
      changed();
      return true;
    },

    /** Applies the items written since the snapshot. An item in a drag keeps its drag position. */
    applyChanges(changes: ServerState) {
      if (changes.rev < rev) return;
      rev = changes.rev;
      for (const item of changes.items) {
        if (item.deletedAt === undefined) {
          server.set(item.key, fromServer(item));
        } else {
          server.delete(item.key);
        }
      }
      selection = new Set([...selection].filter((key) => server.has(key)));
      settle();
      changed();
    },

    /** The save of a drop wrote `savedRev`. Its items show the server state from that rev on. */
    acknowledge(save: number, savedRev: number) {
      for (const local of pending.values()) {
        if (local.save === save) local.rev = savedRev;
      }
      settle();
      changed();
    },

    /** The save of a drop failed, so its items go back to the server state. */
    reject(save: number) {
      for (const [key, local] of pending) {
        if (local.save === save) pending.delete(key);
      }
      changed();
    },

    setViewport(size: Size) {
      viewport = size;
      changed();
    },

    scroll(screenDelta: Point) {
      setCamera(panBy(camera, screenDelta));
    },

    zoom(screen: Point, factor: number) {
      setCamera(zoomAt(camera, screen, camera.zoom * factor));
    },

    startPan(screen: Point) {
      gesture = { kind: "panning", last: screen };
      changed();
    },

    /** A primary press: selects per the click rules, and starts a drag when it lands on a selected item. */
    press(screen: Point, shift: boolean) {
      const hit = topmostAt(items(), screenToWorld(camera, screen));
      if (!hit) {
        selection = new Set();
        changed();
        return;
      }
      const wasSelected = selection.has(hit.key);
      if (shift) {
        const next = new Set(selection);
        if (wasSelected) next.delete(hit.key);
        else next.add(hit.key);
        selection = next;
      } else if (!wasSelected) {
        selection = new Set([hit.key]);
      }
      if (selection.has(hit.key)) {
        const origins = new Map(
          items()
            .filter((item) => selection.has(item.key))
            .map((item) => [item.key, { x: item.x, y: item.y }]),
        );
        gesture = {
          kind: "dragging",
          from: screen,
          fromWorld: screenToWorld(camera, screen),
          pointer: screen,
          moved: false,
          origins,
          collapseTo: !shift && wasSelected ? hit.key : null,
        };
      }
      changed();
    },

    move(screen: Point) {
      if (gesture.kind === "panning") {
        camera = panBy(camera, { x: gesture.last.x - screen.x, y: gesture.last.y - screen.y });
        gesture = { kind: "panning", last: screen };
        changed();
      } else if (gesture.kind === "dragging") {
        const moved =
          gesture.moved ||
          Math.hypot(screen.x - gesture.from.x, screen.y - gesture.from.y) > dragThreshold;
        gesture = { ...gesture, pointer: screen, moved };
        if (moved) changed();
      }
    },

    /** Ends the gesture. Returns the moves to save when it was a drag that moved. */
    release(): Drop | null {
      const ended = gesture;
      if (ended.kind === "dragging" && ended.moved) {
        const save = ++saves;
        const moves = items()
          .filter((item) => ended.origins.has(item.key))
          .map(({ key, x, y }) => ({ key, x, y }));
        for (const { key, x, y } of moves) pending.set(key, { x, y, save, rev: null });
        gesture = { kind: "idle" };
        changed();
        return { save, moves };
      }
      if (ended.kind === "dragging" && ended.collapseTo !== null) {
        selection = new Set([ended.collapseTo]);
      }
      gesture = { kind: "idle" };
      changed();
      return null;
    },
  };
}

export type SceneStore = ReturnType<typeof createSceneStore>;
