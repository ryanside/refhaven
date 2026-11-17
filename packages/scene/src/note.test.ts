import { expect, test } from "vitest";
import {
  centerFrom,
  noteBox,
  noteTextureEdge,
  noteTextureSize,
  noteType,
  topLeftOf,
  wrapNote,
} from "./note";

/** Every character is 10 units wide. */
const measure = (text: string) => text.length * 10;

test("a line that fits stays whole", () => {
  expect(wrapNote("one two", measure, 100)).toEqual(["one two"]);
});

test("a line wraps at the last space that fits, and the space is not drawn", () => {
  expect(wrapNote("one two three four", measure, 100)).toEqual(["one two", "three four"]);
});

test("a word wider than a line breaks between characters", () => {
  expect(wrapNote("abcdefghijklmn xy", measure, 50)).toEqual(["abcde", "fghij", "klmn", "xy"]);
});

test("a newline starts a line, and an empty line stays", () => {
  expect(wrapNote("one\n\ntwo", measure, 100)).toEqual(["one", "", "two"]);
});

test("a box fits the widest line and every line, with the padding", () => {
  const { padding, lineHeight, maxWidth } = noteType;
  expect(noteBox("ab\nabcd", measure)).toEqual({
    width: 40 + 2 * padding,
    height: 2 * lineHeight + 2 * padding,
  });
  const long = "word ".repeat(40).trim();
  const box = noteBox(long, measure);
  expect(box.width).toBeLessThanOrEqual(maxWidth);
  expect(box.height).toBe(
    wrapNote(long, measure, maxWidth - 2 * padding).length * lineHeight + 2 * padding,
  );
});

test("a texture has four pixels per unit, and a long note's is capped at the longest edge", () => {
  expect(noteTextureSize({ width: 100, height: 30 })).toEqual({
    width: 400,
    height: 120,
    density: 4,
  });
  const tall = noteTextureSize({ width: 320, height: 2000 });
  expect(tall.height).toBe(noteTextureEdge);
  expect(tall.width).toBe(Math.round((320 * noteTextureEdge) / 2000));
});

test("a box that grows from the same top-left corner moves its center with the turn and the scale", () => {
  const note = { x: 100, y: 50, width: 40, height: 20, scale: 2, rotation: Math.PI / 2 };
  const corner = topLeftOf(note);
  expect(corner.x).toBeCloseTo(120);
  expect(corner.y).toBeCloseTo(10);
  const center = centerFrom(corner, { width: 60, height: 20 }, note);
  expect(center.x).toBeCloseTo(100);
  expect(center.y).toBeCloseTo(70);
  expect(centerFrom(corner, note, note).x).toBeCloseTo(note.x);
  expect(centerFrom(corner, note, note).y).toBeCloseTo(note.y);
});
