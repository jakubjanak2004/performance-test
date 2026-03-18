import {
    MESSAGES_PER_ITER,
    SENDER_MAX_VUS,
    TEST_DURATION,
    TEST_USER_PREFIX,
    TEST_USER_USERNAME_START,
    WS_RECEIVER_VUS
} from "../setup/config.js";
import {parseDurationSeconds} from "../setup/utils.js";
import {createChat, sendMessage} from "../setup/chats.js";
import {loginOrSignup} from "../setup/auth.js";

function defaultSenderStages(totalDuration) {
    // Ramp up 10%, hold 80%, ramp down 10% (in terms of time).
    const totalSec = parseDurationSeconds(totalDuration);

    const rampSec = Math.max(1, Math.floor(totalSec * 0.1));
    const holdSec = Math.max(1, Math.floor(totalSec * 0.8));
    const downSec = Math.max(1, totalSec - rampSec - holdSec);
    const max = SENDER_MAX_VUS;

    return [
        { duration: `${rampSec}s`, target: max },
        { duration: `${holdSec}s`, target: max },
        { duration: `${downSec}s`, target: 0 },
    ];
}

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
            stages: defaultSenderStages(TEST_DURATION),
            gracefulRampDown: "30s",
            exec: "httpSenders",
        },
    },
};

const expectedIds = new Set();

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

    return { chatId: chat?.id || null, tokensByUsername, memberUsernames };
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
        const sentMessage = sendMessage(token, chatId, `${i}`, replyToId);
        if (sentMessage?.id) {
            expectedIds.add(String(sentMessage.id));
            const replySent = sendMessage(token, chatId, `reply to ${i}`, replyToId);
            if (replySent?.id) expectedIds.add(String(replySent.id));
        }
    }
}

// TODO: add weboskcet listening on chat and ensure that the messages arrive
export function wsReceivers(data) {
    // data is what setup() returned
}