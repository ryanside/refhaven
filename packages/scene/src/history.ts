import type { Point } from "./index";
import type { Pose } from "./transform";

/** The fields of an item that an op of this client sets. */
export type ItemFields = Partial<Pose & { readonly z: string }>;

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
    };

/** One edit: the ops that undo it and the ops that redo it. */
export type Entry = { readonly undo: ReadonlyArray<ItemOp>; readonly redo: ReadonlyArray<ItemOp> };

/** The most ops `canvas.apply` takes in one call. */
export const maxOpsPerCall = 1000;

/** The ops of one edit as the calls that carry them, each within the budget of a call. */
export const callsOf = <Op>(ops: ReadonlyArray<Op>): Array<ReadonlyArray<Op>> =>
  Array.from({ length: Math.ceil(ops.length / maxOpsPerCall) }, (_, call) =>
    ops.slice(call * maxOpsPerCall, (call + 1) * maxOpsPerCall),
  );

type Placed = Point & { readonly key: string };

/** An item's key and the fields a patch sets on it. */
type Patch = ItemFields & { readonly key: string };

const patchTo = ({ key, ...fields }: Patch): ItemOp => ({ op: "patch", key, fields });

/** Patching items: the old fields to undo, and the new ones to redo. */
export const patchEntry = (from: ReadonlyArray<Patch>, to: ReadonlyArray<Patch>): Entry => ({
  undo: from.map(patchTo),
  redo: to.map(patchTo),
});

/**
 * Removing items. An add with the old z puts each back at its old place in the stack. That is one
 * op per item each way, so a removal that one call could make can be undone by one call.
 */
export const removalEntry = (
  items: ReadonlyArray<Placed & { readonly refId: string; readonly z: string }>,
): Entry => ({
  undo: items.map(({ refId, x, y, z }) => ({ op: "add", refId, x, y, z })),
  redo: items.map(({ key }) => ({ op: "remove", key })),
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

/** The pose fields that the ops' patches set, for each patch that sets one. */
export const posesOf = (ops: ReadonlyArray<ItemOp>): Array<Partial<Pose> & { key: string }> =>
  ops.flatMap((op) => {
    if (op.op !== "patch") return [];
    const { z, ...pose } = op.fields;
    return Object.keys(pose).length > 0 ? [{ key: op.key, ...pose }] : [];
  });

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
