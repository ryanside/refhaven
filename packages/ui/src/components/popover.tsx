import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "cn";
import { popupClass } from "./menu";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverClose = PopoverPrimitive.Close;
const PopoverTitle = PopoverPrimitive.Title;

function PopoverContent({
  className,
  align = "start",
  side = "bottom",
  sideOffset = 8,
  alignOffset = 0,
  initialFocus,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, "align" | "side" | "sideOffset" | "alignOffset">) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        className="z-50 outline-none"
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
      >
        <PopoverPrimitive.Popup
          initialFocus={initialFocus}
          className={cn(popupClass, "max-h-(--available-height)", className)}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverClose, PopoverContent, PopoverTitle, PopoverTrigger };
