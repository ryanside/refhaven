import { cn } from "@refhaven/ui/lib/utils";
import { type ReactElement, useEffect, useRef, useState } from "react";

/**
 * A row that scrolls sideways once it is wider than its box, and fades at each edge it can scroll
 * toward. Its one child holds the items in a box as wide as they are, which it watches for a change
 * of width. It keeps room for a focus ring above and below the items, and takes no height for it.
 */
export function FadeRow({ className, children }: { className?: string; children: ReactElement }) {
  const row = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ start: false, end: false });

  useEffect(() => {
    const element = row.current!;
    const measure = () =>
      setFade({
        start: element.scrollLeft > 1,
        end: element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
      });
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    resize.observe(element.firstElementChild!);
    element.addEventListener("scroll", measure, { passive: true });
    return () => {
      resize.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, []);

  return (
    <div
      ref={row}
      className={cn(
        "-my-1 overflow-x-auto overscroll-x-contain py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      style={{
        maskImage: `linear-gradient(to right, ${fade.start ? "transparent, black 48px" : "black"}, ${fade.end ? "black calc(100% - 48px), transparent" : "black"})`,
      }}
    >
      {children}
    </div>
  );
}
