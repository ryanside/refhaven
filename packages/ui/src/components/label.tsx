import { cn } from "cn";
import type * as React from "react";

/** A field's name, small and above it. */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("flex items-center gap-2 text-[12px] leading-4 font-[560] text-ink-2 select-none", className)}
      {...props}
    />
  );
}

export { Label };
