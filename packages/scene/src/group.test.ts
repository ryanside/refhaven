import { expect, test } from "vitest";
import {
  type CanvasItem,
  type Point,
  type ServerItem,
  createSceneStore,
  groupEntry,
  grouped,
  ungroupEntry,
  worldToScreen,
} from "./index";

const serverItem = (key: string, x: number, parent?: string): ServerItem => ({
  kind: "image",
  key,
  refId: `ref-${key}`,
  x,
  y: 0,
  width: 200,
  height: 100,
  scale: 1,
  rotation: 0,
  z: `a${x / 300}`,
  ...(parent ? { parent } : {}),
});

// Two groups and an item in neither, in a row: a b | c | d e.
const items = [
  serverItem("a", 0, "g1"),
  serverItem("b", 300, "g1"),
  serverItem("c", 600),
  serverItem("d", 900, "g2"),
  serverItem("e", 1200, "g2"),
];
const groups = [
  { kind: "group", key: "g1" },
  { kind: "group", key: "g2" },
] as const;

const setUp = () => {
  const store = createSceneStore();
  store.setViewport({ width: 2000, height: 800 });
  store.loadSnapshot({ rev: 1, items: [...items, ...groups] });
  const screen = (world: Point) => worldToScreen(store.camera(), world);
  const click = (x: number, shift = false) => {
    store.press(screen({ x, y: 0 }), shift);
    return store.release();
  };
  const marquee = (from: Point, to: Point, shift = false) => {
    store.press(screen(from), shift);
    store.move(screen(to));
    store.release();
  };
  const selection = () => [...store.selection()].sort();
  return { store, click, marquee, selection };
};

test("the rule adds every other member of each named item's group", () => {
  expect([...grouped(items, ["a"])].sort()).toEqual(["a", "b"]);
  expect([...grouped(items, ["b", "d"])].sort()).toEqual(["a", "b", "d", "e"]);
  expect([...grouped(items, ["c"])]).toEqual(["c"]);
});

test("the rule leaves out a key that names no item, and does not reach its group through it", () => {
  const left = items.filter((item) => item.key !== "a");

  expect([...grouped(left, ["a"])]).toEqual([]);
  expect([...grouped(left, ["b"])]).toEqual(["b"]);
});

test("the store holds no group as an item", () => {
  const { store } = setUp();

  expect(store.summary().items).toBe(5);
  expect(store.items().map((item) => item.key)).toEqual(["a", "b", "c", "d", "e"]);
});

test("a click on a member selects its whole group, and on an item in no group that item alone", () => {
  const { click, selection } = setUp();

  expect(click(300)).toBeNull();
  expect(selection()).toEqual(["a", "b"]);
  click(600);
  expect(selection()).toEqual(["c"]);
});

test("a shift-click on a member adds its whole group, and on a selected member removes it", () => {
  const { click, selection } = setUp();
  click(600);

  click(900, true);
  expect(selection()).toEqual(["c", "d", "e"]);
  click(0, true);
  expect(selection()).toEqual(["a", "b", "c", "d", "e"]);
  click(1200, true);
  expect(selection()).toEqual(["a", "b", "c"]);
  click(600, true);
  expect(selection()).toEqual(["a", "b"]);
});

test("a click on a member of a larger selection keeps its whole group and lets go of the rest", () => {
  const { store, click, selection } = setUp();
  store.selectAll();

  click(1200);
  expect(selection()).toEqual(["d", "e"]);
});

test("a marquee that touches one member selects its whole group, with Shift too", () => {
  const { marquee, click, selection } = setUp();

  marquee({ x: -150, y: 100 }, { x: 0, y: 0 });
  expect(selection()).toEqual(["a", "b"]);
  click(600);
  marquee({ x: 1000, y: 100 }, { x: 900, y: 0 }, true);
  expect(selection()).toEqual(["c", "d", "e"]);
});

test("select all selects every member of every group", () => {
  const { store, selection } = setUp();

  store.selectAll();
  expect(selection()).toEqual(["a", "b", "c", "d", "e"]);
});

