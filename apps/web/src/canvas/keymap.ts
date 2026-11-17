/** Every keyboard shortcut of a canvas. "Mod" is Command on macOS and Control elsewhere. */
export const keymap = [
  { hotkey: "Delete", action: "remove" },
  { hotkey: "Backspace", action: "remove" },
  { hotkey: "Mod+Z", action: "undo" },
  { hotkey: "Mod+Shift+Z", action: "redo" },
  { hotkey: "Control+Y", action: "redo" },
  { hotkey: "Mod+A", action: "selectAll" },
  { hotkey: "Escape", action: "clearSelection" },
  { hotkey: "N", action: "addNote" },
  { hotkey: "Mod+G", action: "group" },
  { hotkey: "Mod+Shift+G", action: "ungroup" },
  { hotkey: "]", action: "bringToFront" },
  { hotkey: "[", action: "sendToBack" },
  // Some macOS layouts, German and French among them, type a bracket with Option held.
  { hotkey: "Alt+]", action: "bringToFront" },
  { hotkey: "Alt+[", action: "sendToBack" },
] as const;

export type Action = (typeof keymap)[number]["action"];
