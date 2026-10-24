import type { QueryCtx, MutationCtx } from "./_generated/server";
import { verifySessionToken } from "./session";

import type { Doc, Id } from "./_generated/dataModel";

export async function getUser(
    ctx: QueryCtx | MutationCtx,
    userId: Id<"users">,
    authToken: string
) {
    const claims = await verifySessionToken(authToken);
    if (!claims || claims.userId !== userId) {
        throw new Error("Unauthenticated");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
        throw new Error("Unauthenticated");
    }
    if (user.role !== claims.role) {
        throw new Error("Unauthenticated");
    }

    return user;
}

export async function ensureAdmin(ctx: QueryCtx | MutationCtx, userId: Id<"users">, authToken: string) {
    const user = await getUser(ctx, userId, authToken);
    if (user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
    }
    return user;
}

export async function ensureTeacher(ctx: QueryCtx | MutationCtx, userId: Id<"users">, authToken: string) {
    const user = await getUser(ctx, userId, authToken);
    if (user.role !== "teacher" && user.role !== "admin") {
        throw new Error("Unauthorized: Teacher access required");
    }
    return user;
}

export async function ensureTeacherOrStudent(ctx: QueryCtx | MutationCtx, userId: Id<"users">, authToken: string) {
    const user = await getUser(ctx, userId, authToken);
    return user;
}

// Check referenced records too: authenticating a teacher does not authorize
// access to another teacher's lesson, student, group, pass, or schedule.
type OwnedTable = "groups" | "students" | "lessons" | "schedules" | "passes" | "tariffs";

export async function ensureOwnedRecord(
    ctx: QueryCtx | MutationCtx,
    user: Doc<"users">,
    id: Id<OwnedTable>,
) {
    const record = await ctx.db.get(id);
    if (!record || (record.userId !== user.tokenIdentifier && user.role !== "admin")) {
        throw new Error("Unauthorized");
    }
    return record;
}
