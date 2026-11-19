import { QueryResult, useMutation, usePaginatedQuery, useQuery } from "@confect/react";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { Button } from "@refhaven/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import * as Result from "effect/Result";
import { CanvasView } from "@/canvas/canvas-view";
import { NameForm } from "@/collections/name-form";
import { FilteredGallery, GalleryFilters, isFiltered } from "@/library/filters";
import { type CardAction, Gallery, galleryPage } from "@/library/gallery";
import { SaveImages } from "@/library/save-images";
import { PageHeader } from "@/page-header";
import { ViewLinks, validateCollectionSearch } from "@/view";

export const Route = createFileRoute("/_app/c/$collectionId")({
  validateSearch: validateCollectionSearch,
  component: CollectionPage,
});

function CollectionPage() {
  const collectionId = Route.useParams().collectionId as Id<"collections">;
  const collections = useQuery(refs.public.collections.list, {});

  if (!QueryResult.isSuccess(collections)) {
    return <Outside title="Collection">Loading…</Outside>;
  }
  const collection = collections.value.find((owned) => owned.collectionId === collectionId);
  if (!collection) {
    return <Outside title="Collection">Collection not found.</Outside>;
  }
  return <Collection key={collectionId} collectionId={collectionId} name={collection.name} />;
}

/** A page with no collection to show. It keeps the title bar, which is the way to the sidebar. */
function Outside({ title, children }: { title: string; children: string }) {
  return (
    <>
      <PageHeader title={title} />
      <p className="p-6">{children}</p>
    </>
  );
}

function Collection({ collectionId, name }: { collectionId: Id<"collections">; name: string }) {
  const { view = "canvas" } = Route.useSearch();
  return (
    <>
      <PageHeader title={name}>
        <ViewLinks />
      </PageHeader>
      {view === "gallery" ? (
        <CollectionGallery collectionId={collectionId} name={name} />
      ) : (
        <CanvasView collectionId={collectionId} />
      )}
    </>
  );
}

function CollectionGallery({
  collectionId,
  name,
}: {
  collectionId: Id<"collections">;
  name: string;
}) {
  const { view: _, ...filters } = Route.useSearch();
  const rename = useMutation(refs.public.collections.rename);
  const removeRefs = useMutation(refs.public.collections.removeRefs);
  const action: CardAction = (refId) => (
    <Button
      variant="outline"
      size="sm"
      className="self-start"
      onClick={() => void removeRefs({ collectionId, refIds: [refId] })}
    >
      Remove from collection
    </Button>
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      <NameForm
        label="Collection name"
        submit="Rename"
        initialName={name}
        save={async (newName) => {
          const renamed = await rename({ collectionId, name: newName });
          return Result.isFailure(renamed) ? renamed.failure._tag : null;
        }}
      />
      <SaveImages collectionId={collectionId} />
      <GalleryFilters {...filters} />
      {isFiltered(filters) ? (
        <FilteredGallery filters={filters} collectionId={collectionId} action={action} />
      ) : (
        <Members collectionId={collectionId} action={action} />
      )}
    </div>
  );
}

function Members({
  collectionId,
  action,
}: {
  collectionId: Id<"collections">;
  action: CardAction;
}) {
  const items = usePaginatedQuery(refs.public.collections.refs, { collectionId }, galleryPage);
  return <Gallery items={items} action={action} />;
}
