import { QueryResult, useMutation, useQuery } from "@confect/react";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import type { Renderer } from "@refhaven/renderer";
import { Button } from "@refhaven/ui/components/button";
import { NativeSelect, NativeSelectOption } from "@refhaven/ui/components/native-select";
import { createPixiRenderer } from "@refhaven/renderer/pixi";
import {
  type Camera,
  type CanvasItem,
  type Drop,
  type Entry,
  type Handle,
  type History,
  type ImageRole,
  type ItemOp,
  type NoteAdd,
  type NoteColor,
  type Point,
  type Rect,
  type SceneItem,
  type SceneStore,
  addEntry,
  callsOf,
  centerFrom,
  createHistory,
  createSceneStore,
  handles,
  imageRole,
  itemsInView,
  noteColors,
  noteEntry,
  noteType,
  patchEntry,
  placedEdge,
  placementGap,
  removalEntry,
  screenToWorld,
  topLeftOf,
  topmostAt,
  worldToScreen,
  zAbove,
} from "@refhaven/scene";
import { useHotkeys } from "@tanstack/react-hotkeys";
import * as Result from "effect/Result";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { type PlaceAt, SaveImages } from "@/library/save-images";
import { type Action, keymap } from "./keymap";
import { boxFor, createNoteTextures, noteFont, noteInk, noteTextureKey } from "./notes";
import { type Need, type Sign, createTextureLoader, textureKey } from "./textures";

/** A change list longer than this is replaced by a new snapshot. */
const snapshotAfterChanges = 200;

/** Textures load for items this many screen pixels outside the viewport too. */
const loadMargin = 256;

type Base = { canvasId: Id<"canvases">; rev: number };

const toApplyOp = (op: ItemOp) => (op.op === "add" ? { ...op, refId: op.refId as Id<"refs"> } : op);

/**
 * Resolves when the store has applied the server's `rev`. The wait is bounded, so a change list
 * that never arrives cannot hold up the edits that follow.
 */
const reached = (store: SceneStore, rev: number) =>
  new Promise<void>((resolve) => {
    if (store.rev() >= rev) return resolve();
    const done = () => {
      clearTimeout(timer);
      stop();
      resolve();
    };
    const stop = store.subscribe(() => {
      if (store.rev() >= rev) done();
    });
    const timer = setTimeout(done, 5000);
  });

/** Resolves when no gesture is under way. */
/**
 * A note open in the editor: the corner its text starts from, which stays put as the text grows,
 * and what it looked like before, or null for a note that does not exist yet.
 */
type Draft = {
  readonly key: string;
  readonly corner: Point;
  readonly scale: number;
  readonly rotation: number;
  readonly color: NoteColor;
  readonly z: string;
  readonly before: { readonly text: string } | null;
};

const idle = (store: SceneStore) =>
  new Promise<void>((resolve) => {
    if (store.gesture().kind === "idle") return resolve();
    const stop = store.subscribe(() => {
      if (store.gesture().kind !== "idle") return;
      stop();
      resolve();
    });
  });

