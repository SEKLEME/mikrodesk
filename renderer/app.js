"use strict";

/* ============================================================
   MikroDesk — logique de l'interface
   ============================================================ */

const api = window.mikrodesk;
const validate = window.MikroValidate || null;

/* ---------- Raccourcis DOM ---------- */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/* ---------- État global ---------- */
const state = {
  connected: false,
  demo: false,
  status: null,
  appInfo: null,
  settings: { pollInterval: 3000, accent: "cyan", theme: "dark", sidebarCollapsed: false },
  profilesList: [],
  selectedProfileId: null,
  connectMode: "live",

  dashboard: null,
  users: [],
  active: [],
  hotspotProfiles: [],
  hotspotServers: [],
  pppSecrets: [],
  pppProfiles: [],
  pppActive: [],
  interfaces: [],
  logs: [],
  vouchers: [],
  voucherMeta: null,

  hosts: [],
  bindings: [],
  cookies: [],
  dhcpLeases: [],

  diagPing: null,
  diagTrace: null,
  diagBusy: false,
  securityAudit: null,
  securityBusy: false,

  firewall: [],
  queues: [],
  vlans: [],
  routes: [],
  fwTab: "filter",
  fwQuery: "",
  fwBusy: false,

  backups: [],
  backupSelected: null,
  backupCompare: "current",
  diffRows: [],
  diffStats: { added: 0, removed: 0 },
  diffLoading: false,
  diffToken: 0,
  backupBusy: false,

  audit: [],
  auditQuery: "",
  auditStatus: "",

  alerts: [],
  alertFilter: "",
  alertSettings: null,
  alertsSeenAt: null,
  alertsBusy: false,

  fleet: [],
  fleetQuery: "",
  fleetCompare: [],
  fleetBusy: false,
  fleetProbing: false,

  terminalBlocks: [],
  terminalHistory: [],
  terminalRecall: [],
  terminalIndex: -1,
  terminalBusy: false,
  terminalWelcome: false,

  usersQuery: "",
  usersProfile: "",
  usersState: "",
  usersPage: 1,
  pageSize: 10,

  activeQuery: "",
  pppQuery: "",
  ifaceQuery: "",
  logsQuery: "",
  logsTopic: "",

  hostsQuery: "",
  bindingsQuery: "",
  cookiesQuery: "",
  dhcpQuery: "",
  dhcpFilter: "",

  quickPrintQuery: "",
  quickPrintProfile: "",
  quickPrintSelection: new Set(),

  chartIface: "",
  monitorIface: "all",
  ifaceTraffic: {},

  editingUser: null,
  editingSecret: null,
  editingProfile: null,
  editingBinding: null,

  traffic: { rx: [], tx: [] },
  clockTimer: null,
  pollTimer: null,
  pollErrors: 0,
  polling: false,
  syncTimer: null,

  confirmResolver: null,
};

const SCREENS = {
  dashboard: ["Tableau de bord", "Vue d'ensemble du routeur"],
  "hotspot-users": ["Utilisateurs hotspot", "Comptes et accès du portail captif"],
  "hotspot-active": ["Sessions hotspot", "Connexions en cours sur le hotspot"],
  "hotspot-hosts": ["Hôtes hotspot", "Appareils détectés par le portail captif"],
  "hotspot-bindings": ["Liaisons IP", "Contrôle d'accès par adresse MAC"],
  "hotspot-cookies": ["Cookies hotspot", "Connexions mémorisées par le portail"],
  "hotspot-profiles": ["Profils hotspot", "Limites de débit et de session"],
  vouchers: ["Vouchers", "Génération et impression de tickets d'accès"],
  "quick-print": ["Impression rapide", "Réimpression des accès hotspot existants"],
  "ppp-secrets": ["Secrets PPP", "Comptes PPPoE, L2TP, PPTP et SSTP"],
  "ppp-active": ["Sessions PPP", "Liaisons PPP actuellement établies"],
  interfaces: ["Interfaces", "Ports, bridges, VLAN et débits"],
  firewall: ["Pare-feu & réseau", "Filtrage, NAT, files d'attente, VLAN et routage"],
  dhcp: ["Baux DHCP", "Adresses distribuées par le serveur DHCP"],
  traffic: ["Moniteur de trafic", "Débit temps réel par interface"],
  report: ["Rapport d'activité", "Synthèse de l'état du routeur"],
  logs: ["Journaux", "Événements du routeur"],
  diagnostic: ["Diagnostic réseau", "Ping et traceroute depuis le routeur"],
  security: ["Audit sécurité", "Contrôle de la configuration RouterOS"],
  backups: ["Sauvegardes", "Instantanés et comparaison de configuration"],
  audit: ["Journal d'audit", "Historique local des actions effectuées"],
  alerts: ["Alertes", "Seuils de supervision et historique des incidents"],
  fleet: ["Parc routeurs", "Supervision de tous les routeurs enregistrés"],
  terminal: ["Terminal RouterOS", "Console sécurisée vers le routeur"],
  settings: ["Paramètres", "Connexion, préférences et maintenance"],
};

/* ============================================================
   Utilitaires
   ============================================================ */

function escapeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function initials(name) {
  const clean = String(name || "?").trim();
  if (!clean) return "?";
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

function formatBytes(bytes, decimals = 1) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "0 o";
  const units = ["o", "Ko", "Mo", "Go", "To", "Po"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const scaled = value / Math.pow(1024, index);
  const digits = index === 0 ? 0 : scaled >= 100 ? 0 : decimals;
  return `${scaled.toLocaleString("fr-FR", { maximumFractionDigits: digits })} ${units[index]}`;
}

function formatRate(bytesPerSecond) {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("fr-FR") : "0";
}

function formatDate(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function slugTopic(topic) {
  if (/warning/i.test(topic)) return "warning";
  if (/error|critical/i.test(topic)) return "error";
  if (/hotspot/i.test(topic)) return "hotspot";
  if (/ppp/i.test(topic)) return "ppp";
  if (/system/i.test(topic)) return "system";
  if (/interface/i.test(topic)) return "interface";
  return "";
}

function limitLabel(uptime, bytes) {
  const parts = [];
  if (uptime && uptime !== "0") parts.push(uptime);
  if (bytes && bytes !== "0") parts.push(formatBytes(bytes, 0));
  return parts.length ? parts.join(" · ") : "Illimité";
}

/* ---------- Toasts ---------- */

const TOAST_ICONS = { success: "i-check", error: "i-alert", warn: "i-alert", info: "i-info" };

function ipcMessage(error) {
  const raw = error && error.message !== undefined ? error.message : error;
  return String(raw === undefined || raw === null ? "" : raw).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ""
  );
}

function toast(message, type = "info", timeout = 4500) {
  const stack = $("#toast-stack");
  if (!stack) return;
  const text = ipcMessage(message);
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.innerHTML = `<svg><use href="#${TOAST_ICONS[type] || "i-info"}"/></svg><span>${escapeHtml(text)}</span>`;
  stack.appendChild(node);
  window.setTimeout(() => {
    node.classList.add("is-out");
    window.setTimeout(() => node.remove(), 260);
  }, timeout);
}

/* ---------- Boutons occupés ---------- */

function setBusy(button, busy) {
  if (!button) return;
  button.classList.toggle("is-busy", Boolean(busy));
  button.disabled = Boolean(busy);
}

/* ============================================================
   Fenêtre
   ============================================================ */

function wireWindow() {
  $("#win-min").addEventListener("click", () => api.window.minimize());
  $("#win-max").addEventListener("click", () => api.window.maximize());
  $("#win-close").addEventListener("click", () => api.window.close());

  api.window.onMaximized((maximized) => {
    $("#win-max").innerHTML = `<svg><use href="#${maximized ? "i-restore" : "i-max"}"/></svg>`;
    $("#win-max").title = maximized ? "Restaurer" : "Agrandir";
  });

  api.window.isMaximized().then((maximized) => {
    $("#win-max").innerHTML = `<svg><use href="#${maximized ? "i-restore" : "i-max"}"/></svg>`;
  });

  $("#titlebar").addEventListener("dblclick", (event) => {
    if (event.target.closest("button")) return;
    api.window.maximize();
  });
}

/* ============================================================
   Connexion
   ============================================================ */

function setConnectMode(mode) {
  state.connectMode = mode;
  $$(".segmented-item").forEach((button) => {
    const active = button.dataset.connectMode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  const demo = mode === "demo";
  $("#demo-banner").hidden = !demo;
  $("#connect-mode-badge").textContent = demo ? "DEMO" : "LIVE";
  $("#connect-form .form-grid").hidden = demo;
  $("#profile-strip").hidden = demo || state.profilesList.length === 0;
  $("#conn-remember").closest(".checkline").hidden = demo;
  $("#connect-submit .btn-label").textContent = demo ? "Découvrir la démo" : "Se connecter";
  hideConnectError();
}

function hideConnectError() {
  $("#connect-error").hidden = true;
}

function showConnectError(message) {
  $("#connect-error-text").textContent = message;
  $("#connect-error").hidden = false;
}

function fillProfile(profile, silent = false) {
  state.selectedProfileId = profile.id;
  $("#conn-host").value = profile.host || "";
  $("#conn-port").value = profile.port || 8728;
  $("#conn-username").value = profile.username || "";
  $("#conn-tls").checked = Boolean(profile.tls);
  $("#conn-profile-name").value = profile.name || "";
  const password = $("#conn-password");
  password.value = "";
  password.placeholder = profile.hasSecret ? "•••••••• (enregistré)" : "••••••••";
  $$(".profile-chip").forEach((chip) => chip.classList.toggle("is-active", chip.dataset.id === profile.id));
  if (!silent) toast(`Profil « ${profile.name} » chargé`, "info", 2600);
}

function renderProfileChips() {
  const strip = $("#profile-strip");
  const container = $("#profile-chips");
  if (!state.profilesList.length) {
    strip.hidden = true;
    container.innerHTML = "";
    return;
  }
  strip.hidden = state.connectMode === "demo";
  container.innerHTML = state.profilesList
    .map(
      (profile) => `
      <button type="button" class="profile-chip" data-id="${escapeHtml(profile.id)}" title="${escapeHtml(profile.host)}:${escapeHtml(profile.port)}">
        <i class="${profile.tls ? "" : ""}"></i>${escapeHtml(profile.name)}
      </button>`
    )
    .join("");
  $$(".profile-chip", container).forEach((chip) => {
    chip.addEventListener("click", () => {
      const profile = state.profilesList.find((item) => item.id === chip.dataset.id);
      if (profile) fillProfile(profile);
    });
  });
}

async function loadProfiles() {
  try {
    state.profilesList = await api.profiles.list();
  } catch {
    state.profilesList = [];
  }
  renderProfileChips();
  if (state.connected) renderSavedProfiles();
}

async function submitConnect(event) {
  event.preventDefault();
  if (state.connectMode === "demo") {
    await connect({ demo: true });
    return;
  }
  const payload = {
    demo: false,
    profileId: state.selectedProfileId,
    host: $("#conn-host").value.trim(),
    port: Number($("#conn-port").value),
    username: $("#conn-username").value.trim(),
    password: $("#conn-password").value,
    tls: $("#conn-tls").checked,
    remember: $("#conn-remember").checked,
    profileName: $("#conn-profile-name").value.trim(),
  };
  await connect(payload);
}

async function connect(payload) {
  const button = $("#connect-submit");
  hideConnectError();
  setBusy(button, true);
  try {
    const result = await api.router.connect(payload);
    state.status = result;
    state.connected = true;
    state.demo = Boolean(result.demo);
    state.pollErrors = 0;
    enterApp();
    toast(
      state.demo
        ? "Mode démonstration activé — routeur simulé."
        : `Connecté à ${result.identity || "MikroTik"}`,
      "success"
    );
    await loadProfiles();
    await loadAlertState();
    await refreshDashboard();
    await loadFleet();
    startPolling();
    navigate("dashboard");
    loadUsers().catch(() => {});
  } catch (error) {
    const message = error && error.message ? error.message : "Connexion impossible.";
    if (state.connectMode === "demo") {
      showConnectError(message);
    } else {
      showConnectError(message);
    }
    setConnectErrorPill();
  } finally {
    setBusy(button, false);
  }
}

function setConnectErrorPill() {
  const pill = $("#titlebar-conn");
  pill.dataset.state = "error";
  $("#titlebar-conn-label").textContent = "Connexion échouée";
}

/* ============================================================
   Entrée / sortie de l'application
   ============================================================ */

function enterApp() {
  $("#view-connect").hidden = true;
  $("#view-app").hidden = false;
  document.body.classList.remove("modal-open");
  updateChrome();
}

function leaveApp() {
  stopPolling();
  state.connected = false;
  state.demo = false;
  state.dashboard = null;
  state.traffic = { rx: [], tx: [] };
  state.ifaceTraffic = {};
  state.hosts = [];
  state.bindings = [];
  state.cookies = [];
  state.dhcpLeases = [];
  state.backups = [];
  state.backupSelected = null;
  state.backupCompare = "current";
  state.diffRows = [];
  state.diffStats = { added: 0, removed: 0 };
  state.audit = [];
  state.auditQuery = "";
  state.auditStatus = "";
  state.firewall = [];
  state.queues = [];
  state.vlans = [];
  state.routes = [];
  state.fwQuery = "";
  state.fwTab = "filter";
  state.alerts = [];
  state.alertFilter = "";
  state.alertsSeenAt = null;
  state.fleet = [];
  state.fleetQuery = "";
  state.fleetCompare = [];
  state.terminalBlocks = [];
  state.terminalHistory = [];
  state.terminalRecall = [];
  state.terminalIndex = -1;
  state.terminalWelcome = false;
  state.quickPrintSelection = new Set();
  state.chartIface = "";
  state.monitorIface = "all";
  $("#view-app").hidden = true;
  $("#view-connect").hidden = false;
  $("#conn-password").value = "";
  const pill = $("#titlebar-conn");
  pill.dataset.state = "off";
  $("#titlebar-conn-label").textContent = "Hors ligne";
  $("#sidebar-status").className = "sidebar-status is-off";
  $("#sidebar-identity").textContent = "—";
  $("#sidebar-sub").textContent = "Déconnecté";
  $("#sidebar-cpu-bar").style.width = "0%";
  $("#sidebar-cpu-value").textContent = "—";
  $("#sidebar-live").classList.add("is-idle");
  $("#sync-pill").dataset.state = "idle";
  $("#sync-text").textContent = "Synchronisé";
}

function updateChrome() {
  const status = state.status || {};
  const identity = status.identity || (state.demo ? "MikroTik-CHR (démo)" : "MikroTik");
  const pill = $("#titlebar-conn");
  pill.dataset.state = state.demo ? "demo" : "live";
  $("#titlebar-conn-label").textContent = state.demo ? "Démo active" : "Connecté";

  $("#sidebar-status").className = `sidebar-status${state.demo ? " is-demo" : ""}`;
  $("#sidebar-identity").textContent = identity;
  $("#sidebar-sub").textContent = state.demo
    ? "Mode démonstration"
    : `${status.host || "routeur"}${status.port ? ":" + status.port : ""}`;

  $("#router-name").textContent = identity;
  $("#router-addr").textContent = state.demo
    ? "Routeur simulé"
    : `${status.host || ""}${status.port ? ":" + status.port : ""}`;
  $("#router-avatar").textContent = initials(identity);
  $("#sidebar-live").classList.remove("is-idle");

  if (state.appInfo) {
    $("#sidebar-version-label").textContent = `MikroDesk ${state.appInfo.version}`;
    $("#about-version").textContent = state.appInfo.version;
  }

  renderSettings();
}

/* ============================================================
   Navigation
   ============================================================ */

function navigate(screen) {
  if (!SCREENS[screen]) return;
  state.screen = screen;
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.screen === screen));
  $$(".screen").forEach((section) => section.classList.toggle("is-active", section.id === `screen-${screen}`));
  const [title, subtitle] = SCREENS[screen];
  $("#page-title").textContent = title;
  $("#page-subtitle").textContent = subtitle;
  $("#content").scrollTop = 0;
  $("#view-app").classList.remove("drawer-open");

  switch (screen) {
    case "dashboard":
      refreshDashboard();
      break;
    case "hotspot-users":
      loadUsers();
      break;
    case "hotspot-active":
      loadActive();
      break;
    case "hotspot-hosts":
      loadHosts();
      break;
    case "hotspot-bindings":
      loadBindings();
      break;
    case "hotspot-cookies":
      loadCookies();
      break;
    case "hotspot-profiles":
      loadHotspotProfiles();
      break;
    case "vouchers":
      loadHotspotProfiles();
      break;
    case "quick-print":
      loadQuickPrint();
      break;
    case "ppp-secrets":
      loadPppSecrets();
      break;
    case "ppp-active":
      loadPppActive();
      break;
    case "interfaces":
      loadInterfaces();
      break;
    case "firewall":
      loadNetwork();
      break;
    case "dhcp":
      loadDhcp();
      break;
    case "traffic":
      loadMonitor();
      break;
    case "report":
      loadReport();
      break;
    case "logs":
      loadLogs();
      break;
    case "diagnostic":
      renderDiagnostics();
      break;
    case "security":
      if (state.securityAudit) renderSecurity();
      else runSecurityAudit();
      break;
    case "backups":
      loadBackups();
      break;
    case "audit":
      loadAudit();
      break;
    case "alerts":
      loadAlerts();
      break;
    case "fleet":
      loadFleet();
      break;
    case "terminal":
      loadTerminal();
      break;
    case "settings":
      renderSettings();
      renderSavedProfiles();
      break;
    default:
      break;
  }
}

function wireNavigation() {
  $$(".nav-item").forEach((item) => {
    item.addEventListener("click", () => navigate(item.dataset.screen));
  });
  $$("[data-goto]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.goto));
  });
  $("#drawer-btn").addEventListener("click", () => $("#view-app").classList.toggle("drawer-open"));
  $("#alerts-bell").addEventListener("click", () => navigate("alerts"));
  $("#topbar-refresh").addEventListener("click", () => refreshCurrentScreen(true));
  $("#sidebar-disconnect").addEventListener("click", disconnect);
  $("#settings-disconnect").addEventListener("click", disconnect);
  $("#chart-iface").addEventListener("change", (event) => {
    state.chartIface = event.target.value;
    renderTrafficChart();
  });
}

function refreshCurrentScreen(showToast = false) {
  switch (state.screen) {
    case "dashboard":
      refreshDashboard(false, showToast);
      break;
    case "hotspot-users":
      loadUsers(showToast);
      break;
    case "hotspot-active":
      loadActive(showToast);
      break;
    case "hotspot-hosts":
      loadHosts(showToast);
      break;
    case "hotspot-bindings":
      loadBindings(showToast);
      break;
    case "hotspot-cookies":
      loadCookies(showToast);
      break;
    case "hotspot-profiles":
      loadHotspotProfiles(showToast);
      break;
    case "quick-print":
      loadQuickPrint(showToast);
      break;
    case "ppp-secrets":
      loadPppSecrets(showToast);
      break;
    case "ppp-active":
      loadPppActive(showToast);
      break;
    case "interfaces":
      loadInterfaces(showToast);
      break;
    case "firewall":
      loadNetwork(showToast);
      break;
    case "dhcp":
      loadDhcp(showToast);
      break;
    case "traffic":
      loadMonitor(showToast);
      break;
    case "report":
      loadReport(showToast);
      break;
    case "logs":
      loadLogs(showToast);
      break;
    case "diagnostic":
      renderDiagnostics();
      if (showToast) toast("Résultats de diagnostic à jour", "info", 2000);
      break;
    case "security":
      runSecurityAudit(showToast);
      break;
    case "backups":
      loadBackups(showToast);
      break;
    case "audit":
      loadAudit(showToast);
      break;
    case "alerts":
      loadAlerts(showToast);
      break;
    case "fleet":
      loadFleet(showToast);
      break;
    case "terminal":
      loadTerminal(showToast);
      break;
    case "settings":
      api.router.status().then((status) => {
        state.status = status;
        renderSettings();
      });
      loadProfiles();
      if (showToast) toast("Paramètres actualisés", "info", 2000);
      break;
    default:
      refreshDashboard();
  }
}

/* ============================================================
   Supervision
   ============================================================ */

function setSync(stateName, text) {
  const pill = $("#sync-pill");
  pill.dataset.state = stateName;
  $("#sync-text").textContent = text;
}

async function refreshDashboard(silent = true, notify = false) {
  if (!state.connected || state.polling) return;
  state.polling = true;
  if (!silent) setSync("busy", "Lecture…");
  try {
    const dashboard = await api.router.dashboard();
    state.dashboard = dashboard;
    state.pollErrors = 0;
    renderDashboard(dashboard);
    evaluateAlerts({
      cpu: dashboard.cpuLoad,
      memory: dashboard.memoryUsage,
      disk: dashboard.diskUsage,
      temperature: dashboard.temperature,
      interfaces: (dashboard.interfaces || []).map((iface) => ({
        name: iface.name,
        running: iface.running,
        disabled: iface.disabled,
      })),
    });
    setSync("idle", `Synchronisé ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`);
    if (notify) toast("Données actualisées", "success", 2000);
  } catch (error) {
    state.pollErrors += 1;
    setSync("error", "Erreur de lecture");
    if (state.pollErrors >= 3) {
      stopPolling();
      toast(`Connexion au routeur perdue : ${error.message}`, "error", 7000);
      await api.router.disconnect().catch(() => {});
      leaveApp();
    } else if (!silent || notify) {
      toast(error.message || "Lecture impossible", "error");
    }
  } finally {
    state.polling = false;
  }
}

function startPolling() {
  stopPolling();
  const interval = Math.max(1500, Number(state.settings.pollInterval) || 3000);
  state.pollTimer = window.setInterval(() => refreshDashboard(true), interval);
}

