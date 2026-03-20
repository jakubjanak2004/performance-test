import http from "k6/http";
import {BASE_URL} from "./config.js";

// todo move elsewhere
export function randomId(len = 8) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}

export function stompFrame(cmd, headers = {}, body = "") {
    let out = `${cmd}\n`;
    for (const k of Object.keys(headers)) out += `${k}:${headers[k]}\n`;
    out += `\n${body}\0`;
    return out;
}

// todo move to chats.js
export function fetchAllMessagesForChat(token, chatId) {
    const all = [];
    let page = 0;
    const size = 200;
    while (true) {
        const res = http.get(
            `${BASE_URL}/chats/${chatId}/messages?page=${page}&size=${size}&sort=created,asc`,
            {headers: {Authorization: `Bearer ${token}`}, tags: {name: "loadMessagesForChat"}}
        );
        console.log('res', res);
        if (res.status !== 200) break;
        const content = res.json("content");
        if (!Array.isArray(content) || content.length === 0) break;
        all.push(...content);
        const isLast = res.json("last");
        if (isLast) break;
        page += 1;
    }
    console.log('all', all);
    return all;
}