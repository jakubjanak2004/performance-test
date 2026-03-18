export function authHeaders(token) {
    return {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    };
}
export function nowMs() {
    return Date.now();
}