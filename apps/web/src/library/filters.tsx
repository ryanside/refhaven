import { QueryResult, useQuery } from "@confect/react";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { Input } from "@refhaven/ui/components/input";
import { Label } from "@refhaven/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@refhaven/ui/components/native-select";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { type CardAction, Cards } from "@/library/gallery";
import type { Filters } from "@/view";

export const isFiltered = ({ q, tag }: Filters) => q !== undefined || tag !== undefined;

/** The Search field and the Tag select above a gallery. Both write to the page's URL. */
export function GalleryFilters(filters: Filters) {
  const { q, tag } = filters;
  const navigate = useNavigate();
  const known = useQuery(refs.public.ref.tags, {});
  const [text, setText] = useState(q ?? "");
  const [shownQ, setShownQ] = useState(q);
  // The back button and the "Clear filters" link change `q` from outside the field.
  if (q !== shownQ) {
    setShownQ(q);
    if (text.trim() !== (q ?? "")) setText(q ?? "");
  }
  // The first filter on a full gallery adds a history entry and every later change replaces it,
  // so the back button leaves the filtered view in one step.
  const setFilter = (key: keyof Filters, value: string) =>
    void navigate({
      to: ".",
      search: ({ [key]: _, ...rest }) => (value === "" ? rest : { ...rest, [key]: value }),
      replace: isFiltered(filters),
    });
  const searchFor = useDebouncedCallback((value: string) => setFilter("q", value.trim()), {
    wait: 300,
  });
  const tags = QueryResult.isSuccess(known) ? known.value : [];

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="search">Search</Label>
        <Input
          id="search"
          type="search"
          maxLength={200}
          value={text}
          onChange={(event) => {
            setText(event.currentTarget.value);
            searchFor(event.currentTarget.value);
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="tag">Tag</Label>
        <NativeSelect
          id="tag"
          value={tag ?? ""}
          onChange={(event) => setFilter("tag", event.currentTarget.value)}
        >
          <NativeSelectOption value="">All tags</NativeSelectOption>
          {(tag === undefined || tags.includes(tag) ? tags : [tag, ...tags]).map((name) => (
            <NativeSelectOption key={name} value={name}>
              {name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {isFiltered(filters) ? (
        <Link
          to="."
          search={({ view }) => (view === undefined ? {} : { view })}
          className="underline"
        >
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}

/** The images of a set that match its filters, at most 200 of them. */
export function FilteredGallery({
  filters,
  collectionId,
  action,
}: {
  filters: Filters;
  collectionId?: Id<"collections">;
  action: CardAction;
}) {
  const result = useQuery(refs.public.library.filter, {
    ...filters,
    ...(collectionId === undefined ? {} : { collectionId }),
  });

  return (
    <>
      <Cards items={QueryResult.isSuccess(result) ? result.value.items : []} action={action} />
      {QueryResult.match(result, {
        onLoading: () => <p>Loading…</p>,
        onFailure: (error) => <p role="alert">{error._tag}</p>,
        onSuccess: ({ items, more }) =>
          items.length === 0 ? (
            <p>No images match.</p>
          ) : more ? (
            <p>Showing the first {items.length} matches.</p>
          ) : null,
      })}
    </>
  );
}
