/** Where a tile sits in the gallery, and how tall its image is drawn. */
export type Box = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly imageHeight: number;
};

/** The space between columns. */
const columnGap = 12;
/** From a caption to the next image below it. */
const rowGap = 24;
/** Under each image: a 6 px gap and one 18 px line of caption. */
export const captionHeight = 24;
const narrowestColumn = 220;
/** A very tall image is cut to this many times its width, from the top. */
const tallest = 2.5;
/** How far a column's images may be cut or widened so the columns end level. */
const leastScale = 0.8;
const mostScale = 1.25;
/** Columns that end within this many pixels of each other count as level. */
const level = 8;

type Column = { readonly tiles: Array<{ index: number; height: number }>; total: number };

/** Each image to the shortest column, so the newest fill the top row from the left. */
const fill = (
  sizes: ReadonlyArray<{ width: number; height: number }>,
  columnWidth: number,
  count: number,
) => {
  const columns: Array<Column> = Array.from({ length: count }, () => ({ tiles: [], total: 0 }));
  const bottoms = columns.map(() => 0);
  sizes.forEach(({ width, height }, index) => {
    const shortest = bottoms.indexOf(Math.min(...bottoms));
    const imageHeight = columnWidth * Math.min(tallest, height / width);
    columns[shortest]!.tiles.push({ index, height: imageHeight });
    columns[shortest]!.total += imageHeight;
    bottoms[shortest]! += imageHeight + captionHeight + rowGap;
  });
  return columns.filter((column) => column.tiles.length > 0);
};

/** The height of a column's tiles other than their images. */
const fixedHeight = (column: Column) =>
  column.tiles.length * captionHeight + (column.tiles.length - 1) * rowGap;

const scaleFor = (column: Column, end: number) =>
  Math.min(mostScale, Math.max(leastScale, (end - fixedHeight(column)) / column.total));

const endOf = (column: Column, scale: number) => fixedHeight(column) + column.total * scale;

/**
 * The common end that the columns come closest to when each column's images are cut or widened
 * within bounds, and how far apart the columns still end.
 */
const levelEnd = (columns: ReadonlyArray<Column>) => {
  const ends = columns.map((column) => endOf(column, 1));
  let best = { end: ends[0]!, spread: Number.POSITIVE_INFINITY };
  for (let end = Math.floor(Math.min(...ends)); end <= Math.ceil(Math.max(...ends)); end++) {
    const reached = columns.map((column) => endOf(column, scaleFor(column, end)));
    const spread = Math.max(...reached) - Math.min(...reached);
    if (spread < best.spread - 0.5) best = { end, spread };
  }
  return best;
};

/**
 * Lays images out in columns, each at its own aspect ratio, so the columns end level. Each image
 * goes to the shortest column, and then each column's images are cut or widened a little, the same
 * for the whole column, to meet a common end. A set that cannot end level in the most columns that
 * fit takes one column fewer when that ends more level.
 */
export function arrange(sizes: ReadonlyArray<{ width: number; height: number }>, width: number) {
  if (sizes.length === 0 || width <= 0) return { boxes: [], height: 0 };
  const most = Math.max(2, Math.floor((width + columnGap) / (narrowestColumn + columnGap)));
  const layouts = [most, most - 1]
    .filter((count) => count >= 2)
    .map((count) => {
      const columnWidth = (width - columnGap * (count - 1)) / count;
      const columns = fill(sizes, columnWidth, count);
      return { columnWidth, columns, ...levelEnd(columns) };
    });
  const chosen =
    layouts[0]!.spread <= level || layouts.length === 1 || layouts[0]!.spread <= layouts[1]!.spread
      ? layouts[0]!
      : layouts[1]!;

  const boxes: Array<Box> = [];
  let height = 0;
  chosen.columns.forEach((column, position) => {
    const scale = scaleFor(column, chosen.end);
    let top = 0;
    for (const tile of column.tiles) {
      const imageHeight = tile.height * scale;
      boxes[tile.index] = {
        left: position * (chosen.columnWidth + columnGap),
        top,
        width: chosen.columnWidth,
        imageHeight,
      };
      top += imageHeight + captionHeight + rowGap;
    }
    height = Math.max(height, top - rowGap);
  });
  return { boxes, height };
}
