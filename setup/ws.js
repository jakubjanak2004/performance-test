import http from "k6/http";
import { sleep } from "k6";
import { WebSocket } from "k6/websockets";
import { BASE_URL } from "./config.js";

export function httpToWsBase(httpBase) {
    if (httpBase.startsWith("https://")) return "wss://" + httpBase.slice("https://".length);
    if (httpBase.startsWith("http://")) return "ws://" + httpBase.slice("http://".length);
    return httpBase;
}

// todo move elsewhere
export function randomId(len = 8) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}

export function sockJsWebSocketUrl() {
    const wsBase = httpToWsBase(BASE_URL);
    const serverId = randomId(3);
    const sessionId = randomId(12);
    return `${wsBase}/ws/${serverId}/${sessionId}/websocket`;
}

export function stompFrame(cmd, headers = {}, body = "") {
    let out = `${cmd}\n`;
    for (const k of Object.keys(headers)) out += `${k}:${headers[k]}\n`;
    out += `\n${body}\0`;
    return out;
}

export function sendSockJs(ws, payload) {
    ws.send(JSON.stringify([payload]));
}

export function parseSockJsMessages(data) {
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

export function parseStompFrame(chunk) {
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

export function waitUntil(condFn, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (condFn()) return true;
        sleep(0.05);
    }

    return false;
}

export function connectAndSubscribe(token, onMessageJson) {
    const ws = new WebSocket(sockJsWebSocketUrl());
    const conn = { ws, subscribed: false, closed: false };

    ws.onopen = () => {
        const connectFrame = stompFrame("CONNECT", {
            "accept-version": "1.2",
            "heart-beat": "10000,10000",
            Authorization: `Bearer ${token}`,
        });
        sendSockJs(ws, connectFrame);
    };

    ws.onmessage = (ev) => {
        const msgs = parseSockJsMessages(ev.data);
        for (const raw of msgs) {
            const frame = parseStompFrame(raw);
            if (!frame) continue;

            if (frame.command === "CONNECTED") {
                const wsSessionId = frame.headers.session;
                if (wsSessionId) {
                    const subFrame = stompFrame("SUBSCRIBE", {
                        id: `sub-${randomId(6)}`,
                        destination: `/queue/messages-user${wsSessionId}`,
                        ack: "auto",
                    });
                    sendSockJs(ws, subFrame);
                    conn.subscribed = true;
                }
                continue;
            }

            if (frame.command === "MESSAGE") {
                try {
                    const payload = JSON.parse(frame.body);
                    onMessageJson(payload);
                } catch (_) {
                    // ignore non-json WS payloads
                }
            }
        }
    };

    ws.onclose = () => {
        conn.closed = true;
    };

    ws.onerror = () => {
        // best-effort: socket close will handle termination loop
    };

    return conn;
}

export function fetchAllMessagesForChat(token, chatId) {
    const all = [];
    let page = 0;
    const size = 200;
    while (true) {
        const res = http.get(
            `${BASE_URL}/chats/${chatId}/messages?page=${page}&size=${size}&sort=createdAt,asc`,
            { headers: { Authorization: `Bearer ${token}` }, tags: { name: "loadMessagesForChat" } }
        );
        if (res.status !== 200) break;
        const content = res.json("content");
        if (!Array.isArray(content) || content.length === 0) break;
        all.push(...content);
        const isLast = res.json("last");
        if (isLast) break;
        page += 1;
    }
    return all;
}