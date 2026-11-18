import { usePaginatedQuery, useMutation } from "@confect/react";
import refs from "@refhaven/backend/refs";
import { daysLeft, trashDays } from "@refhaven/backend/trash";
import { Button } from "@refhaven/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { Gallery, galleryPage } from "@/library/gallery";
import { PageHeader } from "@/page-header";

export const Route = createFileRoute("/_app/trash")({
  component: Trash,
});

function Trash() {
  const items = usePaginatedQuery(refs.public.library.trash, {}, galleryPage);
  const restore = useMutation(refs.public.library.restore);
  const deletedAt = new Map(items.results.map((item) => [item.refId, item.deletedAt]));

  return (
    <>
      <PageHeader title="Trash" />
      <div className="flex flex-col gap-4 p-6">
        <p>Images in the trash are deleted for good {trashDays} days after they were deleted.</p>
        <Gallery
          items={items}
          empty="The trash is empty."
          action={(refId) => (
            <>
              <DaysLeft deletedAt={deletedAt.get(refId)!} />
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => void restore({ refIds: [refId] })}
              >
                Restore
              </Button>
            </>
          )}
        />
      </div>
    </>
  );
}

function DaysLeft({ deletedAt }: { deletedAt: number }) {
  const days = daysLeft(deletedAt, Date.now());
  return <p>{days === 1 ? "1 day left" : `${days} days left`}</p>;
}
