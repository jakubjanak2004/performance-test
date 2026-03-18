import http from "k6/http";
import { check, sleep } from "k6";
import { WebSocket } from "k6/websockets";
import {
    WAIT_SECONDS,
    TEST_USER_PASSWORD,
    BASE_URL,
    TEST_USER_PREFIX,
    MESSAGES_PER_ITER,
    REPLIES_PER_ITER,
    WS_WAIT_TIMEOUT_MS,
    TEST_DURATION,
    WS_RECEIVER_VUS,
    WS_RECEIVER_PING_SECONDS,
    WS_RECEIVER_LOG_SAMPLE_RATE,
    SENDER_MAX_VUS,
    VERIFY_DELIVERY,
    VERIFY_SAMPLE_RATE,
    SENDER_STAGES,
} from "../setup/config.js";
import { login, signUp } from "../setup/auth.js";
import {authHeaders, nowMs, parseDurationSeconds} from "../setup/utils.js";
import {sendMessage} from "../setup/chats";

function defaultSenderStages(totalDuration) {
    // Ramp up 10%, hold 80%, ramp down 10% (in terms of time).
    const totalSec = parseDurationSeconds(totalDuration);
    if (totalSec <= 0) {
        return [
            { duration: "1m", target: 1 },
            { duration: "1m", target: 10 },
            { duration: "1m", target: 20 },
            { duration: "1m", target: 40 },
            { duration: "5m", target: 80 },
            { duration: "1m", target: 40 },
            { duration: "1m", target: 20 },
            { duration: "1m", target: 10 },
            { duration: "1m", target: 1 },
        ];
    }

    const rampSec = Math.max(1, Math.floor(totalSec * 0.1));
    const holdSec = Math.max(1, Math.floor(totalSec * 0.8));
    const downSec = Math.max(1, totalSec - rampSec - holdSec);
    const max = isFinite(SENDER_MAX_VUS) && SENDER_MAX_VUS > 0 ? SENDER_MAX_VUS : 20;

    return [
        { duration: `${rampSec}s`, target: max },
        { duration: `${holdSec}s`, target: max },
        { duration: `${downSec}s`, target: 0 },
    ];
}

// Two-scenario setup:
// - `ws_receivers`: keep WS subscriptions alive (doesn't generate load, just receives).
// - `http_senders`: generate message load via REST as fast as possible.
export const options = {
    scenarios: {
        ws_receivers: {
            executor: "constant-vus",
            vus: WS_RECEIVER_VUS,
            duration: TEST_DURATION,
            exec: "wsReceivers",
        },
        http_senders: {
            executor: "ramping-vus",
            startVUs: 0,
            stages: SENDER_STAGES || defaultSenderStages(TEST_DURATION),
            gracefulRampDown: "30s",
            exec: "httpSenders",
        },
    },
};

function httpToWsBase(httpBase) {
    // http://host:port -> ws://host:port ; https:// -> wss://
    if (httpBase.startsWith("https://")) return "wss://" + httpBase.slice("https://".length);
    if (httpBase.startsWith("http://")) return "ws://" + httpBase.slice("http://".length);
    return httpBase;
}

function randomId(len = 8) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}

function sockJsWebSocketUrl() {
    // Spring is configured with `.withSockJS()`, so the websocket transport URL is:
    //   /ws/{server-id}/{session-id}/websocket
    const wsBase = httpToWsBase(BASE_URL);
    const serverId = randomId(3);
    const sessionId = randomId(12);
    return `${wsBase}/ws/${serverId}/${sessionId}/websocket`;
}

function stompFrame(cmd, headers = {}, body = "") {
    let out = `${cmd}\n`;
    for (const k of Object.keys(headers)) {
        out += `${k}:${headers[k]}\n`;
    }
    out += `\n${body}\0`;
    return out;
}

function sendSockJs(ws, payload) {
    // SockJS websocket transport wraps messages as JSON arrays.
    ws.send(JSON.stringify([payload]));
}

function parseSockJsMessages(data) {
    // SockJS frames:
    // - "o" open
    // - "h" heartbeat
    // - 'a["msg1","msg2"]' array of messages
    if (!data || typeof data !== "string") return [];
    if (data === "o" || data === "h") return [];
    if (data.startsWith("a")) {
        try {
            const arr = JSON.parse(data.slice(1));
            return Array.isArray(arr) ? arr : [];
        } catch (_) {
            return [];
        }
    }
    return [];
}

