import { cn } from "@refhaven/ui/lib/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * A row that scrolls sideways once it is wider than its box, and fades at each edge it can scroll
 * toward.
 */
export function FadeRow({ className, children }: { className?: string; children: ReactNode }) {
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
    for (const child of element.children) resize.observe(child);
    element.addEventListener("scroll", measure, { passive: true });
    return () => {
      resize.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, [children]);

  return (
    <div
      ref={row}
      className={cn(
        "flex items-center overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
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
