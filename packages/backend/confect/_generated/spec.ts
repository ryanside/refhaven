import { GroupSpec, Spec } from "@confect/core";
import canvas from "../canvas.spec";
import canvasPlain from "../canvasPlain.spec";
import images from "../images.spec";
import session from "../session.spec";
import users from "../users.spec";
import workspaces from "../workspaces.spec";

const spec: Spec.Spec<{
  readonly canvas: GroupSpec.NamedAt<typeof canvas, "canvas">;
  readonly canvasPlain: GroupSpec.NamedAt<typeof canvasPlain, "canvasPlain">;
  readonly images: GroupSpec.NamedAt<typeof images, "images">;
  readonly session: GroupSpec.NamedAt<typeof session, "session">;
  readonly users: GroupSpec.NamedAt<typeof users, "users">;
  readonly workspaces: GroupSpec.NamedAt<typeof workspaces, "workspaces">;
}> = Spec.fromGroups({
  ["canvas"]: canvas,
  ["canvasPlain"]: canvasPlain,
  ["images"]: images,
  ["session"]: session,
  ["users"]: users,
  ["workspaces"]: workspaces,
}) as typeof spec;

export default spec;
