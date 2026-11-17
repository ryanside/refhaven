import { usePaginatedQuery, useMutation } from "@confect/react";
import refs from "@refhaven/backend/refs";
import { Button } from "@refhaven/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Gallery, galleryPage } from "@/library/gallery";

export const Route = createFileRoute("/_app/trash")({
  component: Trash,
});

function Trash() {
  const items = usePaginatedQuery(refs.public.library.trash, {}, galleryPage);
  const restore = useMutation(refs.public.library.restore);

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="font-medium">Trash</h1>
      <Link to="/library" className="underline">
        Library
      </Link>
      <Gallery
        items={items}
        empty="The trash is empty."
        action={(refId) => (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => void restore({ refIds: [refId] })}
          >
            Restore
          </Button>
        )}
      />
    </main>
  );
}
