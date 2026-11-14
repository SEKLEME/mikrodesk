"use strict";

const { app, BrowserWindow, ipcMain, Menu, safeStorage, shell, dialog, Notification } = require("electron");
const path = require("path");
const fs = require("fs");

const { Store } = require("./src/store");
const { RouterOSAdapter } = require("./src/routeros");
const { DemoAdapter } = require("./src/demo");

const isDev = process.argv.includes("--dev");
let mainWindow = null;
let store = null;
let session = null;
let currentConfig = null;
let connectedAt = null;

/* ---------- Chiffrement des mots de passe ---------- */

function hasEncryption() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encryptSecret(value) {
  if (!value) return "";
  if (hasEncryption()) {
    return "enc:" + safeStorage.encryptString(value).toString("base64");
  }
  return "b64:" + Buffer.from(value, "utf8").toString("base64");
}

function decryptSecret(value) {
  if (!value) return "";
  try {
    if (value.startsWith("enc:")) {
      return safeStorage.decryptString(Buffer.from(value.slice(4), "base64"));
    }
    if (value.startsWith("b64:")) {
      return Buffer.from(value.slice(4), "base64").toString("utf8");
    }
  } catch {
    return "";
  }
  return "";
}

function publicProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    host: profile.host,
    port: profile.port,
    username: profile.username,
    tls: Boolean(profile.tls),
    hasSecret: Boolean(profile.secret),
    encrypted: Boolean(profile.secret && profile.secret.startsWith("enc:")),
    updatedAt: profile.updatedAt,
  };
}