function parseStompFrames(chunk) {
    // We send one STOMP frame per SockJS message, so parse minimally.
    // Returns { command, headers, body } or null.
    if (!chunk || typeof chunk !== "string") return null;
    const nul = chunk.indexOf("\0");
    const text = nul >= 0 ? chunk.slice(0, nul) : chunk;
    const headerEnd = text.indexOf("\n\n");
    if (headerEnd < 0) return null;

    const headerPart = text.slice(0, headerEnd);
    const body = text.slice(headerEnd + 2);
    const lines = headerPart.split("\n");
    const command = lines[0];
    const headers = {};
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const idx = line.indexOf(":");
        if (idx > 0) headers[line.slice(0, idx)] = line.slice(idx + 1);
    }
    return { command, headers, body };
}

function connectAndSubscribe(token, onMessageJson) {
    const ws = new WebSocket(sockJsWebSocketUrl());

    const conn = {
        ws,
        connected: false,
        subscribed: false,
        sessionId: null,
        closed: false,
    };

    ws.onopen = () => {
        // Send STOMP CONNECT via SockJS wrapper with required Authorization header.
        const frame = stompFrame("CONNECT", {
            "accept-version": "1.2",
            "heart-beat": "10000,10000",
            Authorization: `Bearer ${token}`,
        });
        sendSockJs(ws, frame);
    };

    ws.onmessage = (ev) => {
        const msgs = parseSockJsMessages(ev.data);
        for (const m of msgs) {
            const f = parseStompFrames(m);
            if (!f) continue;

            if (f.command === "CONNECTED") {
                conn.connected = true;
                conn.sessionId = f.headers.session || null;

                if (conn.sessionId) {
                    const subFrame = stompFrame("SUBSCRIBE", {
                        id: `sub-${randomId(6)}`,
                        destination: `/queue/messages-user${conn.sessionId}`,
                        ack: "auto",
                    });
                    sendSockJs(ws, subFrame);
                    conn.subscribed = true;
                }
                continue;
            }

            if (f.command === "MESSAGE") {
                if (!f.body) continue;
                try {
                    onMessageJson(JSON.parse(f.body));
                } catch (_) {
                    // ignore non-JSON payloads
                }
            }
        }
    };

    ws.onclose = () => {
        conn.closed = true;
    };

    ws.onerror = () => {
        // k6 doesn't expose detailed error reliably; treat as closed-ish
    };

    return conn;
}

// function sendMessage(token, chatId, content, replyToId = null) {
//     const payload = JSON.stringify({ content, replyToId });
//     const res = http.post(
//         `${BASE_URL}/chats/${chatId}/messages`,
//         payload,
//         { ...authHeaders(token), tags: { name: replyToId ? "sendReply" : "sendMessage" } }
//     );
//
//     check(res, { "sendMessage: status 200": (r) => r.status === 200 });
//     return res.status === 200 ? res.json() : null;
// }

function waitUntil(condFn, timeoutMs) {
    const start = nowMs();
    while (nowMs() - start < timeoutMs) {
        if (condFn()) return true;
        sleep(0.05);
    }
    return false;
}

export function setup() {
    // Create one big group chat so EVERY ws receiver user is a chat member.
    // ws_receivers VU i (1-based) -> username `${TEST_USER_PREFIX}${i}`.
    const memberUsernames = Array.from({ length: WS_RECEIVER_VUS }, (_, i) => `${TEST_USER_PREFIX}${i + 1}`);
    if (memberUsernames.length < 2) return { ok: false };

    console.log(
        `setup(): group chat members=${memberUsernames.length} first=${memberUsernames[0]} last=${memberUsernames.at(-1)}`
    );

    // Ensure all members exist and login to get tokens.
    const tokensByUsername = {};
    for (const username of memberUsernames) {
        const signUpRes = signUp({
            username,
            password: TEST_USER_PASSWORD,
            email: `${username}@example.com`,
            firstName: "K6",
            lastName: "User",
        });

        if (signUpRes && signUpRes.status === 200) {
            try {
                const body = signUpRes.json();
                const token = body.token || body.accessToken || body.jwt || null;
                if (!token) {
                    console.log(`setup(): signup 200 but token missing for username=${username}`);
                    return { ok: false };
                }
                tokensByUsername[username] = token;
                continue;
            } catch (e) {
                console.log(`setup(): signup 200 but json parse failed for username=${username} err=${e && e.message}`);
                return { ok: false };
            }
        }

        if (signUpRes && signUpRes.status === 409) {
            // Already exists - just login.
            const loginRes = login(username, TEST_USER_PASSWORD);
            if (!loginRes?.token) return { ok: false };
            tokensByUsername[username] = loginRes.token;
            continue;
        }

        console.log(`setup(): signup unexpected status=${signUpRes ? signUpRes.status : "null"} username=${username}`);
        return { ok: false };
    }

    const ownerUsername = memberUsernames[0]; // sender writes into this chat
    const senderToken = tokensByUsername[ownerUsername];
    if (!senderToken) return { ok: false };

    // Create group chat. membersList must NOT include the owner; ChatService filters it out anyway,
    // but we follow the DTO expectation to keep it clear.
    const createPayload = JSON.stringify({
        name: `k6-group-${Date.now()}`,
        membersList: memberUsernames.slice(1),
    });

    const createRes = http.post(
        `${BASE_URL}/chats/me`,
        createPayload,
        { ...authHeaders(senderToken), tags: { name: "createGroupChat" } }
    );
    if (createRes.status !== 200) {
        console.log(`setup(): createGroupChat failed status=${createRes.status} body=${createRes.body && String(createRes.body).slice(0, 200)}`);
        return { ok: false };
    }

    const chatId = createRes.json("id");
    if (!chatId) return { ok: false };

    console.log(`setup(): group chat created chatId=${chatId}`);
    return { ok: true, senderToken, chatId, memberUsernames, tokensByUsername };
}

