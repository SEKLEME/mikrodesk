"use strict";

/**
 * Adaptateur de démonstration.
 * Reproduit l'interface de l'adaptateur RouterOS avec un routeur simulé,
 * pour découvrir l'application sans connexion réelle.
 */

const {
  assertChoice,
  normalizeBytes,
  normalizeDuration,
  normalizeMac,
  normalizeText,
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function randomString(length, alphabet) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function nowLabel() {
  return new Date().toLocaleTimeString("fr-FR", { hour12: false });
}

function validateAddressOrPool(value, label) {
  const raw = normalizeText(value);
  if (!raw) return "";
  if (raw.includes(".") || raw.includes(":")) return validateIP(raw, label, { optional: true });
  return validateName(raw, label, { max: 64, optional: true });
}

class DemoAdapter {
  constructor() {
    this.mode = "demo";
    this.identity = "MikroTik-CHR (démo)";
    this.version = "7.16.2 (stable)";
    this.board = "CCR2004-1G-12S+2XS";
    this.architecture = "arm64";
    this.startedAt = Date.now() - 23 * 86400000 - 4 * 3600000;
    this.seq = 100;
    this.lastTick = Date.now();
    this.cpuBase = 21;
    this.tick = 0;

    this.profiles = [
      { id: "*p1", name: "default", rateLimit: "", sharedUsers: "1", sessionTimeout: "", idleTimeout: "", loginBy: "cookie" },
      { id: "*p2", name: "1jour", rateLimit: "2M/2M", sharedUsers: "1", sessionTimeout: "1d", idleTimeout: "5m", loginBy: "http-chap" },
      { id: "*p3", name: "1semaine", rateLimit: "4M/4M", sharedUsers: "2", sessionTimeout: "7d", idleTimeout: "10m", loginBy: "http-chap" },
      { id: "*p4", name: "hotspot-vip", rateLimit: "10M/10M", sharedUsers: "3", sessionTimeout: "30d", idleTimeout: "", loginBy: "http-pap" },
    ];

    this.hotspotServers = [
      {
        id: "*hs1",
        name: "hotspot",
        interface: "bridge-hotspot",
        addressPool: "dhcp-hotspot",
        profile: "default",
        disabled: false,
      },
    ];

    this.pppProfiles = [
      {
        id: "*pp1",
        name: "default",
        localAddress: "10.10.0.1",
        remoteAddress: "10.10.0.0/24",
        rateLimit: "",
        onlyOne: "yes",
      },
      {
        id: "*pp2",
        name: "vpn-clients",
        localAddress: "10.20.0.1",
        remoteAddress: "vpn-pool",
        rateLimit: "5M/5M",
        onlyOne: "no",
      },
    ];

    this.users = [
      { id: "*u1", name: "accueil-01", password: "4821", profile: "default", server: "all", comment: "Réception", disabled: false, limitUptime: "0", limitBytesTotal: "0", bytesIn: 128_400_000, bytesOut: 812_300_000, uptime: "" },
      { id: "*u2", name: "accueil-02", password: "7395", profile: "default", server: "all", comment: "Réception", disabled: false, limitUptime: "0", limitBytesTotal: "0", bytesIn: 96_200_000, bytesOut: 640_800_000, uptime: "" },
      { id: "*u3", name: "compta-01", password: "1284", profile: "1jour", server: "all", comment: "Service comptabilité", disabled: false, limitUptime: "1d", limitBytesTotal: "2G", bytesIn: 220_000_000, bytesOut: 1_400_000_000, uptime: "" },
      { id: "*u4", name: "compta-02", password: "9053", profile: "1jour", server: "all", comment: "Service comptabilité", disabled: false, limitUptime: "1d", limitBytesTotal: "2G", bytesIn: 180_500_000, bytesOut: 1_120_000_000, uptime: "" },
      { id: "*u5", name: "direction", password: "3317", profile: "hotspot-vip", server: "all", comment: "Bureau direction", disabled: false, limitUptime: "30d", limitBytesTotal: "50G", bytesIn: 2_450_000_000, bytesOut: 8_900_000_000, uptime: "" },
      { id: "*u6", name: "salle-reunion", password: "6644", profile: "1semaine", server: "all", comment: "Salle de réunion", disabled: false, limitUptime: "7d", limitBytesTotal: "10G", bytesIn: 640_000_000, bytesOut: 2_100_000_000, uptime: "" },
      { id: "*u7", name: "invite-01", password: "2210", profile: "1jour", server: "all", comment: "Visiteur", disabled: false, limitUptime: "1d", limitBytesTotal: "1G", bytesIn: 54_000_000, bytesOut: 210_000_000, uptime: "" },
      { id: "*u8", name: "invite-02", password: "9081", profile: "1jour", server: "all", comment: "Visiteur", disabled: false, limitUptime: "1d", limitBytesTotal: "1G", bytesIn: 41_000_000, bytesOut: 160_000_000, uptime: "" },
      { id: "*u9", name: "technicien-01", password: "4452", profile: "hotspot-vip", server: "all", comment: "Équipe technique", disabled: false, limitUptime: "30d", limitBytesTotal: "50G", bytesIn: 1_900_000_000, bytesOut: 6_200_000_000, uptime: "" },
      { id: "*u10", name: "technicien-02", password: "8170", profile: "hotspot-vip", server: "all", comment: "Équipe technique", disabled: false, limitUptime: "30d", limitBytesTotal: "50G", bytesIn: 1_500_000_000, bytesOut: 5_400_000_000, uptime: "" },
      { id: "*u11", name: "caisse-01", password: "5529", profile: "default", server: "all", comment: "Caisse", disabled: false, limitUptime: "0", limitBytesTotal: "0", bytesIn: 72_000_000, bytesOut: 380_000_000, uptime: "" },
      { id: "*u12", name: "caisse-02", password: "1207", profile: "default", server: "all", comment: "Caisse", disabled: true, limitUptime: "0", limitBytesTotal: "0", bytesIn: 12_000_000, bytesOut: 90_000_000, uptime: "" },
      { id: "*u13", name: "stock-01", password: "7742", profile: "1semaine", server: "all", comment: "Magasin", disabled: false, limitUptime: "7d", limitBytesTotal: "10G", bytesIn: 410_000_000, bytesOut: 1_320_000_000, uptime: "" },
      { id: "*u14", name: "stock-02", password: "3396", profile: "1semaine", server: "all", comment: "Magasin", disabled: false, limitUptime: "7d", limitBytesTotal: "10G", bytesIn: 380_000_000, bytesOut: 1_180_000_000, uptime: "" },
    ];

    this.active = [
      { id: "*a1", user: "accueil-01", address: "10.5.50.24", mac: "6C:3B:6B:1A:22:01", uptime: "2h18m44s", timeLeft: "3m12s", bytesIn: 18_400_000, bytesOut: 96_200_000, server: "hotspot", loginBy: "cookie" },
      { id: "*a2", user: "compta-01", address: "10.5.50.31", mac: "6C:3B:6B:1A:22:02", uptime: "5h02m10s", timeLeft: "6h48m", bytesIn: 48_100_000, bytesOut: 310_400_000, server: "hotspot", loginBy: "http-chap" },
      { id: "*a3", user: "direction", address: "10.5.50.8", mac: "6C:3B:6B:1A:22:03", uptime: "1d4h32m", timeLeft: "never", bytesIn: 320_000_000, bytesOut: 1_980_000_000, server: "hotspot", loginBy: "http-chap" },
      { id: "*a4", user: "invite-01", address: "10.5.50.112", mac: "A4:2B:8C:11:44:07", uptime: "0h42m08s", timeLeft: "4m05s", bytesIn: 5_200_000, bytesOut: 28_400_000, server: "hotspot", loginBy: "http-chap" },
      { id: "*a5", user: "technicien-02", address: "10.5.50.44", mac: "6C:3B:6B:1A:22:04", uptime: "3h11m56s", timeLeft: "1d02h", bytesIn: 88_000_000, bytesOut: 505_000_000, server: "hotspot", loginBy: "cookie" },
    ];

    this.pppSecrets = [
      { id: "*s1", name: "agence-lome", password: "Ppp0e-Lome!", service: "pppoe", profile: "default", localAddress: "10.10.0.1", remoteAddress: "10.10.0.10", comment: "Liaison agence Lomé", disabled: false },
      { id: "*s2", name: "agence-kara", password: "Ppp0e-Kara!", service: "pppoe", profile: "default", localAddress: "10.10.0.1", remoteAddress: "10.10.0.11", comment: "Liaison agence Kara", disabled: false },
      { id: "*s3", name: "site-sokode", password: "Ppp0e-Sokode!", service: "pppoe", profile: "default", localAddress: "10.10.0.1", remoteAddress: "10.10.0.12", comment: "Liaison Sokodé", disabled: false },
      { id: "*s4", name: "vpn-direction", password: "Vpn-D1rect10n", service: "l2tp", profile: "default", localAddress: "10.10.0.1", remoteAddress: "10.10.0.30", comment: "Accès distant direction", disabled: false },
      { id: "*s5", name: "vpn-support", password: "Vpn-Supp0rt", service: "l2tp", profile: "default", localAddress: "10.10.0.1", remoteAddress: "10.10.0.31", comment: "Support technique", disabled: false },
      { id: "*s6", name: "backup-4g", password: "Backup-4G-2026", service: "pppoe", profile: "default", localAddress: "", remoteAddress: "", comment: "Liaison de secours 4G", disabled: true },
    ];

    this.pppActive = [
      { id: "*pa1", name: "agence-lome", address: "10.10.0.10", uptime: "6d2h14m", service: "pppoe", callerId: "6C:3B:6B:99:10:01", bytesIn: 4_200_000_000, bytesOut: 1_850_000_000 },
      { id: "*pa2", name: "agence-kara", address: "10.10.0.11", uptime: "2d18h03m", service: "pppoe", callerId: "6C:3B:6B:99:10:02", bytesIn: 2_100_000_000, bytesOut: 980_000_000 },
      { id: "*pa3", name: "vpn-direction", address: "10.10.0.30", uptime: "4h27m", service: "l2tp", callerId: "102.64.18.44", bytesIn: 240_000_000, bytesOut: 96_000_000 },
    ];

    this.interfaces = [
      { id: "*i1", name: "ether1", type: "ether", running: true, disabled: false, rxByte: 48_200_000_000, txByte: 12_800_000_000, baseRx: 118_000_000, baseTx: 34_000_000, mac: "6C:3B:6B:99:10:01", comment: "WAN fibre", mtu: 1500 },
      { id: "*i2", name: "ether2", type: "ether", running: true, disabled: false, rxByte: 6_400_000_000, txByte: 21_300_000_000, baseRx: 12_000_000, baseTx: 68_000_000, mac: "6C:3B:6B:99:10:02", comment: "LAN bureaux", mtu: 1500 },
      { id: "*i3", name: "ether3", type: "ether", running: true, disabled: false, rxByte: 1_800_000_000, txByte: 7_100_000_000, baseRx: 5_000_000, baseTx: 22_000_000, mac: "6C:3B:6B:99:10:03", comment: "Serveurs", mtu: 1500 },
      { id: "*i4", name: "bridge-hotspot", type: "bridge", running: true, disabled: false, rxByte: 9_200_000_000, txByte: 26_400_000_000, baseRx: 28_000_000, baseTx: 92_000_000, mac: "6C:3B:6B:99:10:04", comment: "Bridge invités", mtu: 1500 },
      { id: "*i5", name: "wlan1", type: "wifi", running: true, disabled: false, rxByte: 4_700_000_000, txByte: 11_900_000_000, baseRx: 16_000_000, baseTx: 38_000_000, mac: "6C:3B:6B:99:10:05", comment: "Wi-Fi invités", mtu: 1500 },
      { id: "*i6", name: "vlan-10", type: "vlan", running: true, disabled: false, rxByte: 2_300_000_000, txByte: 5_800_000_000, baseRx: 8_000_000, baseTx: 21_000_000, mac: "6C:3B:6B:99:10:06", comment: "VLAN administration", mtu: 1500 },
      { id: "*i7", name: "lte1", type: "lte", running: false, disabled: true, rxByte: 120_000_000, txByte: 44_000_000, baseRx: 0, baseTx: 0, mac: "", comment: "Secours 4G", mtu: 1500 },
    ];

    this.logs = [
      { id: "*l1", time: nowLabel(), topics: "hotspot,info", message: "accueil-01 logged in from 10.5.50.24" },
      { id: "*l2", time: nowLabel(), topics: "ppp,info", message: "agence-lome connected (10.10.0.10)" },
      { id: "*l3", time: nowLabel(), topics: "system,info", message: "configuration saved by admin" },
      { id: "*l4", time: nowLabel(), topics: "hotspot,warning", message: "invite-02: limit-bytes-total reached" },
      { id: "*l5", time: nowLabel(), topics: "interface,info", message: "ether1 link up (1Gbps full duplex)" },
      { id: "*l6", time: nowLabel(), topics: "system,info,account", message: "user admin logged in via api" },
    ];

    this.hosts = [
      { id: "*h1", mac: "6C:3B:6B:1A:22:01", address: "10.5.50.24", toAddress: "", server: "hotspot", uptime: "2h18m44s", bytesIn: 18_400_000, bytesOut: 96_200_000, comment: "PC accueil", authorized: true, disabled: false },
      { id: "*h2", mac: "6C:3B:6B:1A:22:02", address: "10.5.50.31", toAddress: "", server: "hotspot", uptime: "5h02m10s", bytesIn: 48_100_000, bytesOut: 310_400_000, comment: "PC comptabilité", authorized: true, disabled: false },
      { id: "*h3", mac: "6C:3B:6B:1A:22:03", address: "10.5.50.8", toAddress: "", server: "hotspot", uptime: "1d4h32m", bytesIn: 320_000_000, bytesOut: 1_980_000_000, comment: "Bureau direction", authorized: true, disabled: false },
      { id: "*h4", mac: "A4:2B:8C:11:44:07", address: "10.5.50.112", toAddress: "", server: "hotspot", uptime: "0h42m08s", bytesIn: 5_200_000, bytesOut: 28_400_000, comment: "Téléphone visiteur", authorized: true, disabled: false },
      { id: "*h5", mac: "6C:3B:6B:1A:22:04", address: "10.5.50.44", toAddress: "", server: "hotspot", uptime: "3h11m56s", bytesIn: 88_000_000, bytesOut: 505_000_000, comment: "Portable technicien", authorized: true, disabled: false },
      { id: "*h6", mac: "D8:3A:DD:52:10:9A", address: "10.5.50.121", toAddress: "", server: "hotspot", uptime: "0h06m12s", bytesIn: 900_000, bytesOut: 3_400_000, comment: "Tablette réunion", authorized: false, disabled: false },
      { id: "*h7", mac: "F0:9F:C2:88:31:70", address: "10.5.50.133", toAddress: "", server: "hotspot", uptime: "0h00m48s", bytesIn: 120_000, bytesOut: 480_000, comment: "", authorized: false, disabled: false },
      { id: "*h8", mac: "6C:3B:6B:1A:22:09", address: "10.5.50.51", toAddress: "", server: "hotspot", uptime: "1d02h", bytesIn: 210_000_000, bytesOut: 940_000_000, comment: "Caisse", authorized: true, disabled: false },
    ];

    this.bindings = [
      { id: "*b1", mac: "A4:2B:8C:11:44:07", address: "10.5.50.112", toAddress: "", server: "hotspot", type: "regular", comment: "Imprimante réception", disabled: false },
      { id: "*b2", mac: "6C:3B:6B:1A:22:09", address: "10.5.50.51", toAddress: "", server: "hotspot", type: "bypassed", comment: "Caisse — accès direct", disabled: false },
      { id: "*b3", mac: "F0:9F:C2:88:31:70", address: "10.5.50.133", toAddress: "", server: "hotspot", type: "blocked", comment: "Appareil non autorisé", disabled: false },
      { id: "*b4", mac: "D8:3A:DD:52:10:9A", address: "10.5.50.121", toAddress: "10.5.50.40", server: "hotspot", type: "regular", comment: "Redirection tablette réunion", disabled: true },
    ];

    this.cookies = [
      { id: "*c1", user: "accueil-01", mac: "6C:3B:6B:1A:22:01", domain: "hotspot.local", expires: "23h58m", comment: "Réception" },
      { id: "*c2", user: "direction", mac: "6C:3B:6B:1A:22:03", domain: "hotspot.local", expires: "29d", comment: "Bureau direction" },
      { id: "*c3", user: "invite-01", mac: "A4:2B:8C:11:44:07", domain: "hotspot.local", expires: "6h12m", comment: "Visiteur" },
      { id: "*c4", user: "technicien-02", mac: "6C:3B:6B:1A:22:04", domain: "hotspot.local", expires: "27d", comment: "Équipe technique" },
    ];

    this.dhcpLeases = [
      { id: "*d1", address: "10.5.50.24", mac: "6C:3B:6B:1A:22:01", hostName: "accueil-01", server: "dhcp-hotspot", status: "bound", expiresAfter: "23h12m", dynamic: true, disabled: false, comment: "" },
      { id: "*d2", address: "10.5.50.31", mac: "6C:3B:6B:1A:22:02", hostName: "compta-01", server: "dhcp-hotspot", status: "bound", expiresAfter: "22h48m", dynamic: true, disabled: false, comment: "" },
      { id: "*d3", address: "10.5.50.8", mac: "6C:3B:6B:1A:22:03", hostName: "direction", server: "dhcp-hotspot", status: "bound", expiresAfter: "1d02h", dynamic: true, disabled: false, comment: "" },
      { id: "*d4", address: "10.5.50.112", mac: "A4:2B:8C:11:44:07", hostName: "invite-01", server: "dhcp-hotspot", status: "bound", expiresAfter: "5h51m", dynamic: true, disabled: false, comment: "" },
      { id: "*d5", address: "10.5.50.44", mac: "6C:3B:6B:1A:22:04", hostName: "technicien-02", server: "dhcp-hotspot", status: "bound", expiresAfter: "2d11h", dynamic: true, disabled: false, comment: "" },
      { id: "*d6", address: "10.5.50.121", mac: "D8:3A:DD:52:10:9A", hostName: "tablette-reunion", server: "dhcp-hotspot", status: "waiting", expiresAfter: "", dynamic: true, disabled: false, comment: "" },
      { id: "*d7", address: "10.5.50.51", mac: "6C:3B:6B:1A:22:09", hostName: "caisse-01", server: "dhcp-hotspot", status: "bound", expiresAfter: "3d", dynamic: false, disabled: false, comment: "Bail statique caisse" },
    ];

    this.firewall = {
      filter: [
        { id: "*ff1", type: "filter", chain: "input", action: "accept", protocol: "icmp", srcAddress: "", dstAddress: "", srcPort: "", dstPort: "", inInterface: "ether2", outInterface: "", connectionState: "", comment: "Autoriser le ping interne", disabled: false, dynamic: false, packets: 184_320, bytes: 12_640_000 },
        { id: "*ff2", type: "filter", chain: "input", action: "accept", protocol: "tcp", srcAddress: "10.5.50.0/24", dstAddress: "", srcPort: "", dstPort: "8291,8728,22", inInterface: "bridge-hotspot", outInterface: "", connectionState: "new", comment: "Administration depuis le LAN", disabled: false, dynamic: false, packets: 9_412, bytes: 3_120_000 },
        { id: "*ff3", type: "filter", chain: "input", action: "drop", protocol: "tcp", srcAddress: "", dstAddress: "", srcPort: "", dstPort: "23,21,80", inInterface: "ether1", outInterface: "", connectionState: "new", comment: "Bloquer telnet/FTP/HTTP depuis le WAN", disabled: false, dynamic: false, packets: 2_184_003, bytes: 148_200_000 },
        { id: "*ff4", type: "filter", chain: "input", action: "drop", protocol: "all", srcAddress: "", dstAddress: "", srcPort: "", dstPort: "", inInterface: "ether1", outInterface: "", connectionState: "invalid", comment: "Rejeter les paquets invalides", disabled: false, dynamic: false, packets: 41_882, bytes: 6_410_000 },
        { id: "*ff5", type: "filter", chain: "input", action: "accept", protocol: "udp", srcAddress: "", dstAddress: "", srcPort: "", dstPort: "53", inInterface: "bridge-hotspot", outInterface: "", connectionState: "new", comment: "DNS local (hotspot)", disabled: false, dynamic: false, packets: 1_204_512, bytes: 96_400_000 },
        { id: "*ff6", type: "filter", chain: "input", action: "accept", protocol: "all", srcAddress: "", dstAddress: "", srcPort: "", dstPort: "", inInterface: "ether1", outInterface: "", connectionState: "established,related", comment: "Connexions établies", disabled: false, dynamic: false, packets: 28_400_118, bytes: 4_820_000_000 },
        { id: "*ff7", type: "filter", chain: "input", action: "drop", protocol: "all", srcAddress: "", dstAddress: "", srcPort: "", dstPort: "", inInterface: "", outInterface: "", connectionState: "", comment: "Rejet par défaut (input)", disabled: false, dynamic: false, packets: 3_402_880, bytes: 284_100_000 },
        { id: "*ff8", type: "filter", chain: "forward", action: "accept", protocol: "all", srcAddress: "", dstAddress: "", srcPort: "", dstPort: "", inInterface: "bridge-hotspot", outInterface: "ether1", connectionState: "established,related", comment: "Retour trafic hotspot", disabled: false, dynamic: false, packets: 184_400_812, bytes: 42_800_000_000 },
        { id: "*ff9", type: "filter", chain: "forward", action: "accept", protocol: "all", srcAddress: "10.5.50.0/24", dstAddress: "", srcPort: "", dstPort: "", inInterface: "bridge-hotspot", outInterface: "ether1", connectionState: "new", comment: "Sortie Internet hotspot", disabled: false, dynamic: false, packets: 12_804_220, bytes: 8_240_000_000 },
        { id: "*ff10", type: "filter", chain: "forward", action: "drop", protocol: "all", srcAddress: "", dstAddress: "", srcPort: "", dstPort: "", inInterface: "ether1", outInterface: "bridge-hotspot", connectionState: "new", comment: "Interdire les entrées WAN vers hotspot", disabled: true, dynamic: false, packets: 0, bytes: 0 },
      ],
      nat: [
        { id: "*fn1", type: "nat", chain: "srcnat", action: "masquerade", protocol: "all", srcAddress: "", dstAddress: "", srcPort: "", dstPort: "", inInterface: "", outInterface: "ether1", connectionState: "", comment: "NAT sortie Internet", disabled: false, dynamic: false, packets: 188_204_118, bytes: 46_800_000_000 },
        { id: "*fn2", type: "nat", chain: "dstnat", action: "dst-nat", protocol: "tcp", srcAddress: "", dstAddress: "196.200.18.4", srcPort: "", dstPort: "8080", inInterface: "ether1", outInterface: "", connectionState: "", comment: "Redirection portail captif", disabled: false, dynamic: false, packets: 982_140, bytes: 88_400_000 },
        { id: "*fn3", type: "nat", chain: "dstnat", action: "redirect", protocol: "tcp", srcAddress: "", dstAddress: "", srcPort: "", dstPort: "80", inInterface: "bridge-hotspot", outInterface: "", connectionState: "", comment: "Forcer le portail hotspot", disabled: false, dynamic: true, packets: 48_120, bytes: 4_200_000 },
      ],
      mangle: [
        { id: "*fm1", type: "mangle", chain: "prerouting", action: "mark-connection", protocol: "tcp", srcAddress: "", dstAddress: "", srcPort: "", dstPort: "80,443", inInterface: "bridge-hotspot", outInterface: "", connectionState: "new", comment: "Marquer navigation web", disabled: false, dynamic: false, packets: 8_204_112, bytes: 480_200_000 },
        { id: "*fm2", type: "mangle", chain: "forward", action: "change-ttl", protocol: "all", srcAddress: "", dstAddress: "", srcPort: "", dstPort: "", inInterface: "bridge-hotspot", outInterface: "ether1", connectionState: "", comment: "Normaliser le TTL invités", disabled: true, dynamic: false, packets: 0, bytes: 0 },
      ],
      raw: [
        { id: "*fr1", type: "raw", chain: "prerouting", action: "drop", protocol: "all", srcAddress: "", dstAddress: "", srcPort: "", dstPort: "", inInterface: "ether1", outInterface: "", connectionState: "", comment: "Filtrer avant conntrack", disabled: false, dynamic: false, packets: 1_820_014, bytes: 182_400_000 },
      ],
    };

    this.queues = [
      { id: "*q1", name: "hotspot-global", target: "10.5.50.0/24", rate: "18.4M/42.1M", maxLimit: "30M/80M", burstLimit: "40M/100M", priority: "6/6", packets: 28_402_118, bytes: 8_420_000_000, comment: "Limite globale invités", disabled: false, dynamic: false },
      { id: "*q2", name: "direction", target: "10.5.50.8", rate: "4.2M/18.8M", maxLimit: "20M/40M", burstLimit: "30M/60M", priority: "2/2", packets: 1_204_880, bytes: 1_980_000_000, comment: "Priorité bureau direction", disabled: false, dynamic: false },
      { id: "*q3", name: "comptabilite", target: "10.5.50.31", rate: "1.1M/6.4M", maxLimit: "10M/20M", burstLimit: "", priority: "4/4", packets: 480_240, bytes: 320_400_000, comment: "Poste comptabilité", disabled: false, dynamic: false },
      { id: "*q4", name: "invites-limites", target: "10.5.50.112/32", rate: "0.4M/1.2M", maxLimit: "2M/4M", burstLimit: "4M/8M", priority: "8/8", packets: 82_400, bytes: 28_400_000, comment: "Visiteurs bridés", disabled: false, dynamic: false },
      { id: "*q5", name: "serveurs", target: "10.10.0.0/24", rate: "0/0", maxLimit: "0/0", burstLimit: "", priority: "1/1", packets: 0, bytes: 0, comment: "File désactivée", disabled: true, dynamic: false },
      { id: "*q6", name: "sokode-link", target: "10.10.0.12/32", rate: "6.2M/6.2M", maxLimit: "12M/12M", burstLimit: "20M/20M", priority: "5/5", packets: 2_840_120, bytes: 2_100_000_000, comment: "Liaison PPP Sokodé", disabled: false, dynamic: true },
    ];

    this.vlans = [
      { id: "*v1", name: "vlan-10", vlanId: 10, interface: "bridge-hotspot", mtu: 1500, running: true, disabled: false, comment: "Administration" },
      { id: "*v2", name: "vlan-20", vlanId: 20, interface: "bridge-hotspot", mtu: 1500, running: true, disabled: false, comment: "Invités" },
      { id: "*v3", name: "vlan-30", vlanId: 30, interface: "ether3", mtu: 1500, running: true, disabled: false, comment: "Serveurs" },
      { id: "*v4", name: "vlan-40", vlanId: 40, interface: "ether2", mtu: 1500, running: false, disabled: true, comment: "Téléphonie (préparé)" },
    ];

    this.routes = [
      { id: "*r1", dstAddress: "0.0.0.0/0", gateway: "196.200.18.1", distance: 1, prefSrc: "196.200.18.4", active: true, dynamic: false, connect: false, disabled: false, comment: "Route par défaut fibre" },
      { id: "*r2", dstAddress: "0.0.0.0/0", gateway: "lte1", distance: 10, prefSrc: "", active: false, dynamic: false, connect: false, disabled: true, comment: "Secours 4G" },
      { id: "*r3", dstAddress: "10.5.50.0/24", gateway: "bridge-hotspot", distance: 0, prefSrc: "10.5.50.1", active: true, dynamic: false, connect: true, disabled: false, comment: "Réseau hotspot" },
      { id: "*r4", dstAddress: "10.10.0.0/24", gateway: "ether3", distance: 0, prefSrc: "10.10.0.1", active: true, dynamic: false, connect: true, disabled: false, comment: "Réseau serveurs" },
      { id: "*r5", dstAddress: "10.20.0.0/24", gateway: "vpn-pool", distance: 1, prefSrc: "", active: false, dynamic: true, connect: false, disabled: false, comment: "Pool VPN (dynamique)" },
      { id: "*r6", dstAddress: "192.168.88.0/24", gateway: "196.200.18.9", distance: 5, prefSrc: "", active: true, dynamic: false, connect: false, disabled: false, comment: "Route agence Lomé" },
    ];
  }

  async connect() {
    await wait(420);
    return true;
  }

  async close() {
    return true;
  }

  async getDashboard() {
    await wait(60);
    const now = Date.now();
    const seconds = Math.max(0.6, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.tick += 1;

    const interfaces = this.interfaces.map((iface, index) => {
      let rxRate = 0;
      let txRate = 0;
      if (iface.running && !iface.disabled) {
        const wave = 0.72 + 0.22 * Math.sin(this.tick / 2.4 + index) + 0.06 * Math.sin(this.tick / 0.8 + index * 2);
        const spike = index === 0 && this.tick % 17 < 3 ? 1.18 : 1;
        rxRate = iface.baseRx * wave * spike;
        txRate = iface.baseTx * (0.68 + 0.3 * Math.sin(this.tick / 3.1 + index * 1.7));
        iface.rxByte += rxRate * seconds;
        iface.txByte += txRate * seconds;
      }
      return {
        id: iface.id,
        name: iface.name,
        type: iface.type,
        running: iface.running,
        disabled: iface.disabled,
        rxByte: Math.round(iface.rxByte),
        txByte: Math.round(iface.txByte),
        rxRate: Math.round(rxRate),
        txRate: Math.round(txRate),
        mac: iface.mac,
        comment: iface.comment,
        mtu: iface.mtu,
      };
    });

    const totalRx = interfaces.reduce((sum, iface) => sum + iface.rxRate, 0);
    const totalTx = interfaces.reduce((sum, iface) => sum + iface.txRate, 0);
    const cpu = Math.min(96, Math.max(4, this.cpuBase + 8 * Math.sin(this.tick / 3.2) + Math.random() * 5));
    const memUsage = 0.56 + 0.05 * Math.sin(this.tick / 5.5) + Math.random() * 0.015;
    const totalMemory = 512 * 1024 * 1024;
    const totalDisk = 128 * 1024 * 1024;
    const diskUsage = 0.38 + Math.random() * 0.004;

    return {
      identity: this.identity,
      version: this.version,
      board: this.board,
      architecture: this.architecture,
      uptime: this.formatUptime(Date.now() - this.startedAt),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      cpuLoad: Math.round(cpu),
      cpuCount: 4,
      cpuFrequency: "1400MHz",
      totalMemory,
      freeMemory: Math.round(totalMemory * (1 - memUsage)),
      memoryUsage: Math.round(memUsage * 100),
      totalDisk,
      freeDisk: Math.round(totalDisk * (1 - diskUsage)),
      diskUsage: Math.round(diskUsage * 100),
      temperature: 41 + Math.round(Math.sin(this.tick / 7) * 2),
      interfaces,
      totalRx,
      totalTx,
      hotspotUsers: this.users.length,
      hotspotActive: this.active.length,
      hotspotProfiles: this.profiles.length,
      pppSecrets: this.pppSecrets.length,
      pppActive: this.pppActive.length,
      logs: this.logs.slice(0, 6),
      demo: true,
    };
  }

  formatUptime(ms) {
    const total = Math.floor(ms / 1000);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (days > 0) return `${days}d${hours}h${String(minutes).padStart(2, "0")}m`;
    if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m${String(seconds).padStart(2, "0")}s`;
    return `${minutes}m${String(seconds).padStart(2, "0")}s`;
  }

  pushLog(topics, message) {
    this.logs.unshift({ id: `*l${++this.seq}`, time: nowLabel(), topics, message });
    if (this.logs.length > 400) this.logs.length = 400;
  }

  async listHotspotUsers() {
    await wait(50);
    return this.users.map((user) => ({ ...user }));
  }

  async saveHotspotUser(payload) {
    await wait(160);
    const input = payload || {};
    const profile = resolveProfile(input.profile, this.profiles, "profil hotspot");
    const server = this.resolveHotspotServer(input.server);
    const limitUptime = normalizeDuration(input.limitUptime, "La limite de temps");
    const limitBytesTotal = normalizeBytes(input.limitBytesTotal, "La limite de données");
    const comment = validateComment(input.comment, "Le commentaire");

    if (input.isNew) {
      const name = validateName(input.name, "Le nom d'utilisateur", { max: 64 });
      if (this.users.some((user) => user.name === name)) {
        throw new Error(`L'utilisateur « ${name} » existe déjà.`);
      }
      const user = {
        id: `*u${++this.seq}`,
        name,
        password: input.password || randomString(4, PASSWORD_CHARS),
        profile,
        server,
        comment,
        disabled: Boolean(input.disabled),
        limitUptime,
        limitBytesTotal,
        bytesIn: 0,
        bytesOut: 0,
        uptime: "",
      };
      this.users.unshift(user);
      this.pushLog("hotspot,info", `user ${user.name} added by admin`);
      return user;
    }

    const user = this.users.find((item) => item.id === input.id);
    if (!user) throw new Error("Utilisateur introuvable sur le routeur.");
    user.name = validateName(input.name !== undefined ? input.name : user.name, "Le nom d'utilisateur", {
      max: 64,
    });
    user.password = input.password !== undefined ? String(input.password) : user.password;
    user.profile = profile;
    user.server = server;
    user.comment = comment;
    user.disabled = Boolean(input.disabled);
    user.limitUptime = limitUptime;
    user.limitBytesTotal = limitBytesTotal;
    this.pushLog("hotspot,info", `user ${user.name} updated by admin`);
    return user;
  }

  resolveHotspotServer(value) {
    const raw = normalizeText(value);
    if (!raw || raw.toLowerCase() === "all") return "all";
    return resolveChoice(
      raw,
      this.hotspotServers.map((server) => server.name),
      "Le serveur hotspot"
    );
  }

  async removeHotspotUser(id) {
    await wait(120);
    const user = this.users.find((item) => item.id === id);
    this.users = this.users.filter((item) => item.id !== id);
    this.active = this.active.filter((item) => !user || item.user !== user.name);
    this.pushLog("hotspot,info", `user ${user ? user.name : id} removed by admin`);
    return true;
  }

  async toggleHotspotUser(id, disabled) {
    await wait(100);
    const user = this.users.find((item) => item.id === id);
    if (!user) throw new Error("Utilisateur introuvable sur le routeur.");
    user.disabled = Boolean(disabled);
    this.pushLog("hotspot,info", `user ${user.name} ${user.disabled ? "disabled" : "enabled"}`);
    return user;
  }

  async listActiveHotspot() {
    await wait(60);
    return this.active.map((session) => ({ ...session }));
  }

  async kickHotspot(id) {
    await wait(100);
    const session = this.active.find((item) => item.id === id);
    this.active = this.active.filter((item) => item.id !== id);
    this.pushLog("hotspot,info", `${session ? session.user : id} logged out by admin`);
    return true;
  }

  async listHotspotProfiles() {
    await wait(50);
    return this.profiles.map((profile) => ({ ...profile }));
  }

  async listHotspotServers() {
    await wait(50);
    return this.hotspotServers.map((server) => ({ ...server }));
  }

  async listPppProfiles() {
    await wait(50);
    return this.pppProfiles.map((profile) => ({ ...profile }));
  }

  async createVouchers(options) {
    const input = options || {};
    const count = Math.max(1, Math.min(200, Number(input.count) || 1));
    const prefix = (input.prefix || "").trim();
    const userLength = Math.max(3, Math.min(12, Number(input.userLength) || 5));
    const passLength = Math.max(3, Math.min(12, Number(input.passLength) || 4));
    const profile = resolveProfile(input.profile, this.profiles, "profil hotspot");
    const server = this.resolveHotspotServer(input.server);
    const limitUptime = normalizeDuration(input.limitUptime, "La limite de temps");
    const limitBytesTotal = normalizeBytes(input.limitBytesTotal, "La limite de données");
    const comment = validateComment(input.comment || "Voucher", "Le commentaire");
    const created = [];
    const errors = [];
    const used = new Set(this.users.map((user) => user.name));

    for (let i = 0; i < count; i += 1) {
      let name = prefix + randomString(userLength, CHARSET);
      let guard = 0;
      while (used.has(name) && guard < 20) {
        name = prefix + randomString(userLength, CHARSET);
        guard += 1;
      }
      used.add(name);
      const user = {
        id: `*u${++this.seq}`,
        name,
        password: randomString(passLength, PASSWORD_CHARS),
        profile,
        server,
        comment,
        disabled: false,
        limitUptime,
        limitBytesTotal,
        bytesIn: 0,
        bytesOut: 0,
        uptime: "",
      };
      this.users.unshift(user);
      created.push({ ...user, index: i + 1, price: input.price || "" });
    }

    await wait(Math.min(1200, 120 + count * 12));
    this.pushLog("hotspot,info", `${created.length} voucher(s) generated by admin`);
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
    const profile = resolveProfile(input.profile, this.profiles, "profil hotspot");
    const server = this.resolveHotspotServer(input.server);
    const limitUptime = normalizeDuration(input.limitUptime, "La limite de temps");
    const limitBytesTotal = normalizeBytes(input.limitBytesTotal, "La limite de données");
    const comment = validateComment(input.comment || "Génération MikroDesk", "Le commentaire");
    const created = [];
    const errors = [];
    const used = new Set(this.users.map((user) => user.name));

    for (let i = 0; i < count; i += 1) {
      let number = start + i;
      let name = `${prefix}${String(number).padStart(padding, "0")}`;
      while (used.has(name) && number < start + count + 500) {
        number += 1;
        name = `${prefix}${String(number).padStart(padding, "0")}`;
      }
      if (used.has(name)) {
        errors.push({ name, error: "Collision de nom, utilisateur ignoré." });
        continue;
      }
      used.add(name);
      let password;
      if (passwordMode === "same" && fixedPassword) password = fixedPassword;
      else if (passwordMode === "name") password = name;
      else password = randomString(Math.max(4, Number(input.passLength) || 4), PASSWORD_CHARS);

      const user = {
        id: `*u${++this.seq}`,
        name,
        password,
        profile,
        server,
        comment,
        disabled: false,
        limitUptime,
        limitBytesTotal,
        bytesIn: 0,
        bytesOut: 0,
        uptime: "",
      };
      this.users.unshift(user);
      created.push({ ...user, index: i + 1 });
    }

    await wait(Math.min(1500, 140 + count * 14));
    this.pushLog("hotspot,info", `${created.length} user(s) generated by admin`);
    return { created, errors, count: created.length, requested: count };
  }

  async listHotspotHosts() {
    await wait(60);
    return this.hosts.map((host) => ({ ...host }));
  }

  async removeHotspotHost(id) {
    await wait(110);
    const host = this.hosts.find((item) => item.id === id);
    this.hosts = this.hosts.filter((item) => item.id !== id);
    this.pushLog("hotspot,info", `host ${host ? host.mac : id} removed by admin`);
    return true;
  }

  async listHotspotBindings() {
    await wait(50);
    return this.bindings.map((binding) => ({ ...binding }));
  }

  async saveHotspotBinding(payload) {
    await wait(140);
    const input = payload || {};
    const mac = normalizeMac(input.mac);
    const address = validateIP(input.address, "L'adresse IP", { optional: true, allowCidr: true });
    const toAddress = validateIP(input.toAddress, "L'adresse de redirection", { optional: true });
    const server = this.resolveHotspotServer(input.server);
    const type = assertChoice(input.type || "regular", BINDING_TYPES, "Le type de liaison");
    const comment = validateComment(input.comment, "Le commentaire");
    if (input.isNew) {
      const binding = {
        id: `*b${++this.seq}`,
        mac,
        address,
        toAddress,
        server,
        type,
        comment,
        disabled: Boolean(input.disabled),
      };
      this.bindings.unshift(binding);
      this.pushLog("hotspot,info", `ip-binding ${binding.mac} added by admin`);
      return binding;
    }
    const binding = this.bindings.find((item) => item.id === input.id);
    if (!binding) throw new Error("Liaison IP introuvable sur le routeur.");
    Object.assign(binding, {
      mac,
      address,
      toAddress,
      server,
      type,
      comment,
      disabled: Boolean(input.disabled),
    });
    this.pushLog("hotspot,info", `ip-binding ${binding.mac} updated by admin`);
    return binding;
  }

  async removeHotspotBinding(id) {
    await wait(110);
    const binding = this.bindings.find((item) => item.id === id);
    this.bindings = this.bindings.filter((item) => item.id !== id);
    this.pushLog("hotspot,info", `ip-binding ${binding ? binding.mac : id} removed by admin`);
    return true;
  }

  async toggleHotspotBinding(id, disabled) {
    await wait(90);
    const binding = this.bindings.find((item) => item.id === id);
    if (!binding) throw new Error("Liaison IP introuvable sur le routeur.");
    binding.disabled = Boolean(disabled);
    this.pushLog("hotspot,info", `ip-binding ${binding.mac} ${binding.disabled ? "disabled" : "enabled"}`);
    return binding;
  }

  async listHotspotCookies() {
    await wait(50);
    return this.cookies.map((cookie) => ({ ...cookie }));
  }

  async removeHotspotCookie(id) {
    await wait(90);
    const cookie = this.cookies.find((item) => item.id === id);
    this.cookies = this.cookies.filter((item) => item.id !== id);
    this.pushLog("hotspot,info", `cookie ${cookie ? cookie.user : id} removed by admin`);
    return true;
  }

  async listDhcpLeases() {
    await wait(60);
    return this.dhcpLeases.map((lease) => ({ ...lease }));
  }

  async removeDhcpLease(id) {
    await wait(100);
    const lease = this.dhcpLeases.find((item) => item.id === id);
    this.dhcpLeases = this.dhcpLeases.filter((item) => item.id !== id);
    this.pushLog("dhcp,info", `lease ${lease ? lease.address : id} removed by admin`);
    return true;
  }

  async listPppSecrets() {
    await wait(50);
    return this.pppSecrets.map((secret) => ({ ...secret }));
  }

  async savePppSecret(payload) {
    await wait(140);
    const input = payload || {};
    const service = assertChoice(input.service || "any", PPP_SERVICES, "Le service PPP");
    const profile = resolveProfile(input.profile, this.pppProfiles, "profil PPP");
    const localAddress = validateAddressOrPool(input.localAddress, "L'adresse locale");
    const remoteAddress = validateAddressOrPool(input.remoteAddress, "L'adresse distante");
    const comment = validateComment(input.comment, "Le commentaire");

    if (input.isNew) {
      const name = validateName(input.name, "Le nom du secret", { max: 64 });
      if (this.pppSecrets.some((secret) => secret.name === name)) {
        throw new Error(`Le secret « ${name} » existe déjà.`);
      }
      const secret = {
        id: `*s${++this.seq}`,
        name,
        password: input.password || "",
        service,
        profile,
        localAddress,
        remoteAddress,
        comment,
        disabled: Boolean(input.disabled),
      };
      this.pppSecrets.unshift(secret);
      this.pushLog("ppp,info", `secret ${secret.name} added by admin`);
      return secret;
    }
    const secret = this.pppSecrets.find((item) => item.id === input.id);
    if (!secret) throw new Error("Secret introuvable sur le routeur.");
    Object.assign(secret, {
      name: validateName(input.name !== undefined ? input.name : secret.name, "Le nom du secret", { max: 64 }),
      password: input.password !== undefined ? String(input.password) : secret.password,
      service,
      profile,
      localAddress,
      remoteAddress,
      comment,
      disabled: Boolean(input.disabled),
    });
    this.pushLog("ppp,info", `secret ${secret.name} updated by admin`);
    return secret;
  }

  async removePppSecret(id) {
    await wait(110);
    const secret = this.pppSecrets.find((item) => item.id === id);
    this.pppSecrets = this.pppSecrets.filter((item) => item.id !== id);
    this.pushLog("ppp,info", `secret ${secret ? secret.name : id} removed by admin`);
    return true;
  }

  async togglePppSecret(id, disabled) {
    await wait(90);
    const secret = this.pppSecrets.find((item) => item.id === id);
    if (!secret) throw new Error("Secret introuvable sur le routeur.");
    secret.disabled = Boolean(disabled);
    this.pushLog("ppp,info", `secret ${secret.name} ${secret.disabled ? "disabled" : "enabled"}`);
    return secret;
  }

  async listPppActive() {
    await wait(50);
    return this.pppActive.map((session) => ({ ...session }));
  }

  async kickPpp(id) {
    await wait(90);
    const session = this.pppActive.find((item) => item.id === id);
    this.pppActive = this.pppActive.filter((item) => item.id !== id);
    this.pushLog("ppp,info", `${session ? session.name : id} disconnected by admin`);
    return true;
  }

  async listInterfaces() {
    await wait(50);
    const snapshot = await this.getDashboard();
    return snapshot.interfaces;
  }

  async toggleInterface(id, disabled) {
    await wait(120);
    const iface = this.interfaces.find((item) => item.id === id);
    if (!iface) throw new Error("Interface introuvable.");
    iface.disabled = Boolean(disabled);
    iface.running = !iface.disabled;
    this.pushLog("interface,info", `${iface.name} ${iface.disabled ? "disabled" : "enabled"} by admin`);
    return iface;
  }

  /* ---------- Pare-feu, files d'attente, VLAN, routage ---------- */

  async listFirewall() {
    await wait(90);
    return ["filter", "nat", "mangle", "raw"].map((type) => ({
      type,
      rules: (this.firewall[type] || []).map((rule) => ({ ...rule })),
    }));
  }

  async toggleFirewallRule(type, id, disabled) {
    await wait(110);
    const list = this.firewall[type];
    if (!list) throw new Error("Type de règle pare-feu inconnu.");
    const rule = list.find((item) => item.id === id);
    if (!rule) throw new Error("Règle pare-feu introuvable sur le routeur.");
    if (rule.dynamic) throw new Error("Une règle dynamique ne peut pas être modifiée manuellement.");
    rule.disabled = Boolean(disabled);
    const label = rule.comment || `règle ${type}`;
    this.pushLog("firewall,info", `firewall ${type} rule "${label}" ${rule.disabled ? "disabled" : "enabled"}`);
    return { ...rule };
  }

  async listQueues() {
    await wait(80);
    return this.queues.map((queue) => ({ ...queue }));
  }

  async toggleQueue(id, disabled) {
    await wait(110);
    const queue = this.queues.find((item) => item.id === id);
    if (!queue) throw new Error("File d'attente introuvable sur le routeur.");
    queue.disabled = Boolean(disabled);
    this.pushLog("queue,info", `simple queue ${queue.name} ${queue.disabled ? "disabled" : "enabled"}`);
    return { ...queue };
  }

  async listVlans() {
    await wait(70);
    return this.vlans.map((vlan) => ({ ...vlan }));
  }

  async listRoutes() {
    await wait(70);
    return this.routes.map((route) => ({ ...route }));
  }

  async getLogs() {
    await wait(60);
    return this.logs.slice(0, 300).map((entry) => ({ ...entry }));
  }

  async ping(target, count) {
    const address = validateHost(target, "La cible");
    const total = Math.max(1, Math.min(20, Number(count) || 4));
    await wait(280 + total * 70);
    const blackhole = /blackhole|unreachable|\.0$/.test(address.toLowerCase());
    const replies = [];
    const times = [];
    for (let index = 0; index < total; index += 1) {
      if (blackhole) {
        replies.push({ host: address, size: 56, ttl: 0, time: "", timeMs: 0, status: "timeout" });
        continue;
      }
      const timeMs = 2.4 + Math.random() * 14 + (index === total - 1 ? 1.2 : 0);
      times.push(timeMs);
      replies.push({
        host: address,
        size: 56,
        ttl: 64 - index,
        time: `${timeMs.toFixed(1)}ms`,
        timeMs,
        status: "echo reply",
      });
    }
    const received = times.length;
    return {
      target: address,
      count: total,
      replies,
      sent: total,
      received,
      loss: Math.round(((total - received) / total) * 100),
      min: times.length ? Math.min(...times) : 0,
      avg: times.length ? times.reduce((sum, value) => sum + value, 0) / times.length : 0,
      max: times.length ? Math.max(...times) : 0,
    };
  }

  async traceroute(target) {
    const address = validateHost(target, "La cible");
    await wait(620);
    return {
      target: address,
      hops: [
        { hop: 1, address: "10.5.50.1", loss: "0%", sent: "1", last: "1ms", avg: "1ms", best: "1ms", worst: "1ms", status: "" },
        { hop: 2, address: "102.64.18.1", loss: "0%", sent: "1", last: "8ms", avg: "8ms", best: "8ms", worst: "8ms", status: "" },
        { hop: 3, address: "41.188.0.1", loss: "0%", sent: "1", last: "14ms", avg: "14ms", best: "14ms", worst: "14ms", status: "" },
        { hop: 4, address, loss: "0%", sent: "1", last: "21ms", avg: "21ms", best: "21ms", worst: "21ms", status: "reached" },
      ],
    };
  }

  async securityAudit() {
    await wait(520);
    const checks = [
      {
        id: "version",
        title: "Version RouterOS",
        status: "ok",
        detail: `RouterOS ${this.version} détecté.`,
        recommendation: "",
      },
      {
        id: "users",
        title: "Comptes administrateurs",
        status: "warn",
        detail: "2 compte(s) « full » sans restriction d'adresse : admin, vtech.",
        recommendation: "Limitez chaque compte administrateur à une adresse ou un réseau de management.",
      },
      {
        id: "admin",
        title: "Compte « admin »",
        status: "info",
        detail: "Le compte historique « admin » est actif.",
        recommendation: "Renommez-le ou désactivez-le si un autre compte administrateur existe.",
      },
      {
        id: "services-plain",
        title: "Services non chiffrés",
        status: "ok",
        detail: "Aucun service telnet, ftp ou www actif.",
        recommendation: "",
      },
      {
        id: "services-open",
        title: "Services de management",
        status: "ok",
        detail: "Les services api et winbox sont restreints au réseau 10.5.50.0/24.",
        recommendation: "",
      },
      {
        id: "firewall",
        title: "Pare-feu",
        status: "warn",
        detail: "Aucune règle « drop » active dans la chaîne « input ».",
        recommendation: "Ajoutez une règle de rejet par défaut en fin de chaîne input.",
      },
      {
        id: "dns",
        title: "Service DNS",
        status: "info",
        detail: "Les requêtes DNS distantes sont autorisées mais le pare-feu filtre l'input.",
        recommendation: "Vérifiez que le port 53 n'est ouvert qu'aux réseaux internes.",
      },
      {
        id: "snmp",
        title: "SNMP",
        status: "ok",
        detail: "SNMP est désactivé.",
        recommendation: "",
      },
      {
        id: "ntp",
        title: "Synchronisation de l'heure",
        status: "info",
        detail: "Le client NTP est désactivé.",
        recommendation: "Activez NTP pour des journaux et certificats fiables.",
      },
      {
        id: "backup",
        title: "Sauvegardes",
        status: "ok",
        detail: "2 fichier(s) de sauvegarde .backup présents sur le routeur.",
        recommendation: "Téléchargez régulièrement les sauvegardes hors du routeur.",
      },
    ];
    const summary = {
      ok: checks.filter((check) => check.status === "ok").length,
      warn: checks.filter((check) => check.status === "warn").length,
      critical: checks.filter((check) => check.status === "critical").length,
      info: checks.filter((check) => check.status === "info").length,
      unknown: checks.filter((check) => check.status === "unknown").length,
    };
    const score = 84;
    return {
      identity: this.identity,
      version: this.version,
      score,
      grade: "B",
      checks,
      summary,
      counts: { users: 3, services: 6, firewallRules: 14, backups: 2 },
    };
  }

  /* ---------- Sauvegarde / restauration de configuration ---------- */

  configDate() {
    const date = new Date(this.startedAt);
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
      date.getMinutes()
    )}:${pad(date.getSeconds())}`;
  }

  buildExport() {
    const lines = [
      `# ${this.configDate()} by RouterOS ${this.version}`,
      "# software id = DEMO-7K2X-91QF",
      "# modèle exporté par MikroDesk (démonstration)",
      "#",
      "/interface bridge",
    ];
    this.interfaces
      .filter((iface) => iface.type === "bridge")
      .forEach((iface) => {
        lines.push(`add comment="${iface.comment}" name=${iface.name}`);
      });
    lines.push("/interface vlan");
    this.interfaces
      .filter((iface) => iface.type === "vlan")
      .forEach((iface) => {
        lines.push(`add interface=bridge-hotspot name=${iface.name} vlan-id=10`);
      });
    lines.push("/ip hotspot profile");
    this.profiles.forEach((profile) => {
      const parts = [`name=${profile.name}`];
      if (profile.rateLimit) parts.push(`rate-limit="${profile.rateLimit}"`);
      if (profile.sessionTimeout) parts.push(`session-timeout=${profile.sessionTimeout}`);
      if (profile.idleTimeout) parts.push(`idle-timeout=${profile.idleTimeout}`);
      parts.push(`login-by=${profile.loginBy}`);
      parts.push(`shared-users=${profile.sharedUsers}`);
      lines.push(`add ${parts.join(" ")}`);
    });
    lines.push("/ip hotspot");
    this.hotspotServers.forEach((server) => {
      lines.push(
        `add address-pool=${server.addressPool} disabled=no interface=${server.interface} name=${server.name} profile=${server.profile}`
      );
    });
    lines.push("/ip hotspot user profile");
    lines.push("set [ find default=yes ] idle-timeout=none keepalive-timeout=2m");
    lines.push("/ip hotspot user");
    this.users.forEach((user) => {
      const parts = [`name=${user.name}`, `password=${user.password}`, `profile=${user.profile}`];
      if (user.limitUptime && user.limitUptime !== "0") parts.push(`limit-uptime=${user.limitUptime}`);
      if (user.limitBytesTotal && user.limitBytesTotal !== "0") parts.push(`limit-bytes-total=${user.limitBytesTotal}`);
      if (user.comment) parts.push(`comment="${user.comment}"`);
      if (user.disabled) parts.push("disabled=yes");
      lines.push(`add ${parts.join(" ")}`);
    });
    lines.push("/ppp profile");
    this.pppProfiles.forEach((profile) => {
      const parts = [`name=${profile.name}`];
      if (profile.localAddress) parts.push(`local-address=${profile.localAddress}`);
      if (profile.remoteAddress) parts.push(`remote-address=${profile.remoteAddress}`);
      if (profile.rateLimit) parts.push(`rate-limit=${profile.rateLimit}`);
      parts.push(`only-one=${profile.onlyOne}`);
      lines.push(`add ${parts.join(" ")}`);
    });
    lines.push("/ppp secret");
    this.pppSecrets.forEach((secret) => {
      const parts = [`name=${secret.name}`, `password=${secret.password}`, `service=${secret.service}`, `profile=${secret.profile}`];
      if (secret.localAddress) parts.push(`local-address=${secret.localAddress}`);
      if (secret.remoteAddress) parts.push(`remote-address=${secret.remoteAddress}`);
      if (secret.comment) parts.push(`comment="${secret.comment}"`);
      if (secret.disabled) parts.push("disabled=yes");
      lines.push(`add ${parts.join(" ")}`);
    });
    lines.push("/ip pool");
    lines.push('add name=dhcp-hotspot ranges=10.5.50.10-10.5.50.250');
    lines.push("add name=vpn-pool ranges=10.20.0.10-10.20.0.200");
    lines.push("/ip dhcp-server");
    lines.push('add address-pool=dhcp-hotspot interface=bridge-hotspot name=dhcp-hotspot');
    lines.push("/ip dhcp-server lease");
    this.dhcpLeases
      .filter((lease) => !lease.dynamic)
      .forEach((lease) => {
        lines.push(`add address=${lease.address} mac-address=${lease.mac} server=dhcp-hotspot comment="${lease.comment}"`);
      });
    lines.push("/ip address");
    lines.push("add address=10.5.50.1/24 interface=bridge-hotspot network=10.5.50.0");
    lines.push("add address=10.10.0.1/24 interface=ether3 network=10.10.0.0");
    lines.push("/ip dns");
    lines.push("set allow-remote-requests=yes servers=1.1.1.1,8.8.8.8");
    lines.push("/system identity");
    lines.push(`set name="${this.identity}"`);
    lines.push("");
    return lines.join("\n");
  }

  async exportConfig() {
    await wait(220);
    const content = this.buildExport();
    return {
      format: "rsc",
      content,
      lines: content.split("\n").length,
      bytes: Buffer.byteLength(content, "utf8"),
      createdAt: new Date().toISOString(),
    };
  }

  async createRouterBackup() {
    await wait(420);
    const stamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace("T", "-")
      .replace(/[-:]/g, "");
    const name = `mikrodesk-${stamp}.backup`;
    this.pushLog("system,info", `backup saved as ${name} (demo)`);
    return {
      name,
      size: 48_512,
      createdAt: new Date().toISOString(),
      note: "Sauvegarde binaire créée sur le routeur (simulation).",
    };
  }

  async restoreConfig(content) {
    await wait(650);
    const script = String(content || "")
      .replace(/\r\n?/g, "\n")
      .trim();
    if (!script) throw new Error("Le contenu de configuration est vide.");
    if (!script.startsWith("/") && !script.startsWith("#")) {
      throw new Error("Ce contenu ne ressemble pas à un export RouterOS (fichier .rsc attendu).");
    }
    this.pushLog("system,info", "configuration restored from MikroDesk (demo)");
    return {
      parts: script.length > 28000 ? 2 : 1,
      lines: script.split("\n").length,
      bytes: Buffer.byteLength(script, "utf8"),
      at: new Date().toISOString(),
    };
  }

  async reboot() {
    await wait(600);
    this.startedAt = Date.now();
    this.pushLog("system,info", "router rebooted by admin (demo)");
    return true;
  }

  async runTerminalCommand(path, params = []) {
    await wait(90);
    const normalized = String(path || "").replace(/\/+$/, "").toLowerCase();
    const filters = (params || [])
      .filter((param) => typeof param === "string" && param.startsWith("?") && !param.startsWith("?."))
      .map((param) => {
        const raw = param.slice(1);
        const index = raw.indexOf("=");
        return index > 0 ? [raw.slice(0, index), raw.slice(index + 1)] : null;
      })
      .filter(Boolean);
    const apply = (rows) =>
      rows
        .filter((row) =>
          filters.every(([key, value]) => String(row[key] === undefined ? "" : row[key]).toLowerCase() === String(value).toLowerCase())
        )
        .map((row) => ({ ...row }));

    const dashboard = await this.getDashboard();
    const map = {
      "/system/identity/print": () => [{ name: this.identity }],
      "/system/resource/print": () => [
        {
          uptime: dashboard.uptime,
          version: this.version,
          "board-name": this.board,
          architecture: this.architecture,
          "cpu-load": String(dashboard.cpuLoad),
          "free-memory": String(dashboard.freeMemory),
          "total-memory": String(dashboard.totalMemory),
          "free-hdd-space": String(dashboard.freeDisk),
          "total-hdd-space": String(dashboard.totalDisk),
        },
      ],
      "/interface/print": () =>
        this.interfaces.map((iface) => ({
          id: iface.id,
          name: iface.name,
          type: iface.type,
          mtu: String(iface.mtu),
          running: iface.running ? "true" : "false",
          disabled: iface.disabled ? "true" : "false",
          "rx-byte": String(iface.rxByte || 0),
          "tx-byte": String(iface.txByte || 0),
          comment: iface.comment || "",
        })),
      "/ip/hotspot/user/print": () => this.users,
      "/ip/hotspot/active/print": () => this.active,
      "/ip/hotspot/host/print": () => this.hosts,
      "/ip/hotspot/ip-binding/print": () => this.bindings,
      "/ip/hotspot/cookie/print": () => this.cookies,
      "/ip/hotspot/profile/print": () => this.profiles,
      "/ip/dhcp-server/lease/print": () => this.dhcpLeases,
      "/ppp/secret/print": () => this.pppSecrets,
      "/ppp/active/print": () => this.pppActive,
      "/ip/firewall/filter/print": () => this.firewall.filter,
      "/ip/firewall/nat/print": () => this.firewall.nat,
      "/ip/firewall/mangle/print": () => this.firewall.mangle,
      "/ip/firewall/raw/print": () => this.firewall.raw,
      "/queue/simple/print": () => this.queues,
      "/interface/vlan/print": () => this.vlans,
      "/ip/route/print": () => this.routes,
      "/log/print": () => this.logs,
    };
    const builder = map[normalized];
    if (builder) return apply(builder());

    if (normalized === "/system/note/print") {
      return [{ note: "MikroDesk — démonstration locale", showatlogin: "false" }];
    }
    if (normalized === "/system/note/set" || normalized === "/log/info") {
      this.pushLog("system,info", "terminal command executed in demo");
      return [];
    }

    /* --- Écritures simulées --- */
    const args = {};
    (params || []).forEach((param) => {
      if (typeof param !== "string" || !param.startsWith("=")) return;
      const raw = param.slice(1);
      const index = raw.indexOf("=");
      if (index > 0) args[raw.slice(0, index)] = raw.slice(index + 1);
    });
    const target = args[".id"] || args.id || args.numbers || args.number || "";
    const disabled = normalized.endsWith("/disable");
    const write = async (fn) => {
      const result = await fn();
      return result === undefined || result === null ? [] : Array.isArray(result) ? result : [result];
    };

    if (/^\/ip\/hotspot\/user\/(add|set|remove|enable|disable)$/.test(normalized)) {
      const userAction = normalized.split("/").pop();
      if (userAction === "add") {
        return write(() =>
          this.saveHotspotUser({
            isNew: true,
            name: args.name,
            password: args.password || "demo1234",
            profile: args.profile || "default",
            server: args.server || "all",
            comment: args.comment || "Créé depuis le terminal",
            limitUptime: args["limit-uptime"] || args.limitUptime || "0",
            limitBytesTotal: args["limit-bytes-total"] || args.limitBytesTotal || "0",
            disabled,
          })
        );
      }
      if (userAction === "remove") return write(() => this.removeHotspotUser(target));
      if (userAction === "set") {
        const existing = this.users.find((item) => item.id === target);
        if (!existing) throw new Error("Utilisateur hotspot introuvable sur le routeur.");
        return write(() =>
          this.saveHotspotUser({
            isNew: false,
            id: target,
            name: args.name !== undefined ? args.name : existing.name,
            password: args.password !== undefined ? args.password : existing.password,
            profile: args.profile !== undefined ? args.profile : existing.profile,
            server: args.server !== undefined ? args.server : existing.server,
            comment: args.comment !== undefined ? args.comment : existing.comment,
            limitUptime: args["limit-uptime"] !== undefined ? args["limit-uptime"] : existing.limitUptime,
            limitBytesTotal:
              args["limit-bytes-total"] !== undefined ? args["limit-bytes-total"] : existing.limitBytesTotal,
            disabled: disabled ? true : existing.disabled,
          })
        );
      }
      return write(() => this.toggleHotspotUser(target, disabled));
    }

    if (/^\/interface\/(enable|disable)$/.test(normalized)) {
      return write(() => this.toggleInterface(target, disabled));
    }

    const firewallMatch = normalized.match(/^\/ip\/firewall\/(filter|nat|mangle|raw)\/(enable|disable|remove)$/);
    if (firewallMatch) {
      const type = firewallMatch[1];
      const ruleAction = firewallMatch[2];
      if (ruleAction === "remove") {
        const rule = (this.firewall[type] || []).find((item) => item.id === target);
        if (!rule) throw new Error("Règle de pare-feu introuvable sur le routeur.");
        this.firewall[type] = this.firewall[type].filter((item) => item.id !== target);
        this.pushLog("firewall,info", `${type} rule ${target} removed by terminal (demo)`);
        return [];
      }
      return write(() => this.toggleFirewallRule(type, target, disabled));
    }

    const queueMatch = normalized.match(/^\/queue\/simple\/(enable|disable|remove)$/);
    if (queueMatch) {
      if (queueMatch[1] === "remove") {
        const queue = this.queues.find((item) => item.id === target);
        if (!queue) throw new Error("File d'attente introuvable sur le routeur.");
        this.queues = this.queues.filter((item) => item.id !== target);
        this.pushLog("queue,info", `queue ${target} removed by terminal (demo)`);
        return [];
      }
      return write(() => this.toggleQueue(target, disabled));
    }

    throw new Error(`Commande non disponible en mode démonstration : ${path}`);
  }
}

module.exports = { DemoAdapter, randomString, CHARSET, PASSWORD_CHARS };
