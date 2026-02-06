// Cookie Gatekeeper - Popup Logic

let currentState = {};

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab ? tab.id : null;

  const status = await chrome.runtime.sendMessage({ action: "getStatus", tabId });
  currentState = status;
  render(status, tab);

  // ── Toggle cookie permission for current site ──
  document.getElementById("cookieToggle").addEventListener("change", async () => {
    if (!currentState.currentDomain) return;
    const result = await chrome.runtime.sendMessage({
      action: "toggleDomain",
      domain: currentState.currentDomain
    });
    currentState.isWhitelisted = result.isWhitelisted;
    currentState.whitelist = result.whitelist;
    updateSiteUI();
    renderWhitelist(result.whitelist);
  });

  // ── Master protection toggle ──
  document.getElementById("masterToggle").addEventListener("change", async (e) => {
    if (e.target.checked) {
      // Re-activate: set global block, re-apply whitelist
      await chrome.runtime.sendMessage({
        action: "activateProtection",
        domains: currentState.whitelist || []
      });
      currentState.activated = true;
    } else {
      // Deactivate: clear all contentSettings rules
      await chrome.runtime.sendMessage({ action: "deactivateProtection" });
      currentState.activated = false;
    }
    updateMasterUI();
  });

  // ── Open onboarding / setup ──
  document.getElementById("btnSetup").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
    window.close();
  });

  // ── Toggle whitelist panel ──
  document.getElementById("btnWhitelist").addEventListener("click", () => {
    const panel = document.getElementById("whitelistPanel");
    panel.classList.toggle("show");
    if (panel.classList.contains("show")) {
      renderWhitelist(currentState.whitelist || []);
    }
  });

  // ── Open Brave cookie settings ──
  document.getElementById("btnBraveCookies").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "openSettings" });
    window.close();
  });
});

function render(status, tab) {
  const headerStatus = document.getElementById("headerStatus");
  const headerIcon = document.getElementById("headerIcon");

  if (!status.firstRunDone || !status.activated) {
    // Not yet activated
    headerStatus.textContent = "Not Active";
    headerIcon.classList.add("inactive");
    document.getElementById("notActivated").style.display = "block";
    document.getElementById("activeContent").style.display = "none";
    document.getElementById("footerLinks").style.display = "none";
    return;
  }

  // Check if this is an internal page
  const isInternal = !tab || !tab.url || tab.url.startsWith("chrome") ||
                     tab.url.startsWith("brave") || tab.url.startsWith("about") ||
                     tab.url.startsWith("edge");

  if (isInternal) {
    headerStatus.textContent = "Active";
    document.getElementById("internalNotice").style.display = "block";
    document.getElementById("activeContent").style.display = "none";
    document.getElementById("footerLinks").style.display = "flex";
    return;
  }

  // Normal site
  headerStatus.textContent = "Active";
  document.getElementById("activeContent").style.display = "block";
  document.getElementById("footerLinks").style.display = "flex";
  document.getElementById("siteDomain").textContent = status.currentDomain || "Unknown";
  document.getElementById("cookieToggle").checked = status.isWhitelisted;

  updateSiteUI();
  updateMasterUI();
}

function updateSiteUI() {
  const toggle = document.getElementById("cookieToggle");
  const label = document.getElementById("toggleLabel");
  const info = document.getElementById("infoLine");

  if (toggle.checked) {
    label.textContent = "Allowed";
    label.className = "toggle-label allowed";
    info.innerHTML = '<span class="dot green"></span><span>Cookies allowed for this site</span>';
  } else {
    label.textContent = "Blocked";
    label.className = "toggle-label blocked";
    info.innerHTML = '<span class="dot red"></span><span>Cookies blocked for this site</span>';
  }
}

function updateMasterUI() {
  const toggle = document.getElementById("masterToggle");
  const label = document.getElementById("masterLabel");

  if (toggle.checked) {
    label.textContent = "Active";
    label.style.color = "#22c55e";
  } else {
    label.textContent = "Paused";
    label.style.color = "#f59e0b";
  }
}

function renderWhitelist(whitelist) {
  const container = document.getElementById("wlList");
  document.getElementById("wlCount").textContent = whitelist.length;

  if (whitelist.length === 0) {
    container.innerHTML = '<div class="wl-empty">No domains whitelisted yet</div>';
    return;
  }

  container.innerHTML = whitelist.map(domain => `
    <div class="wl-item">
      <span class="wl-domain">${domain}</span>
      <button class="wl-remove" data-domain="${domain}">Remove</button>
    </div>
  `).join("");

  container.querySelectorAll(".wl-remove").forEach(btn => {
    btn.addEventListener("click", async () => {
      const domain = btn.dataset.domain;
      const result = await chrome.runtime.sendMessage({
        action: "removeDomain",
        domain
      });
      currentState.whitelist = result.whitelist;
      // If we just removed the current site, update toggle
      if (domain === currentState.currentDomain) {
        currentState.isWhitelisted = false;
        document.getElementById("cookieToggle").checked = false;
        updateSiteUI();
      }
      renderWhitelist(result.whitelist);
    });
  });
}
