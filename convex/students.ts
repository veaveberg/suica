import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureTeacher, ensureTeacherOrStudent } from "./permissions";

export const get = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const user = await ensureTeacherOrStudent(ctx, args.userId);

        if (user.role === "admin") {
            return await ctx.db.query("students").collect();
        }

        if (user.role === "teacher") {
            return await ctx.db
                .query("students")
                .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
                .collect();
        }

        // Students only see themselves (or nothing, depending on privacy requirements)
        // Actually, usually students don't need to fetch a list of "all students".
        // They might need to fetch their own profile.
        if (user.role === "student" && user.studentId) {
            const me = await ctx.db.get(user.studentId);
            return me ? [me] : [];
        }

        return [];
    },
});

export const create = mutation({
    args: {
        userId: v.id("users"),
        name: v.string(),
        telegram_username: v.optional(v.string()),
        instagram_username: v.optional(v.string()),
        notes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

        return await ctx.db.insert("students", {
            name: args.name,
            telegram_username: args.telegram_username,
            instagram_username: args.instagram_username,
            notes: args.notes,
            userId: user.tokenIdentifier,
        });
    },
});

export const update = mutation({
    args: {
        userId: v.id("users"),
        id: v.id("students"),
        updates: v.object({
            name: v.optional(v.string()),
            telegram_username: v.optional(v.string()),
            instagram_username: v.optional(v.string()),
            notes: v.optional(v.string()),
            balance_notes: v.optional(v.string()),
        }),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const student = await ctx.db.get(args.id);

        if (!student) throw new Error("Student not found");
        if (student.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        await ctx.db.patch(args.id, args.updates);
    },
});
