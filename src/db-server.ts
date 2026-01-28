import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { convex } from './convex-client';
import { getAuthUserId } from './auth-store';
import { useTelegram } from './components/TelegramProvider';
import type { Group, Student, StudentGroup, Subscription, Lesson, GroupSchedule, Attendance, Tariff, Pass, PassGroup, ExternalCalendar } from './types';
import { GROUP_COLORS } from './constants/colors';
import type { Id } from '../convex/_generated/dataModel';

export { GROUP_COLORS };

// ============================================
// DATA HOOKS
// ============================================

function useDataQuery<T>(query: any, userId?: string, skip: boolean = false) {
    const data = useQuery(query, (userId && !skip) ? { userId: userId as Id<"users"> } : "skip");
    const mappedData = (data || []).map((item: any) => ({ ...item, id: item._id }));
    const loading = (userId && !skip) ? data === undefined : false;
    return { data: mappedData as T[], loading, refresh: async () => { } };
}

export function useGroups() {
    const { convexUser } = useTelegram();
    return useDataQuery<Group>(api.groups.get, convexUser?._id);
}

export function useStudents() {
    const { convexUser } = useTelegram();
    return useDataQuery<Student>(api.students.get, convexUser?._id);
}

export function useLessons() {
    const { convexUser } = useTelegram();
    return useDataQuery<Lesson>(api.lessons.get, convexUser?._id);
}

export function useSubscriptions() {
    const { convexUser } = useTelegram();
    return useDataQuery<Subscription>(api.subscriptions.get, convexUser?._id);
}

export function useSchedules() {
    const { convexUser } = useTelegram();
    return useDataQuery<GroupSchedule>(api.schedules.get, convexUser?._id);
}

export function useStudentGroups() {
    const { convexUser } = useTelegram();
    return useDataQuery<StudentGroup>(api.student_groups.get, convexUser?._id);
}

export function useTariffs() {
    const { convexUser } = useTelegram();
    return useDataQuery<Tariff>(api.tariffs.get, convexUser?._id);
}

export function usePasses() {
    const { convexUser } = useTelegram();
    return useDataQuery<Pass>(api.passes.get, convexUser?._id);
}

export function usePassGroups() {
    const { convexUser } = useTelegram();
    return useDataQuery<PassGroup>(api.pass_groups.get, convexUser?._id);
}

export function useAttendance() {
    const { convexUser } = useTelegram();
    return useDataQuery<Attendance>(api.attendance.get, convexUser?._id);
}

export function useExternalCalendars() {
    const { convexUser } = useTelegram();
    const isTeacher = convexUser?.role === 'teacher' || convexUser?.role === 'admin';
    return useDataQuery<ExternalCalendar>(api.calendars.get, convexUser?._id, !isTeacher);
}

// ============================================
// GROUP FUNCTIONS
// ============================================

export async function createGroup(name: string, color?: string): Promise<string> {
    const userId = getAuthUserId();
    const id = await convex.mutation(api.groups.create, {
        userId: userId as Id<"users">,
        name,
        color: color || GROUP_COLORS[0], // fallback
        default_duration_minutes: 60,
        status: 'active'
    });
    return id;
}

export async function updateGroup(groupId: string, updates: Partial<Group>): Promise<void> {
    const userId = getAuthUserId();
    // Filter updates
    const allowedUpdates = {
        name: updates.name,
        status: updates.status,
        last_class_date: updates.last_class_date ? updates.last_class_date : undefined
    };

    await convex.mutation(api.groups.update, {
        userId: userId as Id<"users">,
        id: groupId as Id<"groups">,
        updates: allowedUpdates
    });
}

export async function archiveGroup(groupId: string): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(api.groups.update, {
        userId: userId as Id<"users">,
        id: groupId as Id<"groups">,
        updates: { status: 'archived' }
    });
}

export async function restoreGroup(groupId: string): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(api.groups.update, {
        userId: userId as Id<"users">,
        id: groupId as Id<"groups">,
        updates: { status: 'active' }
    });
}

export async function deleteGroup(groupId: string): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(api.groups.remove, {
        userId: userId as Id<"users">,
        id: groupId as Id<"groups">
    });
}

// ============================================
// SCHEDULE FUNCTIONS
// ============================================

