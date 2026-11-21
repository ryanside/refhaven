import {
  Alert02Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  CenterFocusIcon,
  FolderRemoveIcon,
  GroupItemsIcon,
  LayerBringToFrontIcon,
  LayerSendToBackIcon,
  MinusSignIcon,
  PlusSignIcon,
  Redo02Icon,
  TextIcon,
  Undo02Icon,
  UngroupItemsIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Button } from "@refhaven/ui/components/button";
import { Icon } from "@refhaven/ui/components/icon";
import {
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItemRoot,
  MenuTrigger,
} from "@refhaven/ui/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@refhaven/ui/components/popover";
import { Tooltip } from "@refhaven/ui/components/tooltip";
import { cn } from "@refhaven/ui/lib/utils";
import {
  type History,
  type NoteColor,
  type SceneStore,
  boundsOf,
  groupEntry,
  maxZoom,
  minZoom,
  noteColors,
  worldToScreen,
} from "@refhaven/scene";
import { type ComponentProps, type ReactNode, useState, useSyncExternalStore } from "react";
import { Rule, pillClass } from "@/shell/top-bar";
import type { Action } from "./keymap";
import { noteInkStyle } from "./notes";

const chromeInsets = { top: 56, bottom: 76 } as const;
const fitMargin = 56;

/**
 * Shows every item in the part of the view the chrome leaves open, centered, at no more than 100%.
 * Nothing happens on an empty canvas.
 */
export function fitToView(store: SceneStore) {
  const bounds = boundsOf(store.items().map((item) => ({ ...item, scale: 1 })));
  if (!bounds) return;
  const viewport = store.viewport();
  const open = {
    width: viewport.width,
    height: viewport.height - chromeInsets.top - chromeInsets.bottom,
  };
  const zoom = Math.min(
    maxZoom,
    Math.max(
      minZoom,
      Math.min(
        1,
        (open.width - 2 * fitMargin) / (bounds.right - bounds.left),
        (open.height - 2 * fitMargin) / (bounds.bottom - bounds.top),
      ),
    ),
  );
  store.zoom({ x: 0, y: 0 }, zoom / store.camera().zoom);
  const center = worldToScreen(store.camera(), {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
  });
  store.scroll({
    x: center.x - open.width / 2,
    y: center.y - (chromeInsets.top + open.height / 2),
  });
}

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);
const shortcutLabel = (shortcut: string) =>
  isMac()
    ? shortcut.replace("Mod+", "⌘").replace("Shift+", "⇧")
    : shortcut.replace("Mod+", "Ctrl+");

function Tool({
  label,
  shortcut,
  icon,
  disabled,
  onClick,
  large = false,
}: {
  label: string;
  shortcut?: string;
  icon: IconSvgElement;
  disabled?: boolean;
  onClick: () => void;
  large?: boolean;
}) {
  return (
    <Tooltip label={label} shortcut={shortcut === undefined ? undefined : shortcutLabel(shortcut)}>
      <span className="inline-flex">
        <Button
          variant="ghost"
          size={large ? "icon-lg" : "icon"}
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className="text-ink disabled:text-ink-2 disabled:opacity-35"
        >
          <Icon icon={icon} size={large ? 20 : 18} />
        </Button>
      </span>
    </Tooltip>
  );
}

export function ZoomCluster({ store }: { store: SceneStore }) {
  const { camera } = useSyncExternalStore(store.subscribe, store.summary);
  const center = () => {
    const viewport = store.viewport();
    return {
      x: viewport.width / 2,
      y: chromeInsets.top + (viewport.height - chromeInsets.top - chromeInsets.bottom) / 2,
    };
  };
  const zoomTo = (zoom: number) => store.zoom(center(), zoom / store.camera().zoom);
  return (
    <div
      role="toolbar"
      aria-label="Zoom"
      className={cn(pillClass, "fixed bottom-[26px] left-(--gutter) z-30 max-[900px]:hidden")}
    >
      <Tool label="Zoom out" icon={MinusSignIcon} onClick={() => zoomTo(camera.zoom / 1.25)} />
      <ZoomLevel zoom={camera.zoom} zoomTo={zoomTo} fit={() => fitToView(store)} />
      <Tool label="Zoom in" icon={PlusSignIcon} onClick={() => zoomTo(camera.zoom * 1.25)} />
      <Rule />
      <Tool label="Zoom to fit" icon={CenterFocusIcon} onClick={() => fitToView(store)} />
    </div>
  );
}

