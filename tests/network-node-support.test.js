const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const sharedSrc = read('shared_api.js');
const contentSrc = read('content.js');
const urlgenSrc = read('URLgen.js');
const urlgenHtml = read('URLgen.html');

// Issue #51: support the whole iNaturalist Network (inaturalist.ala.org.au,
// mexico.inaturalist.org, naturalista.uy, ...), not just www.inaturalist.org.
// One shared API (api.inaturalist.org) + page-scraped JWT means the only changes
// are (a) inject on every node and (b) build user-facing links against the node
// the user is actually on instead of a hardcoded www host.
describe('iNaturalist Network multi-node support (issue #51)', () => {
    describe('manifest injects on the network nodes', () => {
        const hp = manifest.host_permissions.join(' ');
        const matches = manifest.content_scripts[0].matches.join(' ');

        test('keeps the shared API host permission', () => {
            expect(hp).toContain('https://api.inaturalist.org/*');
        });

        test('host_permissions cover .org subdomains + the non-.org nodes', () => {
            expect(hp).toContain('https://*.inaturalist.org/*');           // www + mexico/colombia/.. + future
            expect(hp).toContain('https://inaturalist.ala.org.au/*');      // Australia (the reporter)
            expect(hp).toContain('https://*.naturalista.uy/*');            // Uruguay
            expect(hp).toContain('https://*.argentinat.org/*');            // Argentina
            expect(hp).toContain('https://*.biodiversity4all.org/*');      // Portugal
            expect(hp).toContain('https://inaturalist.laji.fi/*');         // Finland
            expect(hp).toContain('https://inaturalist.mma.gob.cl/*');      // Chile
        });

        test('content_scripts match observation pages on the nodes', () => {
            expect(matches).toContain('https://*.inaturalist.org/observations/*');
            expect(matches).toContain('https://inaturalist.ala.org.au/observations/*');
            expect(matches).toContain('https://*.naturalista.uy/observations/*');
        });

        test('upload pages are still excluded (across all hosts)', () => {
            expect(manifest.content_scripts[0].exclude_matches).toContain('https://*/observations/upload*');
        });
    });

    describe('links are node-relative, not hardcoded to www', () => {
        test('the IDENTIFY_PAGE_URL constant was replaced by a function', () => {
            expect(sharedSrc).not.toMatch(/const IDENTIFY_PAGE_URL\s*=/);
            expect(sharedSrc).toMatch(/function getIdentifyPageUrl\(\)/);
            expect(sharedSrc).toMatch(/function getINatSiteBase\(\)/);
        });

        test('no hardcoded www identify/observation deep-links remain in link code', () => {
            // the only allowed www.inaturalist.org refs are the default site + URL-parse base
            for (const src of [sharedSrc, contentSrc, urlgenSrc]) {
                expect(src).not.toContain('https://www.inaturalist.org/observations/identify');
                expect(src).not.toContain('https://www.inaturalist.org/observations/${');
            }
        });

        test('content script records the current node for extension pages', () => {
            expect(contentSrc).toMatch(/lastINatSite:\s*window\.location\.origin/);
        });

        test('extension pages preload the last visited node', () => {
            expect(sharedSrc).toMatch(/storage\.local\.get\('lastINatSite'/);
        });

        test('CSV id paste recognizes non-.org node URLs too', () => {
            expect(contentSrc).not.toMatch(/cleaned\.match\(\/inaturalist\\\.org\\\/observations/);
            expect(contentSrc).toMatch(/naturalista\|argentinat\|biodiversity4all/);
        });
    });

    describe('URL builder "all places" override', () => {
        test('the toggle checkbox exists in the URL builder UI', () => {
            expect(urlgenHtml).toMatch(/id="allPlacesToggle"/);
        });

        test('generateURL adds place_id=any only when ticked and no place filter set', () => {
            expect(urlgenSrc).toMatch(/getElementById\('allPlacesToggle'\)/);
            expect(urlgenSrc).toMatch(/params\.some\(p => p\.startsWith\('place_id='\)\)/);
            expect(urlgenSrc).toMatch(/params\.push\('place_id=any'\)/);
        });
    });

    describe('getINatSiteBase resolves the right host per context', () => {
        // Slice out the pure resolver functions (no IIFE / browserAPI deps) and run them.
        const start = sharedSrc.indexOf('const DEFAULT_INAT_SITE');
        const end = sharedSrc.indexOf('// In extension pages, preload');
        const snippet = sharedSrc.slice(start, end);

        function evalWith(windowObj) {
            const sandbox = { window: windowObj };
            vm.createContext(sandbox);
            vm.runInContext(snippet + '\nthis.getINatSiteBase = getINatSiteBase; this.getIdentifyPageUrl = getIdentifyPageUrl;', sandbox);
            return sandbox;
        }

        test('content-script context returns the page origin (the node)', () => {
            const s = evalWith({ location: { protocol: 'https:', origin: 'https://inaturalist.ala.org.au' } });
            expect(s.getINatSiteBase()).toBe('https://inaturalist.ala.org.au');
            expect(s.getIdentifyPageUrl()).toContain('https://inaturalist.ala.org.au/observations/identify?');
        });

        test('extension-page context (no remembered node) falls back to global', () => {
            const s = evalWith({ location: { protocol: 'chrome-extension:', origin: 'chrome-extension://abc' } });
            expect(s.getINatSiteBase()).toBe('https://www.inaturalist.org');
        });
    });
});
