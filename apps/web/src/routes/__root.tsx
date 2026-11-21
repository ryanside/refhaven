import { HeadContent, Link, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { ConvexReactClient } from "convex/react";

import appCss from "@refhaven/ui/globals.css?url";
import { ThemeProvider } from "@/theme-provider";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  convexClient: ConvexReactClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "refhaven" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  notFoundComponent: () => (
    <main className="grid min-h-svh place-items-center px-gutter">
      <div className="grid justify-items-center text-center">
        <h1 className="text-[28px] leading-[34px] font-[620] tracking-[-0.03em]">
          Page not found.
        </h1>
        <p className="mt-2 text-[15px] text-ink-2">The link may be incomplete.</p>
        <Link
          to="/library"
          className="mt-6 text-[14px] font-[540] underline decoration-ink-4 underline-offset-[3px]"
        >
          Open your library
        </Link>
      </div>
    </main>
  ),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider defaultTheme="system" storageKey="theme">
          {children}
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
