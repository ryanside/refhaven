/** An item as the group rule reads it: its key, and the key of its group when it has one. */
type Member = { readonly key: string; readonly parent?: string | null };

/**
 * The selection rule of groups: the keys of the items that `keys` names, and of every other item in
 * a group that one of them is in. A key that names no item of `items` is left out.
 */
export function grouped(items: ReadonlyArray<Member>, keys: Iterable<string>): Set<string> {
  const named = new Set(keys);
  const groups = new Set(
    items.flatMap((item) => (named.has(item.key) && item.parent ? [item.parent] : [])),
  );
  return new Set(
    items.flatMap((item) =>
      named.has(item.key) || (item.parent && groups.has(item.parent)) ? [item.key] : [],
    ),
  );
}
