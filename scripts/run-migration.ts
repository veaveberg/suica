
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL || "https://flexible-leopard-684.convex.cloud");

async function main() {
    const fromToken = "222222";
    const toToken = "129516266";

    console.log(`Starting migration from ${fromToken} to ${toToken}...`);

    try {
        const result = await client.mutation(api.migrations.transfer_user_data.transfer, {
            fromToken,
            toToken,
        });
        console.log("Migration successful:", result);
    } catch (error) {
        console.error("Migration failed:", error);
    }
}

main();