/** The canvas of a set: the collection's, or the whole library's when `collectionId` is absent. */
export function CanvasView({
  collectionId,
  children,
}: {
  collectionId?: Id<"collections">;
  children: ReactNode;
}) {
  const [store] = useState(createSceneStore);
  const [history] = useState(createHistory);
  const host = useRef<HTMLDivElement>(null);
  const outlines = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<string>();

  const open = useMutation(refs.public.canvas.open);
  const apply = useMutation(refs.public.canvas.apply);
  const urls = useMutation(refs.public.library.urls);
  const [base, setBase] = useState<Base>();
  const [offCanvas, setOffCanvas] = useState(0);
  const snapshotting = useRef(false);

  const takeSnapshot = useCallback(
    async (placeRemoved = false) => {
      if (snapshotting.current) return;
      snapshotting.current = true;
      try {
        const opened = await open(
          collectionId === undefined ? { placeRemoved } : { collectionId, placeRemoved },
        );
        if (Result.isFailure(opened)) {
          setProblem(opened.failure._tag);
          return;
        }
        if (store.loadSnapshot(opened.success)) {
          setBase({ canvasId: opened.success.canvasId, rev: opened.success.rev });
          setOffCanvas(opened.success.removed);
          // Putting images back is an edit like a drop, so it can be undone and it empties redo.
          if (placeRemoved && opened.success.placed > 0) {
            history.record(
              addEntry(
                opened.success.items
                  .slice(-opened.success.placed)
                  .flatMap((item) => (item.kind === "image" ? [item] : [])),
              ),
            );
          }
        }
      } finally {
        snapshotting.current = false;
      }
    },
    [collectionId, history, open, store],
  );

  useEffect(() => {
    void takeSnapshot();
  }, [takeSnapshot]);

  const changes = useQuery(refs.public.canvas.changes, base ?? "skip");
  useEffect(() => {
    if (!QueryResult.isSuccess(changes)) return;
    store.applyChanges(changes.value);
    if (changes.value.items.length > snapshotAfterChanges) void takeSnapshot();
  }, [changes, store, takeSnapshot]);

  // An upload can outlast the first snapshot, so a call reads the canvas when it runs.
  const latestBase = useRef(base);
  useEffect(() => {
    latestBase.current = base;
  }, [base]);

  /**
   * Saves ops and settles the hold that shows their positions. An edit of more ops than one call
   * takes is sent as several calls, one after the other, and stops at the first that fails.
   */
  const send = useCallback(
    async (ops: ReadonlyArray<ItemOp>, save: number) => {
      const canvasId = latestBase.current?.canvasId;
      let rev: number | null = null;
      for (const call of canvasId ? callsOf(ops) : []) {
        const result = await apply({ canvasId: canvasId!, ops: call.map(toApplyOp) }).catch(
          () => null,
        );
        rev = result && Result.isSuccess(result) ? result.success : null;
        if (rev === null) break;
      }
      if (rev === null) {
        store.reject(save);
        return null;
      }
      store.acknowledge(save, rev);
      return rev;
    },
    [apply, store],
  );

  // Every edit and every undo runs after the one before it has reached this page through
  // `canvas.changes`. Removals and adds show only then, so an undo pressed right after one, or
  // twice in a row, would otherwise be judged against a canvas that has not changed yet.
  const queue = useRef(Promise.resolve());
  /** Runs `save` in turn. It resolves to the rev it wrote, or null when it wrote nothing. */
  const inOrder = useCallback(
    (save: () => Promise<number | null>) => {
      const turn = queue.current.then(async () => {
        const rev = await save();
        if (rev !== null) await reached(store, rev);
      });
      // A turn that fails must not stop the turns after it.
      queue.current = turn.catch(() => undefined);
      return turn;
    },
    [store],
  );

  /** Records an edit for undo and saves it. An edit that is not saved leaves the stack. */
  const edit = useCallback(
    (entry: Entry, save: number, failure: string) => {
      history.record(entry);
      return inOrder(async () => {
        const rev = await send(entry.redo, save);
        if (rev === null) {
          history.drop(entry);
          setProblem(failure);
        }
        return rev;
      });
    },
    [history, inOrder, send],
  );

  // A gesture holds the places its items had when it began, and undoing under it would leave
  // those places stale. So a key pressed during a drag does nothing. The entry leaves its stack
  // when the key is pressed, like an edit joins it when it is made, so the two stay in the order
  // they happened even while their saves wait their turn.
  const step = useCallback(
    (direction: "undo" | "redo") => {
      if (store.gesture().kind !== "idle") return;
      const entry = direction === "undo" ? history.undo() : history.redo();
      if (!entry) return;
      void inOrder(async () => {
        // A drag that began while this waited its turn ends first.
        await idle(store);
        const ops = entry[direction];
        const rev = store.applies(ops) ? await send(ops, store.hold(ops)) : null;
        if (rev === null) {
          history.drop(entry);
          setProblem(`That change could not be ${direction === "undo" ? "undone" : "redone"}.`);
        }
        return rev;
      });
    },
    [history, inOrder, send, store],
  );

  const removeSelection = useCallback(() => {
    if (store.gesture().kind !== "idle") return;
    const selection = store.selection();
    const chosen = store.items().filter((item) => selection.has(item.key));
    if (chosen.length === 0) return;
    store.clearSelection();
    const entry = removalEntry(chosen);
    void edit(entry, store.hold(entry.redo), "An image could not be removed.");
  }, [edit, store]);

  const restack = useCallback(
    (to: "front" | "back") => {
      if (store.gesture().kind !== "idle") return;
      const entry = store.restack(to);
      if (entry) void edit(entry, store.hold(entry.redo), "The order could not be saved.");
    },
    [edit, store],
  );

  const [draft, setDraft] = useState<Draft | null>(null);
  const [noteColor, setNoteColor] = useState<NoteColor>("black");

  const openEditor = useCallback(
    (next: Draft) => {
      setDraft(next);
      store.setEditing(next.key);
    },
    [store],
  );

  // A new note starts at the center of the view, at a scale that shows its text at its type size.
  const addNote = useCallback(() => {
    if (store.gesture().kind !== "idle") return;
    const camera = store.camera();
    const viewport = store.viewport();
    const scale = 1 / camera.zoom;
    const box = boxFor("Note");
    const center = screenToWorld(camera, { x: viewport.width / 2, y: viewport.height / 2 });
    openEditor({
      key: crypto.randomUUID(),
      corner: { x: center.x - (box.width / 2) * scale, y: center.y - (box.height / 2) * scale },
      scale,
      rotation: 0,
      color: noteColor,
      z: zAbove(
        store.items().map((item) => item.z),
        1,
      )[0]!,
      before: null,
    });
  }, [noteColor, openEditor, store]);

  const onEditNote = useRef<(key: string) => void>(() => {});
  useEffect(() => {
    onEditNote.current = (key) => {
      const note = store.items().find((item) => item.key === key);
      if (note?.kind !== "note") return;
      openEditor({
        key,
        corner: topLeftOf({ ...note, ...note.base }),
        scale: note.scale,
        rotation: note.rotation,
        color: note.color,
        z: note.z,
        before: { text: note.text },
      });
    };
  }, [openEditor, store]);

  /** Saves the editor's text: a new note, a patch of the text and its box, or a removal when empty. */
  const commitNote = useCallback(
    (text: string | null) => {
      if (!draft) return;
      setDraft(null);
      store.setEditing(null);
      if (text === null) return;
      const empty = text.trim() === "";
      if (!draft.before) {
        if (empty) return;
        const box = boxFor(text);
        const add: NoteAdd = {
          op: "addNote",
          key: draft.key,
          ...centerFrom(draft.corner, box, draft),
          scale: draft.scale,
          rotation: draft.rotation,
          z: draft.z,
          text,
          color: draft.color,
          ...box,
        };
        const entry = noteEntry(add);
        void edit(entry, store.hold(entry.redo), "The note could not be saved.");
        return;
      }
      const note = store.items().find((item) => item.key === draft.key);
      if (note?.kind !== "note" || text === note.text) return;
      if (empty) {
        const entry = removalEntry([note]);
        void edit(entry, store.hold(entry.redo), "The note could not be removed.");
        return;
      }
      const box = boxFor(text);
      const center = centerFrom(topLeftOf({ ...note, ...note.base }), box, note);
      const moved = center.x !== note.x || center.y !== note.y;
      const entry = patchEntry(
        [
          {
            key: note.key,
            text: note.text,
            ...note.base,
            ...(moved ? { x: note.x, y: note.y } : {}),
          },
        ],
        [{ key: note.key, text, ...box, ...(moved ? center : {}) }],
      );
      void edit(entry, store.hold(entry.redo), "The note could not be saved.");
    },
    [draft, edit, store],
  );

  const recolor = useCallback(
    (color: NoteColor) => {
      setNoteColor(color);
      if (store.gesture().kind !== "idle") return;
      const selection = store.selection();
      const notes = store
        .items()
        .flatMap((item) =>
          item.kind === "note" && selection.has(item.key) && item.color !== color ? [item] : [],
        );
      if (notes.length === 0) return;
      const entry = patchEntry(
        notes.map(({ key, color }) => ({ key, color })),
        notes.map(({ key }) => ({ key, color })),
      );
      void edit(entry, store.hold(entry.redo), "The color could not be saved.");
    },
    [edit, store],
  );

  const actions: Record<Action, () => void> = {
    addNote,
    remove: removeSelection,
    bringToFront: () => restack("front"),
    sendToBack: () => restack("back"),
    undo: () => step("undo"),
    redo: () => step("redo"),
    selectAll: store.selectAll,
    clearSelection: store.clearSelection,
  };
  useHotkeys(
    keymap.map(({ hotkey, action }) => ({ hotkey, callback: actions[action] })),
    { ignoreInputs: true },
  );

  const onDrop = useRef((drop: Drop) => store.reject(drop.save));
  useEffect(() => {
    onDrop.current = (drop) => void edit(drop.entry, drop.save, "A change could not be saved.");
  }, [edit]);
  // The images of one drop or paste go in a row from its point, a placed image's longer edge plus
  // the gap apart, so they never overlap.
  const placeAt = useCallback<PlaceAt>(
    (at) => {
      const box = host.current!.getBoundingClientRect();
      const toWorld = () =>
        screenToWorld(
          store.camera(),
          at ? { x: at.x - box.left, y: at.y - box.top } : { x: box.width / 2, y: box.height / 2 },
        );
      // The first snapshot fits the camera to the items. A point read before that would end up
      // somewhere else on screen, so a drop that comes earlier is read when its first image is placed.
      let start = latestBase.current ? toWorld() : null;
      let placed = 0;
      return async (refId) => {
        start ??= toWorld();
        const x = start.x + placed++ * (placedEdge + placementGap);
        const entry = addEntry([{ refId, x, y: start.y }]);
        await edit(entry, store.hold(entry.redo), "An image could not be placed.");
      };
    },
    [edit, store],
  );

  useEffect(() => {
    const sign: Sign = async (refIds, role) => {
      const result = await urls({ refIds: refIds as Array<Id<"refs">>, role });
      return Result.isSuccess(result) ? result.success : [];
    };
    return drive(
      store,
      host.current!,
      outlines.current!,
      sign,
      (drop) => onDrop.current(drop),
      (key) => onEditNote.current(key),
    );
  }, [store, urls]);

  return (
    <main className="relative flex-1 overflow-hidden">
      <div ref={host} data-testid="canvas" className="absolute inset-0 touch-none select-none" />
      <div ref={outlines} className="pointer-events-none absolute inset-0" />
      {draft ? <NoteEditor key={draft.key} store={store} draft={draft} done={commitNote} /> : null}
      <div
        data-testid="canvas-panel"
        className="absolute top-3 left-3 flex flex-col gap-1 rounded-md border bg-background p-2"
      >
        {children}
        <SaveImages collectionId={collectionId} placeAt={placeAt} />
        <EditButtons
          store={store}
          history={history}
          removeLabel={collectionId === undefined ? "Remove from canvas" : "Remove from collection"}
          actions={actions}
        />
        <NoteButtons store={store} color={noteColor} addNote={addNote} recolor={recolor} />
        {offCanvas > 0 ? (
          <div className="flex items-center gap-2">
            <p data-testid="off-canvas" data-count={offCanvas}>
              {offCanvas === 1
                ? "1 image of the library is not on this canvas."
                : `${offCanvas} images of the library are not on this canvas.`}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void inOrder(() => takeSnapshot(true).then(() => null)).catch(() =>
                  setProblem("The images could not be put back."),
                )
              }
            >
              Put them back
            </Button>
          </div>
        ) : null}
        <Readout store={store} />
        {problem ? <p role="alert">{problem}</p> : null}
      </div>
    </main>
  );
}

