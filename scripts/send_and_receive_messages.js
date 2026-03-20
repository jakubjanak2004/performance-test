import {
    MESSAGES_PER_ITER,
    TEST_DURATION,
    TEST_USER_PREFIX,
    TEST_USER_USERNAME_START,
    WS_RECEIVER_VUS
} from "../setup/config.js";
import {check, sleep} from "k6";
import {chatMessagesCount, createChat, fetchAllMessagesForChat, sendMessage} from "../setup/chats.js";
import {loginOrSignup} from "../setup/auth.js";
import {connectToWsEndpoint, randomId} from "../setup/ws.js";
import {parseDurationSeconds} from "../setup/utils.js";

// todo move to config file
const HTTP_SENDERS_START_SECONDS = 2;
const BUFFER_SECONDS = 2;
const testDurationReceiversSeconds = parseDurationSeconds(TEST_DURATION) + HTTP_SENDERS_START_SECONDS + BUFFER_SECONDS

// todo make vus grow gradually, steps
export const options = {
    scenarios: {
        ws_receivers: {
            executor: "constant-vus",
            vus: WS_RECEIVER_VUS,
            duration: `${testDurationReceiversSeconds}s`,
            exec: "wsReceivers",
        },
        http_senders: {
            executor: "constant-vus",
            vus: WS_RECEIVER_VUS,
            startTime: `${HTTP_SENDERS_START_SECONDS}s`,
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

// todo split the test to two, the senders and receivers so that there could be a different number of both
export function wsReceivers(data) {
    const username = data.memberUsernames[(__VU - 1) % data.memberUsernames.length];
    const token = data.tokensByUsername[username];
    let messagesReceived = 0;
    let subscribed = false;

    const res = connectToWsEndpoint(
        token,
        username,
        "/user/queue/messages",
        testDurationReceiversSeconds * 1000,
        () => subscribed = true,
        (message) => {
            if (message.id) {
                // register incoming message
                // console.log('username', username, 'message.id', message.id)
                messagesReceived++;
            }
        },
        (error) => {
            console.error(`[WS ERROR] user=${username}`, error)
        },
        () => {
            console.log(`[WS CLOSED] user=${username}`)
            subscribed = false
        })

    check(res, {"ws connect: status 101": (r) => r && r.status === 101});

    const messagesCount = chatMessagesCount(token, data.chatId)
    console.log('messagesCount', messagesCount)
    console.log('messagesReceived', messagesReceived)

    check({messagesCount, messagesReceived},
        {
            "ws receiver: all chat messages received": (i) => i.messagesCount === i.messagesReceived,
        })
}