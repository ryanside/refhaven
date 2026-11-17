import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import groupLayer from "../../library.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../library.spec")["default"]>(databaseSchema, groupLayer);

export default {
["prepareUpload"]: RegisteredConvexFunction.register({ ...definitions["prepareUpload"], handler: forward(definitions["prepareUpload"].handler) }),
["save"]: RegisteredConvexFunction.register({ ...definitions["save"], handler: forward(definitions["save"].handler) }),
["record"]: RegisteredConvexFunction.register({ ...definitions["record"], handler: forward(definitions["record"].handler) }),
["list"]: RegisteredConvexFunction.register({ ...definitions["list"], handler: forward(definitions["list"].handler) }),
["urls"]: RegisteredConvexFunction.register({ ...definitions["urls"], handler: forward(definitions["urls"].handler) }),
["remove"]: RegisteredConvexFunction.register({ ...definitions["remove"], handler: forward(definitions["remove"].handler) }),
["restore"]: RegisteredConvexFunction.register({ ...definitions["restore"], handler: forward(definitions["restore"].handler) }),
["trash"]: RegisteredConvexFunction.register({ ...definitions["trash"], handler: forward(definitions["trash"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../library.spec")["default"]>;
