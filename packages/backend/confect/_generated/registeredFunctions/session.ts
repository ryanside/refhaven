import { RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import groupLayer from "../../session.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../session.spec")["default"]>(databaseSchema, groupLayer);
