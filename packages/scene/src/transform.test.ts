import { expect, test } from "vitest";
import {
  type Handle,
  type Point,
  type Pose,
  type Rect,
  frameOf,
  handleAt,
  resized,
  rotated,
  snapStep,
} from "./index";

const pixels = { width: 400, height: 200 };

const pose = (x: number, y: number, rotation = 0): Pose => ({ x, y, scale: 0.5, rotation });

const rectOf = ({ x, y, scale, rotation }: Pose): Rect => ({
  x,
  y,
  width: pixels.width * scale,
  height: pixels.height * scale,
  rotation,
});

const frameAfter = (poses: ReadonlyMap<string, Pose>) => frameOf([...poses.values()].map(rectOf))!;

const expectPoint = (actual: Point, expected: Point) => {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
};

const drag = (
  poses: ReadonlyMap<string, Pose>,
  handle: Handle,
  by: Point,
  minEdge = 1,
): Map<string, Pose> => {
  const frame = frameAfter(poses);
  const from = handleAt(frame, handle);
  return resized(poses, frame, handle, from, { x: from.x + by.x, y: from.y + by.y }, minEdge);
};

test("one item's frame is its own turned rectangle, and several items' is the upright box around them", () => {
  expect(frameOf([rectOf(pose(10, 20, 0.3))])).toEqual({
    x: 10,
    y: 20,
    width: 200,
    height: 100,
    rotation: 0.3,
  });
  const box = frameOf([rectOf(pose(0, 0)), rectOf(pose(300, 0, Math.PI / 2))])!;
  for (const [field, value] of Object.entries({ x: 125, y: 0, width: 450, height: 200 })) {
    expect(box[field as keyof Rect]).toBeCloseTo(value, 9);
  }
  expect(box.rotation).toBe(0);
  expect(frameOf([])).toBeNull();
});

test("a corner handle scales the item about the opposite corner, which stays where it is", () => {
  const before = new Map([["a", pose(0, 0)]]);

  const after = drag(before, "se", { x: 200, y: 100 });

  expect(after.get("a")).toEqual({ x: 100, y: 50, scale: 1, rotation: 0 });
  expectPoint(handleAt(frameAfter(after), "nw"), handleAt(frameAfter(before), "nw"));
});

test("an edge handle scales both sides by the distance along its direction, about the opposite edge's middle", () => {
  const before = new Map([["a", pose(0, 0)]]);

  const after = drag(before, "e", { x: 50, y: 80 });

  expect(after.get("a")).toEqual({ x: 25, y: 0, scale: 0.625, rotation: 0 });
  const frame = frameAfter(after);
  expect(frame.width / frame.height).toBe(2);
  expectPoint(handleAt(frame, "w"), handleAt(frameAfter(before), "w"));
});

test("a turned item scales along its own axes, and its opposite edge's middle stays where it is", () => {
  const before = new Map([["a", pose(0, 0, Math.PI / 2)]]);
  expectPoint(handleAt(frameAfter(before), "e"), { x: 0, y: 100 });

  const after = drag(before, "e", { x: 0, y: 100 });

  const a = after.get("a")!;
  expect(a.scale).toBeCloseTo(0.75, 9);
  expect(a.rotation).toBe(Math.PI / 2);
  expectPoint(a, { x: 0, y: 50 });
  expectPoint(handleAt(frameAfter(after), "w"), { x: 0, y: -100 });
});

test("several items scale by one factor, and their centers move along the lines from the fixed point", () => {
  const before = new Map([
    ["a", pose(0, 0)],
    ["b", { ...pose(300, 0), scale: 0.25 }],
  ]);
  const fixed = handleAt(frameAfter(before), "se");

  const after = drag(before, "nw", { x: -250, y: -50 });

  const factor = after.get("a")!.scale / 0.5;
  expect(factor).toBeGreaterThan(1.5);
  expect(after.get("b")!.scale / 0.25).toBeCloseTo(factor, 9);
  for (const key of ["a", "b"]) {
    const start = before.get(key)!;
    expectPoint(after.get(key)!, {
      x: fixed.x + (start.x - fixed.x) * factor,
      y: fixed.y + (start.y - fixed.y) * factor,
    });
  }
  expectPoint(handleAt(frameAfter(after), "se"), fixed);
});

