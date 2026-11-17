import { expect, test } from "vitest";
import { searchTextOf } from "./searchText";

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