/* ---------- Fenêtre ---------- */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1040,
    minHeight: 700,
    frame: false,
    show: false,
    backgroundColor: "#070c15",
    title: "MikroDesk",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  const sendMaximized = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("window:maximized", mainWindow.isMaximized());
  };
  mainWindow.on("maximize", sendMaximized);
  mainWindow.on("unmaximize", sendMaximized);
  mainWindow.on("enter-full-screen", sendMaximized);
  mainWindow.on("leave-full-screen", sendMaximized);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const key = (input.key || "").toLowerCase();
    if ((input.control && input.shift && key === "i") || key === "f12") {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function sendWindow(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

/* ---------- Session routeur ---------- */

function status() {
  return {
    connected: Boolean(session),
    demo: Boolean(session && session.mode === "demo"),
    identity: session ? session.identity : null,
    version: session ? session.version : null,
    board: session ? session.board : null,
    host: currentConfig ? currentConfig.host : null,
    port: currentConfig ? currentConfig.port : null,
    username: currentConfig ? currentConfig.username : null,
    tls: currentConfig ? Boolean(currentConfig.tls) : false,
    connectedAt: connectedAt ? connectedAt.toISOString() : null,
    encryptionAvailable: hasEncryption(),
  };
}

async function disconnectRouter() {
  if (session) {
    try {
      await session.close();
    } catch {
      /* ignore */
    }
  }
  session = null;
  currentConfig = null;
  connectedAt = null;
  lastDashboard = null;
  return status();
}

async function connectRouter(payload) {
  await disconnectRouter();

  let config;
  let savedProfile = null;

  if (payload.demo) {
    config = {
      host: "Démo locale",
      port: 8728,
      username: "demo",
      password: "",
      tls: false,
      name: "Démonstration",
    };
  } else {
    const profile = payload.profileId ? store.getProfile(payload.profileId) : null;
    const password =
      payload.password !== undefined && payload.password !== ""
        ? payload.password
        : profile && profile.secret
          ? decryptSecret(profile.secret)
          : "";

    config = {
      host: (payload.host || (profile && profile.host) || "").trim(),
      port: Number(payload.port || (profile && profile.port) || (payload.tls ? 8729 : 8728)),
      username: (payload.username || (profile && profile.username) || "").trim(),
      password,
      tls: Boolean(payload.tls !== undefined ? payload.tls : profile && profile.tls),
      name: payload.profileName || (profile && profile.name) || "",
      id: payload.profileId || null,
    };

    if (!config.host) throw new Error("Renseignez l'adresse IP ou le nom d'hôte du routeur.");
    if (!config.username) throw new Error("Renseignez le nom d'utilisateur API.");
    if (!Number.isFinite(config.port) || config.port < 1 || config.port > 65535) {
      throw new Error("Le port API est invalide (8728 ou 8729 en général).");
    }
  }

  const adapter = payload.demo ? new DemoAdapter() : new RouterOSAdapter(config);
  await adapter.connect();

  if (!payload.demo && payload.remember) {
    const secret = encryptSecret(config.password);
    savedProfile = publicProfile(
      store.upsertProfile({
        id: config.id || undefined,
        name: payload.profileName || config.name || config.host,
        host: config.host,
        port: config.port,
        username: config.username,
        tls: config.tls,
        secret,
      })
    );
  }

  session = adapter;
  currentConfig = config;
  connectedAt = new Date();
  return { ...status(), savedProfile };
}

function requireSession() {
  if (!session) throw new Error("Aucun routeur connecté.");
  return session;
}

/* ---------- Parc multi-routeurs ---------- */

const FLEET_TTL = 45_000;
const fleetCache = new Map();
let lastDashboard = null;

function dashboardSummary(dashboard) {
  if (!dashboard || typeof dashboard !== "object") return null;
  return {
    identity: dashboard.identity || null,
    version: dashboard.version || null,
    board: dashboard.board || null,
    uptime: dashboard.uptime || null,
    cpu: Number.isFinite(Number(dashboard.cpuLoad)) ? Number(dashboard.cpuLoad) : null,
    memory: Number.isFinite(Number(dashboard.memoryUsage)) ? Number(dashboard.memoryUsage) : null,
    disk: Number.isFinite(Number(dashboard.diskUsage)) ? Number(dashboard.diskUsage) : null,
    temperature: Number.isFinite(Number(dashboard.temperature)) ? Number(dashboard.temperature) : null,
    users: dashboard.hotspotActive ?? null,
  };
}

function currentFleetEntry() {
  if (!session) return null;
  const config = currentConfig || {};
  return {
    id: config.id || "session",
    profileId: config.id || null,
    name: config.name || session.identity || config.host || "Session active",
    host: config.host || "",
    port: config.port || null,
    username: config.username || "",
    tls: Boolean(config.tls),
    demo: session.mode === "demo",
    active: true,
    saved: Boolean(config.id),
    online: true,
    latency: null,
    checkedAt: connectedAt ? connectedAt.toISOString() : null,
    error: "",
    metrics: dashboardSummary(lastDashboard) || { identity: session.identity, version: session.version, board: session.board },
  };
}

function fleetEntryFor(profile) {
  const cached = fleetCache.get(profile.id);
  return {
    id: profile.id,
    profileId: profile.id,
    name: profile.name,
    host: profile.host,
    port: profile.port,
    username: profile.username,
    tls: Boolean(profile.tls),
    demo: false,
    active: false,
    saved: true,
    online: cached ? cached.online : null,
    latency: cached ? cached.latency : null,
    checkedAt: cached ? cached.checkedAt : null,
    error: cached ? cached.error : "",
    metrics: cached ? cached.metrics : null,
  };
}

function fleetEntries() {
  const profiles = store.listProfiles();
  const current = currentFleetEntry();
  const items = profiles.map(fleetEntryFor);
  if (current && !items.some((item) => item.profileId === current.profileId && current.profileId)) {
    items.unshift(current);
  } else if (current) {
    const match = items.find((item) => item.profileId === current.profileId);
    if (match) {
      match.active = true;
      match.online = true;
      match.error = "";
      match.metrics = current.metrics || match.metrics;
      match.checkedAt = match.checkedAt || current.checkedAt;
    }
  }
  return items;
}

function friendlyConnectionError(error) {
  const raw = sanitizeError(error);
  if (!raw || raw === "RosException" || raw === "Error") {
    return "Connexion impossible — vérifiez l'adresse, le port API et les identifiants du routeur.";
  }
  if (/ECONNREFUSED/i.test(raw)) return "Connexion refusée — vérifiez que le service API est activé sur ce port.";
  if (/ETIMEDOUT|timed? ?out|timeout/i.test(raw)) return "Délai de connexion dépassé — le routeur ne répond pas.";
  if (/EHOSTUNREACH|ENETUNREACH|EHOSTDOWN/i.test(raw)) return "Routeur injoignable sur le réseau.";
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(raw)) return "Nom d'hôte introuvable.";
  if (/authentic|login|password|invalid user|not permitted/i.test(raw)) return "Identifiants API refusés par le routeur.";
  return raw || "Routeur injoignable.";
}

async function probeProfile(id) {
  const profile = store.getProfile(id);
  if (!profile) throw new Error("Profil de routeur introuvable.");  const config = {
    host: profile.host,
    port: Number(profile.port) || 8728,
    username: profile.username,
    password: profile.secret ? decryptSecret(profile.secret) : "",
    tls: Boolean(profile.tls),
    name: profile.name,
    id: profile.id,
  };
  if (!config.host) throw new Error("L'adresse du routeur est manquante pour ce profil.");
  const started = Date.now();
  const adapter = new RouterOSAdapter(config);
  try {
    await adapter.connect();
    const dashboard = await adapter.getDashboard();
    const result = {
      online: true,
      latency: Date.now() - started,
      checkedAt: new Date().toISOString(),
      error: "",
      metrics: dashboardSummary(dashboard),
    };
    fleetCache.set(profile.id, result);
    return { ...fleetEntryFor(profile), ...result };
  } catch (error) {
    const result = {
      online: false,
      latency: null,
      checkedAt: new Date().toISOString(),
      error: friendlyConnectionError(error),
      metrics: null,
    };
    fleetCache.set(profile.id, result);
    return { ...fleetEntryFor(profile), ...result };
  } finally {
    try {
      await adapter.close();
    } catch {
      /* ignore */
    }
  }
}

async function probeAllProfiles() {
  const profiles = store.listProfiles();
  const results = [];
  const queue = profiles.slice();
  const worker = async () => {
    while (queue.length) {
      const profile = queue.shift();
      results.push(await probeProfile(profile.id));
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, profiles.length) }, worker));
  return { entries: fleetEntries(), checkedAt: new Date().toISOString() };
}

