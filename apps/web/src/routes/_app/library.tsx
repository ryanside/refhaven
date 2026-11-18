import { QueryResult, useMutation, usePaginatedQuery, useQuery } from "@confect/react";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { Button } from "@refhaven/ui/components/button";
import { NativeSelect, NativeSelectOption } from "@refhaven/ui/components/native-select";
import { createFileRoute } from "@tanstack/react-router";
import { CanvasView } from "@/canvas/canvas-view";
import { FilteredGallery, GalleryFilters, isFiltered } from "@/library/filters";
import { type CardAction, Gallery, galleryPage } from "@/library/gallery";
import { SaveImages } from "@/library/save-images";
import { PageHeader } from "@/page-header";
import { ViewLinks, validateGallerySearch } from "@/view";

export const Route = createFileRoute("/_app/library")({
  validateSearch: validateGallerySearch,
  component: Library,
});

function Library() {
  const { view = "gallery" } = Route.useSearch();
  return (
    <>
      <PageHeader title="Library">
        <ViewLinks />
      </PageHeader>
      {view === "canvas" ? <CanvasView /> : <LibraryGallery />}
    </>
  );
}

function LibraryGallery() {
  const { view: _, ...filters } = Route.useSearch();
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
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => void remove({ refIds: [refId] })}
      >
        Delete
      </Button>
    </>
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      <SaveImages />
      <GalleryFilters {...filters} />
      {isFiltered(filters) ? (
        <FilteredGallery filters={filters} action={action} />
      ) : (
        <WholeLibrary action={action} />
      )}
    </div>
  );
}

function WholeLibrary({ action }: { action: CardAction }) {
  const items = usePaginatedQuery(refs.public.library.list, {}, galleryPage);
  return <Gallery items={items} action={action} />;
}