export async function addScheduleSlot(groupId: string, dayOfWeek: number, time: string, durationMinutes?: number, frequencyWeeks?: number, weekOffset?: number): Promise<string> {
    const userId = getAuthUserId();
    const id = await convex.mutation(api.schedules.create, {
        userId: userId as Id<"users">,
        group_id: groupId as Id<"groups">,
        day_of_week: dayOfWeek,
        time,
        duration_minutes: durationMinutes,
        frequency_weeks: frequencyWeeks,
        week_offset: weekOffset,
        is_active: true
    });
    return id;
}

export async function deleteScheduleSlot(scheduleId: number | string): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(api.schedules.remove, {
        userId: userId as Id<"users">,
        id: scheduleId as Id<"schedules">
    });
}

export async function updateScheduleSlot(scheduleId: number | string, updates: Partial<GroupSchedule>): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(api.schedules.update, {
        userId: userId as Id<"users">,
        id: scheduleId as Id<"schedules">,
        updates: {
            day_of_week: updates.day_of_week,
            time: updates.time,
            is_active: updates.is_active
        }
    });
}

// ============================================
// LESSON FUNCTIONS
// ============================================

export async function syncLessonsFromSchedule(targetGroupId?: string): Promise<void> {
    const userId = getAuthUserId() as Id<"users">;
    // Get today's local date in YYYY-MM-DD format
    const today = new Date().toLocaleDateString('en-CA');

    await convex.mutation(api.lessons.syncFromSchedule, {
        userId,
        today,
        groupId: targetGroupId as Id<"groups">
    });
}

export async function generateFutureLessons(groupId: string, _count: number = 4): Promise<void> {
    // Re-use sync logic but specific for this group
    // The current syncLessonsFromSchedule generates 8 weeks.
    // We can just call it.
    await syncLessonsFromSchedule(groupId);
}

export async function cancelLesson(lessonId: string): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(api.lessons.update, {
        userId: userId as Id<"users">,
        id: lessonId as Id<"lessons">,
        updates: { status: 'cancelled' }
    });
}

export async function uncancelLesson(lessonId: string): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(api.lessons.update, {
        userId: userId as Id<"users">,
        id: lessonId as Id<"lessons">,
        updates: { status: 'upcoming' }
    });
}

export async function deleteLesson(lessonId: string): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(api.lessons.remove, {
        userId: userId as Id<"users">,
        id: lessonId as Id<"lessons">
    });
}

export async function deleteLessons(lessonIds: string[]): Promise<void> {
    // Parallelize deletions
    await Promise.all(lessonIds.map(id => deleteLesson(id)));
}

// ============================================
// STUDENT FUNCTIONS
// ============================================

export async function addStudentToGroup(studentId: string, groupId: string): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(api.student_groups.create, {
        userId: userId as Id<"users">,
        student_id: studentId as Id<"students">,
        group_id: groupId as Id<"groups">
    });
}

export async function removeStudentFromGroup(studentId: string, groupId: string): Promise<void> {
    const userId = getAuthUserId();
    // We need the ID of the association.
    // Query it first? 
    // Or add a mutation "removeByLink".
    // For now, we query client side then remove.
    const all = await convex.query(api.student_groups.get, { userId: userId as Id<"users"> });
    const found = all.find(sg => sg.student_id === studentId && sg.group_id === groupId);
    if (found) {
        await convex.mutation(api.student_groups.remove, {
            userId: userId as Id<"users">,
            id: found._id
        });
    }
}

export async function createStudent(data: Partial<Student>): Promise<string> {
    const userId = getAuthUserId();
    const id = await convex.mutation(api.students.create, {
        userId: userId as Id<"users">,
        name: data.name!,
        telegram_username: data.telegram_username,
        instagram_username: data.instagram_username,
        notes: data.notes
    });
    return id;
}

export async function updateStudent(id: string, data: Partial<Student>): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(api.students.update, {
        userId: userId as Id<"users">,
        id: id as Id<"students">,
        updates: {
            name: data.name,
            telegram_username: data.telegram_username,
            instagram_username: data.instagram_username,
            notes: data.notes,
            balance_notes: data.balance_notes
        }
    });
}

// ============================================
// SUBSCRIPTION FUNCTIONS
// ============================================

