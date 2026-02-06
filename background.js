// Cookie Gatekeeper v2 - Background Service Worker

// ── Constants ──────────────────────────────────────────────
const STORAGE_KEYS = {
  ACTIVATED: "gk_activated",
  WHITELIST: "gk_whitelist",
  SESSION_LIST: "gk_session_list",
  FIRST_RUN_DONE: "gk_first_run_done"
};

const MENU_ID = "gk_toggle_cookies";

// ── Install / Startup ──────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  setupContextMenu();

  if (details.reason === "install") {
    const allCookies = await chrome.cookies.getAll({});
    const domainSet = new Set();
    for (const cookie of allCookies) {
      let domain = cookie.domain;
      if (domain.startsWith(".")) domain = domain.substring(1);
      domainSet.add(domain);
    }

    if (domainSet.size > 0) {
      await chrome.storage.local.set({
        [STORAGE_KEYS.FIRST_RUN_DONE]: false,
        [STORAGE_KEYS.ACTIVATED]: false,
        [STORAGE_KEYS.WHITELIST]: [],
        [STORAGE_KEYS.SESSION_LIST]: []
      });
      chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
    } else {
      await chrome.storage.local.set({
        [STORAGE_KEYS.FIRST_RUN_DONE]: true,
        [STORAGE_KEYS.ACTIVATED]: true,
        [STORAGE_KEYS.WHITELIST]: [],
        [STORAGE_KEYS.SESSION_LIST]: []
      });
      setGlobalBlock();
    }
  }

  if (details.reason === "update") {
    const data = await chrome.storage.local.get([STORAGE_KEYS.SESSION_LIST]);
    if (!data[STORAGE_KEYS.SESSION_LIST]) {
      await chrome.storage.local.set({ [STORAGE_KEYS.SESSION_LIST]: [] });
    }
  }
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenu();
});

// ── Context Menu ───────────────────────────────────────────

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Cookie Gatekeeper: Cycle Cookie Mode",
      contexts: ["page", "frame"]
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  if (!tab || !tab.url) return;

  const data = await chrome.storage.local.get([
    STORAGE_KEYS.ACTIVATED,
    STORAGE_KEYS.WHITELIST,
    STORAGE_KEYS.SESSION_LIST
  ]);

  if (!data[STORAGE_KEYS.ACTIVATED]) return;

  let url;
  try { url = new URL(tab.url); } catch (e) { return; }
  const domain = url.hostname.replace(/^www\./, "");

  let whitelist = data[STORAGE_KEYS.WHITELIST] || [];
  let sessionList = data[STORAGE_KEYS.SESSION_LIST] || [];

  // Determine current mode and cycle: blocked > allowed > session > blocked
  let currentMode = "blocked";
  if (whitelist.includes(domain)) currentMode = "allowed";
  else if (sessionList.includes(domain)) currentMode = "session";

  let newMode;
  if (currentMode === "blocked") newMode = "allowed";
  else if (currentMode === "allowed") newMode = "session";
  else newMode = "blocked";

  await applyDomainMode(domain, newMode, whitelist, sessionList);

  // Flash a badge to confirm
  const badges = {
    allowed: { text: "ON", color: "#22c55e" },
    session: { text: "SES", color: "#f59e0b" },
    blocked: { text: "OFF", color: "#ef4444" }
  };
  const badge = badges[newMode];
  chrome.action.setBadgeText({ text: badge.text, tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({ color: badge.color, tabId: tab.id });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "", tabId: tab.id });
  }, 2500);
});

// ── Core cookie rule functions ─────────────────────────────

function setGlobalBlock() {
  chrome.contentSettings.cookies.set({
    primaryPattern: "<all_urls>",
    setting: "block"
  });
}

function applyDomainSetting(domain, setting) {
  const patterns = [
    `https://*.${domain}/*`,
    `http://*.${domain}/*`,
    `https://${domain}/*`,
    `http://${domain}/*`
  ];
  for (const pattern of patterns) {
    chrome.contentSettings.cookies.set({
      primaryPattern: pattern,
      setting: setting
    });
  }
}

