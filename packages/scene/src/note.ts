import type { Point } from "./index";
import type { Size } from "./layout";

/** The colors a note's text can have. The browser maps each name to a color that reads on the canvas. */
export const noteColors = ["black", "red", "orange", "green", "blue", "purple"] as const;

export type NoteColor = (typeof noteColors)[number];

/** The most characters a note's text holds. The server refuses more, and the editor stops there. */
export const maxNoteText = 2000;

/** A note's type at scale 1, in world units. A line wraps at `maxWidth`, padding included. */
export const noteType = { size: 16, lineHeight: 22, padding: 6, maxWidth: 320 } as const;

/** The width of a run of text at `noteType.size`, in world units. */
export type Measure = (text: string) => number;

/**
 * The lines a note's text is drawn in: each line of the text, wrapped at spaces to fit `width`,
 * and a word too long for a line broken between characters.
 */
export function wrapNote(text: string, measure: Measure, width: number): Array<string> {
  const lines: Array<string> = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/(?<= )/)) {
      if (measure(line + word.trimEnd()) <= width) {
        line += word;
        continue;
      }
      if (line !== "") lines.push(line.trimEnd());
      line = "";
      for (const character of word) {
        if (line !== "" && measure(line + character) > width) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** The box a note's text needs at scale 1: its widest line and its lines, with the padding around them. */
export function noteBox(text: string, measure: Measure): Size {
  const { lineHeight, padding, maxWidth } = noteType;
  const lines = wrapNote(text, measure, maxWidth - 2 * padding);
  return {
    width: Math.max(1, ...lines.map(measure)) + 2 * padding,
    height: lines.length * lineHeight + 2 * padding,
  };
}

/** The most texture pixels per world unit a note is drawn with, and the longest edge its texture gets. */
export const noteDensity = 4;
export const noteTextureEdge = 2048;

/** The texture size for a note's box: `noteDensity` pixels per unit, less when that would pass `noteTextureEdge`. */
export function noteTextureSize(box: Size): Size & { readonly density: number } {
  const density = Math.min(noteDensity, noteTextureEdge / Math.max(box.width, box.height));
  return {
    width: Math.max(1, Math.round(box.width * density)),
    height: Math.max(1, Math.round(box.height * density)),
    density,
  };
}

type Placed = Point & Size & { readonly scale: number; readonly rotation: number };

/** The world point of a note's top-left corner, turned with it. `width` and `height` are its box at scale 1. */
export function topLeftOf({ x, y, width, height, scale, rotation }: Placed): Point {
  const dx = (-width / 2) * scale;
  const dy = (-height / 2) * scale;
  return {
    x: x + dx * Math.cos(rotation) - dy * Math.sin(rotation),
    y: y + dx * Math.sin(rotation) + dy * Math.cos(rotation),
  };
}

/** The center of a box of `size` whose top-left corner is at `corner`, at the note's scale and rotation. */
export function centerFrom(
  corner: Point,
  size: Size,
  { scale, rotation }: { readonly scale: number; readonly rotation: number },
): Point {
  const dx = (size.width / 2) * scale;
  const dy = (size.height / 2) * scale;
  return {
    x: corner.x + dx * Math.cos(rotation) - dy * Math.sin(rotation),
    y: corner.y + dx * Math.sin(rotation) + dy * Math.cos(rotation),
  };
}
