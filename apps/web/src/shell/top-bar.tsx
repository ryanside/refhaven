import { PaginatedQueryResult, QueryResult, usePaginatedQuery, useQuery } from "@confect/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  ArrowDown01Icon,
  ComputerIcon,
  Logout03Icon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import refs from "@refhaven/backend/refs";
import { Button } from "@refhaven/ui/components/button";
import { Icon } from "@refhaven/ui/components/icon";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@refhaven/ui/components/menu";
import { cn } from "@refhaven/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useId } from "react";
import { CollectionsMenu } from "@/shell/collections-menu";
import { Mark } from "@/shell/mark";
import { NarrowMenu } from "@/shell/narrow-menu";
import { type Theme, useTheme } from "@/theme-provider";

/** A floating cluster of the top bar: white glass over whatever scrolls beneath. */
export const pillClass =
  "glass pointer-events-auto flex h-11 shrink-0 items-center gap-0.5 rounded-full px-1.5 shadow-float";

/** An item of a cluster: ink-2 until hovered, and raised on the hover tone while it is current. */
export const navItemClass =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 font-[520] whitespace-nowrap text-ink-2 transition-[background-color,color] duration-150 hover:text-ink aria-[current=page]:bg-hover aria-[current=page]:text-ink aria-expanded:bg-hover aria-expanded:text-ink data-[current]:bg-hover data-[current]:text-ink [&_svg]:text-ink-3";

/**
 * The bar over every signed-in page: the places on the left, the page's own control in the middle,
 * and the theme, the account, and the page's main action on the right.
 */
export function TopBar({
  center,
  action,
}: {
  center?: ReactNode;
  /** The page's main action, after the account. */
  action?: ReactNode;
}) {
  return (
    // A narrow window moves the middle to a second row, under the places and the account.
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 grid h-[68px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-gutter max-[719px]:h-auto max-[719px]:grid-cols-[auto_minmax(0,1fr)] max-[719px]:gap-y-2 max-[719px]:py-3">
      <div className="flex min-w-0 items-center">
        <MainNav />
      </div>
      <div className="pointer-events-auto flex min-w-0 justify-center max-[719px]:order-3 max-[719px]:col-span-2 max-[719px]:justify-start max-[719px]:empty:hidden">
        {center}
      </div>
      <div className="flex min-w-0 items-center justify-end gap-2 max-[719px]:order-2">
        <div className={pillClass}>
          <ThemeMenu />
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line-2 max-[719px]:hidden" />
          <AccountMenu />
        </div>
        {action ? <div className="pointer-events-auto">{action}</div> : null}
      </div>
    </header>
  );
}

/**
 * The mark and the places: the library, the collections, and the trash. A narrow window folds the
 * places into a menu.
 */
function MainNav() {
  return (
    <nav aria-label="Main" className={pillClass}>
      <Link
        to="/library"
        aria-label="refhaven"
        activeOptions={{ includeSearch: false }}
        activeProps={{ "aria-current": undefined }}
        className="grid size-8 shrink-0 place-items-center rounded-full text-ink"
      >
        <Mark className="size-[22px]" />
      </Link>
      <Link
        to="/library"
        activeOptions={{ includeSearch: false }}
        className={cn(navItemClass, "max-[719px]:hidden")}
      >
        Library
      </Link>
      <div className="contents max-[719px]:hidden">
        <CollectionsMenu />
        <TrashLink />
      </div>
      <div className="hidden max-[719px]:contents">
        <NarrowMenu />
      </div>
    </nav>
  );
}

/** How many images are in the trash, up to the first page, once it is known. */
function useTrashCount() {
  const items = usePaginatedQuery(refs.public.library.trash, {}, { initialNumItems: 60 });
  if (PaginatedQueryResult.isLoadingFirstPage(items)) return null;
  const more =
    PaginatedQueryResult.isCanLoadMore(items) || PaginatedQueryResult.isLoadingMore(items);
  return `${items.results.length}${more ? "+" : ""}`;
}

/** Trash and its count, on every page, an empty trash's 0 included. */
function TrashLink() {
  const count = useTrashCount();
  const described = useId();
  return (
    <Link to="/trash" className={navItemClass} aria-describedby={count ? described : undefined}>
      Trash
      <span aria-hidden className="min-w-[1ch] font-[450] text-ink-3 num">
        {count}
      </span>
      {count ? (
        <span id={described} hidden>
          {count} {count === "1" ? "image" : "images"}
        </span>
      ) : null}
    </Link>
  );
}

const themes: ReadonlyArray<{ value: Theme; label: string; icon: typeof Sun03Icon }> = [
  { value: "light", label: "Light", icon: Sun03Icon },
  { value: "dark", label: "Dark", icon: Moon02Icon },
  { value: "system", label: "System", icon: ComputerIcon },
];

/** Light, dark, or the system's. The same control on every page, sign-in included. */
export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Theme" className="text-ink-2" />}
      >
        <Icon icon={Sun03Icon} size={18} className="dark:hidden" />
        <Icon icon={Moon02Icon} size={18} className="hidden dark:block" />
      </MenuTrigger>
      <MenuContent align="end" className="min-w-44">
        <MenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          {themes.map(({ value, label, icon }) => (
            <MenuRadioItem key={value} value={value}>
              <Icon icon={icon} size={16} />
              {label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

/** Who is signed in, and Sign out. The greeting and the user's ID are there for the checks, out of sight. */
function AccountMenu() {
  const me = useQuery(refs.public.users.whoAmI, { greeting: "Hello" });
  const { signOut } = useAuthActions();
  if (!QueryResult.isSuccess(me)) {
    return <span aria-hidden className="mx-1 size-6 shrink-0 rounded-full bg-hover" />;
  }
  const { message, userId, username } = me.value;
  const name = username ?? "you";
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            className="flex h-8 shrink-0 items-center gap-2 rounded-full pr-2 pl-1 font-[520] outline-offset-2 transition-colors duration-150 hover:bg-hover aria-expanded:bg-hover max-[719px]:pr-1"
          />
        }
      >
        <span
          aria-hidden
          className="grid size-6 place-items-center rounded-full bg-ink text-[12px] leading-none font-[650] text-page"
        >
          {name.slice(0, 1)}
        </span>
        <span data-testid="username" className="max-w-40 truncate max-[719px]:sr-only">
          {username}
        </span>
        <span hidden data-testid="message">
          {message}
        </span>
        <span hidden data-testid="user-id">
          {userId}
        </span>
        <Icon icon={ArrowDown01Icon} size={14} className="-ml-0.5 text-ink-3 max-[719px]:hidden" />
      </MenuTrigger>
      <MenuContent align="end" className="min-w-56">
        <MenuGroup>
          <MenuLabel>
            Signed in as <span className="font-[560] text-ink-2">{name}</span>
          </MenuLabel>
          <MenuSeparator />
          <MenuItem onClick={() => void signOut()}>
            <Icon icon={Logout03Icon} size={16} />
            Sign out
          </MenuItem>
        </MenuGroup>
      </MenuContent>
    </Menu>
  );
}
