import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import groupLayer from "../../trash.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../trash.spec")["default"]>(databaseSchema, groupLayer);

export default {
["purgeBatch"]: RegisteredConvexFunction.register({ ...definitions["purgeBatch"], handler: forward(definitions["purgeBatch"].handler) }),
["purge"]: RegisteredConvexFunction.register({ ...definitions["purge"], handler: forward(definitions["purge"].handler) }),
["sweepBatch"]: RegisteredConvexFunction.register({ ...definitions["sweepBatch"], handler: forward(definitions["sweepBatch"].handler) }),
["sweepDone"]: RegisteredConvexFunction.register({ ...definitions["sweepDone"], handler: forward(definitions["sweepDone"].handler) }),
["sweep"]: RegisteredConvexFunction.register({ ...definitions["sweep"], handler: forward(definitions["sweep"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../trash.spec")["default"]>;
