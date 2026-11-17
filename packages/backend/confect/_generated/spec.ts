import { GroupSpec, Spec } from "@confect/core";
import canvas from "../canvas.spec";
import collections from "../collections.spec";
import library from "../library.spec";
import ref from "../ref.spec";
import search from "../search.spec";
import session from "../session.spec";
import trash from "../trash.spec";
import users from "../users.spec";
import workspaces from "../workspaces.spec";

const spec: Spec.Spec<{
  readonly canvas: GroupSpec.NamedAt<typeof canvas, "canvas">;
  readonly collections: GroupSpec.NamedAt<typeof collections, "collections">;
  readonly library: GroupSpec.NamedAt<typeof library, "library">;
  readonly ref: GroupSpec.NamedAt<typeof ref, "ref">;
  readonly search: GroupSpec.NamedAt<typeof search, "search">;
  readonly session: GroupSpec.NamedAt<typeof session, "session">;
  readonly trash: GroupSpec.NamedAt<typeof trash, "trash">;
  readonly users: GroupSpec.NamedAt<typeof users, "users">;
  readonly workspaces: GroupSpec.NamedAt<typeof workspaces, "workspaces">;
}> = Spec.fromGroups({
  ["canvas"]: canvas,
  ["collections"]: collections,
  ["library"]: library,
  ["ref"]: ref,
  ["search"]: search,
  ["session"]: session,
  ["trash"]: trash,
  ["users"]: users,
  ["workspaces"]: workspaces,
}) as typeof spec;

export default spec;
