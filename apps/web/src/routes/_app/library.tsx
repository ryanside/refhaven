import { QueryResult, useQuery } from "@confect/react";
import refs from "@refhaven/backend/refs";
import { createFileRoute } from "@tanstack/react-router";

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
    </main>
  );
}
