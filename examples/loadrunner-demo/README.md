# LoadRunner migration demo

A sample LoadRunner VuGen script for the [`loadrunner-migration-agent`](../../agents/loadrunner-migration.md).
It targets the TesterGuruJi demo shop app (from the k6-ci-gate project) on `http://localhost:3000`.

> This is a teaching sample written by hand in VuGen format. It was not recorded in LoadRunner.

## The script

```
input/vugen/DemoShop_Checkout/
├── DemoShop_Checkout.usr   protocol (Web - HTTP/HTML) and action order
├── DemoShop_Checkout.prm   parameter rules
├── vuser_init.c            01_Login, once per user; saves token + CSRF token
├── Action.c                02_Search → 03_CreateCart → 04_AddItem → 05_Checkout
├── vuser_end.c             reverts headers, logs (no logout endpoint)
├── users.dat               pUser, pPass, pSearch, pProductId
└── default.cfg             random think time 50–150%, 10 iterations, pacing every 30 s
```

### What the agent has to handle

| Feature | Where | Why it is interesting |
| --- | --- | --- |
| Boundary correlation (`web_reg_save_param_ex`) | vuser_init.c | `token` and `csrfToken`: two boundaries that look alike |
| JSON correlation (`web_reg_save_param_json`) | Action.c, 03_CreateCart | `cartId` reused in the URL and body |
| Auto headers (`web_add_auto_header`) | vuser_init.c | Bearer token + CSRF header on every request |
| One-request header (`web_add_header`) | Action.c, 05_Checkout | Only on the checkout call |
| Checks (`web_reg_find`) | All transactions | Including a `SaveCount` check with manual `LR_PASS` / `LR_FAIL` |
| Mixed parameter rules on one file | .prm | User `Once` + sequential; search `EachIteration` + random. JMeter needs this split |
| `vuser_init` / `vuser_end` | init and end files | No per-VU hooks in k6; no per-thread end in JMeter |
| Custom C helper (`build_order_ref`) with a static counter | Action.c | Must be translated or flagged |
| Random think time and constant pacing | default.cfg | Changes the load model; must be reported as an assumption |
| `lr_save_string` for the base URL | vuser_init.c | Should become a property / environment variable |

## Run the migration

1. Start the demo shop: `node app/server.js` (in the k6-ci-gate project).
2. In Claude Code, with this plugin installed:

   > Use the loadrunner-migration-agent to migrate examples/loadrunner-demo/input/vugen/DemoShop_Checkout to JMeter and k6. Base URL http://localhost:3000 (my local demo shop). Smoke test only.

3. The agent writes `output/jmeter/`, `output/k6/` and `output/migration-report.md`.

## Check the result

```bash
jmeter -n -t output/jmeter/DemoShop_Checkout.jmx -Jthreads=1 -Jloops=1 -l smoke.jtl
k6 run --vus 1 --iterations 1 output/k6/demoshop-checkout.js
```

Every transaction (01_Login … 05_Checkout) should pass. For the "broken correlation" demo, change the left boundary of `cToken` in the generated script and rerun: login values become `NOT_FOUND` and the following requests fail with 401.

## Tested

The flow in this script (same boundaries, JSON path, checks and data rows) was replayed against the demo shop for both users and all 5 data rows: every transaction passed and every checkout returned `CONFIRMED`.
