import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureTeacher, ensureTeacherOrStudent } from "./permissions";

export const get = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const user = await ensureTeacherOrStudent(ctx, args.userId);

        if (user.role === "admin") {
            return await ctx.db.query("lessons").collect();
        }

        const lessons = [];
        const seenIds = new Set<string>();

        // 1. If teacher, get owned lessons
        if (user.role === "teacher") {
            const owned = await ctx.db
                .query("lessons")
                .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
                .collect();
            for (const l of owned) {
                if (!seenIds.has(l._id)) {
                    lessons.push(l);
                    seenIds.add(l._id);
                }
            }
        }

        // 2. Find all student records for this user (they might be students of multiple teachers)
        const myStudentRecords = await ctx.db
            .query("students")
            .withIndex("by_telegram_id", (q) => q.eq("telegram_id", user.tokenIdentifier))
            .collect();

        for (const studentRec of myStudentRecords) {
            const studentGroups = await ctx.db
                .query("student_groups")
                .withIndex("by_student_group", (q) => q.eq("student_id", studentRec._id))
                .collect();

            // Threshold: 5 days before the student was added
            const addedTime = studentRec._creationTime;
            const buffer = 5 * 24 * 60 * 60 * 1000;
            const thresholdDate = new Date(addedTime - buffer).toISOString().split('T')[0];

            const groupIds = studentGroups.map(sg => sg.group_id);
            for (const gid of groupIds) {
                const groupLessons = await ctx.db
                    .query("lessons")
                    .withIndex("by_group_date", q => q.eq("group_id", gid).gte("date", thresholdDate))
                    .collect();

                for (const l of groupLessons) {
                    if (!seenIds.has(l._id)) {
                        lessons.push(l);
                        seenIds.add(l._id);
                    }
                }
            }
        }

        const lessonsWithTeacher = [];
        for (const l of lessons) {
            const owner = await ctx.db
                .query("users")
                .withIndex("by_token", q => q.eq("tokenIdentifier", l.userId))
                .first();
            lessonsWithTeacher.push({
                ...l,
                teacherName: owner?.name || "Teacher"
            });
        }

        return lessonsWithTeacher;
    },
});

export const create = mutation({
    args: {
        userId: v.id("users"),
        group_id: v.id("groups"),
        date: v.string(),
        time: v.string(),
        duration_minutes: v.number(),
        status: v.union(v.literal("upcoming"), v.literal("cancelled"), v.literal("completed")),
        schedule_id: v.optional(v.id("schedules")),
        students_count: v.optional(v.number()), // Calculated?
        total_amount: v.optional(v.number()),
        info_for_students: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

        return await ctx.db.insert("lessons", {
            group_id: args.group_id,
            date: args.date,
            time: args.time,
            duration_minutes: args.duration_minutes,
            status: args.status,
            schedule_id: args.schedule_id,
            students_count: args.students_count || 0,
            total_amount: args.total_amount || 0,
            info_for_students: args.info_for_students,
            userId: user.tokenIdentifier,
        });
    },
});

