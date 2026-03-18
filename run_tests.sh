#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./run_tests.sh [scriptPath]
#
# Examples:
#   ./run_tests.sh scripts/login_and_account_management.js
#   ./run_tests.sh scripts/send_and_receive_messages.js
#
# All test configuration defaults live in `setup/config.js`.
# If you want to override something, pass env vars to this script
# (or use `k6 run -e ...` directly).
#
# Prometheus remote-write:
# - K6_PROMETHEUS_RW_SERVER_URL (defaults below)
#
# This wrapper only selects the script + enables remote-write output.

SCRIPT_PATH="${1:-scripts/send_and_receive_messages.js}"

# Always send k6 metrics to Prometheus remote-write by default.
# Override by setting K6_PROMETHEUS_RW_SERVER_URL explicitly.
K6_PROMETHEUS_RW_SERVER_URL="${K6_PROMETHEUS_RW_SERVER_URL:-http://178.104.69.73:9090/api/v1/write}"

K6_PROMETHEUS_RW_SERVER_URL="${K6_PROMETHEUS_RW_SERVER_URL}" k6 run -o experimental-prometheus-rw "${SCRIPT_PATH}"