import http from "k6/http"
import { check, sleep } from "k6"
import {BASE_URL, HTTP_TIMEOUT} from "./config.js"
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