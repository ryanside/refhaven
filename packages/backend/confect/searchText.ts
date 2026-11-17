/** The text a Ref is found by: its name, note, source, and tag names, joined by spaces. */
export const searchTextOf = (
  ref: { readonly fileName: string; readonly note?: string; readonly sourceUrl?: string },
  tags: ReadonlyArray<string>,
) =>
  [ref.fileName, ref.note, ref.sourceUrl, ...tags].filter((part) => part !== undefined).join(" ");

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");

/** Convex's index reads at most this many words of a search and ignores the rest. */
const searchedWords = 16;

/**
 * Whether a Ref's search text holds every word of a search, by the index's own rules: each word
 * whole, and the last one by its beginning. Convex's index returns a Ref that holds any one of
 * the words, so a longer search would find more. A filter must find fewer.
 */
export const holdsEveryWord = (searchText: string, q: string) => {
  const held = wordsOf(searchText);
  const words = wordsOf(q).slice(0, searchedWords);
  return words.every((word, index) =>
    index === words.length - 1 ? held.some((one) => one.startsWith(word)) : held.includes(word),
  );
};
