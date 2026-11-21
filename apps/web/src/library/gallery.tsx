import { PaginatedQueryResult, QueryResult, useMutation, useQuery } from "@confect/react";
import {
  FolderAddIcon,
  MoreHorizontalIcon,
  PlusSignIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { Button } from "@refhaven/ui/components/button";
import { Icon } from "@refhaven/ui/components/icon";
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuLabel,
  MenuLinkItem,
  MenuSeparator,
  MenuItem,
  MenuSubmenu,
  MenuSubmenuTrigger,
  MenuTrigger,
} from "@refhaven/ui/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@refhaven/ui/components/popover";
import { Tooltip } from "@refhaven/ui/components/tooltip";
import { cn } from "@refhaven/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { thumbHashToDataURL } from "thumbhash";
import { NewCollectionForm, newCollectionButtonClass } from "@/collections/new-collection";
import { Pile, useCollectionCover } from "@/collections/pile";
import { galleryPage } from "@/library/page";
import { useRefUrls } from "@/library/use-ref-urls";
import { rememberOpened, useOrigin } from "@/library/origin";
import { useCollections } from "@/shell/collections-menu";
import { type Box, arrange } from "@/library/masonry";
import { shownName } from "@/library/name";
import { RetryingImg } from "@/library/retrying-img";

export type Item = {
  readonly refId: Id<"refs">;
  readonly fileName: string;
  readonly width: number;
  readonly height: number;
  readonly thumbHash: string | null;
};

/** What a tile's second button does: put the image in the trash, or take it out of a collection. */
export type Removal = {
  readonly label: string;
  readonly icon: IconSvgElement;
  readonly run: (refId: Id<"refs">) => void;
};

function useWidth() {
  const element = useRef<HTMLUListElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const target = element.current!;
    setWidth(target.clientWidth);
    const resize = new ResizeObserver(() => setWidth(target.clientWidth));
    resize.observe(target);
    return () => resize.disconnect();
  }, []);
  return [element, width] as const;
}

export function Masonry({ items, removal }: { items: ReadonlyArray<Item>; removal: Removal }) {
  const [list, width] = useWidth();
  const refIds = useMemo(() => items.map((item) => item.refId), [items]);
  const urls = useRefUrls(refIds, "thumbnail");
  const { boxes, height } = useMemo(() => arrange(items, width), [items, width]);

  return (
    <ul ref={list} className="relative" style={{ height }}>
      {width === 0
        ? null
        : items.map((item, index) => (
            <Tile
              key={item.refId}
              item={item}
              url={urls.get(item.refId)?.url}
              removal={removal}
              box={boxes[index]!}
              order={refIds}
            />
          ))}
    </ul>
  );
}

function Tile({
  item,
  url,
  removal,
  box,
  order,
}: {
  item: Item;
  url: string | undefined;
  removal: Removal;
  box: Box;
  order: ReadonlyArray<Id<"refs">>;
}) {
  const origin = useOrigin();
  const open = () => rememberOpened(item.refId, { origin, order, listBehind: true });
  return (
    <li
      data-ref-id={item.refId}
      className="group/tile absolute"
      style={{ left: box.left, top: box.top, width: box.width }}
    >
      <Link
        to="/r/$refId"
        params={{ refId: item.refId }}
        onClick={open}
        className="image-edge block overflow-hidden rounded-[6px] bg-sunken"
        style={{ height: box.imageHeight }}
      >
        <Thumbnail item={item} url={url} />
      </Link>
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity duration-150 ease-out group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 has-data-popup-open:opacity-100 [@media(hover:none)]:opacity-100">
        <CollectionPicker refId={item.refId} />
        <Tooltip label={removal.label}>
          <Button
            variant="glass"
            size="icon"
            aria-label={removal.label}
            onClick={() => removal.run(item.refId)}
          >
            <Icon icon={removal.icon} size={16} />
          </Button>
        </Tooltip>
      </div>
      <div className="flex h-[18px] items-center gap-1 mt-1.5">
        <p className="min-w-0 flex-1 truncate text-[13px] leading-[18px] text-ink-2">
          {shownName(item.fileName)}
        </p>
        <TileMenu item={item} removal={removal} open={open} />
      </div>
    </li>
  );
}

