const fs = require('fs');
const path = require('path');
const { describe, test, expect, beforeAll } = require('@jest/globals');

// Issue #60 (reported by @ariellopezpics): observation field "Date" (id 108) could
// not be selected. The autocomplete endpoint ranks by usage, so the exact match
// sits at rank ~30 for q=date — well past the per_page:10 the extension asked for
// — and the Field ID input was readonly, so there was no way to enter it directly.
//
// Same root cause and same fix shape as #48 (projects).
describe('Observation field lookup and manual ID entry (#60)', () => {
    let sharedApiJs;
    let optionsJs;

    beforeAll(() => {
        sharedApiJs = fs.readFileSync(path.join(__dirname, '..', 'shared_api.js'), 'utf-8');
        optionsJs = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf-8');
    });

    const lookupBody = () => sharedApiJs.slice(
        sharedApiJs.indexOf('function lookupObservationField('),
        sharedApiJs.indexOf('function sortFieldsByRelevance(')
    );

    describe('autocomplete page size', () => {
        test('requests more than the old 10 results', () => {
            const sig = lookupBody().match(/function lookupObservationField\(name, perPage = (\d+)\)/);
            expect(sig).not.toBeNull();
            expect(Number(sig[1])).toBeGreaterThanOrEqual(50);
        });

        test('still queries the observation_fields autocomplete endpoint', () => {
            expect(lookupBody()).toMatch(/\/observation_fields\/autocomplete/);
        });

        test('routes results through the relevance sort', () => {
            expect(lookupBody()).toMatch(/sortFieldsByRelevance\(/);
        });

        // The dropdown renders every result it is handed, so fetching 50 without
        // trimming would produce a 50-row scroll. Trim must happen after ranking,
        // or the hoisted exact match could be cut.
        test('trims to a display limit after sorting, not before', () => {
            expect(lookupBody()).toMatch(
                /sortFieldsByRelevance\([^)]*\)\.slice\(0, FIELD_SUGGESTION_LIMIT\)/
            );
        });

        test('the display limit still beats the old hardcoded 10', () => {
            const limit = sharedApiJs.match(/const FIELD_SUGGESTION_LIMIT = (\d+)/);
            expect(limit).not.toBeNull();
            expect(Number(limit[1])).toBeGreaterThan(10);
        });
    });

    describe('sortFieldsByRelevance behaviour', () => {
        let sortFieldsByRelevance;

        beforeAll(() => {
            const src = sharedApiJs.slice(
                sharedApiJs.indexOf('function sortFieldsByRelevance('),
                sharedApiJs.indexOf('// Resolve a single observation field by numeric ID')
            );
            // eslint-disable-next-line no-new-func
            sortFieldsByRelevance = new Function(`${src}; return sortFieldsByRelevance;`)();
        });

        // Mirrors the real API ordering for q=date, trimmed: the exact match is last.
        const dateResults = () => ([
            { id: 2833, name: 'Date Recorded' },
            { id: 109, name: 'Date Observed' },
            { id: 171, name: 'Date of Observation' },
            { id: 272, name: 'Collection Date' },
            { id: 2381, name: 'Extinction date' },
            { id: 108, name: 'Date' },
        ]);

        test('hoists the exact match to the top (the reported case)', () => {
            const sorted = sortFieldsByRelevance(dateResults(), 'date');
            expect(sorted[0].id).toBe(108);
        });

        test('is case-insensitive', () => {
            const sorted = sortFieldsByRelevance(dateResults(), 'DATE');
            expect(sorted[0].id).toBe(108);
        });

        test('tolerates surrounding whitespace in the query', () => {
            const sorted = sortFieldsByRelevance(dateResults(), '  date  ');
            expect(sorted[0].id).toBe(108);
        });

        test('prefix matches rank above mid-string matches', () => {
            const sorted = sortFieldsByRelevance(dateResults(), 'date');
            const names = sorted.map(f => f.name);
            expect(names.indexOf('Date Recorded')).toBeLessThan(names.indexOf('Collection Date'));
        });

        test('preserves the API usage order within a tier', () => {
            const sorted = sortFieldsByRelevance(dateResults(), 'date');
            const names = sorted.map(f => f.name);
            expect(names.indexOf('Date Recorded')).toBeLessThan(names.indexOf('Date Observed'));
            expect(names.indexOf('Date Observed')).toBeLessThan(names.indexOf('Date of Observation'));
        });

        test('returns the list untouched for an empty query', () => {
            const input = dateResults();
            expect(sortFieldsByRelevance(input, '')).toEqual(input);
        });

        test('does not drop any results', () => {
            expect(sortFieldsByRelevance(dateResults(), 'date')).toHaveLength(6);
        });
    });

    describe('lookupObservationFieldById helper', () => {
        const body = () => sharedApiJs.slice(
            sharedApiJs.indexOf('function lookupObservationFieldById('),
            sharedApiJs.indexOf('function lookupPlace(')
        );

        test('is defined', () => {
            expect(sharedApiJs).toMatch(/function lookupObservationFieldById\(/);
        });

        // There is no v1 endpoint — GET /v1/observation_fields/:id 404s with HTML.
        // The legacy Rails .json route is the only one that resolves a field by ID.
        test('uses the legacy .json route, not a v1 path', () => {
            expect(body()).toMatch(/observation_fields\/\$\{encodeURIComponent\(fieldId\)\}\.json/);
            expect(body()).not.toMatch(/v1\/observation_fields\//);
        });

        test('encodes the id', () => {
            expect(body()).toMatch(/encodeURIComponent\(fieldId\)/);
        });

        test('rejects on a non-ok response', () => {
            expect(body()).toMatch(/if \(!response\.ok\)/);
        });

        test('is reachable under existing host permissions', () => {
            const manifest = JSON.parse(
                fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf-8')
            );
            expect(manifest.host_permissions).toContain('https://*.inaturalist.org/*');
        });
    });

    describe('Field ID manual entry in the options UI', () => {
        test('the Field ID input is no longer readonly', () => {
            const input = optionsJs.match(/<input type="number" class="fieldId"[^>]*>/);
            expect(input).not.toBeNull();
            expect(input[0]).not.toMatch(/readonly/);
        });

        test('its placeholder tells the user manual entry works', () => {
            const input = optionsJs.match(/<input type="number" class="fieldId"[^>]*>/);
            expect(input[0]).toMatch(/type to enter manually/i);
        });

        test('a status line exists to report lookup results', () => {
            expect(optionsJs).toMatch(/class="fieldIdStatus"/);
        });

        // The manual-entry logic lives in one shared helper, used by the single-field
        // action and by both ends of Copy Observation Field.
        const handler = () => {
            const start = optionsJs.indexOf('function wireFieldIdManualEntry(');
            expect(start).toBeGreaterThan(-1);
            return optionsJs.slice(start, optionsJs.indexOf('function addActionToForm(', start));
        };

        test('debounces the lookup', () => {
            expect(handler()).toMatch(/setTimeout/);
            expect(handler()).toMatch(/clearTimeout/);
        });

        test('guards against stale responses with a token', () => {
            expect(handler()).toMatch(/lookupToken/);
            expect(handler()).toMatch(/token !== lookupToken/);
        });

        test('back-fills the field name on success', () => {
            expect(handler()).toMatch(/nameInput\.value = field\.name/);
        });

        // datatype/allowed_values drive updateFieldValueInput; if the by-ID path
        // skipped them the value input would render as a plain text box.
        test('populates datatype and allowed values via the shared applier', () => {
            expect(optionsJs).toMatch(
                /wireFieldIdManualEntry\(fieldNameInput, fieldIdInput, fieldIdStatus, \(field\) => \{\s*applyObservationField\(field, false\);/
            );
            const applier = optionsJs.slice(
                optionsJs.indexOf('function applyObservationField('),
                optionsJs.indexOf('setupAutocompleteDropdown(fieldNameInput')
            );
            expect(applier).toMatch(/fieldDatatype/);
            expect(applier).toMatch(/fieldAllowedValues/);
            expect(applier).toMatch(/updateFieldValueInput/);
        });

        // Rewriting the input the user is typing in would jump their caret.
        test('does not rewrite the id input on the manual path', () => {
            const applier = optionsJs.slice(
                optionsJs.indexOf('function applyObservationField('),
                optionsJs.indexOf('setupAutocompleteDropdown(fieldNameInput')
            );
            expect(applier).toMatch(/if \(setId\) fieldIdInput\.value = result\.id/);
        });

        test('reports a not-found id', () => {
            expect(handler()).toMatch(/No observation field found with ID/);
        });

        // Found by an external review pass: making the ID editable meant a save during the
        // 400ms debounce (or after a failed lookup) could persist the newly typed ID next
        // to the PREVIOUS field's name/datatype/allowed values. Validation only checks that
        // the ID and name are non-empty, so the mismatch saved silently.
        describe('invalidates stale metadata on edit', () => {
            test('the name is cleared before the debounce, not after resolution', () => {
                const h = handler();
                const clearAt = h.indexOf("nameInput.value = ''");
                const timeoutAt = h.indexOf('_lookupTimeout = setTimeout');
                expect(clearAt).toBeGreaterThan(-1);
                expect(clearAt).toBeLessThan(timeoutAt);
            });

            test('callers can clear their own derived metadata', () => {
                expect(handler()).toMatch(/onInvalidate/);
                // The single-field action clears datatype + allowed values.
                expect(optionsJs).toMatch(/wireFieldIdManualEntry\(fieldNameInput[\s\S]{0,400}fieldDatatype[\s\S]{0,200}fieldAllowedValues/);
            });

            // Clearing the box used to return before bumping the token or cancelling the
            // timer, so a pending lookup still fired and could refill an empty field.
            test('clearing the ID cancels any pending or in-flight lookup', () => {
                const listener = handler().slice(handler().indexOf("idInput.addEventListener('input'"));
                const clearAt = listener.indexOf('clearTimeout(idInput._lookupTimeout)');
                const tokenAt = listener.indexOf('++lookupToken');
                const earlyReturnAt = listener.indexOf('if (!id)');
                expect(clearAt).toBeGreaterThan(-1);
                expect(earlyReturnAt).toBeGreaterThan(-1);
                expect(clearAt).toBeLessThan(earlyReturnAt);
                expect(tokenAt).toBeLessThan(earlyReturnAt);
            });
        });

        // Second review pass: selecting a field by NAME sets the ID programmatically, which
        // fires no `input` event — so a manual-ID lookup already in flight would resolve
        // afterwards and overwrite the freshly picked field's name/metadata while leaving
        // the new ID in place. The helper now returns a cancel() for the autocomplete path.
        describe('name-autocomplete cancels a pending ID lookup', () => {
            test('the helper returns a cancel function', () => {
                const h = handler();
                expect(h).toMatch(/const cancel = \(\) => \{/);
                expect(h).toMatch(/return cancel;/);
                // cancel must both stop the timer and invalidate an in-flight response
                const cancelBody = h.slice(h.indexOf('const cancel'), h.indexOf("idInput.addEventListener('input'"));
                expect(cancelBody).toMatch(/clearTimeout/);
                expect(cancelBody).toMatch(/lookupToken\+\+/);
            });

            test.each([
                ['fieldId', 'cancelFieldIdLookup'],
                ['sourceFieldId', 'cancelSourceFieldIdLookup'],
                ['targetFieldId', 'cancelTargetFieldIdLookup'],
            ])('%s autocomplete calls %s and marks the id resolved', (_cls, cancelName) => {
                expect(optionsJs).toMatch(new RegExp(`${cancelName} = wireFieldIdManualEntry\\(`));
                expect(optionsJs).toMatch(new RegExp(`${cancelName}\\(\\);`));
            });
        });

        // An unresolved or failed ID must not be saveable, even if the user hand-types a
        // name — otherwise the ID and the name/datatype describe different fields.
        describe('unresolved IDs cannot be saved', () => {
            test('resolution is recorded only on a confirmed id', () => {
                expect(handler()).toMatch(/idInput\.dataset\.resolvedId = String\(field\.id\)/);
                expect(handler()).toMatch(/delete idInput\.dataset\.resolvedId/);
            });

            test('extraction rejects an id that has not resolved', () => {
                expect(optionsJs).toMatch(/fieldIdEl\.dataset\.resolvedId !== action\.fieldId/);
                expect(optionsJs).toMatch(/srcIdEl\.dataset\.resolvedId !== action\.sourceFieldId/);
                expect(optionsJs).toMatch(/tgtIdEl\.dataset\.resolvedId !== action\.targetFieldId/);
            });

            // Third review pass: the ID/name pairing breaks from either side. Editing the
            // name by hand after a field resolved left resolvedId matching the ID while the
            // name described something else, and extraction only compares the ID.
            test('hand-editing the name invalidates the resolved pairing', () => {
                const h = handler();
                expect(h).toMatch(/nameInput\.addEventListener\('input'/);
                const nameListener = h.slice(h.indexOf("nameInput.addEventListener('input'"));
                expect(nameListener).toMatch(/delete idInput\.dataset\.resolvedId/);
            });

            // Otherwise merely re-opening a saved config and saving it would be rejected.
            test('loading a saved action marks its id as already resolved', () => {
                expect(optionsJs).toMatch(/\.fieldId'\)\.dataset\.resolvedId = String\(action\.fieldId\)/);
                expect(optionsJs).toMatch(/\.sourceFieldId'\)\.dataset\.resolvedId = String\(action\.sourceFieldId\)/);
                expect(optionsJs).toMatch(/\.targetFieldId'\)\.dataset\.resolvedId = String\(action\.targetFieldId\)/);
            });
        });
    });

    // Copy Observation Field has the same problem on both ends of the copy.
    describe('Copy Observation Field manual entry', () => {
        test.each(['sourceFieldId', 'targetFieldId'])('%s is no longer readonly', (cls) => {
            const input = optionsJs.match(new RegExp(`<input type="number" class="${cls}"[^>]*>`));
            expect(input).not.toBeNull();
            expect(input[0]).not.toMatch(/readonly/);
            expect(input[0]).toMatch(/type to enter manually/i);
        });

        test.each(['sourceFieldIdStatus', 'targetFieldIdStatus'])('%s status line exists', (cls) => {
            expect(optionsJs).toMatch(new RegExp(`class="${cls}"`));
        });

        test('both ends are wired to the shared manual-entry helper', () => {
            expect(optionsJs).toMatch(
                /wireFieldIdManualEntry\(sourceFieldNameInput, sourceFieldIdInput, sourceFieldIdStatus\)/
            );
            expect(optionsJs).toMatch(
                /wireFieldIdManualEntry\(targetFieldNameInput, targetFieldIdInput, targetFieldIdStatus\)/
            );
        });

        test('the helper is shared, not duplicated per call site', () => {
            const defs = optionsJs.match(/function wireFieldIdManualEntry\(/g);
            expect(defs).toHaveLength(1);
        });
    });
});
