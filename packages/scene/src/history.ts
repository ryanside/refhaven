import type { Point } from "./index";
import type { Size } from "./layout";
import type { NoteColor } from "./note";
import type { CanvasItem } from "./store";
import type { Pose } from "./transform";

/** A note's own fields: its text, its color, and its box at scale 1. */
export type NoteFields = Size & { readonly text: string; readonly color: NoteColor };

/**
 * The fields of an item that an op of this client sets. A note's own fields go to notes only. A
 * `parent` of null takes the item out of its group.
 */
export type ItemFields = Partial<
  Pose & { readonly z: string; readonly parent: string | null } & NoteFields
>;

/** A note as an op adds it, under a key this client made. */
export type NoteAdd = Pose &
  NoteFields & { readonly op: "addNote"; readonly key: string; readonly z: string };

/** One operation of a canvas edit, in the shape `canvas.apply` takes. */
export type ItemOp =
  | { readonly op: "patch"; readonly key: string; readonly fields: ItemFields }
  | { readonly op: "remove"; readonly key: string }
  | {
      readonly op: "add";
      readonly refId: string;
      readonly x: number;
      readonly y: number;
      readonly z?: string;
    }
  | NoteAdd
  | { readonly op: "addGroup"; readonly key: string };

/** One edit: the ops that undo it and the ops that redo it. */
export type Entry = { readonly undo: ReadonlyArray<ItemOp>; readonly redo: ReadonlyArray<ItemOp> };

/** The most ops `canvas.apply` takes in one call. */
export const maxOpsPerCall = 1000;

/** The ops of one edit as the calls that carry them, each within the budget of a call. */
export const callsOf = <Op>(ops: ReadonlyArray<Op>): Array<ReadonlyArray<Op>> =>
  Array.from({ length: Math.ceil(ops.length / maxOpsPerCall) }, (_, call) =>
    ops.slice(call * maxOpsPerCall, (call + 1) * maxOpsPerCall),
  );

/** An item's key and the fields a patch sets on it. */
type Patch = ItemFields & { readonly key: string };

const patchTo = ({ key, ...fields }: Patch): ItemOp => ({ op: "patch", key, fields });

/** Patching items: the old fields to undo, and the new ones to redo. */
export const patchEntry = (from: ReadonlyArray<Patch>, to: ReadonlyArray<Patch>): Entry => ({
  undo: from.map(patchTo),
  redo: to.map(patchTo),
});

/** The op that puts an item back as it is, at its place in the stack. */
const restoreOp = (item: CanvasItem): ItemOp =>
  item.kind === "image"
    ? { op: "add", refId: item.refId, x: item.x, y: item.y, z: item.z }
    : {
        op: "addNote",
        key: item.key,
        x: item.x,
        y: item.y,
        scale: item.scale,
        rotation: item.rotation,
        z: item.z,
        text: item.text,
        color: item.color,
        ...item.base,
      };

/**
 * Removing items. An add with the old z puts each back at its old place in the stack. That is one
 * op per item each way, so a removal that one call could make can be undone by one call.
 */
export const removalEntry = (items: ReadonlyArray<CanvasItem>): Entry => ({
  undo: items.map(restoreOp),
  redo: items.map(({ key }) => ({ op: "remove", key })),
});

/** Adding a note: the removal of it, the other way round. */
export const noteEntry = (note: NoteAdd): Entry => ({
  undo: [{ op: "remove", key: note.key }],
  redo: [note],
});

/**
 * Adding Refs at points. An image item's key is its Ref's ID. An add whose place in the stack is
 * known keeps it, so a redo puts the item back there.
 */
export const addEntry = (
  adds: ReadonlyArray<Point & { readonly refId: string; readonly z?: string }>,
): Entry => ({
  undo: adds.map(({ refId }) => ({ op: "remove", key: refId })),
  redo: adds.map(({ refId, x, y, z }) =>
    z === undefined ? { op: "add", refId, x, y } : { op: "add", refId, x, y, z },
  ),
});

