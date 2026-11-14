"use strict";

/*
 * Validation partagée entre le processus principal (adaptateurs RouterOS / démo)
 * et l'interface (renderer/validate.js est servi depuis ce même fichier).
 *
 * Objectif : refuser en français, avant l'appel API, toutes les valeurs que
 * RouterOS rejetterait avec un message technique du type
 * « input does not match any value of profile ».
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MikroValidate = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function fail(message) {
    throw new Error(message);
  }

  function normalizeText(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
  }

  function isValidName(value, options) {
    const opt = options || {};
    const name = normalizeText(value);
    if (!name) return Boolean(opt.optional);
    if (name.length > (opt.max || 64)) return false;
    if (/[\u0000-\u001f\u007f]/.test(name)) return false;
    if (name.includes("=") || name.includes("\\")) return false;
    if (opt.noSpaces && /\s/.test(name)) return false;
    return true;
  }

  function validateName(value, label, options) {
    const opt = options || {};
    const name = normalizeText(value);
    if (!name) {
      if (opt.optional) return "";
      fail(`${label} est obligatoire.`);
    }
    const max = opt.max || 64;
    if (name.length > max) fail(`${label} ne doit pas dépasser ${max} caractères.`);
    if (/[\u0000-\u001f\u007f]/.test(name)) fail(`${label} contient des caractères de contrôle interdits.`);
    if (name.includes("=")) fail(`${label} ne doit pas contenir le caractère « = ».`);
    if (name.includes("\\")) fail(`${label} ne doit pas contenir le caractère « \\ ».`);
    if (opt.noSpaces && /\s/.test(name)) fail(`${label} ne doit pas contenir d'espace.`);
    return name;
  }

  function validateComment(value, label) {
    const comment = normalizeText(value);
    if (!comment) return "";
    if (comment.length > 255) fail(`${label || "Le commentaire"} ne doit pas dépasser 255 caractères.`);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(comment)) {
      fail(`${label || "Le commentaire"} contient des caractères de contrôle interdits.`);
    }
    return comment;
  }

  function isIPv4(value) {
    const raw = normalizeText(value);
    const parts = raw.split(".");
    if (parts.length !== 4) return false;
    return parts.every(
      (part) => /^\d{1,3}$/.test(part) && Number(part) <= 255 && !(part.length > 1 && part[0] === "0")
    );
  }

  function isIPv6(value) {
    const raw = normalizeText(value);
    if (!raw.includes(":") || raw.includes(":::")) return false;
    const halves = raw.split("::");
    if (halves.length > 2) return false;
    const groups = [];
    halves.forEach((half) => {
      if (!half) return;
      half.split(":").forEach((group) => groups.push(group));
    });
    if (groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return false;
    if (halves.length === 2) return groups.length < 8;
    return groups.length === 8;
  }

  function isIP(value) {
    return isIPv4(value) || isIPv6(value);
  }

  function isCIDR(value) {
    const raw = normalizeText(value);
    const slash = raw.lastIndexOf("/");
    if (slash < 1) return false;
    const address = raw.slice(0, slash);
    const prefix = raw.slice(slash + 1);
    if (!/^\d{1,3}$/.test(prefix)) return false;
    const number = Number(prefix);
    if (isIPv4(address)) return number >= 0 && number <= 32;
    if (isIPv6(address)) return number >= 0 && number <= 128;
    return false;
  }

  function validateIP(value, label, options) {
    const opt = options || {};
    const raw = normalizeText(value);
    if (!raw) {
      if (opt.optional) return "";
      fail(`${label} est obligatoire.`);
    }
    if (isIP(raw)) return raw;
    if (opt.allowCidr && isCIDR(raw)) return raw;
    if (opt.allowCidr) {
      fail(`${label} invalide. Utilisez une adresse IP (ex. 192.168.88.10) ou un réseau CIDR (ex. 192.168.88.0/24).`);
    }
    fail(`${label} invalide. Format attendu : 192.168.88.1 (ou une adresse IPv6).`);
  }

  function validateHost(value, label) {
    const raw = normalizeText(value)
      .replace(/^https?:\/\//i, "")
      .split("/")[0];
    if (!raw) fail(`${label || "La cible"} est obligatoire.`);
    if (isIP(raw)) return raw;
    if (raw.length > 253) fail(`${label || "La cible"} est trop longue.`);
    if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(raw)) {
      fail(`${label || "La cible"} invalide. Utilisez une adresse IP ou un nom d'hôte (ex. 8.8.8.8 ou mikrotik.com).`);
    }
    return raw;
  }

  function normalizeMac(value) {
    const raw = normalizeText(value);
    if (!raw) fail("L'adresse MAC est obligatoire.");
    const compact = raw.replace(/[:\-.]/g, "");
    if (!/^[0-9a-f]{12}$/i.test(compact)) {
      fail("Adresse MAC invalide. Format attendu : AA:BB:CC:DD:EE:FF.");
    }
    if (!/^[0-9a-f:\-.]{12,17}$/i.test(raw)) {
      fail("Adresse MAC invalide. Format attendu : AA:BB:CC:DD:EE:FF.");
    }
    return (compact.toUpperCase().match(/.{2}/g) || []).join(":");
  }

  function isMac(value) {
    try {
      normalizeMac(value);
      return true;
    } catch {
      return false;
    }
  }

  const BYTE_UNITS = {
    "": 1,
    b: 1,
    k: 1024,
    kb: 1024,
    kib: 1024,
    m: 1024 ** 2,
    mb: 1024 ** 2,
    mib: 1024 ** 2,
    g: 1024 ** 3,
    gb: 1024 ** 3,
    gib: 1024 ** 3,
    t: 1024 ** 4,
    tb: 1024 ** 4,
    tib: 1024 ** 4,
  };

  function parseBytes(value, label) {
    const raw = normalizeText(value).toLowerCase().replace(/\s+/g, "");
    if (!raw || raw === "0" || raw === "unlimited" || raw === "illimité" || raw === "illimite") return 0;
    const match = raw.match(/^(\d+(?:[.,]\d+)?)(tib|gib|mib|kib|tb|gb|mb|kb|t|g|m|k|b)?$/);
    if (!match) {
      fail(`${label || "La limite de données"} est invalide. Exemples acceptés : 500M, 1G, 1073741824, 0.`);
    }
    const amount = Number(match[1].replace(",", "."));
    const factor = BYTE_UNITS[match[2] || ""] || 1;
    const bytes = Math.round(amount * factor);
    if (!Number.isFinite(bytes) || bytes < 0) {
      fail(`${label || "La limite de données"} est invalide.`);
    }
    return bytes;
  }

  function normalizeBytes(value, label) {
    return String(parseBytes(value, label));
  }

  function parseDuration(value, label) {
    const raw = normalizeText(value).toLowerCase().replace(/\s+/g, "");
    if (!raw || raw === "0" || raw === "unlimited" || raw === "illimité" || raw === "illimite") return 0;
    if (/^\d+$/.test(raw)) return Number(raw);
    if (/^\d{1,4}(:\d{1,2}){1,2}$/.test(raw)) {
      const parts = raw.split(":").map(Number);
      if (parts.length === 2) {
        if (parts[1] > 59) fail(`${label || "La limite de temps"} est invalide.`);
        return parts[0] * 3600 + parts[1] * 60;
      }
      if (parts[1] > 59 || parts[2] > 59) fail(`${label || "La limite de temps"} est invalide.`);
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    const match = raw.match(/^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!match || !match.slice(1).some(Boolean)) {
      fail(`${label || "La limite de temps"} est invalide. Exemples acceptés : 1d, 12h, 1h30m, 00:10:00, 0.`);
    }
    const weeks = match[1] ? Number(match[1]) : 0;
    const days = match[2] ? Number(match[2]) : 0;
    const hours = match[3] ? Number(match[3]) : 0;
    const minutes = match[4] ? Number(match[4]) : 0;
    const seconds = match[5] ? Number(match[5]) : 0;
    return weeks * 604800 + days * 86400 + hours * 3600 + minutes * 60 + seconds;
  }

  function formatDuration(totalSeconds) {
    let rest = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    if (!rest) return "0";
    const weeks = Math.floor(rest / 604800);
    rest %= 604800;
    const days = Math.floor(rest / 86400);
    rest %= 86400;
    const hours = Math.floor(rest / 3600);
    rest %= 3600;
    const minutes = Math.floor(rest / 60);
    const seconds = rest % 60;
    let out = "";
    if (weeks) out += `${weeks}w`;
    if (days) out += `${days}d`;
    if (hours) out += `${hours}h`;
    if (minutes) out += `${minutes}m`;
    if (seconds) out += `${seconds}s`;
    return out || "0";
  }

  function normalizeDuration(value, label) {
    return formatDuration(parseDuration(value, label));
  }

  function listChoices(options) {
    const names = (options || [])
      .map((item) => normalizeText(item))
      .filter(Boolean);
    return names.length ? names.join(", ") : "aucune";
  }

  function resolveChoice(value, options, label, settings) {
    const opt = settings || {};
    const raw = normalizeText(value);
    const names = (options || []).map((item) => normalizeText(item)).filter(Boolean);
    if (!raw) {
      if (opt.defaultValue && names.includes(opt.defaultValue)) return opt.defaultValue;
      if (opt.allowEmpty) return "";
      if (names.length) return names[0];
      return "";
    }
    const exact = names.find((name) => name === raw);
    if (exact) return exact;
    const insensitive = names.filter((name) => name.toLowerCase() === raw.toLowerCase());
    if (insensitive.length === 1) return insensitive[0];
    if (opt.allowUnknown) return raw;
    fail(`${label} « ${raw} » n'existe pas sur le routeur. Valeurs disponibles : ${listChoices(names)}.`);
  }

  function resolveProfile(value, profiles, label, settings) {
    const opt = settings || {};
    const names = (profiles || [])
      .map((profile) => normalizeText(profile && profile.name !== undefined ? profile.name : profile))
      .filter(Boolean);
    const raw = normalizeText(value);
    if (!names.length) {
      if (opt.allowEmptyIfNone) return "";
      fail(
        `Aucun ${label || "profil"} n'est configuré sur le routeur. Créez-en un dans RouterOS avant d'enregistrer cet élément.`
      );
    }
    if (!raw) {
      if (names.includes(opt.defaultValue || "default")) return opt.defaultValue || "default";
      return names[0];
    }
    return resolveChoice(raw, names, `Le ${label || "profil"}`, { allowEmpty: false });
  }

  function assertChoice(value, allowed, label) {
    const raw = normalizeText(value);
    const names = (allowed || []).map((item) => normalizeText(item)).filter(Boolean);
    const exact = names.find((name) => name === raw);
    if (exact) return exact;
    const insensitive = names.filter((name) => name.toLowerCase() === raw.toLowerCase());
    if (insensitive.length === 1) return insensitive[0];
    fail(`${label} « ${raw || "(vide)"} » est invalide. Valeurs acceptées : ${listChoices(names)}.`);
    return raw;
  }

  return {
    BYTE_UNITS,
    assertChoice,
    fail,
    formatDuration,
    isCIDR,
    isIP,
    isIPv4,
    isIPv6,
    isMac,
    isValidName,
    listChoices,
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
  };
});