export const thumbHashBackground = (thumbHash: string | null) =>
  thumbHash === null
    ? undefined
    : `url(${thumbHashToDataURL(Uint8Array.from(atob(thumbHash), (c) => c.charCodeAt(0)))})`;

function Thumbnail({ item, url }: { item: Item; url: string | undefined }) {
  const [loaded, setLoaded] = useState(false);
  const placeholder = useMemo(() => thumbHashBackground(item.thumbHash), [item.thumbHash]);

  return (
    <RetryingImg
      // Every image load is a CORS request. A response cached from a plain <img> has
      // no CORS headers, and a later canvas load of the same URL would fail on it.
      crossOrigin="anonymous"
      src={url}
      alt={item.fileName}
      width={item.width}
      height={item.height}
      draggable={false}
      onLoad={() => setLoaded(true)}
      style={loaded ? undefined : { backgroundImage: placeholder, backgroundSize: "cover" }}
      className="size-full object-cover object-top"
    />
  );
}

function useMembership(refId: Id<"refs">) {
  const details = useQuery(refs.public.ref.get, { refId });
  return new Set(
    QueryResult.isSuccess(details) ? details.value.collections.map((c) => c.collectionId) : [],
  );
}

function useToggleMembership(refId: Id<"refs">) {
  const addRefs = useMutation(refs.public.collections.addRefs);
  const removeRefs = useMutation(refs.public.collections.removeRefs);
  return (collectionId: Id<"collections">, member: boolean) =>
    void (member ? removeRefs : addRefs)({ collectionId, refIds: [refId] });
}

/**
 * Add to a collection: each collection as a toggle, and a new one at the foot. `trigger` is the
 * button that opens it, the glass one of a tile unless given.
 */
export function CollectionPicker({
  refId,
  trigger,
  align = "end",
}: {
  refId: Id<"refs">;
  trigger?: React.ReactElement;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {trigger ? (
        <PopoverTrigger render={trigger} />
      ) : (
        <Tooltip label="Add to a collection">
          <PopoverTrigger
            render={<Button variant="glass" size="icon" aria-label="Add to a collection" />}
          >
            <Icon icon={FolderAddIcon} size={16} />
          </PopoverTrigger>
        </Tooltip>
      )}
      <PopoverContent align={align} className="flex w-[280px] flex-col p-1.5">
        {open ? <PickerBody refId={refId} /> : null}
      </PopoverContent>
    </Popover>
  );
}

