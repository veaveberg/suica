import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureTeacher, ensureTeacherOrStudent } from "./permissions";

export const get = query({
    args: { userId: v.id("users"), authToken: v.string() },
    handler: async (ctx, args) => {
        const user = await ensureTeacherOrStudent(ctx, args.userId, args.authToken);

        if (user.role === "admin") {
            return await ctx.db.query("pass_groups").collect();
        }

        const passGroups = [];
        const seenIds = new Set<string>();

        // 1. If teacher, get owned associations
        if (user.role === "teacher") {
            const owned = await ctx.db
                .query("pass_groups")
                .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
                .collect();
            for (const pg of owned) {
                if (!seenIds.has(pg._id)) {
                    passGroups.push(pg);
                    seenIds.add(pg._id);
                }
            }
        }

        // 2. Find all student records for this user
        const myStudentRecords = await ctx.db
            .query("students")
            .withIndex("by_telegram_id", (q) => q.eq("telegram_id", user.tokenIdentifier))
            .collect();

        for (const studentRec of myStudentRecords) {
            // Get all pass_groups from this teacher
            const teacherPassGroups = await ctx.db
                .query("pass_groups")
                .withIndex("by_user", (q) => q.eq("userId", studentRec.userId))
                .collect();

            for (const pg of teacherPassGroups) {
                if (!seenIds.has(pg._id)) {
                    passGroups.push(pg);
                    seenIds.add(pg._id);
                }
            }
        }

        return passGroups;
    },
});

export const create = mutation({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
        pass_id: v.id("passes"),
        group_id: v.id("groups"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId, args.authToken);

        return await ctx.db.insert("pass_groups", {
            pass_id: args.pass_id,
            group_id: args.group_id,
            userId: user.tokenIdentifier,
        });
    },
});

export const remove = mutation({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
        id: v.id("pass_groups"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId, args.authToken);
        const pg = await ctx.db.get(args.id);

        if (!pg) throw new Error("Association not found");
        if (pg.userId !== user.tokenIdentifier && user.role !== 'admin') throw new Error("Unauthorized");

        await ctx.db.delete(args.id);
    },
});
