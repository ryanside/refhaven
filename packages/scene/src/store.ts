import { fitCamera, panBy, zoomAt } from "./camera";
import { grouped } from "./group";
import {
  type Entry,
  type ItemFields,
  type ItemOp,
  type NoteFields,
  patchEntry,
  patchedFields,
} from "./history";
import { stackOrder, topmostAt, touching } from "./hit";
import { type Camera, type Point, screenToWorld } from "./index";
import { type Size, zAbove, zBelow } from "./layout";
import {
  type Handle,
  type Pose,
  type Rect,
  frameOf,
  minFrameEdge,
  resized,
  rotated,
} from "./transform";

/** What an item shows: an image of a Ref, or a note's text. */
export type Content =
  | { readonly kind: "image"; readonly refId: string }
  | ({ readonly kind: "note" } & Omit<NoteFields, keyof Size>);

/**
 * An item's link to a group, as it is saved: the group's key. It stays when the group is removed,
 * so it may name a group that is not on the canvas. A held patch that takes the item out of its
 * group makes it null until the server state holds the save.
 */
type Linked = { readonly parent?: string | null };

/**
 * An item as the server sends it. `width` and `height` are its size at scale 1: an image's pixel
 * size, or a note's box in world units.
 */
export type ServerItem = Pose &
  Size &
  Content &
  Linked & { readonly key: string; readonly z: string; readonly deletedAt?: number };

/** A group as the server sends it. It has no place, so the store keeps only its key. */
export type ServerGroup = {
  readonly kind: "group";
  readonly key: string;
  readonly deletedAt?: number;
};

/**
 * An item on the canvas, sized in world units: its size at scale 1, kept as `base`, times its scale.
 * `group` is the group it is in: its `parent`, while that group is on the canvas.
 */
export type CanvasItem = Pose &
  Size &
  Content &
  Linked & {
    readonly key: string;
    readonly z: string;
    readonly base: Size;
    readonly group?: string;
  };

export type ServerState = {
  readonly rev: number;
  readonly items: ReadonlyArray<ServerItem | ServerGroup>;
};

/**
 * What a gesture that edits the selection holds: the world point it was pressed at, the pointer in
 * screen pixels, and the poses its items had at the press.
 */
type Editing = {
  readonly from: Point;
  readonly fromWorld: Point;
  readonly pointer: Point;
  readonly moved: boolean;
  readonly origins: ReadonlyMap<string, Pose>;
};

/**
 * The pointer's one gesture. A press on an item starts a drag, and a press on a handle of the
 * selection's frame starts a resize about the opposite point or a rotate about the frame's center.
 * A press on empty canvas starts a marquee, which selects what its rectangle touches, or with
 * `add` adds it to the selection. None has `moved` until the pointer travels past
 * `dragThreshold`, and one released before that changes nothing, except that a marquee released
 * there clears the selection. `collapseTo` is the item a click selects alone, when the press kept a
 * larger selection so that the drag could move all of it.
 */
export type Gesture =
  | { readonly kind: "idle" }
  | { readonly kind: "panning"; readonly last: Point }
  | {
      readonly kind: "marquee";
      readonly from: Point;
      readonly fromWorld: Point;
      readonly pointer: Point;
      readonly moved: boolean;
      readonly add: boolean;
    }
  | (Editing & { readonly kind: "dragging"; readonly collapseTo: string | null })
  | (Editing & { readonly kind: "resizing"; readonly handle: Handle; readonly frame: Rect })
  | (Editing & { readonly kind: "rotating"; readonly center: Point; readonly snap: boolean });

/** The fields that each editing gesture saves. */
const savedFields = {
  dragging: ({ x, y }: Pose) => ({ x, y }),
  resizing: ({ x, y, scale }: Pose) => ({ x, y, scale }),
  rotating: ({ x, y, rotation }: Pose) => ({ x, y, rotation }),
};

/**
 * The fields of `to` that differ from `from`, with both values. A patch names only these, so a
 * turn of one item about its own center does not write its place over another tab's move (C11).
 * A place is one value: when either of `x` and `y` changed, both are named.
 */