function EditButtons({
  store,
  history,
  removeLabel,
  actions,
}: {
  store: SceneStore;
  history: History;
  removeLabel: string;
  actions: Record<Action, () => void>;
}) {
  const { selected } = useSyncExternalStore(store.subscribe, store.summary);
  const { canUndo, canRedo } = useSyncExternalStore(history.subscribe, history.summary);
  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={selected === 0} onClick={actions.remove}>
          {removeLabel}
        </Button>
        <Button variant="outline" size="sm" disabled={!canUndo} onClick={actions.undo}>
          Undo
        </Button>
        <Button variant="outline" size="sm" disabled={!canRedo} onClick={actions.redo}>
          Redo
        </Button>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={selected === 0}
          onClick={actions.bringToFront}
        >
          Bring to front
        </Button>
        <Button variant="outline" size="sm" disabled={selected === 0} onClick={actions.sendToBack}>
          Send to back
        </Button>
      </div>
    </>
  );
}

/** The one color the selected notes share, or "" when none is selected or they differ. */
const selectedColor = (store: SceneStore) => {
  const selection = store.selection();
  const colors = new Set(
    store
      .items()
      .flatMap((item) => (item.kind === "note" && selection.has(item.key) ? [item.color] : [])),
  );
  return colors.size === 1 ? [...colors][0]! : "";
};

