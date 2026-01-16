import Dexie, { type Table } from 'dexie';
import type { Student, Subscription, Lesson, Attendance, Tariff, Group, GroupSchedule, StudentGroup } from './types';

// Default group colors
const GROUP_COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5856D6'];

export const db = new Dexie('suica_db') as Dexie & {
    students: Table<Student>;
    groups: Table<Group>;
    student_groups: Table<StudentGroup>;
    subscriptions: Table<Subscription>;
    lessons: Table<Lesson>;
    attendance: Table<Attendance>;
    tariffs: Table<Tariff>;
    schedules: Table<GroupSchedule>;
};

db.version(7).stores({
    students: '++id, name, telegram_username',
    groups: '++id, name, status',
    student_groups: '++id, student_id, group_id, [student_id+group_id]',
    subscriptions: '++id, user_id, group_id, tariff_id',
    lessons: '++id, date, group_id, time, schedule_id, status, [date+group_id+time]',
    attendance: '++id, [lesson_id+student_id], student_id',
    tariffs: '++id, name, type',
    schedules: '++id, group_id, day_of_week'
});

export async function seedDatabase() {
    const groupCount = await db.groups.count();
    if (groupCount === 0) {
        await db.groups.bulkAdd([
            { name: 'CLOSED', color: GROUP_COLORS[0], default_duration_minutes: 60, status: 'active' },
            { name: 'TECH', color: GROUP_COLORS[1], default_duration_minutes: 90, status: 'active' },
            { name: 'CREATIVE', color: GROUP_COLORS[2], default_duration_minutes: 60, status: 'active' }
        ]);

        await db.tariffs.bulkAdd([
            { name: 'Пробное занятие', price: 0, count: 1, type: 'TECH', is_consecutive: true },
            { name: 'Разовое занятие', price: 40, count: 1, type: 'TECH', is_consecutive: true },
            { name: '8 занятий подряд', price: 280, count: 8, type: 'CLOSED', is_consecutive: true },
            { name: '12 занятий подряд', price: 360, count: 12, type: 'CLOSED', is_consecutive: true },
            { name: '8 занятий (30 дней)', price: 320, count: 8, type: 'TECH', is_consecutive: false, duration_days: 30 }
        ]);

        const groups = await db.groups.toArray();
        const closedGroup = groups.find(g => g.name === 'CLOSED');

        if (closedGroup?.id) {
            await db.schedules.bulkAdd([
                { group_id: closedGroup.id.toString(), day_of_week: 1, time: '19:00', is_active: true },
                { group_id: closedGroup.id.toString(), day_of_week: 3, time: '19:00', is_active: true }
            ]);
        }
    }
}

// ============================================
// LESSON GENERATION
// ============================================

export async function syncLessonsFromSchedule() {
    const allSchedules = await db.schedules.toArray();
    const schedules = allSchedules.filter(s => s.is_active);
    const groups = await db.groups.where('status').equals('active').toArray();

    console.log('[syncLessons] Active schedules:', schedules);
    console.log('[syncLessons] Active groups:', groups);

    const today = new Date();
    const lessonsToAdd: Lesson[] = [];

    // Generate 8 weeks ahead
    for (let i = 0; i < 56; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() + i);
        const dayOfWeek = checkDate.getDay();
        const dateStr = checkDate.toISOString().split('T')[0];

        const activeSlots = schedules.filter((s: GroupSchedule) => s.day_of_week === dayOfWeek);

        for (const slot of activeSlots) {
            // Convert both to string for comparison
            const group = groups.find((g: Group) => String(g.id) === String(slot.group_id));
            if (!group) {
                console.log('[syncLessons] No matching group for slot:', slot, 'groups ids:', groups.map(g => g.id));
                continue;
            }

            // Respect last_class_date
            if (group.last_class_date && dateStr > group.last_class_date) continue;

            // Check if lesson already exists
            const exists = await db.lessons
                .where({ date: dateStr, group_id: String(slot.group_id), time: slot.time })
                .first();

            if (!exists) {
                lessonsToAdd.push({
                    date: dateStr,
                    time: slot.time,
                    group_id: String(slot.group_id),
                    duration_minutes: slot.duration_minutes || group.default_duration_minutes,
                    schedule_id: slot.id,
                    students_count: 0,
                    total_amount: 0,
                    status: 'upcoming'
                });
            }
        }
    }

    console.log('[syncLessons] Lessons to add:', lessonsToAdd.length);

    if (lessonsToAdd.length > 0) {
        await db.lessons.bulkAdd(lessonsToAdd);
    }

    // Clean up orphaned lessons (lessons with no valid group)
    await cleanOrphanedLessons();
}