const presets = [0.5, 1, 2] as const;

function ZoomLevel({
  zoom,
  zoomTo,
  fit,
}: {
  zoom: number;
  zoomTo: (zoom: number) => void;
  fit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const percent = Math.round(zoom * 100);
  const choose = (next: number) => {
    zoomTo(next);
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setTyped(String(percent));
      }}
    >
      <PopoverTrigger
        aria-label={`Zoom level ${percent}%, choose another`}
        className="h-8 min-w-14 rounded-full px-2 text-[13px] font-[540] num hover:bg-hover aria-expanded:bg-hover"
      >
        {percent}%
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={14}
        aria-label="Zoom level"
        className="w-52 p-1.5"
      >
        <form
          className="mb-1 flex h-10 items-center gap-1 rounded-xl bg-sunken px-3 focus-within:shadow-[inset_0_0_0_1.5px_var(--ink)]"
          onSubmit={(event) => {
            event.preventDefault();
            const value = Number.parseFloat(typed);
            if (!Number.isFinite(value)) return;
            choose(Math.min(maxZoom, Math.max(minZoom, value / 100)));
          }}
        >
          <input
            aria-label="Zoom level in percent"
            inputMode="decimal"
            autoFocus
            value={typed}
            onChange={(event) => setTyped(event.currentTarget.value)}
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none num"
          />
          <span className="text-[13px] text-ink-3">%</span>
        </form>
        {[
          { label: "Fit", run: () => (fit(), setOpen(false)) },
          ...presets.map((preset) => ({ label: `${preset * 100}%`, run: () => choose(preset) })),
        ].map(({ label, run }) => (
          <button
            key={label}
            type="button"
            onClick={run}
            className="flex h-9 w-full items-center rounded-[11px] px-2.5 text-left text-[14px] font-[480] num -outline-offset-2 hover:bg-hover"
          >
            {label}
          </button>
        ))}
        <p className="px-2.5 pt-1 pb-1.5 text-[12px] text-ink-2">From 1% to 6400%.</p>
      </PopoverContent>
    </Popover>
  );
}

const colorNames: Record<NoteColor, string> = {
  black: "Black",
  red: "Red",
  orange: "Orange",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
};

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

/** Note's color applies to the selected notes, or to the next note when none is selected. */
export function Dock({
  store,
  history,
  actions,
  color,
  recolor,
}: {
  store: SceneStore;
  history: History;
  actions: Record<Action, () => void>;
  color: NoteColor;
  recolor: (color: NoteColor) => void;
}) {
  const { canUndo, canRedo } = useSyncExternalStore(history.subscribe, history.summary);
  const shared = useSyncExternalStore(store.subscribe, () => selectedColor(store));
  const shown = shared || color;
  return (
    <div
      role="toolbar"
      aria-label="Canvas tools"
      data-testid="canvas-dock"
      className="glass fixed bottom-5 left-1/2 z-30 flex h-14 -translate-x-1/2 items-center gap-1 rounded-full px-2 shadow-float-lg"
    >
      <Tool
        large
        label="Undo"
        shortcut="Mod+Z"
        icon={Undo02Icon}
        disabled={!canUndo}
        onClick={actions.undo}
      />
      <Tool
        large
        label="Redo"
        shortcut="Mod+Shift+Z"
        icon={Redo02Icon}
        disabled={!canRedo}
        onClick={actions.redo}
      />
      <Rule />
      <div className="flex items-center">
        <Tooltip label="Add note" shortcut="N">
          <Button
            variant="ghost"
            aria-label="Add note"
            onClick={actions.addNote}
            className="h-10 gap-2 rounded-r-none pr-2.5 pl-3 text-[14px] text-ink"
          >
            <Icon icon={TextIcon} size={20} className="text-ink-2" />
            Note
          </Button>
        </Tooltip>
        <NoteColorPicker color={shown} recolor={recolor} />
      </div>
    </div>
  );
}

function Swatch({ color, className }: { color: NoteColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block size-[18px] rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)]",
        className,
      )}
      style={{ background: noteInkStyle(color) }}
    />
  );
}