function NoteButtons({
  store,
  color,
  addNote,
  recolor,
}: {
  store: SceneStore;
  color: NoteColor;
  addNote: () => void;
  recolor: (color: NoteColor) => void;
}) {
  const shared = useSyncExternalStore(store.subscribe, () => selectedColor(store));
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={addNote}>
        Add note
      </Button>
      <NativeSelect
        size="sm"
        aria-label="Note color"
        value={shared || color}
        onChange={(event) => recolor(event.target.value as NoteColor)}
      >
        {noteColors.map((name) => (
          <NativeSelectOption key={name} value={name}>
            {name[0]!.toUpperCase() + name.slice(1)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

/**
 * A textarea over a note, at its place, size, and turn, in its type and color. It grows with the
 * text from the note's top-left corner. Leaving it or Mod+Enter saves, and Escape discards.
 */
function NoteEditor({
  store,
  draft,
  done,
}: {
  store: SceneStore;
  draft: Draft;
  done: (text: string | null) => void;
}) {
  const { camera } = useSyncExternalStore(store.subscribe, store.summary);
  const [text, setText] = useState(draft.before?.text ?? "");
  const field = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);
  const finish = (value: string | null) => {
    if (finished.current) return;
    finished.current = true;
    done(value);
  };
  useEffect(() => {
    const element = field.current!;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);
  const box = boxFor(text === "" ? "Note" : text);
  const unit = draft.scale * camera.zoom;
  const corner = worldToScreen(camera, draft.corner);
  return (
    <textarea
      ref={field}
      aria-label="Note"
      value={text}
      placeholder="Note"
      onChange={(event) => setText(event.target.value)}
      onBlur={() => finish(text)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
        } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          finish(text);
        }
      }}
      className="absolute resize-none overflow-hidden bg-transparent outline outline-primary"
      style={{
        left: corner.x,
        top: corner.y,
        // A little room past the measured text, so the field does not wrap a line the note keeps whole.
        width: (box.width + noteType.size / 4) * unit,
        height: box.height * unit,
        padding: noteType.padding * unit,
        font: noteFont(noteType.size * unit),
        lineHeight: `${noteType.lineHeight * unit}px`,
        color: noteInk[draft.color],
        transform: `rotate(${draft.rotation}rad)`,
        transformOrigin: "0 0",
      }}
    />
  );
}

function Readout({ store }: { store: SceneStore }) {
  const { items, selected, camera } = useSyncExternalStore(store.subscribe, store.summary);
  return (
    <p
      data-testid="canvas-readout"
      data-items={items}
      data-zoom={camera.zoom * 100}
      data-camera-x={camera.x}
      data-camera-y={camera.y}
      data-selected={selected}
    >
      {items} items, {Math.round(camera.zoom * 100)}%, at {Math.round(camera.x)},{" "}
      {Math.round(camera.y)}, {selected} selected
    </p>
  );
}

type Image = Extract<CanvasItem, { readonly kind: "image" }>;

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches("input, textarea, select, button"));

/** Wires input, textures, and drawing to the store. Draws once per animation frame after a change. */
function drive(
  store: SceneStore,
  host: HTMLDivElement,
  outlines: HTMLDivElement,
  sign: Sign,
  save: (drop: Drop) => void,
  editNote: (key: string) => void,
) {
  let renderer: Renderer | undefined;
  let textures: ReturnType<typeof createTextureLoader> | undefined;
  let noteTextures: ReturnType<typeof createNoteTextures> | undefined;
  let frame = 0;
  let disposed = false;
  let spaceHeld = false;
  let pointerId: number | null = null;
  const drawn = new Map<string, SceneItem>();

  const requestDraw = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(draw);
  };

  const textureFor = (item: Image, wanted: ImageRole): Need => {
    const display = { refId: item.refId, role: "display" } as const;
    const thumbnail = { refId: item.refId, role: "thumbnail" } as const;
    if (wanted === "display" && textures!.has(display)) return display;
    if (textures!.has(thumbnail) || !textures!.has(display)) return thumbnail;
    return display;
  };

  function draw() {
    frame = 0;
    if (!renderer || !textures || !noteTextures) return;
    const camera = store.camera();
    const viewport = store.viewport();
    const items = store.items();
    const images = items.flatMap((item) => (item.kind === "image" ? [item] : []));
    noteTextures.update(
      items.flatMap((item) => (item.kind === "note" ? [{ ...item, ...item.base }] : [])),
    );
    const editing = store.editing();
    const roles = new Map(
      itemsInView(images, camera, viewport, loadMargin).map((item) => [
        item.key,
        imageRole(item, camera.zoom * devicePixelRatio),
      ]),
    );
    const byKey = new Map(items.map((item) => [item.key, item]));
    const imageByKey = new Map(images.map((item) => [item.key, item]));
    const near = [...roles].map(([key, role]) => ({ refId: imageByKey.get(key)!.refId, role }));
    textures.update([
      ...near.map(({ refId }) => ({ refId, role: "thumbnail" as const })),
      ...near.filter(({ role }) => role === "display"),
    ]);

    const visible = new Set(itemsInView(items, camera, viewport, 0).map(({ key }) => key));
    let thumbnails = 0;
    const displays: Array<string> = [];
    const changed: Array<SceneItem> = [];
    for (const item of items) {
      const need =
        item.kind === "image" ? textureFor(item, roles.get(item.key) ?? "thumbnail") : null;
      if (need && visible.has(item.key) && textures.has(need)) {
        if (need.role === "display") displays.push(item.key);
        else thumbnails += 1;
      }
      const next: SceneItem = {
        key: item.key,
        texture: need ? textureKey(need) : item.key === editing ? "" : noteTextureKey(item.key),
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation,
        z: item.z,
      };
      const before = drawn.get(item.key);
      if (
        !before ||
        (Object.keys(next) as Array<keyof SceneItem>).some((field) => before[field] !== next[field])
      ) {
        drawn.set(item.key, next);
        changed.push(next);
      }
    }
    const gone = [...drawn.keys()].filter((key) => !byKey.has(key));
    for (const key of gone) drawn.delete(key);
    renderer.removeItems(gone);
    renderer.upsertItems(changed);
    renderer.setCamera(camera);
    renderer.draw();
    host.dataset.shownThumbnails = String(thumbnails);
    host.dataset.displayKeys = displays.join(" ");
    drawOutlines(outlines, store, byKey);
    drawFrame(outlines, store);
    drawMarquee(outlines, store);
  }

  void createPixiRenderer(host).then((created) => {
    if (disposed) {
      created.destroy();
      return;
    }
    renderer = created;
    textures = createTextureLoader(created, sign, requestDraw);
    noteTextures = createNoteTextures(created);
    requestDraw();
  });
  const unsubscribe = store.subscribe(requestDraw);

  const resize = new ResizeObserver(() =>
    store.setViewport({ width: host.clientWidth, height: host.clientHeight }),
  );
  resize.observe(host);

  const at = (event: MouseEvent): Point => {
    const box = host.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  // A press on a handle in the overlay reaches this listener on the overlay, not on the host. The
  // host captures the pointer either way, so the rest of the gesture arrives there.
  const onPointerDown = (event: PointerEvent) => {
    if (pointerId !== null) return;
    const grip = event.target instanceof HTMLElement ? event.target.dataset.handle : undefined;
    if (event.button === 1 || (event.button === 0 && spaceHeld)) {
      event.preventDefault();
      store.startPan(at(event));
    } else if (event.button === 0 && isGrip(grip)) {
      store.grab(grip, at(event));
    } else if (event.button === 0) {
      store.press(at(event), event.shiftKey);
    } else {
      return;
    }
    pointerId = event.pointerId;
    host.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId === pointerId) store.move(at(event), event.shiftKey);
  };
  // A release outside the window, or a switch to another window, sends no pointerup. The gesture
  // ends on a lost capture and on blur too, or the next pointer move would keep dragging.
  const endGesture = () => {
    if (pointerId === null) return;
    const ended = pointerId;
    pointerId = null;
    if (host.hasPointerCapture(ended)) host.releasePointerCapture(ended);
    const drop = store.release();
    if (drop) save(drop);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId === pointerId) endGesture();
  };
  const onDoubleClick = (event: MouseEvent) => {
    const hit = topmostAt(store.items(), screenToWorld(store.camera(), at(event)));
    if (hit?.kind === "note") editNote(hit.key);
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const perUnit = [1, 16, host.clientHeight][event.deltaMode] ?? 1;
    const delta = { x: event.deltaX * perUnit, y: event.deltaY * perUnit };
    if (event.ctrlKey) {
      store.zoom(at(event), Math.exp(-delta.y / 200));
    } else {
      store.scroll(delta);
    }
  };
  const setSpace = (held: boolean) => {
    spaceHeld = held;
    host.style.cursor = held ? "grab" : "";
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== "Space" || typing(event.target)) return;
    event.preventDefault();
    setSpace(true);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code === "Space") setSpace(false);
  };
  const onBlur = () => {
    setSpace(false);
    endGesture();
  };

  host.addEventListener("pointerdown", onPointerDown);
  outlines.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerup", onPointerUp);
  host.addEventListener("pointercancel", onPointerUp);
  host.addEventListener("lostpointercapture", onPointerUp);
  host.addEventListener("dblclick", onDoubleClick);
  host.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    unsubscribe();
    resize.disconnect();
    host.removeEventListener("pointerdown", onPointerDown);
    outlines.removeEventListener("pointerdown", onPointerDown);
    host.removeEventListener("pointermove", onPointerMove);
    host.removeEventListener("pointerup", onPointerUp);
    host.removeEventListener("pointercancel", onPointerUp);
    host.removeEventListener("lostpointercapture", onPointerUp);
    host.removeEventListener("dblclick", onDoubleClick);
    host.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    textures?.stop();
    renderer?.destroy();
  };
}

