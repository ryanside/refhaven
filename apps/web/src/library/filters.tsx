import { QueryResult, useQuery } from "@confect/react";
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { chipVariants } from "@refhaven/ui/components/chip";
import { Icon } from "@refhaven/ui/components/icon";
import { Kbd } from "@refhaven/ui/components/kbd";
import { cn } from "@refhaven/ui/lib/utils";
import { useDebouncer } from "@tanstack/react-pacer";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { FadeRow } from "@/library/fade-row";
import { Masonry, type Removal } from "@/library/gallery";
import type { Filters } from "@/view";

export const isFiltered = ({ q, tag }: Filters) => q !== undefined || tag !== undefined;

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.closest("input, textarea, select") !== null);

/**
 * Search, which writes the page's `q`. `/` focuses it from anywhere on the page, Escape empties it,
 * and so does its ×. `bar` is the glass pill of the top bar, `inline` a sunken field on the page.
 */
export function SearchField({
  filters,
  variant = "bar",
}: {
  filters: Filters;
  variant?: "bar" | "inline";
}) {
  const { q } = filters;
  const navigate = useNavigate();
  const field = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(q ?? "");
  // The first filter on a full gallery adds a history entry and every later change replaces it,
  // so the back button leaves the filtered view in one step.
  const setQuery = (value: string) =>
    void navigate({
      to: ".",
      search: ({ q: _, ...rest }) => (value === "" ? rest : { ...rest, q: value }),
      replace: isFiltered(filters),
    });
  // The search text this field last wrote to the URL. Any other `q` came from outside the field:
  // the back button, the "Clear filters" link, or a link to the page.
  const written = useRef(q);
  const search = useDebouncer(
    (value: string) => {
      written.current = value === "" ? undefined : value;
      setQuery(value);
    },
    { wait: 150 },
  );
  useEffect(() => {
    if (q === written.current) return;
    written.current = q;
    // Typing that has not reached the URL yet would otherwise put the old filter back.
    search.cancel();
    setText(q ?? "");
  }, [q, search]);
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || typing(event.target)) return;
      event.preventDefault();
      field.current?.focus();
    };
    window.addEventListener("keydown", focus);
    return () => window.removeEventListener("keydown", focus);
  }, []);
  const clear = () => {
    search.cancel();
    setText("");
    written.current = undefined;
    if (q !== undefined) setQuery("");
    field.current?.focus();
  };

  return (
    <label
      className={cn(
        "flex shrink-0 items-center gap-2.5 text-ink-3 transition-shadow duration-150",
        variant === "bar"
          ? "glass h-11 w-[min(440px,34vw)] rounded-full pr-2 pl-4 shadow-float focus-within:shadow-[var(--float),inset_0_0_0_1.5px_var(--ink)]"
          : "h-10 w-[min(320px,100%)] rounded-full bg-sunken pr-1.5 pl-3.5 focus-within:bg-surface focus-within:shadow-[inset_0_0_0_1.5px_var(--ink)]",
      )}
    >
      <Icon icon={Search01Icon} size={18} />
      <input
        ref={field}
        aria-label="Search"
        type="search"
        maxLength={200}
        placeholder="Search names, notes, sources, tags"
        value={text}
        onChange={(event) => {
          setText(event.currentTarget.value);
          search.maybeExecute(event.currentTarget.value.trim());
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || text === "") return;
          event.preventDefault();
          clear();
        }}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
      />
      {text !== "" ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={clear}
          className="grid size-7 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-hover hover:text-ink"
        >
          <Icon icon={Cancel01Icon} size={14} />
        </button>
      ) : variant === "bar" ? (
        <Kbd className="mr-1.5">/</Kbd>
      ) : null}
    </label>
  );
}

/**
 * The tags as a row of chips, All first. Choosing one writes the page's `tag`. The chosen chip is
 * filled ink, and choosing it again, or its ×, clears it.
 */
export function TagChips({ filters }: { filters: Filters }) {
  const known = useQuery(refs.public.ref.tags, {});
  const { tag } = filters;
  const tags = QueryResult.isSuccess(known) ? known.value : [];
  const shown = tag === undefined || tags.includes(tag) ? tags : [tag, ...tags];
  if (shown.length === 0) return null;
  const replace = isFiltered(filters);
  const chip = (key: string, name: string | undefined, label: ReactNode, current: boolean) => (
    <Link
      key={key}
      to="."
      search={({ tag: _, ...rest }) => (name === undefined ? rest : { ...rest, tag: name })}
      replace={replace}
      // The router marks a link current when its search is a part of the page's. A chip is
      // current only when it is the chosen tag.
      activeOptions={{ exact: true }}
      aria-current={current ? "page" : undefined}
      className={cn(
        chipVariants({ tone: current ? "active" : "quiet" }),
        current && name !== undefined ? "pr-1.5 pl-3" : "px-3",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Tags" className="min-w-0">
      <FadeRow className="gap-1.5">
        {chip("", undefined, "All", tag === undefined)}
        {shown.map((name) =>
          name === tag
            ? chip(
                name,
                undefined,
                <>
                  {name}
                  <Icon icon={Cancel01Icon} size={12} className="opacity-70" />
                </>,
                true,
              )
            : chip(name, name, name, false),
        )}
      </FadeRow>
    </nav>
  );
}

/** "Clear filters", which takes `q` and `tag` off the page's URL and keeps its view. */
export function ClearFilters() {
  return (
    <Link
      to="."
      search={({ view }) => (view === undefined ? {} : { view })}
      className="text-[13px] font-[520] text-ink-2 underline decoration-ink-4 underline-offset-[3px] hover:text-ink hover:decoration-ink-3"
    >
      Clear filters
    </Link>
  );
}

/** The images of a set that match its filters, at most 200 of them. */
export function useFiltered(filters: Filters, collectionId?: Id<"collections">) {
  return useQuery(refs.public.library.filter, {
    ...filters,
    ...(collectionId === undefined ? {} : { collectionId }),
  });
}

export function FilteredGallery({
  result,
  removal,
}: {
  result: ReturnType<typeof useFiltered>;
  removal: Removal;
}) {
  return QueryResult.match(result, {
    onLoading: () => null,
    onFailure: (error) => (
      <p role="alert" className="mt-6 text-[14px] text-bad">
        The search could not run ({error._tag}).
      </p>
    ),
    onSuccess: ({ items, more }) =>
      items.length === 0 ? (
        <div className="grid justify-items-center py-24 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-sunken text-ink-3">
            <Icon icon={Search01Icon} size={20} />
          </span>
          <p className="mt-4 text-[17px] leading-6 font-[600] tracking-[-0.016em]">
            No images match.
          </p>
          <p className="mt-1 text-[14px] text-ink-2">
            Try fewer words, or another tag. Search reads names, notes, sources, and tags.
          </p>
        </div>
      ) : (
        <>
          {more ? (
            <p className="mb-3 text-[13px] text-ink-2">Showing the first {items.length} matches.</p>
          ) : null}
          <Masonry items={items} removal={removal} />
        </>
      ),
  });
}

/** How many images a filtered set shows: "2 matches", or "200+ matches". */
export const matchCount = (result: ReturnType<typeof useFiltered>) =>
  QueryResult.isSuccess(result)
    ? `${result.value.items.length}${result.value.more ? "+" : ""} ${result.value.items.length === 1 && !result.value.more ? "match" : "matches"}`
    : null;
