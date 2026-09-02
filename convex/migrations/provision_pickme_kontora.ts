import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";

const MANAGER_TELEGRAM_IDS = ["606365821", "129516266"] as const;

const DEFAULT_WORKING_HOURS = {
    sunday: { start: 9 * 60, end: 18 * 60 },
    monday: { start: 9 * 60, end: 18 * 60 },
    tuesday: { start: 9 * 60, end: 18 * 60 },
    wednesday: { start: 9 * 60, end: 18 * 60 },
    thursday: { start: 9 * 60, end: 18 * 60 },
    friday: { start: 9 * 60, end: 18 * 60 },
    saturday: { start: 9 * 60, end: 18 * 60 },
};

export const provision = internalMutation({
    args: {},
    handler: async ctx => {
        const existing = await ctx.db.query("spaces").withIndex("by_slug", q => q.eq("slug", "pickme")).first()
            ?? await ctx.db.query("spaces").withIndex("by_slug", q => q.eq("slug", "pickme-kontora")).first();
        const spaceId = existing?._id ?? await ctx.db.insert("spaces", {
            name: "Pickme Kontora",
            slug: "pickme",
            logoPath: "pickme-kontora-logo.png",
            color: "#f472a0",
            timeZone: "Asia/Tbilisi",
            status: "active",
            publicToken: crypto.randomUUID().replaceAll("-", ""),
            calendarSourceEnvKey: "PICKME_KONTORA_ICAL_URL",
            minimumAvailabilityMinutes: 60,
            workingHours: DEFAULT_WORKING_HOURS,
            syncState: "pending",
        });
        if (existing) {
            await ctx.db.patch(existing._id, {
                name: "Pickme Kontora",
                slug: "pickme",
                logoPath: "pickme-kontora-logo.png",
                color: "#f472a0",
                timeZone: "Asia/Tbilisi",
                status: "active",
                calendarSourceEnvKey: "PICKME_KONTORA_ICAL_URL",
                minimumAvailabilityMinutes: 60,
            });
        }

        const missingUsers: string[] = [];
        for (const tokenIdentifier of MANAGER_TELEGRAM_IDS) {
            const user = await ctx.db.query("users").withIndex("by_token", q => q.eq("tokenIdentifier", tokenIdentifier)).first();
            if (!user) {
                missingUsers.push(tokenIdentifier);
                continue;
            }
            const membership = await ctx.db.query("space_managers").withIndex("by_user_space", q => q.eq("userId", user._id).eq("spaceId", spaceId)).first();
            if (!membership) await ctx.db.insert("space_managers", { spaceId, userId: user._id });
        }
        await ctx.scheduler.runAfter(0, internal.spaceSync.syncSpace, { spaceId });
        return { spaceId, missingUsers };
    },
});
