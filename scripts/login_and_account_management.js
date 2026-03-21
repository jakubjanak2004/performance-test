import {loginOrSignup} from "../setup/auth.js";
import {loadChats} from "../setup/chats.js";
import {Rate} from 'k6/metrics';
import {loadProfile, loadUsers, updateProfile} from "../setup/users.js";
import {OPTIONS, STEP_TIME, TEST_USER_PREFIX, TEST_USER_USERNAME_START} from "../setup/config.js";

// todo determine if use round duration
// const roundDuration = new Trend('round_duration');
const roundFailRate = new Rate('round_fail_rate');

export const options = {
    stages: [
        { duration: STEP_TIME, target: 1 },
        { duration: STEP_TIME, target: 5 },
        { duration: STEP_TIME, target: 10 },
        { duration: STEP_TIME, target: 20 },
        { duration: STEP_TIME, target: 40 },
        { duration: STEP_TIME, target: 80 },
        { duration: STEP_TIME, target: 100 },
        { duration: STEP_TIME, target: 0 },
    ],
    thresholds: {
        http_req_failed: ["rate<0.05"],
    },
};

export default function () {
    const token = loginOrSignup(`${TEST_USER_PREFIX}${TEST_USER_USERNAME_START + (__VU - 1)}`);

    if (!token) {
        roundFailRate.add(1);
        return;
    }

    // load chats
    loadChats(token, {sort: "name,asc"})

    // load users
    loadUsers(token, {sort: "username,asc"})

    // load profile
    loadProfile(token)

    // change firstName, lastName, email
    updateProfile(
        token,
        `toto new first name ${Math.random()}`,
        `todo new last name ${Math.random()}`,
        `newEmail${Math.random()}@gmail.com`
    )
}
