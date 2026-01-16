// One-time migration from IndexedDB to server
import { db } from './db';
import * as api from './api';

export async function migrateToServer(): Promise<void> {
    console.log('[migrate] Starting migration from IndexedDB to server...');

    // Migrate groups
    const groups = await db.groups.toArray();
    if (groups.length > 0) {
        console.log(`[migrate] Migrating ${groups.length} groups...`);
        for (const group of groups) {
            const { id, ...data } = group;
            await api.create('groups', { ...data, id });
        }
    }

    // Migrate students
    const students = await db.students.toArray();
    if (students.length > 0) {
        console.log(`[migrate] Migrating ${students.length} students...`);
        for (const student of students) {
            const { id, ...data } = student;
            await api.create('students', { ...data, id });
        }
    }

    // Migrate student_groups
    const studentGroups = await db.student_groups.toArray();
    if (studentGroups.length > 0) {
        console.log(`[migrate] Migrating ${studentGroups.length} student-group assignments...`);
        for (const sg of studentGroups) {
            const { id, ...data } = sg;
            await api.create('student_groups', { ...data, id });
        }
    }

    // Migrate schedules
    const schedules = await db.schedules.toArray();
    if (schedules.length > 0) {
        console.log(`[migrate] Migrating ${schedules.length} schedules...`);
        for (const schedule of schedules) {
            const { id, ...data } = schedule;
            await api.create('schedules', { ...data, id });
        }
    }

    // Migrate lessons
    const lessons = await db.lessons.toArray();
    if (lessons.length > 0) {
        console.log(`[migrate] Migrating ${lessons.length} lessons...`);
        for (const lesson of lessons) {
            const { id, ...data } = lesson;
            await api.create('lessons', { ...data, id });
        }
    }

    // Migrate subscriptions
    const subscriptions = await db.subscriptions.toArray();
    if (subscriptions.length > 0) {
        console.log(`[migrate] Migrating ${subscriptions.length} subscriptions...`);
        for (const sub of subscriptions) {
            const { id, ...data } = sub;
            await api.create('subscriptions', { ...data, id });
        }
    }

    // Migrate tariffs
    const tariffs = await db.tariffs.toArray();
    if (tariffs.length > 0) {
        console.log(`[migrate] Migrating ${tariffs.length} tariffs...`);
        for (const tariff of tariffs) {
            const { id, ...data } = tariff;
            await api.create('tariffs', { ...data, id });
        }
    }

    console.log('[migrate] Migration complete!');
}
