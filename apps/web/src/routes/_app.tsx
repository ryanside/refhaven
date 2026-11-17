import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@refhaven/ui/components/button";
import { Link, Navigate, Outlet, createFileRoute } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";

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
  const { signOut } = useAuthActions();
  useRefuseStrayFileDrops();

  if (isLoading) {
    return <p className="p-6 text-sm">Loading…</p>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/sign-in" />;
  }

  return (
    <div className="flex min-h-svh flex-col text-sm">
      <header className="flex items-center gap-4 border-b p-3">
        <Link to="/library" className="font-medium">
          refhaven
        </Link>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => void signOut()}>
          Sign out
        </Button>
      </header>
      <Outlet />
    </div>
  );
}
