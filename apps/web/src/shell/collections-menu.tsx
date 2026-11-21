import { QueryResult, useQuery } from "@confect/react";
import { ArrowDown01Icon, PlusSignIcon, Search01Icon } from "@hugeicons/core-free-icons";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { Icon } from "@refhaven/ui/components/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@refhaven/ui/components/popover";
import { cn } from "@refhaven/ui/lib/utils";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { NewCollectionForm, newCollectionButtonClass } from "@/collections/new-collection";
import { Pile, countLabel, shortCount, useCollectionCover } from "@/collections/pile";
import { navItemClass } from "@/shell/top-bar";

type Collection = { readonly collectionId: Id<"collections">; readonly name: string };

/** Every collection, oldest first. */
export function useCollections(): ReadonlyArray<Collection> {
  const collections = useQuery(refs.public.collections.list, {});
  return QueryResult.isSuccess(collections) ? collections.value : [];
}

export function CollectionsMenu() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={navItemClass}
        data-current={pathname.startsWith("/c/") ? "" : undefined}
      >
        Collections
        <Icon icon={ArrowDown01Icon} size={14} className="-mr-0.5" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={10} className="flex w-[300px] flex-col p-1.5">
        <CollectionFinder close={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** Following a link, or making a collection, which opens it, calls `close`. */
export function CollectionFinder({
  close,
  listClassName,
}: {
  close: () => void;
  listClassName?: string;
}) {
  const collections = useCollections();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [making, setMaking] = useState(false);
  const needle = query.trim().toLowerCase();
  const shown = collections.filter(({ name }) => name.toLowerCase().includes(needle));

  return (
    <>
      {collections.length > 6 ? (
        <label className="mb-1 flex h-10 items-center gap-2 rounded-xl bg-sunken px-3 text-ink-3 focus-within:shadow-[inset_0_0_0_1.5px_var(--ink)]">
          <Icon icon={Search01Icon} size={16} />
          <input
            aria-label="Find a collection"
            placeholder="Find a collection"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
          />
        </label>
      ) : null}
      <ul
        className={cn("max-h-[min(360px,50vh)] overflow-y-auto overscroll-contain", listClassName)}
      >
        {shown.map((collection) => (
          <CollectionRow key={collection.collectionId} {...collection} close={close} />
        ))}
      </ul>
      {collections.length === 0 ? (
        <p className="px-3 py-3 text-[13px] text-ink-2">
          Gather images into collections, and arrange each on a canvas.
        </p>
      ) : shown.length === 0 ? (
        <p className="px-3 py-3 text-[13px] text-ink-2">No collection is named like that.</p>
      ) : null}
      <div className="mt-1 border-t border-line pt-1.5">
        {making ? (
          <NewCollectionForm
            autoFocus
            fieldClassName="bg-sunken"
            cancel={() => setMaking(false)}
            created={(collectionId) => {
              setMaking(false);
              close();
              void navigate({ to: "/c/$collectionId", params: { collectionId } });
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setMaking(true)}
            className={newCollectionButtonClass}
          >
            <span className="grid size-6 place-items-center rounded-[5px] border-[1.5px] border-dashed border-ink-4">
              <Icon icon={PlusSignIcon} size={12} />
            </span>
            New collection
          </button>
        )}
      </div>
    </>
  );
}

function CollectionRow({ collectionId, name, close }: Collection & { close: () => void }) {
  const cover = useCollectionCover(collectionId);
  const { pathname } = useLocation();
  const current = pathname === `/c/${collectionId}`;
  return (
    <li
      className={cn(
        "relative flex h-12 items-center gap-2.5 rounded-[11px] pr-3 pl-1 hover:bg-hover",
        current && "bg-hover",
      )}
    >
      <Pile prints={cover.cover} scale={0.42} className="-my-1" />
      <Link
        to="/c/$collectionId"
        params={{ collectionId }}
        data-collection-id={collectionId}
        onClick={close}
        className="min-w-0 flex-1 truncate text-[14px] font-[540] outline-none after:absolute after:inset-0 after:rounded-[11px] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ink"
      >
        {name}
      </Link>
      {cover.loaded ? (
        <>
          <span aria-hidden className="shrink-0 text-[13px] text-ink-3 num">
            {shortCount(cover)}
          </span>
          <span className="sr-only">{countLabel(cover)}</span>
        </>
      ) : null}
    </li>
  );
}
