import { PlusSignIcon } from "@hugeicons/core-free-icons";
import type { Id } from "@refhaven/backend/id";
import { Icon } from "@refhaven/ui/components/icon";
import { cn } from "@refhaven/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useRef } from "react";
import { NewCollectionForm } from "@/collections/new-collection";
import { FadeRow } from "@/library/fade-row";
import { Pile, countLabel, useCollectionCover } from "@/collections/pile";
import { useCollections } from "@/shell/collections-menu";

/**
 * The library's shelf: each collection as a pile of its images with its name and count, oldest
 * first, then a dashed print that makes a new one. It scrolls sideways once it is wider than the
 * page, and fades at the edge it scrolls toward.
 */
export function Shelf() {
  const collections = useCollections();
  return (
    <section aria-labelledby="shelf-heading">
      <h2
        id="shelf-heading"
        className="flex items-baseline gap-2 text-[14px] font-[580] tracking-[-0.012em]"
      >
        Collections
        <span className="font-[450] text-ink-3 num">{collections.length || null}</span>
      </h2>
      <FadeRow className="-mx-2.5 mt-1 gap-1.5 px-2.5">
        <ul className="contents">
          {collections.map(({ collectionId, name }) => (
            <ShelfItem key={collectionId} collectionId={collectionId} name={name} />
          ))}
          <li className="flex h-24 shrink-0 items-center gap-2 rounded-[20px] pr-3 pl-2">
            <NewPrint />
          </li>
        </ul>
      </FadeRow>
    </section>
  );
}

function ShelfItem({ collectionId, name }: { collectionId: Id<"collections">; name: string }) {
  const cover = useCollectionCover(collectionId);
  return (
    <li className="relative flex h-24 shrink-0 items-center gap-3.5 rounded-[20px] pr-6 pl-1 transition-colors duration-150 hover:bg-sunken has-focus-visible:bg-sunken">
      <Pile prints={cover.cover} />
      <div className="flex min-w-0 flex-col">
        <Link
          to="/c/$collectionId"
          params={{ collectionId }}
          data-collection-id={collectionId}
          className="max-w-56 truncate text-[14px] font-[580] tracking-[-0.012em] outline-none after:absolute after:inset-0 after:rounded-[20px] focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ink"
        >
          {name}
        </Link>
        <span className={cn("text-[13px] text-ink-2 num", !cover.loaded && "invisible")}>
          {countLabel(cover)}
        </span>
      </div>
    </li>
  );
}

/** A dashed print beside a field: name a collection and Create. */
function NewPrint() {
  const field = useRef<HTMLDivElement>(null);
  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={() => field.current?.querySelector("input")?.focus()}
        className="grid h-[66px] w-[50px] shrink-0 place-items-center rounded-[3px] border-[1.5px] border-dashed border-ink-4 text-ink-3 transition-colors duration-150 hover:border-ink-3 hover:text-ink-2"
      >
        <Icon icon={PlusSignIcon} size={16} />
      </button>
      <div ref={field}>
        <NewCollectionForm className="w-56" fieldClassName="-ml-1" />
      </div>
    </>
  );
}
