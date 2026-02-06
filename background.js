// Cookie Gatekeeper - Background Service Worker

// ── Constants ──────────────────────────────────────────────
const STORAGE_KEYS = {
  ACTIVATED: "gk_activated",
  WHITELIST: "gk_whitelist",
  FIRST_RUN_DONE: "gk_first_run_done"
};

// ── First-run detection ────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const allCookies = await chrome.cookies.getAll({});
    const domainSet = new Set();
    for (const cookie of allCookies) {
      let domain = cookie.domain;
      if (domain.startsWith(".")) domain = domain.substring(1);
      domainSet.add(domain);
    }

    if (domainSet.size > 0) {
      // Existing install with cookies: open onboarding
      await chrome.storage.local.set({
        [STORAGE_KEYS.FIRST_RUN_DONE]: false,
        [STORAGE_KEYS.ACTIVATED]: false,
        [STORAGE_KEYS.WHITELIST]: []
      });
      chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
    } else {
      // Fresh install: activate immediately with block-all
      await chrome.storage.local.set({
        [STORAGE_KEYS.FIRST_RUN_DONE]: true,
        [STORAGE_KEYS.ACTIVATED]: true,
        [STORAGE_KEYS.WHITELIST]: []
      });
      setGlobalBlock();
    }
  }
});

// ── Core functions ─────────────────────────────────────────

function setGlobalBlock() {
  chrome.contentSettings.cookies.set({
    primaryPattern: "<all_urls>",
    setting: "block"
  });
}

function whitelistDomain(domain) {
  // Allow both http and https, and include subdomains
  const patterns = [
    `https://*.${domain}/*`,
    `http://*.${domain}/*`,
    `https://${domain}/*`,
    `http://${domain}/*`
  ];
  for (const pattern of patterns) {
    chrome.contentSettings.cookies.set({
      primaryPattern: pattern,
      setting: "allow"
    });
  }
}

function blockDomain(domain) {
  const patterns = [
    `https://*.${domain}/*`,
    `http://*.${domain}/*`,
    `https://${domain}/*`,
    `http://${domain}/*`
  ];
  for (const pattern of patterns) {
    chrome.contentSettings.cookies.set({
      primaryPattern: pattern,
      setting: "block"
    });
  }
}

// ── Message handler for popup and onboarding ───────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "getStatus") {
    handleGetStatus(msg).then(sendResponse);
    return true; // async
  }

  if (msg.action === "toggleDomain") {
    handleToggleDomain(msg).then(sendResponse);
    return true;
  }

  if (msg.action === "activateProtection") {
    handleActivateProtection(msg).then(sendResponse);
    return true;
  }

  if (msg.action === "getExistingCookies") {
    handleGetExistingCookies().then(sendResponse);
    return true;
  }

  if (msg.action === "getWhitelist") {
    handleGetWhitelist().then(sendResponse);
    return true;
  }

  if (msg.action === "removeDomain") {
    handleRemoveDomain(msg).then(sendResponse);
    return true;
  }

  if (msg.action === "deleteNonWhitelistedCookies") {
    handleDeleteNonWhitelistedCookies(msg).then(sendResponse);
    return true;
  }

  if (msg.action === "deactivateProtection") {
    handleDeactivateProtection().then(sendResponse);
    return true;
  }

  if (msg.action === "openSettings") {
    chrome.tabs.create({ url: "brave://settings/cookies" });
    sendResponse({ ok: true });
    return false;
  }
});

async function handleGetStatus(msg) {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.ACTIVATED,
    STORAGE_KEYS.WHITELIST,
    STORAGE_KEYS.FIRST_RUN_DONE
  ]);

  const activated = data[STORAGE_KEYS.ACTIVATED] || false;
  const whitelist = data[STORAGE_KEYS.WHITELIST] || [];
  const firstRunDone = data[STORAGE_KEYS.FIRST_RUN_DONE] !== false;

  let currentDomain = null;
  let isWhitelisted = false;

  if (msg.tabId) {
    try {
      const tab = await chrome.tabs.get(msg.tabId);
      if (tab.url) {
        const url = new URL(tab.url);
        currentDomain = url.hostname.replace(/^www\./, "");
        isWhitelisted = whitelist.includes(currentDomain);
      }
    } catch (e) {
      // Tab may not exist
    }
  }

  return { activated, whitelist, currentDomain, isWhitelisted, firstRunDone };
}

