import { expect, test } from "vitest";
import {
  type ItemOp,
  type Point,
  type ServerItem,
  createSceneStore,
  handleAt,
  posesOf,
  snapStep,
  worldToScreen,
} from "./index";

const serverItem = (key: string, x: number, z: string): ServerItem => ({
  key,
  refId: `ref-${key}`,
  x,
  y: 0,
  width: 400,
  height: 200,
  scale: 0.5,
  rotation: 0,
  z,
});

const a = serverItem("a", 0, "a0");
const b = serverItem("b", 300, "a1");

const setUp = () => {
  const store = createSceneStore();
  store.setViewport({ width: 1000, height: 800 });
  store.loadSnapshot({ rev: 1, items: [a, b] });
  const screen = (world: Point) => worldToScreen(store.camera(), world);
  const at = (key: string) => {
    const item = store.items().find((candidate) => candidate.key === key);
    return item && { x: item.x, y: item.y };
  };
  const drag = (key: string, world: Point, shift = false) => {
    const start = at(key)!;
    store.press(screen(start), shift);
    store.move(screen({ x: start.x + world.x / 2, y: start.y + world.y / 2 }));
    store.move(screen({ x: start.x + world.x, y: start.y + world.y }));
    return store.release();
  };
  return { store, screen, at, drag };
};

test("an item's world size is its pixel size times its scale", () => {
  const { store } = setUp();

  expect(store.items()[0]).toMatchObject({ width: 200, height: 100 });
});

test("a click selects the item under it, shift-click adds and removes, and empty canvas clears", () => {
  const { store, screen } = setUp();

  store.press(screen({ x: 0, y: 0 }), false);
  expect(store.release()).toBeNull();
  expect([...store.selection()]).toEqual(["a"]);

  store.press(screen({ x: 300, y: 0 }), true);
  store.release();
  expect([...store.selection()].sort()).toEqual(["a", "b"]);

  store.press(screen({ x: 300, y: 0 }), true);
  store.release();
  expect([...store.selection()]).toEqual(["a"]);

  store.press(screen({ x: 150, y: 400 }), false);
  store.release();
  expect(store.selection().size).toBe(0);
  expect(store.gesture().kind).toBe("idle");
});

test("a press that moves less than the threshold is a click and saves nothing", () => {
  const { store, screen, at } = setUp();
  const start = screen({ x: 0, y: 0 });

  store.press(start, false);
  store.move({ x: start.x + 2, y: start.y + 1 });

  expect(store.gesture()).toMatchObject({ kind: "dragging", moved: false });
  expect(store.release()).toBeNull();
  expect(at("a")).toEqual({ x: 0, y: 0 });
});

test("a drag moves the whole selection and returns one entry that undoes and redoes the move", () => {
  const { store, screen, at, drag } = setUp();
  store.press(screen({ x: 0, y: 0 }), false);
  store.release();
  store.press(screen({ x: 300, y: 0 }), true);
  store.release();

  const drop = drag("a", { x: 40, y: -20 });

  const byKey = (ops: ReadonlyArray<ItemOp>) =>
    posesOf(ops).sort((m, n) => (m.key < n.key ? -1 : 1));
  expect(byKey(drop!.entry.redo)).toEqual([
    { key: "a", x: 40, y: -20 },
    { key: "b", x: 340, y: -20 },
  ]);
  expect(byKey(drop!.entry.undo)).toEqual([
    { key: "a", x: 0, y: 0 },
    { key: "b", x: 300, y: 0 },
  ]);
  expect([at("a"), at("b")]).toEqual([
    { x: 40, y: -20 },
    { x: 340, y: -20 },
  ]);
  expect(store.gesture().kind).toBe("idle");
});

test("a click on one item of a selection selects it alone, and a drag keeps the selection", () => {
  const { store, screen, drag } = setUp();
  store.press(screen({ x: 0, y: 0 }), false);
  store.release();
  store.press(screen({ x: 300, y: 0 }), true);
  store.release();

  drag("b", { x: 10, y: 10 });
  expect(store.selection().size).toBe(2);

  store.press(screen({ x: 310, y: 10 }), false);
  store.release();
  expect([...store.selection()]).toEqual(["b"]);
});

test("dragging an unselected item selects it alone and moves only it", () => {
  const { store, screen, drag } = setUp();
  store.press(screen({ x: 0, y: 0 }), false);
  store.release();

  const drop = drag("b", { x: 50, y: 0 });

  expect([...store.selection()]).toEqual(["b"]);
  expect(posesOf(drop!.entry.redo)).toEqual([{ key: "b", x: 350, y: 0 }]);
});

