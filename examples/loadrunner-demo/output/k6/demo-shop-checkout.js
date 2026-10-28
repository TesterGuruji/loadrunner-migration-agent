import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import papaparse from 'https://jslib.k6.io/papaparse/5.1.1/index.js';
import { findBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// DemoShop_Checkout migrated from LoadRunner VuGen (Web - HTTP/HTML).
// Run: k6 run demo-shop-checkout.js   (env: BASE_URL, VUS, ITERATIONS, PACING, DATA_DIR)

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const VUS = parseInt(__ENV.VUS || '1');
const ITERATIONS = parseInt(__ENV.ITERATIONS || '10'); // default.cfg NumOfIterations=10
const PACING = parseFloat(__ENV.PACING || '30');       // default.cfg ConstPace StartEvery=30 (0 = off)
const DATA_DIR = __ENV.DATA_DIR || './data';

export const options = {
  scenarios: {
    demoshop_checkout: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: __ENV.MAX_DURATION || '10s',
    },
  },
  // No SLAs were provided, so only functional pass criteria are set here.
  thresholds: {
    checks: ['rate==1'],
    checkout_confirmed: ['rate==1'],
  },
};

// LR_PASS / LR_FAIL decision of 05_Checkout (Action.c:99-104)
const checkoutConfirmed = new Rate('checkout_confirmed');

// users.dat split by update rule (see migration-report.md):
// pUser, pPass: GenerateNewVal=Once, Sequential, "Same line as pUser"
const users = new SharedArray('users', () =>
  papaparse.parse(open(`${DATA_DIR}/users.csv`), { header: true, skipEmptyLines: true }).data);
// pSearch, pProductId: GenerateNewVal=EachIteration, Random, "Same line as pSearch"
const searches = new SharedArray('searches', () =>
  papaparse.parse(open(`${DATA_DIR}/search.csv`), { header: true, skipEmptyLines: true }).data);

// default.cfg [WEB]: UserAgent, TimeOut=120
const BASE_PARAMS = {
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TesterGuruJi-DemoShop)' },
  timeout: '120s',
};
const JSON_CT = { 'Content-Type': 'application/json' }; // EncType=application/json

// Per-VU state (module-level variables are per VU). Replaces vuser_init values and C statics.
let pUser = null;
let pPass = null;
let cToken = null;
let cCsrf = null;
let iteration = 0; // static int iteration (Action.c:22)

// default.cfg ThinkTime Options=RANDOM, 50%..150%, no limit
function thinkTime(n) {
  sleep(n * (50 + Math.random() * 100) / 100);
}

/* Original LoadRunner C code (Action.c:12):
char *build_order_ref(char *user, int iteration)
{
	static char ref[64];
	sprintf(ref, "TGJ-%s-%04d", user, iteration % 10000);
	return ref;
}
*/
function buildOrderRef(user, it) {
  return `TGJ-${user}-${String(it % 10000).padStart(4, '0')}`;
}

function authHeaders(extra) {
  // web_add_auto_header: sent on every request after login
  return Object.assign({ 'Authorization': `Bearer ${cToken}`, 'X-CSRF-Token': cCsrf }, JSON_CT, extra || {});
}

// vuser_init: runs once per VU (first iteration only). Not in setup(): that is once per test.
function vuserInit() {
  const row = users[(exec.vu.idInTest - 1) % users.length]; // GenerateNewVal=Once
  pUser = row.pUser;
  pPass = row.pPass;

  let loggedIn = false;
  group('01_Login', () => {
    const res = http.post(`${BASE_URL}/api/login`,
      JSON.stringify({ username: pUser, password: pPass }),
      Object.assign({}, BASE_PARAMS, { headers: Object.assign({}, BASE_PARAMS.headers, JSON_CT), tags: { name: 'login' } }));

    // web_reg_save_param_ex cToken / cCsrf (LB/RB, Ordinal=1)
    cToken = findBetween(res.body, '"token":"', '"');
    cCsrf = findBetween(res.body, '"csrfToken":"', '"');

    // web_reg_find("Text=\"token\"", "Fail=NotFound")
    loggedIn = check(res, {
      'login: status 200': (r) => r.status === 200,
      'login: body contains "token"': (r) => r.body.includes('"token"'),
      'login: cToken extracted': () => !!cToken,
      'login: cCsrf extracted': () => !!cCsrf,
    });
  });
  if (!loggedIn) {
    cToken = null;
    console.error(`Login failed for ${pUser}`);
    return;
  }
  console.log(`Logged in as ${pUser}`); // lr_output_message
  thinkTime(2);
}

