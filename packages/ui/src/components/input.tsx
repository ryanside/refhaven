import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";
import type * as React from "react";

/** A sunken field. It lifts to the surface with an ink ring while it has focus. */
const fieldClass =
  "w-full min-w-0 rounded-xl bg-sunken px-3 text-[14px] text-ink outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-ink-3 focus:bg-surface focus:shadow-[inset_0_0_0_1.5px_var(--ink)] disabled:opacity-50 aria-invalid:shadow-[inset_0_0_0_1.5px_var(--bad)]";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <InputPrimitive className={cn(fieldClass, "h-10", className)} {...props} />;
}

export { Input, fieldClass };
