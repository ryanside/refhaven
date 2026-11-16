import { GroupSpec, Spec } from "@confect/core";
import session from "../session.spec";
import users from "../users.spec";

const spec: Spec.Spec<{
  readonly session: GroupSpec.NamedAt<typeof session, "session">;
  readonly users: GroupSpec.NamedAt<typeof users, "users">;
}> = Spec.fromGroups({
  ["session"]: session,
  ["users"]: users,
}) as typeof spec;

export default spec;
