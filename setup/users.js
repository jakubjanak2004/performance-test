import {BASE_URL, HTTP_TIMEOUT} from "./config.js";
import { check } from "k6"
import {authHeaders} from "./utils.js";
import http from "k6/http";
import encoding from "k6/encoding";
import {buildQuery} from "./page.js";

export function loadUsers(token, opts={}) {
    const url = `${BASE_URL}/users${buildQuery(opts)}`;

    const res = http.get(url, {
        ...authHeaders(token),
        timeout: HTTP_TIMEOUT,
    });

    check(res, {
        'loadUsers: status 200': (r) => r.status === 200,
    });

    return res;
}

/**
 * Load current user's "profile".
 *
 * Your backend does not expose GET /users/me, so the closest "profile" read we can do
 * without changing backend code is to fetch the user's profile picture endpoint.
 * That endpoint is public but still represents a realistic profile page load.
 *
 * It extracts username from JWT payload (sub/username) without verifying the signature.
 */
export function loadProfile(token) {
    const username = usernameFromJwt(token);
    if (!username) {
        return null;
    }

    // "User info":
    // The backend does not expose GET /users/me or GET /users/{username},
    // and GET /users explicitly returns "users not me".
    // So the closest "load profile info" we can do without changing backend code is:
    // - call GET /users with a query (still exercises pagination/search and auth)
    // - call profile-picture endpoint (public) for the current username
    const userInfoRes = http.get(`${BASE_URL}/users${buildQuery({ query: username, page: 0, size: 20 })}`, {
        ...authHeaders(token),
        timeout: HTTP_TIMEOUT,
        tags: { name: "loadProfileUserInfo" },
    });

    check(userInfoRes, {
        "loadProfile userInfo: status 200": (r) => r.status === 200,
    });

    // todo determine if load profile picture in test
    // const pictureRes = http.get(`${BASE_URL}/users/${encodeURIComponent(username)}/profile-picture`, {
    //     timeout: HTTP_TIMEOUT,
    //     tags: { name: "loadProfilePicture" },
    // });
    //
    // // Depending on whether the user has a picture, you may see 200 or 404/204.
    // check(pictureRes, {
    //     "loadProfile: status 200/404": (r) => r.status === 200 || r.status === 404,
    // });

    return { userInfoRes };
}

/**
 * Update current user's profile via PUT /users/me.
 *
 * @param {string} token Bearer JWT (without "Bearer " prefix)
 * @param {string} firstName
 * @param {string} lastName
 * @param {string} email
 */
export function updateProfile(token, firstName, lastName, email) {
    const payload = JSON.stringify({ firstName, lastName, email });

    const res = http.put(`${BASE_URL}/users/me`, payload, {
        ...authHeaders(token),
        timeout: HTTP_TIMEOUT,
        tags: { name: "updateProfile" },
    });

    check(res, {
        "updateProfile: status 200": (r) => r.status === 200,
    });

    return res;
}

function usernameFromJwt(token) {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;

    const payloadB64Url = parts[1];
    const jsonStr = decodeBase64UrlToString(payloadB64Url);
    if (!jsonStr) return null;

    try {
        const payload = JSON.parse(jsonStr);
        return payload.sub || payload.username || null;
    } catch (_) {
        return null;
    }
}

function decodeBase64UrlToString(b64url) {
    // Convert base64url -> base64, pad to multiple of 4.
    let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad === 2) b64 += "==";
    else if (pad === 3) b64 += "=";
    else if (pad !== 0) return null;

    const buf = encoding.b64decode(b64, "std");
    return bytesToString(new Uint8Array(buf));
}

function bytesToString(bytes) {
    // Chunked to avoid call stack issues on large payloads (JWT payload is tiny though).
    let out = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return out;
}