import http from 'k6/http';
import { check } from 'k6';
import {
    BASE_URL,
    TEST_USER_PASSWORD,
    HTTP_TIMEOUT,
    TEST_USER_PREFIX,
    TEST_USER_USERNAME_START,
    TEST_USER_1_USERNAME
} from './config.js';

let cachedToken = null;

export function loginOrSignup(username) {
    if (cachedToken) return cachedToken;

    // Ensure user exists: try signup first.
    const signUpRes = signUp({ username });
    if (signUpRes && signUpRes.status === 200) {
        try {
            const body = signUpRes.json();
            cachedToken = body.token || null;
            return cachedToken;
        } catch (_) {
            // fall through to login
        }
    }

    // If user already exists (409) or signup didn't return a token, login.
    const loginResult = login(username || TEST_USER_1_USERNAME);
    cachedToken = loginResult.token || null;
    return cachedToken;
}

export function login(username, password = TEST_USER_PASSWORD) {
    const payload = JSON.stringify({ username, password });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        timeout: HTTP_TIMEOUT || '10s',
        tags: { name: 'login' },
    };

    const res = http.post(`${BASE_URL}/auth/login`, payload, params);

    check(res, {
        'login status is 200': (r) => r.status === 200,
    });

    if (res.status !== 200 || !res.body || !String(res.body).trim()) {
        return {
            token: null,
            response: res,
        };
    }

    let body;
    try {
        body = res.json();
    } catch (e) {
        return {
            token: null,
            response: res,
        };
    }

    return {
        token: body.token || body.accessToken || body.jwt || null,
        response: res,
    };
}

export function signUp({
    username,
    password = TEST_USER_PASSWORD,
    email,
    firstName = "K6",
    lastName = "User",
} = {}) {
    const payload = JSON.stringify({
        username,
        password,
        email: email || `${username}@example.com`,
        firstName,
        lastName,
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        timeout: HTTP_TIMEOUT || '10s',
        tags: { name: 'signup' },
    };

    const res = http.post(`${BASE_URL}/auth/signup`, payload, params);

    // On reruns, you may see 409 (username taken). Treat that as non-fatal.
    check(res, {
        'signup status is 200 or 409': (r) => r.status === 200 || r.status === 409,
    });

    return res;
}