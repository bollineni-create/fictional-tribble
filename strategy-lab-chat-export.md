# Strategy Lab: chat handoff

Exported 2026-10-28 from a Claude Code session so the work can continue from another Claude account.
There are no API keys or secrets in this file. Add your own keys on the machine that runs the app.

---

## 1. What I asked for

1. "Make this an app for my Mac like Plaimpset and Gridline, so I can see all the accounts, backtests, results, and ongoing projects to trade into the future."
2. "Merge it." (PR #5 was merged into `main`.)
3. "Export this chat for my other account." (This file.)

## 2. Where the code is

- GitHub repo: `bollineni-create/fictional-tribble`. The other account must be able to reach it: add it as a collaborator, or connect the same GitHub account.
- The work lives in `strategy-lab/`. `main` includes the merged Mac app work at commit `c52806d`, from PR #5.
- Working branch used in this session: `claude/stoic-fermat-gc7c4r`.

## 3. What was built

**Strategy Lab** is a local Node server (`strategy-lab/server.js`) with a vanilla-JS front end (`strategy-lab/public/`). Tabs:

- **Overview** (new): accounts, backtests and their results, ongoing autopilot projects, and upcoming milestones.
- **Build & Test**: build a strategy and backtest it. The app keeps the last 100 backtests.
- **Rebalance**, **Monitor**, **Library**.

Browser data (strategies, backtests) is saved in localStorage under the `slab:` prefix.

**Mac app** (`strategy-lab/desktop/`): Electron 44.5.1 with electron-builder 26.17.0.

- Runs the same server inside the app on a fixed port, `127.0.0.1:5183`. The fixed port means saved data persists between launches. Set `STRATEGY_LAB_PORT` to use a different port.
- Native window with a hiddenInset title bar. Links to other sites open in your browser.
- Closing the window keeps the app running, so the autopilot's checks continue. Cmd+Q quits.
- Data lives in `~/Library/Application Support/Strategy Lab/`: `.env` (keys), `settings.json`, `autopilot-data/`.
- Menus:
  - Strategy Lab › API Keys…, Show Data Folder, Restart
  - File › Add Project Folder… (Cmd+O), Remove Added Project Folders…
  - View › Overview, Build & Test, Rebalance, Monitor, Library (Cmd+1 to Cmd+5)
- The build is a universal (Intel + Apple Silicon) `.dmg` and `.zip`, ad-hoc signed and not notarized.
- CI: `.github/workflows/mac-app.yml` builds the app and uploads an artifact named `Strategy-Lab-mac`. The run that passed was 39588101287, and its artifact expires 2027-01-19.

**Projects API** (`strategy-lab/projects.js`) is read-only and never places orders. It scans these autopilot folders, each with a `config.json`, `journal.jsonl` and `*.md` reports:

- this computer's autopilot folder
- `strategy-lab/paper-test` next to the source
- folders listed in `STRATEGY_LAB_PROJECTS`
- folders added in the app

Endpoints:

- `GET /api/projects` returns status, milestones, stats and recent journal entries.
- `GET /api/projects/report?id=…&file=…` returns a report. A project's id is the first 10 hex characters of the SHA-1 of its folder path.

## 4. File map

| Path | Purpose |
|---|---|
| `strategy-lab/server.js` | HTTP server and API. Exports a `listening` promise. |
| `strategy-lab/projects.js` | Read-only project summaries for Overview. |
| `strategy-lab/autopilot.js` | Paper autopilot: daily band rebalance. |
| `strategy-lab/public/` | Front end (index.html, app.js, CSS). |
| `strategy-lab/desktop/main.js` | Electron main process: starts the server, builds the menus. |
| `strategy-lab/desktop/package.json` | Electron and build config. |
| `strategy-lab/paper-test/` | The live paper-test project: `config.json`, `journal.jsonl`, reports. |
| `.github/workflows/mac-app.yml` | Mac build in CI. |
| `strategy-lab/README.md` | Full docs: install, first launch, autopilot, judging criteria. |

## 5. The paper test (ongoing project)

From `strategy-lab/paper-test/config.json`:

- **Status:** enabled, running. Started **2026-10-19** with **$100,000** in paper equity.
- **Targets:** VTI 60%, VXUS 25%, BND 15%.
- **Rules:**
  - Rebalance only when a holding is more than 5 percentage points off its target.
  - Minimum trade $25.
  - Keep 1% cash.
  - Check at 10:30 ET.
  - No single order larger than 75% of equity.
- **Benchmark:** SPY. **Length:** 60 months. **First review:** after 5 months (about 2027-03-19).
- **Journal:** the first deployment on 2026-10-19 placed 3 orders, and all 3 filled. That entry was rebuilt from Alpaca's order history because the scheduled run couldn't push its journal.
- **How it runs:** a scheduled cloud session runs `AUTOPILOT_DIR=paper-test npm run autopilot -- cloud-run`.

**Month-5 review: what to judge**

- Orders filled.
- Every error has an explanation.
- It traded only when a holding was outside the band.
- Slippage was small.
- Missed days have an explanation.
- You're comfortable with how it behaved.

## 6. How to get and run the app

**Option A: download the build**
1. In the repo on GitHub, open Actions › "mac-app" › the latest green run › download the `Strategy-Lab-mac` artifact.
2. Open the `.dmg` and drag Strategy Lab to Applications.
3. First launch: the app is unsigned, so macOS blocks it the first time. Go to System Settings › Privacy & Security › **Open Anyway**, or run:
   `xattr -cr "/Applications/Strategy Lab.app"`

**Option B: run from source**
```bash
git clone https://github.com/bollineni-create/fictional-tribble.git
cd fictional-tribble/strategy-lab/desktop
npm install
npm start          # or: npm run build:mac  → dist/*.dmg
```
For the web version only: run `npm install && npm start` in `strategy-lab/`.

**Keys**
- Choose Strategy Lab › API Keys…, paste your **Alpaca paper** keys (and optionally an Anthropic API key), save the file, then choose Strategy Lab › Restart.
- Never commit `.env`.

**Follow the paper test in the app**
- Choose File › Add Project Folder… and pick `strategy-lab/paper-test` in your clone.
- Run `git pull` in the clone to pick up new journal entries and reports.

**Autopilot commands** (run in `strategy-lab/`):
`npm run autopilot -- status | report | stop | resume | disable`

## 7. Safety rules

- **Paper only.** The Alpaca client refuses any host other than `paper-api.alpaca.markets`. Keep it that way.
- Never commit `.env`, keys or secrets, and never paste them into chats.
- Nothing in Overview or `projects.js` places orders.
- For research and education. Not investment advice.

## 8. Ideas for next steps

- Get the scheduled run to push its journal reliably, so it isn't rebuilt from order history.
- Equity-curve chart against SPY on the Overview card.
- An auto-generated month-5 review report that scores the judging criteria above.
- Proper code signing and notarization, so the app opens without the "Open Anyway" step.
- Auto `git pull` of the paper-test folder from inside the app.

---

## 9. Starter prompt for the other account

Paste this into a new Claude Code session on the repo, with this file uploaded or committed:

> I'm continuing a project from another account. The repo is `bollineni-create/fictional-tribble`, and the work is in `strategy-lab/`. Read `strategy-lab-chat-export.md` (attached) and `strategy-lab/README.md` first.
>
> Summary:
> - Strategy Lab is a Node server with a vanilla-JS UI, also packaged as an Electron Mac app in `strategy-lab/desktop`.
> - Its Overview tab shows accounts, backtests, results and ongoing autopilot projects.
> - A 60-month Alpaca **paper-only** test is running in `strategy-lab/paper-test`: VTI 60 / VXUS 25 / BND 15, 5-point band, started 2026-10-19 with $100k, first review after 5 months.
>
> Rules: keep Alpaca paper-only, never commit `.env` or keys.
>
> First, check the current state of `main` and the paper-test journal, then tell me what's next.
