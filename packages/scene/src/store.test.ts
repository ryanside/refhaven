import { expect, test } from "vitest";
import { type Point, type ServerItem, createSceneStore, worldToScreen } from "./index";

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

test("a drag moves the whole selection and returns one drop with a move per item", () => {
  const { store, screen, at, drag } = setUp();
  store.press(screen({ x: 0, y: 0 }), false);
  store.release();
  store.press(screen({ x: 300, y: 0 }), true);
  store.release();

  const drop = drag("a", { x: 40, y: -20 });

  expect([...drop!.moves].sort((m, n) => (m.key < n.key ? -1 : 1))).toEqual([
    { key: "a", x: 40, y: -20 },
    { key: "b", x: 340, y: -20 },
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
  expect(drop?.moves).toEqual([{ key: "b", x: 350, y: 0 }]);
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
