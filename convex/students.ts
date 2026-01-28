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

        const students = [];
        const seenIds = new Set<string>();

        // 1. If teacher, get owned students
        if (user.role === "teacher") {
            const owned = await ctx.db
                .query("students")
                .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
                .collect();
            for (const s of owned) {
                if (!seenIds.has(s._id)) {
                    students.push(s);
                    seenIds.add(s._id);
                }
            }
        }

        // 2. Find all student records for this user (they might be students of multiple teachers)
        const myStudentRecords = await ctx.db
            .query("students")
            .withIndex("by_telegram_id", (q) => q.eq("telegram_id", user.tokenIdentifier))
            .collect();

        for (const s of myStudentRecords) {
            if (!seenIds.has(s._id)) {
                students.push(s);
                seenIds.add(s._id);
            }
        }

        return students;
    },
});

export const create = mutation({
    args: {
        userId: v.id("users"),
        name: v.string(),
        telegram_username: v.optional(v.string()),
        telegram_id: v.optional(v.string()),
        instagram_username: v.optional(v.string()),
        notes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

        return await ctx.db.insert("students", {
            name: args.name,
            telegram_username: args.telegram_username,
            telegram_id: args.telegram_id,
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
            telegram_id: v.optional(v.string()),
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

export const remove = mutation({
    args: {
        userId: v.id("users"),
        id: v.id("students"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const student = await ctx.db.get(args.id);

        if (!student) throw new Error("Student not found");
        if (student.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        await ctx.db.delete(args.id);
    },
});
