import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type * as React from "react";

const TooltipProvider = TooltipPrimitive.Provider;

/**
 * Names a control on hover and focus, with its shortcut when it has one. `children` is the trigger,
 * rendered through `render` so it keeps its own element.
 */
function Tooltip({
  label,
  shortcut,
  side = "top",
  children,
}: {
  label: string;
  shortcut?: string | undefined;
  side?: TooltipPrimitive.Positioner.Props["side"];
  children: React.ReactElement;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} sideOffset={10} className="z-50">
          <TooltipPrimitive.Popup className="flex origin-(--transform-origin) items-center gap-2 rounded-[9px] bg-ink px-2 py-1 text-[12px] leading-4 font-[520] text-page shadow-float transition-[scale,opacity] duration-100 ease-out data-ending-style:opacity-0 data-starting-style:scale-[0.96] data-starting-style:opacity-0 data-instant:transition-none">
            {label}
            {shortcut ? (
              <span className="font-[450] text-[color-mix(in_srgb,var(--page)_62%,var(--ink))]">
                {shortcut}
              </span>
            ) : null}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export { Tooltip, TooltipProvider };
