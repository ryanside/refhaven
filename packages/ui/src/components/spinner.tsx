import { cn } from "cn";

function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-4 shrink-0 animate-spin rounded-full motion-reduce:animate-none border-[1.5px] border-current border-r-transparent",
        className,
      )}
    />
  );
}

export { Spinner };