test("a member that left the scene leaves the selection, and the rest of its group stays", () => {
  const { store, click, selection } = setUp();
  click(0);

  store.applyChanges({ rev: 2, items: [{ ...items[0]!, deletedAt: 1 }] });
  expect(selection()).toEqual(["b"]);
  click(600);
  click(300);
  expect(selection()).toEqual(["b"]);
});

test("an item that joins a group of the selection, from the server or a held patch, joins the selection", () => {
  const { store, click, selection } = setUp();
  click(0);

  store.applyChanges({ rev: 2, items: [{ ...items[2]!, parent: "g1" }] });
  expect(selection()).toEqual(["a", "b", "c"]);
  store.hold([{ op: "patch", key: "d", fields: { parent: "g1" } }]);
  expect(selection()).toEqual(["a", "b", "c", "d"]);
});

test("a held parent of null takes an item out of its group at once", () => {
  const { store, click, selection } = setUp();

  store.hold([{ op: "patch", key: "a", fields: { parent: null } }]);
  click(300);
  expect(selection()).toEqual(["b"]);
});

const canvasItems = (store: ReturnType<typeof setUp>["store"]) => store.items();
const pick = (all: ReadonlyArray<CanvasItem>, keys: ReadonlyArray<string>) =>
  all.filter((item) => keys.includes(item.key));

test("grouping adds the group and puts each item in it, and its undo removes it and puts back old groups", () => {
  const all = canvasItems(setUp().store);

  expect(groupEntry(pick(all, ["b", "c"]), "g3")).toEqual({
    undo: [
      { op: "remove", key: "g3" },
      { op: "patch", key: "b", fields: { parent: "g1" } },
    ],
    redo: [
      { op: "addGroup", key: "g3" },
      { op: "patch", key: "b", fields: { parent: "g3" } },
      { op: "patch", key: "c", fields: { parent: "g3" } },
    ],
  });
});

test("grouping one item, or items that are already one group, is no edit", () => {
  const all = canvasItems(setUp().store);

  expect(groupEntry(pick(all, ["c"]), "g3")).toBeNull();
  expect(groupEntry(pick(all, ["a", "b"]), "g3")).toBeNull();
  expect(groupEntry(pick(all, ["a", "b", "d", "e"]), "g3")).not.toBeNull();
});

test("ungrouping removes each group of the selection, and its undo brings each back with its members", () => {
  const all = canvasItems(setUp().store);

  expect(ungroupEntry(pick(all, ["a", "b", "c", "d", "e"]), all)).toEqual({
    undo: [
      { op: "addGroup", key: "g1" },
      { op: "addGroup", key: "g2" },
      { op: "patch", key: "a", fields: { parent: "g1" } },
      { op: "patch", key: "b", fields: { parent: "g1" } },
      { op: "patch", key: "d", fields: { parent: "g2" } },
      { op: "patch", key: "e", fields: { parent: "g2" } },
    ],
    redo: [
      { op: "remove", key: "g1" },
      { op: "remove", key: "g2" },
    ],
  });
  expect(ungroupEntry(pick(all, ["c"]), all)).toBeNull();
});

test("ops apply when each group they remove or put an item in is on the canvas or added by them", () => {
  const { store } = setUp();

  expect(store.applies([{ op: "remove", key: "g1" }])).toBe(true);
  expect(store.applies([{ op: "patch", key: "c", fields: { parent: "g2" } }])).toBe(true);
  expect(store.applies([{ op: "patch", key: "c", fields: { parent: null } }])).toBe(true);
  expect(store.applies([{ op: "patch", key: "c", fields: { parent: "g3" } }])).toBe(false);
  expect(
    store.applies([
      { op: "addGroup", key: "g3" },
      { op: "patch", key: "c", fields: { parent: "g3" } },
    ]),
  ).toBe(true);

  store.applyChanges({ rev: 2, items: [{ kind: "group", key: "g1", deletedAt: 1 }] });
  expect(store.applies([{ op: "remove", key: "g1" }])).toBe(false);
});