/**
 * Putting items in a new group under `key`, which takes each out of the group it was in. Undone by
 * removing the group, which empties it, and putting back each item that had a group. Null for
 * fewer than two items, or for items that are already one group.
 */
export const groupEntry = (chosen: ReadonlyArray<CanvasItem>, key: string): Entry | null => {
  const parents = new Set(chosen.map((item) => item.parent ?? null));
  if (chosen.length < 2 || (parents.size === 1 && !parents.has(null))) return null;
  return {
    undo: [
      { op: "remove", key },
      ...chosen.flatMap((item): Array<ItemOp> =>
        item.parent ? [{ op: "patch", key: item.key, fields: { parent: item.parent } }] : [],
      ),
    ],
    redo: [
      { op: "addGroup", key },
      ...chosen.map((item): ItemOp => ({ op: "patch", key: item.key, fields: { parent: key } })),
    ],
  };
};

/**
 * Removing every group that one of the chosen items is in. The server takes each member out of its
 * group. Undone by bringing each group back under its key and putting its members of `items` back.
 * Null when no chosen item is in a group.
 */
export const ungroupEntry = (
  chosen: ReadonlyArray<CanvasItem>,
  items: ReadonlyArray<CanvasItem>,
): Entry | null => {
  const groups = new Set(chosen.flatMap((item) => (item.parent ? [item.parent] : [])));
  if (groups.size === 0) return null;
  return {
    undo: [
      ...[...groups].map((key): ItemOp => ({ op: "addGroup", key })),
      ...items.flatMap((item): Array<ItemOp> =>
        item.parent && groups.has(item.parent)
          ? [{ op: "patch", key: item.key, fields: { parent: item.parent } }]
          : [],
      ),
    ],
    redo: [...groups].map((key): ItemOp => ({ op: "remove", key })),
  };
};

/** The fields that the ops' patches set, for each patch that sets one. */
export const patchedFields = (ops: ReadonlyArray<ItemOp>): Array<ItemFields & { key: string }> =>
  ops.flatMap((op) =>
    op.op === "patch" && Object.keys(op.fields).length > 0 ? [{ key: op.key, ...op.fields }] : [],
  );

export type HistorySummary = { readonly canUndo: boolean; readonly canRedo: boolean };

/**
 * The undo and redo stacks of one canvas for the page's session. Undo and redo move an entry to the
 * other stack at once and return it, for the caller to apply. An entry whose call fails is dropped.
 */
export function createHistory() {
  let done: ReadonlyArray<Entry> = [];
  let undone: ReadonlyArray<Entry> = [];
  let summary: HistorySummary = { canUndo: false, canRedo: false };
  const listeners = new Set<() => void>();

  const changed = () => {
    const canUndo = done.length > 0;
    const canRedo = undone.length > 0;
    if (canUndo !== summary.canUndo || canRedo !== summary.canRedo) {
      summary = { canUndo, canRedo };
    }
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    summary: () => summary,

    /** A new edit. It empties the redo stack. */
    record(entry: Entry) {
      done = [...done, entry];
      undone = [];
      changed();
    },

    undo(): Entry | null {
      const entry = done.at(-1);
      if (!entry) return null;
      done = done.slice(0, -1);
      undone = [...undone, entry];
      changed();
      return entry;
    },

    redo(): Entry | null {
      const entry = undone.at(-1);
      if (!entry) return null;
      undone = undone.slice(0, -1);
      done = [...done, entry];
      changed();
      return entry;
    },

    /** Takes an entry out of whichever stack holds it, and keeps the rest. */
    drop(entry: Entry) {
      done = done.filter((candidate) => candidate !== entry);
      undone = undone.filter((candidate) => candidate !== entry);
      changed();
    },
  };
}

export type History = ReturnType<typeof createHistory>;
