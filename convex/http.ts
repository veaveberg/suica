import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
    path: "/calendar",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
        const url = new URL(request.url);
        const userId = url.searchParams.get("id");
        const groupId = url.searchParams.get("groupId");

        if (!userId) {
            return new Response("Missing userId", { status: 400 });
        }

        const icsContent = await ctx.runQuery(internal.my_http.generateIcs, {
            userId: userId as any,
            groupId: groupId || undefined
        });

        if (!icsContent) {
            return new Response("User not found or error generating calendar", { status: 404 });
        }

        return new Response(icsContent, {
            status: 200,
            headers: {
                "Content-Type": "text/calendar; charset=utf-8",
                "Content-Disposition": `attachment; filename="suica-calendar.ics"`,
            },
        });
    }),
});

export default http;
