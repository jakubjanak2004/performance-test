import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL, TEST_USERNAME_PREFIX, RECEIVER_USERNAME, CHAT_ID, HTTP_TIMEOUT } from '../setup/config.js';
import { login } from '../setup/auth.js';
import { authHeaders } from '../setup/utils.js';

const loginTrend = new Trend('custom_login_duration');
const fetchChatsTrend = new Trend('custom_fetch_chats_duration');
const fetchMessagesTrend = new Trend('custom_fetch_messages_duration');
const searchUsersTrend = new Trend('custom_search_users_duration');

// export const options = {
//     scenarios: {
//         rest_baseline: {
//             executor: 'ramping-vus',
//             startVUs: 1,
//             stages: [
//                 { duration: '30s', target: 5 },
//                 { duration: '1m', target: 10 },
//                 { duration: '30s', target: 0 },
//             ],
//             gracefulRampDown: '10s',
//         },
//     },
//     thresholds: {
//         http_req_failed: ['rate<0.01'],
//         http_req_duration: ['p(95)<1000'],
//     },
// };

// export const options = {
//     vus: 1,
//     iterations: 3,
// };


export const options = {
    scenarios: {
        round_1: {
            executor: 'constant-vus',
            vus: 1,
            duration: '20s',
            exec: 'round1',
            startTime: '0s',
        },
        round_2: {
            executor: 'constant-vus',
            vus: 3,
            duration: '20s',
            exec: 'round2',
            startTime: '25s',
        },
        round_3: {
            executor: 'constant-vus',
            vus: 5,
            duration: '20s',
            exec: 'round3',
            startTime: '50s',
        },
        round_4: {
            executor: 'constant-vus',
            vus: 10,
            duration: '20s',
            exec: 'round4',
            startTime: '75s',
        },
    },
    thresholds: {
        round_1_duration: ['p(95)<1000'],
        round_2_duration: ['p(95)<1000'],
        round_3_duration: ['p(95)<1000'],
        round_4_duration: ['p(95)<1000'],

        round_1_fail_rate: ['rate<0.01'],
        round_2_fail_rate: ['rate<0.01'],
        round_3_fail_rate: ['rate<0.01'],
        round_4_fail_rate: ['rate<0.01'],
    },
};

export default function () {
    // const username = `${TEST_USERNAME_PREFIX}${(__VU % 10) + 1}`;
    const username = "test1"

    const loginResult = login(username);
    loginTrend.add(loginResult.response.timings.duration);

    const token = loginResult.token;
    check(token, {
        'token exists': (t) => !!t,
    });

    const params = {
        ...authHeaders(token),
        timeout: HTTP_TIMEOUT,
    };

    const chatsRes = http.get(`${BASE_URL}/chats/me`, {
        ...params,
        tags: { name: 'fetch_chats' },
    });
    fetchChatsTrend.add(chatsRes.timings.duration);
    check(chatsRes, {
        'fetch chats 200': (r) => r.status === 200,
    });

    const effectiveChatId = CHAT_ID || (Array.isArray(chatsRes.json()) && chatsRes.json().length > 0 ? chatsRes.json()[0].id : null);

    if (effectiveChatId) {
        const messagesRes = http.get(`${BASE_URL}/chats/${effectiveChatId}/messages`, {
            ...params,
            tags: { name: 'fetch_messages' },
        });
        fetchMessagesTrend.add(messagesRes.timings.duration);
        check(messagesRes, {
            'fetch messages 200': (r) => r.status === 200,
        });
    }

    const q = encodeURIComponent(RECEIVER_USERNAME || 'test');
    const searchRes = http.get(`${BASE_URL}/users?q=${q}`, {
        ...params,
        tags: { name: 'search_users' },
    });
    searchUsersTrend.add(searchRes.timings.duration);
    check(searchRes, {
        'search users 200': (r) => r.status === 200,
    });
}