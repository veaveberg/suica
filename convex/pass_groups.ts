import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureTeacher, ensureTeacherOrStudent, getUser } from "./permissions";

export const get = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const user = await ensureTeacherOrStudent(ctx, args.userId);

        if (user.role === "admin") {
            return await ctx.db.query("pass_groups").collect();
        }

        if (user.role === "teacher") {
            return await ctx.db
                .query("pass_groups")
                .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
                .collect();
        }

        return [];
    },
});

export const create = mutation({
    args: {
        userId: v.id("users"),
        pass_id: v.id("passes"),
        group_id: v.id("groups"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

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
        id: v.id("pass_groups"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const pg = await ctx.db.get(args.id);

        if (!pg) throw new Error("Association not found");
        if (pg.userId !== user.tokenIdentifier && user.role !== 'admin') throw new Error("Unauthorized");

        await ctx.db.delete(args.id);
    },
});