async function applyDomainMode(domain, mode, whitelist, sessionList) {
  whitelist = whitelist.filter(d => d !== domain);
  sessionList = sessionList.filter(d => d !== domain);

  if (mode === "allowed") {
    whitelist.push(domain);
    whitelist.sort();
    applyDomainSetting(domain, "allow");
  } else if (mode === "session") {
    sessionList.push(domain);
    sessionList.sort();
    applyDomainSetting(domain, "session_only");
  } else {
    applyDomainSetting(domain, "block");
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.WHITELIST]: whitelist,
    [STORAGE_KEYS.SESSION_LIST]: sessionList
  });

  return { whitelist, sessionList, mode };
}

// ── Message handler ────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const asyncHandlers = {
    getStatus:                     () => handleGetStatus(msg),
    setDomainMode:                 () => handleSetDomainMode(msg),
    activateProtection:            () => handleActivateProtection(msg),
    getExistingCookies:            () => handleGetExistingCookies(),
    getFullList:                   () => handleGetFullList(),
    removeDomain:                  () => handleRemoveDomain(msg),
    deleteNonWhitelistedCookies:   () => handleDeleteNonWhitelistedCookies(msg),
    deactivateProtection:          () => handleDeactivateProtection(),
    exportConfig:                  () => handleExportConfig(),
    importConfig:                  () => handleImportConfig(msg)
  };

  if (msg.action === "openSettings") {
    chrome.tabs.create({ url: "brave://settings/cookies" });
    sendResponse({ ok: true });
    return false;
  }

  const handler = asyncHandlers[msg.action];
  if (handler) {
    handler().then(sendResponse);
    return true;
  }
});

// ── Handlers ───────────────────────────────────────────────

async function handleGetStatus(msg) {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.ACTIVATED,
    STORAGE_KEYS.WHITELIST,
    STORAGE_KEYS.SESSION_LIST,
    STORAGE_KEYS.FIRST_RUN_DONE
  ]);

  const activated = data[STORAGE_KEYS.ACTIVATED] || false;
  const whitelist = data[STORAGE_KEYS.WHITELIST] || [];
  const sessionList = data[STORAGE_KEYS.SESSION_LIST] || [];
  const firstRunDone = data[STORAGE_KEYS.FIRST_RUN_DONE] !== false;

  let currentDomain = null;
  let domainMode = "blocked";

  if (msg.tabId) {
    try {
      const tab = await chrome.tabs.get(msg.tabId);
      if (tab.url) {
        const url = new URL(tab.url);
        currentDomain = url.hostname.replace(/^www\./, "");
        if (whitelist.includes(currentDomain)) domainMode = "allowed";
        else if (sessionList.includes(currentDomain)) domainMode = "session";
      }
    } catch (e) {}
  }

  return { activated, whitelist, sessionList, currentDomain, domainMode, firstRunDone };
}

async function handleSetDomainMode(msg) {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.WHITELIST,
    STORAGE_KEYS.SESSION_LIST
  ]);
  const result = await applyDomainMode(
    msg.domain, msg.mode,
    data[STORAGE_KEYS.WHITELIST] || [],
    data[STORAGE_KEYS.SESSION_LIST] || []
  );
  return { ok: true, ...result };
}

async function handleActivateProtection(msg) {
  const domains = msg.domains || [];

  for (const domain of domains) {
    applyDomainSetting(domain, "allow");
  }
  setGlobalBlock();

  const existing = await chrome.storage.local.get([STORAGE_KEYS.SESSION_LIST]);

  await chrome.storage.local.set({
    [STORAGE_KEYS.WHITELIST]: domains.sort(),
    [STORAGE_KEYS.SESSION_LIST]: existing[STORAGE_KEYS.SESSION_LIST] || [],
    [STORAGE_KEYS.ACTIVATED]: true,
    [STORAGE_KEYS.FIRST_RUN_DONE]: true
  });

  return { ok: true };
}

async function handleDeactivateProtection() {
  chrome.contentSettings.cookies.clear({});
  await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVATED]: false });
  return { ok: true };
}

async function handleGetExistingCookies() {
  const allCookies = await chrome.cookies.getAll({});
  const domainMap = {};

  for (const cookie of allCookies) {
    let domain = cookie.domain;
    if (domain.startsWith(".")) domain = domain.substring(1);
    const rootDomain = getRootDomain(domain);

    if (!domainMap[rootDomain]) {
      domainMap[rootDomain] = { count: 0, subdomains: new Set() };
    }
    domainMap[rootDomain].count++;
    domainMap[rootDomain].subdomains.add(domain);
  }

  return {
    domains: Object.entries(domainMap)
      .map(([domain, info]) => ({
        domain,
        cookieCount: info.count,
        subdomains: Array.from(info.subdomains)
      }))
      .sort((a, b) => b.cookieCount - a.cookieCount)
  };
}