/** Keeps one outline element per selected item over its screen rectangle. */
function drawOutlines(
  layer: HTMLDivElement,
  store: SceneStore,
  byKey: ReadonlyMap<string, CanvasItem>,
) {
  const camera = store.camera();
  const selection = store.selection();
  for (const element of layer.querySelectorAll<HTMLElement>("[data-outline-key]")) {
    if (!selection.has(element.dataset.outlineKey!)) element.remove();
  }
  for (const key of selection) {
    const item = byKey.get(key);
    if (!item) continue;
    let element = layer.querySelector<HTMLElement>(`[data-outline-key="${CSS.escape(key)}"]`);
    if (!element) {
      element = document.createElement("div");
      element.dataset.outlineKey = key;
      element.className = "absolute border-2 border-primary";
      layer.appendChild(element);
    }
    place(element, camera, item);
  }
}

const isGrip = (name: string | undefined): name is Handle | "rotate" =>
  name === "rotate" || (name !== undefined && Object.hasOwn(handles, name));

/** Puts an element over a turned world rectangle on screen. */
const place = (element: HTMLElement, camera: Camera, rect: Rect) => {
  const center = worldToScreen(camera, rect);
  const width = rect.width * camera.zoom;
  const height = rect.height * camera.zoom;
  element.style.left = `${center.x - width / 2}px`;
  element.style.top = `${center.y - height / 2}px`;
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  element.style.transform = `rotate(${rect.rotation}rad)`;
};

