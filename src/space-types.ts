import type { FunctionReturnType } from "convex/server";
import type { api } from "../convex/_generated/api";

export type ManagedSpace = FunctionReturnType<typeof api.spaces.listManaged>[number];
export type WorkingHours = ManagedSpace["workingHours"];
export type WeekdayKey = keyof WorkingHours;
export type AvailabilityResult = NonNullable<FunctionReturnType<typeof api.spaces.getManagedAvailability>>;
export type PublicAvailabilityResult = NonNullable<FunctionReturnType<typeof api.spaces.getPublicAvailability>>;
export type AvailabilityDay = Extract<AvailabilityResult, { kind: "ready" }>["days"][number];
export type ManagedSpaceEvent = NonNullable<Extract<AvailabilityResult, { kind: "ready" }>["events"]>[number];