test("the gesture is panning between a pan press and its release, and moves the camera", () => {
  const { store } = setUp();
  const before = store.camera();

  store.startPan({ x: 500, y: 400 });
  store.move({ x: 450, y: 420 });

  expect(store.gesture().kind).toBe("panning");
  expect(store.camera().x).toBeCloseTo(before.x + 50 / before.zoom);
  expect(store.camera().y).toBeCloseTo(before.y - 20 / before.zoom);
  expect(store.release()).toBeNull();
  expect(store.gesture().kind).toBe("idle");
});

test("a server change to an item in a drag does not move it, and other items take changes", () => {
  const { store, screen } = setUp();
  store.press(screen({ x: 0, y: 0 }), false);
  store.move(screen({ x: 30, y: 30 }));

  store.applyChanges({
    rev: 2,
    items: [
      { ...a, x: 900 },
      { ...b, x: 600 },
    ],
  });

  expect(store.items().find(({ key }) => key === "a")).toMatchObject({ x: 30, y: 30 });
  expect(store.items().find(({ key }) => key === "b")).toMatchObject({ x: 600 });
});

test("after a drop, the item keeps its local position until the server state holds the save", () => {
  const { store, at, drag } = setUp();
  const drop = drag("a", { x: 100, y: 0 })!;

  store.applyChanges({ rev: 2, items: [{ ...a, x: -500 }] });
  expect(at("a")).toEqual({ x: 100, y: 0 });

  store.acknowledge(drop.save, 3);
  expect(at("a")).toEqual({ x: 100, y: 0 });

  store.applyChanges({ rev: 3, items: [{ ...a, x: 100 }] });
  expect(at("a")).toEqual({ x: 100, y: 0 });

  store.applyChanges({ rev: 4, items: [{ ...a, x: 777 }] });
  expect(at("a")).toEqual({ x: 777, y: 0 });
});

test("a save acknowledged after the server state already holds it lets go at once", () => {
  const { store, at, drag } = setUp();
  const drop = drag("a", { x: 100, y: 0 })!;

  store.applyChanges({ rev: 3, items: [{ ...a, x: 100 }] });
  expect(at("a")).toEqual({ x: 100, y: 0 });
  store.acknowledge(drop.save, 3);
  store.applyChanges({ rev: 4, items: [{ ...a, x: 5 }] });

  expect(at("a")).toEqual({ x: 5, y: 0 });
});

test("a failed save puts the item back at its server position", () => {
  const { store, at, drag } = setUp();
  const drop = drag("a", { x: 100, y: 0 })!;

  store.reject(drop.save);

  expect(at("a")).toEqual({ x: 0, y: 0 });
});

test("an item that arrives with deletedAt leaves the scene and the selection", () => {
  const { store, screen, at } = setUp();
  store.press(screen({ x: 0, y: 0 }), false);
  store.release();

  store.applyChanges({ rev: 2, items: [{ ...a, deletedAt: 1 }] });

  expect(at("a")).toBeUndefined();
  expect(store.selection().size).toBe(0);
  expect(store.summary().items).toBe(1);
});

const selectBoth = ({ store, screen }: ReturnType<typeof setUp>) => {
  store.press(screen({ x: 0, y: 0 }), false);
  store.release();
  store.press(screen({ x: 300, y: 0 }), true);
  store.release();
};

test("an item deleted while it is dragged ends the drag, and the release saves nothing", () => {
  const { store, screen } = setUp();
  store.press(screen({ x: 0, y: 0 }), false);
  store.move(screen({ x: 30, y: 0 }));

  store.applyChanges({ rev: 2, items: [{ ...a, deletedAt: 1 }] });

  expect(store.gesture().kind).toBe("idle");
  expect(store.release()).toBeNull();
});

test("when one of two dragged items is deleted, the drop moves only the other", () => {
  const scene = setUp();
  const { store, screen } = scene;
  selectBoth(scene);
  store.press(screen({ x: 0, y: 0 }), false);
  store.move(screen({ x: 40, y: 0 }));

  store.applyChanges({ rev: 2, items: [{ ...a, deletedAt: 1 }] });

  expect(posesOf(store.release()!.entry.redo)).toEqual([{ key: "b", x: 340, y: 0 }]);
});

test("an item deleted during a click on it is not selected by the release", () => {
  const scene = setUp();
  const { store, screen } = scene;
  selectBoth(scene);
  store.press(screen({ x: 0, y: 0 }), false);

  store.applyChanges({ rev: 2, items: [{ ...a, deletedAt: 1 }] });
  store.release();

  expect([...store.selection()]).toEqual(["b"]);
});

