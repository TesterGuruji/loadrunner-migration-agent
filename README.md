# AI JMeter Script Creation

A Claude Code plugin with two performance testing subagents:

| Agent | What it does |
| --- | --- |
| `jmeter-script-creation-agent` | Turns a performance test plan into an executable JMeter script |
| `loadrunner-migration-agent` | Migrates LoadRunner VuGen Web/HTTP scripts to JMeter or k6 |

## JMeter script creation agent

Give it a performance test plan and it builds an executable Apache JMeter `.jmx` script, including:

- API workflow and transaction structure
- Correlation of dynamic values
- CSV parameterization and test data
- Response and content assertions
- Workload configuration through `-J` properties
- A smoke-test validation run (when JMeter is installed)

## Install

In Claude Code:

```
/plugin marketplace add TesterGuruji/AI-JMeterScriptCreation
/plugin install jmeter-script-creation@ai-jmeter-script-creation
```

Or copy [agents/jmeter-script-creation.md](agents/jmeter-script-creation.md) into your project's
`.claude/agents/` (or `~/.claude/agents/` for all projects).

## Use

Put your test plan in the project (for example `input/test-plan/plan.md`) and ask:

> Use the jmeter-script-creation-agent to create a JMeter script from input/test-plan

JMeter 5.x is needed to validate and run the generated script.

## Example

[examples/blazedemo](examples/blazedemo) holds a BlazeDemo test plan and the script generated from it.

```
jmeter -n -t examples/blazedemo/output/jmeter/BlazeDemo_Flight_Booking.jmx \
  -JdataDir=examples/blazedemo/output/testdata \
  -Jthreads=5 -JrampUp=30 -Jduration=120 -l results/run.jtl
```

Note: this creates real bookings on the public blazedemo.com site. Only run
repeated or concurrent tests with the site owner's authorization.

## LoadRunner migration agent

Give it an exported VuGen script folder (`.usr`, `vuser_init.c`, `Action.c`, `vuser_end.c`,
`.prm`, `.dat`, `default.cfg`) and it:

- Checks the protocol (Web - HTTP/HTML only) and lists every transaction, request,
  correlation, parameter, check and custom C function
- Maps each LoadRunner function to JMeter or k6, keeping transaction names
- Generates the `.jmx` or `.js` script plus CSV data files
- Validates the result with a 1-user smoke run (against an authorised test system)
- Writes `migration-report.md`: converted, converted with assumption, needs human

Ask:

> Use the loadrunner-migration-agent to migrate path/to/VuGenScript to JMeter and k6

The agent file is [agents/loadrunner-migration.md](agents/loadrunner-migration.md).
Out of scope: SAP GUI, Citrix, Oracle NCA and other non-HTTP protocols, TruClient, and
encrypted scripts.

### Example

[examples/loadrunner-demo](examples/loadrunner-demo) holds a sample VuGen script for the
TesterGuruJi demo shop (`http://localhost:3000`), with boundary and JSON correlation,
auto headers, mixed parameter rules, a custom C helper and pacing.

## License

MIT
