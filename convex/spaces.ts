import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { addDaysToDateKey, addMonthsToDateKey, countDateKeysInclusive, dateKeyInTimeZone, isWorkingHours, localMinuteToEpochMs } from "./spaceAvailability";
import { workingHoursValidator } from "./spaceValidators";
import { getUser } from "./permissions";

const MAX_PUBLIC_DAYS = 432;
const FRESHNESS_MS = 30 * 60 * 1000;

async function canManageSpace(ctx: QueryCtx | MutationCtx, user: Doc<"users">, spaceId: Id<"spaces">): Promise<boolean> {
    if (user.role === "admin") return true;
    const membership = await ctx.db
        .query("space_managers")
        .withIndex("by_user_space", q => q.eq("userId", user._id).eq("spaceId", spaceId))
        .first();
    return membership !== null;
}

function summary(space: Doc<"spaces">) {
    return {
        id: space._id,
        name: space.name,
        slug: space.slug,
        logoPath: space.logoPath,
        color: space.color,
        timeZone: space.timeZone,
        publicToken: space.publicToken,
        workingHours: space.workingHours,
        syncState: space.syncState,
        lastSyncedAt: space.lastSyncedAt,
        status: space.status,
    };
}

function nextPublicAvailabilityStart(now: number, timeZone: string): number {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const minute = Number(values.hour) * 60 + Number(values.minute);
    const roundedMinute = Math.ceil(minute / 30) * 30;
    const date = dateKeyInTimeZone(new Date(now), timeZone);
    return roundedMinute === 24 * 60
        ? localMinuteToEpochMs(addDaysToDateKey(date, 1), 0, timeZone)
        : localMinuteToEpochMs(date, roundedMinute, timeZone);
}

async function loadAvailability(ctx: QueryCtx, space: Doc<"spaces">, startDate: string, endDate: string, includeEvents = false, minimumWindowStart?: number) {
    const dayCount = countDateKeysInclusive(startDate, endDate);
    if (dayCount > MAX_PUBLIC_DAYS) throw new Error("Date range is too large");
    const lastSyncedAt = space.lastSyncedAt;
    const isFresh = lastSyncedAt !== undefined && Date.now() - lastSyncedAt <= FRESHNESS_MS;
    const withinHorizon = space.availabilityStartDate !== undefined
        && space.availabilityEndDate !== undefined
        && startDate >= space.availabilityStartDate
        && endDate <= space.availabilityEndDate;

    const publicSpace = {
        name: space.name,
        logoPath: space.logoPath,
        color: space.color,
        timeZone: space.timeZone,
        workingHours: space.workingHours,
    };

    if (!space.activeRevision || !isFresh || !withinHorizon || space.syncState === "error") {
        return { kind: "unavailable" as const, space: publicSpace };
    }
    const revision = space.activeRevision;

    const days = await ctx.db
        .query("space_availability_days")
        .withIndex("by_space_revision_date", q => q
            .eq("spaceId", space._id)
            .eq("revision", revision)
            .gte("date", startDate)
            .lte("date", endDate))
        .collect();
    const events = includeEvents ? await ctx.db.query("space_calendar_events").withIndex("by_space_revision", q => q.eq("spaceId", space._id).eq("revision", revision)).filter(q => q.lt(q.field("start"), Date.parse(`${endDate}T23:59:59Z`)) && q.gt(q.field("end"), Date.parse(`${startDate}T00:00:00Z`))).collect() : undefined;
    return {
        kind: "ready" as const,
        space: publicSpace,
        days: days.map(day => ({ date: day.date, windows: minimumWindowStart === undefined ? day.windows : day.windows.flatMap(window => window.end > minimumWindowStart ? [{ ...window, start: Math.max(window.start, minimumWindowStart) }] : []) })),
        lastSyncedAt,
        isUpdating: space.syncState === "pending" || space.syncState === "syncing",
        ...(includeEvents ? { events: events?.map(event => ({ start: event.start, end: event.end, title: event.title, allDay: event.allDay })) ?? [] } : {}),
    };
}

export const listManaged = query({
    args: { userId: v.id("users"), authToken: v.string() },
    handler: async (ctx, args) => {
        const user = await getUser(ctx, args.userId, args.authToken);
        if (user.role === "admin") {
            const spaces = await ctx.db.query("spaces").collect();
            return spaces.filter(space => space.status === "active").map(summary);
        }
        const memberships = await ctx.db.query("space_managers").withIndex("by_user", q => q.eq("userId", user._id)).collect();
        const spaces = await Promise.all(memberships.map(membership => ctx.db.get(membership.spaceId)));
        return spaces.flatMap(space => space?.status === "active" ? [summary(space)] : []);
    },
});

export const updateWorkingHours = mutation({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
        spaceId: v.id("spaces"),
        workingHours: workingHoursValidator,
    },
    handler: async (ctx, args) => {
        const user = await getUser(ctx, args.userId, args.authToken);
        const space = await ctx.db.get(args.spaceId);
        if (!space || !(await canManageSpace(ctx, user, args.spaceId))) throw new Error("Space not found");
        if (!isWorkingHours(args.workingHours)) throw new Error("Invalid working hours");
        await ctx.db.patch(space._id, {
            workingHours: args.workingHours,
            syncState: "pending",
            activeRevision: undefined,
            lastSyncError: undefined,
        });
        await ctx.scheduler.runAfter(0, internal.spaceSync.syncSpace, { spaceId: space._id });
    },
});

export const getManagedAvailability = query({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
        spaceId: v.id("spaces"),
        startDate: v.string(),
        endDate: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await getUser(ctx, args.userId, args.authToken);
        const space = await ctx.db.get(args.spaceId);
        if (!space || !(await canManageSpace(ctx, user, args.spaceId))) return null;
        return await loadAvailability(ctx, space, args.startDate, args.endDate, true);
    },
});

export const getPublicAvailability = query({
    args: { publicToken: v.string(), startDate: v.string(), endDate: v.string() },
    handler: async (ctx, args) => {
        const space = await ctx.db.query("spaces").withIndex("by_slug", q => q.eq("slug", args.publicToken)).first()
            ?? await ctx.db.query("spaces").withIndex("by_public_token", q => q.eq("publicToken", args.publicToken)).first();
        if (!space || space.status !== "active") return null;
        const now = Date.now();
        const today = dateKeyInTimeZone(new Date(now), space.timeZone);
        const publicEndDate = addMonthsToDateKey(today, 2);
        if (args.endDate < today || args.startDate > publicEndDate) return null;
        return await loadAvailability(ctx, space, args.startDate < today ? today : args.startDate, args.endDate > publicEndDate ? publicEndDate : args.endDate, false, nextPublicAvailabilityStart(now, space.timeZone));
    },
});

export const getPublicSpace = query({
    args: { publicToken: v.string() },
    handler: async (ctx, args) => {
        const space = await ctx.db.query("spaces").withIndex("by_slug", q => q.eq("slug", args.publicToken)).first()
            ?? await ctx.db.query("spaces").withIndex("by_public_token", q => q.eq("publicToken", args.publicToken)).first();
        if (!space || space.status !== "active") return null;
        return { name: space.name, logoPath: space.logoPath, color: space.color, timeZone: space.timeZone };
    },
});