test("a snapshot without the dragged item ends the drag", () => {
  const { store, screen } = setUp();
  store.press(screen({ x: 0, y: 0 }), false);
  store.move(screen({ x: 30, y: 0 }));

  store.loadSnapshot({ rev: 2, items: [b] });

  expect(store.gesture().kind).toBe("idle");
  expect(store.release()).toBeNull();
});

test("a snapshot older than the store's state is left out", () => {
  const { store, at } = setUp();
  store.applyChanges({ rev: 5, items: [{ ...a, x: 50 }] });

  expect(store.loadSnapshot({ rev: 4, items: [a, b] })).toBe(false);
  expect(at("a")).toEqual({ x: 50, y: 0 });
  expect(store.loadSnapshot({ rev: 5, items: [{ ...a, x: 50 }, b] })).toBe(true);
});

test("changes older than the store's state are ignored", () => {
  const { store, at } = setUp();
  store.applyChanges({ rev: 5, items: [{ ...a, x: 50 }] });

  store.applyChanges({ rev: 4, items: [{ ...a, x: -50 }] });

  expect(at("a")).toEqual({ x: 50, y: 0 });
});

test("React's summary keeps its identity while a drag moves items", () => {
  const { store, screen } = setUp();
  store.press(screen({ x: 0, y: 0 }), false);
  const during = store.summary();

  store.move(screen({ x: 40, y: 0 }));
  store.move(screen({ x: 80, y: 0 }));

  expect(store.summary()).toBe(during);
  store.zoom({ x: 0, y: 0 }, 2);
  expect(store.summary()).not.toBe(during);
});

const patch = (key: string, x: number, y: number): ItemOp => ({
  op: "patch",
  key,
  fields: { x, y },
});

test("a hold shows its positions at once and keeps them through a server change until its save", () => {
  const { store, at } = setUp();
  const save = store.hold([patch("a", -100, 50)]);
  expect(at("a")).toEqual({ x: -100, y: 50 });

  store.applyChanges({ rev: 2, items: [{ ...a, x: 900 }] });
  expect(at("a")).toEqual({ x: -100, y: 50 });

  store.acknowledge(save, 3);
  store.applyChanges({ rev: 3, items: [{ ...a, x: -100, y: 50 }] });
  store.applyChanges({ rev: 4, items: [{ ...a, x: 7 }] });
  expect(at("a")).toEqual({ x: 7, y: 0 });
});

test("an undo held right after its drag keeps its positions when the drag's save is settled", () => {
  const { store, at, drag } = setUp();
  const drop = drag("a", { x: 100, y: 0 })!;
  const undo = store.hold(drop.entry.undo);

  store.acknowledge(drop.save, 2);
  store.applyChanges({ rev: 2, items: [{ ...a, x: 100 }] });
  expect(at("a")).toEqual({ x: 0, y: 0 });

  store.reject(drop.save);
  expect(at("a")).toEqual({ x: 0, y: 0 });

  store.reject(undo);
  expect(at("a")).toEqual({ x: 100, y: 0 });
});

test("a hold leaves alone ops that set no position and items that are not on the canvas", () => {
  const { store, at } = setUp();
  store.hold([
    { op: "remove", key: "a" },
    { op: "add", refId: "ref-c", x: 5, y: 5 },
    { op: "patch", key: "b", fields: { z: "a5" } },
    patch("gone", 1, 1),
  ]);

  expect([at("a"), at("b"), at("gone")]).toEqual([{ x: 0, y: 0 }, { x: 300, y: 0 }, undefined]);
});

test("select all selects every item, and clear empties the selection", () => {
  const { store } = setUp();

  store.selectAll();
  expect([...store.selection()].sort()).toEqual(["a", "b"]);
  expect(store.summary().selected).toBe(2);

  store.clearSelection();
  expect(store.selection().size).toBe(0);
});

test("ops apply when every item they patch or remove is on the canvas or added by the same ops", () => {
  const { store } = setUp();

  expect(store.applies([patch("a", 1, 1), { op: "remove", key: "b" }])).toBe(true);
  expect(store.applies([patch("a", 1, 1), patch("gone", 1, 1)])).toBe(false);
  expect(store.applies([{ op: "remove", key: "gone" }])).toBe(false);
  expect(
    store.applies([
      { op: "add", refId: "gone", x: 0, y: 0 },
      { op: "patch", key: "gone", fields: { z: "a0" } },
    ]),
  ).toBe(true);
});

const item = (store: ReturnType<typeof setUp>["store"], key: string) =>
  store.items().find((candidate) => candidate.key === key)!;