async function switchToProfile(profileId) {
  if (!profileId) throw new Error("Sélectionnez un routeur du parc.");
  const profile = store.getProfile(profileId);
  if (!profile) throw new Error("Profil de routeur introuvable.");
  try {
    const result = await connectRouter({ profileId });
    lastDashboard = null;
    return { ...result, profile: publicProfile(profile) };
  } catch (error) {
    throw new Error(friendlyConnectionError(error));
  }
}

/* ---------- IPC ---------- */

function sanitizeError(error) {
  return error && error.message
    ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "")
    : String(error);
}

function recordAudit(status, action, target, detail) {
  if (!store) return;
  try {
    store.addAudit({
      action,
      target: target || "",
      detail: detail || "",
      status,
      identity: session ? session.identity : null,
      host: currentConfig ? currentConfig.host : null,
      mode: session ? session.mode : null,
    });
  } catch (error) {
    console.error("Impossible d'écrire le journal d'audit :", error);
  }
}

function auditTarget(audit, args) {
  if (!audit || typeof audit.target !== "function") return "";
  try {
    const value = audit.target(...args);
    return value === undefined || value === null ? "" : String(value);
  } catch {
    return "";
  }
}

/* ---------- Évaluation des alertes ---------- */

const ALERT_COOLDOWNS = new Map();

function parseDurationSeconds(value) {
  const text = String(value === undefined || value === null ? "" : value).trim();
  if (!text || /never|indefinite/i.test(text)) return null;
  const clock = text.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (clock) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  const units = { d: 86400, h: 3600, m: 60, s: 1 };
  let total = 0;
  let found = false;
  const pattern = /(\d+)([dhms])/gi;
  let match = pattern.exec(text);
  while (match) {
    total += Number(match[1]) * (units[match[2].toLowerCase()] || 0);
    found = true;
    match = pattern.exec(text);
  }
  return found ? total : null;
}

function buildAlertSummary(raised, settings) {
  const alerts = store.listAlerts();
  const seenAt = store.getSettings().alertsSeenAt;
  const unread = alerts.filter((entry) => !seenAt || String(entry.at) > String(seenAt)).length;
  return { raised, settings, alerts, unread };
}

