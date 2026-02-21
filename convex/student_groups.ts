import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureTeacher, ensureTeacherOrStudent } from "./permissions";

export const get = query({
    args: { userId: v.id("users"), authToken: v.string() },
    handler: async (ctx, args) => {
        const user = await ensureTeacherOrStudent(ctx, args.userId, args.authToken);

        if (user.role === "admin") {
            return await ctx.db.query("student_groups").collect();
        }

        const studentGroups = [];
        const seenIds = new Set<string>();

        if (user.role === "teacher") {
            const owned = await ctx.db
                .query("student_groups")
                .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
                .collect();

            for (const sg of owned) {
                studentGroups.push(sg);
                seenIds.add(sg._id);
            }
        }

        // Also fetch groups where this user (teacher or student) is enrolled
        // Find their student record(s) first
        const myStudentRecords = await ctx.db
            .query("students")
            .withIndex("by_telegram_id", (q) => q.eq("telegram_id", user.tokenIdentifier))
            .collect();

        for (const s of myStudentRecords) {
            const enrolled = await ctx.db
                .query("student_groups")
                .withIndex("by_student_group", (q) => q.eq("student_id", s._id))
                .collect();

            for (const sg of enrolled) {
                if (!seenIds.has(sg._id)) {
                    studentGroups.push(sg);
                    seenIds.add(sg._id);
                }
            }
        }

        return studentGroups;
    },
});

export const create = mutation({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
        student_id: v.id("students"),
        group_id: v.id("groups"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId, args.authToken);

        // check if exists
        const existing = await ctx.db
            .query("student_groups")
            .withIndex("by_student_group", q => q.eq("student_id", args.student_id).eq("group_id", args.group_id))
            .first();

        if (existing) return existing._id;

        return await ctx.db.insert("student_groups", {
            student_id: args.student_id,
            group_id: args.group_id,
            userId: user.tokenIdentifier,
        });
    },
});

export const remove = mutation({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
        id: v.id("student_groups"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId, args.authToken);
        const sg = await ctx.db.get(args.id);

        if (!sg) throw new Error("Association not found");
        if (sg.userId !== user.tokenIdentifier && user.role !== 'admin') throw new Error("Unauthorized");

        await ctx.db.delete(args.id);
    },
});
