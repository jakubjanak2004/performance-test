export const BASE_URL = __ENV.BASE_URL || 'http://178.104.73.186:8090';
export const WS_URL = 'ws://178.104.73.186:8090/ws-raw';

export const TEST_USER_PREFIX = __ENV.TEST_USER_PREFIX || "test";
export const TEST_USER_USERNAME_START = __ENV.TEST_USER_USERNAME_START || 3;
export const TEST_USER_1_USERNAME = __ENV.TEST_USER_1_USERNAME || `${TEST_USER_PREFIX}1`;
export const TEST_USER_PASSWORD = __ENV.TEST_PASSWORD || 'testing';

export const STEP_TIME = __ENV.STEP_TIME || "10s";

// WebSocket load test
export const MESSAGES_PER_ITER = Number(__ENV.MESSAGES_PER_ITER || 5);
export const TEST_DURATION = __ENV.TEST_DURATION || "1m";
export const WS_SENDER_VUS = Number(__ENV.WS_SENDER_VUS || 5);
export const WS_RECEIVER_VUS = Number(__ENV.WS_RECEIVER_VUS || 10);
export const HTTP_SENDERS_START_SECONDS = Number(__ENV.HTTP_SENDERS_START_SECONDS || 2);
export const BUFFER_SECONDS = Number(__ENV.BUFFER_SECONDS || 2);

// intensive search
export const PAGE_SIZE = 5;
export const LOAD_PAGES_PER_ITERATION = 2;

// http specific vars
export const HTTP_TIMEOUT = __ENV.HTTP_TIMEOUT || '10s';