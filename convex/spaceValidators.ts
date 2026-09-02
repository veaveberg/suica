import { v } from "convex/values";

export const minuteRangeValidator = v.object({ start: v.number(), end: v.number() });

export const workingHoursValidator = v.object({
    sunday: v.union(v.null(), minuteRangeValidator),
    monday: v.union(v.null(), minuteRangeValidator),
    tuesday: v.union(v.null(), minuteRangeValidator),
    wednesday: v.union(v.null(), minuteRangeValidator),
    thursday: v.union(v.null(), minuteRangeValidator),
    friday: v.union(v.null(), minuteRangeValidator),
    saturday: v.union(v.null(), minuteRangeValidator),
});
