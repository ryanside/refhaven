import {
  Alert02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  File01Icon,
  ImageAdd02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import type { Id } from "@refhaven/backend/id";
import { Button } from "@refhaven/ui/components/button";
import { Icon } from "@refhaven/ui/components/icon";
import { Spinner } from "@refhaven/ui/components/spinner";
import { cn } from "@refhaven/ui/lib/utils";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { type SaveOutcome, useSaveImage } from "@/library/use-save-image";

/** A point in the page's client coordinates. */
type ClientPoint = { readonly x: number; readonly y: number };

/**
 * Called when files arrive, with the drop point, or null for a paste or a pick. It returns what
 * places each image of those files that is saved, in order.
 */
export type PlaceAt = (at: ClientPoint | null) => (refId: Id<"refs">) => Promise<void>;

/** Where saved images go: the library, or a collection too. */
export type SaveTarget = {
  readonly collectionId?: Id<"collections"> | undefined;
  /** Named on the drop veil. */
  readonly name: string;
};

const PickContext = createContext<() => void>(() => {});

/** Opens the file picker of the page's save scope. */
export const usePickImages = () => useContext(PickContext);

/**
 * The page's "Add images" button. It opens the file picker. With `fold`, a narrow window shows only
 * its +.
 */
export function AddImagesButton({
  className,
  fold = false,
}: {
  className?: string;
  fold?: boolean;
}) {
  const pick = usePickImages();
  return (
    <Button
      size="lg"
      className={cn(fold && "max-[719px]:w-11 max-[719px]:px-0", className)}
      onClick={pick}
    >
      <Icon icon={PlusSignIcon} size={18} />
      <span className={cn(fold && "max-[719px]:sr-only")}>Add images</span>
    </Button>
  );
}

type Started = { readonly key: number; readonly file: File };
type Finished = Started & { readonly outcome: SaveOutcome };

const reasons: Record<string, string> = {
  UnsupportedImage: "This file is not an image refhaven can read.",
  ImageTooLarge: "This image is too large to save.",
  UploadFailed: "The upload did not go through. Try again.",
  UploadNotFound: "The upload did not go through. Try again.",
  CollectionNotFound: "The collection is gone.",
  Failed: "Something went wrong. Try again.",
};

const outcomeLabel = (outcome: SaveOutcome) =>
  outcome.status === "rejected" ? "Not saved" : outcome.duplicate ? "Duplicate" : "Saved";

const outcomeDetail = (outcome: SaveOutcome) =>
  outcome.status === "rejected"
    ? (reasons[outcome.reason] ?? `Not saved (${outcome.reason}).`)
    : outcome.duplicate
      ? "Your library already had this image, so its bytes were reused."
      : null;

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

/** A tray that clears itself this long after every file of it saved. */
const clearAfterMs = 4000;

/** A drag stops sending `dragover` when it leaves the window or ends. */
const dragGoneAfterMs = 200;

/**
 * Saves picked, pasted, and dropped files into the library, and into the collection when the
 * target names one. Paste and drop work anywhere on the page while this is shown. With `placeAt`,
 * each saved image is placed too. It shows a veil while files are dragged over the page and a tray
 * with each file's outcome, and gives its children the file picker.
 */
export function SaveScope({
  target,
  placeAt,
  veil = "page",
  children,
}: {
  target: SaveTarget;
  placeAt?: PlaceAt;
  /** A canvas keeps its images in view under the veil, so a drop can be aimed. */
  veil?: "page" | "canvas";
  children: ReactNode;
}) {
  const saveImage = useSaveImage(target.collectionId);
  const input = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);
  const [pending, setPending] = useState<ReadonlyArray<Started>>([]);
  const [finished, setFinished] = useState<ReadonlyArray<Finished>>([]);
  // The finished rows before this index were cleared from the tray. They stay in the list, hidden,
  // so the list only ever grows.
  const [clearedBefore, setClearedBefore] = useState(0);
  const [dragging, setDragging] = useState(false);

  const saveAll = useCallback(
    async (files: ReadonlyArray<File>, at: ClientPoint | null) => {
      const started = files.map((file) => ({ key: nextKey.current++, file }));
      setPending((earlier) => [...earlier, ...started]);
      const place = placeAt?.(at);
      for (const row of started) {
        const outcome = await saveImage(row.file);
        setPending((earlier) => earlier.filter(({ key }) => key !== row.key));
        setFinished((earlier) => [...earlier, { ...row, outcome }]);
        if (place && outcome.status === "saved") await place(outcome.refId);
      }
    },
    [saveImage, placeAt],
  );

  useEffect(() => {
    // `dragstart` fires only for a drag that begins in this page, such as a card's own image.
    // A browser can carry that image as a file, and dropping it back must not save it again.
    let fromThisPage = false;
    let gone: ReturnType<typeof setTimeout> | undefined;
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
      if (!takes(event)) return;
      event.preventDefault();
      setDragging(true);
      clearTimeout(gone);
      gone = setTimeout(() => setDragging(false), dragGoneAfterMs);
    };
    const saveDropped = (event: DragEvent) => {
      if (!takes(event)) return;
      event.preventDefault();
      clearTimeout(gone);
      setDragging(false);
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
      clearTimeout(gone);
      document.removeEventListener("dragstart", startOwnDrag);
      document.removeEventListener("dragend", endOwnDrag);
      document.removeEventListener("dragover", allowDrop);
      document.removeEventListener("drop", saveDropped);
      document.removeEventListener("paste", savePasted);
    };
  }, [saveAll]);

  // A tray whose every file saved clears itself. One with a refused file waits to be closed.
  const shown = finished.slice(clearedBefore);
  const allSaved =
    pending.length === 0 &&
    shown.length > 0 &&
    shown.every(({ outcome }) => outcome.status === "saved");
  useEffect(() => {
    if (!allSaved) return;
    const timer = setTimeout(() => setClearedBefore(finished.length), clearAfterMs);
    return () => clearTimeout(timer);
  }, [allSaved, finished.length]);

  const pick = useCallback(() => input.current?.click(), []);

  return (
    <PickContext value={pick}>
      {children}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        aria-label="Add images"
        tabIndex={-1}
        className="sr-only"
        onChange={async (event) => {
          const field = event.currentTarget;
          const files = Array.from(field.files ?? []);
          field.value = "";
          await saveAll(files, null);
        }}
      />
      <DropVeil shown={dragging} name={target.name} kind={veil} />
      <SaveTray
        finished={finished}
        clearedBefore={clearedBefore}
        pending={pending}
        close={() => setClearedBefore(finished.length)}
      />
    </PickContext>
  );
}

