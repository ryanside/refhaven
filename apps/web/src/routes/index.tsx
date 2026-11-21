import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { buttonVariants } from "@refhaven/ui/components/button";
import { Icon } from "@refhaven/ui/components/icon";
import { cn } from "@refhaven/ui/lib/utils";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Mark } from "@/shell/mark";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  return (
    <main className="grid min-h-svh place-items-center px-gutter">
      <div className="grid justify-items-center text-center">
        <Mark className="size-10" />
        <h1 className="mt-6 text-[32px] leading-[38px] font-[640] tracking-[-0.032em]">refhaven</h1>
        <p className="mt-2 max-w-[44ch] text-[16px] leading-6 text-ink-2">
          A reference library for images. Gather them into collections, and arrange each on a
          canvas.
        </p>
        <Link to="/library" className={cn(buttonVariants({ size: "lg" }), "mt-8")}>
          Open your library
          <Icon icon={ArrowRight01Icon} size={18} className="-mr-1" />
        </Link>
      </div>
    </main>
  );
}
