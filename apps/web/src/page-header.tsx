import { SidebarTrigger } from "@refhaven/ui/components/sidebar";
import type { ReactNode } from "react";

/** The bar at the top of a page: the sidebar's toggle, the page's title, and its own controls. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex items-center gap-4 border-b p-3">
      <SidebarTrigger />
      <h1 className="font-medium">{title}</h1>
      {children}
    </header>
  );
}
