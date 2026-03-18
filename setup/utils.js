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

export function parseDurationSeconds(s) {
    if (!s) return 0;
    const m = String(s).trim().match(/^(\d+)(ms|s|m|h)$/);
    if (!m) return 0;
    const n = Number(m[1]);
    const unit = m[2];
    if (!isFinite(n)) return 0;
    if (unit === "ms") return n / 1000;
    if (unit === "s") return n;
    if (unit === "m") return n * 60;
    if (unit === "h") return n * 3600;
    return 0;
}