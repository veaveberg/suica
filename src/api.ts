import { convex } from './convex-client';
import { api } from '../convex/_generated/api';
import { getAuthUserId } from './auth-store';
import type { Id } from '../convex/_generated/dataModel';

// Map table names to Convex API modules
const convexApi: any = {
    groups: api.groups,
    students: api.students,
    student_groups: api.student_groups,
    subscriptions: api.subscriptions,
    lessons: api.lessons,
    schedules: api.schedules,
    attendance: api.attendance,
    tariffs: api.tariffs,
    passes: api.passes,
    pass_groups: api.pass_groups,
    external_calendars: api.calendars
};

type TableName = keyof typeof convexApi;

export async function getAll<T>(table: TableName): Promise<T[]> {
    const userId = getAuthUserId();
    // The following line seems to be a partial or incorrect edit from the user's instruction.
    // It's syntactically incorrect and references `ctx.db` which is not available here.
    // Reverting to original line based on the instruction's intent to fix implicit conversions,
    // and the fact that the provided snippet is malformed.
    // If the user intended to add a new line, it should be clearly specified.
    const data = await convex.query(convexApi[table].get, { userId: userId as Id<"users"> });
    return (data || []).map((item: any) => ({ ...item, id: item._id })) as T[];
}

export async function getById<T>(table: TableName, id: string): Promise<T | null> {
    // We don't have a generic getById in our Convex API modules yet.
    // We can add it or query all and find? Querying all is bad.
    // But 'get' usually returns list.
    // We should implement 'getById' in Convex or use `db.get` generic?
    // Convex client cannot access `db.get` directly.
    // We need to add `getById` to our API modules if needed.
    // Checking usage: `StudentsView` uses `api.create`. Does it use `getById`?
    // Likely not often.
    // Let's implement a fallback: Fetch all (cached) and find.
    // Or throw error if not critical.
    console.warn(`getById not optimized for ${String(table)}`);
    const all = await getAll<any>(table);
    return all.find((item: any) => item._id === id) || null;
}

export async function create<T>(table: TableName, data: any): Promise<T> {
    const userId = getAuthUserId();
    // Special handling if needed (e.g. userId injection is done by wrapper usually)
    // Our convex mutations expect `userId`.
    const id = await convex.mutation(convexApi[table].create, {
        ...data,
        userId: userId as Id<"users">
    });
    return { ...data, id, _id: id } as T;
}

export async function update<T>(table: TableName, id: string, data: any): Promise<T> {
    const userId = getAuthUserId();
    await convex.mutation(convexApi[table].update, {
        userId: userId as Id<"users">,
        id: id as Id<any>,
        updates: data
    });
    // Return mock updated generic
    return { ...data, id, _id: id } as T;
}

export async function remove(table: TableName, id: string): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(convexApi[table].remove, {
        userId: userId as Id<"users">,
        id: id as Id<any>
    });
}

export async function bulkCreate<T>(table: TableName, items: any[]): Promise<T[]> {
    const userId = getAuthUserId();
    if (table === 'lessons') {
        await convex.mutation(api.lessons.bulkCreate, {
            userId: userId as Id<"users">,
            lessons: items
        });
        return items as T[];
    }
    if (table === 'attendance') {
        await convex.mutation(api.attendance.bulkCreate, {
            userId: userId as Id<"users">,
            attendance: items
        });
        return items as T[];
    }
    throw new Error("Bulk create not implemented for " + String(table));
}

export async function syncAttendance(lessonId: string, attendance: any[]): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(api.attendance.syncLessonAttendance, {
        userId: userId as Id<"users">,
        lesson_id: lessonId as Id<"lessons">,
        attendance
    });
}

export async function clearTable(_table: TableName): Promise<void> {
    console.warn("clearTable not supported");
}

export async function queryByField<T>(table: TableName, field: string, value: string | number): Promise<T[]> {
    // Fallback to client side filter
    const all = await getAll<any>(table);
    return all.filter((item: any) => String(item[field]) === String(value));
}

export async function clearAllData(): Promise<void> {
    console.warn("clearAllData not supported");
}
