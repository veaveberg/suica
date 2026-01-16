import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";

export const generateIcs = internalQuery({
    args: { userId: v.string(), groupId: v.optional(v.string()) }, // Receiving string ID from HTTP handler
    handler: async (ctx, args) => {
        // 1. Find User by ID (We need to search by ID, but IDs are specific types. 
        //    We'll try to get it directly if it's a valid ID format, or search by token/etc if that was passed.
        //    Since we passed the Convex ID string, we can try `ctx.db.get(id)`.
        let user: Doc<"users"> | null = null;
        try {
            // We cast args.userId to Id<"users">. 
            // If the ID is invalid (e.g. from wrong table), get() might throw or return null.
            user = await ctx.db.get(args.userId as Id<"users">);
        } catch (e) {
            return null;
        }

        if (!user) return null;

        let lessons: Doc<"lessons">[] = [];

        // 2. Fetch Lessons based on role
        if (user.role === "teacher") {
            lessons = await ctx.db
                .query("lessons")
                .withIndex("by_user", (q) => q.eq("userId", user!.tokenIdentifier))
                .collect();
        } else if (user.role === "student" && user.studentId) {
            // ... (Reusing logic from lessons.ts) ...
            const studentGroups = await ctx.db
                .query("student_groups")
                .withIndex("by_student_group", (q) => q.eq("student_id", user!.studentId!))
                .collect();
            const groupIds = studentGroups.map(sg => sg.group_id);

            for (const gid of groupIds) {
                const groupLessons = await ctx.db
                    .query("lessons")
                    .withIndex("by_group_date", q => q.eq("group_id", gid))
                    .collect();
                lessons.push(...groupLessons);
            }
        }

        // 3. Fetch Groups for names
        const groups = await ctx.db.query("groups").collect(); // Optimize this to fetch only needed? 
        // For now, load all groups to map names easily.
        const groupMap = new Map();
        for (const g of groups) {
            groupMap.set(g._id, g);
        }

        // Filter by Group ID if provided
        if (args.groupId) {
            lessons = lessons.filter(l => l.group_id === args.groupId);
        }

        // 4. Generate ICS String
        const targetGroup = args.groupId ? groupMap.get(args.groupId as any) : null;
        const calName = targetGroup ? `Suica: ${targetGroup.name}` : "Suica Lessons";

        let icsParams = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Suica//Lessons//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "X-WR-CALNAME:" + calName,
            "X-WR-TIMEZONE:Asia/Tbilisi", // Hardcoded for now based on user location context implying Georgia apps usually? Or UTC? 
            // Best practice is UTC with 'Z'
        ];

        for (const lesson of lessons) {
            if (lesson.status === 'cancelled') continue;

            const group = groupMap.get(lesson.group_id);
            const groupName = group ? group.name : "Unknown Group";

            // Date handling
            // stored as date: "YYYY-MM-DD", time: "HH:mm"
            const startStr = `${lesson.date}T${lesson.time}:00`;
            // We assume local time for simplicity or interpret as UTC? 
            // The app effectively treats these as "Floating" time or local time.
            // ICS best practice for floating time: YYYYMMDDTHHMMSS (no 'Z')

            // const dtStart = startStr.replace(/[-:]/g, "");

            // Calculate End
            const startDate = new Date(startStr);
            const endDate = new Date(startDate.getTime() + lesson.duration_minutes * 60000);

            // const endStr = endDate.toISOString().split('.')[0]; // YYYY-MM-DDTHH:mm:ss
            // However, we want floating time to match start.
            // Javascript Date is tricky.

            // Manual calc to avoid TZ issues
            const [y, m, d] = lesson.date.split("-").map(Number);
            const [h, min] = lesson.time.split(":").map(Number);

            const startTotalMin = h * 60 + min;
            // const endTotalMin = startTotalMin + lesson.duration_minutes;

            // Re-using Date object but formatting strictly as floating local
            const sDate = new Date(y, m - 1, d, h, min);
            const eDate = new Date(sDate.getTime() + lesson.duration_minutes * 60000);

            const formatICSDate = (date: Date) => {
                const pad = (n: number) => n.toString().padStart(2, '0');
                return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
            };

            const icsStart = formatICSDate(sDate);
            const icsEnd = formatICSDate(eDate);

            icsParams.push("BEGIN:VEVENT");
            icsParams.push(`UID:${lesson._id}@suica.app`);
            icsParams.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`);
            icsParams.push(`DTSTART:${icsStart}`);
            icsParams.push(`DTEND:${icsEnd}`);
            icsParams.push(`SUMMARY:${groupName}`);
            if (group && group.color) {
                // RFC 7986: COLOR property
                icsParams.push(`COLOR:${group.color}`);
                // Legacy / Alternate support
                icsParams.push(`CATEGORIES:${group.name}`);
            }
            if (lesson.notes) icsParams.push(`DESCRIPTION:${lesson.notes}`);
            icsParams.push("END:VEVENT");
        }

        icsParams.push("END:VCALENDAR");

        return icsParams.join("\r\n");
    },
});
