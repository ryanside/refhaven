import { expect, test } from "vitest";
import { daysLeft, trashMs } from "./trash";

const day = 24 * 60 * 60 * 1000;

test.each([
  [0, 30],
  [1, 30],
  [day, 29],
  [29.5 * day, 1],
  [trashMs, 0],
  [trashMs + day, 0],
])("an image deleted %d ms ago has %d days left", (age, left) => {
  expect(daysLeft(1_000_000_000_000, 1_000_000_000_000 + age)).toBe(left);
});
