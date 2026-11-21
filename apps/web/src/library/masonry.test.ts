import { expect, test } from "vitest";
import { arrange, captionHeight, tallest } from "./masonry";

const library = [
  [1080, 1920],
  [1170, 2080],
  [1800, 2400],
  [2160, 1440],
  [2000, 2000],
  [2400, 1500],
  [2400, 1500],
  [1350, 2400],
  [1800, 2400],
  [1920, 2400],
  [2200, 2200],
  [1600, 2400],
  [1600, 2400],
  [2400, 1500],
  [2400, 1600],
  [1760, 2200],
  [1920, 2400],
].map(([width, height]) => ({ width: width!, height: height! }));
const pageWidth = 1421;

const columnEnds = (boxes: ReturnType<typeof arrange>["boxes"]) => {
  const ends = new Map<number, number>();
  for (const box of boxes) {
    ends.set(
      box.left,
      Math.max(ends.get(box.left) ?? 0, box.top + box.imageHeight + captionHeight),
    );
  }
  return [...ends.values()];
};

test("each image goes to the column that ends highest, so no column runs a whole tile past another", () => {
  for (const sizes of [library, library.slice(0, 7), library.slice(2)]) {
    const { boxes, height } = arrange(sizes, pageWidth);
    const ends = columnEnds(boxes);
    const tallestTile = Math.max(...boxes.map((box) => box.imageHeight + captionHeight + 24));

    expect(Math.max(...ends) - Math.min(...ends)).toBeLessThanOrEqual(tallestTile);
    expect(Math.max(...ends)).toBeCloseTo(height);
  }
});

test("the newest images fill the top row from the left, and every image fits the page", () => {
  const { boxes } = arrange(library, pageWidth);
  const firstRow = boxes.filter((box) => box.top === 0);

  expect(boxes.slice(0, firstRow.length)).toEqual(firstRow);
  const lefts = firstRow.map((box) => box.left);
  expect(lefts.slice(1).every((left, index) => left > lefts[index]!)).toBe(true);
  expect(firstRow.length).toBeGreaterThanOrEqual(5);
  for (const box of boxes) expect(box.left + box.width).toBeLessThanOrEqual(pageWidth + 0.01);
});

test("every image is drawn whole at its own aspect ratio, and only a very tall one is cut", () => {
  const { boxes } = arrange([...library, { width: 1000, height: 4000 }], pageWidth);

  boxes.forEach((box, index) => {
    const { width, height } =
      index < library.length ? library[index]! : { width: 1000, height: 4000 };
    expect(box.imageHeight).toBeCloseTo(box.width * Math.min(tallest, height / width));
  });
});

test("an empty gallery has no height", () => {
  expect(arrange([], pageWidth)).toEqual({ boxes: [], height: 0 });
});
