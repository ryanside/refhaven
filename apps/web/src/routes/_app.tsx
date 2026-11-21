import { QueryResult, useMutation, useQuery } from "@confect/react";
import { useAuthActions } from "@convex-dev/auth/react";
import refs from "@refhaven/backend/refs";
import { Button } from "@refhaven/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@refhaven/ui/components/sidebar";
import { Link, Navigate, Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import * as Result from "effect/Result";
import { useEffect } from "react";
import { NameForm } from "@/collections/name-form";

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

/** The way to every page: the library, the trash, and each collection. */
function AppSidebar() {
  const { pathname } = useLocation();
  const { signOut } = useAuthActions();
  // On a narrow window the sidebar is a sheet over the page, which a followed link closes.
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  const collections = useQuery(refs.public.collections.list, {});
  const create = useMutation(refs.public.collections.create);
  const owned = QueryResult.isSuccess(collections) ? collections.value : [];

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/library" onClick={close} />}>
              refhaven
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname === "/library"}
                render={<Link to="/library" onClick={close} />}
              >
                Library
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname === "/trash"}
                render={<Link to="/trash" onClick={close} />}
              >
                Trash
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Collections</SidebarGroupLabel>
          <SidebarMenu>
            {owned.map(({ collectionId, name }) => (
              <SidebarMenuItem key={collectionId}>
                <SidebarMenuButton
                  isActive={pathname === `/c/${collectionId}`}
                  render={
                    <Link
                      to="/c/$collectionId"
                      params={{ collectionId }}
                      data-collection-id={collectionId}
                      onClick={close}
                    />
                  }
                >
                  {name}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="px-2">
            <NameForm
              label="New collection"
              submit="Create"
              save={async (name) => {
                const created = await create({ name });
                return Result.isFailure(created) ? created.failure._tag : null;
              }}
            />
          </div>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Account />
        <Button variant="secondary" size="sm" onClick={() => void signOut()}>
          Sign out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

/** Who is signed in. The greeting and the user's ID are there for the checks, out of sight. */
function Account() {
  const me = useQuery(refs.public.users.whoAmI, { greeting: "Hello" });

  return QueryResult.match(me, {
    onLoading: () => <p className="px-2">Loading…</p>,
    onFailure: (error) => (
      <p role="alert" className="px-2">
        {error._tag}
      </p>
    ),
    onSuccess: ({ message, userId, username }) => (
      <p className="px-2">
        Signed in as <span data-testid="username">{username}</span>
        <span hidden data-testid="message">
          {message}
        </span>
        <span hidden data-testid="user-id">
          {userId}
        </span>
      </p>
    ),
  });
}

function SignedInLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  useRefuseStrayFileDrops();

  if (isLoading) {
    return <p className="p-6 text-sm">Loading…</p>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/sign-in" />;
  }

  return (
    <SidebarProvider className="text-sm">
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
