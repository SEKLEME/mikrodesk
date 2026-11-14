"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MAX_BACKUPS = 30;
const MAX_AUDIT = 800;
const MAX_ALERTS = 300;
const MAX_TERMINAL = 120;

const DEFAULTS = {
  profiles: [],
  settings: {
    pollInterval: 3000,
    accent: "cyan",
    theme: "dark",
    sidebarCollapsed: false,
    alertsSeenAt: null,
    alerts: {
      enabled: true,
      cpu: 90,
      memory: 90,
      disk: 90,
      temperature: 75,
      packetLoss: 40,
      hotspot: 5,
      cooldown: 10,
      desktop: true,
    },
  },
};

function readJson(file, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed === undefined || parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

class Store {
  constructor(directory) {
    this.directory = directory;
    this.file = path.join(directory, "mikrodesk.json");
    this.auditFile = path.join(directory, "audit.json");
    this.backupFile = path.join(directory, "backups.json");
    this.alertFile = path.join(directory, "alerts.json");
    this.terminalFile = path.join(directory, "terminal.json");
    this.data = {
      profiles: [],
      settings: { ...DEFAULTS.settings, alerts: { ...DEFAULTS.settings.alerts } },
    };
    this.audit = [];
    this.backups = [];
    this.alerts = [];
    this.terminal = [];
    this.load();
    this.loadCollections();
  }

  load() {
    const parsed = readJson(this.file, null);
    if (parsed && typeof parsed === "object") {
      this.data = {
        profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
        settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
      };
      this.data.settings.alerts = {
        ...DEFAULTS.settings.alerts,
        ...((parsed.settings && parsed.settings.alerts) || {}),
      };
    }
  }

  loadCollections() {
    const audit = readJson(this.auditFile, []);
    this.audit = Array.isArray(audit) ? audit.slice(0, MAX_AUDIT) : [];
    const backups = readJson(this.backupFile, []);
    this.backups = Array.isArray(backups) ? backups.slice(0, MAX_BACKUPS) : [];
    const alerts = readJson(this.alertFile, []);
    this.alerts = Array.isArray(alerts) ? alerts.slice(0, MAX_ALERTS) : [];
    const terminal = readJson(this.terminalFile, []);
    this.terminal = Array.isArray(terminal) ? terminal.slice(0, MAX_TERMINAL) : [];
  }

  save() {
    try {
      fs.mkdirSync(this.directory, { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), "utf8");
    } catch (error) {
      console.error("Impossible d'enregistrer les paramètres :", error);
    }
  }

  saveCollection(file, value) {
    try {
      fs.mkdirSync(this.directory, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
    } catch (error) {
      console.error(`Impossible d'enregistrer ${path.basename(file)} :`, error);
    }
  }

  /* ---------- Profils ---------- */

  listProfiles() {
    return this.data.profiles.map((profile) => ({ ...profile }));
  }

  getProfile(id) {
    const profile = this.data.profiles.find((item) => item.id === id);
    return profile ? { ...profile } : null;
  }

  upsertProfile(input) {
    const now = new Date().toISOString();
    const existing = input.id ? this.data.profiles.find((item) => item.id === input.id) : null;
    if (existing) {
      Object.assign(existing, {
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username,
        tls: Boolean(input.tls),
        updatedAt: now,
      });
      if (input.secret !== undefined) existing.secret = input.secret;
      this.save();
      return { ...existing };
    }
    const profile = {
      id: crypto.randomUUID(),
      name: input.name || input.host,
      host: input.host,
      port: input.port,
      username: input.username,
      tls: Boolean(input.tls),
      secret: input.secret || "",
      createdAt: now,
      updatedAt: now,
    };
    this.data.profiles.unshift(profile);
    this.save();
    return { ...profile };
  }

  deleteProfile(id) {
    const before = this.data.profiles.length;
    this.data.profiles = this.data.profiles.filter((item) => item.id !== id);
    if (this.data.profiles.length !== before) this.save();
    return true;
  }

  /* ---------- Préférences ---------- */

  getSettings() {
    return { ...this.data.settings, alerts: { ...this.data.settings.alerts } };
  }

  updateSettings(patch) {
    const next = { ...patch };
    if (patch && patch.alerts && typeof patch.alerts === "object") {
      next.alerts = { ...this.data.settings.alerts, ...patch.alerts };
    }
    this.data.settings = { ...this.data.settings, ...next };
    this.save();
    return this.getSettings();
  }

  /* ---------- Journal d'audit ---------- */

  listAudit() {
    return this.audit.map((entry) => ({ ...entry }));
  }

  addAudit(input) {
    const entry = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      action: String(input.action || "Action"),
      target: String(input.target || ""),
      detail: String(input.detail || ""),
      status: input.status === "error" ? "error" : "ok",
      identity: input.identity || null,
      host: input.host || null,
      mode: input.mode || null,
    };
    this.audit.unshift(entry);
    if (this.audit.length > MAX_AUDIT) this.audit.length = MAX_AUDIT;
    this.saveCollection(this.auditFile, this.audit);
    return { ...entry };
  }

  clearAudit() {
    this.audit = [];
    this.saveCollection(this.auditFile, this.audit);
    return true;
  }

  /* ---------- Instantanés de configuration ---------- */

  listBackups() {
    return this.backups.map(({ content, ...meta }) => ({ ...meta }));
  }

  getBackup(id) {
    const item = this.backups.find((entry) => entry.id === id);
    return item ? { ...item } : null;
  }

  addBackup(input) {
    const entry = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      label: String(input.label || ""),
      identity: input.identity || null,
      host: input.host || null,
      mode: input.mode || null,
      format: input.format || "rsc",
      lines: Number(input.lines) || 0,
      bytes: Number(input.bytes) || 0,
      content: String(input.content || ""),
    };
    this.backups.unshift(entry);
    if (this.backups.length > MAX_BACKUPS) this.backups.length = MAX_BACKUPS;
    this.saveCollection(this.backupFile, this.backups);
    return { ...entry };
  }

  deleteBackup(id) {
    const before = this.backups.length;
    this.backups = this.backups.filter((entry) => entry.id !== id);
    if (this.backups.length !== before) this.saveCollection(this.backupFile, this.backups);
    return this.listBackups();
  }

  /* ---------- Historique des alertes ---------- */

  listAlerts() {
    return this.alerts.map((entry) => ({ ...entry }));
  }

  addAlert(input) {
    const entry = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      rule: String(input.rule || "custom"),
      severity: ["critical", "warn", "info"].includes(input.severity) ? input.severity : "warn",
      title: String(input.title || "Alerte"),
      detail: String(input.detail || ""),
      identity: input.identity || null,
    };
    this.alerts.unshift(entry);
    if (this.alerts.length > MAX_ALERTS) this.alerts.length = MAX_ALERTS;
    this.saveCollection(this.alertFile, this.alerts);
    return { ...entry };
  }

  clearAlerts() {
    this.alerts = [];
    this.saveCollection(this.alertFile, this.alerts);
    return true;
  }

  markAlertsSeen(at) {
    this.data.settings.alertsSeenAt = at || new Date().toISOString();
    this.save();
    return this.getSettings();
  }

  /* ---------- Historique du terminal ---------- */

  listTerminalHistory() {
    return this.terminal.map((entry) => ({ ...entry }));
  }

  addTerminalHistory(input) {
    const entry = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      command: String(input.command || ""),
      status: input.status === "error" ? "error" : "ok",
      mode: input.mode === "write" ? "write" : "read",
      destructive: Boolean(input.destructive),
      duration: Number(input.duration) || 0,
      rows: Number(input.rows) || 0,
      detail: String(input.detail || ""),
      identity: input.identity || null,
      host: input.host || null,
    };
    this.terminal.unshift(entry);
    if (this.terminal.length > MAX_TERMINAL) this.terminal.length = MAX_TERMINAL;
    this.saveCollection(this.terminalFile, this.terminal);
    return { ...entry };
  }

  clearTerminalHistory() {
    this.terminal = [];
    this.saveCollection(this.terminalFile, this.terminal);
    return true;
  }
}

module.exports = { Store };
