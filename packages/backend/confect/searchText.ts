/** The text a Ref is found by: its name, note, source, and tag names, joined by spaces. */
export const searchTextOf = (
  ref: { readonly fileName: string; readonly note?: string; readonly sourceUrl?: string },
  tags: ReadonlyArray<string>,
) =>
  [ref.fileName, ref.note, ref.sourceUrl, ...tags].filter((part) => part !== undefined).join(" ");
