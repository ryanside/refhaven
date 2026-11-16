import { RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import groupLayer from "../../canvasPlain.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../canvasPlain.spec")["default"]>(databaseSchema, groupLayer);