export const update = mutation({
    args: {
        userId: v.id("users"),
        id: v.id("lessons"),
        updates: v.object({
            date: v.optional(v.string()),
            time: v.optional(v.string()),
            duration_minutes: v.optional(v.number()),
            status: v.optional(v.union(v.literal("upcoming"), v.literal("cancelled"), v.literal("completed"))),
            schedule_id: v.optional(v.id("schedules")),
            students_count: v.optional(v.number()),
            total_amount: v.optional(v.number()),
            notes: v.optional(v.string()),
            info_for_students: v.optional(v.string()),
        }),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const lesson = await ctx.db.get(args.id);

        if (!lesson) throw new Error("Lesson not found");
        if (lesson.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        await ctx.db.patch(args.id, args.updates);
    },
});

export const remove = mutation({
    args: {
        userId: v.id("users"),
        id: v.id("lessons"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const lesson = await ctx.db.get(args.id);

        if (!lesson) throw new Error("Lesson not found");
        if (lesson.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        await ctx.db.delete(args.id);
    },
});

// Bulk Create for generation
export const bulkCreate = mutation({
    args: {
        userId: v.id("users"),
        lessons: v.array(v.object({
            group_id: v.id("groups"),
            date: v.string(),
            time: v.string(),
            duration_minutes: v.number(),
            status: v.union(v.literal("upcoming"), v.literal("cancelled"), v.literal("completed")),
            schedule_id: v.optional(v.id("schedules")),
            students_count: v.optional(v.number()),
            total_amount: v.optional(v.number()),
            info_for_students: v.optional(v.string()),
        }))
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

        for (const lesson of args.lessons) {
            await ctx.db.insert("lessons", {
                ...lesson,
                userId: user.tokenIdentifier,
                students_count: lesson.students_count || 0,
                total_amount: lesson.total_amount || 0
            });
        }
    }
});

// Sync lessons from schedule (Align events)
export const syncFromSchedule = mutation({
    args: {
        userId: v.id("users"),
        today: v.string(), // YYYY-MM-DD
        groupId: v.optional(v.id("groups")),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

        const groupsToSync = args.groupId
            ? [await ctx.db.get(args.groupId)]
            : await ctx.db
                .query("groups")
                .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
                .filter(q => q.eq(q.field("status"), "active"))
                .collect();

        const allSchedules = await ctx.db
            .query("schedules")
            .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
            .collect();

        const REF_MONDAY = 1736121600000; // 2025-01-06 00:00 UTC
        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        const MS_PER_WEEK = 7 * MS_PER_DAY;

        for (const group of groupsToSync) {
            if (!group) continue;

            const groupSchedules = allSchedules.filter(s => s.group_id === group._id && s.is_active);
            if (groupSchedules.length === 0) continue;

            // Get existing upcoming lessons for this group
            const existingLessons = await ctx.db
                .query("lessons")
                .withIndex("by_group_date", q => q.eq("group_id", group._id).gte("date", args.today))
                .filter(q => q.eq(q.field("status"), "upcoming"))
                .collect();

            // Sort existing lessons by date and time
            existingLessons.sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return a.time.localeCompare(b.time);
            });

            // Target slots generation
            const targetSlots: { date: string, time: string, duration: number, scheduleId: any }[] = [];
            const todayDate = new Date(args.today);

            // Generate until we have at least 8 weeks AND enough slots for all existing lessons
            let daysToCheck = 56;
            const minSlotsNeeded = existingLessons.length;

            let d = 0;
            while (d < daysToCheck || targetSlots.length < minSlotsNeeded) {
                const checkDate = new Date(todayDate.getTime() + d * MS_PER_DAY);
                const dateStr = checkDate.toISOString().split('T')[0];

                // If we hit group completion date, stop
                if (group.last_class_date && dateStr > group.last_class_date) break;

                const dayOfWeek = checkDate.getDay();
                const slotsForDay = groupSchedules.filter(s => s.day_of_week === dayOfWeek);

                for (const slot of slotsForDay) {
                    // Frequency check
                    if (slot.frequency_weeks && slot.frequency_weeks > 1) {
                        const diff = checkDate.getTime() - REF_MONDAY;
                        const weeks = Math.floor(diff / MS_PER_WEEK);
                        if ((weeks + (slot.week_offset || 0)) % slot.frequency_weeks !== 0) continue;
                    }

                    targetSlots.push({
                        date: dateStr,
                        time: slot.time,
                        duration: slot.duration_minutes || group.default_duration_minutes,
                        scheduleId: slot._id
                    });
                }

                d++;
                if (d > 365) break; // Safety break
            }

            // Sync existing lessons to target slots
            for (let i = 0; i < targetSlots.length; i++) {
                const slot = targetSlots[i];
                if (i < existingLessons.length) {
                    // Update existing lesson
                    const lesson = existingLessons[i];
                    await ctx.db.patch(lesson._id, {
                        date: slot.date,
                        time: slot.time,
                        duration_minutes: slot.duration,
                        schedule_id: slot.scheduleId
                    });
                } else {
                    // Create new lesson
                    await ctx.db.insert("lessons", {
                        group_id: group._id,
                        userId: user.tokenIdentifier,
                        date: slot.date,
                        time: slot.time,
                        duration_minutes: slot.duration,
                        schedule_id: slot.scheduleId,
                        status: "upcoming",
                        students_count: 0,
                        total_amount: 0
                    });
                }
            }
        }
    }
});
