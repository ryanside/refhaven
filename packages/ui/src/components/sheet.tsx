import { Dialog } from "@base-ui/react/dialog";
import { cn } from "cn";

const Sheet = Dialog.Root;
const SheetTrigger = Dialog.Trigger;
const SheetClose = Dialog.Close;
const SheetTitle = Dialog.Title;

/** A panel that slides in from the left over a scrim. */
function SheetContent({ className, ...props }: Dialog.Popup.Props) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-50 bg-scrim transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <Dialog.Popup
        className={cn(
          "fixed inset-y-2 left-2 z-50 flex w-[min(340px,calc(100vw-16px))] flex-col rounded-[24px] bg-surface p-2 shadow-float-lg outline-none transition-[translate,opacity] duration-200 ease-out data-ending-style:-translate-x-4 data-ending-style:opacity-0 data-starting-style:-translate-x-4 data-starting-style:opacity-0",
          className,
        )}
        {...props}
      />
    </Dialog.Portal>
  );
}

export { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger };
