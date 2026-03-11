import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, TEST_PASSWORD, HTTP_TIMEOUT } from './config.js';

export function login(username, password = TEST_PASSWORD) {
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

    // console.log(`login status=${res.status} body="${res.body}"`);

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
        // console.log(`json parse failed: ${res.body}`);
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