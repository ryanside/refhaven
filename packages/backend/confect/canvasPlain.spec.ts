import { FunctionSpec, GroupSpec } from "@confect/core";
import type { items } from "./canvasPlain";

export default GroupSpec.make().addFunction(
  FunctionSpec.convexPublicQuery<typeof items>()("items"),
);
