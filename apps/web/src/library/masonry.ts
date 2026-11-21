/** Where a tile sits in the gallery, and how tall its image is drawn. */
export type Box = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly imageHeight: number;
};

const columnGap = 12;
const rowGap = 24;
export const captionHeight = 24;
const narrowestColumn = 220;
/** A very tall image is cut to this many times its width, from the top. */
export const tallest = 2.5;

/**
 * Lays images out in columns, each whole at its own aspect ratio. Each image goes to the column
 * that ends highest, so the newest fill the top row from the left.
 */
export function arrange(sizes: ReadonlyArray<{ width: number; height: number }>, width: number) {
  if (sizes.length === 0 || width <= 0) return { boxes: [], height: 0 };
  const count = Math.max(2, Math.floor((width + columnGap) / (narrowestColumn + columnGap)));
  const columnWidth = (width - columnGap * (count - 1)) / count;
  const bottoms = Array.from({ length: count }, () => 0);
  const boxes: Array<Box> = sizes.map((size) => {
    const column = bottoms.indexOf(Math.min(...bottoms));
    const imageHeight = columnWidth * Math.min(tallest, size.height / size.width);
    const box = {
      left: column * (columnWidth + columnGap),
      top: bottoms[column]!,
      width: columnWidth,
      imageHeight,
    };
    bottoms[column]! += imageHeight + captionHeight + rowGap;
    return box;
  });
  return { boxes, height: Math.max(...bottoms) - rowGap };
}