// Remove lessons that reference non-existent groups
export async function cleanOrphanedLessons(): Promise<number> {
    const lessons = await db.lessons.toArray();
    const groups = await db.groups.toArray();
    const validGroupIds = groups.map(g => g.id?.toString()).filter(Boolean);

    const orphanedLessonIds = lessons
        .filter(l => !validGroupIds.includes(l.group_id))
        .map(l => l.id)
        .filter((id): id is string => id !== undefined);

    if (orphanedLessonIds.length > 0) {
        await db.lessons.bulkDelete(orphanedLessonIds);
    }

    return orphanedLessonIds.length;
}

// Clear all data and reset database
export async function clearAllData(): Promise<void> {
    await db.lessons.clear();
    await db.attendance.clear();
    await db.subscriptions.clear();
    await db.student_groups.clear();
    await db.students.clear();
    await db.schedules.clear();
    await db.tariffs.clear();
    await db.groups.clear();
}

// ============================================
// LESSON ACTIONS
// ============================================

export async function cancelLesson(lessonId: string): Promise<void> {
    await db.lessons.update(lessonId, { status: 'cancelled' });
}

export async function uncancelLesson(lessonId: string): Promise<void> {
    await db.lessons.update(lessonId, { status: 'upcoming' });
}

export async function rescheduleLesson(lessonId: string, newDate: string, newTime: string): Promise<void> {
    await db.lessons.update(lessonId, { date: newDate, time: newTime });
}

export async function createOneOffLesson(
    groupId: string,
    date: string,
    time: string,
    durationMinutes: number
): Promise<string> {
    const id = await db.lessons.add({
        group_id: groupId,
        date,
        time,
        duration_minutes: durationMinutes,
        schedule_id: undefined, // One-off lesson
        students_count: 0,
        total_amount: 0,
        status: 'upcoming'
    });
    return id.toString();
}

// ============================================
// SCHEDULE MANAGEMENT
// ============================================

export async function changeRecurringSchedule(
    scheduleId: number,
    newDayOfWeek: number,
    newTime: string,
    startDate: string
): Promise<void> {
    // Get all future lessons for this schedule
    const lessons = await db.lessons
        .where('schedule_id')
        .equals(scheduleId)
        .filter(l => l.date >= startDate && l.status === 'upcoming')
        .toArray();

    // Calculate day difference
    const schedule = await db.schedules.get(scheduleId);
    if (!schedule) return;

    const oldDay = schedule.day_of_week;
    const dayDiff = newDayOfWeek - oldDay;

    // Move each lesson
    for (const lesson of lessons) {
        const oldDate = new Date(lesson.date);
        const newDate = new Date(oldDate);
        newDate.setDate(oldDate.getDate() + dayDiff);

        await db.lessons.update(lesson.id!, {
            date: newDate.toISOString().split('T')[0],
            time: newTime
        });
    }

    // Update schedule for future generation
    await db.schedules.update(scheduleId, {
        day_of_week: newDayOfWeek,
        time: newTime
    });
}

export async function addScheduleSlot(
    groupId: string,
    dayOfWeek: number,
    time: string,
    durationMinutes?: number
): Promise<number> {
    const id = await db.schedules.add({
        group_id: groupId,
        day_of_week: dayOfWeek,
        time,
        duration_minutes: durationMinutes,
        is_active: true
    });

    // Regenerate lessons for this new slot
    await syncLessonsFromSchedule();

    return id as number;
}

export async function deleteScheduleSlot(scheduleId: number): Promise<void> {
    // Delete future lessons for this schedule
    await db.lessons
        .where('schedule_id')
        .equals(scheduleId)
        .filter(l => l.status === 'upcoming')
        .delete();

    await db.schedules.delete(scheduleId);
}

// ============================================
// GROUP MANAGEMENT
// ============================================

