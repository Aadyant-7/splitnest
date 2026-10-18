import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import exec from 'k6/execution';

const baseUrl = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const groupId = __ENV.GROUP_ID;
const vus = Number(__ENV.VUS || 10);
const duration = __ENV.DURATION || '60s';
const balanceLatency = new Trend('balance_latency', true);
const balanceFailures = new Rate('balance_failures');

export const options = {
  scenarios: {
    warmup: { executor: 'constant-vus', vus, duration: '15s', exec: 'warmup' },
    measured: { executor: 'constant-vus', vus, duration, startTime: '20s', exec: 'measure' },
  },
  thresholds: {
    balance_failures: ['rate<0.01'],
    balance_latency: ['p(95)<1000'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  if (!groupId) fail('GROUP_ID is required');
  let users;
  if (__ENV.ACCESS_TOKENS_JSON) {
    users = JSON.parse(__ENV.ACCESS_TOKENS_JSON).map(token => ({ token }));
  } else if (__ENV.USERS_JSON) {
    // Login once per distinct user, outside the measured balance request path.
    users = JSON.parse(__ENV.USERS_JSON).map(user => {
      const response = http.post(`${baseUrl}/api/v1/auth/login`, JSON.stringify(user), {
        headers: { 'Content-Type': 'application/json' }, tags: { name: 'login', phase: 'setup' },
      });
      if (response.status !== 200) fail('Test user login failed; check credentials, Redis and login limits');
      return { token: response.json('accessToken') };
    });
  } else {
    fail('Supply ACCESS_TOKENS_JSON or USERS_JSON through the environment');
  }
  if (!users.length) fail('At least one authenticated test user is required');
  for (const user of users) {
    const response = request(user.token, 'setup');
    if (response.status !== 200) fail('Every test user must be a current member of GROUP_ID');
  }
  return users;
}

function request(token, phase) {
  return http.get(`${baseUrl}/api/v1/groups/${groupId}/balances`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { name: 'GET /api/v1/groups/{groupId}/balances', phase },
  });
}

export function warmup(users) {
  request(users[(exec.vu.idInTest - 1) % users.length].token, 'warmup');
  sleep(Number(__ENV.THINK_TIME_SECONDS || 0.05));
}

export function measure(users) {
  const response = request(users[(exec.vu.idInTest - 1) % users.length].token, 'measured');
  const success = check(response, { 'balances return 200': item => item.status === 200 });
  balanceLatency.add(response.timings.duration);
  balanceFailures.add(!success);
  sleep(Number(__ENV.THINK_TIME_SECONDS || 0.05));
}

export function handleSummary(data) {
  // Only numeric measurements are saved; credentials and access tokens are never serialized.
  const result = {
    run: __ENV.RUN_LABEL || 'unlabelled', vus, duration,
    cacheMode: __ENV.CACHE_MODE || 'unspecified',
    latencyMilliseconds: data.metrics.balance_latency?.values,
    failureRate: data.metrics.balance_failures?.values,
    requests: data.metrics.http_reqs?.values,
    thresholds: data.metrics.balance_latency?.thresholds,
  };
  return { stdout: JSON.stringify(result, null, 2) + '\n' };
}