test("a resize handle scales the selection about the opposite corner, and the release saves x, y, and scale", () => {
  const { store, screen } = setUp();
  store.press(screen({ x: 0, y: 0 }), false);
  store.release();
  const frame = store.frame()!;
  const grip = handleAt(frame, "se");
  const during = store.summary();

  store.grab("se", screen(grip));
  store.move(screen({ x: grip.x + 100, y: grip.y + 50 }));

  expect(store.gesture().kind).toBe("resizing");
  expect(item(store, "a")).toMatchObject({ x: 50, y: 25, scale: 0.75, width: 300, height: 150 });
  expect(store.summary()).toBe(during);
  const drop = store.release()!;
  expect(drop.entry).toEqual({
    undo: [{ op: "patch", key: "a", fields: { x: 0, y: 0, scale: 0.5 } }],
    redo: [{ op: "patch", key: "a", fields: { x: 50, y: 25, scale: 0.75 } }],
  });
  expect(store.frame()).toMatchObject({ x: 50, y: 25, width: 300, height: 150 });
  expect(item(store, "a")).toMatchObject({ x: 50, y: 25, scale: 0.75 });
});

test("the rotate handle turns the selection about its frame's center, snaps with Shift, and saves x, y, and rotation", () => {
  const scene = setUp();
  const { store, screen } = scene;
  selectBoth(scene);
  const center = { x: store.frame()!.x, y: store.frame()!.y };

  store.grab("rotate", screen({ x: center.x, y: center.y - 200 }));
  store.move(screen({ x: center.x + 200, y: center.y - 10 }), true);

  expect(store.gesture()).toMatchObject({ kind: "rotating", snap: true });
  const drop = store.release()!;
  expect(drop.entry.redo).toHaveLength(2);
  for (const op of drop.entry.redo) {
    expect(op).toMatchObject({ op: "patch" });
    expect(Object.keys(op.op === "patch" ? op.fields : {}).sort()).toEqual(["rotation", "x", "y"]);
  }
  expect(item(store, "a").rotation).toBe(6 * snapStep);
  expect(item(store, "b").rotation).toBe(6 * snapStep);
  expect(item(store, "a").x).toBeCloseTo(center.x, 9);
  expect(item(store, "a").y).toBeCloseTo(-center.x, 9);
});

test("a press on a handle released without moving saves nothing", () => {
  const { store, screen } = setUp();
  store.press(screen({ x: 0, y: 0 }), false);
  store.release();
  const grip = screen(handleAt(store.frame()!, "n"));

  store.grab("n", grip);
  store.move(grip);
  expect(store.release()).toBeNull();
  store.grab("rotate", { x: grip.x, y: grip.y - 20 });
  expect(store.release()).toBeNull();
  expect(store.gesture().kind).toBe("idle");
});

test("a server change to an item in a resize does not change it", () => {
  const { store, screen } = setUp();
  store.press(screen({ x: 0, y: 0 }), false);
  store.release();
  const grip = handleAt(store.frame()!, "e");
  store.grab("e", screen(grip));
  store.move(screen({ x: grip.x + 100, y: grip.y }));

  store.applyChanges({ rev: 2, items: [{ ...a, scale: 2, rotation: 1, x: 900 }] });

  expect(item(store, "a")).toMatchObject({ x: 50, y: 0, scale: 0.75, rotation: 0 });
});

test("with nothing selected, a handle press starts no gesture", () => {
  const { store } = setUp();

  store.grab("se", { x: 0, y: 0 });

  expect(store.gesture().kind).toBe("idle");
  expect(store.frame()).toBeNull();
});

test("a hold shows scale and rotation at once, and a later hold keeps the fields of one not yet settled", () => {
  const { store } = setUp();
  const resize = store.hold([{ op: "patch", key: "a", fields: { x: 5, y: 5, scale: 1 } }]);
  const turn = store.hold([{ op: "patch", key: "a", fields: { x: 6, y: 6, rotation: 1 } }]);

  expect(item(store, "a")).toMatchObject({ x: 6, y: 6, scale: 1, rotation: 1, width: 400 });

  store.acknowledge(resize, 2);
  store.applyChanges({ rev: 2, items: [{ ...a, x: 5, y: 5, scale: 1 }] });
  expect(item(store, "a")).toMatchObject({ x: 6, y: 6, scale: 1, rotation: 1 });

  store.acknowledge(turn, 3);
  store.applyChanges({ rev: 3, items: [{ ...a, x: 6, y: 6, scale: 1, rotation: 1 }] });
  store.applyChanges({ rev: 4, items: [{ ...a, scale: 3 }] });
  expect(item(store, "a")).toMatchObject({ x: 0, y: 0, scale: 3, rotation: 0 });
});
