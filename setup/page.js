/**
 * Build a paging/query string for Spring Data style params.
 *
 * k6 does not provide URLSearchParams, so we build this manually.
 *
 * Supported opts:
 * - query: string
 * - page: number (0-based)
 * - size: number
 * - sort: string | string[] (e.g. "createdAt,desc")
 *
 * @returns {string} "" or "?page=0&size=10..."
 */
export function buildQuery(opts = {}) {
  const parts = [];

  if (opts.query) parts.push(`query=${encodeURIComponent(opts.query)}`);
  if (opts.page !== undefined) parts.push(`page=${encodeURIComponent(String(opts.page))}`);
  if (opts.size !== undefined) parts.push(`size=${encodeURIComponent(String(opts.size))}`);

  if (opts.sort) {
    const sorts = Array.isArray(opts.sort) ? opts.sort : [opts.sort];
    for (const s of sorts) parts.push(`sort=${encodeURIComponent(String(s))}`);
  }

  return parts.length ? `?${parts.join("&")}` : "";
}

