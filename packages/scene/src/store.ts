import { fitCamera, panBy, zoomAt } from "./camera";
import { type Entry, type ItemOp, patchEntry, posesOf } from "./history";
import { topmostAt } from "./hit";
import { type Camera, type Point, screenToWorld } from "./index";
import type { Size } from "./layout";
import {
  type Handle,
  type Pose,
  type Rect,
  frameOf,
  minFrameEdge,
  resized,
  rotated,
} from "./transform";

/** An image on the canvas, sized in world units: its pixel size times its scale. */
export type CanvasItem = Pose &
  Size & {
    readonly key: string;
    readonly refId: string;
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
 * What a gesture that edits the selection holds: the world point it was pressed at, the pointer in
 * screen pixels, and the poses its items had at the press.
 */
type Editing = {
  readonly fromWorld: Point;
  readonly pointer: Point;
  readonly origins: ReadonlyMap<string, Pose>;
};

/**
 * The pointer's one gesture. A press on an item starts a drag that has not `moved` yet. Releasing it
 * then is a click. `collapseTo` is the item a click selects alone, when the press kept a larger
 * selection so that the drag could move all of it. A press on a handle of the selection's frame
 * starts a resize about the opposite point, or a rotate about the frame's center.
 */
export type Gesture =
  | { readonly kind: "idle" }
  | { readonly kind: "panning"; readonly last: Point }
  | (Editing & {
      readonly kind: "dragging";
      readonly from: Point;
      readonly moved: boolean;
      readonly collapseTo: string | null;
    })
  | (Editing & { readonly kind: "resizing"; readonly handle: Handle; readonly frame: Rect })
  | (Editing & { readonly kind: "rotating"; readonly center: Point; readonly snap: boolean });

/** The fields that each editing gesture saves. */
const savedFields = {
  dragging: ({ x, y }: Pose) => ({ x, y }),
  resizing: ({ x, y, scale }: Pose) => ({ x, y, scale }),
  rotating: ({ x, y, rotation }: Pose) => ({ x, y, rotation }),
};

const differs = (a: Partial<Pose>, b: Partial<Pose>) =>
  (Object.keys(a) as Array<keyof Pose>).some((field) => a[field] !== b[field]);

const poseOf = ({ x, y, scale, rotation }: Pose): Pose => ({ x, y, scale, rotation });

/** One finished gesture that changed items: the edit to record and save, and the save that holds it. */
export type Drop = { readonly save: number; readonly entry: Entry };

/** What React reads. A new object only when one of its values changes. */
export type Summary = {
  readonly items: number;
  readonly selected: number;
  readonly camera: Camera;
};

/** A press must travel this far, in screen pixels, before it moves anything. */
export const dragThreshold = 3;

const sized = ({ deletedAt, ...item }: ServerItem): CanvasItem => ({
  ...item,
  width: item.width * item.scale,
  height: item.height * item.scale,
});

/**
 * The canvas's state outside React: items, camera, selection, and gesture. An edited item keeps its
 * local pose from the start of the gesture, or from `hold`, until the server state includes the
 * save.
 */
export function createSceneStore() {
  let rev = -1;
  let fitted = false;
  let viewport: Size = { width: 0, height: 0 };
  let camera: Camera = { x: 0, y: 0, zoom: 1 };
  let gesture: Gesture = { kind: "idle" };
  let selection: ReadonlySet<string> = new Set();
  let saves = 0;
  const server = new Map<string, ServerItem>();
  const pending = new Map<string, { fields: Partial<Pose>; save: number; rev: number | null }>();
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

  /** The poses the gesture gives its items now, or null when it changes none. */
  const live = (): ReadonlyMap<string, Pose> | null => {
    if (gesture.kind === "idle" || gesture.kind === "panning") return null;
    const to = screenToWorld(camera, gesture.pointer);
    switch (gesture.kind) {
      case "dragging": {
        if (!gesture.moved) return null;
        const dx = to.x - gesture.fromWorld.x;
        const dy = to.y - gesture.fromWorld.y;
        return new Map(
          [...gesture.origins].map(([key, pose]) => [
            key,
            { ...pose, x: pose.x + dx, y: pose.y + dy },
          ]),
        );
      }
      case "resizing":
        return resized(
          gesture.origins,
          gesture.frame,
          gesture.handle,
          gesture.fromWorld,
          to,
          minFrameEdge / camera.zoom,
        );
      case "rotating":
        return rotated(gesture.origins, gesture.center, gesture.fromWorld, to, gesture.snap);
    }
  };

  const items = (): ReadonlyArray<CanvasItem> => {
    if (shown) return shown;
    const now = live();
    shown = [...server.values()].map((item) =>
      sized({ ...item, ...pending.get(item.key)?.fields, ...now?.get(item.key) }),
    );
    return shown;
  };

  const selected = () => items().filter((item) => selection.has(item.key));

  const settle = () => {
    for (const [key, local] of pending) {
      if ((local.rev !== null && local.rev <= rev) || !server.has(key)) pending.delete(key);
    }
  };

  /**
   * Lets go of every item the server state no longer holds: in the selection, in the pending
   * edits, and in the gesture. A gesture whose last item left has nothing to edit, so it ends.
   */
  const forgetMissing = () => {
    selection = new Set([...selection].filter((key) => server.has(key)));
    settle();
    if (gesture.kind === "idle" || gesture.kind === "panning") return;
    const origins = new Map([...gesture.origins].filter(([key]) => server.has(key)));
    if (origins.size === 0) {
      gesture = { kind: "idle" };
    } else if (gesture.kind === "dragging") {
      const { collapseTo } = gesture;
      gesture = {
        ...gesture,
        origins,
        collapseTo: collapseTo !== null && server.has(collapseTo) ? collapseTo : null,
      };
    } else {
      gesture = { ...gesture, origins };
    }
  };

  /**
   * Shows the pose fields the ops set at once, and keeps them until their save is settled. A field
   * held by an earlier save that is not settled yet stays, so a resize right after a turn keeps both.
   */
  const hold = (ops: ReadonlyArray<ItemOp>) => {
    const save = ++saves;
    for (const { key, ...fields } of posesOf(ops)) {
      if (!server.has(key)) continue;
      pending.set(key, { fields: { ...pending.get(key)?.fields, ...fields }, save, rev: null });
    }
    changed();
    return save;
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
    /** The selection's frame: one item's own rectangle, or the upright box around several. */
    frame: () => frameOf(selected()),
    /** The server revision the store has applied. */
    rev: () => rev,

    /**
     * Replaces every item with a snapshot, and returns whether it did. A snapshot older than the
     * state the store already holds is left out, because it would undo changes applied since.
     * The first snapshot also fits the camera to the items.
     */
    loadSnapshot(snapshot: ServerState) {
      if (snapshot.rev < rev) return false;
      rev = snapshot.rev;
      server.clear();
      for (const item of snapshot.items) server.set(item.key, item);
      forgetMissing();
      if (!fitted) {
        fitted = true;
        camera = fitCamera(viewport, [...server.values()].map(sized));
      }
      changed();
      return true;
    },

    /** Applies the items written since the snapshot. An item in a gesture keeps its gesture pose. */
    applyChanges(changes: ServerState) {
      if (changes.rev < rev) return;
      rev = changes.rev;
      for (const item of changes.items) {
        if (item.deletedAt === undefined) {
          server.set(item.key, item);
        } else {
          server.delete(item.key);
        }
      }
      forgetMissing();
      changed();
    },

    hold,

    /** Whether every item the ops patch or remove is on the canvas, or added by the same ops. */
    applies(ops: ReadonlyArray<ItemOp>) {
      const added = new Set(ops.flatMap((op) => (op.op === "add" ? [op.refId] : [])));
      return ops.every((op) => op.op === "add" || server.has(op.key) || added.has(op.key));
    },

    /** The save of a hold wrote `savedRev`. Its items show the server state from that rev on. */
    acknowledge(save: number, savedRev: number) {
      for (const local of pending.values()) {
        if (local.save === save) local.rev = savedRev;
      }
      settle();
      changed();
    },

    /** The save of a hold failed, so its items go back to the server state. */
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

    selectAll() {
      selection = new Set(server.keys());
      changed();
    },

    clearSelection() {
      selection = new Set();
      changed();
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
        const origins = new Map(selected().map((item) => [item.key, poseOf(item)]));
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

    /** A press on a handle of the selection's frame: a resize handle, or `rotate`. */
    grab(handle: Handle | "rotate", screen: Point) {
      const chosen = selected();
      const frame = frameOf(chosen);
      if (!frame) return;
      const editing = {
        fromWorld: screenToWorld(camera, screen),
        pointer: screen,
        origins: new Map(chosen.map((item) => [item.key, poseOf(item)])),
      };
      gesture =
        handle === "rotate"
          ? { ...editing, kind: "rotating", center: { x: frame.x, y: frame.y }, snap: false }
          : { ...editing, kind: "resizing", handle, frame };
      changed();
    },

    /** The pointer moved. `snap` is whether Shift is held, which snaps a rotate's angle. */
    move(screen: Point, snap = false) {
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
      } else if (gesture.kind === "resizing") {
        gesture = { ...gesture, pointer: screen };
        changed();
      } else if (gesture.kind === "rotating") {
        gesture = { ...gesture, pointer: screen, snap };
        changed();
      }
    },

    /**
     * Ends the gesture. Returns the edit to save when it changed items: one patch per changed item,
     * with only the fields its kind of gesture changes.
     */
    release(): Drop | null {
      const ended = gesture;
      const now = live();
      gesture = { kind: "idle" };
      if (now && ended.kind !== "idle" && ended.kind !== "panning") {
        const pick = savedFields[ended.kind];
        const edited = [...now].filter(([key, pose]) =>
          differs(pick(pose), pick(ended.origins.get(key)!)),
        );
        if (edited.length > 0) {
          const entry = patchEntry(
            edited.map(([key]) => ({ key, ...pick(ended.origins.get(key)!) })),
            edited.map(([key, pose]) => ({ key, ...pick(pose) })),
          );
          return { save: hold(entry.redo), entry };
        }
      }
      if (ended.kind === "dragging" && !ended.moved && ended.collapseTo !== null) {
        selection = new Set([ended.collapseTo]);
      }
      changed();
      return null;
    },
  };
}

export type SceneStore = ReturnType<typeof createSceneStore>;
