export const BASE_URL = __ENV.BASE_URL || 'http://178.104.73.186:8090';
export const WS_URL = 'ws://178.104.73.186:8090/ws-raw';

export const TEST_USER_PREFIX = __ENV.TEST_USER_PREFIX || "test";
export const TEST_USER_USERNAME_START = __ENV.TEST_USER_USERNAME_START || 3
export const TEST_USER_1_USERNAME = __ENV.TEST_USER_1_USERNAME || `${TEST_USER_PREFIX}1`;
export const TEST_USER_PASSWORD = __ENV.TEST_PASSWORD || 'testing';

export const STEP_TIME = __ENV.STEP_TIME || "1m";
export const WAIT_SECONDS = __ENV.WAIT_SECONDS || 2

// Messaging scenario tuning
export const MESSAGES_PER_ITER = Number(__ENV.MESSAGES_PER_ITER || 5);
export const REPLIES_PER_ITER = Number(__ENV.REPLIES_PER_ITER || 2);
export const WS_WAIT_TIMEOUT_MS = Number(__ENV.WS_WAIT_TIMEOUT_MS || 10000);

// WebSocket + load test tuning (send_and_receive_messages.js)
export const TEST_DURATION = __ENV.TEST_DURATION || "10s";
export const WS_RECEIVER_VUS = Number(__ENV.WS_RECEIVER_VUS || 1);
export const WS_RECEIVER_PING_SECONDS = Number(__ENV.WS_RECEIVER_PING_SECONDS || 15);

export const HTTP_TIMEOUT = __ENV.HTTP_TIMEOUT || '10s';

export const OPTIONS = {
    stages: [
        { duration: STEP_TIME, target: 1 },
        { duration: STEP_TIME, target: 5 },
        { duration: STEP_TIME, target: 10 },
        { duration: STEP_TIME, target: 20 },
        { duration: STEP_TIME, target: 40 },
        { duration: STEP_TIME, target: 80 },
        { duration: STEP_TIME, target: 100 },
        { duration: STEP_TIME, target: 1 },
    ],
    thresholds: {
        http_req_failed: ["rate<0.05"],
    },
};