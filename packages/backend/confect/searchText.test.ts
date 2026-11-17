import { expect, test } from "vitest";
import { holdsEveryWord, searchTextOf } from "./searchText";

test("the search text holds the name, note, source, and every tag", () => {
  expect(
    searchTextOf(
      { fileName: "harbor.png", note: "Rim light", sourceUrl: "https://example.com/dusk" },
      ["mood", "light and shadow"],
    ),
  ).toBe("harbor.png Rim light https://example.com/dusk mood light and shadow");
});

test("an absent note or source and no tags leave only the name", () => {
  expect(searchTextOf({ fileName: "harbor.png" }, [])).toBe("harbor.png");
});

test("a source with no note keeps its place after the name", () => {
  expect(searchTextOf({ fileName: "a.png", sourceUrl: "https://example.com" }, ["x"])).toBe(
    "a.png https://example.com x",
  );
});

const text = "harbor-dusk.png Rim light https://example.com/cartoon mood";

test.each([
  ["harbor", true],
  ["HARBOR rim", true],
  ["harb", true],
  ["rim harb", true],
  ["rim-light", true],
  ["  dusk   mood ", true],
  ["!!!", true],
  ["harb rim", false],
  ["art mood", false],
  ["arbor", false],
  ["harbor forest", false],
  ["forest", false],
])(
  "the text holds every word of the search %j, each whole and the last by its beginning: %j",
  (q, expected) => {
    expect(holdsEveryWord(text, q)).toBe(expected);
  },
);

test("words past the sixteenth are ignored, as the index ignores them", () => {
  const sixteen = Array.from({ length: 15 }, () => "mood").join(" ");
  expect(holdsEveryWord(text, `${sixteen} harbor absent`)).toBe(true);
  expect(holdsEveryWord(text, `${sixteen} absent harbor`)).toBe(false);
});