function evaluateAlerts(metrics) {
  const fullSettings = store.getSettings();
  const settings = fullSettings.alerts;
  const raised = [];
  if (!settings || settings.enabled === false) return buildAlertSummary(raised, settings);
  const input = metrics && typeof metrics === "object" ? metrics : {};
  const now = Date.now();
  const cooldownMs = Math.max(1, Number(settings.cooldown) || 10) * 60_000;
  const identity = session ? session.identity : null;
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

  const push = (rule, severity, title, detail) => {
    const last = ALERT_COOLDOWNS.get(rule) || 0;
    if (now - last < cooldownMs) return;
    ALERT_COOLDOWNS.set(rule, now);
    raised.push(store.addAlert({ rule, severity, title, detail, identity }));
  };

  const cpu = number(input.cpu);
  if (cpu !== null && cpu >= Number(settings.cpu)) {
    push(
      "cpu",
      "critical",
      "Charge CPU élevée",
      `Le processeur est à ${Math.round(cpu)} % (seuil d'alerte : ${settings.cpu} %).`
    );
  }

  const memory = number(input.memory);
  if (memory !== null && memory >= Number(settings.memory)) {
    push(
      "memory",
      "critical",
      "Mémoire saturée",
      `La mémoire vive est utilisée à ${Math.round(memory)} % (seuil : ${settings.memory} %).`
    );
  }

  const disk = number(input.disk);
  if (disk !== null && disk >= Number(settings.disk)) {
    push(
      "disk",
      "warn",
      "Stockage presque plein",
      `Le stockage interne est utilisé à ${Math.round(disk)} % (seuil : ${settings.disk} %).`
    );
  }

  const temperature = number(input.temperature);
  if (temperature !== null && temperature >= Number(settings.temperature)) {
    push(
      "temperature",
      "critical",
      "Température élevée",
      `Le routeur mesure ${Math.round(temperature)} °C (seuil : ${settings.temperature} °C).`
    );
  }

  const packetLoss = number(input.packetLoss);
  if (packetLoss !== null && packetLoss >= Number(settings.packetLoss)) {
    push(
      "packet-loss",
      "warn",
      "Perte de paquets importante",
      `Le dernier test de ping indique ${Math.round(packetLoss)} % de perte (seuil : ${settings.packetLoss} %).`
    );
  }

  if (Array.isArray(input.interfaces)) {
    const down = input.interfaces
      .filter((iface) => iface && iface.disabled !== true && iface.running === false)
      .map((iface) => String(iface.name || "interface inconnue"));
    if (down.length) {
      push(
        "interface-down",
        "warn",
        "Interface sans lien",
        `Aucun lien détecté sur : ${down.join(", ")}.`
      );
    }
  }

  if (Array.isArray(input.hotspot)) {
    const limit = Math.max(1, Number(settings.hotspot) || 5) * 60;
    const expiring = input.hotspot
      .map((entry) => {
        const seconds = parseDurationSeconds(entry && entry.timeLeft);
        return seconds !== null && seconds > 0 && seconds <= limit
          ? { user: String((entry && entry.user) || "invité"), seconds }
          : null;
      })
      .filter(Boolean);
    if (expiring.length) {
      push(
        "hotspot-expiry",
        "info",
        "Accès hotspot bientôt expiré",
        expiring
          .map((item) => `${item.user} (${Math.max(1, Math.round(item.seconds / 60))} min)`)
          .join(", ")
      );
    }
  }

  if (raised.length && settings.desktop && Notification.isSupported()) {
    try {
      const first = raised[0];
      const body =
        raised.length > 1
          ? `${first.detail}\n(+${raised.length - 1} autre(s) alerte(s))`
          : first.detail;
      new Notification({ title: `MikroDesk — ${first.title}`, body }).show();
    } catch {
      /* notification facultative */
    }
  }

  return buildAlertSummary(raised, settings);
}

function register(channel, handler, audit) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const result = await handler(...args);
      if (audit) recordAudit("ok", audit.action, auditTarget(audit, args), "");
      return result;
    } catch (error) {
      const message = sanitizeError(error);
      if (audit) recordAudit("error", audit.action, auditTarget(audit, args), message);
      throw new Error(message || "Erreur inattendue.");
    }
  });
}

/* ---------- Terminal RouterOS sécurisé ---------- */

const TERMINAL_FLAGS = new Set(["detail", "brief", "terse", "without-paging", "once", "count-only", "all"]);
const TERMINAL_READ_ACTIONS = new Set(["print", "export"]);
const TERMINAL_WRITE_ACTIONS = new Set([
  "add",
  "set",
  "remove",
  "enable",
  "disable",
  "move",
  "unset",
  "run",
  "reset",
  "reset-configuration",
  "reboot",
  "shutdown",
  "save",
  "import",
]);
const TERMINAL_DESTRUCTIVE_ACTIONS = new Set(["remove", "run", "reset", "reset-configuration", "reboot", "shutdown", "import"]);

