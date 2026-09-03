const fs = require('fs');
const path = require('path');
const { describe, test, expect, beforeAll } = require('@jest/globals');

// Structural guard against the failure mode that wasted the most time on this repo:
// a function that looks live, is edited to fix a bug, and turns out to have no callers
// — so the fix renders nowhere while every source-text test still passes.
//
// It happened three times in one session (July 2026): an amber results section added to
// the dead createActionResultsModal instead of the live createDetailedActionResultsModal;
// undo-summary cases added to the dead generateUndoSummary, which had no live equivalent
// at all; and a "behavioural divergence" diagnosed between two showUndoRecordsModal
// copies whose differing callbacks were both dead, because the parameter they were passed
// to was never invoked.
//
// A July 2026 audit deleted 49 unreferenced functions (~1,100 lines). These tests keep
// the codebase at that fixed point: new dead code fails the build instead of lying in
// wait, and duplicate declarations — where the later silently wins — are caught too.
describe('dead code guard', () => {
    const repo = path.join(__dirname, '..');
    const jsFiles = ['content.js', 'shared_api.js', 'options.js', 'URLgen.js', 'background.js'];
    const markupFiles = ['options.html', 'URLgen.html'];

    // Unreferenced on purpose: invoked by hand from the devtools console.
    const INTENTIONALLY_UNREFERENCED = new Set(['enableDebugMode', 'disableDebugMode']);

    // Comments are stripped before counting references so a name mentioned only in prose
    // (including the comments in this repo that discuss dead code) doesn't read as a use.
    const stripComments = (s) => s
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/[^\n]*/gm, ' ')
        .replace(/([^:])\/\/[^\n]*/g, '$1 ');

    let declarations;   // name -> [files]
    let corpus;         // all product code + markup, comments stripped

    beforeAll(() => {
        const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
        declarations = {};
        for (const f of jsFiles) {
            const src = stripComments(read(f));
            for (const m of src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
                (declarations[m[1]] ||= []).push(f);
            }
        }
        corpus = [...jsFiles, ...markupFiles].map(f => stripComments(read(f))).join('\n');
    });

    test('the audit actually sees the codebase', () => {
        // Guards against a regex/path change silently making these tests vacuous.
        expect(Object.keys(declarations).length).toBeGreaterThan(200);
        expect(declarations.performSingleAction).toBeDefined();
    });

    test('every top-level function is referenced somewhere', () => {
        const orphans = [];
        for (const [name, files] of Object.entries(declarations)) {
            if (INTENTIONALLY_UNREFERENCED.has(name)) continue;
            const re = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g');
            const hits = (corpus.match(re) || []).length;
            // Each declaration is itself one occurrence; anything beyond that is a use.
            if (hits - files.length <= 0) orphans.push(`${name} (${files.join(', ')})`);
        }
        expect(orphans).toEqual([]);
    });

    // The later declaration silently wins, so the earlier one's behaviour is discarded.
    // This is how saveButtonOrder lost its de-duplication, and the same shape as the
    // updateBulkButtonPosition duplicate (#61) and closed #41.
    test('no function is declared twice in the same file', () => {
        const dupes = [];
        for (const [name, files] of Object.entries(declarations)) {
            const perFile = files.reduce((acc, f) => ({ ...acc, [f]: (acc[f] || 0) + 1 }), {});
            for (const [file, count] of Object.entries(perFile)) {
                if (count > 1) dupes.push(`${name} declared ${count}x in ${file}`);
            }
        }
        expect(dupes).toEqual([]);
    });

    describe('URL builder field registry', () => {
        test('one registry drives every button, restored field, and ID-filter type', () => {
            const urlgen = fs.readFileSync(path.join(repo, 'URLgen.js'), 'utf8');
            const html = fs.readFileSync(path.join(repo, 'URLgen.html'), 'utf8');
            const registry = urlgen.match(/const URL_BUILDER_DYNAMIC_FIELDS = Object\.freeze\(\{([\s\S]*?)\n\}\);/);
            expect(registry).not.toBeNull();

            const entries = [...registry[1].matchAll(/^\s*([A-Za-z_$][\w$]*):\s*\{\s*buttonId:\s*'([^']+)',\s*includeInIdFilters:\s*(true|false)/gm)]
                .map(([, type, buttonId, include]) => ({ type, buttonId, include: include === 'true' }));
            expect(entries.map(entry => entry.type)).toEqual([
                'taxon', 'idTaxon', 'user', 'identifier', 'project', 'place', 'observationField', 'annotation'
            ]);
            for (const entry of entries) {
                expect(html).toContain(`id="${entry.buttonId}"`);
            }

            expect(urlgen).toMatch(/Object\.entries\(URL_BUILDER_DYNAMIC_FIELDS\)[\s\S]*addField\(type\)/);
            expect(urlgen).toMatch(/URL_BUILDER_FIELD_TYPES\.includes\(type\)/);
            expect(urlgen).toMatch(/URL_BUILDER_ID_FILTER_TYPES\.forEach\(type/);
            expect(urlgen).toMatch(/const lastActionBox = addField\(field\.type\);\s*if \(!lastActionBox\) return;/);
        });

        test('autocomplete targets are direct, statically visible references', () => {
            const urlgen = fs.readFileSync(path.join(repo, 'URLgen.js'), 'utf8');
            expect(urlgen).toMatch(/const URL_BUILDER_AUTOCOMPLETE_LOOKUPS = Object\.freeze\(\{\s*user: lookupUser,\s*project: lookupProject,\s*place: lookupPlace\s*\}\);/);

            const sites = [];
            for (const f of jsFiles) {
                const src = stripComments(fs.readFileSync(path.join(repo, f), 'utf8'));
                for (const m of src.matchAll(/(?:window|globalThis|self)\s*\[[^\]]+\]/g)) {
                    sites.push(`${f}: ${m[0].trim()}`);
                }
            }
            expect(sites).toEqual([]);
        });

        test('a corrupt persisted field type is rejected before touching the DOM', () => {
            const urlgen = fs.readFileSync(path.join(repo, 'URLgen.js'), 'utf8');
            const registrySource = urlgen.slice(
                urlgen.indexOf('const URL_BUILDER_DYNAMIC_FIELDS'),
                urlgen.indexOf("document.addEventListener('DOMContentLoaded'")
            );
            const addFieldSource = urlgen.slice(
                urlgen.indexOf('function addField(type)'),
                urlgen.indexOf("document.getElementById('actionsContainer').addEventListener", urlgen.indexOf('function addField(type)'))
            );
            // eslint-disable-next-line no-new-func
            const addField = new Function('lookupUser', 'lookupProject', 'lookupPlace', `
                ${registrySource}
                ${addFieldSource}
                return addField;
            `)(() => {}, () => {}, () => {});

            const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
            expect(addField('not-a-real-field')).toBeNull();
            expect(warning).toHaveBeenCalledWith(expect.stringContaining('unsupported saved field type'));
            warning.mockRestore();
        });
    });

    // Cross-file duplicates are not a shadowing bug when the files never share a scope
    // (content.js and options.js don't), but they drift. shared_api.js DOES share scope
    // with both, so a name it defines must not be redefined by its consumers.
    test('shared_api.js names are not redefined by files that load it', () => {
        const conflicts = [];
        for (const [name, files] of Object.entries(declarations)) {
            if (!files.includes('shared_api.js')) continue;
            for (const other of ['content.js', 'options.js', 'URLgen.js']) {
                if (files.includes(other)) conflicts.push(`${name}: shared_api.js and ${other}`);
            }
        }
        // safeErrorString is a known, byte-identical duplication; harmless but recorded
        // here so a *divergent* redefinition still fails.
        expect(conflicts).toEqual(['safeErrorString: shared_api.js and content.js']);
    });
});