async function handleGetFullList() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.WHITELIST,
    STORAGE_KEYS.SESSION_LIST
  ]);
  return {
    whitelist: data[STORAGE_KEYS.WHITELIST] || [],
    sessionList: data[STORAGE_KEYS.SESSION_LIST] || []
  };
}

async function handleRemoveDomain(msg) {
  const domain = msg.domain;
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.WHITELIST,
    STORAGE_KEYS.SESSION_LIST
  ]);
  const whitelist = (data[STORAGE_KEYS.WHITELIST] || []).filter(d => d !== domain);
  const sessionList = (data[STORAGE_KEYS.SESSION_LIST] || []).filter(d => d !== domain);
  applyDomainSetting(domain, "block");
  await chrome.storage.local.set({
    [STORAGE_KEYS.WHITELIST]: whitelist,
    [STORAGE_KEYS.SESSION_LIST]: sessionList
  });
  return { ok: true, whitelist, sessionList };
}

async function handleDeleteNonWhitelistedCookies(msg) {
  const keepDomains = msg.domains || [];

  const excludeOrigins = [];
  for (const domain of keepDomains) {
    excludeOrigins.push(`https://${domain}`);
    excludeOrigins.push(`http://${domain}`);
    excludeOrigins.push(`https://www.${domain}`);
    excludeOrigins.push(`http://www.${domain}`);
  }

  try {
    await chrome.browsingData.remove(
      { excludeOrigins },
      {
        cookies: true,
        cacheStorage: true,
        localStorage: true,
        indexedDB: true,
        serviceWorkers: true,
        fileSystems: true
      }
    );
  } catch (e) {
    console.warn("browsingData.remove error:", e);
  }

  const keepSet = new Set(keepDomains);
  const remainingCookies = await chrome.cookies.getAll({});
  for (const cookie of remainingCookies) {
    let cookieDomain = cookie.domain;
    if (cookieDomain.startsWith(".")) cookieDomain = cookieDomain.substring(1);
    const rootDomain = getRootDomain(cookieDomain);
    if (!keepSet.has(rootDomain)) {
      const protocol = cookie.secure ? "https" : "http";
      try {
        await chrome.cookies.remove({
          url: `${protocol}://${cookieDomain}${cookie.path}`,
          name: cookie.name,
          storeId: cookie.storeId
        });
      } catch (e) {}
    }
  }

  return { ok: true, deletedCount: 1, deletedDomainCount: -1 };
}

// ── Export / Import ────────────────────────────────────────

async function handleExportConfig() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.WHITELIST,
    STORAGE_KEYS.SESSION_LIST
  ]);
  return {
    ok: true,
    config: {
      _format: "cookie-gatekeeper-v1",
      _exported: new Date().toISOString(),
      whitelist: data[STORAGE_KEYS.WHITELIST] || [],
      sessionList: data[STORAGE_KEYS.SESSION_LIST] || []
    }
  };
}

async function handleImportConfig(msg) {
  const config = msg.config;
  if (!config || config._format !== "cookie-gatekeeper-v1") {
    return { ok: false, error: "Invalid config file format." };
  }

  const whitelist = Array.isArray(config.whitelist) ? config.whitelist : [];
  const sessionList = Array.isArray(config.sessionList) ? config.sessionList : [];

  for (const domain of whitelist) applyDomainSetting(domain, "allow");
  for (const domain of sessionList) applyDomainSetting(domain, "session_only");

  await chrome.storage.local.set({
    [STORAGE_KEYS.WHITELIST]: whitelist.sort(),
    [STORAGE_KEYS.SESSION_LIST]: sessionList.sort()
  });

  return { ok: true, whitelist, sessionList, imported: whitelist.length + sessionList.length };
}

// ── Utility ────────────────────────────────────────────────

function getRootDomain(hostname) {
  const multiPartTlds = [
    "co.uk", "co.jp", "co.kr", "co.nz", "co.za", "co.in",
    "com.au", "com.br", "com.mx", "com.cn", "com.sg",
    "org.uk", "net.au", "gov.uk"
  ];
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  const lastTwo = parts.slice(-2).join(".");
  if (multiPartTlds.includes(lastTwo)) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}