export default function () {
  const iterStart = Date.now();

  if (exec.vu.iterationInScenario === 0) {
    vuserInit();
  }
  if (!cToken) {
    // ContinueOnError=0: no valid session, end this iteration
    console.error('No session (login failed), skipping iteration');
    return;
  }

  iteration++;
  // pSearch / pProductId: EachIteration, Random, same line
  const row = searches[Math.floor(Math.random() * searches.length)];
  const pSearch = row.pSearch;
  const pProductId = row.pProductId;

  // ---------- 02_Search ----------
  let ok = false;
  group('02_Search', () => {
    const res = http.get(`${BASE_URL}/api/products?q=${encodeURIComponent(pSearch)}`,
      Object.assign({}, BASE_PARAMS, { headers: Object.assign({}, BASE_PARAMS.headers, authHeaders()), tags: { name: 'search' } }));
    ok = check(res, {
      'search: status 200': (r) => r.status === 200,
      'search: body contains "count"': (r) => r.body.includes('"count"'),
    });
  });
  if (!ok) return;
  thinkTime(3);

  // ---------- 03_CreateCart ----------
  let cCartId = null;
  group('03_CreateCart', () => {
    const res = http.post(`${BASE_URL}/api/cart`, '{}',
      Object.assign({}, BASE_PARAMS, { headers: Object.assign({}, BASE_PARAMS.headers, authHeaders()), tags: { name: 'create_cart' } }));
    // web_reg_save_param_json cCartId, $.cartId
    try { cCartId = res.json('cartId'); } catch (e) { cCartId = null; }
    ok = check(res, {
      'create_cart: status 2xx': (r) => r.status >= 200 && r.status < 300,
      'create_cart: cCartId extracted': () => !!cCartId,
    });
  });
  if (!ok) return;
  thinkTime(2);

  // ---------- 04_AddItem ----------
  group('04_AddItem', () => {
    const res = http.post(`${BASE_URL}/api/cart/${cCartId}/items`,
      JSON.stringify({ productId: parseInt(pProductId), qty: 1 }),
      Object.assign({}, BASE_PARAMS, { headers: Object.assign({}, BASE_PARAMS.headers, authHeaders()), tags: { name: 'add_item' } }));
    ok = check(res, {
      'add_item: status 200': (r) => r.status === 200,
      'add_item: body contains "total"': (r) => r.body.includes('"total"'),
    });
  });
  if (!ok) return;
  thinkTime(2);

  // ---------- 05_Checkout ----------
  const cOrderRef = buildOrderRef(pUser, iteration);
  group('05_Checkout', () => {
    // web_add_header("X-Order-Ref") applies to this request only
    const res = http.post(`${BASE_URL}/api/checkout`,
      JSON.stringify({ cartId: cCartId }),
      Object.assign({}, BASE_PARAMS, { headers: Object.assign({}, BASE_PARAMS.headers, authHeaders({ 'X-Order-Ref': cOrderRef })), tags: { name: 'checkout' } }));

    // web_reg_find("Text=\"status\":\"CONFIRMED\"", "SaveCount=confirmCount")
    const confirmCount = res.body.split('"status":"CONFIRMED"').length - 1;
    // if (atoi(confirmCount) > 0) LR_PASS else lr_error_message + LR_FAIL
    const confirmed = confirmCount > 0;
    checkoutConfirmed.add(confirmed);
    if (!confirmed) {
      console.error(`Checkout not confirmed for cart ${cCartId}`);
    }
    check(res, {
      'checkout: status 200': (r) => r.status === 200,
      'checkout: status CONFIRMED': () => confirmed,
    });
  });
  thinkTime(5);

  // IterationPace=ConstPace, StartEvery=30: next iteration starts 30 s after this one started
  const elapsed = (Date.now() - iterStart) / 1000;
  sleep(Math.max(0, PACING - elapsed));

  // vuser_end (web_revert_auto_header x2, lr_output_message): no per-VU end hook in k6, dropped.
}
