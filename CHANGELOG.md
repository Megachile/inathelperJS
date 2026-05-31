# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.3.2] - 2026-05-30

### Fixed
- Editing a configuration with multiple actions could blank out a "Mark as Reviewed/Unreviewed" (or "Follow/Unfollow") selection, and then "Update Configuration" failed with `Cannot read properties of null (reading 'value')`. The follow/reviewed radio buttons used hardcoded `name`/`id` attributes, so every action's radios shared one document-wide radio group and cleared each other. Each action now gets a unique radio-group name/id, and the save reads are null-guarded with a sensible default. (#50)
- macOS: Alt(Option)-based keyboard shortcuts (e.g. Alt+N to rotate buttons) did nothing, because Option turns the keystroke into a special character so `event.key` was no longer the letter. Shortcuts now fall back to `event.code` (physical key) when Alt is held. (#49)
- Mojibake on the options page: the expand/collapse arrows on existing configuration items (and a few other glyphs) rendered as `â–¼` because `options.html` had no `<meta charset>`, so the browser decoded `options.js` as Windows-1252 instead of UTF-8. Added `<meta charset="UTF-8">`.

### Added
- `browser_specific_settings.gecko_android` so the extension can be installed on Firefox for Android. (#47)

## [3.3.1] - 2026-05-28

First post-launch user-reported fix: the Add to/Remove from Project action couldn't find some projects by name, and the Project ID field was visible but unusable.

### Fixed
- **Project dropdown surfaces common-word projects** (#48) — `lookupProject` now queries iNaturalist's relevance-ranked `/projects/autocomplete` endpoint instead of the general `/projects` search sorted by `observation_count` (which came back `null`, so the sort was meaningless and buried matches past `per_page`). The reported case — typing "blue" to find the project [Blue!](https://www.inaturalist.org/projects/blue) — now works.

### Added
- **Manual project ID entry** (#48) — the Project ID field in the Add to/Remove from Project action is no longer read-only. Typing an ID looks it up via the new `lookupProjectById` helper and auto-fills the project name (with inline success/error feedback), as an escape hatch for any project the dropdown still can't surface.

## [3.3.0] - 2026-05-23

Performance + new annotation downvote action. Bulk actions on 200 observations went from ~4-5 minutes to ~33 seconds — roughly 8× faster — by parallelizing the validation, prevention, and per-obs action loops, switching the pre-action prefetch to the v2 search endpoint with selective fields, and eliminating waste in the post-action settle phase.

### Added
- **Downvote existing annotation action** (#43, #44) — new checkbox on the annotation action panel lets a button downvote (disagree with) the matching existing annotation instead of attempting to add a new one. Useful for cleanup workflows like disagreeing with incorrect Life Stage tags across many observations. `disagreeWithAnnotation()` is a new function in `content.js`; `removeAnnotationVote` is a new undo case in `shared_api.js`. No matching annotation is treated as no-op success (mirrors the addToProject pattern). Action description previews show "Downvote annotation" when configured.
- **`safeFetch` helper** in `shared_api.js` — wraps `fetch` with 429 retry + Retry-After honoring + transient-network retry, returns the Response object as-is so callers can keep their own non-OK handling. Used by every bulk-hot-path write handler (addObservationField, addComment, addTag, addTaxonId, handleQualityMetricAPI, markObservationReviewed, performProjectAction, disagreeWithAnnotation, and the voteOnExistingAnnotation fallback paths).
- **`runWithConcurrency` helper** in `shared_api.js` — bounded-pool parallel execution used to drive the validation, prevention, and action loops.

### Changed
- **Bulk action prefetch uses v2 search endpoint** (#39) — `generatePreActionStates` now calls `/v2/observations` with a selective `fields` parameter (just `id`, `uuid`, `identifications` subfields, `ofvs.field_id/value`, `project_observations.project.id`, `reviewed_by`) and `per_page=200`. Replaces seven v1 multi-ID round-trips (~3.6 MB) with one v2 round-trip (~64 KB). `makeAPIRequest` now detects `/v2/` prefixes and routes them to the v2 base instead of the v1 prefix.
- **`generatePreActionStates` skips `/subscriptions` GETs** when no `follow` action is configured (#37) — the only consumer of `isSubscribed` is the follow undo branch. Annotation, project, field, taxon-id bulks were paying N serial GETs for unread data.
- **`handleStateRestoration` early-returns** when nothing was captured to restore (#38) — annotation-only bulks were paying a 500ms `delay` per observation for a no-op check.
- **`addAnnotation` retries 429 inline** before falling through to `voteOnExistingAnnotation` (#36) — `addAnnotation` was bypassing `makeAPIRequest`'s retry by using raw fetch and treating any non-OK response (including throttling) as a "duplicate annotation, vote on it" case, doubling rate-limit pressure under throttling.
- **Validation loop parallelized** at concurrency 8 (#45) — `validateBulkAction`'s per-observation `getFieldValueDetails` GETs now run in parallel instead of serially. Validating a 200-obs OF bulk dropped from ~30s to ~6s.
- **Prevention loop parallelized** at concurrency 8 (#45) — `handleFollowAndReviewPrevention` per-observation calls now run in parallel.
- **Per-obs action loop parallelized** at concurrency 8 (#45) — the inner per-action loop within one observation stays sequential (actions must run in declared order); concurrency applies across observations. Mid-bulk cancellation uses a flag rather than `break` so in-flight workers drain cleanly. iNat's effective POST throughput is ~7-8 req/s in our tests; conc=8 saturates that without 429s.
- **`storeUndoRecord` evicts oldest entries** when approaching the 10 MB `chrome.storage.local` quota and surfaces `chrome.runtime.lastError` on failure (#40) — heavy users were silently losing undo records past 10 MB with no indication anything was wrong.
- **URLgen full-state persistence** (#46) — `saveInputs` now writes every key that `loadInputs` reads (static inputs, quality grades, reviewed status, search-on, licenses, observation sources, geographic bounding box, custom-list selections, and dynamic action fields). Previously only action boxes persisted across sessions. After a restore, visibility-controlling radios (date type, geo search type) fire change events so their containers show/hide correctly.
- **URLgen default state**: all three quality grades (Casual, Needs ID, Research) and `reviewed=any` are now checked by default and on Reset.

### Fixed
- **v2 prefetch subfield bug** (#39 follow-up) — `:!t` on a complex type only includes the key, not its subfields. The initial v2 migration used `ofvs:!t` (came back as `[{}]`) and `project_observations:!t` (missing `project.id`). Now enumerates `ofvs:(field_id:!t,value:!t)` and `project_observations:(project:(id:!t))` explicitly so the data downstream code reads is actually present.

### Removed
- **Dead `qualityMetric` skip chain** (#41) — `executeAction`, `determineIfActionShouldExecute`, and both `getCurrentQualityMetricState` definitions formed a chain that was never called from the live bulk path. Deleted. The functional gap (skip qualityMetric vote when obs already has it) is real but separate.
- **`performSingleAction` unused `isIdentifyPage` parameter** (#42) — the third argument was unread in the function body and the bulk call site was passing pre-action state into it with a misleading comment. Cleaned up.

## [3.2.3] - 2026-05-10

Patch release eliminating a third-party CDN dependency discovered during the Chrome Web Store submission pass.

### Removed
- The remote stylesheet link to `cdnjs.cloudflare.com/ajax/libs/font-awesome/...` previously included by `URLgen.html`. FontAwesome was used only for two draw-control icons on the URL filter generator's map (`fa-square-o`, `fa-circle-o`) and was loading from a CDN at runtime — meaning Cloudflare saw users' IPs every time URLgen.html opened. This contradicted the privacy policy's claim of no third-party hosts beyond iNaturalist (and GitHub for explicit issue-reporter clicks). Now removed.

### Changed
- The two draw-control icons are now inline SVGs in `URLgen.js`, using `currentColor` so they inherit the surrounding link color. Zero additional payload; no remote loads; no font files.

### Note
References to `.fa-*` classes in `content.js` are unchanged — they query iNaturalist's own page DOM (iNat already loads FontAwesome on its pages) and never required us to ship the library.

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

[Unreleased]: https://github.com/Megachile/inathelperJS/compare/v3.2.3...HEAD
[3.2.3]: https://github.com/Megachile/inathelperJS/releases/tag/v3.2.3
[3.2.2]: https://github.com/Megachile/inathelperJS/releases/tag/v3.2.2
[3.2.1]: https://github.com/Megachile/inathelperJS/releases/tag/v3.2.1
[3.2]: https://github.com/Megachile/inathelperJS/releases/tag/v3.2
[3.1]: https://github.com/Megachile/inathelperJS/releases/tag/v3.1
[3.0]: https://github.com/Megachile/inathelperJS/commit/2cd1cf8
