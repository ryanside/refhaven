import { cn } from "cn";
import type * as React from "react";
import { fieldClass } from "./input";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(fieldClass, "field-sizing-content min-h-20 resize-none py-2.5 leading-[21px]", className)}
      {...props}
    />
  );
}

export { Textarea };
