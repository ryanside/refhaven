import { QueryResult, useMutation, usePaginatedQuery, useQuery } from "@confect/react";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { Button } from "@refhaven/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import * as Result from "effect/Result";
import { CanvasView } from "@/canvas/canvas-view";
import { NameForm } from "@/collections/name-form";
import { Gallery, SaveImages, galleryPage } from "@/library/gallery";
import { ViewLinks, validateView } from "@/view";

export const Route = createFileRoute("/_app/c/$collectionId")({
  validateSearch: validateView,
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
  const items = usePaginatedQuery(refs.public.collections.refs, { collectionId }, galleryPage);
  const rename = useMutation(refs.public.collections.rename);
  const removeRefs = useMutation(refs.public.collections.removeRefs);

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
      <Gallery
        items={items}
        action={(refId) => (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => void removeRefs({ collectionId, refIds: [refId] })}
          >
            Remove from collection
          </Button>
        )}
      />
    </main>
  );
}
