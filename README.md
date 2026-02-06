# Cookie Gatekeeper v2

A Brave browser extension that blocks all cookies by default and lets you whitelist specific sites with one click.

## Installation (Sideloading into Brave)

1. Unzip the `cookie-gatekeeper.zip` file to a folder on your machine.
2. Open Brave and navigate to `brave://extensions/`.
3. Enable **Developer mode** using the toggle in the upper-right corner.
4. Click **Load unpacked** and select the unzipped folder.
5. The extension icon (green shield) will appear in your toolbar. Pin it for easy access.

## How It Works

### Scenario 1: Fresh Browser (No Existing Cookies)

The extension activates immediately. All cookies are blocked by default.

### Scenario 2: Existing Browser (Cookies Already Present)

On install, the extension opens a setup page that scans your existing cookies, lets you select domains to keep, and optionally deletes all site data from non-whitelisted domains.

## Three Cookie Modes

Each domain can be set to one of three modes:

- **Blocked** (default): No cookies are accepted. The site cannot store anything.
- **Session Only**: Cookies are accepted while you browse, but Brave deletes them automatically when you close the browser. Good for sites you visit occasionally but do not need persistent logins on.
- **Allowed**: Cookies are permanently accepted. Use this for sites where you have accounts and want to stay logged in (Chase, Google, Claude, etc.).

## Daily Usage

### Popup (click the extension icon)
- See the current domain and its cookie mode.
- Click **Blocked**, **Session Only**, or **Allowed** to change the mode.
- Use **Global Protection** toggle to pause all blocking temporarily.
- **Manage List**: View and remove domains from your whitelist and session list.
- **Export**: Download your configuration as a JSON file for backup or transfer.
- **Import**: Load a previously exported JSON file to restore your configuration.

### Right-Click Context Menu
- Right-click anywhere on a page and select **Cookie Gatekeeper: Cycle Cookie Mode**.
- This cycles through: Blocked > Allowed > Session Only > Blocked.
- A brief badge appears on the extension icon confirming the new mode.

### Export / Import
- **Export** creates a JSON file containing your full whitelist and session list.
- **Import** reads that JSON file and applies all domains and their modes.
- Use this to back up your configuration before a Brave reinstall, or to sync settings across machines.

## Permissions Explained

- **contentSettings**: Sets per-site cookie policies (allow, block, session_only).
- **cookies**: Scans existing cookies during onboarding.
- **browsingData**: Deletes all site data from non-whitelisted domains during cleanup.
- **contextMenus**: Adds the right-click "Cycle Cookie Mode" option.
- **storage**: Stores your whitelist, session list, and activation state locally.
- **activeTab / tabs**: Reads the current tab URL to display the domain in the popup.
- **host_permissions (`<all_urls>`)**: Required to set cookie rules for any domain.

## File Structure

```
cookie-gatekeeper/
  manifest.json       Manifest V3 extension config
  background.js       Service worker (cookie rules, context menu, export/import)
  popup.html          Extension icon popup UI
  popup.js            Popup logic (3-mode selector, list management, export/import)
  onboarding.html     First-run setup page
  onboarding.js       Onboarding logic
  icons/              Extension icons (16, 48, 128px)
  README.md           This file
```
