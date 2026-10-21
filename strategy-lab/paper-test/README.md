# Paper rebalancing tests (5 years, 5-month review)

Each `paper-test*` folder is the live record of one strategy running on its **own**
Alpaca paper-trading account. A scheduled Claude Code cloud session runs all of them
every weekday at 10:44 ET:

```bash
npm run autopilot -- cloud-run-all
```

| Folder | Strategy | Keys (environment settings) |
|---|---|---|
| `paper-test` | Core ETFs: VTI 60 / VXUS 25 / BND 15, 2-point band | `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY` |
| `paper-test-2` | Growth tilt: QQQ 40 / IWM 20 / SMH 15 / TLT 15 / GLD 10, rebalanced monthly | `ALPACA_2_API_KEY_ID`, `ALPACA_2_API_SECRET_KEY` |
| `paper-test-3` | Single stocks + gold: AAPL, MSFT, NVDA, AMZN 15 each / TSLA, JPM 10 each / GLD 20, 3-point band | `ALPACA_3_API_KEY_ID`, `ALPACA_3_API_SECRET_KEY` |

In each folder:

- `config.json`: targets and rules. `alpacaKeyPrefix` names the keys it uses. The test starts at its first successful check (`startedAt`), has a review checkpoint after `reviewAfterMonths` (5) while it keeps running, and ends after `testMonths` (60). `accountId` pins it to the paper account it started on.
- `journal.jsonl`: every check, order, fill and error, committed after each run.
- `report-YYYY-MM.md`, `review-report-*.md`, `final-report-*.md`: monthly, 5-month and final reports.

Safety: a folder whose keys aren't set is skipped and never falls back to another
account's keys; two folders on the same account are both refused; a folder whose keys
change to a different account stops trading. The client refuses any Alpaca host other
than paper-api.alpaca.markets.

To run one folder locally: `AUTOPILOT_DIR=paper-test-2 npm run autopilot -- status`.