function NoteColorPicker({
  color,
  recolor,
}: {
  color: NoteColor;
  recolor: (color: NoteColor) => void;
}) {
  return (
    <Menu orientation="horizontal">
      <Tooltip label="Note color">
        <MenuTrigger
          aria-label={`Note color: ${colorNames[color]}`}
          className="flex h-10 items-center gap-1 rounded-r-full pr-2.5 pl-1.5 text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2 aria-expanded:bg-hover"
        >
          <Swatch
            color={color}
            className="size-5 shadow-[0_0_0_2px_var(--surface),0_0_0_3px_var(--line-2)] dark:shadow-[0_0_0_2px_var(--surface),0_0_0_3px_rgb(255_255_255/0.22)]"
          />
          <Icon icon={ArrowDown01Icon} size={12} />
        </MenuTrigger>
      </Tooltip>
      <MenuContent
        side="top"
        align="center"
        sideOffset={14}
        aria-label="Note color"
        className="min-w-0 p-2"
      >
        <MenuRadioGroup
          value={color}
          onValueChange={(name) => recolor(name as NoteColor)}
          className="flex gap-1"
        >
          {noteColors.map((name) => (
            <MenuSwatch key={name} value={name} aria-label={colorNames[name]}>
              <Swatch color={name} />
            </MenuSwatch>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

function MenuSwatch(props: ComponentProps<typeof MenuRadioItemRoot>) {
  return (
    <MenuRadioItemRoot
      closeOnClick
      className="grid size-9 place-items-center rounded-full -outline-offset-2 data-checked:shadow-[inset_0_0_0_1.5px_var(--ink)] data-highlighted:bg-hover"
      {...props}
    />
  );
}

export function SelectionCluster({
  store,
  actions,
}: {
  store: SceneStore;
  actions: Record<Action, () => void>;
}) {
  const { items, selected, camera } = useSyncExternalStore(store.subscribe, store.summary);
  const canGroup = useSyncExternalStore(
    store.subscribe,
    () => groupEntry(store.selected(), "") !== null,
  );
  const canUngroup = useSyncExternalStore(store.subscribe, () =>
    store.selected().some((item) => item.group),
  );
  const none = selected === 0;
  // The readout stays out of the toolbar, which is inert while nothing is selected, so a screen
  // reader still hears it say so.
  return (
    <div
      className={cn(
        pillClass,
        // Under 1000 px it would meet the centered dock, so it stands above it.
        "fixed right-(--gutter) bottom-[26px] z-30 origin-bottom-right transition-[opacity,translate,scale] duration-200 ease-out tight:bottom-[88px]",
        none && "pointer-events-none translate-y-1.5 scale-[0.97] opacity-0",
      )}
    >
      <p
        data-testid="canvas-readout"
        data-items={items}
        data-zoom={camera.zoom * 100}
        data-camera-x={camera.x}
        data-camera-y={camera.y}
        data-selected={selected}
        aria-live="polite"
        className="pr-1 pl-2.5 text-[13px] font-[560] whitespace-nowrap text-ink num"
      >
        {none ? "Nothing selected" : `${selected} selected`}
      </p>
      <div role="toolbar" aria-label="Selection" inert={none} className="flex items-center gap-0.5">
        <Rule />
        <Tool
          label="Bring to front"
          shortcut="]"
          icon={LayerBringToFrontIcon}
          disabled={none}
          onClick={actions.bringToFront}
        />
        <Tool
          label="Send to back"
          shortcut="["
          icon={LayerSendToBackIcon}
          disabled={none}
          onClick={actions.sendToBack}
        />
        <Tool
          label="Group"
          shortcut="Mod+G"
          icon={GroupItemsIcon}
          disabled={!canGroup}
          onClick={actions.group}
        />
        <Tool
          label="Ungroup"
          shortcut="Mod+Shift+G"
          icon={UngroupItemsIcon}
          disabled={!canUngroup}
          onClick={actions.ungroup}
        />
        <Rule />
        <Tool
          label="Remove from collection"
          shortcut="Delete"
          icon={FolderRemoveIcon}
          disabled={none}
          onClick={actions.remove}
        />
      </div>
    </div>
  );
}

export function Problem({ children, close }: { children: ReactNode; close: () => void }) {
  return (
    <div className="fixed bottom-[92px] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-surface py-1.5 pr-1.5 pl-4 shadow-float-lg tight:bottom-[144px]">
      <Icon icon={Alert02Icon} size={16} className="shrink-0 text-bad" />
      <p role="alert" className="text-[13px] font-[520]">
        {children}
      </p>
      <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={close}>
        <Icon icon={Cancel01Icon} size={14} />
      </Button>
    </div>
  );
}
