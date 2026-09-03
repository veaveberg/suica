"use node";

import ical, { type VEvent } from "node-ical";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { addDaysToDateKey, calculateAvailability, dateKeyInTimeZone, type AvailabilityDay, type BusyInterval } from "./spaceAvailability";

declare const process: { env: Record<string, string | undefined> };

const SYNC_PAST_DAYS = 31;
const SYNC_FUTURE_DAYS = 400;
const WRITE_BATCH_SIZE = 40;
const MINIMUM_AVAILABILITY_MINUTES = 60;

type CalendarEvent = { start: number; end: number; title: string; allDay: boolean };

async function availabilitySnapshotHash(days: readonly AvailabilityDay[], events: readonly CalendarEvent[]): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify({ days, events }));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function calendarUrlFromEnvironment(environmentKey: string): string {
    const value = process.env[environmentKey];
    if (!value) throw new Error("Calendar source is not configured");
    const url = new URL(value.replace(/^webcal:\/\//i, "https://"));
    if (url.protocol !== "https:" || url.hostname !== "calendar.google.com") throw new Error("Calendar source must be a private Google Calendar URL");
    return url.toString();
}

function isBusyEvent(event: VEvent): boolean {
    return event.status !== "CANCELLED" && event.transparency !== "TRANSPARENT";
}

async function fetchBusyIntervals(url: string, from: Date, to: Date): Promise<{ intervals: BusyInterval[]; events: CalendarEvent[] }> {
    const response = await fetch(url, {
        headers: { Accept: "text/calendar" },
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("Calendar fetch failed");
    const body = await response.text();
    if (!body.includes("BEGIN:VCALENDAR")) throw new Error("Calendar response is invalid");
    const calendar = await ical.async.parseICS(body);
    const intervals: BusyInterval[] = [];
    const eventsByKey = new Map<string, CalendarEvent>();
    for (const component of Object.values(calendar)) {
        if (!component || component.type !== "VEVENT" || !isBusyEvent(component)) continue;
        const instances = ical.expandRecurringEvent(component, { from, to, expandOngoing: true });
        for (const instance of instances) {
            const start = instance.start.getTime();
            const end = instance.end.getTime();
            if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
                intervals.push({ start, end });
                const title = typeof component.summary === "string" ? component.summary : "Busy";
                const eventKey = `${component.uid ?? title}:${start}:${end}`;
                eventsByKey.set(eventKey, { start, end, title, allDay: false });
            }
        }
    }
    const events = [...eventsByKey.values()].sort((left, right) => left.start - right.start || left.end - right.end || left.title.localeCompare(right.title));
    return { intervals, events };
}

export const syncSpace = internalAction({
    args: { spaceId: v.id("spaces") },
    handler: async (ctx, args) => {
        const target = await ctx.runQuery(internal.spacesInternal.getSyncTarget, { spaceId: args.spaceId });
        if (!target) return;
        await ctx.runMutation(internal.spacesInternal.markSyncing, { spaceId: target.id });
        try {
            const today = dateKeyInTimeZone(new Date(), target.timeZone);
            const startDate = addDaysToDateKey(today, -SYNC_PAST_DAYS);
            const endDate = addDaysToDateKey(today, SYNC_FUTURE_DAYS);
            const from = new Date(`${startDate}T00:00:00Z`);
            const to = new Date(`${addDaysToDateKey(endDate, 2)}T00:00:00Z`);
            const { intervals: busyIntervals, events } = await fetchBusyIntervals(calendarUrlFromEnvironment(target.calendarSourceEnvKey), from, to);
            const days = calculateAvailability({
                busyIntervals,
                startDate,
                endDate,
                minimumMinutes: Math.max(MINIMUM_AVAILABILITY_MINUTES, target.minimumAvailabilityMinutes),
                timeZone: target.timeZone,
                workingHours: target.workingHours,
            });
            const snapshotHash = await availabilitySnapshotHash(days, events);
            if (target.activeRevision && target.availabilitySnapshotHash === snapshotHash) {
                await ctx.runMutation(internal.spacesInternal.completeUnchangedSync, {
                    spaceId: target.id,
                    startDate,
                    endDate,
                });
                return;
            }
            const revision = crypto.randomUUID();
            for (let index = 0; index < days.length; index += WRITE_BATCH_SIZE) {
                await ctx.runMutation(internal.spacesInternal.writeAvailabilityBatch, {
                    spaceId: target.id,
                    revision,
                    days: days.slice(index, index + WRITE_BATCH_SIZE),
                });
            }
            for (let index = 0; index < events.length; index += WRITE_BATCH_SIZE) {
                await ctx.runMutation(internal.spacesInternal.writeEventsBatch, { spaceId: target.id, revision, events: events.slice(index, index + WRITE_BATCH_SIZE) });
            }
            await ctx.runMutation(internal.spacesInternal.activateRevision, {
                spaceId: target.id,
                revision,
                snapshotHash,
                startDate,
                endDate,
            });
            let deletedCount: number;
            do {
                deletedCount = await ctx.runMutation(internal.spacesInternal.deleteOldAvailabilityBatch, {
                    spaceId: target.id,
                    activeRevision: revision,
                });
            } while (deletedCount === 100);
            let deletedEvents: number;
            do {
                deletedEvents = await ctx.runMutation(internal.spacesInternal.deleteOldEventsBatch, { spaceId: target.id, activeRevision: revision });
            } while (deletedEvents === 100);
        } catch (error) {
            console.error("Space calendar synchronization failed", { spaceId: target.id, error: error instanceof Error ? error.message : "Unknown error" });
            await ctx.runMutation(internal.spacesInternal.markSyncError, { spaceId: target.id });
        }
    },
});

export const syncAll = internalAction({
    args: {},
    handler: async ctx => {
        const spaceIds = await ctx.runQuery(internal.spacesInternal.listActiveSpaceIds, {});
        await Promise.all(spaceIds.map(spaceId => ctx.runAction(internal.spaceSync.syncSpace, { spaceId })));
    },
});
