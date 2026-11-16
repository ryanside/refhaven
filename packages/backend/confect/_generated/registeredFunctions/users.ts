import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import groupLayer from "../../users.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../users.spec")["default"]>(databaseSchema, groupLayer);

export default {
["createUser"]: RegisteredConvexFunction.register({ ...definitions["createUser"], handler: forward(definitions["createUser"].handler) }),
["whoAmI"]: RegisteredConvexFunction.register({ ...definitions["whoAmI"], handler: forward(definitions["whoAmI"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../users.spec")["default"]>;
