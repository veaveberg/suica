import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    users: defineTable({
        tokenIdentifier: v.string(),
        name: v.optional(v.string()),
        username: v.optional(v.string()),
        instagram_username: v.optional(v.string()), // Teacher's IG profile handle (e.g. for button in student view)
        role: v.union(v.literal("admin"), v.literal("teacher"), v.literal("student")),
        studentId: v.optional(v.id("students")),
    }).index("by_token", ["tokenIdentifier"])
        .index("by_username", ["username"]),

    groups: defineTable({
        name: v.string(),
        color: v.string(),
        default_duration_minutes: v.number(),
        status: v.union(v.literal("active"), v.literal("archived")),
        last_class_date: v.optional(v.string()),
        userId: v.string(), // The teacher (owner)
    }).index("by_user", ["userId"]),

    students: defineTable({
        name: v.string(),
        telegram_username: v.optional(v.string()),
        telegram_id: v.optional(v.string()),
        instagram_username: v.optional(v.string()),
        notes: v.optional(v.string()),
        balance_notes: v.optional(v.string()),
        userId: v.string(), // The teacher (owner)
    })
        .index("by_user", ["userId"])
        .index("by_telegram_id", ["telegram_id"])
        .index("by_telegram_username", ["telegram_username"]),

    student_groups: defineTable({
        student_id: v.id("students"),
        group_id: v.id("groups"),
        userId: v.string(),
    })
        .index("by_user", ["userId"])
        .index("by_student_group", ["student_id", "group_id"]),

    subscriptions: defineTable({
        user_id: v.id("students"), // This maps to 'students' table, kept name 'user_id' to match old schema but it's confusing. Let's keep it for now but type is ID.
        group_id: v.id("groups"),
        tariff_id: v.optional(v.union(v.id("tariffs"), v.id("passes"))),
        type: v.string(),
        lessons_total: v.number(),
        price: v.number(),
        purchase_date: v.string(),
        expiry_date: v.optional(v.string()),
        is_consecutive: v.boolean(),
        duration_days: v.optional(v.number()),
        status: v.union(v.literal("active"), v.literal("archived")),
        userId: v.string(), // Owner
    }).index("by_user", ["userId"]),

    lessons: defineTable({
        group_id: v.id("groups"),
        date: v.string(),
        time: v.string(),
        duration_minutes: v.number(),
        status: v.union(v.literal("upcoming"), v.literal("cancelled"), v.literal("completed")),
        schedule_id: v.optional(v.id("schedules")),
        students_count: v.number(),
        total_amount: v.number(),
        notes: v.optional(v.string()),
        info_for_students: v.optional(v.string()),
        userId: v.string(),
    })
        .index("by_user", ["userId"])
        .index("by_group_date", ["group_id", "date"]),

    schedules: defineTable({
        group_id: v.id("groups"),
        day_of_week: v.number(),
        time: v.string(),
        duration_minutes: v.optional(v.number()),
        frequency_weeks: v.optional(v.number()),
        week_offset: v.optional(v.number()),
        is_active: v.boolean(),
        userId: v.string(),
    }).index("by_user", ["userId"]),

    attendance: defineTable({
        lesson_id: v.id("lessons"),
        student_id: v.id("students"),
        status: v.union(v.literal("present"), v.literal("absence_valid"), v.literal("absence_invalid")),
        payment_amount: v.optional(v.number()),
        userId: v.string(),
    })
        .index("by_user", ["userId"])
        .index("by_lesson_student", ["lesson_id", "student_id"]),

    tariffs: defineTable({
        name: v.string(),
        type: v.string(),
        price: v.number(),
        count: v.number(),
        is_consecutive: v.boolean(),
        duration_days: v.optional(v.number()),
        userId: v.string(),
    }).index("by_user", ["userId"]),

    passes: defineTable({
        name: v.string(),
        price: v.number(),
        lessons_count: v.number(),
        is_consecutive: v.boolean(),
        duration_days: v.optional(v.number()),
        userId: v.string(),
    }).index("by_user", ["userId"]),

    pass_groups: defineTable({
        pass_id: v.id("passes"),
        group_id: v.id("groups"),
        userId: v.string(),
    }).index("by_user", ["userId"]),

    external_calendars: defineTable({
        name: v.string(),
        url: v.string(),
        color: v.string(),
        enabled: v.boolean(),
        lastFetched: v.optional(v.string()), // ISO string
        userId: v.string(),
    }).index("by_user", ["userId"]),
});
