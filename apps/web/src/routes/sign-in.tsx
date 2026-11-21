import { useSignInWithUsernamePasskey } from "@convex-dev/auth/methods/username-passkey/react";
import { Alert02Icon, FingerPrintIcon } from "@hugeicons/core-free-icons";
import { api } from "@refhaven/backend/api";
import { Button } from "@refhaven/ui/components/button";
import { Icon } from "@refhaven/ui/components/icon";
import { Spinner } from "@refhaven/ui/components/spinner";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useRef, useState } from "react";
import { Mark } from "@/shell/mark";
import { ThemeMenu, pillClass } from "@/shell/top-bar";

export const Route = createFileRoute("/sign-in")({
  ssr: false,
  component: SignIn,
});

type SignInResult = Awaited<ReturnType<ReturnType<typeof useSignInWithUsernamePasskey>["signIn"]>>;
type PasskeyCode = Extract<SignInResult, { userError: unknown }>["userError"]["error"];

const passkeyMessages: Record<PasskeyCode, string> = {
  PROTOCOL_ERROR: "The sign-in could not finish. Try again.",
  UNKNOWN_CREDENTIAL:
    "This passkey is not registered here. Choose another, or enter a new username.",
  CHALLENGE_EXPIRED: "The passkey request timed out. Try again.",
  CEREMONY_ABORTED: "The passkey request was cancelled.",
  PASSKEY_ALREADY_REGISTERED: "This passkey is already registered. Sign in with its username.",
  WEBAUTHN_UNSUPPORTED: "This browser cannot use passkeys.",
  OTHER_ERROR: "Something went wrong with the passkey. Try again.",
  ALREADY_PENDING: "A passkey request is already open.",
  USERNAME_TOO_SHORT: "This username is too short.",
  USERNAME_TOO_LONG: "This username is too long.",
  USERNAME_HAS_SURROUNDING_WHITESPACE: "Remove the spaces around the username.",
  USERNAME_HAS_INVALID_CHARACTERS: "This username has characters that are not allowed.",
  USERNAME_TAKEN: "This username is taken. Try another.",
};

/** Autofill starts on its own when the page opens, so a failure the person did not cause stays quiet. */
const quietAutofill = new Set<PasskeyCode>([
  "CEREMONY_ABORTED",
  "OTHER_ERROR",
  "WEBAUTHN_UNSUPPORTED",
]);

