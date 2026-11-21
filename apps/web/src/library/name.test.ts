import { expect, test } from "vitest";
import { shownName } from "./name";

test("a name drops only its image extension", () => {
  expect(shownName("red.png")).toBe("red");
  expect(shownName("Photo.JPEG")).toBe("Photo");
  expect(shownName("plan.v2.webp")).toBe("plan.v2");
  expect(shownName("notes.txt")).toBe("notes.txt");
  expect(shownName(".png")).toBe(".png");
});
