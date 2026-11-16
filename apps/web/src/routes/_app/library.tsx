import { QueryResult, useQuery } from "@confect/react";
import refs from "@refhaven/backend/refs";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/library")({ component: Library });

function Library() {
  const me = useQuery(refs.public.users.whoAmI, { greeting: "Hello" });

  return (
    <main className="p-6">
      <h1 className="font-medium">Library</h1>
      {QueryResult.match(me, {
        onLoading: () => <p>Loading…</p>,
        onFailure: (error) => <p role="alert">{error._tag}</p>,
        onSuccess: ({ message, userId, username }) => (
          <dl>
            <dt>Message</dt>
            <dd data-testid="message">{message}</dd>
            <dt>Username</dt>
            <dd data-testid="username">{username}</dd>
            <dt>User ID</dt>
            <dd data-testid="user-id">{userId}</dd>
          </dl>
        ),
      })}
      <h2 className="mt-4 font-medium">Lab</h2>
      <ul>
        <li>
          <Link to="/lab/canvas-sync" search={{ mode: "live" }} className="underline">
            Canvas sync with 1,000 items
          </Link>
        </li>
        <li>
          <Link to="/lab/texture" className="underline">
            R2 image as a WebGL texture
          </Link>
        </li>
      </ul>
    </main>
  );
}
