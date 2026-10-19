# 5-month paper rebalancing test

This folder is the live record of the Alpaca **paper-trading** test. It runs from a
scheduled Claude Code cloud session every weekday at 10:44 ET:

```bash
AUTOPILOT_DIR=paper-test npm run autopilot -- cloud-run
```

- `config.json`: targets and rules. The test starts at the first successful check (`startedAt`) and ends after `testMonths`.
- `journal.jsonl`: every check, order, fill and error, committed after each run.
- `report-YYYY-MM.md`: monthly progress reports.
- `final-report-*.md`: written when the test period ends; the autopilot then turns itself off.

To run the same thing locally against this folder, set `AUTOPILOT_DIR=paper-test`.
Paper trading only: the client refuses any Alpaca host other than paper-api.alpaca.markets.
