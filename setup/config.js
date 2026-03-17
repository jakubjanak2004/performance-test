export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8090';
export const WS_URL = __ENV.WS_URL || 'ws://localhost:8090/ws';

export const TEST_USER_1_USERNAME = __ENV.TEST_USER_1_USERNAME || 'test1';
export const TEST_USER_2_USERNAME = __ENV.TEST_USER_2_USERNAME || 'test2';
export const TEST_USER_PASSWORD = __ENV.TEST_PASSWORD || 'test';

export const STEP_TIME = __ENV.STEP_TIME || "5m";
export const WAIT_SECONDS = __ENV.WAIT_SECONDS || 2

// Messaging scenario tuning
export const MESSAGES_PER_ITER = Number(__ENV.MESSAGES_PER_ITER || 5);
export const REPLIES_PER_ITER = Number(__ENV.REPLIES_PER_ITER || 2);
export const WS_WAIT_TIMEOUT_MS = Number(__ENV.WS_WAIT_TIMEOUT_MS || 3000);

export const HTTP_TIMEOUT = __ENV.HTTP_TIMEOUT || '10s';

export const OPTIONS = {
    stages: [
        { duration: STEP_TIME, target: 1 },
        { duration: STEP_TIME, target: 5 },
        { duration: STEP_TIME, target: 10 },
        { duration: STEP_TIME, target: 20 },
        { duration: STEP_TIME, target: 30 },
        { duration: STEP_TIME, target: 40 },
        { duration: STEP_TIME, target: 30 },
        { duration: STEP_TIME, target: 20 },
        { duration: STEP_TIME, target: 10 },
        { duration: STEP_TIME, target: 5 },
    ],
    thresholds: {
        http_req_failed: ["rate<0.05"],
    },
};