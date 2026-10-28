# Migration report: DemoShop_Checkout (LoadRunner VuGen to JMeter)

## 1. Summary

| | |
| --- | --- |
| Source | `input/vugen/DemoShop_Checkout` (Web - HTTP/HTML, `Type=Multi`, `SubType=Web`) |
| Target | Apache JMeter 5.x, `output/jmeter/DemoShop_Checkout.jmx` |
| Protocol | In scope |
| Converted | 25 |
| Converted with assumption | 9 |
| Needs human | 0 |

Smoke test: **passed** (1 user, against `http://localhost:3000`).

## 2. Inventory to target

| LoadRunner element | File:line | JMeter element | Status | Notes |
| --- | --- | --- | --- | --- |
| `lr_save_string("http://localhost:3000","pBaseUrl")` + `{pBaseUrl}` | vuser_init.c:14 | HTTP Request Defaults (`-Jprotocol/-Jhost/-Jport`) | converted with assumption | Defaults to `http://localhost:3000`. `pBaseUrl` itself is no longer a variable |
| `web_set_max_html_param_len` | vuser_init.c:16 | none | converted | Not needed in JMeter |
| Transaction `01_Login` | vuser_init.c:18-50 | Transaction Controller `01_Login` | converted | Parent sample, think time excluded |
| `web_custom_request("login")` | vuser_init.c:41 | HTTP Request `login` POST `/api/login` | converted | JSON body, Content-Type header |
| `web_reg_save_param_ex cToken` | vuser_init.c:21 | Boundary Extractor | converted | Default `NOT_FOUND` |
| `web_reg_save_param_ex cCsrf` | vuser_init.c:30 | Boundary Extractor | converted | Default `NOT_FOUND` |
| `web_reg_find "token"` | vuser_init.c:39 | Response Assertion (substring) | converted | |
| `web_add_auto_header` x2 | vuser_init.c:53-54 | Header Manager on the `Action` Simple Controller | converted with assumption | See section 3 |
| `lr_output_message` | vuser_init.c:56 | none | converted with assumption | Log line dropped |
| `lr_think_time(2)` | vuser_init.c:58 | Flow Control Action + Uniform Random Timer | converted | 1-3 s |
| Transaction `02_Search` + `web_url("search")` | Action.c:25-35 | Transaction Controller + GET `/api/products?q=${pSearch}` | converted | |
| `web_reg_find "count"` | Action.c:27 | Response Assertion | converted | |
| `lr_think_time(3)` | Action.c:37 | Flow Control Action + Uniform Random Timer | converted | 1.5-4.5 s |
| Transaction `03_CreateCart` + `web_custom_request("create_cart")` | Action.c:40-59 | Transaction Controller + POST `/api/cart` body `{}` | converted | |
| `web_reg_save_param_json cCartId` | Action.c:43 | JSON Extractor `$.cartId` | converted | Default `NOT_FOUND` |
| `lr_think_time(2)` | Action.c:61 | Flow Control Action + Uniform Random Timer | converted | 1-3 s |
| Transaction `04_AddItem` + `web_custom_request("add_item")` | Action.c:64-77 | Transaction Controller + POST `/api/cart/${cCartId}/items` | converted | |
| `web_reg_find "total"` | Action.c:66 | Response Assertion | converted | |
| `lr_think_time(2)` | Action.c:79 | Flow Control Action + Uniform Random Timer | converted | 1-3 s |
| `build_order_ref` + `static int iteration` | Action.c:12, 22-23, 82 | JSR223 PreProcessor on `checkout` (Groovy) | converted with assumption | C code kept as a comment. Counter is a thread variable |
| `web_add_header("X-Order-Ref")` | Action.c:83 | Header Manager on `checkout` only | converted | |
| Transaction `05_Checkout` + `web_custom_request("checkout")` | Action.c:85-103 | Transaction Controller + POST `/api/checkout` | converted | |
| `web_reg_find SaveCount=confirmCount` + `LR_PASS`/`LR_FAIL` + `lr_error_message` | Action.c:88, 99-104 | JSR223 Assertion | converted | Counts matches, sets `confirmCount`, logs error, fails sampler and so the transaction |
| `lr_think_time(5)` | Action.c:106 | Flow Control Action + Uniform Random Timer | converted | 2.5-7.5 s |
| `vuser_init` | vuser_init.c | Once Only Controller | converted | |
| `vuser_end` (`web_revert_auto_header` x2, `lr_output_message`) | vuser_end.c | none | converted with assumption | See section 3 |
| `pUser`, `pPass` (Once, Sequential, same line) | .prm | CSV Data Set Config `users.csv` inside the Once Only Controller | converted with assumption | Recycle on |
| `pSearch`, `pProductId` (EachIteration, Random, same line) | .prm | `search.csv` + JSR223 PreProcessor on `search` | converted with assumption | Split from users.dat, see section 3 |
| Think time `RANDOM` 50-150% | default.cfg | Uniform Random Timer: delay `n*0.5`, range `n*1.0` | converted | No cap (`LimitFlag=0`) |
| `NumOfIterations=10` | default.cfg | Thread Group loops `${__P(loops,10)}` | converted | |
| `IterationPace=ConstPace`, `StartEvery=30` | default.cfg | Flow Control Action with JSR223-computed pause, `-Jpacing` | converted with assumption | See section 3 |
| `ContinueOnError=0` | default.cfg | Thread Group "Start next thread loop" on error | converted with assumption | See section 3 |
| `UserAgent`, `TimeOut=120` | default.cfg | Header Manager, Defaults connect and response timeout 120000 ms | converted | |
| Automatic cookies | runtime | HTTP Cookie Manager | converted | |

