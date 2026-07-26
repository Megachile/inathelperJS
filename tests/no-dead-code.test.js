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

    // Reached ONLY through dynamic dispatch, so no static reference to the name exists
    // and the orphan check below cannot see them. This list is why the purge originally
    // deleted lookupPlace and broke the URL builder's Place filter — a static-reference
    // audit is blind to `window[`lookup${Type}`]`. Any new dynamic dispatch must be added
    // both here and to the resolution test below.
    const DYNAMICALLY_REFERENCED = new Set(['lookupPlace']);

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
            if (INTENTIONALLY_UNREFERENCED.has(name) || DYNAMICALLY_REFERENCED.has(name)) continue;
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

    // The orphan check above is a *static* reference count, so it cannot see
    // `window[`lookup${Type}`]`. Deleting lookupPlace on its word broke the URL builder's
    // Place filter at runtime while every test still passed. These two tests close that
    // gap: the first proves every type routed through the dynamic dispatch resolves to a
    // real function, the second fails if a new dynamic dispatch site appears that this
    // file doesn't know about.
    describe('dynamic dispatch targets resolve', () => {
        test('every type reaching URLgen\'s window[`lookup${Type}`] has a lookup function', () => {
            const urlgen = fs.readFileSync(path.join(repo, 'URLgen.js'), 'utf8');

            // Derive the types from every `addField('x')` call site — the actual entry
            // points — unioned with the `const types` array used for restore/generation.
            // Reading only that array would miss a new addField('foo') that never joins it.
            const fromCalls = [...urlgen.matchAll(/addField\(\s*['"]([A-Za-z_$][\w$]*)['"]/g)].map(m => m[1]);
            const arr = urlgen.match(/const types = \[([^\]]*)\]/);
            const fromArray = arr ? arr[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean) : [];
            const types = [...new Set([...fromCalls, ...fromArray])];

            // Types with their own branch in addField never reach the dynamic dispatch.
            const handledEarlier = ['annotation', 'idTaxon', 'taxon', 'identifier', 'observationField'];
            const dynamic = types.filter(t => !handledEarlier.includes(t));

            expect(fromCalls.length).toBeGreaterThan(0); // guard against a vacuous test
            expect(dynamic.length).toBeGreaterThan(0);

            // KNOWN LIMITATION: URLgen's restore path calls addField(field.type) with a
            // value from localStorage, so a persisted type outside the literal call sites
            // could in principle reach the dispatch. In practice persisted types can only
            // be ones that were addable, i.e. a literal call site existed. This regex-based
            // check also proves a declaration exists in a loadable file, not that it is
            // reachable at runtime. Both are accepted gaps; the alternative is a real
            // module graph, which this suite deliberately doesn't build.

            // URLgen.html loads only shared_api.js + URLgen.js, so a declaration living in
            // content.js would not exist at runtime on that page.
            const visibleToURLgen = ['shared_api.js', 'URLgen.js'];
            const missing = dynamic.filter(t => {
                const fn = 'lookup' + t.charAt(0).toUpperCase() + t.slice(1);
                const files = declarations[fn];
                return !files || !files.some(f => visibleToURLgen.includes(f));
            });
            expect(missing).toEqual([]);
        });

        test('no unknown dynamic dispatch sites exist', () => {
            const sites = [];
            for (const f of jsFiles) {
                const src = stripComments(fs.readFileSync(path.join(repo, f), 'utf8'));
                for (const m of src.matchAll(/(?:window|globalThis|self)\s*\[[^\]]+\]/g)) {
                    sites.push(`${f}: ${m[0].trim()}`);
                }
            }
            // Exactly one known site. A new one means the audit's blind spot widened —
            // add it to DYNAMICALLY_REFERENCED and cover it above.
            expect(sites).toEqual([
                'URLgen.js: window[`lookup${type.charAt(0).toUpperCase() + type.slice(1)}`]'
            ]);
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
