import { GroupSpec, Spec } from "@confect/core";
import canvas from "../canvas.spec";
import library from "../library.spec";
import session from "../session.spec";
import users from "../users.spec";
import workspaces from "../workspaces.spec";

const spec: Spec.Spec<{
  readonly canvas: GroupSpec.NamedAt<typeof canvas, "canvas">;
  readonly library: GroupSpec.NamedAt<typeof library, "library">;
  readonly session: GroupSpec.NamedAt<typeof session, "session">;
  readonly users: GroupSpec.NamedAt<typeof users, "users">;
  readonly workspaces: GroupSpec.NamedAt<typeof workspaces, "workspaces">;
}> = Spec.fromGroups({
  ["canvas"]: canvas,
  ["library"]: library,
  ["session"]: session,
  ["users"]: users,
  ["workspaces"]: workspaces,
}) as typeof spec;

export default spec;
