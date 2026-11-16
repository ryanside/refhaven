import { GroupSpec, Spec } from "@confect/core";
import canvas from "../canvas.spec";
import canvasPlain from "../canvasPlain.spec";
import session from "../session.spec";
import users from "../users.spec";

const spec: Spec.Spec<{
  readonly canvas: GroupSpec.NamedAt<typeof canvas, "canvas">;
  readonly canvasPlain: GroupSpec.NamedAt<typeof canvasPlain, "canvasPlain">;
  readonly session: GroupSpec.NamedAt<typeof session, "session">;
  readonly users: GroupSpec.NamedAt<typeof users, "users">;
}> = Spec.fromGroups({
  ["canvas"]: canvas,
  ["canvasPlain"]: canvasPlain,
  ["session"]: session,
  ["users"]: users,
}) as typeof spec;

export default spec;
