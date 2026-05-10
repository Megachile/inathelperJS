# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.2.2] - 2026-05-10

Patch release hardening innerHTML usage flagged by Mozilla AMO's static validator. v3.2.1 passed AMO validation with 0 errors but 49 innerHTML warnings, which AMO's reviewer-facing checklist warns can lead to manual rejection. This release audits every flagged location and applies defensive escaping.

### Added
- `escapeHtml(str)` helper in `shared_api.js` — escapes `& < > " '` for safe interpolation into innerHTML template literals.
- `safeUrl(url)` helper in `shared_api.js` — validates that a URL uses http/https; returns empty string for `javascript:` or other unsafe schemes (defense for `<img src>` and `<a href>` attributes).

### Fixed (security hardening, no functional change)
- **Configuration list rendering** (#35) — `${config.name}` and `${config.id}` (user-supplied via the options page) are now escaped when rendered in the configurations display. (`options.js`)
- **Personal lists rendering** (#35) — `${list.name}` and `${list.id}` are now escaped. (`options.js`)
- **Import modals** (#35) — `${set.name}` and `${list.name}` from user-imported JSON files are now escaped. This was the most exploitable surface: a malicious .json shared with users could have injected scripts on import. (`options.js`)
- **Autocomplete suggestions** (#35) — user logins, display names, and icon URLs from iNaturalist API responses are now escaped/validated before insertion. (`shared_api.js`)
- **Taxon suggestion HTML** (#35) — `${taxon.name}`, `${taxon.preferred_common_name}`, and photo URLs are escaped/validated. (`shared_api.js`)
- **Action result modals** (#35) — observation IDs, error messages, action descriptions, and field values that flow into result modals are now escaped. (`shared_api.js`, `content.js`)
- **Bulk-action validation modal** (#35) — observation IDs, field names, current/proposed values are escaped in the pre-action confirmation modal. (`content.js`)
- **Tooltip content** (#35) — field names and values shown in field-conflict tooltips are escaped. (`content.js`)
- **Action description preview** (#35) — the dynamic action descriptions on the bulk-action page escape user-controlled fields (project name, taxon name, comment body, tag text, etc.) before display. (`content.js`)
- **Bulk Action Errors modal** (#35) — error messages are escaped. (`content.js`)

### Note
The 49 `innerHTML` warnings will still appear in Mozilla's static-analysis report — the validator flags every `.innerHTML =` site regardless of whether interpolated values are escaped. The change is in the *content* of what flows through those sites: all user-controlled and external-API data is now `escapeHtml`-wrapped, with URL attributes additionally `safeUrl`-validated. 7 of the 49 warnings remain in `leaflet.js` (third-party, vendored).

## [3.2.1] - 2026-05-10

Patch release fixing Firefox AMO submission validation. v3.2 zip failed Mozilla's static validator with one blocking error and one warning that's becoming a blocker on future submissions.

### Fixed
- Restored `background.scripts: ["background.js"]` alongside `service_worker` in `manifest.json`. Dropping `scripts` in v3.1 (#25) was correct for Chrome MV3 but broke Firefox MV3, which uses `scripts` as the source of truth. Both browsers now point at the same file; each ignores the field it doesn't use. (#34)
- Added `browser_specific_settings.gecko.data_collection_permissions: { required: ["none"] }` to declare that the extension does not collect or transmit user data. Required by Mozilla's new built-in data-consent model for new versions going forward. (#34)

## [3.2] - 2026-05-09

### Added
- In-extension issue reporter — new "Report an Issue or Suggest a Feature" section on the options page. Opens a pre-filled GitHub issue in a new tab with type (bug / feature / question), title, description, and an auto-injected Environment section (extension version + parsed browser+version). Labels are pre-applied via the `?labels=` query param. No OAuth or auth storage. (#24)

### Changed
- URLgen map tile provider switched from raw OpenStreetMap to CartoDB Voyager. Direct OSM use was hitting OpenStreetMap's Tile Usage Policy rate limits, causing intermittent "registration required" overlays for users. Voyager is built on OSM data (so attribution stays valid) and has a generous unauthenticated free tier. (#33)

## [3.1] - 2026-05-07

First tagged release as a standalone repository. The tool itself — previously bundled in the Phenology repo (versions 1.x and 2.x) — has been in active use by iNaturalist power users for some time; this release packages the post-split work and prepares it for distribution via the Chrome Web Store and Firefox AMO.

### Added
- Tags feature — bind iNat observation tag actions to buttons / shortcuts (#3)
- Custom prompt-at-runtime modal for observation-field values, rendered in a `<dialog>` element so input focus works reliably on iNat pages (#2)
- Bulk-action runtime prompts fire once before any observation is touched, instead of once per observation (#32)
- Action description previews for `addTag` and `addToList` in the configuration list (#31)
- README, LICENSE (MIT), and store-listing metadata in `manifest.json` (#19)
- CI runs on the `dev` branch (#13)

### Changed
- Centralized iNat API base URL and identify-page query string into `shared_api.js` constants (#22)
- 429 retry/backoff is now built into `makeAPIRequest` — the per-call `fetchWithRetry` helper is gone (#17)
- `debugLog` moved to `shared_api.js`; variadic, available from all load contexts (#16)
- Console logs route through `debugLog` — silent unless `enableDebugMode()` is enabled (#16)
- Quieter dev console: fully-handled error paths and gated debug instrumentation no longer pollute the console (#15, #30)
- CI bumped `actions/checkout` and `actions/setup-node` to v4; opted into Node 24 for JS actions (#29)
- Dropped `background.scripts` from the manifest; service-worker-only (#25)
- Phenology predictor moved to its own feature branch (not part of this release)

### Fixed
- Verified that tag-write PUTs do not reset other observation fields (`description`, `place_guess`, `geoprivacy`, lat/lng, `positional_accuracy`); combined with `ignore_photos: 1`, tag actions are now safe (#18)
- `safeErrorString` infinite recursion when an Error referenced itself transitively in `cause` chains (#12)
- Null reference crashes in DOM query chains
- Storage write failures during config-set rename now surface to the user instead of silently dropping (#14)
- Dead duplicate `refreshMap` definition removed (#23)
- Premature `setupAnnotationDropdowns` call before target DOM existed (#28)
- `searchLayer` scoping bug — promoted to file scope (#27)
- Error objects in dev console now render via `safeErrorString` instead of `[object Object]` (#26)

## [3.0] - 2026-02-07

Initial port of the existing tool from the Phenology repo into its own standalone repository. Used in unpacked / dev-install form by existing users while release-prep work was completed for 3.1.

[Unreleased]: https://github.com/Megachile/inathelperJS/compare/v3.2.2...HEAD
[3.2.2]: https://github.com/Megachile/inathelperJS/releases/tag/v3.2.2
[3.2.1]: https://github.com/Megachile/inathelperJS/releases/tag/v3.2.1
[3.2]: https://github.com/Megachile/inathelperJS/releases/tag/v3.2
[3.1]: https://github.com/Megachile/inathelperJS/releases/tag/v3.1
[3.0]: https://github.com/Megachile/inathelperJS/commit/2cd1cf8
