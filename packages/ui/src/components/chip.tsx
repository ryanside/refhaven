import { cva } from "class-variance-authority";

/** A tag or filter chip. The active one is filled ink. */
const chipVariants = cva(
  "inline-flex h-7 shrink-0 items-center gap-1 rounded-full text-[13px] font-[500] whitespace-nowrap transition-[background-color,color] duration-150 select-none",
  {
    variants: {
      tone: {
        quiet:
          "bg-sunken text-ink hover:bg-hover dark:bg-hover dark:shadow-[inset_0_0_0_1px_var(--line)] dark:hover:shadow-[inset_0_0_0_1px_var(--line-2)]",
        active: "bg-ink text-page",
        outline: "text-ink-2 shadow-[inset_0_0_0_1px_var(--line-2)] hover:bg-sunken hover:text-ink",
      },
    },
    defaultVariants: { tone: "quiet" },
  },
);

export { chipVariants };
