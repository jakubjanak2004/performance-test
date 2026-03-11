export function authHeaders(token) {
    return {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    };
}

export function uniqueUsername(vu, iter, prefix = 'loaduser') {
    return `${prefix}_${vu}_${iter}`;
}

export function nowMs() {
    return Date.now();
}