const grip = (name: Handle | "rotate", left: string, top: string) => {
  const element = document.createElement("div");
  element.dataset.handle = name;
  element.className =
    "pointer-events-auto absolute size-2.5 -translate-1/2 rounded-full border border-primary bg-background";
  element.style.left = left;
  element.style.top = top;
  return element;
};

/**
 * Keeps the selection's frame over it, with a resize handle on each corner and edge and the rotate
 * handle above the top edge. The handles are screen pixels in size, so they keep it at every zoom.
 */
function drawFrame(layer: HTMLDivElement, store: SceneStore) {
  const frame = store.frame();
  let element = layer.querySelector<HTMLElement>("[data-frame]");
  if (!frame) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("div");
    element.dataset.frame = "";
    element.className = "absolute outline outline-primary";
    for (const [name, { x, y }] of Object.entries(handles) as Array<[Handle, Point]>) {
      element.append(grip(name, `${(x + 1) * 50}%`, `${(y + 1) * 50}%`));
    }
    element.append(grip("rotate", "50%", "-24px"));
    layer.append(element);
  }
  place(element, store.camera(), frame);
}

/** Keeps the marquee's rectangle from its press to the pointer while a marquee has moved. */
function drawMarquee(layer: HTMLDivElement, store: SceneStore) {
  const gesture = store.gesture();
  let element = layer.querySelector<HTMLElement>("[data-marquee]");
  if (gesture.kind !== "marquee" || !gesture.moved) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("div");
    element.dataset.marquee = "";
    element.className = "absolute border border-primary";
    layer.append(element);
  }
  const from = worldToScreen(store.camera(), gesture.fromWorld);
  element.style.left = `${Math.min(from.x, gesture.pointer.x)}px`;
  element.style.top = `${Math.min(from.y, gesture.pointer.y)}px`;
  element.style.width = `${Math.abs(from.x - gesture.pointer.x)}px`;
  element.style.height = `${Math.abs(from.y - gesture.pointer.y)}px`;
}
