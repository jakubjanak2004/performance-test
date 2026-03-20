import {
    MESSAGES_PER_ITER,
    TEST_DURATION,
    TEST_USER_PREFIX,
    TEST_USER_USERNAME_START,
    WS_URL,
    WS_RECEIVER_VUS
} from "../setup/config.js";
import {check, sleep} from "k6";
import ws from "k6/ws";
import {createChat, sendMessage} from "../setup/chats.js";
import {loginOrSignup} from "../setup/auth.js";
import {fetchAllMessagesForChat, randomId, stompFrame} from "../setup/ws.js";
import {parseDurationSeconds} from "../setup/utils.js";

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
            startTime: "1s",
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
    const chat = createChat(ownerToken, memberUsernames.slice(1), {name: "k6-big-group"});
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

    sleep(1);
}

export function wsReceivers(data) {
    const username = data.memberUsernames[(__VU - 1) % data.memberUsernames.length];
    const token = data.tokensByUsername[username];
    const receivedWsIds = new Set();
    let subscribed = false;
    const receiverDurationMs = parseDurationSeconds(TEST_DURATION) * 1000;

    // todo move to ws or messages
    const res = ws.connect(
        WS_URL,
        {headers: {Authorization: `Bearer ${token}`}},
        (socket) => {
            socket.on("open", () => {
                const connectFrame = stompFrame("CONNECT", {
                    "accept-version": "1.2",
                    "heart-beat": "10000,10000",
                    Authorization: `Bearer ${token}`,
                });
                socket.send(connectFrame);
            });

            socket.on("message", (raw) => {
                if (raw.startsWith("CONNECTED")) {
                    // console.log('received connected frame')
                    socket.send(stompFrame("SUBSCRIBE", {
                        id: `sub-${randomId(6)}`,
                        destination: "/user/queue/messages",
                        ack: "auto",
                    }));
                    subscribed = true;
                }
                if (raw.startsWith("MESSAGE")) {
                    const start = raw.indexOf("{");
                    const end = raw.lastIndexOf("}");

                    if (start !== -1 && end !== -1 && end > start) {
                        const rawJSON = raw.substring(start, end + 1);
                        const data = JSON.parse(rawJSON);
                        if (data.id) {
                            // register incoming message
                            receivedWsIds.add(String(data.id))
                            // console.log('adding to receivedWsIds', data.id)
                        }
                    }
                }
            });

            socket.on("error", (e) => console.error(`[WS ERROR] user=${username}`, e));
            socket.on("close", () => console.log(`[WS CLOSED] user=${username}`));

            socket.setTimeout(() => {
                socket.close();
            }, receiverDurationMs);
        }
    );

    // console.log(`[WS] url=${WS_URL}`);
    // console.log(`[WS] handshake status=${res && res.status}`);
    // if (res && res.error) console.log(`[WS] handshake error=${res.error}`);
    // if (res && res.body) console.log(`[WS] handshake body=${String(res.body).slice(0, 300)}`);


    check(res, {"ws connect: status 101": (r) => r && r.status === 101});
    check({subscribed}, {"ws receiver: subscribed": (r) => r.subscribed === true});

    // sleep until test finished
    sleep(parseDurationSeconds(TEST_DURATION));

    console.log('fetching all messages for chat')
    const chatMessages = fetchAllMessagesForChat(token, data.chatId);
    const expectedIds = new Set(
        chatMessages
            .map((m) => String(m.id))
    );

    console.log('checking the expected ids')
    console.log(`expected sample=${JSON.stringify(Array.from(expectedIds).slice(0,5))}`);
    console.log(`received sample=${JSON.stringify(Array.from(receivedWsIds).slice(0,5))}`);
    let missingCount = 0;
    for (const id of expectedIds) {
        if (!receivedWsIds.has(id)) missingCount += 1;
    }

    check(
        {expected: expectedIds.size, received: receivedWsIds.size, missing: missingCount},
        {
            "ws receiver: all run-tagged chat messages received": (r) => r.expected > 0 && r.missing === 0,
        }
    );
}