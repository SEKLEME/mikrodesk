"use strict";

const { RouterOSAPI } = require("node-routeros");
const {
  assertChoice,
  normalizeBytes,
  normalizeDuration,
  normalizeMac,
  normalizeText,
  parseBytes,
  parseDuration,
  resolveChoice,
  resolveProfile,
  validateComment,
  validateHost,
  validateIP,
  validateName,
} = require("./validate");

const CHARSET = "23456789abcdefghjkmnpqrstuvwxyz";
const PASSWORD_CHARS = "23456789";

const PPP_SERVICES = ["any", "pppoe", "l2tp", "pptp", "sstp", "ovpn"];
const BINDING_TYPES = ["regular", "bypassed", "blocked"];

function randomString(length, alphabet) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function text(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function bool(value) {
  return value === true || value === "true" || value === "yes";
}

function sameDuration(left, right) {
  try {
    return parseDuration(left) === parseDuration(right);
  } catch {
    return text(left) === text(right);
  }
}

function sameBytes(left, right) {
  try {
    return parseBytes(left) === parseBytes(right);
  } catch {
    return text(left) === text(right);
  }
}

function validateAddressOrPool(value, label) {
  const raw = normalizeText(value);
  if (!raw) return "";
  if (raw.includes(".") || raw.includes(":")) return validateIP(raw, label, { optional: true });
  return validateName(raw, label, { max: 64, optional: true });
}

function parsePingTime(value) {
  const raw = text(value).toLowerCase();
  const match = raw.match(/([\d.]+)\s*(ms|us|s)/);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  if (match[2] === "ms") return amount;
  if (match[2] === "us") return amount / 1000;
  return amount * 1000;
}

function friendlyError(error) {
  const raw = error && error.message ? error.message : String(error || "");
  const lower = raw.toLowerCase();
  if (lower.includes("cannot log in") || lower.includes("invalid user name or password")) {
    return "Identifiants refusés par le routeur. Vérifiez l'utilisateur, le mot de passe et les droits API.";
  }
  if (lower.includes("not enough permissions") || lower.includes("not permitted")) {
    return "L'utilisateur API n'a pas les droits nécessaires pour cette action.";
  }
  if (lower.includes("does not match any value of profile")) {
    return "Le profil sélectionné n'existe pas (ou plus) sur le routeur. Actualisez la liste des profils puis réessayez.";
  }
  if (lower.includes("does not match any value of server")) {
    return "Le serveur hotspot sélectionné n'existe pas (ou plus) sur le routeur. Actualisez la liste des serveurs puis réessayez.";
  }
  const field = raw.match(/does not match any value of ([\w-]+)/i);
  if (field) {
    return `La valeur fournie pour « ${field[1]} » n'existe pas sur le routeur. Vérifiez les valeurs disponibles.`;
  }
  if (lower.includes("invalid mac address") || lower.includes("invalid mac-address")) {
    return "Adresse MAC refusée par le routeur. Utilisez le format AA:BB:CC:DD:EE:FF.";
  }
  if (lower.includes("invalid ip address") || lower.includes("invalid address")) {
    return "Adresse IP refusée par le routeur. Vérifiez le format et le masque CIDR éventuel.";
  }
  if (lower.includes("invalid value for argument") || lower.includes("expected end of command") || lower.includes("syntax error")) {
    return `Valeur refusée par RouterOS. Vérifiez le format des champs (durée, taille, adresse…). Détail : ${raw}`;
  }
  if (lower.includes("already have") || lower.includes("already exists") || lower.includes("duplicate")) {
    return "Cet élément existe déjà sur le routeur.";
  }
  if (lower.includes("no such item")) {
    return "Élément introuvable : il a peut-être été supprimé depuis le routeur.";
  }
  if (lower.includes("no such command") || lower.includes("bad command name")) {
    return "Commande non disponible sur cette version de RouterOS (paquet ou menu absent).";
  }
  if (lower.includes("econnrefused")) {
    return "Connexion refusée. L'API RouterOS est-elle activée sur ce port ? (IP > Services > api / api-ssl)";
  }
  if (lower.includes("etimedout") || lower.includes("timeout")) {
    return "Le routeur ne répond pas. Vérifiez l'adresse IP, le port et le pare-feu.";
  }
  if (lower.includes("enotfound")) {
    return "Adresse introuvable. Vérifiez l'adresse IP ou le nom d'hôte du routeur.";
  }
  if (lower.includes("ehostunreach") || lower.includes("econnreset")) {
    return "Routeur injoignable. Vérifiez le réseau et que l'API est bien accessible.";
  }
  if (lower.startsWith("failure:") || lower.startsWith("!trap")) {
    return `RouterOS a refusé l'opération : ${raw.replace(/^!?failure:\s*/i, "").replace(/^!trap\s*/i, "")}`;
  }
  return raw || "Erreur inconnue du routeur.";
}

class RouterOSAdapter {
  constructor(config) {
    this.mode = "live";
    this.config = config;
    this.api = null;
    this.identity = "MikroTik";
    this.version = "";
    this.board = "";
    this.architecture = "";
    this.prevInterfaces = new Map();
    this.prevAt = 0;
    this.counts = {
      hotspotUsers: 0,
      hotspotActive: 0,
      hotspotProfiles: 0,
      pppSecrets: 0,
      pppActive: 0,
      logs: [],
    };
    this.countsAt = 0;
  }

  async connect() {
    const config = this.config;
    const options = {
      host: config.host,
      user: config.username || "admin",
      password: config.password || "",
      port: Number(config.port) || (config.tls ? 8729 : 8728),
      timeout: 10,
      keepalive: true,
    };
    if (config.tls) {
      options.tls = { rejectUnauthorized: false };
    }

    this.api = new RouterOSAPI(options);
    this.api.on("error", () => {
      /* évite un crash sur événement non capté ; les erreurs de commande remontent via les promesses */
    });

    try {
      await this.api.connect();
      const identity = await this.print("/system/identity/print");
      if (!identity.length) throw new Error("Le routeur n'a renvoyé aucune identité.");
      this.identity = text(identity[0].name, "MikroTik");
      const resource = await this.print("/system/resource/print");
      if (resource.length) {
        this.version = text(resource[0].version);
        this.board = text(resource[0]["board-name"]);
        this.architecture = text(resource[0]["architecture-name"]);
      }
    } catch (error) {
      await this.close().catch(() => {});
      throw new Error(friendlyError(error));
    }
    return true;
  }

  async close() {
    if (this.api) {
      try {
        this.api.close();
      } catch {
        /* ignore */
      }
      this.api = null;
    }
    return true;
  }

  async command(path, params = []) {
    if (!this.api) throw new Error("Non connecté au routeur.");
    try {
      return await this.api.write(path, params);
    } catch (error) {
      throw new Error(friendlyError(error));
    }
  }

  async print(path, params = []) {
    const result = await this.command(path, params);
    return Array.isArray(result) ? result : [];
  }

  normalizeInterface(row, now) {
    const name = text(row.name);
    const rxByte = numeric(row["rx-byte"]);
    const txByte = numeric(row["tx-byte"]);
    const previous = this.prevInterfaces.get(name);
    const seconds = this.prevAt > 0 ? Math.max(0.2, (now - this.prevAt) / 1000) : 0;
    let rxRate = 0;
    let txRate = 0;
    if (previous && seconds > 0) {
      rxRate = Math.max(0, (rxByte - previous.rx) / seconds);
      txRate = Math.max(0, (txByte - previous.tx) / seconds);
    }
    return {
      id: text(row[".id"]),
      name,
      type: text(row.type, "ether"),
      running: bool(row.running),
      disabled: bool(row.disabled),
      rxByte,
      txByte,
      rxRate,
      txRate,
      mac: text(row["mac-address"]),
      comment: text(row.comment),
      mtu: numeric(row["actual-mtu"]) || numeric(row.mtu),
    };
  }

  async refreshCounts(force = false) {
    const now = Date.now();
    if (!force && now - this.countsAt < 12000) return this.counts;
    const [users, active, profiles, pppSecrets, pppActive, logs] = await Promise.all([
      this.print("/ip/hotspot/user/print"),
      this.print("/ip/hotspot/active/print"),
      this.print("/ip/hotspot/profile/print"),
      this.print("/ppp/secret/print"),
      this.print("/ppp/active/print"),
      this.print("/log/print"),
    ]);
    this.counts = {
      hotspotUsers: users.length,
      hotspotActive: active.length,
      hotspotProfiles: profiles.length,
      pppSecrets: pppSecrets.length,
      pppActive: pppActive.length,
      logs: logs.slice(0, 6).map((entry) => ({
        id: text(entry[".id"]),
        time: text(entry.time),
        topics: text(entry.topics),
        message: text(entry.message),
      })),
    };
    this.countsAt = now;
    return this.counts;
  }

  async getDashboard() {
    const resource = await this.print("/system/resource/print");
    const identity = await this.print("/system/identity/print");
    const interfaceRows = await this.print("/interface/print");
    const counts = await this.refreshCounts();
    const row = resource[0] || {};
    const now = Date.now();
    const interfaces = interfaceRows.map((iface) => this.normalizeInterface(iface, now));
    this.prevAt = now;
    interfaceRows.forEach((iface) => {
      const normalized = interfaces.find((item) => item.name === text(iface.name));
      if (normalized) {
        this.prevInterfaces.set(normalized.name, {
          rx: normalized.rxByte,
          tx: normalized.txByte,
        });
      }
    });

    const totalMemory = numeric(row["total-memory"]);
    const freeMemory = numeric(row["free-memory"]);
    const totalDisk = numeric(row["total-hdd-space"]);
    const freeDisk = numeric(row["free-hdd-space"]);
    const totalRx = interfaces.reduce((sum, iface) => sum + iface.rxRate, 0);
    const totalTx = interfaces.reduce((sum, iface) => sum + iface.txRate, 0);

    return {
      identity: text(identity[0] && identity[0].name, this.identity),
      version: text(row.version, this.version),
      board: text(row["board-name"], this.board),
      architecture: text(row["architecture-name"], this.architecture),
      uptime: text(row.uptime, "—"),
      uptimeSeconds: 0,
      cpuLoad: numeric(row["cpu-load"]),
      cpuCount: numeric(row["cpu-count"]),
      cpuFrequency: text(row["cpu-frequency"]),
      totalMemory,
      freeMemory,
      memoryUsage: totalMemory > 0 ? Math.round(((totalMemory - freeMemory) / totalMemory) * 100) : 0,
      totalDisk,
      freeDisk,
      diskUsage: totalDisk > 0 ? Math.round(((totalDisk - freeDisk) / totalDisk) * 100) : 0,
      temperature: numeric(row.temperature) || null,
      interfaces,
      totalRx,
      totalTx,
      hotspotUsers: counts.hotspotUsers,
      hotspotActive: counts.hotspotActive,
      hotspotProfiles: counts.hotspotProfiles,
      pppSecrets: counts.pppSecrets,
      pppActive: counts.pppActive,
      logs: counts.logs,
      demo: false,
    };
  }

  async listHotspotUsers() {
    const rows = await this.print("/ip/hotspot/user/print");
    this.counts.hotspotUsers = rows.length;
    this.countsAt = Date.now();
    return rows.map((row) => ({
      id: text(row[".id"]),
      name: text(row.name),
      password: text(row.password),
      profile: text(row.profile, "default"),
      server: text(row.server, "all"),
      comment: text(row.comment),
      disabled: bool(row.disabled),
      limitUptime: text(row["limit-uptime"], "0"),
      limitBytesTotal: text(row["limit-bytes-total"], "0"),
      bytesIn: numeric(row["bytes-in"]),
      bytesOut: numeric(row["bytes-out"]),
      uptime: text(row.uptime),
    }));
  }

  async saveHotspotUser(payload) {
    const input = payload || {};
    const [profiles, servers] = await Promise.all([this.listHotspotProfiles(), this.listHotspotServers()]);

    if (input.isNew) {
      const name = validateName(input.name, "Le nom d'utilisateur", { max: 64 });
      const profile = resolveProfile(input.profile, profiles, "profil hotspot");
      const server = this.resolveHotspotServer(input.server, servers);
      const comment = validateComment(input.comment, "Le commentaire");
      const limitUptime = normalizeDuration(input.limitUptime, "La limite de temps");
      const limitBytesTotal = normalizeBytes(input.limitBytesTotal, "La limite de données");
      const params = [
        `=name=${name}`,
        `=password=${text(input.password)}`,
        `=profile=${profile}`,
        `=comment=${comment}`,
        `=limit-uptime=${limitUptime}`,
        `=limit-bytes-total=${limitBytesTotal}`,
      ];
      if (server !== "all") params.push(`=server=${server}`);
      if (input.disabled) params.push("=disabled=yes");
      const result = await this.command("/ip/hotspot/user/add", params);
      this.countsAt = 0;
      return result;
    }

    if (!input.id) throw new Error("Identifiant de l'utilisateur manquant.");
    const current = (await this.listHotspotUsers()).find((user) => user.id === input.id);
    if (!current) {
      throw new Error("Utilisateur introuvable : il a peut-être été supprimé depuis le routeur.");
    }

    const params = [`=.id=${input.id}`];
    const name = validateName(input.name !== undefined ? input.name : current.name, "Le nom d'utilisateur", {
      max: 64,
    });
    if (name !== current.name) params.push(`=name=${name}`);

    if (input.password !== undefined && text(input.password) !== text(current.password)) {
      params.push(`=password=${text(input.password)}`);
    }

    if (normalizeText(input.profile)) {
      const profile = resolveProfile(input.profile, profiles, "profil hotspot");
      if (profile !== current.profile) params.push(`=profile=${profile}`);
    }

    if (input.server !== undefined) {
      const server = this.resolveHotspotServer(input.server, servers);
      if (server !== current.server) params.push(`=server=${server}`);
    }

    if (input.comment !== undefined) {
      const comment = validateComment(input.comment, "Le commentaire");
      if (comment !== current.comment) params.push(`=comment=${comment}`);
    }

    if (input.limitUptime !== undefined) {
      const limitUptime = normalizeDuration(input.limitUptime, "La limite de temps");
      if (!sameDuration(limitUptime, current.limitUptime)) params.push(`=limit-uptime=${limitUptime}`);
    }

    if (input.limitBytesTotal !== undefined) {
      const limitBytesTotal = normalizeBytes(input.limitBytesTotal, "La limite de données");
      if (!sameBytes(limitBytesTotal, current.limitBytesTotal)) params.push(`=limit-bytes-total=${limitBytesTotal}`);
    }

    if (input.disabled !== undefined && Boolean(input.disabled) !== current.disabled) {
      params.push(`=disabled=${input.disabled ? "yes" : "no"}`);
    }

    if (params.length === 1) return true;
    const result = await this.command("/ip/hotspot/user/set", params);
    this.countsAt = 0;
    return result;
  }

  resolveHotspotServer(value, servers) {
    const raw = normalizeText(value);
    if (!raw || raw.toLowerCase() === "all") return "all";
    return resolveChoice(
      raw,
      (servers || []).map((server) => server.name),
      "Le serveur hotspot"
    );
  }

  async removeHotspotUser(id) {
    await this.command("/ip/hotspot/user/remove", [`=.id=${id}`]);
    this.countsAt = 0;
    return true;
  }

  async toggleHotspotUser(id, disabled) {
    await this.command("/ip/hotspot/user/set", [`=.id=${id}`, `=disabled=${disabled ? "yes" : "no"}`]);
    this.countsAt = 0;
    return true;
  }

  async listActiveHotspot() {
    const rows = await this.print("/ip/hotspot/active/print");
    return rows.map((row) => ({
      id: text(row[".id"]),
      user: text(row.user),
      address: text(row.address),
      mac: text(row["mac-address"]),
      uptime: text(row.uptime),
      timeLeft: text(row["time-left"]),
      bytesIn: numeric(row["bytes-in"]),
      bytesOut: numeric(row["bytes-out"]),
      server: text(row.server),
      loginBy: text(row["login-by"]),
    }));
  }

  async kickHotspot(id) {
    await this.command("/ip/hotspot/active/remove", [`=.id=${id}`]);
    this.countsAt = 0;
    return true;
  }

  async listHotspotProfiles() {
    const rows = await this.print("/ip/hotspot/profile/print");
    return rows.map((row) => ({
      id: text(row[".id"]),
      name: text(row.name),
      rateLimit: text(row["rate-limit"]),
      sharedUsers: text(row["shared-users"]),
      sessionTimeout: text(row["session-timeout"]),
      idleTimeout: text(row["idle-timeout"]),
      loginBy: text(row["login-by"]),
    }));
  }

  async listHotspotServers() {
    const rows = await this.print("/ip/hotspot/print");
    return rows.map((row) => ({
      id: text(row[".id"]),
      name: text(row.name),
      interface: text(row.interface),
      addressPool: text(row["address-pool"]),
      profile: text(row.profile),
      disabled: bool(row.disabled),
    }));
  }

  async listPppProfiles() {
    const rows = await this.print("/ppp/profile/print");
    return rows.map((row) => ({
      id: text(row[".id"]),
      name: text(row.name),
      localAddress: text(row["local-address"]),
      remoteAddress: text(row["remote-address"]),
      rateLimit: text(row["rate-limit"]),
      onlyOne: text(row["only-one"]),
    }));
  }

  async createVouchers(options) {
    const input = options || {};
    const count = Math.max(1, Math.min(200, Number(input.count) || 1));
    const prefix = (input.prefix || "").trim();
    const userLength = Math.max(3, Math.min(12, Number(input.userLength) || 5));
    const passLength = Math.max(3, Math.min(12, Number(input.passLength) || 4));
    const [profiles, servers] = await Promise.all([this.listHotspotProfiles(), this.listHotspotServers()]);
    const profile = resolveProfile(input.profile, profiles, "profil hotspot");
    const server = this.resolveHotspotServer(input.server, servers);
    const limitUptime = normalizeDuration(input.limitUptime, "La limite de temps");
    const limitBytesTotal = normalizeBytes(input.limitBytesTotal, "La limite de données");
    const comment = validateComment(input.comment || "Voucher", "Le commentaire");
    const created = [];
    const errors = [];
    const existing = new Set((await this.listHotspotUsers()).map((user) => user.name));

    for (let i = 0; i < count; i += 1) {
      let name = prefix + randomString(userLength, CHARSET);
      let guard = 0;
      while (existing.has(name) && guard < 25) {
        name = prefix + randomString(userLength, CHARSET);
        guard += 1;
      }
      if (existing.has(name)) {
        errors.push({ name, error: "Collision de nom, voucher ignoré." });
        continue;
      }
      existing.add(name);
      const password = randomString(passLength, PASSWORD_CHARS);
      try {
        const params = [
          `=name=${name}`,
          `=password=${password}`,
          `=profile=${profile}`,
          `=comment=${comment}`,
          `=limit-uptime=${limitUptime}`,
          `=limit-bytes-total=${limitBytesTotal}`,
        ];
        if (server !== "all") params.push(`=server=${server}`);
        await this.command("/ip/hotspot/user/add", params);
        created.push({
          index: created.length + 1,
          name,
          password,
          profile,
          limitUptime,
          limitBytesTotal,
          comment,
          price: input.price || "",
        });
      } catch (error) {
        errors.push({ name, error: friendlyError(error) });
      }
    }

    this.countsAt = 0;
    return { created, errors, count: created.length, requested: count };
  }

  async generateHotspotUsers(options) {
    const input = options || {};
    const count = Math.max(1, Math.min(200, Number(input.count) || 1));
    const prefix = (input.prefix || "user-").trim();
    const start = Math.max(1, Number(input.start) || 1);
    const padding = Math.max(1, Math.min(4, Number(input.padding) || 2));
    const passwordMode = input.passwordMode || "random";
    const fixedPassword = input.password || "";
    const [profiles, servers] = await Promise.all([this.listHotspotProfiles(), this.listHotspotServers()]);
    const profile = resolveProfile(input.profile, profiles, "profil hotspot");
    const server = this.resolveHotspotServer(input.server, servers);
    const limitUptime = normalizeDuration(input.limitUptime, "La limite de temps");
    const limitBytesTotal = normalizeBytes(input.limitBytesTotal, "La limite de données");
    const comment = validateComment(input.comment || "Génération MikroDesk", "Le commentaire");
    const created = [];
    const errors = [];
    const existing = new Set((await this.listHotspotUsers()).map((user) => user.name));

    for (let i = 0; i < count; i += 1) {
      let number = start + i;
      let name = `${prefix}${String(number).padStart(padding, "0")}`;
      let guard = 0;
      while (existing.has(name) && guard < 500) {
        number += 1;
        name = `${prefix}${String(number).padStart(padding, "0")}`;
        guard += 1;
      }
      if (existing.has(name)) {
        errors.push({ name, error: "Collision de nom, utilisateur ignoré." });
        continue;
      }
      existing.add(name);
      let password;
      if (passwordMode === "same" && fixedPassword) password = fixedPassword;
      else if (passwordMode === "name") password = name;
      else password = randomString(Math.max(4, Number(input.passLength) || 4), PASSWORD_CHARS);

      try {
        const params = [
          `=name=${name}`,
          `=password=${password}`,
          `=profile=${profile}`,
          `=comment=${comment}`,
          `=limit-uptime=${limitUptime}`,
          `=limit-bytes-total=${limitBytesTotal}`,
        ];
        if (server !== "all") params.push(`=server=${server}`);
        await this.command("/ip/hotspot/user/add", params);
        created.push({ index: created.length + 1, name, password, profile, limitUptime, limitBytesTotal, comment });
      } catch (error) {
        errors.push({ name, error: friendlyError(error) });
      }
    }

    this.countsAt = 0;
    return { created, errors, count: created.length, requested: count };
  }

  async listHotspotHosts() {
    const rows = await this.print("/ip/hotspot/host/print");
    return rows.map((row) => ({
      id: text(row[".id"]),
      mac: text(row["mac-address"]),
      address: text(row.address),
      toAddress: text(row["to-address"]),
      server: text(row.server),
      uptime: text(row.uptime),
      bytesIn: numeric(row["bytes-in"]),
      bytesOut: numeric(row["bytes-out"]),
      comment: text(row.comment),
      authorized: bool(row.authorized) || bool(row.bypassed),
      disabled: bool(row.disabled),
    }));
  }

  async removeHotspotHost(id) {
    await this.command("/ip/hotspot/host/remove", [`=.id=${id}`]);
    return true;
  }

  async listHotspotBindings() {
    const rows = await this.print("/ip/hotspot/ip-binding/print");
    return rows.map((row) => ({
      id: text(row[".id"]),
      mac: text(row["mac-address"]),
      address: text(row.address),
      toAddress: text(row["to-address"]),
      server: text(row.server, "all"),
      type: text(row.type, "regular"),
      comment: text(row.comment),
      disabled: bool(row.disabled),
    }));
  }

  async saveHotspotBinding(payload) {
    const input = payload || {};
    const servers = await this.listHotspotServers();
    const mac = normalizeMac(input.mac);
    const address = validateIP(input.address, "L'adresse IP", { optional: true, allowCidr: true });
    const toAddress = validateIP(input.toAddress, "L'adresse de redirection", { optional: true });
    const server = this.resolveHotspotServer(input.server, servers);
    const type = assertChoice(input.type || "regular", BINDING_TYPES, "Le type de liaison");
    const comment = validateComment(input.comment, "Le commentaire");

    if (input.isNew) {
      const params = [`=mac-address=${mac}`, `=type=${type}`, `=comment=${comment}`];
      if (address) params.push(`=address=${address}`);
      if (toAddress) params.push(`=to-address=${toAddress}`);
      if (server !== "all") params.push(`=server=${server}`);
      if (input.disabled) params.push("=disabled=yes");
      const result = await this.command("/ip/hotspot/ip-binding/add", params);
      return result;
    }

    if (!input.id) throw new Error("Identifiant de la liaison IP manquant.");
    const current = (await this.listHotspotBindings()).find((binding) => binding.id === input.id);
    if (!current) {
      throw new Error("Liaison IP introuvable : elle a peut-être été supprimée depuis le routeur.");
    }

    const params = [`=.id=${input.id}`];
    if (mac !== current.mac) params.push(`=mac-address=${mac}`);
    if (address !== normalizeText(current.address)) params.push(`=address=${address}`);
    if (toAddress !== normalizeText(current.toAddress)) params.push(`=to-address=${toAddress}`);
    if (server !== (current.server || "all")) params.push(`=server=${server}`);
    if (type !== (current.type || "regular")) params.push(`=type=${type}`);
    if (comment !== current.comment) params.push(`=comment=${comment}`);
    if (input.disabled !== undefined && Boolean(input.disabled) !== current.disabled) {
      params.push(`=disabled=${input.disabled ? "yes" : "no"}`);
    }

    if (params.length === 1) return true;
    const result = await this.command("/ip/hotspot/ip-binding/set", params);
    return result;
  }

  async removeHotspotBinding(id) {
    await this.command("/ip/hotspot/ip-binding/remove", [`=.id=${id}`]);
    return true;
  }

  async toggleHotspotBinding(id, disabled) {
    await this.command("/ip/hotspot/ip-binding/set", [`=.id=${id}`, `=disabled=${disabled ? "yes" : "no"}`]);
    return true;
  }

  async listHotspotCookies() {
    const rows = await this.print("/ip/hotspot/cookie/print");
    return rows.map((row) => ({
      id: text(row[".id"]),
      user: text(row.user),
      mac: text(row["mac-address"]),
      domain: text(row.domain),
      expires: text(row["expires-in"]),
      comment: text(row.comment),
    }));
  }

  async removeHotspotCookie(id) {
    await this.command("/ip/hotspot/cookie/remove", [`=.id=${id}`]);
    return true;
  }

  async listDhcpLeases() {
    const rows = await this.print("/ip/dhcp-server/lease/print");
    return rows.map((row) => ({
      id: text(row[".id"]),
      address: text(row.address),
      mac: text(row["mac-address"]),
      hostName: text(row["host-name"]),
      server: text(row.server),
      status: text(row.status, "—"),
      expiresAfter: text(row["expires-after"]),
      dynamic: bool(row.dynamic),
      disabled: bool(row.disabled),
      comment: text(row.comment),
    }));
  }

  async removeDhcpLease(id) {
    await this.command("/ip/dhcp-server/lease/remove", [`=.id=${id}`]);
    return true;
  }

  async listPppSecrets() {
    const rows = await this.print("/ppp/secret/print");
    return rows.map((row) => ({
      id: text(row[".id"]),
      name: text(row.name),
      password: text(row.password),
      service: text(row.service, "any"),
      profile: text(row.profile, "default"),
      localAddress: text(row["local-address"]),
      remoteAddress: text(row["remote-address"]),
      comment: text(row.comment),
      disabled: bool(row.disabled),
    }));
  }

  async savePppSecret(payload) {
    const input = payload || {};
    const profiles = await this.listPppProfiles();

    if (input.isNew) {
      const name = validateName(input.name, "Le nom du secret", { max: 64 });
      const service = assertChoice(input.service || "any", PPP_SERVICES, "Le service PPP");
      const profile = resolveProfile(input.profile, profiles, "profil PPP");
      const localAddress = validateAddressOrPool(input.localAddress, "L'adresse locale");
      const remoteAddress = validateAddressOrPool(input.remoteAddress, "L'adresse distante");
      const comment = validateComment(input.comment, "Le commentaire");
      const params = [
        `=name=${name}`,
        `=password=${text(input.password)}`,
        `=service=${service}`,
        `=profile=${profile}`,
        `=comment=${comment}`,
      ];
      if (localAddress) params.push(`=local-address=${localAddress}`);
      if (remoteAddress) params.push(`=remote-address=${remoteAddress}`);
      if (input.disabled) params.push("=disabled=yes");
      const result = await this.command("/ppp/secret/add", params);
      this.countsAt = 0;
      return result;
    }

    if (!input.id) throw new Error("Identifiant du secret PPP manquant.");
    const current = (await this.listPppSecrets()).find((secret) => secret.id === input.id);
    if (!current) {
      throw new Error("Secret PPP introuvable : il a peut-être été supprimé depuis le routeur.");
    }

    const params = [`=.id=${input.id}`];
    const name = validateName(input.name !== undefined ? input.name : current.name, "Le nom du secret", {
      max: 64,
    });
    if (name !== current.name) params.push(`=name=${name}`);

    if (input.password !== undefined && text(input.password) !== text(current.password)) {
      params.push(`=password=${text(input.password)}`);
    }

    if (input.service !== undefined) {
      const service = assertChoice(input.service, PPP_SERVICES, "Le service PPP");
      if (service !== (current.service || "any")) params.push(`=service=${service}`);
    }

    if (normalizeText(input.profile)) {
      const profile = resolveProfile(input.profile, profiles, "profil PPP");
      if (profile !== current.profile) params.push(`=profile=${profile}`);
    }

    if (input.localAddress !== undefined) {
      const localAddress = validateAddressOrPool(input.localAddress, "L'adresse locale");
      if (localAddress !== normalizeText(current.localAddress)) params.push(`=local-address=${localAddress}`);
    }

    if (input.remoteAddress !== undefined) {
      const remoteAddress = validateAddressOrPool(input.remoteAddress, "L'adresse distante");
      if (remoteAddress !== normalizeText(current.remoteAddress)) params.push(`=remote-address=${remoteAddress}`);
    }

    if (input.comment !== undefined) {
      const comment = validateComment(input.comment, "Le commentaire");
      if (comment !== current.comment) params.push(`=comment=${comment}`);
    }

    if (input.disabled !== undefined && Boolean(input.disabled) !== current.disabled) {
      params.push(`=disabled=${input.disabled ? "yes" : "no"}`);
    }

    if (params.length === 1) return true;
    const result = await this.command("/ppp/secret/set", params);
    this.countsAt = 0;
    return result;
  }

  async removePppSecret(id) {
    await this.command("/ppp/secret/remove", [`=.id=${id}`]);
    this.countsAt = 0;
    return true;
  }

  async togglePppSecret(id, disabled) {
    await this.command("/ppp/secret/set", [`=.id=${id}`, `=disabled=${disabled ? "yes" : "no"}`]);
    this.countsAt = 0;
    return true;
  }

  async listPppActive() {
    const rows = await this.print("/ppp/active/print");
    return rows.map((row) => ({
      id: text(row[".id"]),
      name: text(row.name),
      address: text(row.address),
      uptime: text(row.uptime),
      service: text(row.service),
      callerId: text(row["caller-id"]),
      bytesIn: numeric(row["bytes-in"]),
      bytesOut: numeric(row["bytes-out"]),
    }));
  }

  async kickPpp(id) {
    await this.command("/ppp/active/remove", [`=.id=${id}`]);
    this.countsAt = 0;
    return true;
  }

  async listInterfaces() {
    const rows = await this.print("/interface/print");
    const now = Date.now();
    const interfaces = rows.map((iface) => this.normalizeInterface(iface, now));
    this.prevAt = now;
    rows.forEach((iface) => {
      const normalized = interfaces.find((item) => item.name === text(iface.name));
      if (normalized) {
        this.prevInterfaces.set(normalized.name, {
          rx: normalized.rxByte,
          tx: normalized.txByte,
        });
      }
    });
    return interfaces;
  }

  async toggleInterface(id, disabled) {
    await this.command("/interface/set", [`=.id=${id}`, `=disabled=${disabled ? "yes" : "no"}`]);
    return true;
  }

  async getLogs() {
    const rows = await this.print("/log/print");
    return rows.slice(0, 300).map((entry) => ({
      id: text(entry[".id"]),
      time: text(entry.time),
      topics: text(entry.topics),
      message: text(entry.message),
    }));
  }

  /* ---------- Pare-feu, files d'attente, VLAN, routage ---------- */

  normalizeFirewallRule(row, type) {
    return {
      id: text(row[".id"]),
      type,
      chain: text(row.chain),
      action: text(row.action, "accept"),
      protocol: text(row.protocol, "all"),
      srcAddress: text(row["src-address"]),
      dstAddress: text(row["dst-address"]),
      srcPort: text(row["src-port"]),
      dstPort: text(row["dst-port"]),
      inInterface: text(row["in-interface"]),
      outInterface: text(row["out-interface"]),
      connectionState: text(row["connection-state"]),
      comment: text(row.comment),
      disabled: bool(row.disabled),
      dynamic: bool(row.dynamic),
      packets: numeric(row.packets),
      bytes: numeric(row.bytes),
    };
  }

  async listFirewall() {
    const types = ["filter", "nat", "mangle", "raw"];
    const results = await Promise.all(
      types.map((type) => this.print(`/ip/firewall/${type}/print`).catch(() => []))
    );
    return types.map((type, index) => ({
      type,
      rules: results[index].map((row) => this.normalizeFirewallRule(row, type)),
    }));
  }

  async toggleFirewallRule(type, id, disabled) {
    if (!["filter", "nat", "mangle", "raw"].includes(type)) {
      throw new Error("Type de règle pare-feu inconnu.");
    }
    await this.command(`/ip/firewall/${type}/set`, [`=.id=${id}`, `=disabled=${disabled ? "yes" : "no"}`]);
    return true;
  }

  async listQueues() {
    const rows = await this.print("/queue/simple/print");
    return rows.map((row) => ({
      id: text(row[".id"]),
      name: text(row.name),
      target: text(row.target),
      rate: text(row.rate),
      maxLimit: text(row["max-limit"]),
      burstLimit: text(row["burst-limit"]),
      priority: text(row.priority, "8/8"),
      packets: numeric(row.packets),
      bytes: numeric(row.bytes),
      comment: text(row.comment),
      disabled: bool(row.disabled),
      dynamic: bool(row.dynamic),
    }));
  }

  async toggleQueue(id, disabled) {
    await this.command("/queue/simple/set", [`=.id=${id}`, `=disabled=${disabled ? "yes" : "no"}`]);
    return true;
  }

  async listVlans() {
    const rows = await this.print("/interface/vlan/print");
    return rows.map((row) => ({
      id: text(row[".id"]),
      name: text(row.name),
      vlanId: numeric(row["vlan-id"]),
      interface: text(row.interface),
      mtu: numeric(row.mtu) || 1500,
      running: bool(row.running),
      disabled: bool(row.disabled),
      comment: text(row.comment),
    }));
  }

  async listRoutes() {
    const rows = await this.print("/ip/route/print");
    return rows.map((row) => ({
      id: text(row[".id"]),
      dstAddress: text(row["dst-address"], "0.0.0.0/0"),
      gateway: text(row.gateway),
      distance: numeric(row.distance) || 1,
      prefSrc: text(row["pref-src"]),
      active: bool(row.active),
      dynamic: bool(row.dynamic),
      connect: bool(row.connect),
      disabled: bool(row.disabled),
      comment: text(row.comment),
    }));
  }

  async ping(target, count) {
    const address = validateHost(target, "La cible");
    const total = Math.max(1, Math.min(20, Number(count) || 4));
    const rows = await this.command("/tool/ping", [`=address=${address}`, `=count=${total}`]);
    const replies = [];
    rows.forEach((row) => {
      const timeMs = parsePingTime(row.time);
      const status = text(row.status);
      if (!timeMs && !status) return;
      replies.push({
        host: text(row.host, address),
        size: numeric(row.size),
        ttl: numeric(row.ttl),
        time: text(row.time),
        timeMs,
        status: status || (timeMs ? "reply" : ""),
      });
    });
    const successful = replies.filter((reply) => reply.timeMs > 0 || /reply/i.test(reply.status));
    const times = successful.map((reply) => reply.timeMs).filter((value) => value > 0);
    const received = successful.length;
    const loss = total > 0 ? Math.round(((total - received) / total) * 100) : 0;
    return {
      target: address,
      count: total,
      replies,
      sent: total,
      received,
      loss: Math.max(0, Math.min(100, loss)),
      min: times.length ? Math.min(...times) : 0,
      avg: times.length ? times.reduce((sum, value) => sum + value, 0) / times.length : 0,
      max: times.length ? Math.max(...times) : 0,
    };
  }

  async traceroute(target) {
    const address = validateHost(target, "La cible");
    const rows = await this.command("/tool/traceroute", [
      `=address=${address}`,
      "=count=1",
      "=timeout=1s",
      "=max-hops=15",
    ]);
    return {
      target: address,
      hops: rows
        .map((row, index) => ({
          hop: index + 1,
          address: text(row.address || row.host),
          loss: text(row.loss || row["packet-loss"]),
          sent: text(row.sent),
          last: text(row.last),
          avg: text(row.avg),
          best: text(row.best),
          worst: text(row.worst),
          status: text(row.status),
        }))
        .filter((hop) => hop.address || hop.status),
    };
  }

  async securityAudit() {
    const paths = {
      resource: "/system/resource/print",
      users: "/user/print",
      services: "/ip/service/print",
      firewall: "/ip/firewall/filter/print",
      snmp: "/snmp/print",
      communities: "/snmp/community/print",
      dns: "/ip/dns/print",
      ntp: "/system/ntp/client/print",
      discovery: "/ip/neighbor/discovery-settings/print",
      cloud: "/ip/cloud/print",
      macServer: "/tool/mac-server/print",
      files: "/file/print",
    };
    const entries = await Promise.all(
      Object.values(paths).map((path) =>
        this.print(path)
          .then((rows) => ({ ok: true, rows }))
          .catch(() => ({ ok: false, rows: [] }))
      )
    );
    const data = {};
    Object.keys(paths).forEach((key, index) => {
      data[key] = entries[index];
    });

    const checks = [];
    let score = 100;
    const add = (id, title, status, detail, recommendation, penalty = 0) => {
      checks.push({ id, title, status, detail, recommendation: recommendation || "" });
      if (status === "critical" || status === "warn") score -= penalty;
    };

    const resourceRow = data.resource.rows[0] || {};
    const version = text(resourceRow.version);
    const major = parseInt(version, 10);
    const minor = Number((version.match(/^7\.(\d+)/) || [])[1] || 0);
    if (!version) {
      add("version", "Version RouterOS", "unknown", "Version illisible (droits API insuffisants).", "Accordez le droit « read » à l'utilisateur API.");
    } else if (!Number.isFinite(major) || major < 7) {
      add(
        "version",
        "Version RouterOS",
        "critical",
        `RouterOS ${version} est en fin de vie et ne reçoit plus les correctifs de sécurité.`,
        "Mettez à jour vers RouterOS 7 (dernière version stable) depuis WinBox ou l'interface web.",
        15
      );
    } else if (minor > 0 && minor < 10) {
      add(
        "version",
        "Version RouterOS",
        "warn",
        `RouterOS ${version} est antérieure à la branche 7.10.`,
        "Planifiez une mise à jour vers une version 7.x récente.",
        8
      );
    } else {
      add("version", "Version RouterOS", "ok", `RouterOS ${version} détecté.`, "");
    }

    if (!data.users.ok) {
      add("users", "Comptes administrateurs", "unknown", "Liste des utilisateurs illisible.", "Vérifiez le droit « read » de l'API.", 0);
    } else {
      const users = data.users.rows.filter((row) => !bool(row.disabled));
      const fullUsers = users.filter((row) => /^(full|admin)$/i.test(text(row.group)));
      const unrestricted = fullUsers.filter((row) => !text(row.address));
      if (!fullUsers.length) {
        add("users", "Comptes administrateurs", "warn", "Aucun compte de groupe « full » actif n'a été trouvé.", "Vérifiez les comptes et leurs groupes.", 6);
      } else if (unrestricted.length) {
        add(
          "users",
          "Comptes administrateurs",
          "warn",
          `${unrestricted.length} compte(s) « full » sans restriction d'adresse : ${unrestricted.map((user) => text(user.name)).join(", ")}.`,
          "Limitez chaque compte administrateur à une adresse ou un réseau de management (champ « Address »).",
          10
        );
      } else {
        add("users", "Comptes administrateurs", "ok", "Tous les comptes « full » sont restreints par adresse.", "");
      }
      if (users.some((user) => text(user.name).toLowerCase() === "admin")) {
        add("admin", "Compte « admin »", "info", "Le compte historique « admin » est actif.", "Renommez-le ou désactivez-le si un autre compte administrateur existe.");
      }
    }

    if (!data.services.ok) {
      add("services", "Services d'administration", "unknown", "Liste des services illisible.", "Vérifiez le droit « read » de l'API.", 0);
    } else {
      const services = data.services.rows.filter((row) => !bool(row.disabled));
      const plain = services.filter((row) => ["telnet", "ftp", "www"].includes(text(row.name).toLowerCase()));
      const management = services.filter((row) => ["api", "winbox", "ssh"].includes(text(row.name).toLowerCase()) && !text(row.address));
      if (plain.length) {
        add(
          "services-plain",
          "Services non chiffrés",
          "critical",
          `Services actifs en clair : ${plain.map((row) => text(row.name)).join(", ")}.`,
          "Désactivez telnet, ftp et le service www HTTP ; utilisez SSH, WinBox et api-ssl (8729).",
          20
        );
      } else {
        add("services-plain", "Services non chiffrés", "ok", "Aucun service telnet, ftp ou www actif.", "");
      }
      if (management.length) {
        add(
          "services-open",
          "Services de management",
          "warn",
          `Services accessibles sans restriction d'adresse : ${management.map((row) => text(row.name)).join(", ")}.`,
          "Restreignez api, winbox et ssh à votre réseau de management via le champ « Available From ».",
          8
        );
      } else {
        add("services-open", "Services de management", "ok", "Les services de management sont restreints par adresse.", "");
      }
    }

    let dropRules = [];
    if (!data.firewall.ok) {
      add("firewall", "Pare-feu", "unknown", "Règles de filtrage illisibles.", "Accordez le droit « read » sur le pare-feu.", 0);
    } else {
      const rules = data.firewall.rows.filter((row) => !bool(row.disabled));
      const input = rules.filter((row) => text(row.chain) === "input");
      dropRules = input.filter((row) => text(row.action) === "drop");
      if (!input.length) {
        add("firewall", "Pare-feu", "critical", "Aucune règle de filtrage active dans la chaîne « input ».", "Créez une politique input par défaut en « drop » et autorisez uniquement les services nécessaires.", 25);
      } else if (!dropRules.length) {
        add("firewall", "Pare-feu", "warn", "Aucune règle « drop » active dans la chaîne « input ».", "Ajoutez une règle de rejet par défaut en fin de chaîne input.", 12);
      } else {
        add("firewall", "Pare-feu", "ok", `${input.length} règle(s) input active(s), dont ${dropRules.length} rejet(s).`, "");
      }
    }

    const dnsRow = data.dns.rows[0] || {};
    const dnsRemote = bool(dnsRow["allow-remote-requests"]);
    if (!data.dns.ok) {
      add("dns", "Service DNS", "unknown", "Configuration DNS illisible.", "Vérifiez le droit « read » sur /ip/dns.", 0);
    } else if (dnsRemote && !dropRules.length) {
      add("dns", "Service DNS", "warn", "Le routeur accepte les requêtes DNS distantes sans pare-feu input restrictif.", "Désactivez « Allow Remote Requests » ou protégez le port 53 par le pare-feu.", 10);
    } else if (dnsRemote) {
      add("dns", "Service DNS", "info", "Les requêtes DNS distantes sont autorisées mais le pare-feu filtre l'input.", "Vérifiez que le port 53 n'est ouvert qu'aux réseaux internes.");
    } else {
      add("dns", "Service DNS", "ok", "Les requêtes DNS distantes sont désactivées.", "");
    }

    const snmpEnabled = bool((data.snmp.rows[0] || {}).enabled);
    const weakCommunity = data.communities.rows.some(
      (row) => !bool(row.disabled) && ["public", "private"].includes(text(row.name || row.community).toLowerCase())
    );
    if (snmpEnabled && weakCommunity) {
      add("snmp", "SNMP", "warn", "SNMP est actif avec une communauté par défaut (public/private).", "Changez la communauté SNMP ou désactivez le service.", 10);
    } else if (snmpEnabled) {
      add("snmp", "SNMP", "info", "SNMP est actif.", "Vérifiez que l'accès SNMP est limité aux collecteurs autorisés.");
    } else {
      add("snmp", "SNMP", "ok", "SNMP est désactivé.", "");
    }

    if (data.ntp.ok && !bool((data.ntp.rows[0] || {}).enabled)) {
      add("ntp", "Synchronisation de l'heure", "info", "Le client NTP est désactivé.", "Activez NTP pour des journaux et certificats fiables.");
    }

    const discoveryValue = text((data.discovery.rows[0] || {})["discover-interface-list"]);
    if (discoveryValue && discoveryValue.toLowerCase() === "all") {
      add("discovery", "Découverte de voisins", "info", "MNDP/CDP/LLDP est activé sur toutes les interfaces.", "Limitez la découverte aux interfaces LAN.");
    }

    if (data.cloud.ok && bool((data.cloud.rows[0] || {})["ddns-enabled"])) {
      add("cloud", "Cloud DDNS", "info", "Le DDNS MikroTik est activé.", "Vérifiez qu'il est nécessaire et que l'accès distant est protégé.");
    }

    if (data.macServer.ok && bool((data.macServer.rows[0] || {}).enabled)) {
      add("mac-server", "Serveur MAC", "warn", "Le serveur MAC est activé.", "Désactivez-le si vous n'en avez pas besoin ou limitez-le aux interfaces LAN.", 8);
    }

    if (data.files.ok) {
      const backups = data.files.rows.filter((row) => /\.backup$/i.test(text(row.name)));
      if (!backups.length) {
        add("backup", "Sauvegardes", "info", "Aucune sauvegarde .backup n'a été trouvée sur le routeur.", "Créez une sauvegarde régulière (Files > Backup) et conservez-la hors du routeur.");
      } else {
        add("backup", "Sauvegardes", "ok", `${backups.length} fichier(s) de sauvegarde présent(s) sur le routeur.`, "Téléchargez régulièrement les sauvegardes hors du routeur.");
      }
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "E";
    return {
      identity: this.identity,
      version,
      score,
      grade,
      checks,
      summary: {
        ok: checks.filter((check) => check.status === "ok").length,
        warn: checks.filter((check) => check.status === "warn").length,
        critical: checks.filter((check) => check.status === "critical").length,
        info: checks.filter((check) => check.status === "info").length,
        unknown: checks.filter((check) => check.status === "unknown").length,
      },
      counts: {
        users: data.users.rows.length,
        services: data.services.rows.length,
        firewallRules: data.firewall.rows.length,
        backups: data.files.rows.filter((row) => /\.backup$/i.test(text(row.name))).length,
      },
    };
  }

  /* ---------- Sauvegarde / restauration de configuration ---------- */

  async exportConfig() {
    const rows = await this.command("/export");
    const lines = [];
    (rows || []).forEach((row) => {
      if (typeof row === "string") {
        lines.push(row);
        return;
      }
      if (!row || typeof row !== "object") return;
      if (typeof row.data === "string") {
        lines.push(...row.data.split(/\r?\n/));
      } else if (typeof row.message === "string") {
        lines.push(row.message);
      } else if (typeof row.text === "string") {
        lines.push(row.text);
      }
    });
    const content = `${lines.join("\n").replace(/\s+$/, "")}\n`;
    if (!content.trim()) {
      throw new Error(
        "Le routeur n'a renvoyé aucun export de configuration. Ajoutez la stratégie « read » (et « sensitive » si nécessaire) à l'utilisateur API."
      );
    }
    return {
      format: "rsc",
      content,
      lines: content.split("\n").length,
      bytes: Buffer.byteLength(content, "utf8"),
      createdAt: new Date().toISOString(),
    };
  }

  async createRouterBackup() {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\..+$/, "")
      .replace("T", "-");
    const base = `mikrodesk-${stamp}`;
    try {
      await this.command("/system/backup/save", [`=name=${base}`]);
    } catch (error) {
      // RouterOS 6 n'accepte pas le paramètre name : la sauvegarde porte un nom automatique.
      if (!/does not match any value|unknown parameter|no such argument|expected end of command/i.test(error.message)) {
        throw error;
      }
      await this.command("/system/backup/save", []);
    }
    const files = await this.print("/file/print").catch(() => []);
    const backups = files
      .filter((row) => /\.backup$/i.test(text(row.name)))
      .sort((left, right) => numeric(right["creation-time"]) - numeric(left["creation-time"]));
    const match =
      backups.find((row) => text(row.name).startsWith(base)) || backups[0] || null;
    return {
      name: match ? text(match.name) : `${base}.backup`,
      size: match ? numeric(match.size) : 0,
      createdAt: new Date().toISOString(),
      note: "Sauvegarde binaire créée sur le routeur (à télécharger via WinBox, FTP ou SSH).",
    };
  }

  async restoreConfig(content) {
    const script = String(content || "")
      .replace(/\r\n?/g, "\n")
      .trim();
    if (!script) throw new Error("Le contenu de configuration est vide.");
    if (!script.startsWith("/") && !script.startsWith("#")) {
      throw new Error("Ce contenu ne ressemble pas à un export RouterOS (fichier .rsc attendu).");
    }
    const parts = [];
    let current = "";
    script.split("\n").forEach((line) => {
      if (current.length + line.length + 1 > 28000 && current.trim()) {
        parts.push(current);
        current = "";
      }
      current += `${line}\n`;
    });
    if (current.trim()) parts.push(current);

    const prefix = `mikrodesk-restore-${Date.now().toString(36)}`;
    const created = [];
    try {
      for (let index = 0; index < parts.length; index += 1) {
        const name = `${prefix}-${index + 1}`;
        await this.command("/system/script/add", [`=name=${name}`, `=source=${parts[index]}`]);
        const scripts = await this.print("/system/script/print");
        const match = scripts.find((row) => text(row.name) === name);
        if (!match) throw new Error("Impossible de créer le script temporaire de restauration sur le routeur.");
        const id = text(match[".id"]);
        created.push(id);
        await this.command("/system/script/run", [`=.id=${id}`]);
      }
    } finally {
      for (const id of created) {
        try {
          await this.command("/system/script/remove", [`=.id=${id}`]);
        } catch {
          /* nettoyage best-effort */
        }
      }
    }

    return {
      parts: parts.length,
      lines: script.split("\n").length,
      bytes: Buffer.byteLength(script, "utf8"),
      at: new Date().toISOString(),
    };
  }

  async reboot() {
    try {
      await this.command("/system/reboot");
    } catch (error) {
      // Le routeur coupe la connexion avant de répondre : c'est normal.
      if (!/closed|timeout|reset|socket/i.test(error.message)) throw error;
    }
    return true;
  }

  async runTerminalCommand(path, params = []) {
    const result = await this.command(path, params);
    const rows = Array.isArray(result) ? result : [];
    return rows.map((row) => {
      const out = {};
      Object.entries(row || {}).forEach(([key, value]) => {
        const name = key === ".id" ? "id" : key;
        if (value === undefined || value === null) {
          out[name] = "";
        } else if (typeof value === "object") {
          out[name] = JSON.stringify(value);
        } else {
          out[name] = String(value);
        }
      });
      return out;
    });
  }
}

module.exports = { RouterOSAdapter, friendlyError };
