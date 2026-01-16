import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureTeacher, ensureTeacherOrStudent } from "./permissions";

export const get = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const user = await ensureTeacherOrStudent(ctx, args.userId);

        if (user.role === "admin") {
            return await ctx.db.query("student_groups").collect();
        }

        if (user.role === "teacher") {
            return await ctx.db
                .query("student_groups")
                .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
                .collect();
        }

        // Students might see their groups
        if (user.role === "student" && user.studentId) {
            return await ctx.db
                .query("student_groups")
                .withIndex("by_student_group", (q) => q.eq("student_id", user.studentId!))
                .collect();
        }

        return [];
    },
});

export const create = mutation({
    args: {
        userId: v.id("users"),
        student_id: v.id("students"),
        group_id: v.id("groups"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

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
        id: v.id("student_groups"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const sg = await ctx.db.get(args.id);

        if (!sg) throw new Error("Association not found");
        if (sg.userId !== user.tokenIdentifier && user.role !== 'admin') throw new Error("Unauthorized");

        await ctx.db.delete(args.id);
    },
});
