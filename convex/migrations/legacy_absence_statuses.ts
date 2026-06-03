import { mutation } from "../_generated/server";

export const renameCurrentAbsencesToLegacy = mutation({
    args: {},
    handler: async (ctx) => {
        const records = await ctx.db.query("attendance").collect();
        const renamed = {
            absence_valid: 0,
            absence_invalid: 0,
        };

        for (const record of records) {
            if (record.status === "absence_valid") {
                await ctx.db.patch(record._id, { status: "old_absence_valid" });
                renamed.absence_valid += 1;
            } else if (record.status === "absence_invalid") {
                await ctx.db.patch(record._id, { status: "old_absence_invalid" });
                renamed.absence_invalid += 1;
            }
        }

        return {
            success: true,
            renamed,
        };
    },
});
