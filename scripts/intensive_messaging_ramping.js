import {
    BUFFER_SECONDS,
    HTTP_SENDERS_START_SECONDS,
    MESSAGES_PER_ITER,
    TEST_DURATION,
    TEST_USER_PREFIX,
    TEST_USER_USERNAME_START,
    WS_RECEIVER_VUS, WS_SENDER_VUS
} from "../setup/config.js";
import {check, sleep} from "k6";
import {chatMessagesCount, createChat, sendMessage} from "../setup/chats.js";
import {loginOrSignup} from "../setup/auth.js";
import {connectToWsEndpoint, randomId} from "../setup/ws.js";
import {parseDurationSeconds} from "../setup/utils.js";

const testDurationInt = parseDurationSeconds(TEST_DURATION);
const testDurationReceiversSeconds = testDurationInt + HTTP_SENDERS_START_SECONDS;
const wsReceiversTargets = [1]; // [1, 20, 40, 80, 0];
const httpSendersTargets = [1, 10, 20, 0];
const maxUsersForTest = Math.max(
    ...wsReceiversTargets,
    ...httpSendersTargets
);

function buildStages(timeSecInt, targetsArray, bufferSecondsInt = 0) {
    const stageTime = Math.floor(timeSecInt / targetsArray.length);
    const stages = [];
    for (const target of targetsArray) {
        stages.push({
            duration: `${stageTime}s`,
            target: target
        })
    }
    // adding buffer if needed
    if (bufferSecondsInt > 0) {
        stages.push({
            duration: `${bufferSecondsInt}s`,
            target: 0
        })
    }
    return stages;
}

export const options = {
    scenarios: {
        ws_receivers: {
            executor: "ramping-vus",
            startVUs: 0,
            stages: buildStages(testDurationReceiversSeconds, wsReceiversTargets, BUFFER_SECONDS),
            exec: "wsReceivers",
        },
        http_senders: {
            executor: "ramping-vus",
            startTime: `${HTTP_SENDERS_START_SECONDS}s`,
            startVUs: 0,
            stages: buildStages(testDurationInt, httpSendersTargets),
            exec: "httpSenders",
        },
    },
};

export function setup() {
    // setup users
    const tokensByUsername = {};
    const memberUsernames = [];

    for (let i = 0; i < maxUsersForTest; i++) {
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

    sleep(Math.random() * 2);
}

export function wsReceivers(data) {
    const username = data.memberUsernames[(__VU - 1) % data.memberUsernames.length];
    const token = data.tokensByUsername[username];
    let messagesReceived = 0;
    let subscribed = false;

    const res = connectToWsEndpoint(
        token,
        username,
        "/user/queue/messages",
        -1,
        () => subscribed = true,
        (message) => {
            if (message.id) {
                // register incoming message
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

    check({messagesReceived}, {
        "ws receiver: some chat messages received": (i) => i.messagesReceived > 0,
    })
}