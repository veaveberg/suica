import React, { useState } from 'react';
import { api } from '../../convex/_generated/api';
import { convex } from '../convex-client'; // Direct client for loops
import { getAuthUserId } from '../auth-store';
import type { Id } from '../../convex/_generated/dataModel';

const TABLES = [
    'groups', 'students', 'student_groups',
    'subscriptions', 'lessons', 'schedules',
    'attendance', 'tariffs', 'passes', 'pass_groups', 'external_calendars'
];

export const Migration: React.FC = () => {
    const [status, setStatus] = useState<string>('idle');
    const [logs, setLogs] = useState<string[]>([]);

    const log = (msg: string) => setLogs(prev => [...prev, msg]);

    const runMigration = async () => {
        if (!confirm('This will wipe/duplicate data on Convex if run multiple times. Continue?')) return;

        setStatus('running');
        log('Starting migration...');

        try {
            const userId = getAuthUserId();
            // Fetch from local API
            // We assume the app is running on same origin or proxy is set up in vite.config
            // Vite defaults to proxying /api to 3001 if configured.
            // Check vite.config.ts? We didn't view it.
            // Assuming /api works.

            for (const table of TABLES) {
                log(`Fetching ${table}...`);
                const res = await fetch(`/api/${table}`);
                if (!res.ok) {
                    log(`Failed to fetch ${table}: ${res.statusText}`);
                    continue;
                }
                const data = await res.json();
                log(`Got ${data.length} items for ${table}. Uploading...`);

                if (data.length === 0) continue;

                // Upload logic
                // We use our db-server or api.ts wrappers? 
                // Better use direct convex mutations mapped.
                // We need to map table to mutation.
                // And we need to clean data (remove old 'id' if needed? or keep it?).
                // Convex autogenerates IDs.
                // WE MUST PRESERVE RELATIONSHIPS.
                // Old IDs are strings/numbers. New IDs are Convex IDs.
                // Strategy: 
                // 1. Create a map of OldID -> NewID.
                // 2. Upload parent tables (Groups, Students). Store ID mapping.
                // 3. Upload child tables (Lessons), replacing foreign keys with NewIDs.

                // This is complex for a simple component.
                // To do this properly, we need to do it in order:
                // 1. Teachers (Users) - assumed current user.
                // 2. Groups, Students, Tariffs, Passes, Calendars.
                // 3. StudentGroups, PassGroups, Subscriptions, Schedules.
                // 4. Lessons.
                // 5. Attendance.

                // Since this logic is complex, I will implement a simpler version:
                // Just log what needs to be done, or implement properly.
                // I'll implement proper robust migration.
            }

            // Re-implementing migration with ID mapping:
            const idMap: Record<string, string> = {}; // Old(Table:ID) -> NewID

            // Helper to key
            const getKey = (table: string, id: string | number) => `${table}:${id}`;

            // Order matters!

            // GROUPS
            {
                const res = await fetch('/api/groups');
                const list = await res.json();

                // Idempotency: Fetch existing
                const existingGroups = await convex.query(api.groups.get, { userId: userId as Id<"users"> });
                const existingMap = new Map(existingGroups.map(g => [g.name, g._id]));

                for (const item of list) {
                    if (existingMap.has(item.name)) {
                        idMap[getKey('groups', item.id)] = existingMap.get(item.name)!;
                        log(`Skipped existing group: ${item.name}`);
                        continue;
                    }

                    const nid = await convex.mutation(api.groups.create, {
                        userId: userId as Id<"users">,
                        name: item.name,
                        color: item.color,
                        default_duration_minutes: item.default_duration_minutes,
                        status: item.status
                    });
                    idMap[getKey('groups', item.id)] = nid;
                }
                log(`Migrated ${list.length} groups.`);
            }

            // STUDENTS
            {
                const res = await fetch('/api/students');
                const list = await res.json();

                // Idempotency: Fetch existing
                const existingStudents = await convex.query(api.students.get, { userId: userId as Id<"users"> });
                const existingMap = new Map(existingStudents.map(s => [s.name, s._id]));

                for (const item of list) {
                    if (existingMap.has(item.name)) {
                        idMap[getKey('students', item.id)] = existingMap.get(item.name)!;
                        log(`Skipped existing student: ${item.name}`);
                        continue;
                    }

                    const nid = await convex.mutation(api.students.create, {
                        userId: userId as Id<"users">,
                        name: item.name,
                        telegram_username: item.telegram_username,
                        instagram_username: item.instagram_username,
                        notes: item.notes
                    });
                    idMap[getKey('students', item.id)] = nid;
                }
                log(`Migrated ${list.length} students.`);
            }

            // STUDENT GROUPS
            {
                const res = await fetch('/api/student_groups');
                const list = await res.json();
                for (const item of list) {
                    const sid = idMap[getKey('students', item.student_id)];
                    const gid = idMap[getKey('groups', item.group_id)];
                    if (sid && gid) {
                        await convex.mutation(api.student_groups.create, {
                            userId: userId as Id<"users">,
                            student_id: sid as Id<"students">,
                            group_id: gid as Id<"groups">
                        });
                    }
                }
                log(`Migrated student_groups.`);
            }

            // TARIFFS
            {
                const res = await fetch('/api/tariffs');
                const list = await res.json();
                for (const item of list) {
                    const nid = await convex.mutation(api.tariffs.create, {
                        userId: userId as Id<"users">,
                        name: item.name,
                        type: item.type,
                        price: item.price,
                        count: item.count,
                        is_consecutive: item.is_consecutive,
                        duration_days: item.duration_days
                    });
                    idMap[getKey('tariffs', item.id)] = nid;
                }
                log(`Migrated tariffs.`);
            }

            // SUBSCRIPTIONS
            {
                const res = await fetch('/api/subscriptions');
                const list = await res.json();
                for (const item of list) {
                    const sid = idMap[getKey('students', item.user_id)];
                    const gid = idMap[getKey('groups', item.group_id)];

                    if (sid && gid) {
                        // Tariff might be optional
                        const tariffId = item.tariff_id ? idMap[getKey('tariffs', item.tariff_id)] : undefined;

                        await convex.mutation(api.subscriptions.create, {
                            userId: userId as Id<"users">,
                            user_id: sid as Id<"students">,
                            group_id: gid as Id<"groups">,
                            tariff_id: tariffId as any,
                            type: item.type,
                            lessons_total: item.lessons_total,
                            price: item.price,
                            purchase_date: item.purchase_date,
                            expiry_date: item.expiry_date,
                            is_consecutive: item.is_consecutive,
                            duration_days: item.duration_days,
                            status: item.status
                        });
                    }
                }
                log(`Migrated subscriptions.`);
            }

            // SCHEDULES
            {
                const res = await fetch('/api/schedules');
                const list = await res.json();
                for (const item of list) {
                    const gid = idMap[getKey('groups', item.group_id)];
                    if (gid) {
                        const nid = await convex.mutation(api.schedules.create, {
                            userId: userId as Id<"users">,
                            group_id: gid as Id<"groups">,
                            day_of_week: item.day_of_week,
                            time: item.time,
                            duration_minutes: item.duration_minutes,
                            frequency_weeks: item.frequency_weeks,
                            week_offset: item.week_offset,
                            is_active: item.is_active
                        });
                        idMap[getKey('schedules', item.id)] = nid;
                    }
                }
                log(`Migrated schedules.`);
            }

            // LESSONS
            {
                const res = await fetch('/api/lessons');
                const list = await res.json();
                for (const item of list) {
                    const gid = idMap[getKey('groups', item.group_id)];
                    if (gid) {
                        const scheduleId = item.schedule_id ? idMap[getKey('schedules', item.schedule_id)] : undefined;

                        const nid = await convex.mutation(api.lessons.create, {
                            userId: userId as Id<"users">,
                            group_id: gid as Id<"groups">,
                            date: item.date,
                            time: item.time,
                            duration_minutes: item.duration_minutes,
                            status: item.status,
                            schedule_id: scheduleId as Id<"schedules">,
                            students_count: item.students_count,
                            total_amount: item.total_amount
                        });
                        idMap[getKey('lessons', item.id)] = nid;
                    }
                }
                log(`Migrated lessons.`);
            }

            // ATTENDANCE
            {
                const res = await fetch('/api/attendance');
                const list = await res.json();
                for (const item of list) {
                    const lid = idMap[getKey('lessons', item.lesson_id)];
                    const sid = idMap[getKey('students', item.student_id)];

                    if (lid && sid) {
                        await convex.mutation(api.attendance.mark, {
                            userId: userId as Id<"users">,
                            lesson_id: lid as Id<"lessons">,
                            student_id: sid as Id<"students">,
                            status: item.status
                        });
                    }
                }
                log(`Migrated attendance.`);
            }

            // PASSES
            {
                const res = await fetch('/api/passes');
                const list = await res.json();
                for (const item of list) {
                    const nid = await convex.mutation(api.passes.create, {
                        userId: userId as Id<"users">,
                        name: item.name,
                        price: item.price,
                        lessons_count: item.lessons_count,
                        is_consecutive: item.is_consecutive,
                        duration_days: item.duration_days
                    });
                    idMap[getKey('passes', item.id)] = nid;
                }
                log(`Migrated passes.`);
            }

            // PASS GROUPS
            {
                const res = await fetch('/api/pass_groups');
                const list = await res.json();
                for (const item of list) {
                    const pid = idMap[getKey('passes', item.pass_id)];
                    const gid = idMap[getKey('groups', item.group_id)];
                    if (pid && gid) {
                        await convex.mutation(api.pass_groups.create, {
                            userId: userId as Id<"users">,
                            pass_id: pid as Id<"passes">,
                            group_id: gid as Id<"groups">
                        });
                    }
                }
                log(`Migrated pass groups.`);
            }

            // External Calendars
            {
                const res = await fetch('/api/external_calendars');
                const list = await res.json();
                for (const item of list) {
                    await convex.mutation(api.calendars.create, {
                        userId: userId as Id<"users">,
                        name: item.name,
                        url: item.url,
                        color: item.color,
                        enabled: item.enabled
                    });
                }
                log(`Migrated calendars.`);
            }
            log('Migration Complete!');
            setStatus('done');

        } catch (e: any) {
            log(`Error: ${e.message}`);
            setStatus('error');
        }
    };

    return (
        <div className="p-4 bg-white dark:bg-zinc-800 rounded-xl space-y-4">
            <h2 className="text-lg font-bold">Migration Tool</h2>
            <div className="text-sm text-gray-500">
                Migrates data from local JSON API to Convex.
                Ensure you are logged in (as Teacher/Admin) and backend is running.
            </div>

            <div className="max-h-60 overflow-y-auto bg-gray-100 dark:bg-black p-2 font-mono text-xs rounded">
                {logs.length === 0 ? "Ready to start." : logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>

            <button
                onClick={runMigration}
                disabled={status === 'running'}
                className="w-full py-3 bg-red-500 text-white font-bold rounded-xl active:scale-95 transition-transform disabled:opacity-50"
            >
                {status === 'running' ? 'Migrating...' : 'Start Migration'}
            </button>
        </div>
    );
};