function tokenizeTerminal(input) {
  const source = String(input === undefined || input === null ? "" : input).trim();
  if (!source) throw new Error("Saisissez une commande RouterOS.");
  if (/[\r\n;`]/.test(source) || /&&|\|\||>>?|</.test(source)) {
    throw new Error("Une seule commande simple est autorisée dans le terminal.");
  }
  const tokens = [];
  let current = "";
  let quote = null;
  let hasToken = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === "\\" && index + 1 < source.length) {
        index += 1;
        current += source[index];
      } else if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      hasToken = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (hasToken) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }
    current += char;
    hasToken = true;
  }
  if (quote) throw new Error("Guillemet non fermé dans la commande.");
  if (hasToken) tokens.push(current);
  if (!tokens.length) throw new Error("Saisissez une commande RouterOS.");
  return tokens;
}

function classifyTerminal(input) {
  const tokens = tokenizeTerminal(input);
  if (!tokens[0].startsWith("/")) throw new Error("Une commande RouterOS commence par « / » (ex. /ip hotspot user print).");

  // RouterOS sépare les segments du chemin par des espaces : « /ip hotspot user print ».
  // L'action est le dernier mot reconnu (print, add, set…), les paramètres suivent.
  const plain = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => !token.includes("="));
  const segmentOf = (token) => String(token || "").split("/").filter(Boolean).pop() || "";
  let actionIndex = -1;
  for (let position = plain.length - 1; position >= 0; position -= 1) {
    const lower = segmentOf(plain[position].token).toLowerCase();
    if (TERMINAL_READ_ACTIONS.has(lower) || TERMINAL_WRITE_ACTIONS.has(lower)) {
      actionIndex = plain[position].index;
      break;
    }
  }
  if (actionIndex === -1) {
    const candidate = plain.length ? segmentOf(plain[plain.length - 1].token) : "";
    throw new Error(
      `Action « ${candidate} » non prise en charge par le terminal sécurisé. Utilisez une commande se terminant par print.`
    );
  }

  const action = segmentOf(tokens[actionIndex]).toLowerCase();
  const rawPath = tokens
    .slice(0, actionIndex + 1)
    .join("/")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
  if (!/^\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(rawPath)) {
    throw new Error("Chemin de commande RouterOS invalide.");
  }
  const isExport = action === "export";
  const read = TERMINAL_READ_ACTIONS.has(action);

  const params = [];
  tokens.slice(actionIndex + 1).forEach((token) => {
    const lower = token.toLowerCase();
    if (!isExport && action === "print" && TERMINAL_FLAGS.has(lower)) return;
    if (action === "print" && lower === "where") return;
    if (!token.includes("=")) {
      throw new Error(`Paramètre non reconnu : ${token}. Utilisez la forme clé=valeur.`);
    }
    const index = token.indexOf("=");
    const key = token.slice(0, index);
    const value = token.slice(index + 1);
    if (!key) throw new Error("Paramètre sans nom dans la commande.");
    if (action === "print") {
      if (key.startsWith(".") || key.toLowerCase() === "proplist") {
        params.push(`=${key.startsWith(".") ? key : ".proplist"}=${value}`);
      } else {
        params.push(`?${key}=${value}`);
      }
    } else {
      params.push(`=${key}=${value}`);
    }
  });

  if (action === "export") {
    return { command: tokens.join(" "), path: rawPath, action, mode: "read", destructive: false, params: [] };
  }

  const mode = read ? "read" : "write";
  const destructive = mode === "write" && (TERMINAL_DESTRUCTIVE_ACTIONS.has(action) || rawPath.includes("reset"));
  if (mode === "write") {
    if (["remove", "enable", "disable", "set", "move", "unset"].includes(action)) {
      const hasTarget = params.some((param) => param.startsWith("=.id=") || param.startsWith("=numbers="));
      if (!hasTarget) throw new Error(`La commande « ${action} » nécessite .id=… ou numbers=….`);
    }
    if (action === "run") {
      const hasTarget = params.some((param) => param.startsWith("=.id=") || param.startsWith("=number="));
      if (!hasTarget) throw new Error("L'exécution d'un script nécessite number=… ou .id=….");
    }
    if (["reboot", "shutdown", "reset-configuration"].includes(action) && params.length) {
      throw new Error(`La commande « ${action} » n'accepte pas de paramètres dans le terminal.`);
    }
  }
  return { command: tokens.join(" "), path: rawPath, action, mode, destructive, params };
}

async function runTerminalCommand(payload) {
  const input = payload && typeof payload === "object" ? payload : { command: payload };
  const info = classifyTerminal(input.command);
  if (info.mode === "write" && input.confirm !== true) {
    throw new Error("Cette commande modifie le routeur : confirmez son exécution.");
  }
  const adapter = requireSession();
  const started = Date.now();
  try {
    let rows = [];
    let text = null;
    if (info.action === "export") {
      const exported = await adapter.exportConfig();
      text =
        typeof exported === "string"
          ? exported
          : exported && typeof exported.content === "string"
            ? exported.content
            : "";
      if (!String(text || "").trim()) throw new Error("Le routeur n'a renvoyé aucun export de configuration.");
    } else {
      rows = await adapter.runTerminalCommand(info.path, info.params);
    }
    const duration = Date.now() - started;
    store.addTerminalHistory({
      command: info.command,
      status: "ok",
      mode: info.mode,
      destructive: info.destructive,
      duration,
      rows: rows.length,
    });
    if (info.mode === "write") {
      recordAudit("ok", "Commande terminal", info.command, info.destructive ? "Commande destructive" : "");
    }
    return {
      command: info.command,
      path: info.path,
      action: info.action,
      mode: info.mode,
      destructive: info.destructive,
      rows,
      text,
      duration,
      at: new Date().toISOString(),
    };
  } catch (error) {
    const message = sanitizeError(error);
    store.addTerminalHistory({
      command: info.command,
      status: "error",
      mode: info.mode,
      destructive: info.destructive,
      duration: Date.now() - started,
      detail: message,
    });
    if (info.mode === "write") {
      recordAudit("error", "Commande terminal", info.command, message);
    }
    throw new Error(message);
  }
}