export async function createGroup(name: string): Promise<string> {
    // Check name uniqueness among active groups
    const existing = await db.groups
        .where('status').equals('active')
        .filter(g => g.name.toLowerCase() === name.toLowerCase())
        .first();

    if (existing) {
        throw new Error('A group with this name already exists');
    }

    // Pick next available color
    const groups = await db.groups.toArray();
    const usedColors = groups.map(g => g.color);
    const color = GROUP_COLORS.find(c => !usedColors.includes(c)) || GROUP_COLORS[0];

    const id = await db.groups.add({
        name,
        color,
        default_duration_minutes: 60,
        status: 'active'
    });

    return id.toString();
}

export async function updateGroup(id: string, updates: Partial<Group>): Promise<void> {
    const group = await db.groups.get(id);
    if (!group) return;

    // If updating name, check uniqueness
    if (updates.name && updates.name !== group.name) {
        const existing = await db.groups
            .where('status').equals('active')
            .filter(g => g.name.toLowerCase() === updates.name!.toLowerCase() && g.id !== id)
            .first();

        if (existing) {
            throw new Error('A group with this name already exists');
        }
    }

    // If updating last_class_date, remove lessons after that date
    if (updates.last_class_date !== undefined) {
        if (updates.last_class_date) {
            await db.lessons
                .where('group_id').equals(id)
                .filter(l => l.date > updates.last_class_date! && l.status === 'upcoming')
                .delete();
        }
    }

    await db.groups.update(id, updates);
}

export async function archiveGroup(id: string): Promise<void> {
    // Delete all future lessons
    await db.lessons
        .where('group_id').equals(id)
        .filter(l => l.status === 'upcoming')
        .delete();

    // Check if name conflicts with another active group
    const group = await db.groups.get(id);
    if (!group) return;

    const conflicting = await db.groups
        .where('status').equals('active')
        .filter(g => g.name === group.name && g.id !== id)
        .first();

    const updates: Partial<Group> = { status: 'archived' };
    if (conflicting) {
        updates.name = `${group.name} (archived)`;
    }

    await db.groups.update(id, updates);
}

export async function restoreGroup(id: string, newName?: string): Promise<void> {
    const group = await db.groups.get(id);
    if (!group) return;

    const nameToUse = newName || group.name;

    // Check name uniqueness
    const existing = await db.groups
        .where('status').equals('active')
        .filter(g => g.name.toLowerCase() === nameToUse.toLowerCase())
        .first();

    if (existing) {
        throw new Error('A group with this name already exists. Please provide a different name.');
    }

    await db.groups.update(id, { status: 'active', name: nameToUse });

    // Regenerate lessons from schedules
    await syncLessonsFromSchedule();
}

export async function deleteGroup(id: string): Promise<void> {
    const group = await db.groups.get(id);
    if (!group || group.status !== 'archived') {
        throw new Error('Only archived groups can be deleted');
    }

    // Delete all lessons
    await db.lessons.where('group_id').equals(id).delete();

    // Delete all schedules
    await db.schedules.where('group_id').equals(id).delete();

    // Delete student-group associations
    await db.student_groups.where('group_id').equals(id).delete();

    // Delete group
    await db.groups.delete(id);
}

// ============================================
// HELPERS
// ============================================

export function getNextColor(): string {
    return GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
}

// ============================================
// STUDENT-GROUP MANAGEMENT
// ============================================

export async function addStudentToGroup(studentId: string, groupId: string): Promise<void> {
    // Check if already in group
    const existing = await db.student_groups
        .where({ student_id: studentId, group_id: groupId })
        .first();

    if (!existing) {
        await db.student_groups.add({ student_id: studentId, group_id: groupId });
    }
}

export async function removeStudentFromGroup(studentId: string, groupId: string): Promise<void> {
    await db.student_groups
        .where({ student_id: studentId, group_id: groupId })
        .delete();
}

export async function getStudentGroups(studentId: string): Promise<Group[]> {
    const assignments = await db.student_groups
        .where('student_id')
        .equals(studentId)
        .toArray();

    const groupIds = assignments.map(a => a.group_id);
    const groups = await db.groups.bulkGet(groupIds);
    return groups.filter((g): g is Group => g !== undefined);
}

export async function getGroupStudents(groupId: string): Promise<Student[]> {
    const assignments = await db.student_groups
        .where('group_id')
        .equals(groupId)
        .toArray();

    const studentIds = assignments.map(a => a.student_id);
    const students = await db.students.bulkGet(studentIds);
    return students.filter((s): s is Student => s !== undefined);
}

export async function getGroupSubscriptions(groupId: string): Promise<Subscription[]> {
    return db.subscriptions.where('group_id').equals(groupId).toArray();
}

