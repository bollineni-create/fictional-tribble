#!/usr/bin/env node
// Command-line control for the paper autopilot. Usage: npm run autopilot -- <command>
import "./env.js";
import fs from "node:fs";
import path from "node:path";
import { runOnce, status, report, reportMarkdown, loadConfig, saveConfig, dataDir, stopPath } from "./autopilot.js";

const addMonths = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

async function writeReport(name) {
  const md = reportMarkdown(await report());
  const file = path.join(dataDir, name);
  fs.writeFileSync(file, md);
  return { file, md };
}

const [cmd = "help"] = process.argv.slice(2);
const print = (x) => console.log(typeof x === "string" ? x : JSON.stringify(x, null, 2));

const commands = {
  // Run the daily check if it's due. Safe to schedule every few minutes.
  async once() { print(await runOnce()); },
  // Run a check right now, ignoring the check time and once-a-day limit.
  async "run-now"() { print(await runOnce({ force: true, reason: "manual" })); },
  // Keep running; checks every 5 minutes whether today's check is due.
  async loop() {
    console.log(`Autopilot loop started. Data in ${dataDir}. Ctrl+C to stop.`);
    for (;;) {
      const r = await runOnce();
      if (!r.skipped || !/before|already|disabled|closed/.test(r.skipped)) print(r);
      await new Promise((res) => setTimeout(res, 5 * 60e3));
    }
  },
  // For unattended scheduled runs: runs the daily check if due, writes a monthly
  // report and the final report when the test period ends, and prints one JSON
  // line saying whether the run is worth notifying the owner about.
  async "cloud-run"() {
    const before = loadConfig();
    const r = await runOnce();
    const cfg = loadConfig();
    const today = new Date().toISOString().slice(0, 10);
    const out = { notify: false, final: false, lines: [] };
    if (r.skipped) out.lines.push(`No action: ${r.skipped}.`);
    else {
      out.lines.push(`${r.type}: ${r.message}`);
      out.notify = r.type === "error" || r.traded === true;
    }
    if (cfg.startedAt) {
      const end = addMonths(cfg.startedAt, cfg.testMonths ?? 5);
      if (!before.startedAt) {
        out.notify = true;
        out.lines.push(`Test started ${cfg.startedAt} with $${cfg.startEquity}. It runs until ${end}.`);
      }
      try {
        if (today >= end && !cfg.completedAt) {
          const { file } = await writeReport(`final-report-${today}.md`);
          saveConfig({ enabled: false, completedAt: today });
          Object.assign(out, { notify: true, final: true });
          out.lines.push(`Test period over; autopilot turned off. Final report: ${file}`);
        } else if (!cfg.completedAt && today.slice(0, 7) !== (cfg.lastReportMonth ?? cfg.startedAt.slice(0, 7))) {
          const { file } = await writeReport(`report-${today.slice(0, 7)}.md`);
          saveConfig({ lastReportMonth: today.slice(0, 7) });
          out.notify = true;
          out.lines.push(`Monthly report written: ${file}`);
        }
      } catch (err) {
        out.lines.push(`Report not written: ${err.message}`);
      }
    }
    console.log(JSON.stringify({ notify: out.notify, final: out.final, summary: out.lines.join(" ") }));
  },
  async status() {
    const s = await status();
    print({ ...s, journal: s.journal.slice(0, 10) });
  },
  async report() {
    const r = await report();
    const md = reportMarkdown(r);
    const file = path.join(dataDir, `report-${r.period.to}.md`);
    fs.writeFileSync(file, md);
    print(md);
    console.log(`Saved to ${file}`);
  },
  async enable() { print(saveConfig({ enabled: true })); },
  async disable() { print(saveConfig({ enabled: false })); },
  async stop() {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(stopPath, `Stopped ${new Date().toISOString()}\n`);
    console.log(`Emergency stop on. No orders will be placed until you run: npm run autopilot -- resume`);
  },
  async resume() {
    fs.rmSync(stopPath, { force: true });
    console.log("Emergency stop cleared.");
  },
  async config() { print(loadConfig()); },
  async help() {
    console.log(`Commands: once | run-now | loop | cloud-run | status | report | enable | disable | stop | resume | config`);
  },
};

if (!commands[cmd]) {
  console.error(`Unknown command "${cmd}".`);
  await commands.help();
  process.exit(1);
}
try {
  await commands[cmd]();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