function SignIn() {
  const { isAuthenticated } = useConvexAuth();
  const { signIn, pending, autofill } = useSignInWithUsernamePasskey(api.session);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<PasskeyCode | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  if (isAuthenticated) {
    return <Navigate to="/library" />;
  }

  const autofillError =
    autofill.lastError && !quietAutofill.has(autofill.lastError.error)
      ? autofill.lastError.error
      : null;
  const shownError = error ?? autofillError;

  return (
    <div className="min-h-svh">
      <header className="fixed inset-x-0 top-0 z-10 flex h-[68px] items-center justify-between px-gutter">
        <span className="flex items-center gap-2 text-[16px] font-[640] tracking-[-0.03em]">
          <Mark className="size-6" />
          refhaven
        </span>
        <div className={pillClass}>
          <ThemeMenu />
        </div>
      </header>
      <main className="grid min-h-svh place-items-center overflow-x-clip px-gutter py-24">
        <div className="-mt-6 grid w-full justify-items-center text-center">
          <Fan />
          <h1 className="text-[44px] leading-[50px] font-[640] tracking-[-0.042em] text-balance max-sm:text-[34px] max-sm:leading-[40px]">
            Your private reference library.
          </h1>
          <p className="mt-4 max-w-[52ch] text-[17px] leading-[26px] tracking-[-0.012em] text-pretty text-ink-2">
            Save the images you want to look at again, and arrange them your way.
          </p>
          <form
            className="mt-10 flex w-full max-w-[520px] items-center gap-2 rounded-[34px] bg-surface py-2.5 pr-2.5 pl-[26px] text-left shadow-float-lg has-[input:focus]:shadow-[var(--float-lg),inset_0_0_0_1.5px_var(--ink)] max-sm:flex-col max-sm:items-stretch max-sm:rounded-[28px] max-sm:p-3 max-sm:pl-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              const result = await signIn({ username });
              if (result.status !== "complete") {
                setError(result.userError.error);
                button.current?.focus();
              }
            }}
          >
            <input
              name="username"
              aria-label="Username"
              placeholder="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoFocus
              autoComplete="username webauthn"
              autoCapitalize="none"
              spellCheck={false}
              required
              readOnly={pending}
              className="h-12 min-w-0 flex-1 bg-transparent text-[16px] font-[500] text-ink outline-none placeholder:font-[450] placeholder:text-ink-2 read-only:text-ink-2 max-sm:px-3"
            />
            <Button
              ref={button}
              type="submit"
              disabled={pending}
              className="h-12 shrink-0 gap-2.5 pr-5 pl-4 text-[15px] disabled:opacity-100"
            >
              {pending ? <Spinner /> : <Icon icon={FingerPrintIcon} size={18} />}
              {pending ? "Waiting for your passkey…" : "Continue with a passkey"}
            </Button>
          </form>
          {shownError ? (
            <p role="alert" className="mt-4 flex items-center gap-2 text-[14px] text-bad">
              <Icon icon={Alert02Icon} size={16} />
              {passkeyMessages[shownError]}
            </p>
          ) : (
            <p className="mt-5 text-[13px] text-ink-2">
              A new username creates your account. An existing one asks for its passkey.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function Fan() {
  const print =
    "absolute top-3 left-1/2 h-[156px] w-[116px] origin-[50%_260%] overflow-hidden rounded-[4px] shadow-print";
  const at = (rotate: number) => ({ transform: `translateX(-50%) rotate(${rotate}deg)` });
  return (
    <div aria-hidden className="relative mb-9 h-[188px] w-full max-w-[420px] max-sm:scale-[0.8]">
      <div
        className={print}
        style={{
          ...at(-18),
          background:
            "radial-gradient(120% 80% at 70% 10%, #dfe6ff 0%, transparent 55%), linear-gradient(160deg, #3f63e6 0%, #8fa8ff 55%, #c9d4ff 100%)",
        }}
      />
      <div
        className={print}
        style={{
          ...at(18),
          background: "linear-gradient(170deg, #20402f 0%, #163223 100%)",
        }}
      >
        <span className="absolute right-3 bottom-4 left-3 h-px bg-[#efe6cf]/30" />
        <span className="absolute right-3 bottom-7 left-3 h-px bg-[#efe6cf]/20" />
      </div>
      <div
        className={print}
        style={{
          ...at(-9),
          background:
            "radial-gradient(90% 60% at 30% 20%, #c8f5d4 0%, transparent 60%), linear-gradient(165deg, #2f9e5b 0%, #6fd39a 60%, #d7f7e2 100%)",
        }}
      />
      <div
        className={print}
        style={{
          ...at(9),
          background:
            "radial-gradient(80% 70% at 30% 75%, #ffd9c7 0%, transparent 60%), linear-gradient(160deg, #f05a3c 0%, #ff8c6b 50%, #ffc2a8 100%)",
        }}
      />
      <div className={`${print} bg-[#efebe2]`} style={at(0)}>
        <span className="absolute top-3 right-3 left-3 text-left text-[26px] leading-[24px] font-[760] tracking-[-0.06em] text-[#171715]">
          Look again.
        </span>
        <span className="absolute right-[-14px] bottom-[26px] size-[58px] rounded-full bg-[#e5484d]" />
        <span className="absolute right-3 bottom-3 left-3 h-px bg-[#171715]/25" />
      </div>
    </div>
  );
}
