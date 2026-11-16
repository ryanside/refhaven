import { FunctionSpec, GroupSpec } from "@confect/core";
import type {
  finishSignInWithUsernamePasskey,
  finishSignUpWithUsernamePasskey,
  isAuthenticated,
  refreshSession,
  signOut,
  startAutofillSignInWithUsernamePasskey,
  startSignInWithUsernamePasskey,
} from "./session";

export default GroupSpec.make()
  .addFunction(FunctionSpec.convexPublicMutation<typeof signOut>()("signOut"))
  .addFunction(
    FunctionSpec.convexPublicMutation<typeof refreshSession>()(
      "refreshSession",
    ),
  )
  .addFunction(
    FunctionSpec.convexPublicQuery<typeof isAuthenticated>()("isAuthenticated"),
  )
  .addFunction(
    FunctionSpec.convexPublicMutation<typeof startSignInWithUsernamePasskey>()(
      "startSignInWithUsernamePasskey",
    ),
  )
  .addFunction(
    FunctionSpec.convexPublicMutation<
      typeof startAutofillSignInWithUsernamePasskey
    >()("startAutofillSignInWithUsernamePasskey"),
  )
  .addFunction(
    FunctionSpec.convexPublicMutation<typeof finishSignUpWithUsernamePasskey>()(
      "finishSignUpWithUsernamePasskey",
    ),
  )
  .addFunction(
    FunctionSpec.convexPublicMutation<typeof finishSignInWithUsernamePasskey>()(
      "finishSignInWithUsernamePasskey",
    ),
  );
