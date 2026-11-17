import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import groupLayer from "../../collections.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../collections.spec")["default"]>(databaseSchema, groupLayer);

export default {
["create"]: RegisteredConvexFunction.register({ ...definitions["create"], handler: forward(definitions["create"].handler) }),
["list"]: RegisteredConvexFunction.register({ ...definitions["list"], handler: forward(definitions["list"].handler) }),
["rename"]: RegisteredConvexFunction.register({ ...definitions["rename"], handler: forward(definitions["rename"].handler) }),
["addRefs"]: RegisteredConvexFunction.register({ ...definitions["addRefs"], handler: forward(definitions["addRefs"].handler) }),
["removeRefs"]: RegisteredConvexFunction.register({ ...definitions["removeRefs"], handler: forward(definitions["removeRefs"].handler) }),
["refs"]: RegisteredConvexFunction.register({ ...definitions["refs"], handler: forward(definitions["refs"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../collections.spec")["default"]>;
