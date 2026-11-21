import { ImageAdd02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@refhaven/ui/components/icon";
import { Kbd } from "@refhaven/ui/components/kbd";
import type { ReactNode } from "react";
import { AddImagesButton } from "@/library/save-images";

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

/** Three empty prints fanned like the piles: the slots a first image fills. */
export function EmptyPrints() {
  const slot =
    "absolute top-2 left-1/2 -ml-11 grid h-[116px] w-[88px] origin-bottom place-items-center rounded-[6px]";
  return (
    <div aria-hidden className="relative mb-7 h-[132px] w-60">
      <i
        className={`${slot} border-[1.5px] border-dashed border-ink-4 bg-page`}
        style={{ transform: "translateX(-62px) rotate(-10deg)" }}
      />
      <i
        className={`${slot} border-[1.5px] border-dashed border-ink-4 bg-page`}
        style={{ transform: "translateX(62px) rotate(10deg)" }}
      />
      <i className={`${slot} bg-sunken text-ink-3 shadow-[inset_0_0_0_1.5px_var(--line-2)]`}>
        <Icon icon={ImageAdd02Icon} size={20} />
      </i>
    </div>
  );
}

/** "paste them with ⌘ V", with the key this machine uses. */
export function PasteKeys() {
  return (
    <span className="inline-flex translate-y-[-1px] gap-0.5 align-middle">
      <Kbd>{isMac() ? "⌘" : "Ctrl"}</Kbd>
      <Kbd>V</Kbd>
    </span>
  );
}

/**
 * The whole page below the top bar as a dashed drop zone on a faint wash, with the three ways in
 * and Add images as the one action.
 */
export function EmptyDropZone({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="fixed inset-x-(--gutter) top-20 bottom-(--gutter) grid place-items-center overflow-y-auto rounded-[24px] bg-[color-mix(in_srgb,var(--sunken)_45%,var(--page))]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[24px] border-[1.5px] border-dashed border-ink-4 opacity-70"
      />
      <div className="relative -mt-6 grid justify-items-center px-6 text-center">
        <EmptyPrints />
        <h1 className="text-[32px] leading-[38px] font-[620] tracking-[-0.032em] text-balance">
          {title}
        </h1>
        <p className="mt-2.5 max-w-[60ch] text-[16px] leading-6 text-pretty text-ink-2">
          {children}
        </p>
        <AddImagesButton className="mt-7" />
      </div>
    </main>
  );
}
