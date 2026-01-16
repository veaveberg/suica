import { v } from "convex/values";
import { mutation } from "../_generated/server";

export const copy = mutation({
    args: {
        fromUserId: v.string(), // e.g. "129516266"
        toUserId: v.string(),   // e.g. "606365821"
    },
    handler: async (ctx, args) => {
        const { fromUserId, toUserId } = args;

        console.log(`Starting full copy from ${fromUserId} to ${toUserId}...`);

        // 0. CLEANUP: Delete existing data for target user to prevent duplicates
        const targetGroups = await ctx.db.query("groups").withIndex("by_user", (q) => q.eq("userId", toUserId)).collect();
        for (const g of targetGroups) await ctx.db.delete(g._id);

        const targetSchedules = await ctx.db.query("schedules").withIndex("by_user", (q) => q.eq("userId", toUserId)).collect();
        for (const s of targetSchedules) await ctx.db.delete(s._id);

        const targetPasses = await ctx.db.query("passes").withIndex("by_user", (q) => q.eq("userId", toUserId)).collect();
        for (const p of targetPasses) await ctx.db.delete(p._id);

        const targetPassGroups = await ctx.db.query("pass_groups").withIndex("by_user", (q) => q.eq("userId", toUserId)).collect();
        for (const pg of targetPassGroups) await ctx.db.delete(pg._id);

        console.log("Cleaned up existing data for target user.");

        // 1. Copy Groups
        const groups = await ctx.db
            .query("groups")
            .withIndex("by_user", (q) => q.eq("userId", fromUserId))
            .collect();

        const groupIdMap = new Map<string, string>();

        for (const group of groups) {
            const newGroupId = await ctx.db.insert("groups", {
                name: group.name,
                color: group.color,
                default_duration_minutes: group.default_duration_minutes,
                status: group.status,
                last_class_date: group.last_class_date,
                userId: toUserId,
            });
            groupIdMap.set(group._id, newGroupId);
        }
        console.log(`Copied ${groups.length} groups.`);

        // 2. Copy Schedules
        const schedules = await ctx.db
            .query("schedules")
            .withIndex("by_user", (q) => q.eq("userId", fromUserId))
            .collect();

        let schedulesCount = 0;
        for (const schedule of schedules) {
            const newGroupId = groupIdMap.get(schedule.group_id);
            if (!newGroupId) {
                continue;
            }
            // @ts-ignore
            await ctx.db.insert("schedules", {
                group_id: newGroupId as any,
                day_of_week: schedule.day_of_week,
                time: schedule.time,
                duration_minutes: schedule.duration_minutes,
                frequency_weeks: schedule.frequency_weeks,
                week_offset: schedule.week_offset,
                is_active: schedule.is_active,
                userId: toUserId,
            });
            schedulesCount++;
        }
        console.log(`Copied ${schedulesCount} schedules.`);

        // 3. Copy Passes
        const passes = await ctx.db
            .query("passes")
            .withIndex("by_user", (q) => q.eq("userId", fromUserId))
            .collect();

        const passIdMap = new Map<string, string>();

        for (const pass of passes) {
            const newPassId = await ctx.db.insert("passes", {
                name: pass.name,
                price: pass.price,
                lessons_count: pass.lessons_count,
                is_consecutive: pass.is_consecutive,
                duration_days: pass.duration_days,
                userId: toUserId,
            });
            passIdMap.set(pass._id, newPassId);
        }
        console.log(`Copied ${passes.length} passes.`);

        // 4. Copy PassGroups
        const passGroups = await ctx.db
            .query("pass_groups")
            .withIndex("by_user", (q) => q.eq("userId", fromUserId))
            .collect();

        let passGroupsCount = 0;
        for (const pg of passGroups) {
            const newPassId = passIdMap.get(pg.pass_id);
            const newGroupId = groupIdMap.get(pg.group_id);

            if (newPassId && newGroupId) {
                // @ts-ignore
                await ctx.db.insert("pass_groups", {
                    pass_id: newPassId as any,
                    group_id: newGroupId as any,
                    userId: toUserId,
                });
                passGroupsCount++;
            }
        }
        console.log(`Copied ${passGroupsCount} pass_groups.`);

        return {
            groups: groups.length,
            schedules: schedulesCount,
            passes: passes.length,
            passGroups: passGroupsCount
        };
    },
});
