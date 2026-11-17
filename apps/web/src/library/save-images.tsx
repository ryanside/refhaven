import type { Id } from "@refhaven/backend/id";
import { Input } from "@refhaven/ui/components/input";
import { Label } from "@refhaven/ui/components/label";
import { useCallback, useEffect, useState } from "react";
import { type SaveOutcome, useSaveImage } from "@/library/use-save-image";

/** A point in the page's client coordinates. */
type ClientPoint = { readonly x: number; readonly y: number };

/**
 * Called when files arrive, with the drop point, or null for a paste or a pick. It returns what
 * places each image of those files that is saved, in order.
 */
export type PlaceAt = (at: ClientPoint | null) => (refId: Id<"refs">) => Promise<void>;

const outcomeText = (outcome: SaveOutcome) =>
  outcome.status === "rejected"
    ? `not saved (${outcome.reason})`
    : outcome.duplicate
      ? "saved. Your library already had this image, so its bytes were reused."
      : "saved.";

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

/**
 * Saves picked, pasted, and dropped files into the library, and into the collection when one is
 * given. Paste and drop work anywhere on the page while this is shown. With `placeAt`, each saved
 * image is placed too.
 */
export function SaveImages({
  collectionId,
  placeAt,
}: {
  collectionId?: Id<"collections"> | undefined;
  placeAt?: PlaceAt;
}) {
  const saveImage = useSaveImage(collectionId);
  const [outcomes, setOutcomes] = useState<
    ReadonlyArray<{ fileName: string; outcome: SaveOutcome }>
  >([]);

  const saveAll = useCallback(
    async (files: ReadonlyArray<File>, at: ClientPoint | null) => {
      const place = placeAt?.(at);
      for (const file of files) {
        const outcome = await saveImage(file);
        setOutcomes((earlier) => [...earlier, { fileName: file.name, outcome }]);
        if (place && outcome.status === "saved") await place(outcome.refId);
      }
    },
    [saveImage, placeAt],
  );

  useEffect(() => {
    // `dragstart` fires only for a drag that begins in this page, such as a card's own image.
    // A browser can carry that image as a file, and dropping it back must not save it again.
    let fromThisPage = false;
    const startOwnDrag = () => {
      fromThisPage = true;
    };
    const endOwnDrag = () => {
      fromThisPage = false;
    };
    const takes = (event: DragEvent) => carriesFiles(event) && !fromThisPage;
    // A browser performs a drop only when `dragover` was cancelled. During `dragover` it hides the
    // files and shows only their type.
    const allowDrop = (event: DragEvent) => {
      if (takes(event)) event.preventDefault();
    };
    const saveDropped = (event: DragEvent) => {
      if (!takes(event)) return;
      event.preventDefault();
      void saveAll(Array.from(event.dataTransfer!.files), { x: event.clientX, y: event.clientY });
    };
    // A paste into a text field belongs to the field, even when it carries a picture of the text,
    // as a copy from a spreadsheet does. A paste with no file is text.
    const savePasted = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      const intoField =
        event.target instanceof Element &&
        event.target.closest("input, textarea, [contenteditable]") !== null;
      if (files.length === 0 || intoField) return;
      event.preventDefault();
      void saveAll(files, null);
    };
    document.addEventListener("dragstart", startOwnDrag);
    document.addEventListener("dragend", endOwnDrag);
    document.addEventListener("dragover", allowDrop);
    document.addEventListener("drop", saveDropped);
    document.addEventListener("paste", savePasted);
    return () => {
      document.removeEventListener("dragstart", startOwnDrag);
      document.removeEventListener("dragend", endOwnDrag);
      document.removeEventListener("dragover", allowDrop);
      document.removeEventListener("drop", saveDropped);
      document.removeEventListener("paste", savePasted);
    };
  }, [saveAll]);

  return (
    <>
      <div className="flex max-w-sm flex-col gap-2">
        <Label htmlFor="images">Add images</Label>
        <Input
          id="images"
          type="file"
          accept="image/*"
          multiple
          onChange={async (event) => {
            const input = event.currentTarget;
            await saveAll(Array.from(input.files ?? []), null);
            input.value = "";
          }}
        />
        <p>Or paste or drop images anywhere on this page.</p>
      </div>
      <ul role="status">
        {outcomes.map(({ fileName, outcome }, index) => (
          <li key={index} data-outcome={outcome.status}>
            {fileName}: {outcomeText(outcome)}
          </li>
        ))}
      </ul>
    </>
  );
}
