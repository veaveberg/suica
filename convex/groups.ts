// Force file sync
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureTeacher, ensureTeacherOrStudent } from "./permissions";

export const get = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const user = await ensureTeacherOrStudent(ctx, args.userId);

        if (user.role === "admin") {
            return await ctx.db.query("groups").collect();
        }

        const groups = [];
        const seenIds = new Set<string>();

        // 1. If teacher, get owned groups
        if (user.role === "teacher") {
            const owned = await ctx.db
                .query("groups")
                .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
                .collect();
            for (const g of owned) {
                if (!seenIds.has(g._id)) {
                    groups.push(g);
                    seenIds.add(g._id);
                }
            }
        }

        // 2. Find all student records for this user (they might be students of multiple teachers)
        const myStudentRecords = await ctx.db
            .query("students")
            .withIndex("by_telegram_id", (q) => q.eq("telegram_id", user.tokenIdentifier))
            .collect();

        for (const studentRec of myStudentRecords) {
            // Get all groups from this teacher
            const teacherGroups = await ctx.db
                .query("groups")
                .withIndex("by_user", (q) => q.eq("userId", studentRec.userId))
                .collect();

            for (const g of teacherGroups) {
                if (!seenIds.has(g._id)) {
                    groups.push(g);
                    seenIds.add(g._id);
                }
            }
        }

        const groupsWithTeacher = [];
        for (const g of groups) {
            const owner = await ctx.db
                .query("users")
                .withIndex("by_token", q => q.eq("tokenIdentifier", g.userId))
                .first();
            groupsWithTeacher.push({
                ...g,
                teacherName: owner?.name || "Teacher"
            });
        }

        return groupsWithTeacher;
    },
});

export const create = mutation({
    args: {
        userId: v.id("users"),
        name: v.string(),
        color: v.string(),
        default_duration_minutes: v.number(),
        status: v.union(v.literal("active"), v.literal("archived")),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

        // Check name uniqueness for this teacher
        const existing = await ctx.db
            .query("groups")
            .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
            .filter(q => q.eq(q.field("name"), args.name))
            .first();

        if (existing) throw new Error("Group with this name already exists");

        return await ctx.db.insert("groups", {
            name: args.name,
            color: args.color,
            default_duration_minutes: args.default_duration_minutes,
            status: args.status,
            userId: user.tokenIdentifier,
        });
    },
});

export const update = mutation({
    args: {
        userId: v.id("users"),
        id: v.id("groups"),
        updates: v.object({
            name: v.optional(v.string()),
            status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
            last_class_date: v.optional(v.string()),
            color: v.optional(v.string()),
            default_duration_minutes: v.optional(v.number()),
        }),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const group = await ctx.db.get(args.id);

        if (!group) throw new Error("Group not found");
        if (group.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        await ctx.db.patch(args.id, args.updates);
    },
});

export const remove = mutation({
    args: {
        userId: v.id("users"),
        id: v.id("groups"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const group = await ctx.db.get(args.id);

        if (!group) throw new Error("Group not found");
        if (group.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        // Cascade delete logic would go here (lessons, etc.)
        // For now just delete the group
        await ctx.db.delete(args.id);
    },
});
