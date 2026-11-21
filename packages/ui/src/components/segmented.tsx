import { cn } from "cn";
import type * as React from "react";

/** A track of two or more choices, the current one raised. Each item marks itself with `aria-current`. */
function Segmented({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      className={cn("inline-flex h-8 shrink-0 rounded-full bg-hover p-[3px]", className)}
      {...props}
    />
  );
}

const segmentClass =
  "inline-flex h-[26px] items-center gap-1.5 rounded-full pr-3 pl-2.5 text-[13px] font-[520] text-ink-2 outline-offset-1 transition-[background-color,color,box-shadow] duration-150 hover:text-ink aria-[current=page]:bg-surface aria-[current=page]:text-ink aria-[current=page]:shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(0_0_0/0.08)] dark:aria-[current=page]:bg-[#3a3a37] [&_svg]:text-ink-3 aria-[current=page]:[&_svg]:text-ink-2";

export { Segmented, segmentClass };