## 3. Assumptions

- **Base URL:** JMeter Defaults need protocol, host and port separately, so the property is split into `-Jprotocol`, `-Jhost` and `-Jport` instead of one `-JbaseUrl`.
- **Auto headers:** `Authorization` and `X-CSRF-Token` sit on an `Action` Simple Controller, not on the Thread Group. LoadRunner adds them only after login. At Thread Group level, the login request would send a literal `Bearer ${cToken}`.
- **vuser_end:** JMeter has no per-thread end hook. The two `web_revert_auto_header` calls have no effect at thread end, and the "finished" log line is dropped. There is no logout endpoint in the demo shop, so nothing functional is lost.
- **Users (Once):** `.prm` says `ContinueWithLast` when users run out of rows. JMeter can only wrap around (recycle on). This differs only when there are more virtual users than the 5 data rows.
- **Search rows (Random):** `users.dat` mixes `Once` and `EachIteration` rules, so it is split into `users.csv` and `search.csv`. Random row choice is a Groovy PreProcessor that reads `search.csv` once and caches it. It runs inside the `02_Search` transaction (microseconds).
- **Pacing:** `ConstPace` 30 s is a pause computed at the end of each iteration (30 s minus iteration duration, never negative). It is not a throughput timer. Use `-Jpacing=0` to switch off.
- **Error handling:** `ContinueOnError=0` is mapped to "start next loop". Because login runs only once per thread, a failed login makes every later iteration of that thread fail too, and that is visible in results.
- **Think time samples:** the Flow Control Action pauses do not appear as samples in the JTL (checked in the smoke run).

## 4. Needs human

Nothing.

Open decision: there is no `.lrs` Controller scenario, so the real load profile (users, ramp-up, duration) is yours to choose. No SLAs were given, so none are encoded.

## 5. Validation results

Static checks:
- All 5 transaction names match LoadRunner exactly: `01_Login`, `02_Search`, `03_CreateCart`, `04_AddItem`, `05_Checkout`.
- JMX is well-formed XML and loads in JMeter 5.6.3 (`-Jthreads=0` parse run).
- Every variable is defined. `cToken`, `cCsrf`, `cCartId`, `pUser`, `pPass`, `pSearch` and `pProductId` are used by later requests. `cOrderRef` goes to the `X-Order-Ref` header. `confirmCount` is set by the assertion. `iterStart` and `pacingWait` feed the pacing pause.

Smoke run against `http://localhost:3000`, 1 user, 2 loops, `-Jpacing=0`:
- 18 of 18 samples passed. An earlier 1-loop run passed 10 of 10 (all 5 transactions and their requests).
- No `NOT_FOUND` anywhere. The bearer token was sent on every call after login.
- `X-Order-Ref` was `TGJ-tester-0001`, then `TGJ-tester-0002`.
- First run: login 149 ms, search 80 ms, create_cart 190 ms, add_item 108 ms, checkout 1463 ms.

Not tested: concurrency, random row distribution over many iterations, and the default 30 s pacing wait.

## 6. How to run

