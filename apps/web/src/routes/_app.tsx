import { TooltipProvider } from "@refhaven/ui/components/tooltip";
import { Navigate, Outlet, createFileRoute } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";
import { Toaster } from "@/shell/toast";

export const Route = createFileRoute("/_app")({
  ssr: false,
  component: SignedInLayout,
});

/**
 * A browser opens a dropped file and leaves the app, unless the page cancels the drag. A page that
 * saves dropped files cancels it first, on `document`. This refuses the drag everywhere else.
 */
function useRefuseStrayFileDrops() {
  useEffect(() => {
    const refuse = (event: DragEvent) => {
      if (event.defaultPrevented || !event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", refuse);
    window.addEventListener("drop", refuse);
    return () => {
      window.removeEventListener("dragover", refuse);
      window.removeEventListener("drop", refuse);
    };
  }, []);
}

function SignedInLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  useRefuseStrayFileDrops();

  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/sign-in" />;

  return (
    <TooltipProvider delay={500} closeDelay={0}>
      <Outlet />
      <Toaster />
    </TooltipProvider>
  );
}
