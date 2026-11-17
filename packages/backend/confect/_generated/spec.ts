import { GroupSpec, Spec } from "@confect/core";
import canvas from "../canvas.spec";
import collections from "../collections.spec";
import library from "../library.spec";
import ref from "../ref.spec";
import session from "../session.spec";
import users from "../users.spec";
import workspaces from "../workspaces.spec";

const spec: Spec.Spec<{
  readonly canvas: GroupSpec.NamedAt<typeof canvas, "canvas">;
  readonly collections: GroupSpec.NamedAt<typeof collections, "collections">;
  readonly library: GroupSpec.NamedAt<typeof library, "library">;
  readonly ref: GroupSpec.NamedAt<typeof ref, "ref">;
  readonly session: GroupSpec.NamedAt<typeof session, "session">;
  readonly users: GroupSpec.NamedAt<typeof users, "users">;
  readonly workspaces: GroupSpec.NamedAt<typeof workspaces, "workspaces">;
}> = Spec.fromGroups({
  ["canvas"]: canvas,
  ["collections"]: collections,
  ["library"]: library,
  ["ref"]: ref,
  ["session"]: session,
  ["users"]: users,
  ["workspaces"]: workspaces,
}) as typeof spec;

export default spec;