export async function addSubscription(sub: Omit<Subscription, 'id'>): Promise<string> {
    const userId = getAuthUserId();
    const id = await convex.mutation(api.subscriptions.create, {
        userId: userId as Id<"users">,
        user_id: sub.user_id as Id<"students">,
        group_id: sub.group_id as Id<"groups">,
        tariff_id: sub.tariff_id as any,
        type: sub.type,
        lessons_total: sub.lessons_total,
        price: sub.price,
        purchase_date: sub.purchase_date,
        expiry_date: sub.expiry_date,
        is_consecutive: sub.is_consecutive,
        duration_days: sub.duration_days,
        status: sub.status
    });
    return id;
}

export async function markAttendance(lessonId: string, studentId: string, status: 'present' | 'absence_valid' | 'absence_invalid'): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(api.attendance.mark, {
        userId: userId as Id<"users">,
        lesson_id: lessonId as Id<"lessons">,
        student_id: studentId as Id<"students">,
        status
    });
}


// ============================================
// PASS FUNCTIONS
// ============================================

export async function createPass(passData: Partial<Pass>, groupIds: string[]): Promise<string> {
    const userId = getAuthUserId();
    const passId = await convex.mutation(api.passes.create, {
        userId: userId as Id<"users">,
        name: passData.name!,
        price: passData.price!,
        lessons_count: passData.lessons_count!,
        is_consecutive: passData.is_consecutive || false,
        duration_days: passData.duration_days
    });

    // Create associations
    for (const groupId of groupIds) {
        await convex.mutation(api.pass_groups.create, {
            userId: userId as Id<"users">,
            pass_id: passId,
            group_id: groupId as Id<"groups">
        });
    }

    return passId;
}

export async function updatePass(passId: string, passData: Partial<Pass>, groupIds: string[]): Promise<void> {
    const userId = getAuthUserId();

    // Update pass details
    await convex.mutation(api.passes.update, {
        userId: userId as Id<"users">,
        id: passId as Id<"passes">,
        updates: {
            name: passData.name,
            price: passData.price,
            lessons_count: passData.lessons_count,
            is_consecutive: passData.is_consecutive,
            duration_days: passData.duration_days
        }
    });

    // Update associations
    // First, remove all existing logic is too heavy? No, better diff.
    // Client side provides new list. We need to reconcile.
    // Fetch existing.
    const all = await convex.query(api.pass_groups.get, { userId: userId as Id<"users"> });
    const existing = all.filter(pg => pg.pass_id === passId);

    const existingGroupIds = existing.map(pg => pg.group_id);

    const toAdd = groupIds.filter(id => !existingGroupIds.includes(id as any));
    const toRemove = existing.filter(pg => !groupIds.includes(pg.group_id));

    for (const groupId of toAdd) {
        await convex.mutation(api.pass_groups.create, {
            userId: userId as Id<"users">,
            pass_id: passId as Id<"passes">,
            group_id: groupId as Id<"groups">
        });
    }

    for (const pg of toRemove) {
        await convex.mutation(api.pass_groups.remove, {
            userId: userId as Id<"users">,
            id: pg._id
        });
    }
}

export async function deletePass(passId: string): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(api.passes.remove, {
        userId: userId as Id<"users">,
        id: passId as Id<"passes">
    });
}

export async function addExternalCalendar(name: string, url: string, color: string): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(api.calendars.create, {
        userId: userId as Id<"users">,
        name,
        url,
        color,
        enabled: true
    });
}

export async function deleteExternalCalendar(id: string): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(api.calendars.remove, {
        userId: userId as Id<"users">,
        id: id as Id<"external_calendars">
    });
}

export async function updateExternalCalendar(id: string, updates: Partial<ExternalCalendar>): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(api.calendars.update, {
        userId: userId as Id<"users">,
        id: id as Id<"external_calendars">,
        updates: {
            name: updates.name,
            url: updates.url,
            color: updates.color,
            enabled: updates.enabled
        }
    });
}

export async function toggleExternalCalendar(id: string, enabled: boolean): Promise<void> {
    const userId = getAuthUserId();
    await convex.mutation(api.calendars.update, {
        userId: userId as Id<"users">,
        id: id as Id<"external_calendars">,
        updates: { enabled }
    });
}

// ============================================
// CLEAR ALL DATA
// ============================================

export async function clearAllData(): Promise<void> {
    // Dangerous. Not implemented for Convex yet.
    console.warn("clearAllData not implemented for Convex");
}
