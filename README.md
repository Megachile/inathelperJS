# iNaturalist Metadata Tool

A browser extension that adds configurable keyboard shortcuts, custom action buttons, and bulk-operation workflows to [iNaturalist](https://www.inaturalist.org/). Built for power users — identifiers, reviewers, project curators, and anyone who finds themselves repeating the same handful of clicks dozens of times a day.

This is an **evolving tool** built by and for people who actually use iNat heavily. The feature set has grown out of years of "I wish iNat could just..." moments. If you're reading this README, please [open an issue](https://github.com/Megachile/inathelperJS/issues) with whatever you wish it did differently, what's broken for you, or what's confusing — that's how it gets better.

## What it does

Once installed and configured, the extension lets you:

- **Bind any iNat action to a keyboard shortcut or button** — annotations, observation fields, taxon IDs, comments, project additions, quality metrics, follows, "mark reviewed", copying field values between observations, adding to personal lists, and tagging.
- **Run bulk actions** across many observations at once, with a single up-front prompt for any user-supplied values (e.g., "tag all 80 of these with X").
- **Build complex Identify-page URLs** through the included Advanced Filter URL Generator — quality grade, taxon categories, geographic filters, place IDs, and more.

Configuration lives on the options page. Multiple "configuration sets" let you swap entire button layouts depending on what kind of work you're doing.

## Installation

- **Chrome / Edge / Brave:** [Chrome Web Store](https://chromewebstore.google.com/detail/inaturalist-metadata-tool/kgnajdmgemhinploocjifefdcbomdfph)
- **Firefox:** [Firefox Add-ons (AMO)](https://addons.mozilla.org/en-US/firefox/addon/inaturalist-metadata-tool/)

## Getting started

Click the extension's icon in your browser toolbar to open the **options page** — that's where you configure everything. (If the icon isn't visible, pin it from your browser's extensions menu first.)

On the options page you can:

- Define buttons and their actions
- Assign keyboard shortcuts and modifier keys
- Group buttons into configuration sets
- Toggle bulk-action behavior, prompt-at-runtime values, etc.

The page has inline guidance for each action type. Once configured, your buttons and shortcuts will be live on iNat observation and identify pages.

## Contributing & feedback

This extension is genuinely under active development and welcomes feedback from anyone who uses it.

- **Bug reports and feature requests:** [open an issue](https://github.com/Megachile/inathelperJS/issues) — even half-formed thoughts ("this seems weird?", "what if it could do X?") are useful.
- **Pull requests:** welcome. Run `npm test` before submitting (242 tests; see [TEST_README.md](TEST_README.md)).

### Local development

To work on the extension from a clone:

- **Chrome/Edge/Brave:** `chrome://extensions` → enable Developer mode → **Load unpacked** → select the repo folder.
- **Firefox:** `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → select `manifest.json` (resets on browser restart).

## License

[MIT](LICENSE).