function registerIpc() {
  register("app:info", () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    userData: app.getPath("userData"),
    encryptionAvailable: hasEncryption(),
  }));

  register("profiles:list", () => store.listProfiles().map(publicProfile));

  register("profiles:save", (payload) => {
    if (!payload || !payload.host) throw new Error("Adresse du routeur manquante.");
    const secret =
      payload.password === undefined || payload.password === "" ? undefined : encryptSecret(payload.password);
    return publicProfile(
      store.upsertProfile({
        id: payload.id || undefined,
        name: payload.name || payload.host,
        host: payload.host.trim(),
        port: Number(payload.port) || 8728,
        username: (payload.username || "").trim(),
        tls: Boolean(payload.tls),
        secret,
      })
    );
  });

  register("profiles:delete", (id) => {
    store.deleteProfile(id);
    return store.listProfiles().map(publicProfile);
  });

  register("settings:get", () => store.getSettings());

  register("settings:update", (patch) => {
    if (!patch || typeof patch !== "object") throw new Error("Paramètres invalides.");
    const allowed = {};
    if (typeof patch.pollInterval === "number") {
      allowed.pollInterval = Math.max(1500, Math.min(30000, Math.round(patch.pollInterval)));
    }
    if (typeof patch.accent === "string" && /^[a-z]+$/.test(patch.accent)) allowed.accent = patch.accent;
    if (patch.theme === "dark" || patch.theme === "light") allowed.theme = patch.theme;
    if (typeof patch.sidebarCollapsed === "boolean") allowed.sidebarCollapsed = patch.sidebarCollapsed;
    if (patch.alerts && typeof patch.alerts === "object") {
      const source = patch.alerts;
      const alerts = {};
      const clamp = (value, min, max) =>
        Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.round(Number(value)))) : null;
      const ranges = {
        cpu: [50, 100],
        memory: [50, 100],
        disk: [50, 100],
        temperature: [30, 120],
        packetLoss: [1, 100],
        hotspot: [1, 120],
        cooldown: [1, 120],
      };
      Object.entries(ranges).forEach(([key, [min, max]]) => {
        const value = clamp(source[key], min, max);
        if (value !== null) alerts[key] = value;
      });
      if (typeof source.desktop === "boolean") alerts.desktop = source.desktop;
      if (typeof source.enabled === "boolean") alerts.enabled = source.enabled;
      if (Object.keys(alerts).length) allowed.alerts = alerts;
    }
    return store.updateSettings(allowed);
  }, { action: "Modification des préférences" });

  register("router:connect", connectRouter, {
    action: "Connexion au routeur",
    target: (payload) => (payload && payload.demo ? "Mode démonstration" : (payload && (payload.host || payload.profileName)) || ""),
  });
  register("router:disconnect", disconnectRouter, { action: "Déconnexion du routeur" });
  register("router:status", status);
  register("router:dashboard", async () => {
    const dashboard = await requireSession().getDashboard();
    lastDashboard = dashboard;
    return dashboard;
  });
  register("router:ping", (target, count) => requireSession().ping(target, count));
  register("router:traceroute", (target) => requireSession().traceroute(target));
  register("router:security", () => requireSession().securityAudit());
  register("router:reboot", async () => {
    const adapter = requireSession();
    await adapter.reboot();
    await disconnectRouter();
    return true;
  }, { action: "Redémarrage du routeur" });

  /* ---------- Parc multi-routeurs ---------- */

  register("fleet:list", () => ({ entries: fleetEntries(), current: currentFleetEntry() }));
  register("fleet:probe", (id) => probeProfile(id));
  register("fleet:probe-all", () => probeAllProfiles());
  register("fleet:switch", (id) => switchToProfile(id), {
    action: "Bascule vers un autre routeur",
    target: (id) => {
      const profile = id ? store.getProfile(id) : null;
      return profile ? `${profile.name} (${profile.host})` : String(id || "");
    },
  });

  /* ---------- Terminal RouterOS ---------- */

  register("terminal:check", (command) => classifyTerminal(command));
  register("terminal:run", (payload) => runTerminalCommand(payload));
  register("terminal:history", () => store.listTerminalHistory());
  register("terminal:history:clear", () => store.clearTerminalHistory(), {
    action: "Purge de l'historique du terminal",
  });

  register("hotspot:users", () => requireSession().listHotspotUsers());
  register("hotspot:user:save", (payload) => requireSession().saveHotspotUser(payload), {
    action: "Enregistrement d'un utilisateur hotspot",
    target: (payload) => payload && payload.name,
  });
  register("hotspot:user:remove", (id) => requireSession().removeHotspotUser(id), {
    action: "Suppression d'un utilisateur hotspot",
    target: (id) => id,
  });
  register("hotspot:user:toggle", (id, disabled) => requireSession().toggleHotspotUser(id, disabled), {
    action: "Activation/désactivation d'un utilisateur hotspot",
    target: (id, disabled) => `${id} → ${disabled ? "désactivé" : "activé"}`,
  });
  register("hotspot:active", () => requireSession().listActiveHotspot());
  register("hotspot:active:kick", (id) => requireSession().kickHotspot(id), {
    action: "Déconnexion d'une session hotspot",
    target: (id) => id,
  });
  register("hotspot:profiles", () => requireSession().listHotspotProfiles());
  register("hotspot:servers", () => requireSession().listHotspotServers());
  register("hotspot:vouchers", (options) => requireSession().createVouchers(options || {}), {
    action: "Génération de vouchers",
    target: (options) => (options && options.count ? `${options.count} ticket(s)` : ""),
  });
  register("hotspot:users:generate", (options) => requireSession().generateHotspotUsers(options || {}), {
    action: "Génération d'utilisateurs hotspot",
    target: (options) => (options && options.count ? `${options.count} compte(s)` : ""),
  });
  register("hotspot:hosts", () => requireSession().listHotspotHosts());
  register("hotspot:host:remove", (id) => requireSession().removeHotspotHost(id), {
    action: "Suppression d'un hôte hotspot",
    target: (id) => id,
  });
  register("hotspot:bindings", () => requireSession().listHotspotBindings());
  register("hotspot:binding:save", (payload) => requireSession().saveHotspotBinding(payload), {
    action: "Enregistrement d'une liaison IP",
    target: (payload) => payload && payload.mac,
  });
  register("hotspot:binding:remove", (id) => requireSession().removeHotspotBinding(id), {
    action: "Suppression d'une liaison IP",
    target: (id) => id,
  });
  register("hotspot:binding:toggle", (id, disabled) => requireSession().toggleHotspotBinding(id, disabled), {
    action: "Activation/désactivation d'une liaison IP",
    target: (id) => id,
  });
  register("hotspot:cookies", () => requireSession().listHotspotCookies());
  register("hotspot:cookie:remove", (id) => requireSession().removeHotspotCookie(id), {
    action: "Suppression d'un cookie hotspot",
    target: (id) => id,
  });
  register("dhcp:leases", () => requireSession().listDhcpLeases());
  register("dhcp:lease:remove", (id) => requireSession().removeDhcpLease(id), {
    action: "Suppression d'un bail DHCP",
    target: (id) => id,
  });

  register("ppp:secrets", () => requireSession().listPppSecrets());
  register("ppp:profiles", () => requireSession().listPppProfiles());
  register("ppp:secret:save", (payload) => requireSession().savePppSecret(payload), {
    action: "Enregistrement d'un secret PPP",
    target: (payload) => payload && payload.name,
  });
  register("ppp:secret:remove", (id) => requireSession().removePppSecret(id), {
    action: "Suppression d'un secret PPP",
    target: (id) => id,
  });
  register("ppp:secret:toggle", (id, disabled) => requireSession().togglePppSecret(id, disabled), {
    action: "Activation/désactivation d'un secret PPP",
    target: (id, disabled) => `${id} → ${disabled ? "désactivé" : "activé"}`,
  });
  register("ppp:active", () => requireSession().listPppActive());
  register("ppp:active:kick", (id) => requireSession().kickPpp(id), {
    action: "Déconnexion d'une session PPP",
    target: (id) => id,
  });

  register("interfaces:list", () => requireSession().listInterfaces());
  register("interfaces:toggle", (id, disabled) => requireSession().toggleInterface(id, disabled), {
    action: "Activation/désactivation d'une interface",
    target: (id, disabled) => `${id} → ${disabled ? "désactivée" : "activée"}`,
  });
  register("logs:list", () => requireSession().getLogs());

  /* ---------- Pare-feu, files d'attente, VLAN, routage ---------- */

  register("firewall:list", () => requireSession().listFirewall());
  register("firewall:toggle", (type, id, disabled) => requireSession().toggleFirewallRule(type, id, disabled), {
    action: "Activation/désactivation d'une règle pare-feu",
    target: (type, id, disabled) => `${type} ${id} → ${disabled ? "désactivée" : "activée"}`,
  });
  register("queues:list", () => requireSession().listQueues());
  register("queues:toggle", (id, disabled) => requireSession().toggleQueue(id, disabled), {
    action: "Activation/désactivation d'une file d'attente",
    target: (id, disabled) => `${id} → ${disabled ? "désactivée" : "activée"}`,
  });
  register("vlans:list", () => requireSession().listVlans());
  register("routes:list", () => requireSession().listRoutes());

  /* ---------- Sauvegardes de configuration ---------- */

  const snapshotLabel = () => new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });

  async function captureSnapshot(label) {
    const adapter = requireSession();
    const data = await adapter.exportConfig();
    const saved = store.addBackup({
      label: label || snapshotLabel(),
      identity: adapter.identity,
      host: currentConfig ? currentConfig.host : null,
      mode: adapter.mode,
      format: data.format,
      lines: data.lines,
      bytes: data.bytes,
      content: data.content,
    });
    const { content, ...meta } = saved;
    return meta;
  }

  function backupFileName(extension = "rsc") {
    const identity = (session && session.identity) || "routeur";
    const slug = String(identity)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 40) || "routeur";
    const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(/:/g, "");
    return `mikrodesk-${slug}-${stamp}.${extension}`;
  }

  register("config:current", () => requireSession().exportConfig());
  register("config:backup", (label) => captureSnapshot(label), {
    action: "Instantané de configuration",
    target: (label) => label,
  });
  register("config:backups", () => store.listBackups());
  register("config:backup:get", (id) => store.getBackup(id));
  register("config:backup:delete", (id) => store.deleteBackup(id), {
    action: "Suppression d'un instantané de configuration",
    target: (id) => id,
  });
  register("config:backup:download", async (id) => {
    const item = store.getBackup(id);
    if (!item) throw new Error("Instantané introuvable.");
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Enregistrer la configuration",
      defaultPath: backupFileName(item.format || "rsc"),
      filters: [
        { name: "Script RouterOS", extensions: ["rsc"] },
        { name: "Tous les fichiers", extensions: ["*"] },
      ],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, item.content, "utf8");
    return { canceled: false, path: result.filePath };
  });
  register("config:export:file", async () => {
    const data = await requireSession().exportConfig();
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Exporter la configuration actuelle",
      defaultPath: backupFileName("rsc"),
      filters: [
        { name: "Script RouterOS", extensions: ["rsc"] },
        { name: "Tous les fichiers", extensions: ["*"] },
      ],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, data.content, "utf8");
    return { canceled: false, path: result.filePath, lines: data.lines, bytes: data.bytes };
  });
  register("config:import:file", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Importer une configuration RouterOS",
      properties: ["openFile"],
      filters: [
        { name: "Script RouterOS", extensions: ["rsc", "txt"] },
        { name: "Tous les fichiers", extensions: ["*"] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const content = fs.readFileSync(result.filePaths[0], "utf8");
    let snapshot = null;
    try {
      snapshot = await captureSnapshot("Avant import de fichier");
    } catch {
      /* instantané facultatif */
    }
    const restored = await requireSession().restoreConfig(content);
    return { canceled: false, path: result.filePaths[0], restored, snapshot };
  }, { action: "Restauration de configuration depuis un fichier" });
  register("config:restore", async (id) => {
    const item = store.getBackup(id);
    if (!item) throw new Error("Instantané introuvable.");
    let snapshot = null;
    let warning = "";
    try {
      snapshot = await captureSnapshot("Avant restauration");
    } catch (error) {
      warning = `Instantané de sécurité non créé : ${sanitizeError(error)}`;
    }
    const restored = await requireSession().restoreConfig(item.content);
    return { restored, snapshot, warning, source: item.label || item.at };
  }, { action: "Restauration de configuration", target: (id) => id });
  register("router:backup:create", () => requireSession().createRouterBackup(), {
    action: "Sauvegarde binaire sur le routeur",
  });

  /* ---------- Journal d'audit ---------- */

  register("audit:list", () => store.listAudit());
  register("audit:clear", () => store.clearAudit(), { action: "Purge du journal d'audit" });
  register("audit:export", async () => {
    const entries = store.listAudit();
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Exporter le journal d'audit",
      defaultPath: `mikrodesk-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const escape = (value) => `"${String(value === undefined || value === null ? "" : value).replace(/"/g, '""')}"`;
    const header = ["Date", "Statut", "Action", "Cible", "Routeur", "Adresse", "Détail"];
    const rows = entries.map((entry) =>
      [entry.at, entry.status, entry.action, entry.target, entry.identity, entry.host, entry.detail].map(escape).join(";")
    );
    fs.writeFileSync(result.filePath, [header.map(escape).join(";"), ...rows].join("\r\n"), "utf8");
    return { canceled: false, path: result.filePath, count: entries.length };
  });

  /* ---------- Alertes ---------- */

  register("alerts:list", () => store.listAlerts());
  register("alerts:clear", () => store.clearAlerts(), { action: "Purge de l'historique des alertes" });
  register("alerts:evaluate", (metrics) => evaluateAlerts(metrics));
  register("alerts:summary", () => buildAlertSummary([], store.getSettings().alerts));
  register("alerts:ack", () => store.markAlertsSeen());

  ipcMain.on("window:minimize", () => mainWindow && mainWindow.minimize());
  ipcMain.on("window:maximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on("window:close", () => mainWindow && mainWindow.close());
  ipcMain.handle("window:is-maximized", () => Boolean(mainWindow && mainWindow.isMaximized()));
}

/* ---------- Cycle de vie ---------- */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    store = new Store(app.getPath("userData"));
    Menu.setApplicationMenu(null);
    registerIpc();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    if (session) {
      try {
        session.close();
      } catch {
        /* ignore */
      }
    }
  });
}

process.on("uncaughtException", (error) => {
  console.error("Exception non gérée :", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Promesse rejetée non gérée :", error);
});