function PickerBody({ refId }: { refId: Id<"refs"> }) {
  const collections = useCollections();
  const members = useMembership(refId);
  const toggle = useToggleMembership(refId);
  const addRefs = useMutation(refs.public.collections.addRefs);
  const [making, setMaking] = useState(false);
  return (
    <>
      <h2 className="px-2.5 pt-1.5 pb-1.5 text-[12px] leading-4 font-[540] text-ink-3">
        Add to a collection
      </h2>
      <ul className="max-h-[min(320px,50vh)] overflow-y-auto overscroll-contain">
        {collections.map(({ collectionId, name }) => (
          <li key={collectionId}>
            <PickerRow
              collectionId={collectionId}
              name={name}
              member={members.has(collectionId)}
              toggle={() => toggle(collectionId, members.has(collectionId))}
            />
          </li>
        ))}
      </ul>
      <div className={cn(collections.length > 0 && "mt-1 border-t border-line pt-1.5")}>
        {making || collections.length === 0 ? (
          <NewCollectionForm
            label="Name a new collection"
            autoFocus={making}
            fieldClassName="bg-sunken"
            cancel={() => setMaking(false)}
            created={(collectionId) => {
              setMaking(false);
              void addRefs({ collectionId, refIds: [refId] });
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setMaking(true)}
            className={newCollectionButtonClass}
          >
            <Icon icon={PlusSignIcon} size={16} className="text-ink-3" />
            New collection
          </button>
        )}
      </div>
    </>
  );
}

function PickerRow({
  collectionId,
  name,
  member,
  toggle,
}: {
  collectionId: Id<"collections">;
  name: string;
  member: boolean;
  toggle: () => void;
}) {
  const cover = useCollectionCover(collectionId);
  return (
    <button
      type="button"
      aria-pressed={member}
      onClick={toggle}
      className="flex h-11 w-full items-center gap-2.5 rounded-[11px] pr-2.5 pl-1 text-left text-[14px] font-[520] -outline-offset-2 hover:bg-hover"
    >
      <Pile prints={cover.cover} scale={0.38} className="-my-1" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <Icon
        icon={Tick02Icon}
        size={16}
        className={cn("shrink-0 text-ink transition-opacity", member ? "opacity-100" : "opacity-0")}
      />
    </button>
  );
}

function TileMenu({ item, removal, open }: { item: Item; removal: Removal; open: () => void }) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`More for ${item.fileName}`}
            className="-my-[3px] -mr-1 size-6 opacity-0 transition-opacity duration-150 group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 data-popup-open:opacity-100 [@media(hover:none)]:opacity-100"
          />
        }
      >
        <Icon icon={MoreHorizontalIcon} size={16} />
      </MenuTrigger>
      <MenuContent align="end" className="min-w-52">
        <MenuLinkItem
          render={<Link to="/r/$refId" params={{ refId: item.refId }} />}
          onClick={open}
        >
          Open
        </MenuLinkItem>
        <MenuSubmenu>
          <MenuSubmenuTrigger>Add to a collection</MenuSubmenuTrigger>
          <MenuContent side="right" align="start" sideOffset={4} className="min-w-52">
            <SubmenuCollections refId={item.refId} />
          </MenuContent>
        </MenuSubmenu>
        <MenuSeparator />
        <MenuItem onClick={() => removal.run(item.refId)}>
          <Icon icon={removal.icon} size={16} />
          {removal.label}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function SubmenuCollections({ refId }: { refId: Id<"refs"> }) {
  const collections = useCollections();
  const members = useMembership(refId);
  const toggle = useToggleMembership(refId);
  if (collections.length === 0) {
    return (
      <MenuGroup>
        <MenuLabel>No collections yet</MenuLabel>
      </MenuGroup>
    );
  }
  return collections.map(({ collectionId, name }) => (
    <MenuCheckboxItem
      key={collectionId}
      checked={members.has(collectionId)}
      onCheckedChange={() => toggle(collectionId, members.has(collectionId))}
    >
      <span className="min-w-0 flex-1 truncate">{name}</span>
    </MenuCheckboxItem>
  ));
}

/** A set of images, loaded a page at a time, with Load more at its foot. */
export function Gallery<E extends { readonly _tag: string }>({
  items,
  removal,
}: {
  items: PaginatedQueryResult.PaginatedQueryResult<Item, E>;
  removal: Removal;
}) {
  return (
    <>
      <Masonry items={items.results} removal={removal} />
      {PaginatedQueryResult.isFailure(items) ? (
        <p role="alert" className="mt-6 text-[14px] text-bad">
          The images could not be loaded ({items.error._tag}).
        </p>
      ) : null}
      {PaginatedQueryResult.isCanLoadMore(items) ? (
        <div className="mt-10 flex justify-center">
          <Button
            variant="secondary"
            size="lg"
            onClick={() => items.loadMore(galleryPage.initialNumItems)}
          >
            Load more
          </Button>
        </div>
      ) : PaginatedQueryResult.isLoadingMore(items) ? (
        <div className="mt-10 flex justify-center">
          <Button variant="secondary" size="lg" disabled>
            Load more
          </Button>
        </div>
      ) : null}
    </>
  );
}
