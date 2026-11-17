import { expect, test } from "vitest";
import { addEntry, createHistory, moveEntry, movesOf, removalEntry } from "./index";

const first = moveEntry([{ key: "a", x: 0, y: 0 }], [{ key: "a", x: 10, y: 0 }]);
const second = moveEntry([{ key: "b", x: 0, y: 0 }], [{ key: "b", x: 0, y: 10 }]);

test("an empty history has nothing to undo or redo", () => {
  const history = createHistory();

  expect(history.undo()).toBeNull();
  expect(history.redo()).toBeNull();
  expect(history.summary()).toEqual({ canUndo: false, canRedo: false });
});

test("undo returns the latest edit and moves it to redo, and redo moves it back", () => {
  const history = createHistory();
  history.record(first);
  history.record(second);

  expect(history.undo()).toBe(second);
  expect(history.summary()).toEqual({ canUndo: true, canRedo: true });
  expect(history.undo()).toBe(first);
  expect(history.undo()).toBeNull();
  expect(history.summary()).toEqual({ canUndo: false, canRedo: true });

  expect(history.redo()).toBe(first);
  expect(history.redo()).toBe(second);
  expect(history.redo()).toBeNull();
  expect(history.summary()).toEqual({ canUndo: true, canRedo: false });
});

test("a new edit after an undo empties redo", () => {
  const history = createHistory();
  history.record(first);
  history.undo();

  history.record(second);

  expect(history.summary()).toEqual({ canUndo: true, canRedo: false });
  expect(history.redo()).toBeNull();
  expect(history.undo()).toBe(second);
});

test("a dropped entry leaves its stack, and the rest of the stack stays", () => {
  const history = createHistory();
  history.record(first);
  history.record(second);
  const failed = history.undo()!;

  history.drop(failed);

  expect(history.summary()).toEqual({ canUndo: true, canRedo: false });
  expect(history.undo()).toBe(first);
});

test("the summary keeps its identity while the answers stay the same, and listeners hear each change", () => {
  const history = createHistory();
  let heard = 0;
  history.subscribe(() => (heard += 1));
  history.record(first);
  const summary = history.summary();

  history.record(second);

  expect(history.summary()).toBe(summary);
  expect(heard).toBe(2);
});

test("a removal is undone by one add per item, at its old place and its old z", () => {
  const entry = removalEntry([
    { key: "r1", refId: "r1", x: 5, y: 6, z: "a3" },
    { key: "r2", refId: "r2", x: 7, y: 8, z: "a1" },
  ]);

  expect(entry.undo).toEqual([
    { op: "add", refId: "r1", x: 5, y: 6, z: "a3" },
    { op: "add", refId: "r2", x: 7, y: 8, z: "a1" },
  ]);
  expect(entry.redo).toEqual([
    { op: "remove", key: "r1" },
    { op: "remove", key: "r2" },
  ]);
  expect(movesOf(entry.undo)).toEqual([]);
});

test("an add is undone by removing the Ref's item and redone by adding it at the same place", () => {
  const entry = addEntry([{ refId: "r1", x: 1, y: 2 }]);

  expect(entry).toEqual({
    undo: [{ op: "remove", key: "r1" }],
    redo: [{ op: "add", refId: "r1", x: 1, y: 2 }],
  });
});

test("an add whose place in the stack is known is redone at that place", () => {
  expect(addEntry([{ refId: "r1", x: 1, y: 2, z: "a4" }]).redo).toEqual([
    { op: "add", refId: "r1", x: 1, y: 2, z: "a4" },
  ]);
});

test("a move patches the old positions to undo and the new ones to redo", () => {
  expect(movesOf(first.undo)).toEqual([{ key: "a", x: 0, y: 0 }]);
  expect(movesOf(first.redo)).toEqual([{ key: "a", x: 10, y: 0 }]);
});

test("undoing a removal takes as many ops as the removal, so the largest removal one call can make can be undone", () => {
  const items = Array.from({ length: 1000 }, (_, index) => ({
    key: `r${index}`,
    refId: `r${index}`,
    x: index,
    y: 0,
    z: "a0",
  }));
  const entry = removalEntry(items);

  expect(entry.redo).toHaveLength(1000);
  expect(entry.undo).toHaveLength(1000);
});