function stopPolling() {
  if (state.pollTimer) {
    window.clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function pushTraffic(dashboard) {
  const history = state.traffic;
  history.rx.push(dashboard.totalRx || 0);
  history.tx.push(dashboard.totalTx || 0);
  if (history.rx.length > 90) history.rx.shift();
  if (history.tx.length > 90) history.tx.shift();

  (dashboard.interfaces || []).forEach((iface) => {
    const key = iface.name || iface.id;
    if (!key) return;
    if (!state.ifaceTraffic[key]) state.ifaceTraffic[key] = { rx: [], tx: [] };
    const series = state.ifaceTraffic[key];
    series.rx.push(iface.rxRate || 0);
    series.tx.push(iface.txRate || 0);
    if (series.rx.length > 90) series.rx.shift();
    if (series.tx.length > 90) series.tx.shift();
  });
}

function historyFor(ifaceName) {
  if (!ifaceName) return state.traffic;
  const series = state.ifaceTraffic[ifaceName];
  return series && (series.rx.length || series.tx.length) ? series : { rx: [], tx: [] };
}

function syncChartIfaceOptions(interfaces) {
  const select = $("#chart-iface");
  if (!select) return;
  const previous = state.chartIface;
  select.innerHTML =
    '<option value="">Toutes les interfaces</option>' +
    (interfaces || [])
      .map((iface) => `<option value="${escapeHtml(iface.name || iface.id)}">${escapeHtml(iface.name || iface.id)}</option>`)
      .join("");
  if (previous && (interfaces || []).some((iface) => (iface.name || iface.id) === previous)) {
    select.value = previous;
  } else {
    select.value = "";
    state.chartIface = "";
  }
}

/* ---------- Horloge ---------- */

function startClock() {
  const label = $("#hero-clock");
  if (!label) return;
  const update = () => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const time = now.toLocaleTimeString("fr-FR", { hour12: false });
    label.innerHTML = `<svg><use href="#i-clock"/></svg> ${date} ${time}`;
    label.title = "Date et heure du poste";
  };
  update();
  if (state.clockTimer) window.clearInterval(state.clockTimer);
  state.clockTimer = window.setInterval(update, 1000);
}

function renderDashboard(dashboard) {
  pushTraffic(dashboard);

  $("#hero-identity").textContent = dashboard.identity || "MikroTik";
  $("#hero-model").textContent = [dashboard.board, dashboard.architecture].filter(Boolean).join(" · ") || "Routeur MikroTik";
  $("#hero-version").textContent = `RouterOS ${dashboard.version || "—"}`;
  $("#hero-uptime").innerHTML = `<svg><use href="#i-clock"/></svg> ${escapeHtml(dashboard.uptime || "—")}`;
  $("#hero-board").innerHTML = `<svg><use href="#i-router"/></svg> ${escapeHtml(dashboard.board || "—")}`;
  $("#hero-mode").textContent = dashboard.demo ? "Mode démonstration" : "API RouterOS en direct";

  setGauge("cpu", dashboard.cpuLoad);
  setGauge("ram", dashboard.memoryUsage);
  setGauge("disk", dashboard.diskUsage);

  $("#stat-rx").textContent = formatRate(dashboard.totalRx);
  $("#stat-tx").textContent = formatRate(dashboard.totalTx);
  const rxTotal = dashboard.interfaces.reduce((sum, iface) => sum + iface.rxByte, 0);
  const txTotal = dashboard.interfaces.reduce((sum, iface) => sum + iface.txByte, 0);
  $("#stat-rx-total").textContent = `${formatBytes(rxTotal)} reçus au total`;
  $("#stat-tx-total").textContent = `${formatBytes(txTotal)} envoyés au total`;
  $("#stat-active").textContent = formatNumber(dashboard.hotspotActive);
  $("#stat-users").textContent = formatNumber(dashboard.hotspotUsers);
  $("#stat-ppp").textContent = formatNumber(dashboard.pppActive);
  $("#stat-ppp-secrets").textContent = formatNumber(dashboard.pppSecrets);

  $("#nav-count-users").textContent = formatNumber(dashboard.hotspotUsers);
  $("#nav-count-active").textContent = formatNumber(dashboard.hotspotActive);
  $("#nav-count-ppp").textContent = formatNumber(dashboard.pppSecrets);

  $("#sidebar-cpu-bar").style.width = `${Math.max(0, Math.min(100, dashboard.cpuLoad))}%`;
  $("#sidebar-cpu-value").textContent = `${dashboard.cpuLoad}%`;

  $("#res-cpu").textContent = `${dashboard.cpuLoad}%`;
  $("#res-cpu-sub").textContent = [dashboard.cpuCount ? `${dashboard.cpuCount} cœurs` : "", dashboard.cpuFrequency]
    .filter(Boolean)
    .join(" · ") || "Processeur";
  $("#res-cpu-bar").style.width = `${dashboard.cpuLoad}%`;

  $("#res-ram").textContent = `${dashboard.memoryUsage}%`;
  $("#res-ram-sub").textContent =
    dashboard.totalMemory > 0
      ? `${formatBytes(dashboard.freeMemory)} libres / ${formatBytes(dashboard.totalMemory)}`
      : "Mémoire";
  $("#res-ram-bar").style.width = `${dashboard.memoryUsage}%`;

  $("#res-disk").textContent = `${dashboard.diskUsage}%`;
  $("#res-disk-sub").textContent =
    dashboard.totalDisk > 0
      ? `${formatBytes(dashboard.freeDisk)} libres / ${formatBytes(dashboard.totalDisk)}`
      : "Stockage";
  $("#res-disk-bar").style.width = `${dashboard.diskUsage}%`;

  const temperature = dashboard.temperature;
  $("#res-temp").textContent = temperature ? `${temperature} °C` : "—";
  $("#res-temp-sub").textContent = temperature ? "Capteur interne" : "Non disponible";
  $("#res-temp-bar").style.width = temperature ? `${Math.min(100, Math.max(0, ((temperature - 20) / 60) * 100))}%` : "0%";
  $("#resources-temp").textContent = temperature ? `${temperature} °C` : "—";

  renderDashboardInterfaces(dashboard.interfaces || []);
  renderDashboardLogs(dashboard.logs || []);
  syncChartIfaceOptions(dashboard.interfaces || []);
  renderTrafficChart();
  if (state.screen === "traffic") renderMonitor();
  drawSparkline("spark-rx", state.traffic.rx, getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#22d3ee");
  drawSparkline("spark-tx", state.traffic.tx, getComputedStyle(document.body).getPropertyValue("--violet").trim() || "#a78bfa");

  if (!$("#view-app").hidden) {
    $("#router-name").textContent = dashboard.identity || "MikroTik";
    $("#router-avatar").textContent = initials(dashboard.identity);
  }
}

function setGauge(name, percent) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  const gauge = $(`.gauge[data-gauge="${name}"]`);
  if (!gauge) return;
  const circle = $(".gauge-value", gauge);
  const circumference = 2 * Math.PI * 50;
  circle.style.strokeDashoffset = String(circumference * (1 - value / 100));
  const label = $(`#gauge-${name}`);
  if (label) label.innerHTML = `${Math.round(value)}<span>%</span>`;
}

function renderDashboardInterfaces(interfaces) {
  const container = $("#dash-interfaces");
  const list = interfaces.filter((iface) => iface.type !== "loopback").slice(0, 6);
  if (!list.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:20px"><span>Aucune interface disponible.</span></div>`;
    return;
  }
  container.innerHTML = list
    .map((iface) => {
      const active = iface.running && !iface.disabled;
      const bars = Array.from({ length: 10 }, (_, index) => {
        const magnitude = Math.log10((iface.rxRate || 0) + 10) * 16;
        const height = active ? Math.max(10, Math.min(100, magnitude + ((index * 37) % 26) - 12)) : 8;
        return `<i style="height:${height}%"></i>`;
      }).join("");
      return `
        <div class="iface-mini">
          <div class="iface-mini-head">
            <i class="iface-dot ${active ? "" : "is-off"}"></i>
            <strong title="${escapeHtml(iface.name)}">${escapeHtml(iface.name)}</strong>
            <span class="iface-type">${escapeHtml(iface.type || "ether")}</span>
          </div>
          <div class="iface-mini-rates">
            <span class="iface-rate down"><svg><use href="#i-arrow-down"/></svg>${formatRate(iface.rxRate)}</span>
            <span class="iface-rate up"><svg><use href="#i-arrow-up"/></svg>${formatRate(iface.txRate)}</span>
          </div>
          <div class="iface-bars">${bars}</div>
        </div>`;
    })
    .join("");
}

function renderDashboardLogs(logs) {
  const list = $("#dash-logs");
  if (!logs.length) {
    list.innerHTML = `<li><div class="tl-body"><strong>Aucun événement récent.</strong></div></li>`;
    return;
  }
  list.innerHTML = logs
    .slice(0, 5)
    .map((entry) => {
      const tone = slugTopic(entry.topics || "");
      const toneClass = ["warning", "error"].includes(tone) ? `tone-${tone === "warning" ? "warn" : "err"}` : tone === "system" ? "tone-ok" : "";
      return `
        <li>
          <span class="tl-dot ${toneClass}"></span>
          <div class="tl-body">
            <strong>${escapeHtml(entry.message || "")}</strong>
            <span>${escapeHtml(entry.time || "")} · ${escapeHtml(entry.topics || "system")}</span>
          </div>
        </li>`;
    })
    .join("");
}

/* ---------- Graphiques ---------- */

function prepareCanvas(canvas) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function renderTrafficChart() {
  const canvas = $("#traffic-chart");
  if (!canvas || !$("#screen-dashboard").classList.contains("is-active")) return;
  paintTrafficChart(canvas, historyFor(state.chartIface), $("#chart-range"), $("#chart-empty"));
}

function renderMonitorChart() {
  const canvas = $("#monitor-chart");
  if (!canvas || !$("#screen-traffic").classList.contains("is-active")) return;
  const key = state.monitorIface === "all" ? "" : state.monitorIface;
  paintTrafficChart(canvas, historyFor(key), $("#monitor-range"), $("#monitor-empty"));
}

function paintTrafficChart(canvas, history, rangeEl, emptyEl) {
  const prepared = prepareCanvas(canvas);
  if (!prepared) return;
  const { ctx, width, height } = prepared;
  ctx.clearRect(0, 0, width, height);

  const samples = Math.max(history.rx.length, history.tx.length, 2);
  const maxValue = Math.max(1024, ...history.rx, ...history.tx) * 1.12;
  const padTop = 12;
  const padBottom = 22;
  const padLeft = 4;
  const padRight = 4;
  const plotHeight = height - padTop - padBottom;
  const plotWidth = width - padLeft - padRight;

  const styles = getComputedStyle(document.body);
  const accent = styles.getPropertyValue("--accent").trim() || "#22d3ee";
  const violet = styles.getPropertyValue("--violet").trim() || "#a78bfa";
  const gridColor = styles.getPropertyValue("--chart-grid").trim() || "rgba(130, 165, 210, 0.09)";
  const labelColor = styles.getPropertyValue("--chart-label").trim() || "rgba(140, 160, 190, 0.6)";

  // Grille horizontale
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.font = "10px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = labelColor;
  for (let i = 0; i <= 4; i += 1) {
    const y = padTop + (plotHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, y + 0.5);
    ctx.lineTo(width - padRight, y + 0.5);
    ctx.stroke();
    const value = maxValue * (1 - i / 4);
    ctx.fillText(formatBytes(value, 0) + "/s", padLeft + 2, y - 3 < 10 ? y + 10 : y - 3);
  }

  if (samples < 2) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  const xFor = (index) => padLeft + (plotWidth * index) / Math.max(1, samples - 1);
  const yFor = (value) => padTop + plotHeight * (1 - Math.max(0, Math.min(maxValue, value)) / maxValue);

  const drawSeries = (values, color, fill) => {
    if (!values.length) return;
    const offset = samples - values.length;
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = xFor(index + offset);
      const y = yFor(value);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (fill) {
      ctx.lineTo(xFor(values.length - 1 + offset), padTop + plotHeight);
      ctx.lineTo(xFor(offset), padTop + plotHeight);
      ctx.closePath();
      const gradient = ctx.createLinearGradient(0, padTop, 0, padTop + plotHeight);
      gradient.addColorStop(0, fill);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  };

  drawSeries(history.tx, violet, "rgba(167,139,250,0.16)");
  drawSeries(history.rx, accent, "rgba(34,211,238,0.18)");

  // Dernier point
  const last = history.rx.length - 1;
  if (last >= 0) {
    const x = xFor(last);
    const y = yFor(history.rx[last]);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  const seconds = Math.round((samples - 1) * (state.settings.pollInterval / 1000));
  if (rangeEl) rangeEl.textContent = seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} s`;
}

function drawSparkline(id, values, color) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  if (!values.length) return;
  const maxValue = Math.max(1024, ...values) * 1.15;
  const point = (index) => ({
    x: (width * index) / Math.max(1, values.length - 1),
    y: height - 3 - (height - 6) * (Math.max(0, Math.min(maxValue, values[index])) / maxValue),
  });

  ctx.beginPath();
  values.forEach((_, index) => {
    const { x, y } = point(index);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "round";
  ctx.stroke();

  const last = point(values.length - 1);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, color + "55");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fill();
}

/* ============================================================
   Utilisateurs hotspot
   ============================================================ */

function filteredUsers() {
  const query = state.usersQuery.trim().toLowerCase();
  return state.users.filter((user) => {
    if (state.usersProfile && user.profile !== state.usersProfile) return false;
    if (state.usersState === "disabled" && !user.disabled) return false;
    if (state.usersState === "active" && user.disabled) return false;
    if (!query) return true;
    return [user.name, user.comment, user.profile, user.password]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function renderUsers() {
  const data = filteredUsers();
  const totalPages = Math.max(1, Math.ceil(data.length / state.pageSize));
  if (state.usersPage > totalPages) state.usersPage = totalPages;
  const start = (state.usersPage - 1) * state.pageSize;
  const rows = data.slice(start, start + state.pageSize);
  const tbody = $("#users-tbody");

  if (!rows.length) {
    tbody.innerHTML = `
      <tr><td colspan="8">
        <div class="empty-state" style="padding:34px 10px">
          <svg><use href="#i-users"/></svg>
          <strong>Aucun utilisateur</strong>
          <span>${state.users.length ? "Aucun résultat pour ce filtre." : "Créez un compte hotspot pour commencer."}</span>
        </div>
      </td></tr>`;
  } else {
    tbody.innerHTML = rows
      .map(
        (user) => `
        <tr>
          <td>
            <div class="cell-main">
              <span class="cell-avatar">${escapeHtml(initials(user.name))}</span>
              <span>${escapeHtml(user.name)}</span>
            </div>
          </td>
          <td><span class="mono">${escapeHtml(user.password || "—")}</span></td>
          <td><span class="pill">${escapeHtml(user.profile || "default")}</span></td>
          <td title="${escapeHtml(limitLabel(user.limitUptime, user.limitBytesTotal))}">${escapeHtml(limitLabel(user.limitUptime, user.limitBytesTotal))}</td>
          <td><span class="mono">${formatBytes((user.bytesIn || 0) + (user.bytesOut || 0))}</span></td>
          <td class="muted">${escapeHtml(user.comment || "—")}</td>
          <td><span class="pill ${user.disabled ? "off" : "ok"}">${user.disabled ? "Désactivé" : "Actif"}</span></td>
          <td class="col-actions">
            <div class="row-actions">
              <button class="row-btn accent" data-action="edit-user" data-id="${escapeHtml(user.id)}" title="Modifier">
                <svg><use href="#i-edit"/></svg>
              </button>
              <button class="row-btn" data-action="toggle-user" data-id="${escapeHtml(user.id)}" title="${user.disabled ? "Activer" : "Désactiver"}">
                <svg><use href="#i-${user.disabled ? "check" : "shield"}"/></svg>
              </button>
              <button class="row-btn danger" data-action="delete-user" data-id="${escapeHtml(user.id)}" title="Supprimer">
                <svg><use href="#i-trash"/></svg>
              </button>
            </div>
          </td>
        </tr>`
      )
      .join("");
  }

  $("#users-summary").textContent = `${data.length} utilisateur${data.length > 1 ? "s" : ""}${
    data.length !== state.users.length ? ` sur ${state.users.length}` : ""
  } · page ${state.usersPage}/${totalPages}`;
  renderPager($("#users-pager"), state.usersPage, totalPages, (page) => {
    state.usersPage = page;
    renderUsers();
  });
  renderProfileFilters();
}

function renderPager(container, current, total, onSelect) {
  if (!container) return;
  const buttons = [];
  buttons.push(`<button type="button" data-page="${current - 1}" ${current <= 1 ? "disabled" : ""} aria-label="Page précédente">‹</button>`);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = Array.from(pages).filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  let previous = 0;
  sorted.forEach((page) => {
    if (page - previous > 1) buttons.push(`<span class="muted" style="padding:0 3px">…</span>`);
    buttons.push(`<button type="button" data-page="${page}" class="${page === current ? "is-active" : ""}">${page}</button>`);
    previous = page;
  });
  buttons.push(`<button type="button" data-page="${current + 1}" ${current >= total ? "disabled" : ""} aria-label="Page suivante">›</button>`);
  container.innerHTML = buttons.join("");
  $$("button[data-page]", container).forEach((button) => {
    button.addEventListener("click", () => onSelect(Number(button.dataset.page)));
  });
}

function renderProfileFilters() {
  const select = $("#users-filter-profile");
  const current = state.usersProfile;
  const options = ["<option value=\"\">Tous les profils</option>"]
    .concat(
      state.hotspotProfiles.map(
        (profile) => `<option value="${escapeHtml(profile.name)}">${escapeHtml(profile.name)}</option>`
      )
    )
    .join("");
  select.innerHTML = options;
  select.value = current;
}

async function loadUsers(notify = false) {
  try {
    const [users, profiles, servers] = await Promise.all([
      api.hotspot.users(),
      api.hotspot.profiles().catch(() => state.hotspotProfiles),
      api.hotspot.servers().catch(() => state.hotspotServers),
    ]);
    state.users = users;
    state.hotspotProfiles = profiles || [];
    state.hotspotServers = servers || [];
    renderUsers();
    renderUserProfileOptions();
    renderVoucherProfileOptions();
    renderHotspotProfiles();
    if (state.screen === "quick-print") renderQuickPrint();
    if (notify) toast("Utilisateurs actualisés", "success", 2000);
  } catch (error) {
    toast(error.message, "error");
  }
}

function renderUserProfileOptions(current) {
  const select = $("#u-profile");
  const names = state.hotspotProfiles.map((profile) => profile.name).filter(Boolean);
  const target = current !== undefined ? current : select.value;
  const stale = Boolean(target && !names.includes(target));
  const options = stale ? names.concat(target) : names.slice();
  if (!options.length) {
    select.innerHTML = `<option value="">Aucun profil disponible</option>`;
    select.disabled = true;
    return;
  }
  select.disabled = false;
  select.innerHTML = options
    .map(
      (name) =>
        `<option value="${escapeHtml(name)}">${escapeHtml(name)}${
          stale && name === target ? " (introuvable)" : ""
        }</option>`
    )
    .join("");
  if (target && options.includes(target)) select.value = target;
  else select.value = names.includes("default") ? "default" : names[0];
}

function renderUserServerOptions(current) {
  const select = $("#u-server");
  const names = state.hotspotServers.map((server) => server.name).filter(Boolean);
  const target = current !== undefined ? current : select.value || "all";
  const options = ["all"].concat(names.filter((name) => name !== "all"));
  const stale = Boolean(target && !options.includes(target));
  if (stale) options.push(target);
  select.innerHTML = options
    .map(
      (name) =>
        `<option value="${escapeHtml(name)}">${
          name === "all" ? "Tous les serveurs" : escapeHtml(name)
        }${stale && name === target ? " (introuvable)" : ""}</option>`
    )
    .join("");
  select.value = target && options.includes(target) ? target : "all";
}

function renderBindingServerOptions(current) {
  const select = $("#b-server");
  const names = state.hotspotServers.map((server) => server.name).filter(Boolean);
  const target = current !== undefined ? current : select.value || "all";
  const options = ["all"].concat(names.filter((name) => name !== "all"));
  const stale = Boolean(target && !options.includes(target));
  if (stale) options.push(target);
  select.innerHTML = options
    .map(
      (name) =>
        `<option value="${escapeHtml(name)}">${
          name === "all" ? "Tous les serveurs" : escapeHtml(name)
        }${stale && name === target ? " (introuvable)" : ""}</option>`
    )
    .join("");
  select.value = target && options.includes(target) ? target : "all";
}

function renderPppProfileOptions(current) {
  const select = $("#p-profile");
  const names = state.pppProfiles.map((profile) => profile.name).filter(Boolean);
  const target = current !== undefined ? current : select.value;
  const stale = Boolean(target && !names.includes(target));
  const options = stale ? names.concat(target) : names.slice();
  const safe = options.length ? options : ["default"];
  select.innerHTML = safe
    .map(
      (name) =>
        `<option value="${escapeHtml(name)}">${escapeHtml(name)}${
          stale && name === target ? " (introuvable)" : ""
        }</option>`
    )
    .join("");
  if (target && safe.includes(target)) select.value = target;
  else select.value = safe.includes("default") ? "default" : safe[0];
}

async function openUserModal(user) {
  state.editingUser = user || null;
  try {
    const [profiles, servers] = await Promise.all([api.hotspot.profiles(), api.hotspot.servers()]);
    state.hotspotProfiles = profiles || [];
    state.hotspotServers = servers || [];
  } catch {
    /* on conserve le cache local : le routeur reste la source de vérité au moment d'enregistrer */
  }
  $("#modal-user-title").textContent = user ? "Modifier l'utilisateur" : "Nouvel utilisateur";
  $("#u-name").value = user ? user.name : "";
  $("#u-password").value = user ? user.password : "";
  $("#u-uptime").value = user ? user.limitUptime || "0" : "0";
  $("#u-bytes").value = user ? user.limitBytesTotal || "0" : "0";
  $("#u-comment").value = user ? user.comment || "" : "";
  $("#u-disabled").checked = Boolean(user && user.disabled);
  $("#user-error").hidden = true;
  renderUserProfileOptions(user ? user.profile || "default" : undefined);
  renderUserServerOptions(user ? user.server || "all" : "all");
  if (!state.hotspotProfiles.length) {
    $("#user-error").textContent =
      "Aucun profil hotspot n'a pu être lu sur le routeur. Vérifiez que le paquet hotspot est actif et que l'utilisateur API possède le droit « read ».";
    $("#user-error").hidden = false;
  }
  openModal("user");
  window.setTimeout(() => $("#u-name").focus(), 80);
}

async function saveUser(event) {
  event.preventDefault();
  const payload = {
    isNew: !state.editingUser,
    id: state.editingUser ? state.editingUser.id : undefined,
    name: $("#u-name").value.trim(),
    password: $("#u-password").value,
    profile: $("#u-profile").value,
    server: $("#u-server").value || "all",
    comment: $("#u-comment").value.trim(),
    disabled: $("#u-disabled").checked,
    limitUptime: $("#u-uptime").value.trim() || "0",
    limitBytesTotal: $("#u-bytes").value.trim() || "0",
  };
  const errorBox = $("#user-error");
  errorBox.hidden = true;
  try {
    if (!validate) throw new Error("Module de validation indisponible.");
    payload.name = validate.validateName(payload.name, "Le nom d'utilisateur", { max: 64 });
    payload.profile = validate.resolveProfile(payload.profile, state.hotspotProfiles, "profil hotspot");
    if (payload.server !== "all") {
      payload.server = validate.resolveChoice(
        payload.server,
        state.hotspotServers.map((item) => item.name),
        "Le serveur hotspot"
      );
    }
    payload.limitUptime = validate.normalizeDuration(payload.limitUptime, "La limite de temps");
    payload.limitBytesTotal = validate.normalizeBytes(payload.limitBytesTotal, "La limite de données");
    payload.comment = validate.validateComment(payload.comment, "Le commentaire");
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    return;
  }
  const button = $("#user-save");
  setBusy(button, true);
  try {
    await api.hotspot.saveUser(payload);
    closeModal();
    toast(payload.isNew ? "Utilisateur créé" : "Utilisateur mis à jour", "success");
    await loadUsers();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    setBusy(button, false);
  }
}

function wireUsers() {
  $("#users-search").addEventListener("input", (event) => {
    state.usersQuery = event.target.value;
    state.usersPage = 1;
    renderUsers();
  });
  $("#users-filter-profile").addEventListener("change", (event) => {
    state.usersProfile = event.target.value;
    state.usersPage = 1;
    renderUsers();
  });
  $("#users-filter-state").addEventListener("change", (event) => {
    state.usersState = event.target.value;
    state.usersPage = 1;
    renderUsers();
  });
  $("#users-add-btn").addEventListener("click", () => openUserModal(null));
  $("#users-vouchers-btn").addEventListener("click", () => navigate("vouchers"));
  $("#user-form").addEventListener("submit", saveUser);

  $("#users-tbody").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const user = state.users.find((item) => item.id === button.dataset.id);
    if (!user) return;
    if (button.dataset.action === "edit-user") {
      openUserModal(user);
    } else if (button.dataset.action === "toggle-user") {
      try {
        await api.hotspot.toggleUser(user.id, !user.disabled);
        toast(`Utilisateur ${user.disabled ? "activé" : "désactivé"}`, "success", 2600);
        await loadUsers();
        if (state.screen === "dashboard") refreshDashboard();
      } catch (error) {
        toast(error.message, "error");
      }
    } else if (button.dataset.action === "delete-user") {
      const confirmed = await askConfirm({
        title: "Supprimer cet utilisateur ?",
        text: `Le compte « ${user.name} » sera définitivement supprimé du routeur.`,
        ok: "Supprimer",
      });
      if (!confirmed) return;
      try {
        await api.hotspot.removeUser(user.id);
        toast("Utilisateur supprimé", "success");
        await loadUsers();
        if (state.screen === "dashboard") refreshDashboard();
      } catch (error) {
        toast(error.message, "error");
      }
    }
  });
}

/* ============================================================
   Sessions hotspot
   ============================================================ */

function renderActive() {
  const query = state.activeQuery.trim().toLowerCase();
  const rows = state.active.filter((session) => {
    if (!query) return true;
    return [session.user, session.address, session.mac, session.server]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  $("#active-count").textContent = formatNumber(state.active.length);
  $("#active-in").textContent = formatBytes(state.active.reduce((sum, session) => sum + (session.bytesIn || 0), 0));
  $("#active-out").textContent = formatBytes(state.active.reduce((sum, session) => sum + (session.bytesOut || 0), 0));

  const tbody = $("#active-tbody");
  if (!rows.length) {
    tbody.innerHTML = "";
    $("#active-empty").hidden = false;
    return;
  }
  $("#active-empty").hidden = true;
  tbody.innerHTML = rows
    .map(
      (session) => `
      <tr>
        <td>
          <div class="cell-main">
            <span class="cell-avatar">${escapeHtml(initials(session.user))}</span>
            <span>${escapeHtml(session.user)}</span>
          </div>
        </td>
        <td><span class="mono">${escapeHtml(session.address || "—")}</span></td>
        <td><span class="mono">${escapeHtml(session.mac || "—")}</span></td>
        <td><span class="pill">${escapeHtml(session.server || "all")}</span></td>
        <td class="muted">${escapeHtml(session.loginBy || "—")}</td>
        <td>${escapeHtml(session.uptime || "—")}</td>
        <td><span class="mono">${formatBytes(session.bytesIn)}</span></td>
        <td><span class="mono">${formatBytes(session.bytesOut)}</span></td>
        <td class="col-actions">
          <button class="row-btn danger" data-kick="${escapeHtml(session.id)}" title="Déconnecter">
            <svg><use href="#i-kick"/></svg>
          </button>
        </td>
      </tr>`
    )
    .join("");
}

async function loadActive(notify = false) {
  try {
    state.active = await api.hotspot.active();
    renderActive();
    evaluateAlerts({ hotspot: state.active.map((session) => ({ user: session.user, timeLeft: session.timeLeft })) });
    if (notify) toast("Sessions actualisées", "success", 2000);
  } catch (error) {
    toast(error.message, "error");
  }
}

function wireActive() {
  $("#active-search").addEventListener("input", (event) => {
    state.activeQuery = event.target.value;
    renderActive();
  });
  $("#active-refresh").addEventListener("click", () => loadActive(true));
  $("#active-tbody").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-kick]");
    if (!button) return;
    const session = state.active.find((item) => item.id === button.dataset.kick);
    if (!session) return;
    const confirmed = await askConfirm({
      title: "Déconnecter cette session ?",
      text: `L'utilisateur « ${session.user} » sera immédiatement déconnecté du hotspot.`,
      ok: "Déconnecter",
    });
    if (!confirmed) return;
    try {
      await api.hotspot.kick(session.id);
      toast("Session terminée", "success");
      await loadActive();
      refreshDashboard();
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

/* ============================================================
   Profils hotspot
   ============================================================ */

function renderHotspotProfiles() {
  const grid = $("#profiles-grid");
  if (state.screen !== "hotspot-profiles") return;
  if (!state.hotspotProfiles.length) {
    grid.innerHTML = "";
    $("#profiles-empty").hidden = false;
    return;
  }
  $("#profiles-empty").hidden = true;
  grid.innerHTML = state.hotspotProfiles
    .map(
      (profile) => `
      <article class="profile-card glass">
        <div class="profile-card-head">
          <span class="profile-ico"><svg><use href="#i-layers"/></svg></span>
          <div>
            <h4>${escapeHtml(profile.name)}</h4>
            <span>Profil hotspot</span>
          </div>
        </div>
        <dl class="profile-kv">
          <div><dt>Débit</dt><dd>${escapeHtml(profile.rateLimit || "Illimité")}</dd></div>
          <div><dt>Partage</dt><dd>${escapeHtml(profile.sharedUsers || "1")} util.</dd></div>
          <div><dt>Session max</dt><dd>${escapeHtml(profile.sessionTimeout || "Illimitée")}</dd></div>
          <div><dt>Inactivité</dt><dd>${escapeHtml(profile.idleTimeout || "—")}</dd></div>
          <div><dt>Connexion</dt><dd>${escapeHtml(profile.loginBy || "—")}</dd></div>
          <div><dt>Utilisateurs</dt><dd>${formatNumber(state.users.filter((user) => user.profile === profile.name).length)}</dd></div>
        </dl>
      </article>`
    )
    .join("");
}

async function loadHotspotProfiles(notify = false) {
  try {
    state.hotspotProfiles = await api.hotspot.profiles();
    renderHotspotProfiles();
    renderProfileFilters();
    renderUserProfileOptions();
    renderVoucherProfileOptions();
    if (notify) toast("Profils actualisés", "success", 2000);
  } catch (error) {
    toast(error.message, "error");
  }
}

function wireProfiles() {
  $("#profiles-refresh").addEventListener("click", () => loadHotspotProfiles(true));
}

/* ============================================================
   Vouchers
   ============================================================ */

function renderVoucherProfileOptions() {
  const select = $("#v-profile");
  if (!select) return;
  const previous = select.value;
  const names = state.hotspotProfiles.length ? state.hotspotProfiles.map((profile) => profile.name) : ["default"];
  select.innerHTML = names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  if (names.includes(previous)) select.value = previous;
}

function renderVouchers() {
  const sheet = $("#voucher-sheet");
  if (!state.vouchers.length) {
    sheet.innerHTML = `
      <div class="empty-state" id="voucher-empty">
        <svg><use href="#i-ticket"/></svg>
        <strong>Prêt à générer</strong>
        <span>Choisissez vos paramètres puis lancez la génération. Les tickets apparaîtront ici.</span>
      </div>`;
  } else {
    const showPass = $("#v-show-pass").checked;
    const showPrice = $("#v-show-price").checked && Boolean($("#v-price").value.trim());
    sheet.innerHTML = state.vouchers
      .map(
        (voucher, index) => `
        <div class="voucher-ticket" style="animation-delay:${Math.min(index * 22, 500)}ms">
          <div class="vt-head">
            <span class="vt-brand"><svg><use href="#i-wifi"/></svg> MikroDesk</span>
            <span class="vt-index">${voucher.index || index + 1}/${state.vouchers.length}</span>
          </div>
          <div>
            <div class="vt-code">${escapeHtml(voucher.name)}</div>
            <div class="vt-label">Identifiant</div>
          </div>
          ${
            showPass
              ? `<div class="vt-pass"><div class="vt-code">${escapeHtml(voucher.password || "—")}</div><div class="vt-label">Mot de passe</div></div>`
              : ""
          }
          <div class="vt-foot">
            <div class="vt-meta">
              <div><b>${escapeHtml(voucher.profile || "default")}</b></div>
              <div>${escapeHtml(limitLabel(voucher.limitUptime, voucher.limitBytesTotal))}</div>
            </div>
            ${showPrice ? `<div class="vt-price">${escapeHtml(voucher.price || "")}</div>` : ""}
          </div>
        </div>`
      )
      .join("");
  }
  const count = state.vouchers.length;
  $("#voucher-count-label").textContent = count
    ? `${count} voucher${count > 1 ? "s" : ""} généré${count > 1 ? "s" : ""}`
    : "Aucun voucher généré";
  $("#v-print").disabled = !count;
  $("#v-csv").disabled = !count;
  $("#v-copy").disabled = !count;
}

async function generateVouchers(event) {
  event.preventDefault();
  const options = {
    count: Number($("#v-count").value) || 1,
    profile: $("#v-profile").value,
    limitUptime: $("#v-uptime").value,
    limitBytesTotal: $("#v-bytes").value,
    prefix: $("#v-prefix").value.trim(),
    userLength: Number($("#v-user-length").value) || 5,
    passLength: Number($("#v-pass-length").value) || 4,
    comment: $("#v-comment").value.trim() || "Voucher MikroDesk",
    price: $("#v-price").value.trim(),
  };
  try {
    if (!validate) throw new Error("Module de validation indisponible.");
    options.profile = validate.resolveProfile(options.profile, state.hotspotProfiles, "profil hotspot");
    options.limitUptime = validate.normalizeDuration(options.limitUptime, "La limite de temps");
    options.limitBytesTotal = validate.normalizeBytes(options.limitBytesTotal, "La limite de données");
    options.comment = validate.validateComment(options.comment, "Le commentaire");
  } catch (error) {
    toast(error.message, "error", 6000);
    return;
  }
  const button = $("#v-generate");
  setBusy(button, true);
  try {
    const result = await api.hotspot.vouchers(options);
    state.vouchers = result.created || [];
    state.voucherMeta = options;
    renderVouchers();
    if (result.created.length) {
      toast(`${result.created.length} voucher(s) créé(s) sur le routeur`, "success");
    }
    if (result.errors && result.errors.length) {
      toast(`${result.errors.length} voucher(s) n'ont pas pu être créés`, "warn", 6000);
    }
    refreshDashboard();
    loadUsers().catch(() => {});
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

function voucherLines() {
  return state.vouchers.map(
    (voucher) =>
      `${voucher.name} | ${voucher.password || ""} | ${voucher.profile || "default"} | ${limitLabel(
        voucher.limitUptime,
        voucher.limitBytesTotal
      )}${voucher.price ? ` | ${voucher.price}` : ""}`
  );
}

async function copyVouchers() {
  if (!state.vouchers.length) return;
  const text = voucherLines().join("\n");
  try {
    await navigator.clipboard.writeText(text);
    toast("Vouchers copiés dans le presse-papiers", "success");
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      toast("Vouchers copiés", "success");
    } catch {
      toast("Copie impossible", "error");
    }
    area.remove();
  }
}

function exportVouchersCsv() {
  if (!state.vouchers.length) return;
  const header = ["identifiant", "mot_de_passe", "profil", "duree", "quota", "prix", "commentaire"];
  const escapeCsv = (value) => `"${String(value === undefined || value === null ? "" : value).replace(/"/g, '""')}"`;
  const rows = state.vouchers.map((voucher) =>
    [
      voucher.name,
      voucher.password,
      voucher.profile,
      voucher.limitUptime,
      voucher.limitBytesTotal,
      voucher.price,
      voucher.comment,
    ]
      .map(escapeCsv)
      .join(";")
  );
  const csv = "\uFEFF" + [header.join(";")].concat(rows).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vouchers-mikrodesk-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast("Fichier CSV exporté", "success");
}

function printVouchers() {
  if (!state.vouchers.length) return;
  const sheet = $("#print-sheet");
  const showPass = $("#v-show-pass").checked;
  const price = $("#v-price").value.trim();
  sheet.innerHTML = `
    <div class="print-grid">
      ${state.vouchers
        .map(
          (voucher) => `
          <div class="print-ticket">
            <div class="pt-brand">MikroDesk · Accès Wi-Fi</div>
            <div>
              <div class="pt-label">Identifiant</div>
              <div class="pt-code">${escapeHtml(voucher.name)}</div>
            </div>
            ${
              showPass
                ? `<div><div class="pt-label">Mot de passe</div><div class="pt-pass">${escapeHtml(voucher.password || "—")}</div></div>`
                : ""
            }
            <div class="pt-row">
              <span>${escapeHtml(voucher.profile || "default")} · ${escapeHtml(
                limitLabel(voucher.limitUptime, voucher.limitBytesTotal)
              )}</span>
              ${price ? `<strong>${escapeHtml(price)}</strong>` : ""}
            </div>
          </div>`
        )
        .join("")}
    </div>`;
  window.print();
}

function wireVouchers() {
  $("#voucher-form").addEventListener("submit", generateVouchers);
  $("#v-copy").addEventListener("click", copyVouchers);
  $("#v-csv").addEventListener("click", exportVouchersCsv);
  $("#v-print").addEventListener("click", printVouchers);
  $("#v-show-pass").addEventListener("change", renderVouchers);
  $("#v-show-price").addEventListener("change", renderVouchers);
  $("#v-price").addEventListener("input", renderVouchers);
}

/* ============================================================
   Hôtes hotspot
   ============================================================ */

function filteredHosts() {
  const query = state.hostsQuery.trim().toLowerCase();
  return state.hosts.filter((host) => {
    if (!query) return true;
    return [host.mac, host.address, host.comment, host.server]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function renderHosts() {
  const rows = filteredHosts();
  const authorized = state.hosts.filter((host) => host.authorized).length;
  const traffic = state.hosts.reduce((sum, host) => sum + (host.bytesIn || 0) + (host.bytesOut || 0), 0);

  $("#hosts-count").textContent = formatNumber(state.hosts.length);
  $("#hosts-authorized").textContent = formatNumber(authorized);
  $("#hosts-traffic").textContent = formatBytes(traffic);
  const navCount = $("#nav-count-hosts");
  if (navCount) navCount.textContent = formatNumber(state.hosts.length);

  const tbody = $("#hosts-tbody");
  if (!rows.length) {
    tbody.innerHTML = "";
    $("#hosts-empty").hidden = false;
    return;
  }
  $("#hosts-empty").hidden = true;
  tbody.innerHTML = rows
    .map(
      (host) => `
      <tr>
        <td><span class="mono">${escapeHtml(host.mac || "—")}</span></td>
        <td><span class="mono">${escapeHtml(host.address || "—")}</span></td>
        <td><span class="pill">${escapeHtml(host.server || "all")}</span></td>
        <td>${escapeHtml(host.uptime || "—")}</td>
        <td><span class="mono">${formatBytes(host.bytesIn)}</span></td>
        <td><span class="mono">${formatBytes(host.bytesOut)}</span></td>
        <td class="muted">${escapeHtml(host.comment || "—")}</td>
        <td><span class="pill ${host.authorized ? "ok" : "off"}">${host.authorized ? "Oui" : "Non"}</span></td>
        <td class="col-actions">
          <button class="row-btn danger" data-remove-host="${escapeHtml(host.id)}" title="Retirer cet hôte">
            <svg><use href="#i-trash"/></svg>
          </button>
        </td>
      </tr>`
    )
    .join("");
}

async function loadHosts(notify = false) {
  try {
    state.hosts = await api.hotspot.hosts();
    renderHosts();
    if (notify) toast("Hôtes actualisés", "success", 2000);
  } catch (error) {
    toast(error.message, "error");
  }
}

function wireHosts() {
  $("#hosts-search").addEventListener("input", (event) => {
    state.hostsQuery = event.target.value;
    renderHosts();
  });
  $("#hosts-refresh").addEventListener("click", () => loadHosts(true));
  $("#hosts-tbody").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-remove-host]");
    if (!button) return;
    const host = state.hosts.find((item) => item.id === button.dataset.removeHost);
    if (!host) return;
    const confirmed = await askConfirm({
      title: "Retirer cet hôte ?",
      text: `L'hôte ${host.mac || host.address} sera retiré de la liste hotspot. Il pourra réapparaître lors de sa prochaine connexion.`,
      ok: "Retirer",
    });
    if (!confirmed) return;
    try {
      await api.hotspot.removeHost(host.id);
      toast("Hôte retiré", "success");
      await loadHosts();
      refreshDashboard();
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

/* ============================================================
   Liaisons IP hotspot
   ============================================================ */

const BINDING_TYPES = {
  regular: "Normal",
  bypassed: "Contourné",
  blocked: "Bloqué",
};

function filteredBindings() {
  const query = state.bindingsQuery.trim().toLowerCase();
  return state.bindings.filter((binding) => {
    if (!query) return true;
    return [binding.mac, binding.address, binding.toAddress, binding.comment, binding.server, binding.type]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function renderBindings() {
  const rows = filteredBindings();
  const tbody = $("#bindings-tbody");
  if (!rows.length) {
    tbody.innerHTML = "";
    $("#bindings-empty").hidden = false;
    return;
  }
  $("#bindings-empty").hidden = true;
  tbody.innerHTML = rows
    .map((binding) => {
      const type = BINDING_TYPES[binding.type] || binding.type || "Normal";
      const tone = binding.type === "blocked" ? "off" : binding.type === "bypassed" ? "ok" : "";
      return `
        <tr>
          <td><span class="mono">${escapeHtml(binding.mac || "—")}</span></td>
          <td><span class="mono">${escapeHtml(binding.address || "—")}</span></td>
          <td><span class="mono">${escapeHtml(binding.toAddress || "—")}</span></td>
          <td><span class="pill">${escapeHtml(binding.server || "all")}</span></td>
          <td><span class="pill ${tone}">${escapeHtml(type)}</span></td>
          <td class="muted">${escapeHtml(binding.comment || "—")}</td>
          <td><span class="pill ${binding.disabled ? "off" : "ok"}">${binding.disabled ? "Désactivée" : "Active"}</span></td>
          <td class="col-actions">
            <div class="row-actions">
              <button class="row-btn accent" data-edit-binding="${escapeHtml(binding.id)}" title="Modifier">
                <svg><use href="#i-edit"/></svg>
              </button>
              <button class="row-btn" data-toggle-binding="${escapeHtml(binding.id)}" title="${binding.disabled ? "Activer" : "Désactiver"}">
                <svg><use href="#i-${binding.disabled ? "check" : "shield"}"/></svg>
              </button>
              <button class="row-btn danger" data-remove-binding="${escapeHtml(binding.id)}" title="Supprimer">
                <svg><use href="#i-trash"/></svg>
              </button>
            </div>
          </td>
        </tr>`;
    })
    .join("");
}

async function loadBindings(notify = false) {
  try {
    const [bindings, servers] = await Promise.all([
      api.hotspot.bindings(),
      api.hotspot.servers().catch(() => state.hotspotServers),
    ]);
    state.bindings = bindings;
    state.hotspotServers = servers || [];
    renderBindings();
    if (notify) toast("Liaisons IP actualisées", "success", 2000);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function openBindingModal(binding) {
  state.editingBinding = binding || null;
  try {
    const servers = await api.hotspot.servers();
    state.hotspotServers = servers || [];
  } catch {
    /* cache local */
  }
  $("#modal-binding-title").textContent = binding ? "Modifier la liaison IP" : "Nouvelle liaison IP";
  $("#b-mac").value = binding ? binding.mac || "" : "";
  $("#b-address").value = binding ? binding.address || "" : "";
  $("#b-to-address").value = binding ? binding.toAddress || "" : "";
  renderBindingServerOptions(binding ? binding.server || "all" : "all");
  $("#b-type").value = binding ? binding.type || "regular" : "regular";
  $("#b-comment").value = binding ? binding.comment || "" : "";
  $("#b-disabled").checked = Boolean(binding && binding.disabled);
  $("#binding-error").hidden = true;
  openModal("binding");
  window.setTimeout(() => $("#b-mac").focus(), 80);
}

async function saveBinding(event) {
  event.preventDefault();
  const mac = $("#b-mac").value.trim();
  const errorBox = $("#binding-error");
  errorBox.hidden = true;
  const payload = {
    isNew: !state.editingBinding,
    id: state.editingBinding ? state.editingBinding.id : undefined,
    mac,
    address: $("#b-address").value.trim(),
    toAddress: $("#b-to-address").value.trim(),
    server: $("#b-server").value || "all",
    type: $("#b-type").value,
    comment: $("#b-comment").value.trim(),
    disabled: $("#b-disabled").checked,
  };
  try {
    if (!validate) throw new Error("Module de validation indisponible.");
    payload.mac = validate.normalizeMac(payload.mac);
    payload.address = validate.validateIP(payload.address, "L'adresse IP", { optional: true, allowCidr: true });
    payload.toAddress = validate.validateIP(payload.toAddress, "L'adresse de redirection", { optional: true });
    payload.type = validate.assertChoice(payload.type, ["regular", "bypassed", "blocked"], "Le type de liaison");
    if (payload.server !== "all") {
      payload.server = validate.resolveChoice(
        payload.server,
        state.hotspotServers.map((item) => item.name),
        "Le serveur hotspot"
      );
    }
    payload.comment = validate.validateComment(payload.comment, "Le commentaire");
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    return;
  }
  const button = $("#binding-save");
  setBusy(button, true);
  try {
    await api.hotspot.saveBinding(payload);
    closeModal();
    toast(payload.isNew ? "Liaison IP créée" : "Liaison IP mise à jour", "success");
    await loadBindings();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    setBusy(button, false);
  }
}

function wireBindings() {
  $("#bindings-search").addEventListener("input", (event) => {
    state.bindingsQuery = event.target.value;
    renderBindings();
  });
  $("#bindings-add-btn").addEventListener("click", () => openBindingModal(null));
  $("#binding-form").addEventListener("submit", saveBinding);
  $("#bindings-tbody").addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-edit-binding]");
    const toggle = event.target.closest("[data-toggle-binding]");
    const remove = event.target.closest("[data-remove-binding]");
    if (edit) {
      const binding = state.bindings.find((item) => item.id === edit.dataset.editBinding);
      if (binding) openBindingModal(binding);
      return;
    }
    if (toggle) {
      const binding = state.bindings.find((item) => item.id === toggle.dataset.toggleBinding);
      if (!binding) return;
      try {
        await api.hotspot.toggleBinding(binding.id, !binding.disabled);
        toast(`Liaison ${binding.disabled ? "activée" : "désactivée"}`, "success", 2600);
        await loadBindings();
      } catch (error) {
        toast(error.message, "error");
      }
      return;
    }
    if (remove) {
      const binding = state.bindings.find((item) => item.id === remove.dataset.removeBinding);
      if (!binding) return;
      const confirmed = await askConfirm({
        title: "Supprimer cette liaison ?",
        text: `La règle pour ${binding.mac || binding.address} sera définitivement supprimée du routeur.`,
        ok: "Supprimer",
      });
      if (!confirmed) return;
      try {
        await api.hotspot.removeBinding(binding.id);
        toast("Liaison supprimée", "success");
        await loadBindings();
      } catch (error) {
        toast(error.message, "error");
      }
    }
  });
}

/* ============================================================
   Cookies hotspot
   ============================================================ */

function renderCookies() {
  const query = state.cookiesQuery.trim().toLowerCase();
  const rows = state.cookies.filter((cookie) => {
    if (!query) return true;
    return [cookie.user, cookie.mac, cookie.domain, cookie.comment]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
  const tbody = $("#cookies-tbody");
  if (!rows.length) {
    tbody.innerHTML = "";
    $("#cookies-empty").hidden = false;
    return;
  }
  $("#cookies-empty").hidden = true;
  tbody.innerHTML = rows
    .map(
      (cookie) => `
      <tr>
        <td>
          <div class="cell-main">
            <span class="cell-avatar">${escapeHtml(initials(cookie.user))}</span>
            <span>${escapeHtml(cookie.user || "—")}</span>
          </div>
        </td>
        <td><span class="mono">${escapeHtml(cookie.mac || "—")}</span></td>
        <td class="muted">${escapeHtml(cookie.domain || "—")}</td>
        <td>${escapeHtml(cookie.expires || "—")}</td>
        <td class="muted">${escapeHtml(cookie.comment || "—")}</td>
        <td class="col-actions">
          <button class="row-btn danger" data-remove-cookie="${escapeHtml(cookie.id)}" title="Supprimer le cookie">
            <svg><use href="#i-trash"/></svg>
          </button>
        </td>
      </tr>`
    )
    .join("");
}

async function loadCookies(notify = false) {
  try {
    state.cookies = await api.hotspot.cookies();
    renderCookies();
    if (notify) toast("Cookies actualisés", "success", 2000);
  } catch (error) {
    toast(error.message, "error");
  }
}

function wireCookies() {
  $("#cookies-search").addEventListener("input", (event) => {
    state.cookiesQuery = event.target.value;
    renderCookies();
  });
  $("#cookies-refresh").addEventListener("click", () => loadCookies(true));
  $("#cookies-tbody").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-remove-cookie]");
    if (!button) return;
    const cookie = state.cookies.find((item) => item.id === button.dataset.removeCookie);
    if (!cookie) return;
    const confirmed = await askConfirm({
      title: "Supprimer ce cookie ?",
      text: `L'utilisateur « ${cookie.user || cookie.mac} » devra se reconnecter au portail.`,
      ok: "Supprimer",
    });
    if (!confirmed) return;
    try {
      await api.hotspot.removeCookie(cookie.id);
      toast("Cookie supprimé", "success");
      await loadCookies();
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

/* ============================================================
   Impression rapide
   ============================================================ */

function quickPrintUsers() {
  const query = state.quickPrintQuery.trim().toLowerCase();
  return state.users
    .filter((user) => {
      if (state.quickPrintProfile && user.profile !== state.quickPrintProfile) return false;
      if (!query) return true;
      return [user.name, user.comment, user.profile, user.password]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "fr"));
}

function renderQuickPrint() {
  const profileSelect = $("#qp-filter-profile");
  const previousProfile = state.quickPrintProfile;
  const names = state.hotspotProfiles.length ? state.hotspotProfiles.map((profile) => profile.name) : ["default"];
  profileSelect.innerHTML =
    '<option value="">Tous les profils</option>' +
    names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  profileSelect.value = names.includes(previousProfile) ? previousProfile : "";
  state.quickPrintProfile = profileSelect.value;

  const rows = quickPrintUsers();
  const valid = new Set(state.users.map((user) => user.id));
  state.quickPrintSelection = new Set(Array.from(state.quickPrintSelection).filter((id) => valid.has(id)));

  const tbody = $("#qp-tbody");
  if (!rows.length) {
    tbody.innerHTML = "";
    $("#qp-empty").hidden = false;
  } else {
    $("#qp-empty").hidden = true;
    tbody.innerHTML = rows
      .map(
        (user) => `
        <tr class="${state.quickPrintSelection.has(user.id) ? "is-selected" : ""}">
          <td><input type="checkbox" data-qp-id="${escapeHtml(user.id)}" ${
            state.quickPrintSelection.has(user.id) ? "checked" : ""
          } aria-label="Sélectionner ${escapeHtml(user.name)}" /></td>
          <td>
            <div class="cell-main">
              <span class="cell-avatar">${escapeHtml(initials(user.name))}</span>
              <span>${escapeHtml(user.name)}</span>
            </div>
          </td>
          <td><span class="mono">${escapeHtml(user.password || "—")}</span></td>
          <td><span class="pill">${escapeHtml(user.profile || "default")}</span></td>
          <td title="${escapeHtml(limitLabel(user.limitUptime, user.limitBytesTotal))}">${escapeHtml(
            limitLabel(user.limitUptime, user.limitBytesTotal)
          )}</td>
          <td class="muted">${escapeHtml(user.comment || "—")}</td>
        </tr>`
      )
      .join("");
  }

  const count = state.quickPrintSelection.size;
  $("#qp-count").textContent = `${count} sélectionné${count > 1 ? "s" : ""}`;
  $("#qp-print").disabled = count === 0;
  $("#qp-check-all").checked = rows.length > 0 && rows.every((user) => state.quickPrintSelection.has(user.id));
}

async function loadQuickPrint(notify = false) {
  try {
    const [users, profiles] = await Promise.all([api.hotspot.users(), api.hotspot.profiles().catch(() => [])]);
    state.users = users;
    state.hotspotProfiles = profiles;
    renderQuickPrint();
    if (notify) toast("Utilisateurs actualisés", "success", 2000);
  } catch (error) {
    toast(error.message, "error");
  }
}

function printQuickPrint() {
  const selection = state.users.filter((user) => state.quickPrintSelection.has(user.id));
  if (!selection.length) {
    toast("Sélectionnez au moins un utilisateur.", "warn");
    return;
  }
  const sheet = $("#print-sheet");
  sheet.innerHTML = `
    <div class="print-grid">
      ${selection
        .map(
          (user) => `
          <div class="print-ticket">
            <div class="pt-brand">MikroDesk · Accès Wi-Fi</div>
            <div>
              <div class="pt-label">Identifiant</div>
              <div class="pt-code">${escapeHtml(user.name)}</div>
            </div>
            <div><div class="pt-label">Mot de passe</div><div class="pt-pass">${escapeHtml(user.password || "—")}</div></div>
            <div class="pt-row">
              <span>${escapeHtml(user.profile || "default")} · ${escapeHtml(
                limitLabel(user.limitUptime, user.limitBytesTotal)
              )}</span>
            </div>
          </div>`
        )
        .join("")}
    </div>`;
  window.print();
}

function wireQuickPrint() {
  $("#qp-search").addEventListener("input", (event) => {
    state.quickPrintQuery = event.target.value;
    renderQuickPrint();
  });
  $("#qp-filter-profile").addEventListener("change", (event) => {
    state.quickPrintProfile = event.target.value;
    renderQuickPrint();
  });
  $("#qp-select-all").addEventListener("click", () => {
    const rows = quickPrintUsers();
    const allSelected = rows.length > 0 && rows.every((user) => state.quickPrintSelection.has(user.id));
    rows.forEach((user) => {
      if (allSelected) state.quickPrintSelection.delete(user.id);
      else state.quickPrintSelection.add(user.id);
    });
    renderQuickPrint();
  });
  $("#qp-check-all").addEventListener("change", (event) => {
    const rows = quickPrintUsers();
    rows.forEach((user) => {
      if (event.target.checked) state.quickPrintSelection.add(user.id);
      else state.quickPrintSelection.delete(user.id);
    });
    renderQuickPrint();
  });
  $("#qp-tbody").addEventListener("change", (event) => {
    const input = event.target.closest("[data-qp-id]");
    if (!input) return;
    if (input.checked) state.quickPrintSelection.add(input.dataset.qpId);
    else state.quickPrintSelection.delete(input.dataset.qpId);
    renderQuickPrint();
  });
  $("#qp-print").addEventListener("click", printQuickPrint);
}

/* ============================================================
   Baux DHCP
   ============================================================ */

function renderDhcp() {
  const query = state.dhcpQuery.trim().toLowerCase();
  const rows = state.dhcpLeases.filter((lease) => {
    if (state.dhcpFilter === "dynamic" && !lease.dynamic) return false;
    if (state.dhcpFilter === "static" && lease.dynamic) return false;
    if ((state.dhcpFilter === "bound" || state.dhcpFilter === "waiting") && lease.status !== state.dhcpFilter) return false;
    if (!query) return true;
    return [lease.address, lease.mac, lease.hostName, lease.comment, lease.server]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  $("#dhcp-count").textContent = formatNumber(state.dhcpLeases.length);
  $("#dhcp-dynamic").textContent = formatNumber(state.dhcpLeases.filter((lease) => lease.dynamic).length);
  $("#dhcp-static").textContent = formatNumber(state.dhcpLeases.filter((lease) => !lease.dynamic).length);

  const tbody = $("#dhcp-tbody");
  if (!rows.length) {
    tbody.innerHTML = "";
    $("#dhcp-empty").hidden = false;
    return;
  }
  $("#dhcp-empty").hidden = true;
  tbody.innerHTML = rows
    .map((lease) => {
      const status = String(lease.status || "").toLowerCase();
      const tone = status === "bound" ? "ok" : status === "waiting" ? "warn" : "";
      const statusLabel = status === "bound" ? "Actif" : status === "waiting" ? "En attente" : lease.status || "—";
      return `
        <tr>
          <td><span class="mono">${escapeHtml(lease.address || "—")}</span></td>
          <td><span class="mono">${escapeHtml(lease.mac || "—")}</span></td>
          <td class="muted">${escapeHtml(lease.hostName || "—")}</td>
          <td><span class="pill">${escapeHtml(lease.server || "—")}</span></td>
          <td><span class="pill ${tone}">${escapeHtml(statusLabel)}</span></td>
          <td>${escapeHtml(lease.expiresAfter || "—")}</td>
          <td><span class="pill">${lease.dynamic ? "Dynamique" : "Statique"}</span></td>
          <td class="col-actions">
            <button class="row-btn danger" data-remove-lease="${escapeHtml(lease.id)}" title="Supprimer le bail">
              <svg><use href="#i-trash"/></svg>
            </button>
          </td>
        </tr>`;
    })
    .join("");
}

async function loadDhcp(notify = false) {
  try {
    state.dhcpLeases = await api.dhcp.leases();
    renderDhcp();
    if (notify) toast("Baux DHCP actualisés", "success", 2000);
  } catch (error) {
    toast(error.message, "error");
  }
}

function wireDhcp() {
  $("#dhcp-search").addEventListener("input", (event) => {
    state.dhcpQuery = event.target.value;
    renderDhcp();
  });
  $("#dhcp-filter").addEventListener("change", (event) => {
    state.dhcpFilter = event.target.value;
    renderDhcp();
  });
  $("#dhcp-refresh").addEventListener("click", () => loadDhcp(true));
  $("#dhcp-tbody").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-remove-lease]");
    if (!button) return;
    const lease = state.dhcpLeases.find((item) => item.id === button.dataset.removeLease);
    if (!lease) return;
    const confirmed = await askConfirm({
      title: "Supprimer ce bail DHCP ?",
      text: `L'adresse ${lease.address} sera libérée et pourra être réattribuée immédiatement.`,
      ok: "Supprimer",
    });
    if (!confirmed) return;
    try {
      await api.dhcp.removeLease(lease.id);
      toast("Bail supprimé", "success");
      await loadDhcp();
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

/* ============================================================
   Moniteur de trafic
   ============================================================ */

function renderMonitor() {
  if (!state.dashboard) return;
  const interfaces = state.dashboard.interfaces || [];
  const select = $("#monitor-iface");
  const previous = state.monitorIface;
  select.innerHTML =
    '<option value="all">Toutes les interfaces</option>' +
    interfaces.map((iface) => `<option value="${escapeHtml(iface.name || iface.id)}">${escapeHtml(iface.name || iface.id)}</option>`).join("");
  state.monitorIface = previous === "all" || interfaces.some((iface) => (iface.name || iface.id) === previous) ? previous : "all";
  select.value = state.monitorIface;

  let rx = 0;
  let tx = 0;
  let total = 0;
  if (state.monitorIface === "all") {
    rx = state.dashboard.totalRx || 0;
    tx = state.dashboard.totalTx || 0;
    total = interfaces.reduce((sum, iface) => sum + (iface.rxByte || 0) + (iface.txByte || 0), 0);
    $("#monitor-title").textContent = "Toutes les interfaces";
  } else {
    const iface = interfaces.find((item) => (item.name || item.id) === state.monitorIface);
    if (iface) {
      rx = iface.rxRate || 0;
      tx = iface.txRate || 0;
      total = (iface.rxByte || 0) + (iface.txByte || 0);
    }
    $("#monitor-title").textContent = state.monitorIface;
  }

  $("#mon-rx").textContent = formatRate(rx);
  $("#mon-tx").textContent = formatRate(tx);
  $("#mon-total").textContent = formatBytes(total);

  $("#monitor-grid").innerHTML = interfaces
    .map((iface) => {
      const key = iface.name || iface.id;
      const active = iface.running && !iface.disabled;
      return `
        <button type="button" class="iface-mini ${key === state.monitorIface ? "is-active" : ""}" data-monitor-iface="${escapeHtml(key)}">
          <div class="iface-mini-head">
            <i class="iface-dot ${active ? "" : "is-off"}"></i>
            <strong title="${escapeHtml(key)}">${escapeHtml(key)}</strong>
            <span class="iface-type">${escapeHtml(iface.type || "ether")}</span>
          </div>
          <div class="iface-mini-rates">
            <span class="iface-rate down"><svg><use href="#i-arrow-down"/></svg>${formatRate(iface.rxRate)}</span>
            <span class="iface-rate up"><svg><use href="#i-arrow-up"/></svg>${formatRate(iface.txRate)}</span>
          </div>
        </button>`;
    })
    .join("");

  renderMonitorChart();
}

async function loadMonitor(notify = false) {
  if (!state.dashboard) await refreshDashboard(false, false);
  renderMonitor();
  if (notify) toast("Moniteur actualisé", "success", 2000);
}

function wireMonitor() {
  $("#monitor-iface").addEventListener("change", (event) => {
    state.monitorIface = event.target.value;
    renderMonitor();
  });
  $("#monitor-toggle").addEventListener("click", () => refreshDashboard(false, true));
  $("#monitor-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-monitor-iface]");
    if (!button) return;
    state.monitorIface = button.dataset.monitorIface;
    renderMonitor();
  });
}

/* ============================================================
   Rapport d'activité
   ============================================================ */

function reportTotals() {
  const dashboard = state.dashboard || {};
  const interfaces = dashboard.interfaces || [];
  return {
    dashboard,
    interfaces,
    traffic: interfaces.reduce((sum, iface) => sum + (iface.rxByte || 0) + (iface.txByte || 0), 0),
    rx: interfaces.reduce((sum, iface) => sum + (iface.rxByte || 0), 0),
    tx: interfaces.reduce((sum, iface) => sum + (iface.txByte || 0), 0),
  };
}

function renderReport() {
  if (!state.dashboard) return;
  const { dashboard, interfaces, traffic } = reportTotals();
  const users = state.users || [];
  const secrets = state.pppSecrets || [];

  $("#report-identity").textContent = dashboard.identity || "MikroTik";
  $("#report-generated").textContent = `Rapport généré le ${new Date().toLocaleString("fr-FR")}`;
  $("#report-version").textContent = `RouterOS ${dashboard.version || "—"}`;
  $("#report-uptime").innerHTML = `<svg><use href="#i-clock"/></svg> ${escapeHtml(dashboard.uptime || "—")}`;
  $("#report-host").innerHTML = `<svg><use href="#i-router"/></svg> ${escapeHtml(
    state.demo ? "Routeur simulé" : (state.status && state.status.host) || dashboard.board || "—"
  )}`;

  $("#report-users").textContent = formatNumber(users.length || dashboard.hotspotUsers || 0);
  $("#report-active").textContent = formatNumber(dashboard.hotspotActive || 0);
  $("#report-secrets").textContent = formatNumber(secrets.length || dashboard.pppSecrets || 0);
  $("#report-traffic").textContent = formatBytes(traffic);

  const top = users
    .slice()
    .sort((a, b) => (b.bytesIn || 0) + (b.bytesOut || 0) - ((a.bytesIn || 0) + (a.bytesOut || 0)))
    .slice(0, 8);
  $("#report-users-tbody").innerHTML = top.length
    ? top
        .map(
          (user) => `
          <tr>
            <td>${escapeHtml(user.name)}</td>
            <td><span class="pill">${escapeHtml(user.profile || "default")}</span></td>
            <td><span class="mono">${formatBytes(user.bytesIn)}</span></td>
            <td><span class="mono">${formatBytes(user.bytesOut)}</span></td>
            <td><span class="mono">${formatBytes((user.bytesIn || 0) + (user.bytesOut || 0))}</span></td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="muted">Aucun utilisateur hotspot.</td></tr>`;

  $("#report-iface-tbody").innerHTML = interfaces.length
    ? interfaces
        .map((iface) => {
          const active = iface.running && !iface.disabled;
          return `
            <tr>
              <td>${escapeHtml(iface.name || iface.id)}</td>
              <td><span class="pill ${active ? "ok" : "off"}">${active ? "Actif" : "Inactif"}</span></td>
              <td><span class="mono">${formatBytes(iface.rxByte)}</span></td>
              <td><span class="mono">${formatBytes(iface.txByte)}</span></td>
            </tr>`;
        })
        .join("")
    : `<tr><td colspan="4" class="muted">Aucune interface.</td></tr>`;
}

async function loadReport(notify = false) {
  try {
    const [dashboard, users, secrets] = await Promise.all([
      api.router.dashboard(),
      api.hotspot.users().catch(() => state.users),
      api.ppp.secrets().catch(() => state.pppSecrets),
    ]);
    state.dashboard = dashboard;
    state.users = users;
    state.pppSecrets = secrets;
    renderReport();
    if (notify) toast("Rapport actualisé", "success", 2000);
  } catch (error) {
    toast(error.message, "error");
  }
}

function printReport() {
  if (!state.dashboard) {
    toast("Aucune donnée à imprimer.", "warn");
    return;
  }
  const { dashboard, interfaces, traffic } = reportTotals();
  const users = state.users || [];
  const generated = new Date().toLocaleString("fr-FR");
  const top = users
    .slice()
    .sort((a, b) => (b.bytesIn || 0) + (b.bytesOut || 0) - ((a.bytesIn || 0) + (a.bytesOut || 0)))
    .slice(0, 12);

  $("#print-sheet").innerHTML = `
    <div class="print-report">
      <header class="pr-head">
        <div>
          <h1>Rapport d'activité</h1>
          <p>${escapeHtml(dashboard.identity || "MikroTik")} · ${
            state.demo ? "Routeur simulé" : escapeHtml((state.status && state.status.host) || dashboard.board || "")
          }</p>
        </div>
        <span>Généré le ${escapeHtml(generated)}</span>
      </header>
      <div class="pr-meta">
        <span>RouterOS ${escapeHtml(dashboard.version || "—")}</span>
        <span>Uptime ${escapeHtml(dashboard.uptime || "—")}</span>
        <span>Modèle ${escapeHtml(dashboard.board || "—")}</span>
      </div>
      <div class="pr-stats">
        <div><span>Utilisateurs hotspot</span><strong>${formatNumber(users.length || dashboard.hotspotUsers || 0)}</strong></div>
        <div><span>Sessions actives</span><strong>${formatNumber(dashboard.hotspotActive || 0)}</strong></div>
        <div><span>Secrets PPP</span><strong>${formatNumber((state.pppSecrets || []).length || dashboard.pppSecrets || 0)}</strong></div>
        <div><span>Trafic cumulé</span><strong>${formatBytes(traffic)}</strong></div>
      </div>
      <h2>Top consommateurs hotspot</h2>
      <table class="pr-table">
        <thead><tr><th>Utilisateur</th><th>Profil</th><th>Reçu</th><th>Émis</th><th>Total</th></tr></thead>
        <tbody>
          ${
            top.length
              ? top
                  .map(
                    (user) =>
                      `<tr><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.profile || "default")}</td><td>${formatBytes(
                        user.bytesIn
                      )}</td><td>${formatBytes(user.bytesOut)}</td><td>${formatBytes(
                        (user.bytesIn || 0) + (user.bytesOut || 0)
                      )}</td></tr>`
                  )
                  .join("")
              : `<tr><td colspan="5">Aucun utilisateur hotspot.</td></tr>`
          }
        </tbody>
      </table>
      <h2>Interfaces</h2>
      <table class="pr-table">
        <thead><tr><th>Interface</th><th>État</th><th>Reçu</th><th>Émis</th></tr></thead>
        <tbody>
          ${interfaces
            .map((iface) => {
              const active = iface.running && !iface.disabled;
              return `<tr><td>${escapeHtml(iface.name || iface.id)}</td><td>${active ? "Actif" : "Inactif"}</td><td>${formatBytes(
                iface.rxByte
              )}</td><td>${formatBytes(iface.txByte)}</td></tr>`;
            })
            .join("")}
        </tbody>
      </table>
      <footer class="pr-foot">MikroDesk · console de gestion MikroTik</footer>
    </div>`;
  window.print();
}

function wireReport() {
  $("#report-refresh").addEventListener("click", () => loadReport(true));
  $("#report-print").addEventListener("click", printReport);
}

/* ============================================================
   Génération d'utilisateurs
   ============================================================ */

function renderGenerateProfileOptions() {
  const select = $("#g-profile");
  const names = state.hotspotProfiles.length ? state.hotspotProfiles.map((profile) => profile.name) : ["default"];
  const previous = select.value;
  select.innerHTML = names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  if (names.includes(previous)) select.value = previous;
}

async function openGenerateModal() {
  if (!state.hotspotProfiles.length) {
    state.hotspotProfiles = await api.hotspot.profiles().catch(() => []);
  }
  renderGenerateProfileOptions();
  $("#generate-error").hidden = true;
  $("#g-password").disabled = $("#g-password-mode").value !== "same";
  openModal("generate");
  window.setTimeout(() => $("#g-prefix").focus(), 80);
}

async function saveGenerate(event) {
  event.preventDefault();
  const errorBox = $("#generate-error");
  errorBox.hidden = true;
  const count = Number($("#g-count").value) || 0;
  if (count < 1 || count > 200) {
    errorBox.textContent = "Le nombre d'utilisateurs doit être compris entre 1 et 200.";
    errorBox.hidden = false;
    return;
  }
  const options = {
    count,
    prefix: $("#g-prefix").value.trim(),
    start: Number($("#g-start").value) || 1,
    padding: Number($("#g-padding").value) || 2,
    passwordMode: $("#g-password-mode").value,
    password: $("#g-password").value,
    profile: $("#g-profile").value || "default",
    limitUptime: $("#g-uptime").value.trim() || "0",
    limitBytesTotal: $("#g-bytes").value.trim() || "0",
    comment: $("#g-comment").value.trim() || "Génération MikroDesk",
  };
  if (options.passwordMode === "same" && !options.password) {
    errorBox.textContent = "Saisissez le mot de passe commun ou choisissez un autre mode.";
    errorBox.hidden = false;
    return;
  }
  try {
    if (!validate) throw new Error("Module de validation indisponible.");
    options.profile = validate.resolveProfile(options.profile, state.hotspotProfiles, "profil hotspot");
    options.limitUptime = validate.normalizeDuration(options.limitUptime, "La limite de temps");
    options.limitBytesTotal = validate.normalizeBytes(options.limitBytesTotal, "La limite de données");
    options.comment = validate.validateComment(options.comment, "Le commentaire");
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    return;
  }
  const button = $("#generate-save");
  setBusy(button, true);
  try {
    const result = await api.hotspot.generateUsers(options);
    closeModal();
    toast(`${result.count} utilisateur(s) généré(s) sur le routeur`, "success");
    if (result.errors && result.errors.length) {
      toast(`${result.errors.length} utilisateur(s) ignoré(s) (nom déjà utilisé)`, "warn", 6000);
    }
    await loadUsers();
    refreshDashboard();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    setBusy(button, false);
  }
}

function wireGenerate() {
  $("#users-generate-btn").addEventListener("click", openGenerateModal);
  $("#generate-form").addEventListener("submit", saveGenerate);
  $("#g-password-mode").addEventListener("change", (event) => {
    $("#g-password").disabled = event.target.value !== "same";
  });
}

/* ============================================================
   PPP
   ============================================================ */

function renderPppSecrets() {
  const query = state.pppQuery.trim().toLowerCase();
  const rows = state.pppSecrets.filter((secret) => {
    if (!query) return true;
    return [secret.name, secret.comment, secret.service, secret.remoteAddress]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
  const tbody = $("#ppp-tbody");
  if (!rows.length) {
    tbody.innerHTML = `
      <tr><td colspan="8">
        <div class="empty-state" style="padding:34px 10px">
          <svg><use href="#i-key"/></svg>
          <strong>Aucun secret PPP</strong>
          <span>${state.pppSecrets.length ? "Aucun résultat pour cette recherche." : "Créez un secret pour vos liaisons PPP."}</span>
        </div>
      </td></tr>`;
  } else {
    tbody.innerHTML = rows
      .map(
        (secret) => `
        <tr>
          <td>
            <div class="cell-main">
              <span class="cell-avatar">${escapeHtml(initials(secret.name))}</span>
              <span>${escapeHtml(secret.name)}</span>
            </div>
          </td>
          <td><span class="mono">${escapeHtml(secret.password || "—")}</span></td>
          <td><span class="pill">${escapeHtml((secret.service || "any").toUpperCase())}</span></td>
          <td class="muted">${escapeHtml(secret.profile || "default")}</td>
          <td class="mono">${escapeHtml(secret.remoteAddress || "—")}</td>
          <td class="muted">${escapeHtml(secret.comment || "—")}</td>
          <td><span class="pill ${secret.disabled ? "off" : "ok"}">${secret.disabled ? "Désactivé" : "Actif"}</span></td>
          <td class="col-actions">
            <div class="row-actions">
              <button class="row-btn accent" data-action="edit-ppp" data-id="${escapeHtml(secret.id)}" title="Modifier">
                <svg><use href="#i-edit"/></svg>
              </button>
              <button class="row-btn" data-action="toggle-ppp" data-id="${escapeHtml(secret.id)}" title="${secret.disabled ? "Activer" : "Désactiver"}">
                <svg><use href="#i-${secret.disabled ? "check" : "shield"}"/></svg>
              </button>
              <button class="row-btn danger" data-action="delete-ppp" data-id="${escapeHtml(secret.id)}" title="Supprimer">
                <svg><use href="#i-trash"/></svg>
              </button>
            </div>
          </td>
        </tr>`
      )
      .join("");
  }
  $("#ppp-summary").textContent = `${rows.length} secret${rows.length > 1 ? "s" : ""}${
    rows.length !== state.pppSecrets.length ? ` sur ${state.pppSecrets.length}` : ""
  }`;
}

async function loadPppSecrets(notify = false) {
  try {
    const [secrets, profiles] = await Promise.all([
      api.ppp.secrets(),
      api.ppp.profiles().catch(() => state.pppProfiles),
    ]);
    state.pppSecrets = secrets;
    state.pppProfiles = profiles || [];
    renderPppSecrets();
    if (notify) toast("Secrets actualisés", "success", 2000);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function openPppModal(secret) {
  state.editingSecret = secret || null;
  try {
    const profiles = await api.ppp.profiles();
    state.pppProfiles = profiles || [];
  } catch {
    /* cache local */
  }
  $("#modal-ppp-title").textContent = secret ? "Modifier le secret PPP" : "Nouveau secret PPP";
  $("#p-name").value = secret ? secret.name : "";
  $("#p-password").value = secret ? secret.password : "";
  $("#p-service").value = secret ? secret.service || "any" : "any";
  renderPppProfileOptions(secret ? secret.profile || "default" : undefined);
  $("#p-local").value = secret ? secret.localAddress || "" : "";
  $("#p-remote").value = secret ? secret.remoteAddress || "" : "";
  $("#p-comment").value = secret ? secret.comment || "" : "";
  $("#p-disabled").checked = Boolean(secret && secret.disabled);
  $("#ppp-error").hidden = true;
  if (!state.pppProfiles.length) {
    $("#ppp-error").textContent =
      "Aucun profil PPP n'a pu être lu sur le routeur. Vérifiez les droits « read » de l'utilisateur API.";
    $("#ppp-error").hidden = false;
  }
  openModal("ppp");
  window.setTimeout(() => $("#p-name").focus(), 80);
}

async function savePppSecret(event) {
  event.preventDefault();
  const payload = {
    isNew: !state.editingSecret,
    id: state.editingSecret ? state.editingSecret.id : undefined,
    name: $("#p-name").value.trim(),
    password: $("#p-password").value,
    service: $("#p-service").value,
    profile: $("#p-profile").value || "default",
    localAddress: $("#p-local").value.trim(),
    remoteAddress: $("#p-remote").value.trim(),
    comment: $("#p-comment").value.trim(),
    disabled: $("#p-disabled").checked,
  };
  const errorBox = $("#ppp-error");
  errorBox.hidden = true;
  try {
    if (!validate) throw new Error("Module de validation indisponible.");
    payload.name = validate.validateName(payload.name, "Le nom du secret", { max: 64 });
    payload.service = validate.assertChoice(
      payload.service,
      ["any", "pppoe", "l2tp", "pptp", "sstp", "ovpn"],
      "Le service PPP"
    );
    payload.profile = validate.resolveProfile(payload.profile, state.pppProfiles, "profil PPP");
    if (payload.localAddress) payload.localAddress = validate.validateIP(payload.localAddress, "L'adresse locale");
    if (payload.remoteAddress) {
      if (payload.remoteAddress.includes(".") || payload.remoteAddress.includes(":")) {
        payload.remoteAddress = validate.validateIP(payload.remoteAddress, "L'adresse distante");
      }
    }
    payload.comment = validate.validateComment(payload.comment, "Le commentaire");
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    return;
  }
  const button = $("#ppp-save");
  setBusy(button, true);
  try {
    await api.ppp.saveSecret(payload);
    closeModal();
    toast(payload.isNew ? "Secret PPP créé" : "Secret PPP mis à jour", "success");
    await loadPppSecrets();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    setBusy(button, false);
  }
}

function wirePpp() {
  $("#ppp-search").addEventListener("input", (event) => {
    state.pppQuery = event.target.value;
    renderPppSecrets();
  });
  $("#ppp-add-btn").addEventListener("click", () => openPppModal(null));
  $("#ppp-form").addEventListener("submit", savePppSecret);

  $("#ppp-tbody").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const secret = state.pppSecrets.find((item) => item.id === button.dataset.id);
    if (!secret) return;
    if (button.dataset.action === "edit-ppp") {
      openPppModal(secret);
    } else if (button.dataset.action === "toggle-ppp") {
      try {
        await api.ppp.toggleSecret(secret.id, !secret.disabled);
        toast(`Secret ${secret.disabled ? "activé" : "désactivé"}`, "success", 2600);
        await loadPppSecrets();
      } catch (error) {
        toast(error.message, "error");
      }
    } else if (button.dataset.action === "delete-ppp") {
      const confirmed = await askConfirm({
        title: "Supprimer ce secret ?",
        text: `Le secret « ${secret.name} » sera définitivement supprimé du routeur.`,
        ok: "Supprimer",
      });
      if (!confirmed) return;
      try {
        await api.ppp.removeSecret(secret.id);
        toast("Secret supprimé", "success");
        await loadPppSecrets();
      } catch (error) {
        toast(error.message, "error");
      }
    }
  });
}

function renderPppActive() {
  const tbody = $("#ppp-active-tbody");
  if (!state.pppActive.length) {
    tbody.innerHTML = "";
    $("#ppp-active-empty").hidden = false;
    return;
  }
  $("#ppp-active-empty").hidden = true;
  tbody.innerHTML = state.pppActive
    .map(
      (session) => `
      <tr>
        <td>
          <div class="cell-main">
            <span class="cell-avatar">${escapeHtml(initials(session.name))}</span>
            <span>${escapeHtml(session.name)}</span>
          </div>
        </td>
        <td><span class="mono">${escapeHtml(session.address || "—")}</span></td>
        <td><span class="pill">${escapeHtml((session.service || "any").toUpperCase())}</span></td>
        <td><span class="mono">${escapeHtml(session.callerId || "—")}</span></td>
        <td>${escapeHtml(session.uptime || "—")}</td>
        <td><span class="mono">${formatBytes(session.bytesIn)}</span></td>
        <td><span class="mono">${formatBytes(session.bytesOut)}</span></td>
        <td class="col-actions">
          <button class="row-btn danger" data-kick="${escapeHtml(session.id)}" title="Déconnecter">
            <svg><use href="#i-kick"/></svg>
          </button>
        </td>
      </tr>`
    )
    .join("");
}

async function loadPppActive(notify = false) {
  try {
    state.pppActive = await api.ppp.active();
    renderPppActive();
    if (notify) toast("Sessions PPP actualisées", "success", 2000);
  } catch (error) {
    toast(error.message, "error");
  }
}

function wirePppActive() {
  $("#ppp-active-refresh").addEventListener("click", () => loadPppActive(true));
  $("#ppp-active-tbody").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-kick]");
    if (!button) return;
    const session = state.pppActive.find((item) => item.id === button.dataset.kick);
    if (!session) return;
    const confirmed = await askConfirm({
      title: "Déconnecter cette session PPP ?",
      text: `La liaison « ${session.name} » sera interrompue immédiatement.`,
      ok: "Déconnecter",
    });
    if (!confirmed) return;
    try {
      await api.ppp.kick(session.id);
      toast("Session PPP terminée", "success");
      await loadPppActive();
      refreshDashboard();
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

/* ============================================================
   Interfaces
   ============================================================ */

function renderInterfaces() {
  const grid = $("#iface-grid");
  const query = state.ifaceQuery.trim().toLowerCase();
  const list = state.interfaces.filter(
    (iface) => !query || [iface.name, iface.comment, iface.type].filter(Boolean).some((value) => String(value).toLowerCase().includes(query))
  );
  if (!list.length) {
    grid.innerHTML = "";
    $("#iface-empty").hidden = false;
    return;
  }
  $("#iface-empty").hidden = true;
  grid.innerHTML = list
    .map((iface) => {
      const active = iface.running && !iface.disabled;
      return `
        <article class="iface-card glass ${active ? "" : "is-off"}">
          <div class="iface-card-head">
            <span class="iface-card-ico"><svg><use href="#i-plug"/></svg></span>
            <div class="iface-card-title">
              <h4>${escapeHtml(iface.name)}</h4>
              <span>${escapeHtml(iface.comment || iface.type || "Interface")} · MTU ${escapeHtml(iface.mtu || "—")}</span>
            </div>
            <span class="pill ${active ? "ok" : "off"}">${active ? "Actif" : iface.disabled ? "Désactivé" : "Inactif"}</span>
          </div>
          <div class="iface-card-rates">
            <div class="iface-card-rate down">
              <span><svg><use href="#i-arrow-down"/></svg> Reçu</span>
              <strong>${formatRate(iface.rxRate)}</strong>
            </div>
            <div class="iface-card-rate up">
              <span><svg><use href="#i-arrow-up"/></svg> Émis</span>
              <strong>${formatRate(iface.txRate)}</strong>
            </div>
          </div>
          <div class="iface-card-foot">
            <span class="iface-meta">${escapeHtml(iface.mac || iface.type || "—")}</span>
            <span class="switch" title="${iface.disabled ? "Activer" : "Désactiver"} l'interface">
              <input type="checkbox" data-toggle-iface="${escapeHtml(iface.id)}" ${iface.disabled ? "checked" : ""} />
              <span class="switch-track"></span>
            </span>
          </div>
        </article>`;
    })
    .join("");
}

async function loadInterfaces(notify = false) {
  try {
    state.interfaces = await api.interfaces.list();
    renderInterfaces();
    if (notify) toast("Interfaces actualisées", "success", 2000);
  } catch (error) {
    toast(error.message, "error");
  }
}

function wireInterfaces() {
  $("#iface-search").addEventListener("input", (event) => {
    state.ifaceQuery = event.target.value;
    renderInterfaces();
  });
  $("#iface-refresh").addEventListener("click", () => loadInterfaces(true));
  $("#iface-grid").addEventListener("change", async (event) => {
    const input = event.target.closest("[data-toggle-iface]");
    if (!input) return;
    const iface = state.interfaces.find((item) => item.id === input.dataset.toggleIface);
    if (!iface) return;
    const disable = input.checked;
    const confirmed = await askConfirm({
      title: `${disable ? "Désactiver" : "Activer"} « ${iface.name} » ?`,
      text: disable
        ? "Le trafic de cette interface sera interrompu jusqu'à sa réactivation."
        : "L'interface sera remise en service sur le routeur.",
      ok: disable ? "Désactiver" : "Activer",
    });
    if (!confirmed) {
      input.checked = iface.disabled;
      return;
    }
    try {
      await api.interfaces.toggle(iface.id, disable);
      toast(`Interface ${iface.name} ${disable ? "désactivée" : "activée"}`, "success");
      await loadInterfaces();
      refreshDashboard();
    } catch (error) {
      input.checked = iface.disabled;
      toast(error.message, "error");
    }
  });
}

/* ============================================================
   Pare-feu & réseau
   ============================================================ */

const FW_TABS = {
  filter: {
    title: "Règles de filtrage",
    subtitle: "Chaînes input, forward et output du pare-feu",
    badge: "filter",
  },
  nat: { title: "Règles NAT", subtitle: "Masquage et redirections de ports", badge: "nat" },
  mangle: { title: "Règles Mangle", subtitle: "Marquage et modification de paquets", badge: "mangle" },
  raw: { title: "Règles Raw", subtitle: "Filtrage appliqué avant le suivi de connexion", badge: "raw" },
  queues: { title: "Files d'attente simples", subtitle: "Limitation de débit par cible", badge: "queue" },
  vlans: { title: "Interfaces VLAN", subtitle: "Segmentation réseau 802.1Q", badge: "vlan" },
  routes: { title: "Table de routage", subtitle: "Routes statiques, connectées et dynamiques", badge: "route" },
};

const FW_RULE_COLUMNS = [
  { label: "#", className: "col-num" },
  { label: "Statut", className: "col-status" },
  { label: "Chaîne", className: "" },
  { label: "Action", className: "" },
  { label: "Proto", className: "" },
  { label: "Source", className: "" },
  { label: "Destination", className: "" },
  { label: "Ports", className: "" },
  { label: "Interface", className: "" },
  { label: "Paquets", className: "col-traffic" },
  { label: "Trafic", className: "col-traffic" },
  { label: "Commentaire", className: "" },
];

const FW_NETWORK_COLUMNS = {
  queues: ["Nom", "Statut", "Cible", "Débit", "Max", "Burst", "Priorité", "Paquets", "Trafic", "Commentaire"],
  vlans: ["Nom", "VLAN ID", "Interface", "MTU", "État", "Commentaire"],
  routes: ["Destination", "Passerelle", "Distance", "Source préférée", "Type", "État", "Commentaire"],
};

function fwActionClass(action) {
  const value = String(action || "").toLowerCase();
  if (["accept", "masquerade", "src-nat", "return"].includes(value)) return "ok";
  if (["drop", "reject"].includes(value)) return "danger";
  if (["log", "passthrough", "sniff", "tarpit"].includes(value)) return "warn";
  return "warn";
}

function fwChainCell(rule) {
  const chain = escapeHtml(rule.chain || "—");
  const stateLabel = rule.connectionState ? `<span class="fw-sub">${escapeHtml(rule.connectionState)}</span>` : "";
  return `<span class="fw-chain">${chain}</span>${stateLabel}`;
}

function fwInterfaceCell(rule) {
  const parts = [];
  if (rule.inInterface) parts.push(`<span class="fw-sub">in</span> ${escapeHtml(rule.inInterface)}`);
  if (rule.outInterface) parts.push(`<span class="fw-sub">out</span> ${escapeHtml(rule.outInterface)}`);
  return parts.length ? `<span class="mono fw-iface">${parts.join("<br />")}</span>` : "—";
}

function fwPortsCell(rule) {
  const parts = [];
  if (rule.srcPort) parts.push(`src ${escapeHtml(rule.srcPort)}`);
  if (rule.dstPort) parts.push(`dst ${escapeHtml(rule.dstPort)}`);
  return parts.length ? `<span class="mono">${parts.join(" · ")}</span>` : "—";
}

function fwRuleRow(rule, index) {
  return `<tr class="${rule.disabled ? "is-disabled" : ""}">
    <td class="col-num mono">${index + 1}</td>
    <td class="col-status"><span class="switch" title="${rule.disabled ? "Activer" : "Désactiver"} la règle">
      <input type="checkbox" data-fw-toggle="${escapeHtml(rule.id)}" data-fw-type="${escapeHtml(rule.type)}" ${
    rule.disabled ? "checked" : ""
  } ${rule.dynamic ? "disabled" : ""} />
      <span class="switch-track"></span>
    </span></td>
    <td>${fwChainCell(rule)}</td>
    <td><span class="pill ${fwActionClass(rule.action)}">${escapeHtml(rule.action || "—")}</span></td>
    <td class="mono">${escapeHtml(rule.protocol || "all")}</td>
    <td class="mono">${escapeHtml(rule.srcAddress || "—")}</td>
    <td class="mono">${escapeHtml(rule.dstAddress || "—")}</td>
    <td>${fwPortsCell(rule)}</td>
    <td>${fwInterfaceCell(rule)}</td>
    <td class="mono col-traffic">${formatNumber(rule.packets)}</td>
    <td class="mono col-traffic">${formatBytes(rule.bytes)}</td>
    <td class="fw-comment">${escapeHtml(rule.comment || "—")}${
    rule.dynamic ? ' <span class="chip">dyn</span>' : ""
  }</td>
  </tr>`;
}

function fwQueueRow(queue, index) {
  return `<tr class="${queue.disabled ? "is-disabled" : ""}">
    <td><strong>${escapeHtml(queue.name || "—")}</strong>${
    queue.dynamic ? ' <span class="chip">dyn</span>' : ""
  }</td>
    <td class="col-status"><span class="switch" title="${queue.disabled ? "Activer" : "Désactiver"} la file">
      <input type="checkbox" data-queue-toggle="${escapeHtml(queue.id)}" ${queue.disabled ? "checked" : ""} ${
    queue.dynamic ? "disabled" : ""
  } />
      <span class="switch-track"></span>
    </span></td>
    <td class="mono">${escapeHtml(queue.target || "—")}</td>
    <td class="mono">${escapeHtml(queue.rate || "—")}</td>
    <td class="mono">${escapeHtml(queue.maxLimit || "—")}</td>
    <td class="mono">${escapeHtml(queue.burstLimit || "—")}</td>
    <td class="mono">${escapeHtml(queue.priority || "—")}</td>
    <td class="mono col-traffic">${formatNumber(queue.packets)}</td>
    <td class="mono col-traffic">${formatBytes(queue.bytes)}</td>
    <td class="fw-comment">${escapeHtml(queue.comment || "—")}</td>
  </tr>`;
}

function fwVlanRow(vlan, index) {
  const active = vlan.running && !vlan.disabled;
  return `<tr class="${vlan.disabled ? "is-disabled" : ""}">
    <td><strong>${escapeHtml(vlan.name || "—")}</strong></td>
    <td class="mono">${escapeHtml(vlan.vlanId)}</td>
    <td class="mono">${escapeHtml(vlan.interface || "—")}</td>
    <td class="mono">${escapeHtml(vlan.mtu || "—")}</td>
    <td><span class="pill ${active ? "ok" : vlan.disabled ? "off" : "warn"}">${
    active ? "Actif" : vlan.disabled ? "Désactivé" : "Inactif"
  }</span></td>
    <td class="fw-comment">${escapeHtml(vlan.comment || "—")}</td>
  </tr>`;
}

function fwRouteRow(route, index) {
  const type = route.connect ? "connectée" : route.dynamic ? "dynamique" : "statique";
  const active = route.active && !route.disabled;
  return `<tr class="${route.disabled ? "is-disabled" : ""}">
    <td class="mono"><strong>${escapeHtml(route.dstAddress || "0.0.0.0/0")}</strong></td>
    <td class="mono">${escapeHtml(route.gateway || "—")}</td>
    <td class="mono">${escapeHtml(route.distance)}</td>
    <td class="mono">${escapeHtml(route.prefSrc || "—")}</td>
    <td><span class="chip">${escapeHtml(type)}</span></td>
    <td><span class="pill ${active ? "ok" : route.disabled ? "off" : "warn"}">${
    active ? "Active" : route.disabled ? "Désactivée" : "Inactive"
  }</span></td>
    <td class="fw-comment">${escapeHtml(route.comment || "—")}</td>
  </tr>`;
}

function networkRows() {
  const tab = state.fwTab;
  if (tab === "queues") return state.queues;
  if (tab === "vlans") return state.vlans;
  if (tab === "routes") return state.routes;
  const group = state.firewall.find((entry) => entry.type === tab);
  return group ? group.rules : [];
}

function networkMatches(item, query) {
  if (!query) return true;
  return Object.entries(item)
    .filter(([key]) => key !== "id" && key !== "type")
    .some(([, value]) => value !== null && value !== undefined && String(value).toLowerCase().includes(query));
}

function renderNetwork() {
  const tab = state.fwTab;
  const meta = FW_TABS[tab] || FW_TABS.filter;
  $$("[data-fw-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.fwTab === tab));
  $("#fw-title").textContent = meta.title;
  $("#fw-subtitle").textContent = meta.subtitle;
  $("#fw-badge").textContent = meta.badge;

  const query = state.fwQuery.trim().toLowerCase();
  const all = networkRows();
  const rows =
    tab === "queues" || tab === "vlans" || tab === "routes"
      ? all.filter((item) => networkMatches(item, query))
      : all.filter(
          (rule) =>
            !query ||
            [rule.chain, rule.action, rule.protocol, rule.srcAddress, rule.dstAddress, rule.srcPort, rule.dstPort, rule.inInterface, rule.outInterface, rule.connectionState, rule.comment]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(query))
        );

  const disabled = rows.filter((item) => item.disabled).length;
  $("#fw-count").textContent = formatNumber(rows.length);
  $("#fw-active").textContent = formatNumber(rows.length - disabled);
  $("#fw-disabled").textContent = formatNumber(disabled);
  const totalBytes = rows.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
  $("#fw-traffic").textContent = totalBytes || tab === "vlans" || tab === "routes" ? formatBytes(totalBytes) : "—";

  if (tab === "queues" || tab === "vlans" || tab === "routes") {
    $("#fw-thead").innerHTML = `<tr>${FW_NETWORK_COLUMNS[tab]
      .map((label) => `<th>${label}</th>`)
      .join("")}</tr>`;
  } else {
    $("#fw-thead").innerHTML = `<tr>${FW_RULE_COLUMNS.map(
      (column) => `<th class="${column.className}">${column.label}</th>`
    ).join("")}</tr>`;
  }

  if (!rows.length) {
    $("#fw-tbody").innerHTML = "";
    $("#fw-table-wrap").hidden = true;
    $("#fw-empty").hidden = false;
    $("#fw-foot").textContent = "Aucun élément";
    return;
  }
  $("#fw-table-wrap").hidden = false;
  $("#fw-empty").hidden = true;

  const builder =
    tab === "queues" ? fwQueueRow : tab === "vlans" ? fwVlanRow : tab === "routes" ? fwRouteRow : fwRuleRow;
  $("#fw-tbody").innerHTML = rows.map((item, index) => builder(item, index)).join("");
  $("#fw-foot").textContent = `${formatNumber(rows.length)} élément(s) affiché(s) sur ${formatNumber(
    all.length
  )} · ${formatNumber(disabled)} désactivé(s)`;
}

async function loadNetwork(notify = false) {
  if (state.fwBusy) return;
  state.fwBusy = true;
  const button = $("#fw-refresh");
  setBusy(button, true);
  try {
    const results = await Promise.allSettled([
      api.firewall.list(),
      api.queues.list(),
      api.network.vlans(),
      api.network.routes(),
    ]);
    const errors = [];
    if (results[0].status === "fulfilled") state.firewall = results[0].value;
    else errors.push(results[0].reason);
    if (results[1].status === "fulfilled") state.queues = results[1].value;
    else errors.push(results[1].reason);
    if (results[2].status === "fulfilled") state.vlans = results[2].value;
    else errors.push(results[2].reason);
    if (results[3].status === "fulfilled") state.routes = results[3].value;
    else errors.push(results[3].reason);
    renderNetwork();
    if (errors.length === 4) {
      toast((errors[0] && errors[0].message) || "Lecture du pare-feu impossible.", "error");
    } else if (errors.length) {
      toast("Certaines sections n'ont pas pu être lues sur le routeur.", "warn", 5000);
      if (notify) toast("Données réseau partiellement actualisées", "info", 2500);
    } else if (notify) {
      toast("Pare-feu et réseau actualisés", "success", 2000);
    }
  } finally {
    state.fwBusy = false;
    setBusy(button, false);
  }
}

async function toggleFirewallRule(input) {
  const type = input.dataset.fwType;
  const id = input.dataset.fwToggle;
  const rule = (state.firewall.find((entry) => entry.type === type) || { rules: [] }).rules.find((item) => item.id === id);
  if (!rule) return;
  const disable = input.checked;
  const confirmed = await askConfirm({
    title: `${disable ? "Désactiver" : "Activer"} cette règle ${type} ?`,
    text: `${rule.comment || `Règle ${type} ${rule.chain || ""}`} — le changement est appliqué immédiatement au pare-feu du routeur.`,
    ok: disable ? "Désactiver" : "Activer",
  });
  if (!confirmed) {
    input.checked = rule.disabled;
    return;
  }
  try {
    await api.firewall.toggle(type, id, disable);
    toast(`Règle ${type} ${disable ? "désactivée" : "activée"}`, "success", 3000);
    await loadNetwork();
  } catch (error) {
    input.checked = rule.disabled;
    toast(error.message, "error");
  }
}

async function toggleQueue(input) {
  const id = input.dataset.queueToggle;
  const queue = state.queues.find((item) => item.id === id);
  if (!queue) return;
  const disable = input.checked;
  const confirmed = await askConfirm({
    title: `${disable ? "Désactiver" : "Activer"} la file « ${queue.name} » ?`,
    text: disable
      ? "La limitation de débit sera retirée pour les clients de cette file jusqu'à sa réactivation."
      : "La limitation de débit de cette file sera appliquée à nouveau sur le routeur.",
    ok: disable ? "Désactiver" : "Activer",
  });
  if (!confirmed) {
    input.checked = queue.disabled;
    return;
  }
  try {
    await api.queues.toggle(id, disable);
    toast(`File ${queue.name} ${disable ? "désactivée" : "activée"}`, "success", 3000);
    await loadNetwork();
  } catch (error) {
    input.checked = queue.disabled;
    toast(error.message, "error");
  }
}

function wireNetwork() {
  $$("[data-fw-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.fwTab = button.dataset.fwTab;
      renderNetwork();
    });
  });
  $("#fw-search").addEventListener("input", (event) => {
    state.fwQuery = event.target.value;
    renderNetwork();
  });
  $("#fw-refresh").addEventListener("click", () => loadNetwork(true));
  $("#fw-tbody").addEventListener("change", (event) => {
    const ruleInput = event.target.closest("[data-fw-toggle]");
    if (ruleInput) {
      toggleFirewallRule(ruleInput);
      return;
    }
    const queueInput = event.target.closest("[data-queue-toggle]");
    if (queueInput) toggleQueue(queueInput);
  });
}

/* ============================================================
   Journaux
   ============================================================ */

function renderLogs() {
  const query = state.logsQuery.trim().toLowerCase();
  const rows = state.logs.filter((entry) => {
    if (state.logsTopic && !String(entry.topics || "").toLowerCase().includes(state.logsTopic)) return false;
    if (!query) return true;
    return [entry.message, entry.topics, entry.time].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
  });
  const list = $("#log-list");
  if (!rows.length) {
    list.innerHTML = "";
    $("#logs-empty").hidden = false;
    $("#logs-summary").textContent = "0 événement";
    return;
  }
  $("#logs-empty").hidden = true;
  list.innerHTML = rows
    .map((entry) => {
      const topics = String(entry.topics || "system")
        .split(",")
        .map((topic) => topic.trim())
        .filter(Boolean);
      return `
        <div class="log-row">
          <span class="log-time">${escapeHtml(entry.time || "—")}</span>
          <span class="log-topics">
            ${topics.map((topic) => `<span class="log-topic t-${escapeHtml(slugTopic(topic))}">${escapeHtml(topic)}</span>`).join("")}
          </span>
          <span class="log-msg">${escapeHtml(entry.message || "")}</span>
        </div>`;
    })
    .join("");
  $("#logs-summary").textContent = `${rows.length} événement${rows.length > 1 ? "s" : ""}`;
}

async function loadLogs(notify = false) {
  try {
    state.logs = await api.logs.list();
    renderLogs();
    if (notify) toast("Journaux actualisés", "success", 2000);
  } catch (error) {
    toast(error.message, "error");
  }
}

function wireLogs() {
  $("#logs-search").addEventListener("input", (event) => {
    state.logsQuery = event.target.value;
    renderLogs();
  });
  $("#logs-refresh").addEventListener("click", () => loadLogs(true));
  $$("#log-topics .toolbar-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.logsTopic = tab.dataset.topic || "";
      $$("#log-topics .toolbar-tab").forEach((item) => item.classList.toggle("is-active", item === tab));
      renderLogs();
    });
  });
}

/* ============================================================
   Diagnostic réseau
   ============================================================ */

function formatPingValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "—";
  return `${number.toFixed(number >= 10 ? 0 : 1)} ms`;
}

function pingStatusLabel(status) {
  const raw = String(status || "").toLowerCase();
  if (!raw) return { label: "Inconnu", tone: "" };
  if (raw.includes("timeout") || raw.includes("unreachable") || raw.includes("host unreachable")) {
    return { label: "Aucune réponse", tone: "off" };
  }
  if (raw.includes("reply")) return { label: "Réponse", tone: "ok" };
  return { label: status, tone: "" };
}

function renderDiagnostics() {
  $("#diag-mode").textContent = state.demo ? "Routeur simulé" : "Depuis le routeur";

  const ping = state.diagPing;
  $("#ping-empty").hidden = Boolean(ping);
  $("#ping-sent").textContent = ping ? String(ping.sent || 0) : "0";
  $("#ping-received").textContent = ping ? String(ping.received || 0) : "0";
  $("#ping-loss").textContent = ping ? `${ping.loss || 0} %` : "—";
  $("#ping-avg").textContent = ping ? formatPingValue(ping.avg) : "—";
  $("#ping-tbody").innerHTML = ping
    ? (ping.replies || [])
        .map((reply, index) => {
          const status = pingStatusLabel(reply.status);
          return `<tr>
            <td class="mono">${index + 1}</td>
            <td class="mono">${escapeHtml(reply.host || ping.target)}</td>
            <td>${reply.size ? escapeHtml(reply.size) : "—"}</td>
            <td>${reply.ttl ? escapeHtml(reply.ttl) : "—"}</td>
            <td class="mono">${escapeHtml(reply.time || formatPingValue(reply.timeMs))}</td>
            <td><span class="pill ${status.tone}">${escapeHtml(status.label)}</span></td>
          </tr>`;
        })
        .join("")
    : "";
  if (ping) {
    const summary = `${ping.received}/${ping.sent} réponse(s) · perte ${ping.loss}% · min ${formatPingValue(
      ping.min
    )} · moy ${formatPingValue(ping.avg)} · max ${formatPingValue(ping.max)}`;
    $("#ping-summary").textContent = summary;
    $("#ping-state").textContent = ping.received ? "Terminé" : "Sans réponse";
    $("#ping-state").className = `chip ${ping.received ? "ok" : "warn"}`;
  } else {
    $("#ping-summary").textContent = "En attente d'un test";
    $("#ping-state").textContent = "Prêt";
    $("#ping-state").className = "chip";
  }

  const trace = state.diagTrace;
  $("#trace-empty").hidden = Boolean(trace);
  $("#trace-tbody").innerHTML = trace
    ? (trace.hops || [])
        .map(
          (hop) => `<tr>
            <td class="mono">${hop.hop}</td>
            <td class="mono">${escapeHtml(hop.address || hop.status || "—")}</td>
            <td>${escapeHtml(hop.loss || "—")}</td>
            <td>${escapeHtml(hop.sent || "—")}</td>
            <td class="mono">${escapeHtml(hop.last || "—")}</td>
            <td class="mono">${escapeHtml(hop.avg || "—")}</td>
          </tr>`
        )
        .join("")
    : "";
  if (trace) {
    $("#trace-summary").textContent = `${trace.hops.length} saut(s) vers ${trace.target}`;
    $("#trace-state").textContent = trace.hops.length ? "Terminé" : "Sans réponse";
    $("#trace-state").className = `chip ${trace.hops.length ? "ok" : "warn"}`;
  } else {
    $("#trace-summary").textContent = "En attente d'un test";
    $("#trace-state").textContent = "Prêt";
    $("#trace-state").className = "chip";
  }
}

function readDiagnosticTarget(input, label) {
  const raw = input.value.trim();
  if (!raw) throw new Error(`${label} est obligatoire.`);
  if (validate) return validate.validateHost(raw, label);
  return raw;
}

async function runPing(event) {
  event.preventDefault();
  const button = $("#ping-run");
  let target;
  try {
    target = readDiagnosticTarget($("#ping-target"), "La cible du ping");
  } catch (error) {
    toast(error.message, "error");
    return;
  }
  const count = Number($("#ping-count").value) || 4;
  setBusy(button, true);
  state.diagBusy = true;
  $("#ping-state").textContent = "En cours";
  $("#ping-state").className = "chip warn";
  try {
    state.diagPing = await api.router.ping(target, count);
    renderDiagnostics();
    evaluateAlerts({ packetLoss: state.diagPing.loss });
    toast(
      state.diagPing.received
        ? `Ping ${target} : ${state.diagPing.received}/${state.diagPing.sent} réponses · ${state.diagPing.loss}% de perte`
        : `Aucune réponse de ${target}`,
      state.diagPing.received ? "success" : "warn"
    );
  } catch (error) {
    toast(error.message, "error");
    $("#ping-state").textContent = "Échec";
    $("#ping-state").className = "chip danger";
  } finally {
    state.diagBusy = false;
    setBusy(button, false);
  }
}

async function runTraceroute(event) {
  event.preventDefault();
  const button = $("#trace-run");
  let target;
  try {
    target = readDiagnosticTarget($("#trace-target"), "La cible du traceroute");
  } catch (error) {
    toast(error.message, "error");
    return;
  }
  setBusy(button, true);
  state.diagBusy = true;
  $("#trace-state").textContent = "En cours";
  $("#trace-state").className = "chip warn";
  try {
    state.diagTrace = await api.router.traceroute(target);
    renderDiagnostics();
    toast(`Traceroute terminé : ${state.diagTrace.hops.length} saut(s)`, "success", 2500);
  } catch (error) {
    toast(error.message, "error");
    $("#trace-state").textContent = "Échec";
    $("#trace-state").className = "chip danger";
  } finally {
    state.diagBusy = false;
    setBusy(button, false);
  }
}

function wireDiagnostics() {
  $("#ping-form").addEventListener("submit", runPing);
  $("#trace-form").addEventListener("submit", runTraceroute);
}

/* ============================================================
   Audit sécurité
   ============================================================ */

const SECURITY_STATUS = {
  ok: { label: "Conforme", tone: "ok", icon: "i-check", rank: 4 },
  info: { label: "Information", tone: "", icon: "i-info", rank: 3 },
  unknown: { label: "Indéterminé", tone: "warn", icon: "i-info", rank: 2 },
  warn: { label: "À corriger", tone: "warn", icon: "i-alert", rank: 1 },
  critical: { label: "Critique", tone: "danger", icon: "i-alert", rank: 0 },
};

function renderSecurity() {
  const audit = state.securityAudit;
  const checks = $("#security-checks");
  $("#security-empty").hidden = Boolean(audit);
  if (!audit) {
    $("#security-score").textContent = "—";
    $("#security-grade").textContent = "—";
    $("#security-identity").textContent = "—";
    $("#security-version").textContent = "RouterOS —";
    $("#security-summary").textContent =
      "Lancez une analyse pour contrôler les comptes, services, pare-feu et sauvegardes du routeur.";
    ["security-ok", "security-warn", "security-critical", "security-info"].forEach((id) => {
      $(`#${id}`).textContent = "0";
    });
    checks.innerHTML = "";
    $("#security-score-wrap").className = "security-score";
    return;
  }

  const summary = audit.summary || {};
  const score = Number(audit.score) || 0;
  $("#security-score").textContent = String(score);
  $("#security-grade").textContent = audit.grade || "—";
  $("#security-score-wrap").className = `security-score grade-${String(audit.grade || "e").toLowerCase()}`;
  $("#security-score-wrap").style.setProperty("--score", String(Math.max(0, Math.min(100, score))));
  $("#security-identity").textContent = audit.identity || "Routeur MikroTik";
  $("#security-version").textContent = `RouterOS ${audit.version || "—"}`;
  $("#security-ok").textContent = `${summary.ok || 0} conforme${summary.ok === 1 ? "" : "s"}`;
  $("#security-warn").textContent = `${summary.warn || 0} avertissement${summary.warn === 1 ? "" : "s"}`;
  $("#security-critical").textContent = `${summary.critical || 0} critique${summary.critical === 1 ? "" : "s"}`;
  $("#security-info").textContent = `${summary.info || 0} information${summary.info === 1 ? "" : "s"}`;

  const headline = summary.critical
    ? `${summary.critical} point(s) critique(s) demandent une correction immédiate.`
    : summary.warn
      ? `${summary.warn} point(s) à corriger pour renforcer la configuration.`
      : "La configuration ne présente pas de faiblesse majeure détectée.";
  $("#security-summary").textContent = headline;

  const ordered = (audit.checks || []).slice().sort((left, right) => {
    const a = (SECURITY_STATUS[left.status] || SECURITY_STATUS.unknown).rank;
    const b = (SECURITY_STATUS[right.status] || SECURITY_STATUS.unknown).rank;
    return a - b;
  });

  checks.innerHTML = ordered
    .map((check) => {
      const status = SECURITY_STATUS[check.status] || SECURITY_STATUS.unknown;
      return `<div class="security-check" data-status="${escapeHtml(check.status || "unknown")}">
        <span class="security-check-icon"><svg><use href="#${status.icon}"/></svg></span>
        <div class="security-check-body">
          <div class="security-check-top">
            <strong>${escapeHtml(check.title || check.id || "Contrôle")}</strong>
            <span class="pill ${status.tone}">${status.label}</span>
          </div>
          <p>${escapeHtml(check.detail || "")}</p>
          ${
            check.recommendation
              ? `<p class="security-check-advice"><svg><use href="#i-info"/></svg> ${escapeHtml(check.recommendation)}</p>`
              : ""
          }
        </div>
      </div>`;
    })
    .join("");
}

async function runSecurityAudit(notify = false) {
  if (state.securityBusy) return;
  const button = $("#security-run");
  state.securityBusy = true;
  setBusy(button, true);
  $("#security-summary").textContent = "Analyse de la configuration en cours…";
  try {
    state.securityAudit = await api.router.security();
    renderSecurity();
    toast(`Audit terminé — score ${state.securityAudit.score}/100`, "success", 3000);
  } catch (error) {
    state.securityBusy = false;
    toast(error.message, "error");
    $("#security-summary").textContent = "L'analyse a échoué. Vérifiez les droits « read » de l'utilisateur API.";
    setBusy(button, false);
    return;
  }
  state.securityBusy = false;
  setBusy(button, false);
  if (notify) toast("Audit sécurité actualisé", "info", 2000);
}

function wireSecurity() {
  $("#security-run").addEventListener("click", () => runSecurityAudit());
}

/* ============================================================
   Sauvegardes de configuration
   ============================================================ */

function backupLabel(item) {
  return item.label || `Instantané du ${formatDate(item.at)}`;
}

function diffContainer() {
  let body = $("#diff-body");
  if (!body) {
    body = document.createElement("div");
    body.id = "diff-body";
    $("#diff-view").appendChild(body);
  }
  return body;
}

async function loadBackups(notify = false) {
  try {
    state.backups = await api.config.list();
  } catch (error) {
    toast(error.message, "error");
    return;
  }
  if (state.backupSelected && !state.backups.some((item) => item.id === state.backupSelected)) {
    state.backupSelected = null;
  }
  if (!state.backupSelected && state.backups.length) state.backupSelected = state.backups[0].id;
  renderBackups();
  if (state.backupSelected) {
    await loadBackupDiff();
  } else {
    clearDiff();
  }
  if (notify) toast("Instantanés actualisés", "success", 2000);
}

function renderBackups() {
  const count = state.backups.length;
  $("#backups-count").textContent = `${count} instantané${count === 1 ? "" : "s"}`;
  $("#backups-mode").textContent = state.demo ? "Mode démonstration" : "Routeur connecté";
  $("#backups-mode").className = `chip${state.demo ? " warn" : " ok"}`;
  $("#backups-empty").hidden = count > 0;
  $("#backups-list").innerHTML = state.backups
    .map(
      (item) => `<div class="backup-item${item.id === state.backupSelected ? " is-active" : ""}" data-id="${escapeHtml(
        item.id
      )}" role="button" tabindex="0">
        <div class="backup-item-top">
          <strong title="${escapeHtml(backupLabel(item))}">${escapeHtml(backupLabel(item))}</strong>
          <button class="backup-del" data-del="${escapeHtml(item.id)}" aria-label="Supprimer cet instantané" title="Supprimer">
            <svg><use href="#i-trash"/></svg>
          </button>
        </div>
        <span>${escapeHtml(formatDate(item.at))} · ${formatNumber(item.lines)} ligne(s) · ${formatBytes(item.bytes)}</span>
        <div class="backup-item-row">
          <span class="chip">${escapeHtml(item.identity || "Routeur")}</span>
          ${item.mode === "demo" ? '<span class="chip warn">Démo</span>' : ""}
        </div>
      </div>`
    )
    .join("");

  const compare = $("#diff-compare");
  const choices = state.backups.filter((item) => item.id !== state.backupSelected);
  compare.innerHTML = [
    '<option value="current">Configuration actuelle</option>',
    ...choices.map(
      (item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(backupLabel(item))} — ${escapeHtml(formatDate(item.at))}</option>`
    ),
  ].join("");
  if (state.backupCompare !== "current" && !choices.some((item) => item.id === state.backupCompare)) {
    state.backupCompare = "current";
  }
  compare.value = state.backupCompare;
  $("#diff-download").disabled = !state.backupSelected;
  $("#diff-restore").disabled = !state.backupSelected;
}

function clearDiff() {
  $("#diff-empty").hidden = false;
  $("#diff-body") && ($("#diff-body").innerHTML = "");
  $("#diff-stat-add").textContent = "+0";
  $("#diff-stat-del").textContent = "−0";
  $("#diff-summary").textContent = "—";
  $("#diff-subtitle").textContent = "Sélectionnez un instantané à gauche";
  $("#diff-download").disabled = true;
  $("#diff-restore").disabled = true;
}

async function loadBackupDiff(notify = false) {
  if (!state.backupSelected) {
    clearDiff();
    return;
  }
  const tool = window.MikroDiff;
  if (!tool) {
    toast("Module de comparaison indisponible.", "error");
    return;
  }
  state.diffLoading = true;
  const token = ++state.diffToken;
  $("#diff-empty").hidden = true;
  diffContainer().innerHTML = '<div class="empty-state"><strong>Comparaison en cours…</strong></div>';
  try {
    const left = await api.config.get(state.backupSelected);
    if (token !== state.diffToken) return;
    if (!left) throw new Error("Instantané introuvable.");
    const isCurrent = state.backupCompare === "current";
    const right = isCurrent ? await api.config.current() : await api.config.get(state.backupCompare);
    if (token !== state.diffToken) return;
    if (!right) throw new Error("Élément de comparaison introuvable.");
    state.diffRows = tool.diffLines(left.content, right.content);
    state.diffStats = tool.summarize(state.diffRows);
    renderDiff(left, right, isCurrent);
    if (notify) toast("Comparaison actualisée", "success", 2000);
  } catch (error) {
    if (token !== state.diffToken) return;
    clearDiff();
    diffContainer().innerHTML = `<div class="empty-state"><strong>Comparaison impossible</strong><span>${escapeHtml(
      error.message
    )}</span></div>`;
    toast(error.message, "error");
  } finally {
    if (token === state.diffToken) state.diffLoading = false;
  }
}

function collapseDiffRows(rows) {
  const output = [];
  let index = 0;
  while (index < rows.length) {
    if (rows[index].type !== "equal") {
      output.push(rows[index]);
      index += 1;
      continue;
    }
    let end = index;
    while (end < rows.length && rows[end].type === "equal") end += 1;
    const run = end - index;
    if (run <= 8) {
      output.push(...rows.slice(index, end));
    } else {
      output.push(...rows.slice(index, index + 3));
      output.push({ type: "hunk", text: `… ${run - 6} ligne(s) identique(s) …` });
      output.push(...rows.slice(end - 3, end));
    }
    index = end;
  }
  return output;
}

function renderDiff(left, right, isCurrent) {
  const { added, removed } = state.diffStats;
  $("#diff-stat-add").textContent = `+${formatNumber(added)}`;
  $("#diff-stat-del").textContent = `−${formatNumber(removed)}`;
  const targetLabel = isCurrent
    ? "la configuration actuelle"
    : `« ${backupLabel(right)} »`;
  $("#diff-subtitle").textContent = `${backupLabel(left)} comparé à ${targetLabel}`;

  if (!added && !removed) {
    $("#diff-summary").textContent = "Configurations identiques.";
    diffContainer().innerHTML =
      '<div class="empty-state"><svg><use href="#i-check"/></svg><strong>Aucune différence</strong><span>Les deux configurations sont identiques ligne pour ligne.</span></div>';
    return;
  }

  const rows = collapseDiffRows(state.diffRows).slice(0, 5000);
  diffContainer().innerHTML = rows
    .map((row) => {
      if (row.type === "hunk") {
        return `<div class="diff-line hunk">${escapeHtml(row.text)}</div>`;
      }
      const number = row.type === "del" ? row.oldLine : row.newLine;
      const sign = row.type === "add" ? "+" : row.type === "del" ? "−" : " ";
      return `<div class="diff-line ${row.type}"><span class="diff-gutter">${
        number === null || number === undefined ? "" : number
      }</span><span class="diff-sign">${sign}</span><span class="diff-text">${escapeHtml(row.text)}</span></div>`;
    })
    .join("");
  $("#diff-summary").textContent = `${formatNumber(added)} ligne(s) ajoutée(s) · ${formatNumber(
    removed
  )} ligne(s) supprimée(s) · ${formatNumber(left.lines)} lignes dans l'instantané`;
}

async function captureBackup() {
  const button = $("#backups-capture");
  if (state.backupBusy) return;
  state.backupBusy = true;
  setBusy(button, true);
  try {
    const label = `Instantané du ${new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" })}`;
    const saved = await api.config.capture(label);
    state.backupSelected = saved.id;
    state.backupCompare = "current";
    await loadBackups();
    toast(`Instantané créé — ${formatNumber(saved.lines)} lignes`, "success", 3000);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    state.backupBusy = false;
    setBusy(button, false);
  }
}

async function exportConfigFile() {
  const button = $("#backups-download");
  setBusy(button, true);
  try {
    const result = await api.config.exportFile();
    if (!result.canceled) {
      toast(`Configuration exportée vers ${result.path}`, "success", 5000);
    }
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

async function importConfigFile() {
  const confirmed = await askConfirm({
    title: "Importer une configuration ?",
    text:
      "Le fichier .rsc sélectionné sera exécuté sur le routeur et remplacera les sections qu'il contient. MikroDesk crée d'abord un instantané de sécurité, mais cette opération peut couper le réseau.",
    ok: "Choisir un fichier",
  });
  if (!confirmed) return;
  const button = $("#backups-import");
  setBusy(button, true);
  try {
    const result = await api.config.importFile();
    if (result.canceled) return;
    toast(`Configuration restaurée depuis ${result.path}`, "success", 6000);
    if (result.warning) toast(result.warning, "warn", 8000);
    await loadBackups();
    await refreshDashboard(true);
  } catch (error) {
    toast(error.message, "error", 7000);
  } finally {
    setBusy(button, false);
  }
}

async function restoreBackup() {
  const item = state.backups.find((entry) => entry.id === state.backupSelected);
  if (!item) return;
  const confirmed = await askConfirm({
    title: "Restaurer cet instantané ?",
    text: `La configuration « ${backupLabel(
      item
    )} » sera réexécutée sur le routeur. Un instantané de la configuration actuelle est créé automatiquement avant l'opération, mais le réseau peut être interrompu.`,
    ok: "Restaurer",
  });
  if (!confirmed) return;
  const button = $("#diff-restore");
  setBusy(button, true);
  try {
    const result = await api.config.restore(item.id);
    toast(`Configuration restaurée (${formatNumber(result.restored.lines)} lignes)`, "success", 6000);
    if (result.warning) toast(result.warning, "warn", 8000);
    await loadBackups();
    await refreshDashboard(true);
  } catch (error) {
    toast(error.message, "error", 8000);
  } finally {
    setBusy(button, false);
  }
}

async function downloadBackup() {
  if (!state.backupSelected) return;
  try {
    const result = await api.config.download(state.backupSelected);
    if (!result.canceled) toast(`Fichier enregistré : ${result.path}`, "success", 5000);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function deleteBackup(id) {
  const item = state.backups.find((entry) => entry.id === id);
  if (!item) return;
  const confirmed = await askConfirm({
    title: "Supprimer cet instantané ?",
    text: `« ${backupLabel(item)} » sera supprimé de cet ordinateur. Le routeur n'est pas modifié.`,
    ok: "Supprimer",
  });
  if (!confirmed) return;
  try {
    state.backups = await api.config.remove(id);
    if (state.backupSelected === id) state.backupSelected = state.backups.length ? state.backups[0].id : null;
    renderBackups();
    if (state.backupSelected) await loadBackupDiff();
    else clearDiff();
    toast("Instantané supprimé", "success", 2000);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function createRouterBackup() {
  const button = $("#backups-router");
  const box = $("#backups-router-result");
  setBusy(button, true);
  try {
    const result = await api.router.backupOnRouter();
    box.hidden = false;
    box.className = "backup-router-result";
    box.innerHTML = `Sauvegarde créée : <code>${escapeHtml(result.name)}</code>${
      result.size ? ` · ${formatBytes(result.size)}` : ""
    }<br /><span>${escapeHtml(result.note || "")}</span>`;
    toast("Sauvegarde binaire créée sur le routeur", "success", 4000);
  } catch (error) {
    box.hidden = false;
    box.className = "backup-router-result is-error";
    box.textContent = error.message;
    toast(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

function wireBackups() {
  $("#backups-capture").addEventListener("click", captureBackup);
  $("#backups-download").addEventListener("click", exportConfigFile);
  $("#backups-import").addEventListener("click", importConfigFile);
  $("#backups-router").addEventListener("click", createRouterBackup);
  $("#diff-refresh").addEventListener("click", () => loadBackupDiff(true));
  $("#diff-download").addEventListener("click", downloadBackup);
  $("#diff-restore").addEventListener("click", restoreBackup);
  $("#diff-compare").addEventListener("change", (event) => {
    state.backupCompare = event.target.value;
    loadBackupDiff();
  });
  const list = $("#backups-list");
  list.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-del]");
    if (remove) {
      event.stopPropagation();
      deleteBackup(remove.dataset.del);
      return;
    }
    const item = event.target.closest("[data-id]");
    if (!item) return;
    state.backupSelected = item.dataset.id;
    state.backupCompare = "current";
    renderBackups();
    loadBackupDiff();
  });
  list.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const item = event.target.closest("[data-id]");
    if (!item) return;
    event.preventDefault();
    state.backupSelected = item.dataset.id;
    state.backupCompare = "current";
    renderBackups();
    loadBackupDiff();
  });
}

/* ============================================================
   Journal d'audit
   ============================================================ */

async function loadAudit(notify = false) {
  try {
    state.audit = await api.audit.list();
    renderAudit();
    if (notify) toast("Journal d'audit actualisé", "success", 2000);
  } catch (error) {
    toast(error.message, "error");
  }
}

function renderAudit() {
  const query = state.auditQuery.trim().toLowerCase();
  const status = state.auditStatus;
  const filtered = state.audit.filter((entry) => {
    if (status && entry.status !== status) return false;
    if (!query) return true;
    return [entry.action, entry.target, entry.identity, entry.host, entry.detail]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const ok = state.audit.filter((entry) => entry.status === "ok").length;
  const errors = state.audit.length - ok;
  $("#audit-total").textContent = formatNumber(state.audit.length);
  $("#audit-ok").textContent = formatNumber(ok);
  $("#audit-errors").textContent = formatNumber(errors);
  const last = state.audit[0];
  $("#audit-last").textContent = last ? last.action : "—";

  $("#audit-empty").hidden = filtered.length > 0;
  $("#audit-table-wrap").hidden = filtered.length === 0;
  $("#audit-tbody").innerHTML = filtered
    .slice(0, 400)
    .map(
      (entry) => `<tr class="${entry.status === "error" ? "is-error" : ""}">
        <td class="mono">${escapeHtml(formatDate(entry.at))}</td>
        <td class="audit-action">${escapeHtml(entry.action)}</td>
        <td class="mono">${escapeHtml(entry.target || "—")}</td>
        <td>${escapeHtml(entry.identity || entry.host || "—")}</td>
        <td><span class="pill ${entry.status === "error" ? "danger" : "ok"}">${
          entry.status === "error" ? "Échec" : "Réussie"
        }</span></td>
        <td>${escapeHtml(entry.detail || "—")}</td>
      </tr>`
    )
    .join("");

  const total = state.audit.length;
  $("#audit-foot").textContent =
    total === 0
      ? "Aucune action enregistrée"
      : `${formatNumber(filtered.length)} action(s) affichée(s) sur ${formatNumber(total)}${
          filtered.length > 400 ? " — 400 premières affichées" : ""
        }`;
}

async function clearAudit() {
  const confirmed = await askConfirm({
    title: "Vider le journal d'audit ?",
    text: "L'historique local des actions sera définitivement supprimé. Les journaux du routeur ne sont pas concernés.",
    ok: "Vider",
  });
  if (!confirmed) return;
  try {
    await api.audit.clear();
    state.audit = [];
    renderAudit();
    toast("Journal d'audit vidé", "success", 2500);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function exportAudit() {
  const button = $("#audit-export");
  setBusy(button, true);
  try {
    const result = await api.audit.exportFile();
    if (!result.canceled) toast(`Journal exporté (${formatNumber(result.count)} entrées) : ${result.path}`, "success", 5000);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

function wireAudit() {
  $("#audit-search").addEventListener("input", (event) => {
    state.auditQuery = event.target.value;
    renderAudit();
  });
  $("#audit-status").addEventListener("change", (event) => {
    state.auditStatus = event.target.value;
    renderAudit();
  });
  $("#audit-clear").addEventListener("click", clearAudit);
  $("#audit-export").addEventListener("click", exportAudit);
}

/* ============================================================
   Parc routeurs
   ============================================================ */

function fleetStatus(entry) {
  if (entry.active) return { label: "Session active", tone: "ok" };
  if (entry.online === true) return { label: "En ligne", tone: "ok" };
  if (entry.online === false) return { label: "Hors ligne", tone: "danger" };
  return { label: "Non testé", tone: "off" };
}

function fleetPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function fleetMetric(label, value) {
  const percent = fleetPercent(value);
  const tone = percent === null ? "off" : percent >= 90 ? "danger" : percent >= 70 ? "warn" : "ok";
  return `<div class="fleet-metric">
    <div class="fleet-metric-head"><span>${label}</span><strong>${percent === null ? "—" : `${percent} %`}</strong></div>
    <div class="fleet-bar"><span class="${tone}" style="width:${percent === null ? 0 : percent}%"></span></div>
  </div>`;
}

function fleetCard(entry) {
  const status = fleetStatus(entry);
  const metrics = entry.metrics || {};
  const selected = state.fleetCompare.includes(entry.id);
  return `<article class="fleet-card glass ${entry.active ? "is-active" : ""} ${entry.online === false ? "is-offline" : ""}" data-fleet-card="${escapeHtml(entry.id)}">
    <header class="fleet-card-head">
      <label class="fleet-check" title="Sélectionner pour comparer">
        <input type="checkbox" data-fleet-compare="${escapeHtml(entry.id)}" ${selected ? "checked" : ""} />
        <span class="fleet-check-box"></span>
      </label>
      <span class="fleet-ico"><svg><use href="#i-router"/></svg></span>
      <div class="fleet-title">
        <h4>${escapeHtml(entry.name || entry.host || "Routeur")}${entry.demo ? ' <span class="chip">démo</span>' : ""}</h4>
        <span>${escapeHtml(entry.host || "—")}${entry.port ? `:${escapeHtml(entry.port)}` : ""}${entry.tls ? " · TLS" : ""}</span>
      </div>
      <span class="pill ${status.tone}">${status.label}</span>
    </header>

    <div class="fleet-metrics">
      ${fleetMetric("CPU", metrics.cpu)}
      ${fleetMetric("Mémoire", metrics.memory)}
      ${fleetMetric("Stockage", metrics.disk)}
    </div>

    <dl class="fleet-meta">
      <div><dt>Modèle</dt><dd>${escapeHtml(metrics.board || "—")}</dd></div>
      <div><dt>Version</dt><dd>${escapeHtml(metrics.version || "—")}</dd></div>
      <div><dt>Latence</dt><dd>${entry.latency === null || entry.latency === undefined ? "—" : `${formatNumber(entry.latency)} ms`}</dd></div>
      <div><dt>Dernier test</dt><dd>${entry.checkedAt ? escapeHtml(formatDate(entry.checkedAt)) : "Jamais"}</dd></div>
    </dl>

    ${
      entry.online === false && entry.error
        ? `<p class="fleet-error"><svg><use href="#i-alert"/></svg> ${escapeHtml(entry.error)}</p>`
        : ""
    }

    <footer class="fleet-actions">
      <button class="btn btn-ghost btn-sm" data-fleet-probe="${escapeHtml(entry.id)}" data-no-busy="true">
        <svg><use href="#i-refresh"/></svg> Tester
      </button>
      ${
        entry.active
          ? '<span class="chip ok">Connecté</span>'
          : `<button class="btn btn-primary btn-sm" data-fleet-switch="${escapeHtml(entry.profileId || entry.id)}">
              <svg><use href="#i-link"/></svg> Basculer
            </button>`
      }
    </footer>
  </article>`;
}

function renderFleet() {
  const query = state.fleetQuery.trim().toLowerCase();
  const list = state.fleet.filter(
    (entry) =>
      !query ||
      [entry.name, entry.host, entry.username, entry.metrics && entry.metrics.identity]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
  );

  $("#fleet-total").textContent = formatNumber(state.fleet.length);
  $("#fleet-online").textContent = formatNumber(state.fleet.filter((entry) => entry.online === true).length);
  $("#fleet-offline").textContent = formatNumber(state.fleet.filter((entry) => entry.online === false).length);
  $("#fleet-unknown").textContent = formatNumber(state.fleet.filter((entry) => entry.online === null || entry.online === undefined).length);

  const nav = $("#nav-count-fleet");
  if (nav) nav.textContent = state.fleet.length > 99 ? "99+" : String(state.fleet.length);

  const grid = $("#fleet-grid");
  if (!state.fleet.length) {
    grid.innerHTML = "";
    $("#fleet-empty").hidden = false;
  } else {
    $("#fleet-empty").hidden = true;
    grid.innerHTML = list.length
      ? list.map(fleetCard).join("")
      : '<p class="fleet-no-result">Aucun routeur ne correspond à cette recherche.</p>';
  }

  renderFleetCompare();
}

function compareValue(entry, key) {
  const metrics = entry.metrics || {};
  switch (key) {
    case "status":
      return fleetStatus(entry).label;
    case "address":
      return `${entry.host || "—"}${entry.port ? `:${entry.port}` : ""}${entry.tls ? " · TLS" : ""}`;
    case "cpu":
      return fleetPercent(metrics.cpu) === null ? "—" : `${fleetPercent(metrics.cpu)} %`;
    case "memory":
      return fleetPercent(metrics.memory) === null ? "—" : `${fleetPercent(metrics.memory)} %`;
    case "disk":
      return fleetPercent(metrics.disk) === null ? "—" : `${fleetPercent(metrics.disk)} %`;
    case "temperature":
      return Number.isFinite(Number(metrics.temperature)) ? `${Math.round(Number(metrics.temperature))} °C` : "—";
    case "board":
      return metrics.board || "—";
    case "version":
      return metrics.version || "—";
    case "uptime":
      return metrics.uptime || "—";
    case "latency":
      return entry.latency === null || entry.latency === undefined ? "—" : `${formatNumber(entry.latency)} ms`;
    case "checkedAt":
      return entry.checkedAt ? formatDate(entry.checkedAt) : "Jamais";
    default:
      return "—";
  }
}

function renderFleetCompare() {
  const body = $("#fleet-compare-body");
  const clear = $("#fleet-compare-clear");
  const subtitle = $("#fleet-compare-subtitle");
  state.fleetCompare = state.fleetCompare.filter((id) => state.fleet.some((entry) => entry.id === id)).slice(0, 2);
  const selected = state.fleetCompare
    .map((id) => state.fleet.find((entry) => entry.id === id))
    .filter(Boolean);

  clear.hidden = selected.length === 0;
  if (selected.length !== 2) {
    subtitle.textContent =
      selected.length === 1
        ? "Sélectionnez un second routeur pour lancer la comparaison."
        : "Cochez deux routeurs pour comparer leurs indicateurs.";
    body.innerHTML = `<div class="fleet-compare-hint"><svg><use href="#i-spark"/></svg><span>La comparaison affiche le statut, la charge, la version et la latence de deux routeurs côte à côte.</span></div>`;
    return;
  }

  subtitle.textContent = `${selected[0].name} face à ${selected[1].name}`;
  const rows = [
    ["Statut", "status"],
    ["Adresse", "address"],
    ["Modèle", "board"],
    ["Version", "version"],
    ["CPU", "cpu"],
    ["Mémoire", "memory"],
    ["Stockage", "disk"],
    ["Température", "temperature"],
    ["Uptime", "uptime"],
    ["Latence", "latency"],
    ["Dernier test", "checkedAt"],
  ];
  body.innerHTML = `<div class="table-wrap">
    <table class="data-table fleet-compare-table">
      <thead><tr><th>Indicateur</th><th>${escapeHtml(selected[0].name)}</th><th>${escapeHtml(selected[1].name)}</th></tr></thead>
      <tbody>${rows
        .map(
          ([label, key]) =>
            `<tr><td>${label}</td><td class="mono">${escapeHtml(compareValue(selected[0], key))}</td><td class="mono">${escapeHtml(
              compareValue(selected[1], key)
            )}</td></tr>`
        )
        .join("")}</tbody>
    </table>
  </div>`;
}

async function loadFleet(notify = false) {
  try {
    const result = await api.fleet.list();
    state.fleet = result.entries || [];
    renderFleet();
    if (notify) toast("Parc de routeurs actualisé", "success", 2000);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function probeFleetEntry(id) {
  const entry = state.fleet.find((item) => item.id === id);
  if (!entry) return;
  const button = document.querySelector(`[data-fleet-probe="${CSS.escape(id)}"]`);
  setBusy(button, true);
  try {
    const updated = await api.fleet.probe(entry.profileId || id);
    state.fleet = state.fleet.map((item) => (item.id === id ? { ...item, ...updated } : item));
    renderFleet();
    if (updated.online) {
      toast(`${updated.name} en ligne${updated.latency !== null ? ` (${formatNumber(updated.latency)} ms)` : ""}`, "success", 3500);
    } else {
      toast(`${updated.name} injoignable — ${updated.error || "aucune réponse"}`, "error", 7000);
    }
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

async function probeFleet() {
  const button = $("#fleet-probe-all");
  state.fleetProbing = true;
  setBusy(button, true);
  try {
    const result = await api.fleet.probeAll();
    state.fleet = result.entries || [];
    renderFleet();
    const online = state.fleet.filter((entry) => entry.online === true).length;
    const offline = state.fleet.filter((entry) => entry.online === false).length;
    toast(
      `Test terminé — ${online} en ligne, ${offline} hors ligne${state.fleet.length ? ` sur ${state.fleet.length}` : ""}.`,
      offline ? "warn" : "success",
      5000
    );
  } catch (error) {
    toast(error.message, "error");
  } finally {
    state.fleetProbing = false;
    setBusy(button, false);
  }
}

async function switchFleetRouter(id) {
  const entry = state.fleet.find((item) => item.id === id || item.profileId === id);
  if (!entry) return;
  const confirmed = await askConfirm({
    title: `Basculer vers « ${entry.name} » ?`,
    text: "La session actuelle sera fermée et MikroDesk se connectera à ce routeur avec les identifiants enregistrés.",
    ok: "Basculer",
  });
  if (!confirmed) return;
  try {
    const result = await api.fleet.switch(entry.profileId || id);
    state.status = result;
    state.connected = true;
    state.demo = Boolean(result.demo);
    state.pollErrors = 0;
    toast(`Connecté à ${result.identity || entry.name}`, "success");
    await refreshDashboard();
    startPolling();
    await loadFleet();
  } catch (error) {
    let stillConnected = false;
    try {
      stillConnected = Boolean((await api.router.status()).connected);
    } catch {
      stillConnected = false;
    }
    if (!stillConnected) leaveApp();
    toast(error.message, "error", 7000);
  }
}

async function addFleetRouter() {
  const confirmed = await askConfirm({
    title: "Ajouter un routeur au parc ?",
    text: "La session actuelle sera fermée pour revenir à l'écran de connexion. Cochez « Mémoriser » lors de la connexion pour enregistrer le routeur dans le parc.",
    ok: "Continuer",
  });
  if (!confirmed) return;
  leaveApp();
  $("#conn-host").focus();
}

function wireFleet() {
  $("#fleet-search").addEventListener("input", (event) => {
    state.fleetQuery = event.target.value;
    renderFleet();
  });
  $("#fleet-refresh").addEventListener("click", () => loadFleet(true));
  $("#fleet-probe-all").addEventListener("click", probeFleet);
  $("#fleet-add").addEventListener("click", addFleetRouter);
  $("#fleet-empty-add").addEventListener("click", addFleetRouter);
  $("#fleet-compare-clear").addEventListener("click", () => {
    state.fleetCompare = [];
    renderFleet();
  });
  $("#fleet-grid").addEventListener("change", (event) => {
    const input = event.target.closest("[data-fleet-compare]");
    if (!input) return;
    const id = input.dataset.fleetCompare;
    if (input.checked) {
      if (!state.fleetCompare.includes(id)) state.fleetCompare.push(id);
      if (state.fleetCompare.length > 2) state.fleetCompare = state.fleetCompare.slice(-2);
    } else {
      state.fleetCompare = state.fleetCompare.filter((value) => value !== id);
    }
    renderFleet();
  });
  $("#fleet-grid").addEventListener("click", (event) => {
    const probe = event.target.closest("[data-fleet-probe]");
    if (probe) {
      probeFleetEntry(probe.dataset.fleetProbe);
      return;
    }
    const swap = event.target.closest("[data-fleet-switch]");
    if (swap) switchFleetRouter(swap.dataset.fleetSwitch);
  });
}

/* ============================================================
   Terminal RouterOS
   ============================================================ */

function terminalContext() {
  if (!state.status || !state.status.connected) return "Routeur connecté";
  const identity = state.status.identity || "MikroTik";
  const host = state.status.host ? ` · ${state.status.host}` : "";
  return `${identity}${host}${state.demo ? " · mode démonstration" : ""}`;
}

function terminalCell(value) {
  const text = String(value === undefined || value === null ? "" : value);
  const short = text.length > 160 ? `${text.slice(0, 157)}…` : text;
  return `<span title="${escapeHtml(text)}">${escapeHtml(short)}</span>`;
}

function terminalColumns(rows) {
  const keys = [];
  rows.slice(0, 25).forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (!keys.includes(key)) keys.push(key);
    });
  });
  return keys.slice(0, 12);
}

function terminalTableHtml(block) {
  const rows = Array.isArray(block.rows) ? block.rows : [];
  const normalized = rows.map((row) => (row && typeof row === "object" && !Array.isArray(row) ? row : { valeur: row }));
  const columns = terminalColumns(normalized);
  const visible = normalized.slice(0, 100);
  if (!columns.length) return '<div class="term-line term-info">Commande exécutée — aucune ligne renvoyée.</div>';
  const head = columns.map((key) => `<th>${escapeHtml(key)}</th>`).join("");
  const body = visible
    .map((row) => `<tr>${columns.map((key) => `<td class="term-cell">${terminalCell(row[key])}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="term-table-wrap">
    <table class="term-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <div class="term-table-foot">${formatNumber(normalized.length)} ligne(s)${
      normalized.length > visible.length ? ` · ${formatNumber(normalized.length - visible.length)} supplémentaire(s) masquée(s)` : ""
    }</div>
  </div>`;
}

function terminalBlockHtml(block) {
  if (block.type === "command") {
    return `<div class="term-line term-command"><span class="term-prefix">›</span><code>${escapeHtml(block.text)}</code>${
      block.badge ? `<span class="chip ${block.badge.tone || ""}">${escapeHtml(block.badge.label)}</span>` : ""
    }</div>`;
  }
  if (block.type === "table") return terminalTableHtml(block);
  if (block.type === "text") {
    const lines = String(block.text || "").split("\n");
    const visible = lines.slice(0, 300).join("\n");
    return `<pre class="term-text">${escapeHtml(visible)}${
      lines.length > 300 ? `\n… ${formatNumber(lines.length - 300)} ligne(s) supplémentaire(s)` : ""
    }</pre>`;
  }
  if (block.type === "error") {
    return `<div class="term-line term-error"><span class="term-prefix">✗</span><span>${escapeHtml(block.text)}</span></div>`;
  }
  return `<div class="term-line term-info"><span class="term-prefix">·</span><span>${escapeHtml(block.text)}</span></div>`;
}

function renderTerminalConsole() {
  const output = $("#terminal-output");
  if (!output) return;
  if (!state.terminalBlocks.length) {
    output.innerHTML = `<div class="terminal-empty">
      <svg><use href="#i-terminal"/></svg>
      <strong>Console prête</strong>
      <span>Tapez une commande RouterOS terminée par <code>print</code>, ou choisissez un exemple ci-dessous.</span>
    </div>`;
    return;
  }
  output.innerHTML = state.terminalBlocks.map(terminalBlockHtml).join("");
  output.scrollTop = output.scrollHeight;
}

function appendTerminal(block) {
  state.terminalBlocks.push(block);
  if (state.terminalBlocks.length > 24) state.terminalBlocks = state.terminalBlocks.slice(-24);
  renderTerminalConsole();
}

function pushTerminalRecall(command) {
  state.terminalRecall = [command, ...state.terminalRecall.filter((item) => item !== command)].slice(0, 120);
}

function renderTerminalHistory() {
  const list = state.terminalHistory;
  $("#terminal-history-count").textContent = String(list.length);
  $("#terminal-history-empty").hidden = list.length > 0;
  $("#terminal-history").innerHTML = list
    .map((entry) => {
      const failed = entry.status === "error";
      return `<button type="button" class="terminal-history-item ${failed ? "is-error" : ""}" data-terminal-recall="${escapeHtml(
        entry.command
      )}" title="Rejouer cette commande">
        <span class="terminal-history-ico"><svg><use href="#${failed ? "i-alert" : "i-check"}"/></svg></span>
        <span class="terminal-history-body">
          <code>${escapeHtml(entry.command)}</code>
          <span>${escapeHtml(formatDate(entry.at))} · ${
        entry.mode === "write" ? "modification · " : ""
      }${formatNumber(entry.rows || 0)} ligne(s) · ${formatNumber(entry.duration || 0)} ms</span>
          ${failed && entry.detail ? `<span class="terminal-history-error">${escapeHtml(entry.detail)}</span>` : ""}
        </span>
      </button>`;
    })
    .join("");
}

async function loadTerminalHistory() {
  try {
    state.terminalHistory = await api.terminal.history();
    state.terminalRecall = state.terminalHistory.map((entry) => entry.command);
    renderTerminalHistory();
  } catch {
    /* l'historique est facultatif */
  }
}

async function loadTerminal(notify = false) {
  $("#terminal-subtitle").textContent = terminalContext();
  if (!state.terminalWelcome) {
    state.terminalWelcome = true;
    appendTerminal({
      type: "info",
      text: `Connecté à ${terminalContext()}. Les commandes print sont en lecture seule ; les modifications demandent une confirmation.`,
    });
  }
  await loadTerminalHistory();
  renderTerminalConsole();
  const input = $("#terminal-input");
  if (input && !state.terminalBusy) input.focus();
  if (notify) toast("Terminal prêt", "success", 2000);
}

function terminalHistoryStep(direction) {
  if (!state.terminalRecall.length) return;
  if (direction < 0) {
    state.terminalIndex = Math.min(state.terminalRecall.length - 1, state.terminalIndex + 1);
  } else {
    state.terminalIndex = Math.max(-1, state.terminalIndex - 1);
  }
  $("#terminal-input").value =
    state.terminalIndex >= 0 ? state.terminalRecall[state.terminalIndex] || "" : "";
}

function terminalSetState(label, tone) {
  const chip = $("#terminal-state");
  if (!chip) return;
  chip.textContent = label;
  chip.className = `chip ${tone || ""}`.trim();
}

async function executeTerminalCommand() {
  if (state.terminalBusy) return;
  const input = $("#terminal-input");
  const command = input.value.trim();
  if (!command) {
    input.focus();
    return;
  }

  let info;
  try {
    info = await api.terminal.check(command);
  } catch (error) {
    const message = ipcMessage(error);
    appendTerminal({ type: "command", text: command });
    appendTerminal({ type: "error", text: message });
    toast(message, "error", 5000);
    return;
  }

  if (info.mode === "write") {
    const confirmed = await askConfirm({
      title: info.destructive ? "Commande destructive sur le routeur" : "Modifier la configuration du routeur",
      text: `Commande : ${info.command}\n\n${
        info.destructive
          ? "Cette opération peut supprimer des éléments ou interrompre le service. Elle sera immédiatement appliquée."
          : "Cette opération modifie la configuration active du routeur."
      } Elle sera tracée dans le journal d'audit.`,
      ok: info.destructive ? "Exécuter quand même" : "Exécuter",
    });
    if (!confirmed) {
      input.focus();
      return;
    }
  }

  pushTerminalRecall(info.command);
  state.terminalIndex = -1;
  appendTerminal({
    type: "command",
    text: info.command,
    badge: info.mode === "write" ? { label: info.destructive ? "destructive" : "modification", tone: info.destructive ? "danger" : "warn" } : null,
  });
  input.value = "";

  const button = $("#terminal-run");
  setBusy(button, true);
  state.terminalBusy = true;
  terminalSetState("En cours", "warn");
  try {
    const result = await api.terminal.run({ command, confirm: info.mode === "write" });
    if (result.text) appendTerminal({ type: "text", text: result.text });
    else if (Array.isArray(result.rows) && result.rows.length) appendTerminal({ type: "table", rows: result.rows });
    else appendTerminal({ type: "info", text: "Commande exécutée — aucune ligne renvoyée." });
    terminalSetState("Prêt", "ok");
    if (result.mode === "write") {
      toast("Commande exécutée et journalisée", "success", 3500);
      refreshDashboard(true);
    }
    await loadTerminalHistory();
  } catch (error) {
    const message = ipcMessage(error);
    appendTerminal({ type: "error", text: message });
    terminalSetState("Erreur", "danger");
    toast(message, "error", 6000);
    await loadTerminalHistory();
  } finally {
    state.terminalBusy = false;
    setBusy(button, false);
    input.focus();
  }
}

function clearTerminalConsole() {
  state.terminalBlocks = [];
  state.terminalWelcome = true;
  renderTerminalConsole();
  terminalSetState("Prêt", "");
  toast("Console effacée", "info", 2000);
}

async function clearTerminalHistory() {
  const confirmed = await askConfirm({
    title: "Vider l'historique du terminal ?",
    text: "Les commandes enregistrées sur cet ordinateur seront supprimées. Les journaux d'audit des modifications sont conservés.",
    ok: "Vider",
  });
  if (!confirmed) return;
  try {
    await api.terminal.clearHistory();
    state.terminalHistory = [];
    state.terminalRecall = [];
    state.terminalIndex = -1;
    renderTerminalHistory();
    toast("Historique du terminal vidé", "success", 2500);
  } catch (error) {
    toast(error.message, "error");
  }
}

function wireTerminal() {
  $("#terminal-form").addEventListener("submit", (event) => {
    event.preventDefault();
    executeTerminalCommand();
  });
  $("#terminal-input").addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      terminalHistoryStep(-1);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      terminalHistoryStep(1);
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === "l") {
      event.preventDefault();
      clearTerminalConsole();
    }
  });
  $("#terminal-clear").addEventListener("click", clearTerminalConsole);
  $("#terminal-history-clear").addEventListener("click", clearTerminalHistory);
  $("#terminal-suggestions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-terminal-suggest]");
    if (!button) return;
    const input = $("#terminal-input");
    input.value = button.dataset.terminalSuggest;
    input.focus();
  });
  $("#terminal-history").addEventListener("click", (event) => {
    const item = event.target.closest("[data-terminal-recall]");
    if (!item) return;
    const input = $("#terminal-input");
    input.value = item.dataset.terminalRecall || "";
    input.focus();
  });
}

/* ============================================================
   Alertes
   ============================================================ */

const ALERT_SEVERITIES = {
  critical: { label: "Critique", tone: "danger" },
  warn: { label: "Avertissement", tone: "warn" },
  info: { label: "Information", tone: "off" },
};

const ALERT_RULES = {
  cpu: "Processeur",
  memory: "Mémoire",
  disk: "Stockage",
  temperature: "Température",
  "packet-loss": "Perte de paquets",
  "interface-down": "Interface",
  "hotspot-expiry": "Hotspot",
};

function updateAlertBadge(unread) {
  const count = Math.max(0, Number(unread) || 0);
  const badge = $("#alerts-badge");
  const nav = $("#nav-alert-count");
  if (badge) {
    badge.hidden = count === 0;
    badge.textContent = count > 99 ? "99+" : String(count);
  }
  if (nav) {
    nav.textContent = count > 99 ? "99+" : String(count);
    nav.classList.toggle("is-zero", count === 0);
  }
}

function renderAlertRules() {
  const settings = state.alertSettings || {};
  $("#alert-enabled").checked = settings.enabled !== false;
  $("#alert-cpu").value = settings.cpu ?? 90;
  $("#alert-memory").value = settings.memory ?? 90;
  $("#alert-disk").value = settings.disk ?? 90;
  $("#alert-temperature").value = settings.temperature ?? 75;
  $("#alert-packetloss").value = settings.packetLoss ?? 40;
  $("#alert-hotspot").value = settings.hotspot ?? 5;
  $("#alert-cooldown").value = settings.cooldown ?? 10;
  $("#alert-desktop").checked = settings.desktop !== false;
}

function renderAlerts() {
  const filter = state.alertFilter;
  const list = state.alerts.filter((alert) => !filter || alert.severity === filter);
  const critical = state.alerts.filter((alert) => alert.severity === "critical").length;
  const warn = state.alerts.filter((alert) => alert.severity === "warn").length;

  $("#alerts-count").textContent = String(list.length);
  $("#alerts-subtitle").textContent = `${state.alerts.length} alerte(s) enregistrée(s) · ${critical} critique(s) · ${warn} avertissement(s)`;
  $("#alerts-empty").hidden = list.length > 0;
  $("#alerts-list").innerHTML = list
    .map((alert) => {
      const severity = ALERT_SEVERITIES[alert.severity] || ALERT_SEVERITIES.info;
      return `<article class="alert-item sev-${escapeHtml(alert.severity || "info")}">
        <span class="alert-ico"><svg><use href="#i-alert"/></svg></span>
        <div class="alert-body">
          <div class="alert-head">
            <strong>${escapeHtml(alert.title || "Alerte")}</strong>
            <span class="alert-time">${escapeHtml(formatDate(alert.at))}</span>
          </div>
          <p>${escapeHtml(alert.detail || "")}</p>
          <div class="alert-meta">
            <span class="pill ${severity.tone}">${severity.label}</span>
            <span>${escapeHtml(ALERT_RULES[alert.rule] || alert.rule || "Règle")}</span>
            ${alert.identity ? `<span>${escapeHtml(alert.identity)}</span>` : ""}
          </div>
        </div>
      </article>`;
    })
    .join("");
  $("#alerts-foot").textContent =
    list.length === state.alerts.length
      ? `${formatNumber(state.alerts.length)} alerte(s)`
      : `${formatNumber(list.length)} alerte(s) affichée(s) sur ${formatNumber(state.alerts.length)}`;
}

async function loadAlertState() {
  try {
    const summary = await api.alerts.summary();
    state.alerts = summary.alerts || [];
    state.alertSettings = summary.settings || state.alertSettings;
    state.alertsSeenAt = null;
    updateAlertBadge(summary.unread || 0);
  } catch {
    /* les alertes ne bloquent pas la connexion */
  }
}

async function loadAlerts(notify = false) {
  try {
    const [summary, settings] = await Promise.all([api.alerts.summary(), api.settings.get()]);
    state.alerts = summary.alerts || [];
    state.settings = settings;
    state.alertSettings = settings.alerts || summary.settings;
    renderAlerts();
    renderAlertRules();
    if (summary.unread) {
      const updated = await api.alerts.ack();
      state.alertsSeenAt = updated.alertsSeenAt || null;
    }
    updateAlertBadge(0);
    if (notify) toast("Alertes actualisées", "success", 2000);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function evaluateAlerts(metrics) {
  try {
    const summary = await api.alerts.evaluate(metrics || {});
    state.alerts = summary.alerts || state.alerts;
    if (summary.settings) state.alertSettings = { ...(state.alertSettings || {}), ...summary.settings };
    updateAlertBadge(summary.unread || 0);
    (summary.raised || []).forEach((alert) => {
      toast(`${alert.title} — ${alert.detail}`, alert.severity === "critical" ? "error" : "warn", 7000);
    });
    if (state.screen === "alerts") {
      renderAlerts();
      renderAlertRules();
    }
  } catch {
    /* la supervision ne doit jamais interrompre l'actualisation */
  }
}

async function saveAlertSettings() {
  const button = $("#alerts-save");
  setBusy(button, true);
  try {
    const payload = {
      enabled: $("#alert-enabled").checked,
      cpu: Number($("#alert-cpu").value),
      memory: Number($("#alert-memory").value),
      disk: Number($("#alert-disk").value),
      temperature: Number($("#alert-temperature").value),
      packetLoss: Number($("#alert-packetloss").value),
      hotspot: Number($("#alert-hotspot").value),
      cooldown: Number($("#alert-cooldown").value),
      desktop: $("#alert-desktop").checked,
    };
    const settings = await api.settings.update({ alerts: payload });
    state.settings = settings;
    state.alertSettings = settings.alerts;
    renderAlertRules();
    toast("Seuils d'alerte enregistrés", "success", 3000);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

async function clearAlerts() {
  const confirmed = await askConfirm({
    title: "Vider l'historique des alertes ?",
    text: "Toutes les alertes enregistrées sur cet ordinateur seront supprimées. La surveillance reste active.",
    ok: "Vider",
  });
  if (!confirmed) return;
  try {
    await api.alerts.clear();
    state.alerts = [];
    renderAlerts();
    updateAlertBadge(0);
    toast("Historique des alertes vidé", "success", 2500);
  } catch (error) {
    toast(error.message, "error");
  }
}

function wireAlerts() {
  $("#alerts-filter").addEventListener("change", (event) => {
    state.alertFilter = event.target.value;
    renderAlerts();
  });
  $("#alerts-refresh").addEventListener("click", () => loadAlerts(true));
  $("#alerts-clear").addEventListener("click", clearAlerts);
  $("#alerts-save").addEventListener("click", saveAlertSettings);
}

/* ============================================================
   Paramètres
   ============================================================ */

function renderSettings() {
  if (!state.connected) return;
  const status = state.status || {};
  const info = state.appInfo || {};
  $("#set-mode").textContent = state.demo ? "Démonstration" : "API RouterOS";
  $("#set-identity").textContent = status.identity || "—";
  $("#set-host").textContent = state.demo ? "Routeur simulé" : status.host || "—";
  $("#set-user").textContent = status.username || "—";
  $("#set-port").textContent = `${status.port || "—"}${status.tls ? " · SSL" : ""}`;
  $("#set-version").textContent = status.version || "—";
  $("#set-since").textContent = formatDate(status.connectedAt);

  $("#set-poll").value = String(state.settings.pollInterval || 3000);
  $$(".accent-swatch").forEach((swatch) => {
    swatch.classList.toggle("is-active", swatch.dataset.accent === state.settings.accent);
  });
  $$("[data-theme-choice]").forEach((button) => {
    const active = button.dataset.themeChoice === (state.settings.theme || "dark");
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  syncThemeToggle();
  $("#set-encryption").textContent = info.encryptionAvailable ? "Chiffré (Windows)" : "Base64 (local)";
  $("#set-encryption").className = `chip ${info.encryptionAvailable ? "ok" : "warn"}`;

  if (state.appInfo) {
    $("#about-version").textContent = state.appInfo.version;
    $("#about-electron").textContent = state.appInfo.electron || "—";
    $("#about-chrome").textContent = state.appInfo.chrome || "—";
    $("#about-node").textContent = state.appInfo.node || "—";
    $("#about-platform").textContent = `${state.appInfo.platform || ""} ${state.appInfo.arch || ""}`.trim() || "—";
    $("#about-data").textContent = state.appInfo.userData || "—";
    $("#about-data").title = state.appInfo.userData || "";
    $("#sidebar-version-label").textContent = `MikroDesk ${state.appInfo.version}`;
  }
}

function renderSavedProfiles() {
  const container = $("#saved-profiles");
  if (!state.profilesList.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding:26px 12px">
        <svg><use href="#i-save"/></svg>
        <strong>Aucun routeur enregistré</strong>
        <span>Ajoutez un profil pour retrouver vos connexions en un clic.</span>
      </div>`;
    return;
  }
  container.innerHTML = state.profilesList
    .map(
      (profile) => `
      <div class="saved-item">
        <span class="saved-ico"><svg><use href="#i-router"/></svg></span>
        <div class="saved-info">
          <strong>${escapeHtml(profile.name)}</strong>
          <span>${escapeHtml(profile.host)}:${escapeHtml(profile.port)} · ${escapeHtml(profile.username || "—")}${
            profile.encrypted ? " · chiffré" : ""
          }</span>
        </div>
        <div class="saved-actions">
          <button class="row-btn accent" data-use-profile="${escapeHtml(profile.id)}" title="Utiliser ce profil">
            <svg><use href="#i-link"/></svg>
          </button>
          <button class="row-btn" data-edit-profile="${escapeHtml(profile.id)}" title="Modifier">
            <svg><use href="#i-edit"/></svg>
          </button>
          <button class="row-btn danger" data-delete-profile="${escapeHtml(profile.id)}" title="Supprimer">
            <svg><use href="#i-trash"/></svg>
          </button>
        </div>
      </div>`
    )
    .join("");
}

function openProfileModal(profile) {
  state.editingProfile = profile || null;
  $("#modal-profile-title").textContent = profile ? "Modifier le profil" : "Nouveau routeur";
  $("#pr-name").value = profile ? profile.name : "";
  $("#pr-host").value = profile ? profile.host : "";
  $("#pr-port").value = profile ? profile.port : 8728;
  $("#pr-username").value = profile ? profile.username : "";
  $("#pr-password").value = "";
  $("#pr-password").placeholder = profile && profile.hasSecret ? "Laisser vide pour conserver" : "••••••••";
  $("#pr-tls").checked = Boolean(profile && profile.tls);
  $("#pr-password").disabled = false;
  $("#profile-error").hidden = true;
  openModal("profile");
  window.setTimeout(() => $("#pr-host").focus(), 80);
}

async function saveProfile(event) {
  event.preventDefault();
  const payload = {
    id: state.editingProfile ? state.editingProfile.id : undefined,
    name: $("#pr-name").value.trim() || $("#pr-host").value.trim(),
    host: $("#pr-host").value.trim(),
    port: Number($("#pr-port").value) || 8728,
    username: $("#pr-username").value.trim(),
    tls: $("#pr-tls").checked,
    password: $("#pr-password").value,
  };
  const errorBox = $("#profile-error");
  errorBox.hidden = true;
  const button = $("#profile-save");
  setBusy(button, true);
  try {
    await api.profiles.save(payload);
    closeModal();
    toast("Profil enregistré", "success");
    await loadProfiles();
    renderSavedProfiles();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    setBusy(button, false);
  }
}

async function saveSetting(patch) {
  try {
    state.settings = await api.settings.update(patch);
    applyAccent(state.settings.accent);
    if (patch.theme) applyTheme(state.settings.theme);
    if (patch.pollInterval) startPolling();
    renderSettings();
  } catch (error) {
    toast(error.message, "error");
  }
}

function applyAccent(accent) {
  document.body.dataset.accent = accent || "cyan";
}

function currentTheme() {
  return document.body.dataset.theme === "light" ? "light" : "dark";
}

function applyTheme(theme) {
  const value = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = value;
  syncThemeToggle();
  // Les graphiques lisent leurs couleurs dans les variables CSS : on les redessine.
  renderTrafficChart();
  renderMonitorChart();
  drawSparkline("spark-rx", state.traffic.rx, getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#22d3ee");
  drawSparkline("spark-tx", state.traffic.tx, getComputedStyle(document.body).getPropertyValue("--violet").trim() || "#a78bfa");
}

function syncThemeToggle() {
  const button = $("#theme-toggle");
  if (!button) return;
  const light = currentTheme() === "light";
  const icon = button.querySelector("use");
  if (icon) icon.setAttribute("href", light ? "#i-moon" : "#i-sun");
  const label = light ? "Passer au thème sombre" : "Passer au thème clair";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.dataset.theme = light ? "light" : "dark";
}

async function toggleTheme() {
  await saveSetting({ theme: currentTheme() === "light" ? "dark" : "light" });
  toast(currentTheme() === "light" ? "Thème clair activé" : "Thème sombre activé", "info", 2200);
}

async function disconnect() {
  if (state.connected) {
    const confirmed = await askConfirm({
      title: "Se déconnecter du routeur ?",
      text: "La supervision sera interrompue. Vos données enregistrées restent intactes.",
      ok: "Se déconnecter",
    });
    if (!confirmed) return;
  }
  try {
    await api.router.disconnect();
  } catch {
    /* ignore */
  }
  leaveApp();
  toast("Déconnecté du routeur", "info", 3000);
  loadProfiles();
}

function wireSettings() {
  $("#set-poll").addEventListener("change", (event) => saveSetting({ pollInterval: Number(event.target.value) }));
  $$(".accent-swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => saveSetting({ accent: swatch.dataset.accent }));
  });
  $$("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => saveSetting({ theme: button.dataset.themeChoice }));
  });
  const themeToggle = $("#theme-toggle");
  if (themeToggle) themeToggle.addEventListener("click", toggleTheme);
  $("#settings-add-profile").addEventListener("click", () => openProfileModal(null));
  $("#profile-form").addEventListener("submit", saveProfile);

  $("#saved-profiles").addEventListener("click", async (event) => {
    const use = event.target.closest("[data-use-profile]");
    const edit = event.target.closest("[data-edit-profile]");
    const remove = event.target.closest("[data-delete-profile]");
    if (use) {
      const profile = state.profilesList.find((item) => item.id === use.dataset.useProfile);
      if (!profile) return;
      if (state.connected) {
        const confirmed = await askConfirm({
          title: "Changer de routeur ?",
          text: `La session actuelle sera remplacée par « ${profile.name} ».`,
          ok: "Continuer",
        });
        if (!confirmed) return;
        await api.router.disconnect().catch(() => {});
        leaveApp();
      }
      fillProfile(profile);
      setConnectMode("live");
      toast(`Profil « ${profile.name} » prêt à la connexion`, "info", 3200);
    } else if (edit) {
      const profile = state.profilesList.find((item) => item.id === edit.dataset.editProfile);
      if (profile) openProfileModal(profile);
    } else if (remove) {
      const profile = state.profilesList.find((item) => item.id === remove.dataset.deleteProfile);
      if (!profile) return;
      const confirmed = await askConfirm({
        title: "Supprimer ce profil ?",
        text: `« ${profile.name} » et son mot de passe enregistré seront supprimés de ce poste.`,
        ok: "Supprimer",
      });
      if (!confirmed) return;
      try {
        await api.profiles.remove(profile.id);
        toast("Profil supprimé", "success");
        await loadProfiles();
        renderSavedProfiles();
      } catch (error) {
        toast(error.message, "error");
      }
    }
  });

  $("#settings-reboot").addEventListener("click", async () => {
    const confirmed = await askConfirm({
      title: "Redémarrer le routeur ?",
      text: "Toutes les connexions (hotspot, PPP, VPN) seront coupées pendant le redémarrage. Cette action est immédiate.",
      ok: "Redémarrer",
    });
    if (!confirmed) return;
    try {
      await api.router.reboot();
      leaveApp();
      toast("Routeur en cours de redémarrage…", "warn", 7000);
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

/* ============================================================
   Modales
   ============================================================ */

function openModal(name) {
  const layer = $("#modal-layer");
  layer.hidden = false;
  document.body.classList.add("modal-open");
  $$(".modal", layer).forEach((modal) => {
    modal.hidden = modal.id !== `modal-${name}`;
  });
  $$("[data-close-modal]").forEach((button) => {
    button.onclick = () => closeModal();
  });
}

function closeModal() {
  $("#modal-layer").hidden = true;
  $$(".modal").forEach((modal) => {
    modal.hidden = true;
  });
  document.body.classList.remove("modal-open");
  if (state.confirmResolver) {
    const resolver = state.confirmResolver;
    state.confirmResolver = null;
    resolver(false);
  }
}

function askConfirm({ title, text, ok = "Confirmer" }) {
  $("#confirm-title").textContent = title;
  $("#confirm-text").textContent = text;
  $("#confirm-ok").textContent = ok;
  openModal("confirm");
  return new Promise((resolve) => {
    state.confirmResolver = resolve;
  });
}

function wireModals() {
  $("#confirm-ok").addEventListener("click", () => {
    const resolver = state.confirmResolver;
    state.confirmResolver = null;
    $("#modal-layer").hidden = true;
    $$(".modal").forEach((modal) => {
      modal.hidden = true;
    });
    document.body.classList.remove("modal-open");
    if (resolver) resolver(true);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#modal-layer").hidden) closeModal();
  });

  $$("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closeModal);
  });
}

/* ============================================================
   Démarrage
   ============================================================ */

async function loadAppInfo() {
  try {
    state.appInfo = await api.app.info();
  } catch {
    state.appInfo = null;
  }
  if (state.appInfo) {
    $("#about-version").textContent = state.appInfo.version;
    $("#sidebar-version-label").textContent = `MikroDesk ${state.appInfo.version}`;
  }
}

function wireConnect() {
  $$(".segmented-item").forEach((button) => {
    button.addEventListener("click", () => setConnectMode(button.dataset.connectMode));
  });
  $("#connect-form").addEventListener("submit", submitConnect);
  $("#toggle-password").addEventListener("click", () => {
    const input = $("#conn-password");
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    $("#toggle-password").innerHTML = `<svg><use href="#${showing ? "i-eye" : "i-eye-off"}"/></svg>`;
  });
  $("#conn-tls").addEventListener("change", (event) => {
    const port = $("#conn-port");
    if (event.target.checked && port.value === "8728") port.value = "8729";
    if (!event.target.checked && port.value === "8729") port.value = "8728";
  });
  ["#conn-host", "#conn-username", "#conn-password", "#conn-port", "#conn-tls"].forEach((selector) => {
    const input = $(selector);
    input.addEventListener("input", () => {
      hideConnectError();
      state.selectedProfileId = null;
      $$(".profile-chip").forEach((chip) => chip.classList.remove("is-active"));
    });
    input.addEventListener("change", () => {
      hideConnectError();
    });
  });
}

async function init() {
  wireWindow();
  wireConnect();
  wireNavigation();
  wireUsers();
  wireActive();
  wireProfiles();
  wireVouchers();
  wireHosts();
  wireBindings();
  wireCookies();
  wireQuickPrint();
  wireDhcp();
  wireMonitor();
  wireReport();
  wireGenerate();
  wirePpp();
  wirePppActive();
  wireInterfaces();
  wireNetwork();
  wireLogs();
  wireDiagnostics();
  wireSecurity();
  wireBackups();
  wireAudit();
  wireAlerts();
  wireFleet();
  wireTerminal();
  wireSettings();
  wireModals();
  startClock();

  try {
    state.settings = await api.settings.get();
  } catch {
    state.settings = { pollInterval: 3000, accent: "cyan", theme: "dark", sidebarCollapsed: false };
  }
  applyAccent(state.settings.accent);
  applyTheme(state.settings.theme);

  await loadAppInfo();
  await loadProfiles();
  renderVoucherProfileOptions();

  window.addEventListener("resize", () => {
    renderTrafficChart();
    renderMonitorChart();
    drawSparkline("spark-rx", state.traffic.rx, getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#22d3ee");
    drawSparkline("spark-tx", state.traffic.tx, getComputedStyle(document.body).getPropertyValue("--violet").trim() || "#a78bfa");
  });

  try {
    const status = await api.router.status();
    if (status && status.connected) {
      state.status = status;
      state.connected = true;
      state.demo = Boolean(status.demo);
      enterApp();
      await refreshDashboard();
      startPolling();
      navigate("dashboard");
    }
  } catch {
    /* aucun routeur connecté */
  }
}

document.addEventListener("DOMContentLoaded", init);