const changedFields = (from: Partial<Pose>, to: Partial<Pose>) => {
  const moved = to.x !== from.x || to.y !== from.y;
  const fields = (Object.keys(to) as Array<keyof Pose>).filter((field) =>
    field === "x" || field === "y" ? moved : to[field] !== from[field],
  );
  const only = (pose: Partial<Pose>) =>
    Object.fromEntries(fields.map((field) => [field, pose[field]])) as Partial<Pose>;
  return fields.length === 0 ? null : { from: only(from), to: only(to) };
};

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
  base: { width: item.width, height: item.height },
  width: item.width * item.scale,
  height: item.height * item.scale,
});

/**
 * The canvas's state outside React: items, camera, selection, and gesture. An edited item keeps its
 * local pose from the start of the gesture, or from `hold`, until the server state includes the
 * save. A note or a group this client adds is there at once, because its key is made here. The
 * selection holds whole groups, by `grouped`, except while a gesture edits it.
 */
export function createSceneStore() {
  let rev = -1;
  let fitted = false;
  let viewport: Size = { width: 0, height: 0 };
  let camera: Camera = { x: 0, y: 0, zoom: 1 };
  let gesture: Gesture = { kind: "idle" };
  let selection: ReadonlySet<string> = new Set();
  let editing: string | null = null;
  let saves = 0;
  const server = new Map<string, ServerItem>();
  const groups = new Set<string>();
  // Each held field remembers the save that set it, so a save that fails takes back only its own.
  type Held = {
    readonly value: number | string | null;
    readonly save: number;
    rev: number | null;
  };
  const pending = new Map<string, Map<keyof ItemFields, Held>>();
  const heldFields = (key: string): ItemFields =>
    Object.fromEntries([...(pending.get(key) ?? [])].map(([field, { value }]) => [field, value]));
  // A note added by a save that the server state does not hold yet.
  const added = new Map<string, { item: ServerItem; save: number; rev: number | null }>();
  // A group added the same way.
  const addedGroups = new Map<string, { save: number; rev: number | null }>();
  const exists = (key: string) => server.has(key) || added.has(key);
  const isGroup = (key: string) => groups.has(key) || addedGroups.has(key);
  const all = () => [
    ...server.values(),
    ...[...added.values()].flatMap(({ item }) => (server.has(item.key) ? [] : [item])),
  ];
  const listeners = new Set<() => void>();

  let shown: ReadonlyArray<CanvasItem> | null = null;
  let summary: Summary = { items: 0, selected: 0, camera };

  const changed = () => {
    shown = null;
    const next = { items: all().length, selected: selection.size, camera };
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
    if (
      gesture.kind === "idle" ||
      gesture.kind === "panning" ||
      gesture.kind === "marquee" ||
      !gesture.moved
    ) {
      return null;
    }
    const to = screenToWorld(camera, gesture.pointer);
    switch (gesture.kind) {
      case "dragging": {
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
    shown = all().map((item) => {
      const held = { ...item, ...heldFields(item.key), ...now?.get(item.key) };
      return held.parent && isGroup(held.parent)
        ? { ...sized(held), group: held.parent }
        : sized(held);
    });
    return shown;
  };

  const selected = () => items().filter((item) => selection.has(item.key));

  /** Selects the items `keys` names, and every other item of a group that one of them is in. */
  const select = (keys: Iterable<string>) => {
    shown = null;
    selection = grouped(items(), keys);
  };

  const settle = () => {
    for (const [key, held] of pending) {
      for (const [field, local] of held) {
        if (local.rev !== null && local.rev <= rev) held.delete(field);
      }
      if (held.size === 0 || !exists(key)) pending.delete(key);
    }
    for (const adds of [added, addedGroups]) {
      for (const [key, { rev: savedRev }] of adds) {
        if (savedRev !== null && savedRev <= rev) adds.delete(key);
      }
    }
  };

  /**
   * Keeps the selection to whole groups of the items on the canvas, after a change to the items or
   * to what is held. A gesture that edits the selection moves the items it began with, so while one
   * runs the selection only lets go of items that left. `release` takes in the rest of each group.
   */
  const reselect = () => {
    if (gesture.kind === "dragging" || gesture.kind === "resizing" || gesture.kind === "rotating") {
      selection = new Set([...selection].filter(exists));
    } else {
      select(selection);
    }
  };

  /**
   * Lets go of every item the server state no longer holds: in the pending edits, in the gesture,
   * and in the selection. A gesture whose last item left has nothing to edit, so it ends.
   */
  const forgetMissing = () => {
    settle();
    if (gesture.kind === "dragging" || gesture.kind === "resizing" || gesture.kind === "rotating") {
      const origins = new Map([...gesture.origins].filter(([key]) => exists(key)));
      if (origins.size === 0) {
        gesture = { kind: "idle" };
      } else if (gesture.kind === "dragging") {
        const { collapseTo } = gesture;
        gesture = {
          ...gesture,
          origins,
          collapseTo: collapseTo !== null && exists(collapseTo) ? collapseTo : null,
        };
      } else {
        gesture = { ...gesture, origins };
      }
    }
    reselect();
  };

  /**
   * Shows the notes and groups the ops add and the fields their patches set at once, and keeps
   * them until their save is settled. A field held by an earlier save that is not settled yet
   * stays, so a resize right after a turn keeps both.
   */
  const hold = (ops: ReadonlyArray<ItemOp>) => {
    const save = ++saves;
    for (const op of ops) {
      if (op.op === "addGroup") {
        addedGroups.set(op.key, { save, rev: null });
      } else if (op.op === "addNote") {
        const { op: _, ...note } = op;
        added.set(note.key, { item: { kind: "note", ...note }, save, rev: null });
      }
    }
    for (const { key, ...fields } of patchedFields(ops)) {
      if (!exists(key)) continue;
      const held = pending.get(key) ?? new Map<keyof ItemFields, Held>();
      for (const [field, value] of Object.entries(fields) as Array<
        [keyof ItemFields, number | string | null]
      >) {
        held.set(field, { value, save, rev: null });
      }
      pending.set(key, held);
    }
    reselect();
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
    /** The key of the note open in the editor, which the editor shows in its place. */
    editing: () => editing,
    gesture: () => gesture,
    /** The selection's frame: one item's own rectangle, or the upright box around several. */
    frame: () => frameOf(selected()),
    selected,
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
      groups.clear();
      for (const item of snapshot.items) {
        if (item.kind === "group") groups.add(item.key);
        else server.set(item.key, item);
      }
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
        if (item.kind === "group") {
          if (item.deletedAt === undefined) groups.add(item.key);
          else groups.delete(item.key);
        } else if (item.deletedAt === undefined) {
          server.set(item.key, item);
        } else {
          server.delete(item.key);
        }
      }
      forgetMissing();
      changed();
    },

    hold,

    /**
     * Whether every item and group the ops patch or remove is on the canvas or added by the same
     * ops. A `parent` is not looked at, because it may name a removed group.
     */
    applies(ops: ReadonlyArray<ItemOp>) {
      const adding = new Set(
        ops.flatMap((op) =>
          op.op === "add" ? [op.refId] : op.op === "patch" || op.op === "remove" ? [] : [op.key],
        ),
      );
      return ops.every(
        (op) =>
          (op.op !== "patch" && op.op !== "remove") ||
          exists(op.key) ||
          isGroup(op.key) ||
          adding.has(op.key),
      );
    },

    /** The save of a hold wrote `savedRev`. Its items show the server state from that rev on. */
    acknowledge(save: number, savedRev: number) {
      for (const held of pending.values()) {
        for (const local of held.values()) {
          if (local.save === save) local.rev = savedRev;
        }
      }
      for (const add of [...added.values(), ...addedGroups.values()]) {
        if (add.save === save) add.rev = savedRev;
      }
      // A held field that the server state already wrote over shows the server's value from here.
      settle();
      reselect();
      changed();
    },

    /** The save of a hold failed, so its items go back to the server state. */
    reject(save: number) {
      for (const held of pending.values()) {
        for (const [field, local] of held) {
          if (local.save === save) held.delete(field);
        }
      }
      for (const adds of [added, addedGroups]) {
        for (const [key, add] of adds) {
          if (add.save === save) adds.delete(key);
        }
      }
      // A note that was only held is gone now, so the selection and the gesture let go of it too.
      forgetMissing();
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
      select(all().map(({ key }) => key));
      changed();
    },

    setEditing(key: string | null) {
      editing = key;
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

    /**
     * A primary press: selects per the click rules, and starts a drag when it lands on a selected
     * item. On empty canvas it starts a marquee.
     */
    press(screen: Point, shift: boolean) {
      const hit = topmostAt(items(), screenToWorld(camera, screen));
      if (!hit) {
        gesture = {
          kind: "marquee",
          from: screen,
          fromWorld: screenToWorld(camera, screen),
          pointer: screen,
          moved: false,
          add: shift,
        };
        changed();
        return;
      }
      const wasSelected = selection.has(hit.key);
      if (shift && wasSelected) {
        const group = grouped(items(), [hit.key]);
        selection = new Set([...selection].filter((key) => !group.has(key)));
      } else if (shift) {
        select([...selection, hit.key]);
      } else if (!wasSelected) {
        select([hit.key]);
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

    /**
     * Moves the selection above or below every other item, in the order it had. Returns the edit,
     * one patch of `z` per item, or null when nothing is selected or the selection is already there.
     */
    restack(to: "front" | "back"): Entry | null {
      const stack = [...items()].sort(stackOrder);
      const chosen = stack.filter((item) => selection.has(item.key));
      const end =
        to === "front" ? stack.slice(stack.length - chosen.length) : stack.slice(0, chosen.length);
      if (chosen.every((item, index) => end[index] === item)) return null;
      const zs = stack.map((item) => item.z);
      const placed = to === "front" ? zAbove(zs, chosen.length) : zBelow(zs, chosen.length);
      return patchEntry(
        chosen.map(({ key, z }) => ({ key, z })),
        chosen.map(({ key }, index) => ({ key, z: placed[index]! })),
      );
    },

    /** A press on a handle of the selection's frame: a resize handle, or `rotate`. */
    grab(handle: Handle | "rotate", screen: Point) {
      const chosen = selected();
      const frame = frameOf(chosen);
      if (!frame) return;
      const editing = {
        from: screen,
        fromWorld: screenToWorld(camera, screen),
        pointer: screen,
        moved: false,
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
      } else if (gesture.kind !== "idle") {
        const moved =
          gesture.moved ||
          Math.hypot(screen.x - gesture.from.x, screen.y - gesture.from.y) > dragThreshold;
        gesture =
          gesture.kind === "rotating"
            ? { ...gesture, pointer: screen, moved, snap }
            : { ...gesture, pointer: screen, moved };
        if (moved) changed();
      }
    },

    /**
     * Ends the gesture. Returns the edit to save when it changed items: one patch per changed item,
     * with only the fields its kind of gesture changes. A marquee changes only the selection.
     */
    release(): Drop | null {
      const ended = gesture;
      const now = live();
      gesture = { kind: "idle" };
      if (ended.kind === "marquee") {
        const keys = ended.moved
          ? touching(items(), ended.fromWorld, screenToWorld(camera, ended.pointer)).map(
              ({ key }) => key,
            )
          : [];
        select([...(ended.add && ended.moved ? selection : []), ...keys]);
        changed();
        return null;
      }
      if (now && ended.kind !== "idle" && ended.kind !== "panning") {
        const pick = savedFields[ended.kind];
        const edited = [...now].flatMap(([key, pose]) => {
          const fields = changedFields(pick(ended.origins.get(key)!), pick(pose));
          return fields ? [{ key, ...fields }] : [];
        });
        if (edited.length > 0) {
          const entry = patchEntry(
            edited.map(({ key, from }) => ({ key, ...from })),
            edited.map(({ key, to }) => ({ key, ...to })),
          );
          return { save: hold(entry.redo), entry };
        }
      }
      // An item that joined a group of the selection during the gesture joins the selection now.
      select(
        ended.kind === "dragging" && !ended.moved && ended.collapseTo !== null
          ? [ended.collapseTo]
          : selection,
      );
      changed();
      return null;
    },
  };
}

export type SceneStore = ReturnType<typeof createSceneStore>;
