import { SidebarTrigger } from "@refhaven/ui/components/sidebar";
import type { ReactNode } from "react";
import { ModeToggle } from "@/mode-toggle";

/** The bar at the top of a page: the sidebar's toggle, the page's title, its own controls, and the theme. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex items-center gap-4 border-b p-3">
      <SidebarTrigger />
      <h1 className="font-medium">{title}</h1>
      {children}
      <div className="ml-auto">
        <ModeToggle />
      </div>
    </header>
  );
}
