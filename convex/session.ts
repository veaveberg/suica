import type { Doc, Id } from "./_generated/dataModel";

declare const process: { env: { [key: string]: string | undefined } };

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

type SessionRole = Doc<"users">["role"];

export type SessionClaims = {
    userId: Id<"users">;
    role: SessionRole;
    exp: number;
};

function getSessionSecretOrThrow(): string {
    const secret = process.env.SUICA_SESSION_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error("SUICA_SESSION_SECRET must contain at least 32 characters");
    }
    return secret;
}

function toHex(bytes: Uint8Array): string {
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(key: string, payload: string): Promise<string> {
    const encoded = new TextEncoder().encode(key);
    const rawKey = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        rawKey,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(payload));
    return toHex(new Uint8Array(signature));
}

function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

export async function createSessionToken(userId: Id<"users">, role: SessionRole): Promise<string> {
    const secret = getSessionSecretOrThrow();

    const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
    const payload = `uid=${encodeURIComponent(String(userId))}&r=${encodeURIComponent(role)}&exp=${exp}`;
    const sig = await hmacSha256Hex(secret, payload);
    return `v1.${payload}.${sig}`;
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
    const secret = getSessionSecretOrThrow();

    const parts = token.split(".");
    if (parts.length < 3 || parts[0] !== "v1") return null;

    const sig = parts[parts.length - 1];
    const payload = parts.slice(1, -1).join(".");

    const expected = await hmacSha256Hex(secret, payload);
    if (!safeEqual(expected, sig)) return null;

    const params = new URLSearchParams(payload);
    const uid = params.get("uid");
    const role = params.get("r");
    const expRaw = params.get("exp");
    if (!uid || !role || !expRaw) return null;

    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
    if (role !== "admin" && role !== "teacher" && role !== "student") return null;

    return {
        userId: decodeURIComponent(uid) as Id<"users">,
        role: role as SessionRole,
        exp,
    };
}
