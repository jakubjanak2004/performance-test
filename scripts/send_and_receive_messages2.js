import {
    MESSAGES_PER_ITER,
    TEST_DURATION,
    TEST_USER_PREFIX,
    TEST_USER_USERNAME_START,
    WS_RECEIVER_PING_SECONDS,
    WS_RECEIVER_VUS,
    WS_WAIT_TIMEOUT_MS
} from "../setup/config.js";
import {check, sleep} from "k6";
import {createChat, sendMessage} from "../setup/chats.js";
import {loginOrSignup} from "../setup/auth.js";
import {connectAndSubscribe, fetchAllMessagesForChat, randomId, waitUntil} from "../setup/ws.js";
import { parseDurationSeconds } from "../setup/utils.js";

// todo make vus grow gradually, steps
export const options = {
    scenarios: {
        ws_receivers: {
            executor: "constant-vus",
            vus: WS_RECEIVER_VUS,
            duration: TEST_DURATION,
            exec: "wsReceivers",
        },
        http_senders: {
            executor: "constant-vus",
            vus: WS_RECEIVER_VUS,
            duration: TEST_DURATION,
            exec: "httpSenders",
        },
    },
};


export function setup() {
    // setup users
    const tokensByUsername = {};
    const memberUsernames = [];

    for (let i = 0; i < WS_RECEIVER_VUS; i++) {
        const username = `${TEST_USER_PREFIX}${Number(TEST_USER_USERNAME_START) + i}`;
        memberUsernames.push(username);
        tokensByUsername[username] = loginOrSignup(username);
    }

    // Create one group chat containing all members.
    // Owner is the first user; membersList excludes the owner (backend also filters it out).
    const ownerUsername = memberUsernames[0];
    const ownerToken = tokensByUsername[ownerUsername];
    const chat = createChat(ownerToken, memberUsernames.slice(1), { name: "k6-big-group" });
    const runTag = `k6run-${Date.now()}-${randomId(6)}`;

    return {
        chatId: chat.id,
        tokensByUsername,
        memberUsernames,
        runTag
    };
}

export function httpSenders(data) {
    const username = data.memberUsernames[(__VU - 1) % data.memberUsernames.length];
    const token = data.tokensByUsername[username];
    const chatId = data.chatId;

    if (!token) {
        console.error('Was unable to login or signup')
        return;
    }
    if (!chatId) {
        console.error('Was unable to create chat')
        return;
    }

    // sending messages to a chat
    for (let i = 0; i < MESSAGES_PER_ITER; i++) {
        const replyToId = null;
        const baseContent = `${data.runTag}|vu=${__VU}|iter=${__ITER}|msg=${i}`;
        const sentMessage = sendMessage(token, chatId, baseContent, replyToId);
        if (!sentMessage?.id) continue;
        sendMessage(token, chatId, `${data.runTag}|vu=${__VU}|iter=${__ITER}|reply=${i}`, sentMessage.id);
    }
}

export function wsReceivers(data) {
    const username = data.memberUsernames[__VU - 1];
    const token = data.tokensByUsername[username];
    if (!token || !data.chatId) return;
    const receivedWsIds = new Set();

    const conn = connectAndSubscribe(token, (msg) => {
        // Only observe this test run payloads.
        if (!msg || msg.chatId !== data.chatId) return;
        if (typeof msg.content !== "string") return;
        if (!msg.content.startsWith(data.runTag)) return;
        if (msg.id !== undefined && msg.id !== null) {
            receivedWsIds.add(String(msg.id));
        }
    });

    const wsReady = waitUntil(() => conn.subscribed && !conn.closed, WS_WAIT_TIMEOUT_MS);
    check({ wsReady }, { "ws receiver: subscribed": (r) => r.wsReady === true });
    if (!wsReady) return;

    // Leave buffer before scenario hard-stop so validation can run.
    const receiverDurationMs = Math.max(1, Math.floor(parseDurationSeconds(TEST_DURATION) * 1000));
    const shutdownBufferMs = 5000;
    const runForMs = Math.max(1000, receiverDurationMs - shutdownBufferMs);
    const endAt = Date.now() + runForMs;
    while (!conn.closed && Date.now() < endAt) {
        sleep(Math.max(1, WS_RECEIVER_PING_SECONDS || 1));
    }

    // End receiver cleanly, allow in-flight frames, then compare WS-delivered IDs with chat history IDs.
    try { conn.ws.close(); } catch (_) {}
    sleep(1);

    const chatMessages = fetchAllMessagesForChat(token, data.chatId);
    const expectedIds = new Set(
        chatMessages
            .filter((m) => typeof m?.content === "string" && m.content.startsWith(data.runTag))
            .map((m) => String(m.id))
    );

    let missingCount = 0;
    for (const id of expectedIds) {
        if (!receivedWsIds.has(id)) missingCount += 1;
    }

    check(
        { expected: expectedIds.size, received: receivedWsIds.size, missing: missingCount },
        {
            "ws receiver: all run-tagged chat messages received": (r) => r.expected > 0 && r.missing === 0,
        }
    );
}