import type { Renderer } from "@refhaven/renderer";
import {
  type Measure,
  type NoteColor,
  type NoteFields,
  noteBox,
  noteTextureSize,
  noteType,
  wrapNote,
} from "@refhaven/scene";

/** The color each note color name stands for on the light canvas. */
const lightInk: Record<NoteColor, string> = {
  black: "#1c1917",
  red: "#dc2626",
  orange: "#ea580c",
  green: "#16a34a",
  blue: "#2563eb",
  purple: "#9333ea",
};

/** Whether the page, and so the canvas behind the notes, is dark. */
export const onDark = () => document.documentElement.classList.contains("dark");

/** A note color's ink. Black would not show on the dark canvas, so there it is near white. */
export const noteInk = (color: NoteColor, dark = onDark()) =>
  dark && color === "black" ? "#fafaf9" : lightInk[color];

/** The type a note is drawn and edited in, at a size of `size` pixels. */
export const noteFont = (size: number) => `500 ${size}px ui-sans-serif, system-ui, sans-serif`;

let measuring: OffscreenCanvasRenderingContext2D | undefined;

/** The width of a run of a note's text at scale 1, in world units. */
export const measure: Measure = (text) => {
  measuring ??= new OffscreenCanvas(1, 1).getContext("2d")!;
  measuring.font = noteFont(noteType.size);
  return measuring.measureText(text).width;
};

/** The box a note's text needs at scale 1. */
export const boxFor = (text: string) => noteBox(text, measure);

/** A note's text in its color on a transparent background, wrapped to its box. */
function drawNote({ text, color, width, height }: NoteFields, dark: boolean): ImageBitmap {
  const { padding, lineHeight, size } = noteType;
  const texture = noteTextureSize({ width, height });
  const canvas = new OffscreenCanvas(texture.width, texture.height);
  const context = canvas.getContext("2d")!;
  context.scale(texture.density, texture.density);
  context.font = noteFont(size);
  context.fillStyle = noteInk(color, dark);
  context.textBaseline = "middle";
  wrapNote(text, measure, width - 2 * padding).forEach((line, index) =>
    context.fillText(line, padding, padding + (index + 0.5) * lineHeight),
  );
  return canvas.transferToImageBitmap();
}

export const noteTextureKey = (key: string) => `note/${key}`;

/**
 * Keeps one uploaded texture per note, made again when its text, color, or box changes, or the page
 * turns dark or light, and frees the texture of a note that left.
 */
export function createNoteTextures(renderer: Renderer) {
  const drawn = new Map<string, string>();
  return {
    /** Uploads the notes' textures that are missing or out of date, and evicts the rest. */
    update(notes: ReadonlyArray<NoteFields & { readonly key: string }>) {
      const keys = new Set<string>();
      const dark = onDark();
      for (const note of notes) {
        keys.add(note.key);
        const version = JSON.stringify([note.text, note.color, note.width, note.height, dark]);
        if (drawn.get(note.key) === version) continue;
        renderer.uploadTexture(noteTextureKey(note.key), drawNote(note, dark));
        drawn.set(note.key, version);
      }
      for (const key of drawn.keys()) {
        if (keys.has(key)) continue;
        renderer.evictTexture(noteTextureKey(key));
        drawn.delete(key);
      }
    },
  };
}
