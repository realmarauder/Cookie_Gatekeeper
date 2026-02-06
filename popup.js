// Cookie Gatekeeper v2 - Popup Logic

let state = {};

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab ? tab.id : null;

  state = await chrome.runtime.sendMessage({ action: "getStatus", tabId });
  render(state, tab);

  // ── Mode buttons ──
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!state.currentDomain) return;
      const mode = btn.dataset.mode;
      const result = await chrome.runtime.sendMessage({
        action: "setDomainMode",
        domain: state.currentDomain,
        mode: mode
      });
      state.domainMode = mode;
      state.whitelist = result.whitelist;
      state.sessionList = result.sessionList;
      updateModeUI();
      renderList(result.whitelist, result.sessionList);
    });
  });

  // ── Master toggle ──
  document.getElementById("masterToggle").addEventListener("change", async (e) => {
    if (e.target.checked) {
      const allDomains = [...(state.whitelist || []), ...(state.sessionList || [])];
      await chrome.runtime.sendMessage({
        action: "activateProtection",
        domains: state.whitelist || []
      });
      // Re-apply session domains
      for (const d of (state.sessionList || [])) {
        await chrome.runtime.sendMessage({
          action: "setDomainMode",
          domain: d,
          mode: "session"
        });
      }
      state.activated = true;
    } else {
      await chrome.runtime.sendMessage({ action: "deactivateProtection" });
      state.activated = false;
    }
    updateMasterUI();
  });

  // ── Setup ──
  document.getElementById("btnSetup").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
    window.close();
  });

  // ── Manage list panel ──
  document.getElementById("btnManageList").addEventListener("click", async () => {
    const panel = document.getElementById("listPanel");
    panel.classList.toggle("show");
    if (panel.classList.contains("show")) {
      const data = await chrome.runtime.sendMessage({ action: "getFullList" });
      state.whitelist = data.whitelist;
      state.sessionList = data.sessionList;
      renderList(data.whitelist, data.sessionList);
    }
  });

  // ── Export ──
  document.getElementById("btnExport").addEventListener("click", async () => {
    const result = await chrome.runtime.sendMessage({ action: "exportConfig" });
    if (result.ok) {
      const json = JSON.stringify(result.config, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cookie-gatekeeper-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showImportMsg("Whitelist exported.", "success");
    }
  });

  // ── Import (trigger file picker) ──
  document.getElementById("btnImport").addEventListener("click", () => {
    document.getElementById("importFile").click();
  });

  document.getElementById("importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const config = JSON.parse(text);
      const result = await chrome.runtime.sendMessage({
        action: "importConfig",
        config: config
      });

      if (result.ok) {
        state.whitelist = result.whitelist;
        state.sessionList = result.sessionList;
        showImportMsg(`Imported ${result.imported} domains.`, "success");
        // Update mode if current domain was affected
        if (state.currentDomain) {
          if (result.whitelist.includes(state.currentDomain)) state.domainMode = "allowed";
          else if (result.sessionList.includes(state.currentDomain)) state.domainMode = "session";
          updateModeUI();
        }
        // Refresh list panel if open
        const panel = document.getElementById("listPanel");
        if (panel.classList.contains("show")) {
          renderList(result.whitelist, result.sessionList);
        }
      } else {
        showImportMsg(result.error || "Import failed.", "error");
      }
    } catch (err) {
      showImportMsg("Could not read file. Check format.", "error");
    }

    e.target.value = "";
  });

  // ── Brave settings ──
  document.getElementById("btnBraveCookies").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "openSettings" });
    window.close();
  });
});

// ── Render ─────────────────────────────────────────────────

function render(status, tab) {
  const headerStatus = document.getElementById("headerStatus");
  const headerIcon = document.getElementById("headerIcon");

  if (!status.firstRunDone || !status.activated) {
    headerStatus.textContent = "Not Active";
    headerIcon.classList.add("inactive");
    document.getElementById("notActivated").style.display = "block";
    document.getElementById("activeContent").style.display = "none";
    document.getElementById("footerLinks").style.display = "none";
    return;
  }

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

  headerStatus.textContent = "Active";
  document.getElementById("activeContent").style.display = "block";
  document.getElementById("footerLinks").style.display = "flex";
  document.getElementById("siteDomain").textContent = status.currentDomain || "Unknown";

  updateModeUI();
  updateMasterUI();
}

function updateModeUI() {
  // Clear all active states
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.className = "mode-btn";
  });

  const info = document.getElementById("infoLine");
  const mode = state.domainMode || "blocked";

  if (mode === "blocked") {
    document.getElementById("modeBlocked").classList.add("active-blocked");
    info.innerHTML = '<span class="dot red"></span><span>Cookies blocked for this site</span>';
  } else if (mode === "session") {
    document.getElementById("modeSession").classList.add("active-session");
    info.innerHTML = '<span class="dot amber"></span><span>Cookies allowed this session only (cleared when browser closes)</span>';
  } else {
    document.getElementById("modeAllowed").classList.add("active-allowed");
    info.innerHTML = '<span class="dot green"></span><span>Cookies permanently allowed for this site</span>';
  }
}

function updateMasterUI() {
  const toggle = document.getElementById("masterToggle");
  const label = document.getElementById("masterLabel");
  toggle.checked = state.activated;

  if (state.activated) {
    label.textContent = "Active";
    label.style.color = "#22c55e";
  } else {
    label.textContent = "Paused";
    label.style.color = "#f59e0b";
  }
}

function renderList(whitelist, sessionList) {
  const container = document.getElementById("wlList");
  document.getElementById("wlPermCount").textContent = whitelist.length;
  document.getElementById("wlSessCount").textContent = sessionList.length;

  const all = [
    ...whitelist.map(d => ({ domain: d, type: "perm" })),
    ...sessionList.map(d => ({ domain: d, type: "sess" }))
  ].sort((a, b) => a.domain.localeCompare(b.domain));

  if (all.length === 0) {
    container.innerHTML = '<div class="wl-empty">No domains added yet</div>';
    return;
  }

  container.innerHTML = all.map(item => {
    const badgeClass = item.type === "perm" ? "perm" : "sess";
    const badgeLabel = item.type === "perm" ? "Allow" : "Session";
    return `
      <div class="wl-item">
        <span class="wl-domain">${item.domain}</span>
        <span class="wl-badge ${badgeClass}">${badgeLabel}</span>
        <button class="wl-remove" data-domain="${item.domain}">Remove</button>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".wl-remove").forEach(btn => {
    btn.addEventListener("click", async () => {
      const domain = btn.dataset.domain;
      const result = await chrome.runtime.sendMessage({
        action: "removeDomain",
        domain
      });
      state.whitelist = result.whitelist;
      state.sessionList = result.sessionList;
      if (domain === state.currentDomain) {
        state.domainMode = "blocked";
        updateModeUI();
      }
      renderList(result.whitelist, result.sessionList);
    });
  });
}

function showImportMsg(text, type) {
  const el = document.getElementById("importMsg");
  el.textContent = text;
  el.className = "import-msg " + type;
  setTimeout(() => {
    el.className = "import-msg";
  }, 4000);
}
