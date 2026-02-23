import { RateLimiter, MINUTE, HOUR, SECOND } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
    // --- Authentication ---
    // Login attempts per Telegram user ID: 10 per minute, burst of 5
    login: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 5 },

    // Backdoor login: very strict — 3 attempts per hour per secret guess
    backdoorLogin: { kind: "fixed window", rate: 3, period: HOUR },

    // Failed login attempts (applied after auth failure): 5 per hour
    failedLogin: { kind: "token bucket", rate: 5, period: HOUR, capacity: 5 },

    // --- Data mutations ---
    // General write operations per user: 60 per minute, burst of 10
    mutate: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 10 },

    // Bulk operations (bulkCreate, generateMore, syncFromSchedule): stricter
    bulkMutate: { kind: "token bucket", rate: 5, period: MINUTE, capacity: 3 },

    // --- Calendar export ---
    // Calendar HTTP endpoint: per-token, 30 requests per minute
    calendarExport: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 5 },

    // --- Global safety net ---
    // Global write rate across all users: 300 per minute
    globalWrite: { kind: "fixed window", rate: 300, period: MINUTE },
});
