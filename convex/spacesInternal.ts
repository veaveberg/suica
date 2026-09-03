import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const getSyncTarget = internalQuery({
    args: { spaceId: v.id("spaces") },
    handler: async (ctx, args) => {
        const space = await ctx.db.get(args.spaceId);
        if (!space || space.status !== "active") return null;
        return {
            id: space._id,
            calendarSourceEnvKey: space.calendarSourceEnvKey,
            minimumAvailabilityMinutes: space.minimumAvailabilityMinutes,
            timeZone: space.timeZone,
            workingHours: space.workingHours,
            activeRevision: space.activeRevision,
            availabilitySnapshotHash: space.availabilitySnapshotHash,
        };
    },
});

export const listActiveSpaceIds = internalQuery({
    args: {},
    handler: async ctx => {
        const spaces = await ctx.db.query("spaces").collect();
        return spaces.filter(space => space.status === "active").map(space => space._id);
    },
});

export const markSyncing = internalMutation({
    args: { spaceId: v.id("spaces") },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.spaceId, { syncState: "syncing", lastSyncError: undefined });
    },
});

export const writeAvailabilityBatch = internalMutation({
    args: {
        spaceId: v.id("spaces"),
        revision: v.string(),
        days: v.array(v.object({ date: v.string(), windows: v.array(v.object({ start: v.number(), end: v.number() })) })),
    },
    handler: async (ctx, args) => {
        for (const day of args.days) await ctx.db.insert("space_availability_days", { spaceId: args.spaceId, revision: args.revision, ...day });
    },
});

export const writeEventsBatch = internalMutation({
    args: { spaceId: v.id("spaces"), revision: v.string(), events: v.array(v.object({ start: v.number(), end: v.number(), title: v.string(), allDay: v.boolean() })) },
    handler: async (ctx, args) => {
        for (const event of args.events) await ctx.db.insert("space_calendar_events", { spaceId: args.spaceId, revision: args.revision, ...event });
    },
});

export const activateRevision = internalMutation({
    args: { spaceId: v.id("spaces"), revision: v.string(), snapshotHash: v.string(), startDate: v.string(), endDate: v.string() },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.spaceId, {
            activeRevision: args.revision,
            availabilitySnapshotHash: args.snapshotHash,
            availabilityStartDate: args.startDate,
            availabilityEndDate: args.endDate,
            syncState: "ready",
            lastSyncedAt: Date.now(),
            lastSyncError: undefined,
        });
    },
});

// A calendar poll that produces the same availability does not need a new
// revision. Keeping the existing revision avoids rewriting and then deleting
// the entire availability horizon on every poll.
export const completeUnchangedSync = internalMutation({
    args: { spaceId: v.id("spaces"), startDate: v.string(), endDate: v.string() },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.spaceId, {
            availabilityStartDate: args.startDate,
            availabilityEndDate: args.endDate,
            syncState: "ready",
            lastSyncedAt: Date.now(),
            lastSyncError: undefined,
        });
    },
});

export const deleteOldAvailabilityBatch = internalMutation({
    args: { spaceId: v.id("spaces"), activeRevision: v.string() },
    handler: async (ctx, args) => {
        const oldDays = await ctx.db
            .query("space_availability_days")
            .withIndex("by_space_revision", q => q.eq("spaceId", args.spaceId))
            .filter(q => q.neq(q.field("revision"), args.activeRevision))
            .take(100);
        for (const day of oldDays) await ctx.db.delete(day._id);
        return oldDays.length;
    },
});

export const deleteOldEventsBatch = internalMutation({
    args: { spaceId: v.id("spaces"), activeRevision: v.string() },
    handler: async (ctx, args) => {
        const oldEvents = await ctx.db.query("space_calendar_events").withIndex("by_space_revision", q => q.eq("spaceId", args.spaceId)).filter(q => q.neq(q.field("revision"), args.activeRevision)).take(100);
        for (const event of oldEvents) await ctx.db.delete(event._id);
        return oldEvents.length;
    },
});

export const markSyncError = internalMutation({
    args: { spaceId: v.id("spaces") },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.spaceId, { syncState: "error", lastSyncError: "Calendar synchronization failed" });
    },
});
