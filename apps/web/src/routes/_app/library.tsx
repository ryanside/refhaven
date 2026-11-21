import { QueryResult, useMutation, usePaginatedQuery, useQuery } from "@confect/react";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { Button } from "@refhaven/ui/components/button";
import { NativeSelect, NativeSelectOption } from "@refhaven/ui/components/native-select";
import { createFileRoute } from "@tanstack/react-router";
import { FilteredGallery, GalleryFilters, isFiltered } from "@/library/filters";
import { type CardAction, Gallery, galleryPage } from "@/library/gallery";
import { AddImagesButton, SaveScope } from "@/library/save-images";
import { Shelf } from "@/library/shelf";
import { TopBar } from "@/shell/top-bar";
import { validateGallerySearch } from "@/view";

export const Route = createFileRoute("/_app/library")({
  validateSearch: validateGallerySearch,
  component: Library,
});

function Library() {
  return (
    <SaveScope target={{ name: "Library" }}>
      <TopBar action={<AddImagesButton />} />
      <LibraryGallery />
    </SaveScope>
  );
}

function LibraryGallery() {
  // The router keeps search keys it was not asked about, such as an old `view`. Only the filters go on.
  const { q, tag } = Route.useSearch();
  const filters = { ...(q === undefined ? {} : { q }), ...(tag === undefined ? {} : { tag }) };
  const collections = useQuery(refs.public.collections.list, {});
  const addRefs = useMutation(refs.public.collections.addRefs);
  const remove = useMutation(refs.public.library.remove);
  const owned = QueryResult.isSuccess(collections) ? collections.value : [];
  const action: CardAction = (refId) => (
    <>
      {owned.length === 0 ? null : (
        <NativeSelect
          aria-label="Add to collection"
          value=""
          onChange={(event) =>
            void addRefs({
              collectionId: event.currentTarget.value as Id<"collections">,
              refIds: [refId],
            })
          }
        >
          <NativeSelectOption value="" disabled>
            Add to collection
          </NativeSelectOption>
          {owned.map(({ collectionId, name }) => (
            <NativeSelectOption key={collectionId} value={collectionId}>
              {name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => void remove({ refIds: [refId] })}
      >
        Delete
      </Button>
    </>
  );

  return (
    <main className="flex flex-col gap-4 px-gutter pt-[84px] pb-16">
      <Shelf />
      <GalleryFilters {...filters} />
      {isFiltered(filters) ? (
        <FilteredGallery filters={filters} action={action} />
      ) : (
        <WholeLibrary action={action} />
      )}
    </main>
  );
}

function WholeLibrary({ action }: { action: CardAction }) {
  const items = usePaginatedQuery(refs.public.library.list, {}, galleryPage);
  return <Gallery items={items} action={action} />;
}
