import { cn } from "cn";
import type * as React from "react";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-grid h-5 min-w-5 place-items-center rounded-md bg-sunken px-[5px] font-sans text-[11px] leading-none font-[520] text-ink-3 shadow-[inset_0_0_0_1px_var(--line)]",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
