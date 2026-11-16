import { setupUsernamePasskey } from "@convex-dev/auth/methods/username-passkey/server";
import { setupConvexAuth } from "@convex-dev/auth/server";
import { internal } from "../convex/_generated/api";
import { components } from "./_generated/components";

const auth = setupConvexAuth({ component: components.auth });

export const { signOut, refreshSession, isAuthenticated } = auth;

export const {
  startSignInWithUsernamePasskey,
  startAutofillSignInWithUsernamePasskey,
  finishSignUpWithUsernamePasskey,
  finishSignInWithUsernamePasskey,
} = setupUsernamePasskey(auth, {
  component: components.authPasskey,
  usernameComponent: components.authUsername,
  rpId: process.env.AUTH_RP_ID ?? "localhost",
  origin: process.env.AUTH_ORIGIN ?? "http://localhost:3000",
}).attachUserCallbacks({ createUser: internal.users.createUser });
