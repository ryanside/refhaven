import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import groupLayer from "../../canvas.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../canvas.spec")["default"]>(databaseSchema, groupLayer);

export default {
["seed"]: RegisteredConvexFunction.register({ ...definitions["seed"], handler: forward(definitions["seed"].handler) }),
["items"]: RegisteredConvexFunction.register({ ...definitions["items"], handler: forward(definitions["items"].handler) }),
["itemsSince"]: RegisteredConvexFunction.register({ ...definitions["itemsSince"], handler: forward(definitions["itemsSince"].handler) }),
["moveItems"]: RegisteredConvexFunction.register({ ...definitions["moveItems"], handler: forward(definitions["moveItems"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../canvas.spec")["default"]>;
