import { WebSocket } from 'k6/websockets';
import { Counter, Gauge } from 'k6/metrics';
import { TEST_PASSWORD, TEST_USERNAME_PREFIX, WS_URL } from './lib/config.js';
import { login } from './lib/auth.js';

const wsConnectSuccess = new Counter('ws_connect_success');
const wsConnectFailure = new Counter('ws_connect_failure');
const wsClosed = new Counter('ws_closed');
const wsErrors = new Counter('ws_errors');
const activeSessionsGauge = new Gauge('ws_active_sessions_observed');

export const options = {
    scenarios: {
        ws_connect: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 50 },
                { duration: '1m', target: 100 },
                { duration: '2m', target: 100 },
                { duration: '30s', target: 0 },
            ],
            gracefulRampDown: '10s',
        },
    },
    thresholds: {
        ws_connect_failure: ['count==0'],
    },
};

export default function () {
    const username = `${TEST_USERNAME_PREFIX}${(__VU % 100) + 1}`;
    const { token } = login(username, TEST_PASSWORD);

    const url = `${WS_URL}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);

    let opened = false;

    ws.onopen = () => {
        opened = true;
        wsConnectSuccess.add(1);
        activeSessionsGauge.add(1);

        // Keep the socket alive.
        const pingTimer = setInterval(() => {
            try {
                ws.send(JSON.stringify({ type: 'PING', ts: Date.now() }));
            } catch (e) {
                wsErrors.add(1);
            }
        }, 15000);

        // Close after a controlled hold period for this iteration.
        setTimeout(() => {
            clearInterval(pingTimer);
            try {
                ws.close();
            } catch (e) {
                wsErrors.add(1);
            }
        }, 60000);
    };

    ws.onmessage = (event) => {
        // Optional: log or count specific server messages.
        // Keep this light, don't console.log for real load tests.
    };

    ws.onerror = () => {
        wsErrors.add(1);
        if (!opened) {
            wsConnectFailure.add(1);
        }
    };

    ws.onclose = () => {
        wsClosed.add(1);
    };
}