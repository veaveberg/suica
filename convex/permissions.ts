import { QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

// We assume the client passes 'userId' (the ID of the user document) as an argument for now,
// or we use the session token if we had one.
// Since 'login' returns the User ID, the client can store it.
// However, passing the sensitive ID of the user doc effectively acts as a session token if we treat it so.
// A better way is to pass the tokenIdentifier (Telegram ID) but that's easily spoofable if not signed.
// Given the constraints and "MVP" migration, we will trust the `userId` argument passed by client
// BUT we should verify it exists in the DB.

import { Id } from "./_generated/dataModel";

export async function getUser(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
    const user = await ctx.db.get(userId);
    if (!user) {
        throw new Error("Unauthenticated");
    }
    return user;
}

export async function ensureAdmin(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
    const user = await getUser(ctx, userId);
    if (user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
    }
    return user;
}

export async function ensureTeacher(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
    const user = await getUser(ctx, userId);
    if (user.role !== "teacher" && user.role !== "admin") {
        throw new Error("Unauthorized: Teacher access required");
    }
    return user;
}

export async function ensureTeacherOrStudent(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
    const user = await getUser(ctx, userId);
    return user;
}
