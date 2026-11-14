"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mikrodesk", {
  app: {
    info: () => ipcRenderer.invoke("app:info"),
  },
  profiles: {
    list: () => ipcRenderer.invoke("profiles:list"),
    save: (payload) => ipcRenderer.invoke("profiles:save", payload),
    remove: (id) => ipcRenderer.invoke("profiles:delete", id),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (patch) => ipcRenderer.invoke("settings:update", patch),
  },
  router: {
    connect: (payload) => ipcRenderer.invoke("router:connect", payload),
    disconnect: () => ipcRenderer.invoke("router:disconnect"),
    status: () => ipcRenderer.invoke("router:status"),
    dashboard: () => ipcRenderer.invoke("router:dashboard"),
    ping: (target, count) => ipcRenderer.invoke("router:ping", target, count),
    traceroute: (target) => ipcRenderer.invoke("router:traceroute", target),
    security: () => ipcRenderer.invoke("router:security"),
    reboot: () => ipcRenderer.invoke("router:reboot"),
    backupOnRouter: () => ipcRenderer.invoke("router:backup:create"),
  },
  fleet: {
    list: () => ipcRenderer.invoke("fleet:list"),
    probe: (id) => ipcRenderer.invoke("fleet:probe", id),
    probeAll: () => ipcRenderer.invoke("fleet:probe-all"),
    switch: (id) => ipcRenderer.invoke("fleet:switch", id),
  },
  terminal: {
    check: (command) => ipcRenderer.invoke("terminal:check", command),
    run: (payload) => ipcRenderer.invoke("terminal:run", payload),
    history: () => ipcRenderer.invoke("terminal:history"),
    clearHistory: () => ipcRenderer.invoke("terminal:history:clear"),
  },
  config: {
    current: () => ipcRenderer.invoke("config:current"),
    capture: (label) => ipcRenderer.invoke("config:backup", label),
    list: () => ipcRenderer.invoke("config:backups"),
    get: (id) => ipcRenderer.invoke("config:backup:get", id),
    remove: (id) => ipcRenderer.invoke("config:backup:delete", id),
    download: (id) => ipcRenderer.invoke("config:backup:download", id),
    exportFile: () => ipcRenderer.invoke("config:export:file"),
    importFile: () => ipcRenderer.invoke("config:import:file"),
    restore: (id) => ipcRenderer.invoke("config:restore", id),
  },
  audit: {
    list: () => ipcRenderer.invoke("audit:list"),
    clear: () => ipcRenderer.invoke("audit:clear"),
    exportFile: () => ipcRenderer.invoke("audit:export"),
  },
  alerts: {
    list: () => ipcRenderer.invoke("alerts:list"),
    clear: () => ipcRenderer.invoke("alerts:clear"),
    evaluate: (metrics) => ipcRenderer.invoke("alerts:evaluate", metrics),
    summary: () => ipcRenderer.invoke("alerts:summary"),
    ack: () => ipcRenderer.invoke("alerts:ack"),
  },
  hotspot: {
    users: () => ipcRenderer.invoke("hotspot:users"),
    saveUser: (payload) => ipcRenderer.invoke("hotspot:user:save", payload),
    removeUser: (id) => ipcRenderer.invoke("hotspot:user:remove", id),
    toggleUser: (id, disabled) => ipcRenderer.invoke("hotspot:user:toggle", id, disabled),
    active: () => ipcRenderer.invoke("hotspot:active"),
    kick: (id) => ipcRenderer.invoke("hotspot:active:kick", id),
    profiles: () => ipcRenderer.invoke("hotspot:profiles"),
    servers: () => ipcRenderer.invoke("hotspot:servers"),
    vouchers: (options) => ipcRenderer.invoke("hotspot:vouchers", options),
    generateUsers: (options) => ipcRenderer.invoke("hotspot:users:generate", options),
    hosts: () => ipcRenderer.invoke("hotspot:hosts"),
    removeHost: (id) => ipcRenderer.invoke("hotspot:host:remove", id),
    bindings: () => ipcRenderer.invoke("hotspot:bindings"),
    saveBinding: (payload) => ipcRenderer.invoke("hotspot:binding:save", payload),
    removeBinding: (id) => ipcRenderer.invoke("hotspot:binding:remove", id),
    toggleBinding: (id, disabled) => ipcRenderer.invoke("hotspot:binding:toggle", id, disabled),
    cookies: () => ipcRenderer.invoke("hotspot:cookies"),
    removeCookie: (id) => ipcRenderer.invoke("hotspot:cookie:remove", id),
  },
  dhcp: {
    leases: () => ipcRenderer.invoke("dhcp:leases"),
    removeLease: (id) => ipcRenderer.invoke("dhcp:lease:remove", id),
  },
  ppp: {
    secrets: () => ipcRenderer.invoke("ppp:secrets"),
    profiles: () => ipcRenderer.invoke("ppp:profiles"),
    saveSecret: (payload) => ipcRenderer.invoke("ppp:secret:save", payload),
    removeSecret: (id) => ipcRenderer.invoke("ppp:secret:remove", id),
    toggleSecret: (id, disabled) => ipcRenderer.invoke("ppp:secret:toggle", id, disabled),
    active: () => ipcRenderer.invoke("ppp:active"),
    kick: (id) => ipcRenderer.invoke("ppp:active:kick", id),
  },
  interfaces: {
    list: () => ipcRenderer.invoke("interfaces:list"),
    toggle: (id, disabled) => ipcRenderer.invoke("interfaces:toggle", id, disabled),
  },
  firewall: {
    list: () => ipcRenderer.invoke("firewall:list"),
    toggle: (type, id, disabled) => ipcRenderer.invoke("firewall:toggle", type, id, disabled),
  },
  queues: {
    list: () => ipcRenderer.invoke("queues:list"),
    toggle: (id, disabled) => ipcRenderer.invoke("queues:toggle", id, disabled),
  },
  network: {
    vlans: () => ipcRenderer.invoke("vlans:list"),
    routes: () => ipcRenderer.invoke("routes:list"),
  },
  logs: {
    list: () => ipcRenderer.invoke("logs:list"),
  },
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    onMaximized: (callback) => {
      const listener = (_event, value) => callback(Boolean(value));
      ipcRenderer.on("window:maximized", listener);
      return () => ipcRenderer.removeListener("window:maximized", listener);
    },
  },
});
