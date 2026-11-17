import { matchesKeyboardEvent } from "@tanstack/react-hotkeys";
import { expect, test } from "vitest";
import { keymap } from "./keymap";

type Press = {
  key: string;
  code: string;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
};

/** The action a key press runs on a Mac, by the same matcher the page registers the keymap with. */
const actionOf = (press: Press) => {
  const event = {
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    location: 0,
    isComposing: false,
    keyCode: 0,
    getModifierState: () => false,
    ...press,
  } as unknown as KeyboardEvent;
  return keymap.find(({ hotkey }) => matchesKeyboardEvent(event, hotkey, "mac"))?.action;
};

test.each([
  ["the n key", "addNote", { key: "n", code: "KeyN" }],
  ["Command+G", "group", { key: "g", code: "KeyG", metaKey: true }],
  ["Command+Shift+G", "ungroup", { key: "G", code: "KeyG", metaKey: true, shiftKey: true }],
  ["a US keyboard's ] key", "bringToFront", { key: "]", code: "BracketRight" }],
  ["a US keyboard's [ key", "sendToBack", { key: "[", code: "BracketLeft" }],
  [
    "a German keyboard's Option+6, which types ]",
    "bringToFront",
    { key: "]", code: "Digit6", altKey: true },
  ],
  [
    "a German keyboard's Option+5, which types [",
    "sendToBack",
    { key: "[", code: "Digit5", altKey: true },
  ],
] as const)("%s runs %s", (_name, action, press) => {
  expect(actionOf(press)).toBe(action);
});

test("a key that is in no row of the keymap runs nothing", () => {
  expect(actionOf({ key: "q", code: "KeyQ" })).toBeUndefined();
  expect(actionOf({ key: "5", code: "Digit5" })).toBeUndefined();
  expect(actionOf({ key: "g", code: "KeyG" })).toBeUndefined();
});
