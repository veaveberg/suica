
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL || "https://flexible-leopard-684.convex.cloud");

const fromUserId = "129516266";
const toUserId = "606365821";

async function run() {
    console.log(`Starting copy from ${fromUserId} to ${toUserId}...`);
    try {
        const result = await client.mutation(api.migrations.copy_groups_schedules.copy, {
            fromUserId,
            toUserId,
        });
        console.log("Copy complete!", result);
    } catch (error) {
        console.error("Migration failed:", error);
    }
}

run();
