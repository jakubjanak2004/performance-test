import http from "k6/http"
import { check, sleep } from "k6"
import {BASE_URL, HTTP_TIMEOUT, TEST_USER_1_USERNAME} from "./config.js"
import {authHeaders} from "./utils.js";
import {buildQuery} from "./page.js";

export function loadChats(token, opts={}) {
    const res = http.get(`${BASE_URL}/chats/me${buildQuery(opts)}`, {
        ...authHeaders(token),
        timeout: HTTP_TIMEOUT
    });
    check(res, {
        "loadChats: status 200": (r) => r.status === 200,
    });
    return res;
}

export function ensureDirectChatId(senderToken, receiverUsername) {
    const getRes = http.get(
        `${BASE_URL}/chats/me/person/${encodeURIComponent(receiverUsername)}`,
        { ...authHeaders(senderToken), tags: { name: "getChatWithPerson" } }
    );

    if (getRes.status === 200) {
        return getRes.json("id");
    }

    const createPayload = JSON.stringify({
        name: `k6-${TEST_USER_1_USERNAME}-${receiverUsername}`,
        membersList: [receiverUsername],
    });

    const createRes = http.post(
        `${BASE_URL}/chats/me`,
        createPayload,
        { ...authHeaders(senderToken), tags: { name: "createChat" } }
    );

    check(createRes, { "createChat: status 200": (r) => r.status === 200 });
    return createRes.status === 200 ? createRes.json("id") : null;
}

/**
 * Create a group chat as the authenticated user (owner).
 *
 * Calls POST /chats/me with CreateChatDTO: { name, membersList }.
 *
 * @param {string} token Bearer JWT (without "Bearer " prefix)
 * @param {string[]} usernames Members to add (owner is implied by token)
 * @param {{ name?: string }} opts
 * @returns {*} Parsed ChatDTO on success, otherwise null
 */
export function createChat(token, usernames = [], opts = {}) {
    const membersList = (Array.isArray(usernames) ? usernames : [])
        .map((u) => String(u).trim())
        .filter((u) => u.length > 0);

    const payload = JSON.stringify({
        name: opts.name || `k6-group-${Date.now()}`,
        membersList,
    });

    const res = http.post(`${BASE_URL}/chats/me`, payload, {
        ...authHeaders(token),
        timeout: HTTP_TIMEOUT,
        tags: { name: "createGroupChat" },
    });

    check(res, { "createChat(group): status 200": (r) => r.status === 200 });
    return res.status === 200 ? res.json() : null;
}

export function sendMessage(token, chatId, msg, replyToId = null) {
    const payload = JSON.stringify({ content: msg, replyToId });
    const res = http.post(
        `${BASE_URL}/chats/${chatId}/messages`,
        payload,
        { ...authHeaders(token), tags: { name: replyToId ? "sendReply" : "sendMessage" } }
    );

    check(res, { "sendMessage: status 200": (r) => r.status === 200 });
    return res.status === 200 ? res.json() : null;
}