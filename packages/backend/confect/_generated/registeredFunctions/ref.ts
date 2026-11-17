import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import groupLayer from "../../ref.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../ref.spec")["default"]>(databaseSchema, groupLayer);

export default {
["get"]: RegisteredConvexFunction.register({ ...definitions["get"], handler: forward(definitions["get"].handler) }),
["update"]: RegisteredConvexFunction.register({ ...definitions["update"], handler: forward(definitions["update"].handler) }),
["addTags"]: RegisteredConvexFunction.register({ ...definitions["addTags"], handler: forward(definitions["addTags"].handler) }),
["removeTags"]: RegisteredConvexFunction.register({ ...definitions["removeTags"], handler: forward(definitions["removeTags"].handler) }),
["tags"]: RegisteredConvexFunction.register({ ...definitions["tags"], handler: forward(definitions["tags"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../ref.spec")["default"]>;
