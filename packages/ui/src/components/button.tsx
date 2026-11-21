import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * Every button is a full pill. `primary` is the one main action of a view, ink on the page.
 * `secondary` is outlined, `ghost` is bare until hovered, and `glass` floats over images.
 */
const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-[540] whitespace-nowrap outline-none select-none transition-[background-color,color,box-shadow,scale,opacity] duration-150 ease-out active:not-aria-[haspopup]:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-page hover:bg-[color-mix(in_srgb,var(--ink)_86%,var(--page))]",
        secondary:
          "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line-2)] hover:bg-sunken aria-expanded:bg-sunken",
        ghost: "text-ink-2 hover:bg-hover hover:text-ink aria-expanded:bg-hover aria-expanded:text-ink",
        glass: "glass text-ink shadow-float hover:bg-surface",
      },
      size: {
        sm: "h-[30px] gap-1.5 px-3 text-[13px] has-[>svg:first-child]:pl-2.5",
        md: "h-9 px-3.5 text-[14px] has-[>svg:first-child]:pl-3",
        lg: "h-11 px-[18px] text-[14px] has-[>svg:first-child]:pl-4",
        "icon-sm": "size-7",
        icon: "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

function Button({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
