import { QueryResult, useMutation, usePaginatedQuery, useQuery } from "@confect/react";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { Button } from "@refhaven/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import * as Result from "effect/Result";
import { CanvasView } from "@/canvas/canvas-view";
import { NameForm } from "@/collections/name-form";
import { FilteredGallery, GalleryFilters, isFiltered } from "@/library/filters";
import { type CardAction, Gallery, SaveImages, galleryPage } from "@/library/gallery";
import { ViewLinks, validateGallerySearch } from "@/view";

export const Route = createFileRoute("/_app/c/$collectionId")({
  validateSearch: validateGallerySearch,
  component: CollectionPage,
});

function CollectionPage() {
  const collectionId = Route.useParams().collectionId as Id<"collections">;
  const collections = useQuery(refs.public.collections.list, {});

  if (!QueryResult.isSuccess(collections)) {
    return <p className="p-6">Loading…</p>;
  }
  const collection = collections.value.find((owned) => owned.collectionId === collectionId);
  if (!collection) {
    return <p className="p-6">Collection not found.</p>;
  }
  return <Collection key={collectionId} collectionId={collectionId} name={collection.name} />;
}

function Collection({ collectionId, name }: { collectionId: Id<"collections">; name: string }) {
  const { view = "gallery" } = Route.useSearch();
  return view === "canvas" ? (
    <CanvasView collectionId={collectionId}>
      <h1 className="font-medium">{name}</h1>
      <ViewLinks />
    </CanvasView>
  ) : (
    <CollectionGallery collectionId={collectionId} name={name} />
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
    <main className="flex flex-col gap-4 p-6">
      <h1 className="font-medium">{name}</h1>
      <ViewLinks />
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
    </main>
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
