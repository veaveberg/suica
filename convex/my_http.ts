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
        } else if (user.role === "student") {
            // Find all student records for this user (they might be students of multiple teachers)
            const myStudentRecords = await ctx.db
                .query("students")
                .withIndex("by_telegram_id", (q) => q.eq("telegram_id", user!.tokenIdentifier))
                .collect();

            const seenLessonIds = new Set<string>();

            for (const studentRec of myStudentRecords) {
                const studentGroups = await ctx.db
                    .query("student_groups")
                    .withIndex("by_student_group", (q) => q.eq("student_id", studentRec._id))
                    .collect();

                for (const sg of studentGroups) {
                    const groupLessons = await ctx.db
                        .query("lessons")
                        .withIndex("by_group_date", q => q.eq("group_id", sg.group_id))
                        .collect();

                    // Filter lessons based on enrollment date - 5 days
                    const enrollmentTime = sg._creationTime;
                    const cutoffTime = enrollmentTime - (5 * 24 * 60 * 60 * 1000); // 5 days ago
                    const cutoffDate = new Date(cutoffTime).toISOString().split('T')[0];

                    const authorizedLessons = groupLessons.filter(l => l.date >= cutoffDate);

                    for (const l of authorizedLessons) {
                        if (seenLessonIds.has(l._id)) continue;
                        seenLessonIds.add(l._id);
                        lessons.push(l);
                    }
                }
            }
        }

        // 3. Fetch Groups for names
        // 3. Fetch Groups and Teachers for names
        const groups = await ctx.db.query("groups").collect();
        const groupMap = new Map();
        const teacherTokens = new Set<string>();

        for (const g of groups) {
            groupMap.set(g._id, g);
            teacherTokens.add(g.userId); // userId in groups table is the tokenIdentifier
        }

        // Fetch teachers to map names
        // We can't query "by_token" in a simple `in` clause, so we fetch in parallel or filterall (filtering all is slow)
        // Since we have a list of tokens, Promise.all is reasonable if not too many teachers.
        // Assuming reasonably small number of teachers for now.
        const teachers = await Promise.all(
            Array.from(teacherTokens).map(token =>
                ctx.db.query("users").withIndex("by_token", q => q.eq("tokenIdentifier", token)).first()
            )
        );
        const teacherMap = new Map();
        for (const t of teachers) {
            if (t) teacherMap.set(t.tokenIdentifier, t.name || "Teacher");
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
            // const startStr = `${lesson.date}T${lesson.time}:00`;
            // We assume local time for simplicity or interpret as UTC? 
            // The app effectively treats these as "Floating" time or local time.
            // ICS best practice for floating time: YYYYMMDDTHHMMSS (no 'Z')

            // const dtStart = startStr.replace(/[-:]/g, "");

            // Calculate End
            // const startDate = new Date(startStr);
            // const endDate = new Date(startDate.getTime() + lesson.duration_minutes * 60000);

            // const endStr = endDate.toISOString().split('.')[0]; // YYYY-MM-DDTHH:mm:ss
            // However, we want floating time to match start.
            // Javascript Date is tricky.

            // Manual calc to avoid TZ issues
            const [y, m, d] = lesson.date.split("-").map(Number);
            const [h, min] = lesson.time.split(":").map(Number);

            // const startTotalMin = h * 60 + min;
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

            const teacherName = group ? teacherMap.get(group.userId) : "";
            const summary = teacherName ? `${groupName}, ${teacherName}` : groupName;
            icsParams.push(`SUMMARY:${summary}`);

            if (group && group.color) {
                // RFC 7986: COLOR property
                icsParams.push(`COLOR:${group.color}`);
                // Legacy / Alternate support
                icsParams.push(`CATEGORIES:${group.name}`);
            }
            const descriptions: string[] = [];
            if (user!.role === "teacher") {
                if (lesson.notes) descriptions.push(lesson.notes);
                if (lesson.info_for_students) descriptions.push(`Students: ${lesson.info_for_students}`);
            } else {
                if (lesson.info_for_students) descriptions.push(lesson.info_for_students);
            }

            if (descriptions.length > 0) {
                icsParams.push(`DESCRIPTION:${descriptions.join('\\n')}`);
            }
            icsParams.push("END:VEVENT");
        }

        icsParams.push("END:VCALENDAR");

        return icsParams.join("\r\n");
    },
});
