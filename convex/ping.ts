import { query } from "./_generated/server";

export const pong = query({
    args: {},
    handler: async () => {
        return "pong";
    },
});
