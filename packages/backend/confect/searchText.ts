/** The text a Ref is found by: its name, note, source, and tag names, joined by spaces. */
export const searchTextOf = (
  ref: { readonly fileName: string; readonly note?: string; readonly sourceUrl?: string },
  tags: ReadonlyArray<string>,
) =>
  [ref.fileName, ref.note, ref.sourceUrl, ...tags].filter((part) => part !== undefined).join(" ");

/**
 * Whether a Ref's search text holds every word of a search. Convex's index returns a Ref that
 * holds any one of the words, so a longer search would find more. A filter must find fewer.
 */
export const holdsEveryWord = (searchText: string, q: string) => {
  const text = searchText.toLowerCase();
  return q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .every((word) => text.includes(word));
};