export function httpSenders(data) {
    if (!data?.ok) return;

    const expectedIds = [];
    const base = `${nowMs()}-${randomId(6)}`;

    for (let i = 0; i < (Number(MESSAGES_PER_ITER) || 0); i++) {
        const msg = sendMessage(data.senderToken, data.chatId, `k6 msg ${base}-${i}`);
        if (msg?.id) expectedIds.push(String(msg.id));

        if (i < (Number(REPLIES_PER_ITER) || 0) && msg?.id) {
            const reply = sendMessage(data.senderToken, data.chatId, `k6 reply ${base}-${i}`, msg.id);
            if (reply?.id) expectedIds.push(String(reply.id));
        }
    }

    // Optional sampled verification. Keep sample rate low.
    if (VERIFY_DELIVERY && expectedIds.length > 0 && Math.random() < (isFinite(VERIFY_SAMPLE_RATE) ? VERIFY_SAMPLE_RATE : 0)) {
        const senderReceived = new Set();
        const receiverReceived = new Set();
        const receiverUsername = data.memberUsernames?.[1];
        const receiverToken = receiverUsername ? data.tokensByUsername?.[receiverUsername] : null;
        const senderConn = connectAndSubscribe(data.senderToken, (msg) => msg?.id && senderReceived.add(String(msg.id)));
        const receiverConn = receiverToken
            ? connectAndSubscribe(receiverToken, (msg) => msg?.id && receiverReceived.add(String(msg.id)))
            : null;

        const wsReady = waitUntil(
            () =>
                senderConn?.subscribed &&
                !!receiverConn?.subscribed &&
                !senderConn.closed &&
                !receiverConn.closed,
            WS_WAIT_TIMEOUT_MS
        );
        check({ wsReady }, { "ws verify: subscribed": (r) => r.wsReady === true });

        if (wsReady) {
            const delivered = waitUntil(() => expectedIds.every((id) => senderReceived.has(id) && receiverReceived.has(id)), WS_WAIT_TIMEOUT_MS);
            check({ delivered }, { "ws: messages delivered to sender+receiver": (r) => r.delivered === true });
        }

        try { senderConn?.ws?.close(); } catch (_) {}
        try { receiverConn?.ws?.close(); } catch (_) {}
    }

    const wait = Number(WAIT_SECONDS || 0);
    if (wait > 0) sleep(Math.random() * wait);
}

export function wsReceivers(data) {
    if (!data?.ok) return;

    const username = data.memberUsernames[__VU - 1];
    const token = data.tokensByUsername?.[username];
    if (!token) return;

    function truncate(value, max = 80) {
        const s = value === null || value === undefined ? "" : String(value);
        return s.length > max ? s.slice(0, max) + "…" : s;
    }

    const receiverUsername = username;
    const conn = connectAndSubscribe(token, (msg) => {
        if (!msg) return;
        if (Math.random() > WS_RECEIVER_LOG_SAMPLE_RATE) return;

        const sender = msg.sender?.username || msg.senderUsername || "";
        const replyTo = msg.responseToId ? String(msg.responseToId) : "";

        console.log(
            `WS [${receiverUsername}] message id=${msg.id} chatId=${msg.chatId} sender=${sender} replyTo=${replyTo} content="${truncate(
                msg.content
            )}"`
        );
    });

    const wsReady = waitUntil(
        () => conn?.subscribed && !conn.closed,
        WS_WAIT_TIMEOUT_MS
    );
    check({ wsReady }, { "ws receiver: subscribed": (r) => r.wsReady === true });
    if (!wsReady) return;

    while (!conn.closed) {
        sleep(WS_RECEIVER_PING_SECONDS > 0 ? WS_RECEIVER_PING_SECONDS : 5);
    }
}