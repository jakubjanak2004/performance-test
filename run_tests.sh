k6 run \
  -e BASE_URL=http://localhost:8090 \
  -e TEST_USERNAME_PREFIX=test1 \
  -e TEST_PASSWORD='test' \
  -e RECEIVER_USERNAME=test2 \
  scripts/rest_baseline.js