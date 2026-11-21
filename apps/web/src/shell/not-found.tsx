import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { buttonVariants } from "@refhaven/ui/components/button";
import { cn } from "@refhaven/ui/lib/utils";
import { Icon } from "@refhaven/ui/components/icon";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { TopBar } from "@/shell/top-bar";

export function NotFound({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <TopBar />
      <main className="grid min-h-svh place-items-center px-gutter pt-[68px] pb-16">
        <div className="grid justify-items-center text-center">
          <div aria-hidden className="relative mb-7 h-[124px] w-40">
            <i
              className="absolute top-2 left-1/2 -ml-11 h-[116px] w-[88px] origin-bottom rounded-[6px] border-[1.5px] border-dashed border-ink-4"
              style={{ transform: "translateX(-14px) rotate(-8deg)" }}
            />
            <i
              className="absolute top-2 left-1/2 -ml-11 h-[116px] w-[88px] origin-bottom rounded-[6px] bg-sunken shadow-[inset_0_0_0_1.5px_var(--line-2)]"
              style={{ transform: "translateX(10px) rotate(5deg)" }}
            />
          </div>
          <h1 className="text-[28px] leading-[34px] font-[620] tracking-[-0.03em]">{title}</h1>
          <p className="mt-2 max-w-[44ch] text-[15px] leading-[22px] text-pretty text-ink-2">
            {children}
          </p>
          <Link
            to="/library"
            className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "mt-7")}
          >
            <Icon icon={ArrowLeft02Icon} size={18} />
            Back to Library
          </Link>
        </div>
      </main>
    </>
  );
}
