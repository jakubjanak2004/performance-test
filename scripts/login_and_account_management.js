import {login} from "../setup/auth.js";
import {loadChats} from "../setup/chats.js";
import { Trend, Rate } from 'k6/metrics';
import {loadProfile, loadUsers, updateProfile} from "../setup/users.js";
import {OPTIONS, STEP_TIME, TEST_USER_1_USERNAME} from "../setup/config.js";

// todo determine if use round duration
// const roundDuration = new Trend('round_duration');
const roundFailRate = new Rate('round_fail_rate');

export const options = OPTIONS

export default function () {
    // login
    const loginResult = login(TEST_USER_1_USERNAME);
    const token = loginResult?.token;

    if (!token) {
        roundFailRate.add(1);
        return;
    }

    // load chats
    loadChats(token)

    // load users
    loadUsers(token)

    // load profile
    loadProfile(token)

    // change firstName, lastName, email
    updateProfile(
        token,
        "toto new first name",
        "todo new last name",
        "newEmail@gmail.com"
    )
}
