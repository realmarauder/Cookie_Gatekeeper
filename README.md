# Cookie Gatekeeper

A Brave browser extension that blocks all cookies by default and lets you whitelist specific sites with one click.

## Installation (Sideloading into Brave)

1. Unzip the `cookie-gatekeeper.zip` file to a folder on your machine (e.g., `C:\Extensions\cookie-gatekeeper` or `~/Extensions/cookie-gatekeeper`).

2. Open Brave and navigate to `brave://extensions/`.

3. Enable **Developer mode** using the toggle in the upper-right corner.

4. Click **Load unpacked** and select the folder you unzipped.

5. The extension icon (green shield) will appear in your toolbar. Pin it for easy access.

## How It Works

### Scenario 1: Fresh Browser (No Existing Cookies)

The extension activates immediately. All cookies are blocked by default. When you visit a site where you need to log in (Chase, Google, Claude, etc.), click the extension icon and flip the toggle to **Allowed**. That domain is whitelisted permanently until you remove it.

### Scenario 2: Existing Browser (Cookies Already Present)

On install, the extension detects your existing cookies and opens a setup page. This page lists every domain that currently has cookies stored in your browser. You will see:

- **Known** badge: Common sites (Google, Chase, Claude, Amazon, etc.) that are pre-identified.
- **Active** badge: Sites with 5 or more cookies, indicating an active session.
- **Cookie count**: How many cookies each domain has stored.

Use the "Select Common Sites" button to auto-check well-known domains, then manually check or uncheck others. Only checked domains will be whitelisted. Click **Activate Protection** to enable blocking.

**Important:** Activating protection does NOT delete your existing cookies. It only controls which sites can set NEW cookies going forward. To review and delete existing cookies you no longer want, click "View Existing Cookies in Brave" which opens `brave://settings/cookies`.

## Daily Usage

- Click the extension icon on any site to see its status.
- Flip the toggle to allow or block cookies for that domain.
- Use "View Whitelist" to see and manage all whitelisted domains.
- The "Global Protection" toggle lets you pause all blocking temporarily.

## Permissions Explained

- **contentSettings**: Required to set per-site cookie policies.
- **cookies**: Required to scan existing cookies during onboarding.
- **storage**: Stores your whitelist locally.
- **activeTab / tabs**: Reads the current tab URL to show the domain in the popup.
- **host_permissions (`<all_urls>`)**: Required to set cookie rules for any domain.

## File Structure

```
cookie-gatekeeper/
  manifest.json       Manifest V3 extension config
  background.js       Service worker handling cookie rules
  popup.html          Extension icon popup UI
  popup.js            Popup logic
  onboarding.html     First-run setup page
  onboarding.js       Onboarding logic
  icons/              Extension icons (16, 48, 128px)
  README.md           This file
```
