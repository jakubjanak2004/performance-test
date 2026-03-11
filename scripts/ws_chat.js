import { WebSocket } from 'k6/websockets';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { BASE_URL, WS_URL, TEST_PASSWORD } from './lib/config.js';
import { login } from './lib/auth.js';
import http from 'k6/http';

const wsE2ELatency = new Trend('ws_e2e_latency', true);
const wsChatSuccess = new Counter('ws_chat_success');
const wsChatFailure = new Counter('ws_chat_failure');

export const options = {
    scenarios: {
        ws_chat: {
            executor: 'constant-vus',
            vus: 5,
            duration: '2m',
        },
    },
    thresholds: {
        ws_e2e_latency: ['p(95)<1000'],
    },
};

function authHeaders(token) {
    return {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    };
}

function ensureDirectChat(senderToken, receiverUsername) {
    // Adapt this to your API:
    // maybe POST /api/chats/direct or similar.
    const res = http.post(
        `${BASE_URL}/api/chats/direct`,
        JSON.stringify({ username: receiverUsername }),
        authHeaders(senderToken)
    );

    check(res, {
        'ensure direct chat OK': (r) => r.status === 200 || r.status === 201,
    });

    const body = res.json();
    return body.id || body.chatId;
}

export default function () {
    const pairId = __VU;

    const senderUsername = `sender_${pairId}`;
    const receiverUsername = `receiver_${pairId}`;

    const senderLogin = login(senderUsername, TEST_PASSWORD);
    const receiverLogin = login(receiverUsername, TEST_PASSWORD);

    const senderToken = senderLogin.token;
    const receiverToken = receiverLogin.token;

    const chatId = ensureDirectChat(senderToken, receiverUsername);

    let receiverReady = false;
    let messageDelivered = false;
    let sentAt = 0;
    let messageId = `msg-${pairId}-${Date.now()}`;

    const receiverWs = new WebSocket(`${WS_URL}?token=${encodeURIComponent(receiverToken)}`);
    receiverWs.onopen = () => {
        receiverReady = true;
    };

    receiverWs.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);

            // Adapt this matcher to your actual WS payload format.
            if (msg.type === 'CHAT_MESSAGE' && msg.messageId === messageId) {
                const latency = Date.now() - msg.sentAt;
                wsE2ELatency.add(latency);
                messageDelivered = true;
                wsChatSuccess.add(1);

                receiverWs.close();
                senderWs.close();
            }
        } catch (e) {
            // ignore parse failures from unrelated events
        }
    };

    receiverWs.onerror = () => {
        wsChatFailure.add(1);
    };

    const senderWs = new WebSocket(`${WS_URL}?token=${encodeURIComponent(senderToken)}`);
    senderWs.onopen = () => {
        const waitUntilReady = setInterval(() => {
            if (!receiverReady) {
                return;
            }

            clearInterval(waitUntilReady);

            sentAt = Date.now();

            const payload = {
                type: 'SEND_CHAT_MESSAGE',
                chatId,
                messageId,
                sentAt,
                content: `hello from pair ${pairId}`,
            };

            senderWs.send(JSON.stringify(payload));

            setTimeout(() => {
                if (!messageDelivered) {
                    wsChatFailure.add(1);
                    try { senderWs.close(); } catch (_) {}
                    try { receiverWs.close(); } catch (_) {}
                }
            }, 5000);
        }, 100);
    };

    senderWs.onerror = () => {
        wsChatFailure.add(1);
    };
}