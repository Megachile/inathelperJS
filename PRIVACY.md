# Privacy Policy — iNaturalist Metadata Tool

**Effective date:** 2026-05-10

This is the privacy policy for the **iNaturalist Metadata Tool** browser extension (the "Extension"). It's deliberately short because the Extension is built so that there is very little to disclose.

## Plain summary

The Extension does not collect, store, or transmit any personal information to the maintainer or to any third party. Everything stays either on your device or between you and iNaturalist directly.

## What data the Extension touches

**Stored on your device only (via `browser.storage.local`):**
- Your button configurations, keyboard shortcuts, configuration sets, personal-list selections, and similar settings you create on the Extension's options page.

This data lives in your browser's local extension storage. It is never sent to the maintainer or to any third party. It is deleted if you uninstall the Extension or clear the Extension's storage.

**Sent to iNaturalist, using your own credentials:**
- The Extension makes API requests to `api.inaturalist.org` and reads pages on `www.inaturalist.org` on your behalf.
- These requests are authorized by **your own iNaturalist OAuth token**, which the Extension obtains via the browser's standard `identity` API the first time you use a feature that needs it.
- The maintainer has no server and never sees these requests, your token, or their responses.

**The "Report an Issue" form (optional):**
- When you fill out the form on the options page and click submit, the Extension opens a new browser tab with a **pre-filled GitHub issue URL**. You then review and submit (or not) on GitHub's own page.
- The Extension does not POST anything itself. If you do submit the issue, the act of submitting and your association with that issue is handled entirely by GitHub under your own account and GitHub's privacy policy.

## What the Extension does NOT do

- No analytics, telemetry, or usage tracking.
- No third-party services beyond iNaturalist itself (and GitHub, but only when you explicitly open the issue-reporter tab).
- No remote configuration, no remote scripts, no advertising, no payment systems.
- No server operated by the maintainer.

## Permissions, briefly

- `identity` — to obtain your iNaturalist OAuth token (you grant this yourself the first time).
- `storage` — to save your configuration locally.
- `activeTab`, `tabs`, `webRequest` — so the Extension can read the current iNaturalist page, inject its UI, and open its own bulk-actions page in a new tab.
- Host permissions for `api.inaturalist.org` and `www.inaturalist.org` — the Extension only ever talks to iNaturalist. No other hosts.

## Your control

- Open the Extension's options page to view or edit any stored configuration.
- Use your browser's extension storage tools (or the Extension's import/export feature) to back up or wipe your configuration.
- Uninstalling the Extension removes all of its stored data from your browser.
- Revoke the Extension's access to iNaturalist at any time from your iNaturalist account's connected-applications settings.

## Contact

Open an issue at https://github.com/Megachile/inathelperJS/issues, or use the in-extension "Report an Issue" form on the options page.

## Changes to this policy

If this policy ever materially changes, the updated version will appear in this same file at https://github.com/Megachile/inathelperJS/blob/main/PRIVACY.md with a new effective date at the top, and will be referenced in the CHANGELOG.

## Source

This policy lives in the project repository at https://github.com/Megachile/inathelperJS/blob/main/PRIVACY.md and is version-controlled along with the Extension's code.
