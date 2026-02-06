// Cookie Gatekeeper - Onboarding Logic

// Well-known domains that are likely login/account sites
const COMMON_SITES = new Set([
  "google.com", "youtube.com", "gmail.com", "github.com", "gitlab.com",
  "amazon.com", "apple.com", "icloud.com", "microsoft.com", "live.com",
  "outlook.com", "office.com", "chase.com", "bankofamerica.com",
  "wellsfargo.com", "usaa.com", "capitalone.com", "amex.com",
  "paypal.com", "venmo.com", "facebook.com", "instagram.com",
  "twitter.com", "x.com", "reddit.com", "linkedin.com",
  "netflix.com", "hulu.com", "spotify.com", "discord.com",
  "slack.com", "zoom.us", "dropbox.com", "notion.so",
  "anthropic.com", "claude.ai", "openai.com", "chatgpt.com",
  "nttdata.com", "brave.com", "proton.me", "protonmail.com"
]);

let allDomains = [];
let selectedDomains = new Set();

document.addEventListener("DOMContentLoaded", async () => {
  // Load existing cookies
  const result = await chrome.runtime.sendMessage({ action: "getExistingCookies" });
  allDomains = result.domains;

  const totalCookies = allDomains.reduce((sum, d) => sum + d.cookieCount, 0);
  document.getElementById("totalDomains").textContent = allDomains.length;
  document.getElementById("totalCookies").textContent = totalCookies;

  renderDomainList(allDomains);

  // ── Search ──
  document.getElementById("searchBox").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderDomainList(allDomains);
    } else {
      renderDomainList(allDomains.filter(d => d.domain.includes(q)));
    }
  });

  // ── Bulk actions ──
  document.getElementById("btnSelectCommon").addEventListener("click", () => {
    for (const d of allDomains) {
      if (COMMON_SITES.has(d.domain)) {
        selectedDomains.add(d.domain);
      }
    }
    updateSelectedCount();
    renderDomainList(getFilteredDomains());
  });

  document.getElementById("btnSelectAll").addEventListener("click", () => {
    for (const d of allDomains) {
      selectedDomains.add(d.domain);
    }
    updateSelectedCount();
    renderDomainList(getFilteredDomains());
  });

  document.getElementById("btnSelectNone").addEventListener("click", () => {
    selectedDomains.clear();
    updateSelectedCount();
    renderDomainList(getFilteredDomains());
  });

  // ── Activate ──
  document.getElementById("btnActivate").addEventListener("click", async () => {
    const domains = Array.from(selectedDomains);
    await chrome.runtime.sendMessage({
      action: "activateProtection",
      domains
    });

    // Populate cleanup step
    document.getElementById("cleanupKeptCount").textContent = domains.length;

    // Kept domain tags
    const keptTags = document.getElementById("keptDomainTags");
    if (domains.length === 0) {
      keptTags.innerHTML = '<span style="color:#5c6070;font-size:12px;">None selected. ALL site data will be deleted.</span>';
    } else {
      keptTags.innerHTML = domains.map(d =>
        `<span class="domain-tag kept">${d}</span>`
      ).join("");
    }

    // Transition to cleanup step
    document.getElementById("stepReview").style.display = "none";
    document.getElementById("stepCleanup").style.display = "block";
    document.getElementById("step1").classList.remove("active");
    document.getElementById("step1").classList.add("done");
    document.getElementById("step2").classList.add("active");
  });

  // ── Delete non-whitelisted cookies ──
  document.getElementById("btnDeleteCookies").addEventListener("click", async () => {
    document.getElementById("cleanupProgress").style.display = "block";

    const result = await chrome.runtime.sendMessage({
      action: "deleteNonWhitelistedCookies",
      domains: Array.from(selectedDomains)
    });

    transitionToDone(result.deletedCount, result.deletedDomainCount);
  });

  // ── Skip cleanup ──
  document.getElementById("btnSkipCleanup").addEventListener("click", () => {
    transitionToDone(0, 0);
  });

  // ── View cookies in Brave ──
  document.getElementById("btnBraveCookies").addEventListener("click", () => {
    chrome.tabs.create({ url: "brave://settings/cookies" });
  });

  // ── Close ──
  document.getElementById("btnClose").addEventListener("click", () => {
    window.close();
  });
});

function transitionToDone(deletedCount, deletedDomainCount) {
  document.getElementById("stepCleanup").style.display = "none";
  document.getElementById("stepDone").style.display = "block";
  document.getElementById("doneCount").textContent = selectedDomains.size;

  const deleteInfo = document.getElementById("doneDeleteInfo");
  if (deletedCount > 0) {
    deleteInfo.textContent =
      "All stored data from non-whitelisted domains was deleted. ";
  } else {
    deleteInfo.textContent = "Existing site data was left in place. ";
  }

  document.getElementById("step2").classList.remove("active");
  document.getElementById("step2").classList.add("done");
  document.getElementById("step3").classList.add("active");
}

function getFilteredDomains() {
  const q = document.getElementById("searchBox").value.toLowerCase().trim();
  if (!q) return allDomains;
  return allDomains.filter(d => d.domain.includes(q));
}

function renderDomainList(domains) {
  const container = document.getElementById("domainList");

  if (domains.length === 0) {
    container.innerHTML = '<div class="loading">No domains found</div>';
    return;
  }

  // Sort: selected first, then common sites, then alphabetical
  const sorted = [...domains].sort((a, b) => {
    const aSelected = selectedDomains.has(a.domain) ? 0 : 1;
    const bSelected = selectedDomains.has(b.domain) ? 0 : 1;
    if (aSelected !== bSelected) return aSelected - bSelected;

    const aCommon = COMMON_SITES.has(a.domain) ? 0 : 1;
    const bCommon = COMMON_SITES.has(b.domain) ? 0 : 1;
    if (aCommon !== bCommon) return aCommon - bCommon;

    return a.domain.localeCompare(b.domain);
  });

  container.innerHTML = sorted.map(d => {
    const isSelected = selectedDomains.has(d.domain);
    const isCommon = COMMON_SITES.has(d.domain);
    const classes = [
      "domain-row",
      isSelected ? "selected" : "",
      isCommon ? "suggested" : ""
    ].filter(Boolean).join(" ");

    let badges = "";
    if (isCommon) badges += '<span class="badge common">Known</span>';
    if (d.cookieCount >= 5) badges += '<span class="badge login">Active</span>';

    return `
      <div class="${classes}" data-domain="${d.domain}">
        <div class="domain-check"></div>
        <span class="domain-name">${d.domain}${badges}</span>
        <span class="domain-meta">
          <span class="count">${d.cookieCount}</span> cookie${d.cookieCount !== 1 ? "s" : ""}
        </span>
      </div>
    `;
  }).join("");

  // Attach click handlers
  container.querySelectorAll(".domain-row").forEach(row => {
    row.addEventListener("click", () => {
      const domain = row.dataset.domain;
      if (selectedDomains.has(domain)) {
        selectedDomains.delete(domain);
        row.classList.remove("selected");
      } else {
        selectedDomains.add(domain);
        row.classList.add("selected");
      }
      updateSelectedCount();
    });
  });
}

function updateSelectedCount() {
  document.getElementById("selectedCount").textContent = selectedDomains.size;
}
