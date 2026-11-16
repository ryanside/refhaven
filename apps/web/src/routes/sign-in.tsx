import { useSignInWithUsernamePasskey } from "@convex-dev/auth/methods/username-passkey/react";
import { api } from "@refhaven/backend/api";
import { Button } from "@refhaven/ui/components/button";
import { Input } from "@refhaven/ui/components/input";
import { Label } from "@refhaven/ui/components/label";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useState } from "react";

export const Route = createFileRoute("/sign-in")({
  ssr: false,
  component: SignIn,
});

function SignIn() {
  const { isAuthenticated } = useConvexAuth();
  const { signIn, pending, autofill } = useSignInWithUsernamePasskey(api.session);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Navigate to="/library" />;
  }

  const shownError = error ?? autofill.lastError?.error ?? null;

  return (
    <main className="p-6 text-sm">
      <form
        className="flex max-w-xs flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          const result = await signIn({ username });
          if (result.status !== "complete") {
            setError(result.userError.error);
          }
        }}
      >
        <h1 className="font-medium">Sign in</h1>
        <p>
          A new username creates an account with a passkey. An existing username asks for its
          passkey.
        </p>
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username webauthn"
          required
          disabled={pending}
        />
        {shownError ? <p role="alert">{shownError}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Waiting for your passkey…" : "Continue with a passkey"}
        </Button>
      </form>
    </main>
  );
}
