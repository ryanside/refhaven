import { useAuthActions } from "@convex-dev/auth/react";
import {
  Cancel01Icon,
  Delete02Icon,
  Image01Icon,
  Logout03Icon,
  Menu01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@refhaven/ui/components/button";
import { Icon } from "@refhaven/ui/components/icon";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@refhaven/ui/components/sheet";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { CollectionFinder } from "@/shell/collections-menu";
import { Mark } from "@/shell/mark";

const sheetLinkClass =
  "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-[540] text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:bg-hover aria-[current=page]:bg-hover aria-[current=page]:text-ink [&_svg]:text-ink-3";

/** On a narrow window, the way to every page: a sheet from the left that a followed link closes. */
export function NarrowMenu() {
  const [open, setOpen] = useState(false);
  const { signOut } = useAuthActions();
  const close = () => setOpen(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Menu" />}>
        <Icon icon={Menu01Icon} size={18} />
      </SheetTrigger>
      <SheetContent>
        <div className="flex h-12 items-center justify-between pr-1 pl-3">
          <SheetTitle className="flex items-center gap-2 text-[16px] font-[640] tracking-[-0.03em]">
            <Mark className="size-6" />
            refhaven
          </SheetTitle>
          <SheetClose render={<Button variant="ghost" size="icon" aria-label="Close" />}>
            <Icon icon={Cancel01Icon} size={18} />
          </SheetClose>
        </div>
        <nav aria-label="Pages" className="flex flex-col gap-0.5 py-1">
          <Link
            to="/library"
            activeOptions={{ includeSearch: false }}
            onClick={close}
            className={sheetLinkClass}
          >
            <Icon icon={Image01Icon} size={18} />
            Library
          </Link>
          <Link to="/trash" onClick={close} className={sheetLinkClass}>
            <Icon icon={Delete02Icon} size={18} />
            Trash
          </Link>
        </nav>
        <h2 className="mt-2 px-3 pt-2 pb-1.5 text-[12px] font-[560] text-ink-3">Collections</h2>
        <div className="flex min-h-0 flex-1 flex-col">
          <CollectionFinder close={close} listClassName="max-h-none flex-1" />
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-2 flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-[540] text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:bg-hover"
        >
          <Icon icon={Logout03Icon} size={18} className="text-ink-3" />
          Sign out
        </button>
      </SheetContent>
    </Sheet>
  );
}
