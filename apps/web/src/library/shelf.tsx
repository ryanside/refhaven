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

/** Each place on the shelf: a 108 by 76 picture, then a title with one muted line under it. */
const footprint =
  "relative flex h-24 shrink-0 items-center gap-3.5 rounded-[20px] pr-6 pl-1 transition-colors duration-150 hover:bg-sunken has-focus-visible:bg-sunken";
const titleClass = "text-[14px] leading-5 font-[580] tracking-[-0.012em]";
const lineClass = "text-[13px] leading-[18px] text-ink-2 num";

/**
 * The library's shelf: each collection as a pile of its images with its name and count, oldest
 * first, then New collection in the same footprint. It scrolls sideways once it is wider than the
 * page, and fades at the edge it scrolls toward.
 */
export function Shelf() {
  const collections = useCollections();
  return (
    <section aria-labelledby="shelf-heading">
      <h2
        id="shelf-heading"
        className="flex items-baseline gap-2 text-[18px] leading-6 font-[600] tracking-[-0.02em]"
      >
        Collections
        <span className="font-[450] text-ink-3 num">{collections.length || null}</span>
      </h2>
      <FadeRow className="-mx-2.5 mt-1 gap-1.5 px-2.5">
        <ul className="contents">
          {collections.map(({ collectionId, name }) => (
            <ShelfItem key={collectionId} collectionId={collectionId} name={name} />
          ))}
          <NewShelfItem />
        </ul>
      </FadeRow>
    </section>
  );
}

function ShelfItem({ collectionId, name }: { collectionId: Id<"collections">; name: string }) {
  const cover = useCollectionCover(collectionId);
  return (
    <li className={footprint}>
      <Pile prints={cover.cover} />
      <div className="flex min-w-0 flex-col">
        <Link
          to="/c/$collectionId"
          params={{ collectionId }}
          data-collection-id={collectionId}
          className={cn(
            titleClass,
            "max-w-56 truncate outline-none after:absolute after:inset-0 after:rounded-[20px] focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ink",
          )}
        >
          {name}
        </Link>
        <span className={cn(lineClass, !cover.loaded && "invisible")}>{countLabel(cover)}</span>
      </div>
    </li>
  );
}

/**
 * A dashed print where a pile would be, and a title that is the field naming a new collection.
 * A click anywhere on it goes to the field.
 */
function NewShelfItem() {
  const item = useRef<HTMLLIElement>(null);
  return (
    <li
      ref={item}
      onClick={(event) => {
        if (!(event.target instanceof Element) || !event.target.closest("button, input")) {
          item.current?.querySelector("input")?.focus();
        }
      }}
      className={cn(
        footprint,
        "cursor-text focus-within:bg-sunken focus-within:shadow-[inset_0_0_0_1.5px_var(--ink)]",
      )}
    >
      <span aria-hidden className="grid h-[76px] w-[108px] shrink-0 place-items-center">
        <span className="grid h-[68px] w-24 place-items-center rounded-[6px] border-[1.5px] border-dashed border-ink-4 text-ink-3">
          <Icon icon={PlusSignIcon} size={16} />
        </span>
      </span>
      <NewCollectionForm
        note="Name it to start"
        className="w-52 gap-0 [&_button]:-my-[5px] [&>p]:px-0"
        fieldClassName={cn(
          titleClass,
          "h-5 rounded-none bg-transparent px-0 placeholder:font-[580] placeholder:text-ink focus:bg-transparent focus:shadow-none",
        )}
        noteClassName={lineClass}
      />
    </li>
  );
}