test("dragging far past the fixed point stops at the floor, so the selection neither vanishes nor flips", () => {
  const before = new Map([["a", pose(0, 0)]]);

  const after = drag(before, "se", { x: -1000, y: -1000 }, 8);

  const a = after.get("a")!;
  expect(a.scale).toBeGreaterThan(0);
  expect(Math.max(rectOf(a).width, rectOf(a).height)).toBeCloseTo(8, 9);
  expectPoint(handleAt(frameAfter(after), "nw"), handleAt(frameAfter(before), "nw"));
});

test("a quarter turn of the pointer turns each item a quarter and turns its center about the frame's center", () => {
  const before = new Map([
    ["a", pose(100, 0)],
    ["b", pose(-100, 0, 0.2)],
  ]);

  const after = rotated(before, { x: 0, y: 0 }, { x: 0, y: -100 }, { x: 100, y: 0 }, false);

  expect(after.get("a")!.rotation).toBeCloseTo(Math.PI / 2, 9);
  expect(after.get("b")!.rotation).toBeCloseTo(0.2 + Math.PI / 2, 9);
  expectPoint(after.get("a")!, { x: 0, y: 100 });
  expectPoint(after.get("b")!, { x: 0, y: -100 });
  expect(after.get("a")!.scale).toBe(0.5);
});

test("with snap, a turn of 50 degrees becomes exactly 45, and without it stays 50", () => {
  const before = new Map([["a", pose(0, 0)]]);
  const up = { x: 0, y: -100 };
  const at50 = {
    x: 100 * Math.cos((-40 * Math.PI) / 180),
    y: 100 * Math.sin((-40 * Math.PI) / 180),
  };

  expect(rotated(before, { x: 0, y: 0 }, up, at50, true).get("a")!.rotation).toBe(3 * snapStep);
  expect(3 * snapStep).toBeCloseTo(Math.PI / 4, 15);
  expect(rotated(before, { x: 0, y: 0 }, up, at50, false).get("a")!.rotation).toBeCloseTo(
    (50 * Math.PI) / 180,
    9,
  );
});

test("a turn across the pointer's starting angle's far side is measured the short way round", () => {
  const before = new Map([["a", pose(0, 0)]]);
  const at = (degrees: number) => ({
    x: Math.cos((degrees * Math.PI) / 180),
    y: Math.sin((degrees * Math.PI) / 180),
  });

  const after = rotated(before, { x: 0, y: 0 }, at(170), at(-170), false);

  expect(after.get("a")!.rotation).toBeCloseTo((20 * Math.PI) / 180, 9);
});

test("the floor never enlarges a frame that is already smaller than it", () => {
  const tiny = { x: 0, y: 0, width: 2, height: 1, rotation: 0 };
  const poses = new Map([["a", { x: 0, y: 0, scale: 0.01, rotation: 0 }]]);
  const grip = handleAt(tiny, "se");

  expect(resized(poses, tiny, "se", grip, grip, 8).get("a")).toEqual({
    x: 0,
    y: 0,
    scale: 0.01,
    rotation: 0,
  });
});

test("with snap, one item ends at a whole step, so it can come back to upright", () => {
  const poses = new Map([["a", { x: 0, y: 0, scale: 1, rotation: 0.1 }]]);
  const turnedBy = (angle: number) =>
    rotated(
      poses,
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: Math.cos(angle), y: Math.sin(angle) },
      true,
    ).get("a")!.rotation;

  expect(turnedBy(0.5)).toBeCloseTo(2 * snapStep, 12);
  expect(turnedBy(-0.12)).toBeCloseTo(0, 12);
});

test("with snap, several items turn by one whole step and keep their own offsets", () => {
  const poses = new Map([
    ["a", { x: 10, y: 0, scale: 1, rotation: 0.1 }],
    ["b", { x: -10, y: 0, scale: 1, rotation: 0.3 }],
  ]);
  const turned = rotated(
    poses,
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: Math.cos(0.5), y: Math.sin(0.5) },
    true,
  );

  expect(turned.get("a")!.rotation).toBeCloseTo(0.1 + 2 * snapStep, 12);
  expect(turned.get("b")!.rotation).toBeCloseTo(0.3 + 2 * snapStep, 12);
});