Run from `output/jmeter`. The shop must be reachable.

```
# Smoke (1 user, 1 iteration, no pacing wait)
jmeter -n -t DemoShop_Checkout.jmx -Jthreads=1 -Jloops=1 -Jpacing=0 -l results/smoke.jtl

# Default script settings (10 iterations, 30 s pace)
jmeter -n -t DemoShop_Checkout.jmx -Jthreads=1 -l results/run.jtl
```

Properties (defaults in brackets): `-Jthreads` (1), `-JrampUp` (1), `-Jloops` (10), `-Jpacing` (30), `-Jprotocol` (http), `-Jhost` (localhost), `-Jport` (3000), `-JdataDir` (testdata).

The sample credentials in `testdata/users.csv` come from the original `users.dat`. Replace them for any real environment.

---

# k6 target: `k6/demo-shop-checkout.js`

Same inventory as above. Status counts: 25 converted, 9 converted with assumption, 0 needs human (identical statuses; `vuser_end` is dropped for the same reason as in JMeter).

## k6 mapping (differences from JMeter)

| LoadRunner | k6 | Status |
| --- | --- | --- |
| Transactions | `group('01_Login'...'05_Checkout')`, same names | converted |
| Requests | `http.get` / `http.post`, tagged `name: login/search/create_cart/add_item/checkout` | converted |
| `{pBaseUrl}` | `BASE_URL` env var (default `http://localhost:3000`) | converted with assumption |
| `web_reg_save_param_ex` x2 | `findBetween()` (k6-utils jslib) | converted |
| `web_reg_save_param_json` | `res.json('cartId')` | converted |
| `web_reg_find` x3 | `check()` with named checks | converted |
| `SaveCount` + `LR_PASS`/`LR_FAIL` | match count, `check()`, custom `Rate` `checkout_confirmed`, `console.error` | converted |
| Auto headers / `X-Order-Ref` | headers on every call after login / on checkout only | converted with assumption |
| `vuser_init` | runs when `iterationInScenario === 0`, state in module-level variables (not `setup()`) | converted |
| `vuser_end` | no per-VU hook, dropped | converted with assumption |
| `pUser`/`pPass` Once | `SharedArray` row `(idInTest-1) % len` | converted |
| `pSearch`/`pProductId` Random | `search.csv`, random row per iteration, same row for both values | converted with assumption |
| `build_order_ref` | JS function, C code in a comment, module-level counter | converted with assumption |
| Think time RANDOM 50-150% | `sleep(n * (50 + rand*100) / 100)` outside groups | converted |
| 10 iterations, ConstPace 30 s | `per-vu-iterations` (`ITERATIONS`); end-of-iteration `sleep(max(0, PACING - elapsed))` | converted with assumption |
| `ContinueOnError=0` | a failed step ends the iteration | converted with assumption |

## k6 assumptions

- Pacing is a sleep at the end of the iteration (`PACING`, default 30, `0` = off), not an arrival-rate executor.
- A failed login is not retried: login runs only on a VU's first iteration, so later iterations of that VU are skipped with an error log.
- `users.csv` is read with `open()` in the init context. Run k6 from `output/k6`, or set `DATA_DIR`.
- jslib imports (`papaparse`, `k6-utils`) are fetched from `jslib.k6.io` on first run. They need network access, or a local copy.
- Thresholds: no SLAs were given, so only `checks` and `checkout_confirmed` must be 100%. Per-transaction duration thresholds are not set.

## k6 validation

- `k6 inspect demo-shop-checkout.js` parsed with no errors. k6 v2.2.0.
- Smoke run against `http://localhost:3000`, 1 VU, 1 iteration, `PACING=0`: 12 of 12 checks passed, `checkout_confirmed` 100% (1/1), `http_req_failed` 0% (0 of 5), all thresholds passed.
- Not tested: multiple VUs, the 30 s pacing wait, distribution of random rows.

## k6 how to run

Run from `output/k6`:

```
# Smoke (1 VU, 1 iteration, no pacing wait)
PACING=0 k6 run --vus 1 --iterations 1 demo-shop-checkout.js

# Script defaults (10 iterations, 30 s pace)
k6 run demo-shop-checkout.js
```

Env vars (defaults): `BASE_URL` (http://localhost:3000), `VUS` (1), `ITERATIONS` (10), `PACING` (30), `DATA_DIR` (./data), `MAX_DURATION` (1h).
