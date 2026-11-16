import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Layer from "effect/Layer";
import databaseSchema from "./_generated/schema";
import * as fns from "./session";
import session from "./session.spec";

export default GroupImpl.make(databaseSchema, session).pipe(
  Layer.provide(FunctionImpl.make(databaseSchema, session, "signOut", fns.signOut)),
  Layer.provide(FunctionImpl.make(databaseSchema, session, "refreshSession", fns.refreshSession)),
  Layer.provide(FunctionImpl.make(databaseSchema, session, "isAuthenticated", fns.isAuthenticated)),
  Layer.provide(
    FunctionImpl.make(
      databaseSchema,
      session,
      "startSignInWithUsernamePasskey",
      fns.startSignInWithUsernamePasskey,
    ),
  ),
  Layer.provide(
    FunctionImpl.make(
      databaseSchema,
      session,
      "startAutofillSignInWithUsernamePasskey",
      fns.startAutofillSignInWithUsernamePasskey,
    ),
  ),
  Layer.provide(
    FunctionImpl.make(
      databaseSchema,
      session,
      "finishSignUpWithUsernamePasskey",
      fns.finishSignUpWithUsernamePasskey,
    ),
  ),
  Layer.provide(
    FunctionImpl.make(
      databaseSchema,
      session,
      "finishSignInWithUsernamePasskey",
      fns.finishSignInWithUsernamePasskey,
    ),
  ),
  GroupImpl.finalize,
);
