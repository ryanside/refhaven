/** Every keyboard shortcut of a canvas. "Mod" is Command on macOS and Control elsewhere. */
export const keymap = [
  { hotkey: "Delete", action: "remove" },
  { hotkey: "Backspace", action: "remove" },
  { hotkey: "Mod+Z", action: "undo" },
  { hotkey: "Mod+Shift+Z", action: "redo" },
  { hotkey: "Control+Y", action: "redo" },
  { hotkey: "Mod+A", action: "selectAll" },
  { hotkey: "Escape", action: "clearSelection" },
] as const;

export type Action = (typeof keymap)[number]["action"];