async function handleToggleDomain(msg) {
  const domain = msg.domain;
  const data = await chrome.storage.local.get([STORAGE_KEYS.WHITELIST]);
  let whitelist = data[STORAGE_KEYS.WHITELIST] || [];

  if (whitelist.includes(domain)) {
    // Remove from whitelist, block the domain
    whitelist = whitelist.filter(d => d !== domain);
    blockDomain(domain);
  } else {
    // Add to whitelist, allow the domain
    whitelist.push(domain);
    whitelist.sort();
    whitelistDomain(domain);
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.WHITELIST]: whitelist });
  return { ok: true, whitelist, isWhitelisted: whitelist.includes(domain) };
}

async function handleActivateProtection(msg) {
  const domains = msg.domains || [];

  // First, whitelist all selected domains
  for (const domain of domains) {
    whitelistDomain(domain);
  }

  // Set global block
  setGlobalBlock();

  // Save state
  await chrome.storage.local.set({
    [STORAGE_KEYS.WHITELIST]: domains.sort(),
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

    // Roll up to root domain (simple heuristic)
    const rootDomain = getRootDomain(domain);

    if (!domainMap[rootDomain]) {
      domainMap[rootDomain] = { count: 0, subdomains: new Set() };
    }
    domainMap[rootDomain].count++;
    domainMap[rootDomain].subdomains.add(domain);
  }

  const result = Object.entries(domainMap)
    .map(([domain, info]) => ({
      domain,
      cookieCount: info.count,
      subdomains: Array.from(info.subdomains)
    }))
    .sort((a, b) => b.cookieCount - a.cookieCount);

  return { domains: result };
}

async function handleGetWhitelist() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.WHITELIST]);
  return { whitelist: data[STORAGE_KEYS.WHITELIST] || [] };
}

async function handleRemoveDomain(msg) {
  const domain = msg.domain;
  const data = await chrome.storage.local.get([STORAGE_KEYS.WHITELIST]);
  let whitelist = data[STORAGE_KEYS.WHITELIST] || [];
  whitelist = whitelist.filter(d => d !== domain);
  blockDomain(domain);
  await chrome.storage.local.set({ [STORAGE_KEYS.WHITELIST]: whitelist });
  return { ok: true, whitelist };
}

async function handleDeleteNonWhitelistedCookies(msg) {
  const keepDomains = msg.domains || [];

  // Build the excludeOrigins list from whitelisted domains
  // browsingData.remove with excludeOrigins will wipe everything EXCEPT these
  const excludeOrigins = [];
  for (const domain of keepDomains) {
    excludeOrigins.push(`https://${domain}`);
    excludeOrigins.push(`http://${domain}`);
    // Include www subdomain as well
    excludeOrigins.push(`https://www.${domain}`);
    excludeOrigins.push(`http://www.${domain}`);
  }

  try {
    await chrome.browsingData.remove(
      { excludeOrigins: excludeOrigins },
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

  // Followup pass: remove any straggler cookies not covered by browsingData
  const keepSet = new Set(keepDomains);
  const remainingCookies = await chrome.cookies.getAll({});
  let extraDeleted = 0;
  for (const cookie of remainingCookies) {
    let cookieDomain = cookie.domain;
    if (cookieDomain.startsWith(".")) cookieDomain = cookieDomain.substring(1);
    const rootDomain = getRootDomain(cookieDomain);

    if (!keepSet.has(rootDomain)) {
      const protocol = cookie.secure ? "https" : "http";
      const url = `${protocol}://${cookieDomain}${cookie.path}`;
      try {
        await chrome.cookies.remove({
          url: url,
          name: cookie.name,
          storeId: cookie.storeId
        });
        extraDeleted++;
      } catch (e) {
        // Skip
      }
    }
  }

  return {
    ok: true,
    deletedCount: 1, // Signal that deletion occurred
    deletedDomainCount: -1 // We cannot know the exact count with excludeOrigins
  };
}

// ── Utility ────────────────────────────────────────────────

function getRootDomain(hostname) {
  // Handle common multi-part TLDs
  const multiPartTlds = [
    "co.uk", "co.jp", "co.kr", "co.nz", "co.za", "co.in",
    "com.au", "com.br", "com.mx", "com.cn", "com.sg",
    "org.uk", "net.au", "gov.uk"
  ];

  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;

  const lastTwo = parts.slice(-2).join(".");
  if (multiPartTlds.includes(lastTwo)) {
    return parts.slice(-3).join(".");
  }

  return parts.slice(-2).join(".");
}