function DropVeil({
  shown,
  name,
  kind,
}: {
  shown: boolean;
  name: string;
  kind: "page" | "canvas";
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-0 z-40 transition-opacity duration-150 ease-out",
        kind === "page" && "bg-scrim backdrop-blur-[2px]",
        shown ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="absolute inset-3 rounded-[28px] border-2 border-dashed border-ink-3" />
      <div
        className={cn(
          "absolute left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-surface py-3 pr-5 pl-4 text-[15px] font-[560] tracking-[-0.012em] shadow-float-lg transition-[translate,scale] duration-200 ease-out",
          kind === "page" ? "top-1/2 -translate-y-1/2" : "top-20",
          shown ? "scale-100" : "scale-[0.97]",
        )}
      >
        <Icon icon={ImageAdd02Icon} size={20} className="text-ink-2" />
        Drop to save to {name}
      </div>
    </div>
  );
}

/** A file's picture while it saves, from the file itself. */
function useFilePreview(file: File) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file]);
  return url;
}

function Preview({ file }: { file: File }) {
  const url = useFilePreview(file);
  return (
    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md bg-sunken shadow-print-ring">
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <Icon icon={File01Icon} size={16} className="text-ink-3" />
      )}
    </span>
  );
}

/**
 * Each file's outcome, one row per file, at the bottom right. The rows of files still saving sit
 * under the finished ones, apart from the status list, so the list holds outcomes only. The tray
 * shows while any row does.
 */
function SaveTray({
  finished,
  clearedBefore,
  pending,
  close,
}: {
  finished: ReadonlyArray<Finished>;
  clearedBefore: number;
  pending: ReadonlyArray<Started>;
  close: () => void;
}) {
  const shown = finished.slice(clearedBefore);
  const refused = shown.filter(({ outcome }) => outcome.status === "rejected").length;
  const saved = shown.length - refused;
  const title =
    pending.length > 0
      ? `Saving ${shown.length + 1} of ${shown.length + pending.length}`
      : refused === 0
        ? `${saved} ${saved === 1 ? "image" : "images"} saved`
        : saved === 0
          ? `${refused} not saved`
          : `${saved} saved, ${refused} not saved`;

  return (
    <section
      data-testid="save-tray"
      aria-label="Saving images"
      className="fixed right-(--gutter) bottom-5 z-40 hidden w-[min(360px,calc(100vw-32px))] flex-col overflow-hidden rounded-[20px] bg-surface shadow-float-lg has-[li:not([hidden])]:flex"
    >
      <header className="flex h-12 shrink-0 items-center gap-2.5 pr-2 pl-4">
        {pending.length > 0 ? <Spinner className="text-ink-2" /> : null}
        <h2 className="flex-1 text-[14px] font-[580] tracking-[-0.012em] num">{title}</h2>
        {pending.length === 0 ? (
          <Button variant="ghost" size="icon" aria-label="Close" onClick={close}>
            <Icon icon={Cancel01Icon} size={16} />
          </Button>
        ) : null}
      </header>
      <div className="max-h-[min(340px,calc(100vh-160px))] overflow-y-auto overscroll-contain px-2 pb-2">
        <ul role="status" className="flex flex-col">
          {finished.map(({ key, file, outcome }, index) => {
            const detail = outcomeDetail(outcome);
            return (
              <li
                key={key}
                data-outcome={outcome.status}
                hidden={index < clearedBefore}
                className="flex items-start gap-3 rounded-xl px-2 py-2"
              >
                <Preview file={file} />
                <div className="min-w-0 flex-1 pt-px">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-[520]">
                      {file.name}
                    </span>
                    <span className="sr-only">: </span>
                    <OutcomeBadge outcome={outcome} />
                  </div>
                  {detail ? (
                    <p className="mt-0.5 text-[12px] leading-4 text-ink-2">
                      <span className="sr-only"> </span>
                      {detail}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <ul aria-hidden className="flex flex-col">
          {pending.map(({ key, file }) => (
            <li key={key} className="flex items-center gap-3 rounded-xl px-2 py-2">
              <Preview file={file} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-[520] text-ink-2">
                {file.name}
              </span>
              <Spinner className="size-3.5 text-ink-3" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function OutcomeBadge({ outcome }: { outcome: SaveOutcome }) {
  const tone =
    outcome.status === "rejected" ? "text-bad" : outcome.duplicate ? "text-warn" : "text-ok";
  return (
    <span className={cn("flex shrink-0 items-center gap-1 text-[12px] font-[560]", tone)}>
      <Icon icon={outcome.status === "rejected" ? Alert02Icon : CheckmarkCircle02Icon} size={14} />
      {outcomeLabel(outcome)}
    </span>
  );
}
