// Read-only view of every autopilot "project" folder (config.json + journal.jsonl +
// report markdown files), for the Overview dashboard. Nothing here places orders.
//
// Projects come from: this server's own autopilot folder, the repo's paper-test
// folder when it sits next to this file, folders listed in STRATEGY_LAB_PROJECTS
// (separated by the OS path delimiter), and folders saved in the settings file at
// STRATEGY_LAB_SETTINGS (the desktop app writes this when you add a folder).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { dataDir } from "./autopilot.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(process.env.STRATEGY_LAB_SETTINGS, "utf8"));
  } catch {
    return {};
  }
}

export function projectDirs() {
  const dirs = [
    dataDir,
    path.join(here, "paper-test"),
    ...(process.env.STRATEGY_LAB_PROJECTS || "").split(path.delimiter),
    ...(readSettings().projectDirs || []),
  ];
  const seen = new Set();
  return dirs
    .filter(Boolean)
    .map((d) => path.resolve(d))
    .filter((d) => !seen.has(d) && seen.add(d) && fs.existsSync(path.join(d, "config.json")));
}

const idOf = (dir) => crypto.createHash("sha1").update(dir).digest("hex").slice(0, 10);

const addMonths = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

function readJournal(dir) {
  try {
    return fs.readFileSync(path.join(dir, "journal.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

const reportFiles = (dir) => fs.readdirSync(dir).filter((f) => /^[\w.-]+\.md$/.test(f) && f !== "README.md").sort().reverse();

function summarize(dir) {
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
  const journal = readJournal(dir);
  const today = new Date().toISOString().slice(0, 10);
  const milestones = [];
  if (cfg.startedAt) {
    milestones.push({ date: cfg.startedAt, label: `Started with $${Number(cfg.startEquity || 0).toLocaleString()}` });
    if (cfg.reviewAfterMonths) milestones.push({ date: cfg.reviewedAt || addMonths(cfg.startedAt, cfg.reviewAfterMonths), label: `${cfg.reviewAfterMonths}-month review` });
    // Monthly reports land on the first check of each new month.
    const nextMonth = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    milestones.push({ date: nextMonth.toISOString().slice(0, 10), label: "Next monthly report" });
    milestones.push({ date: cfg.completedAt || addMonths(cfg.startedAt, cfg.testMonths ?? 5), label: "Test ends, final report" });
  }
  milestones.sort((a, b) => a.date.localeCompare(b.date));
  const orders = journal.filter((e) => e.type === "order");
  const lastCheck = [...journal].reverse().find((e) => e.type === "check");
  return {
    id: idOf(dir),
    name: path.basename(dir) === "autopilot-data" ? "Paper autopilot (this computer)" : path.basename(dir),
    dir,
    isLocal: dir === path.resolve(dataDir),
    config: cfg,
    status: cfg.completedAt ? "completed" : fs.existsSync(path.join(dir, "STOP")) ? "stopped" : cfg.enabled ? (cfg.startedAt ? "running" : "waiting") : "off",
    start: cfg.startedAt || null,
    end: cfg.startedAt ? addMonths(cfg.startedAt, cfg.testMonths ?? 5) : null,
    milestones: milestones.map((m) => ({ ...m, done: m.date <= today })),
    lastEquity: lastCheck?.equity ?? null,
    lastCheckDate: lastCheck?.date ?? null,
    stats: {
      runs: journal.filter((e) => e.type === "run").length,
      rebalances: journal.filter((e) => e.type === "run" && e.traded).length,
      orders: orders.length,
      ordersNotFilled: orders.filter((o) => o.status !== "filled").length,
      errors: journal.filter((e) => e.type === "error").length,
    },
    recent: journal.slice(-8).reverse(),
    reports: reportFiles(dir),
  };
}

export function listProjects() {
  return projectDirs().map((dir) => {
    try {
      return summarize(dir);
    } catch (err) {
      return { id: idOf(dir), name: path.basename(dir), dir, error: err.message };
    }
  });
}

export function readReport(id, file) {
  const dir = projectDirs().find((d) => idOf(d) === id);
  if (!dir) throw Object.assign(new Error("Unknown project"), { status: 404 });
  if (!reportFiles(dir).includes(file)) throw Object.assign(new Error("Unknown report"), { status: 404 });
  return fs.readFileSync(path.join(dir, file), "utf8");
}
