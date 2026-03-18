import {loginOrSignup} from "../setup/auth.js";
import {loadChats} from "../setup/chats.js";
import {Rate} from 'k6/metrics';
import {loadProfile, loadUsers, updateProfile} from "../setup/users.js";
import {OPTIONS, TEST_USER_PREFIX, TEST_USER_USERNAME_START} from "../setup/config.js";

// todo determine if use round duration
// const roundDuration = new Trend('round_duration');
const roundFailRate = new Rate('round_fail_rate');

export const options = OPTIONS

export default function () {
    // todo use setup() instead of checking every round
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
