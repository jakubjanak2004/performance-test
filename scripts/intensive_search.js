import {loginOrSignup} from "../setup/auth.js";
import {
    LOAD_PAGES_PER_ITERATION,
    PAGE_SIZE,
    STEP_TIME,
    TEST_USER_PREFIX,
    TEST_USER_USERNAME_START
} from "../setup/config.js";
import {loadChatMessages, loadChats} from "../setup/chats.js";
import {loadUsers} from "../setup/users.js";
import {check, sleep} from "k6";

export const options = {
    stages: [
        { duration: STEP_TIME, target: 1 },
        // { duration: STEP_TIME, target: 5 },
        // { duration: STEP_TIME, target: 10 },
        // { duration: STEP_TIME, target: 20 },
        // { duration: STEP_TIME, target: 40 },
        // { duration: STEP_TIME, target: 80 },
        // { duration: STEP_TIME, target: 100 },
        // { duration: STEP_TIME, target: 0 },
    ],
    thresholds: {
        http_req_failed: ["rate<0.05"],
    },
};

// todo add queries to loading
export default function () {
    const username = `${TEST_USER_PREFIX}${TEST_USER_USERNAME_START + (__VU - 1)}`;
    console.log('username', username);
    const token = loginOrSignup(username);

    if (!token) {
        roundFailRate.add(1);
        return;
    }

    // load chats
    const chatIds = []
    const targetLoaded = PAGE_SIZE * LOAD_PAGES_PER_ITERATION;
    let totalChatsLoaded = 0;
    for (let i = 0; i < LOAD_PAGES_PER_ITERATION; i++) {
        const res = loadChats(token, {page: i, size: PAGE_SIZE, sort: "name,asc"});
        const isLast = res.json("last");
        const chats = res.json("content");
        const chatsCount = Array.isArray(chats) ? chats.length : 0;
        totalChatsLoaded += chatsCount;
        const chatNames = Array.isArray(chats)
            ? chats.map((c) => c?.name).filter(Boolean).slice(0, 3).join(", ")
            : "";
        console.log(`loadChats page=${i} count=${chatsCount} last=${isLast} names=[${chatNames}]`);
        if (Array.isArray(chats)) {
            for (const chat of chats) {
                if (chat?.id) chatIds.push(chat.id);
            }
        }
        if (isLast !== false) break;
    }

    check(
        { chatIdsCount: chatIds.length },
        { "there are some chats loaded": (r) => r.chatIdsCount > 0 }
    );
    check(
        { totalChatsLoaded, targetLoaded },
        { "loaded full requested chats window": (r) => r.totalChatsLoaded === r.targetLoaded }
    );
    const chatId = chatIds[0];

    // load messages
    let totalMessagesLoaded = 0;
    for (let i = 0; i < LOAD_PAGES_PER_ITERATION; i++) {
        const res = loadChatMessages(token, chatId, {page: i, size: PAGE_SIZE, sort: "created,desc"});
        const isLast = res.json("last");
        const messages = res.json("content");
        const messagesCount = Array.isArray(messages) ? messages.length : 0;
        totalMessagesLoaded += messagesCount;
        const messageSamples = Array.isArray(messages)
            ? messages
                .map((m) => m?.content)
                .filter(Boolean)
                .map((c) => String(c).slice(0, 30))
                .slice(0, 3)
                .join(", ")
            : "";
        console.log(`loadChatMessages page=${i} chatId=${chatId} count=${messagesCount} last=${isLast} samples=[${messageSamples}]`);
        if (isLast !== false) break;
    }
    check(
        { totalMessagesLoaded, targetLoaded },
        { "loaded full requested messages window": (r) => r.totalMessagesLoaded === r.targetLoaded }
    );

    let totalUsersLoaded = 0;
    for (let i = 0; i < LOAD_PAGES_PER_ITERATION; i++) {
        const res = loadUsers(token, {page: i, size: PAGE_SIZE, sort: "username,asc"});
        const isLast = res.json("last");
        const users = res.json("content");
        const usersCount = Array.isArray(users) ? users.length : 0;
        totalUsersLoaded += usersCount;
        const usernames = Array.isArray(users)
            ? users.map((u) => u?.username).filter(Boolean).slice(0, 3).join(", ")
            : "";
        console.log(`loadUsers page=${i} count=${usersCount} last=${isLast} usernames=[${usernames}]`);
        if (isLast !== false) break;
    }
    check(
        { totalUsersLoaded, targetLoaded },
        { "loaded full requested users window": (r) => r.totalUsersLoaded === r.targetLoaded }
    );

    sleep(Math.random() * 2);
}