import { PaginatedQueryResult, useMutation, usePaginatedQuery } from "@confect/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { createFileRoute } from "@tanstack/react-router";
import { EmptyDropZone, PasteKeys } from "@/library/empty";
import {
  ClearFilters,
  FilteredGallery,
  SearchField,
  TagChips,
  isFiltered,
  matchCount,
  useFiltered,
} from "@/library/filters";
import { Gallery, type Removal } from "@/library/gallery";
import { galleryPage } from "@/library/page";
import { AddImagesButton, SaveScope } from "@/library/save-images";
import { Shelf } from "@/library/shelf";
import { useNarrow } from "@/shell/narrow";
import { toast } from "@/shell/toast";
import { TopBar } from "@/shell/top-bar";
import { type Filters, validateGallerySearch } from "@/view";

export const Route = createFileRoute("/_app/library")({
  validateSearch: validateGallerySearch,
  component: Library,
});

/** Moves an image to the trash, and offers to bring it back. */
export function useMoveToTrash(): Removal {
  const remove = useMutation(refs.public.library.remove);
  const restore = useMutation(refs.public.library.restore);
  return {
    label: "Move to trash",
    icon: Delete02Icon,
    run: (refId: Id<"refs">) => {
      void remove({ refIds: [refId] });
      toast("Moved to trash", { label: "Restore", run: () => void restore({ refIds: [refId] }) });
    },
  };
}

function Library() {
  // The router keeps search keys it was not asked about, such as an old `view`. Only the filters go on.
  const { q, tag } = Route.useSearch();
  const filters: Filters = {
    ...(q === undefined ? {} : { q }),
    ...(tag === undefined ? {} : { tag }),
  };
  const all = usePaginatedQuery(refs.public.library.list, {}, galleryPage);
  const empty =
    !isFiltered(filters) && PaginatedQueryResult.isExhausted(all) && all.results.length === 0;
  const narrow = useNarrow();
  const removal = useMoveToTrash();
  const search = <SearchField filters={filters} variant={narrow ? "inline" : "bar"} />;

  return (
    <SaveScope target={{ name: "Library" }}>
      <TopBar center={narrow ? null : search} action={empty ? null : <AddImagesButton fold />} />
      {empty ? (
        <EmptyDropZone title="Nothing saved yet.">
          Drop images anywhere on this page, paste them with <PasteKeys />, or pick files.
        </EmptyDropZone>
      ) : (
        <main className="px-gutter pt-[84px] pb-28">
          {narrow ? <div className="mb-6">{search}</div> : null}
          <Shelf />
          <section aria-labelledby="images-heading" className="mt-6">
            <ImagesHeading
              filters={filters}
              count={
                PaginatedQueryResult.isLoadingFirstPage(all)
                  ? null
                  : `${all.results.length}${PaginatedQueryResult.isCanLoadMore(all) || PaginatedQueryResult.isLoadingMore(all) ? "+" : ""}`
              }
            />
            <div className="mt-2.5 mb-4">
              <TagChips filters={filters} />
            </div>
            {isFiltered(filters) ? (
              <Filtered filters={filters} removal={removal} />
            ) : (
              <Gallery items={all} removal={removal} />
            )}
          </section>
        </main>
      )}
    </SaveScope>
  );
}

function Filtered({ filters, removal }: { filters: Filters; removal: Removal }) {
  return <FilteredGallery result={useFiltered(filters)} removal={removal} />;
}

function ImagesHeading({ filters, count }: { filters: Filters; count: string | null }) {
  return (
    <div className="flex min-h-7 items-center gap-3">
      <h2
        id="images-heading"
        className="flex items-baseline gap-2 text-[18px] leading-6 font-[600] tracking-[-0.02em]"
      >
        All images
        {isFiltered(filters) ? null : <span className="font-[450] text-ink-3 num">{count}</span>}
      </h2>
      {isFiltered(filters) ? <FilteredStatus filters={filters} /> : null}
    </div>
  );
}

function FilteredStatus({ filters }: { filters: Filters }) {
  const count = matchCount(useFiltered(filters));
  return (
    <>
      {count ? <span className="text-[14px] text-ink-2 num">{count}</span> : null}
      <ClearFilters />
    </>
  );
}
