const fs = require('fs');
const path = require('path');

const optionsSource = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8');

// Issue #66 — two import-flow annoyances:
//   1. A greenfield install auto-creates an empty "Default Set"; importing sets used to
//      leave that placeholder sitting alongside the imported sets.
//   2. An export file with no lists (customLists: []) still opened the list-import modal
//      and asked the user to approve importing nothing.
describe('Import flow annoyances (#66)', () => {
    describe('greenfield placeholder detection', () => {
        let isPlaceholderDefaultSet;
        let isGreenfieldSetup;

        beforeAll(() => {
            const src = optionsSource.slice(
                optionsSource.indexOf('function isPlaceholderDefaultSet('),
                optionsSource.indexOf('async function processImportChoices(')
            );
            // eslint-disable-next-line no-new-func
            const exported = new Function(
                `${src}; return { isPlaceholderDefaultSet, isGreenfieldSetup };`
            )();
            isPlaceholderDefaultSet = exported.isPlaceholderDefaultSet;
            isGreenfieldSetup = exported.isGreenfieldSetup;
        });

        test('the auto-created empty Default Set is a placeholder', () => {
            expect(isPlaceholderDefaultSet({ name: 'Default Set', buttons: [] })).toBe(true);
        });

        test('a Default Set with buttons is real user data, not a placeholder', () => {
            expect(isPlaceholderDefaultSet({ name: 'Default Set', buttons: [{ name: 'A' }] })).toBe(false);
        });

        test('a differently named empty set is not a placeholder', () => {
            expect(isPlaceholderDefaultSet({ name: 'My Set', buttons: [] })).toBe(false);
        });

        test('a set with no buttons property is still a placeholder', () => {
            expect(isPlaceholderDefaultSet({ name: 'Default Set' })).toBe(true);
        });

        test('null/undefined sets are handled', () => {
            expect(isPlaceholderDefaultSet(null)).toBe(false);
            expect(isPlaceholderDefaultSet(undefined)).toBe(false);
        });

        test('greenfield means exactly one set and it is the placeholder', () => {
            expect(isGreenfieldSetup([{ name: 'Default Set', buttons: [] }])).toBe(true);
        });

        test('an existing user with real sets is not greenfield', () => {
            expect(isGreenfieldSetup([
                { name: 'Default Set', buttons: [] },
                { name: 'Galls', buttons: [{ name: 'A' }] }
            ])).toBe(false);
            expect(isGreenfieldSetup([{ name: 'Galls', buttons: [{ name: 'A' }] }])).toBe(false);
        });

        test('an empty or missing set array is not greenfield', () => {
            expect(isGreenfieldSetup([])).toBe(false);
            expect(isGreenfieldSetup(undefined)).toBe(false);
        });
    });

    // Runs the real prune block out of processImportChoices. It only touches locals, so it
    // can be lifted verbatim and driven with the state the import would have produced.
    describe('the prune block, executed', () => {
        let runPrune;

        beforeAll(() => {
            const start = optionsSource.indexOf('    let removedPlaceholderDefault = false;');
            const end = optionsSource.indexOf('    if (setsToAdd.length > 0 || setsMarkedForMerge.length > 0) {', start);
            const block = optionsSource.slice(start, end);
            expect(start).toBeGreaterThan(-1);
            expect(end).toBeGreaterThan(start);

            const helpers = optionsSource.slice(
                optionsSource.indexOf('function isPlaceholderDefaultSet('),
                optionsSource.indexOf('async function processImportChoices(')
            );
            // eslint-disable-next-line no-new-func
            runPrune = new Function('startedGreenfield', 'configurationSets', 'optionsPageActiveSetName', `
                ${helpers}
                ${block}
                return { configurationSets, optionsPageActiveSetName, removedPlaceholderDefault };
            `);
        });

        test('a greenfield import leaves only the imported sets', () => {
            const result = runPrune(
                true,
                [{ name: 'Default Set', buttons: [] }, { name: 'Galls', buttons: [{ name: 'A' }] }],
                'Default Set'
            );
            expect(result.configurationSets.map(s => s.name)).toEqual(['Galls']);
            expect(result.removedPlaceholderDefault).toBe(true);
            expect(result.optionsPageActiveSetName).toBe('Galls');
        });

        test('an existing user keeps their empty Default Set', () => {
            const sets = [{ name: 'Default Set', buttons: [] }, { name: 'Galls', buttons: [{ name: 'A' }] }];
            const result = runPrune(false, sets, 'Galls');
            expect(result.configurationSets.map(s => s.name)).toEqual(['Default Set', 'Galls']);
            expect(result.removedPlaceholderDefault).toBe(false);
            expect(result.optionsPageActiveSetName).toBe('Galls');
        });

        test('a Default Set that the import merged into is kept', () => {
            const result = runPrune(
                true,
                [{ name: 'Default Set', buttons: [{ name: 'Imported' }] }, { name: 'Galls', buttons: [] }],
                'Default Set'
            );
            expect(result.configurationSets.map(s => s.name)).toEqual(['Default Set', 'Galls']);
            expect(result.removedPlaceholderDefault).toBe(false);
        });

        test('nothing is removed if the placeholder is all that is left', () => {
            const result = runPrune(true, [{ name: 'Default Set', buttons: [] }], 'Default Set');
            expect(result.configurationSets.map(s => s.name)).toEqual(['Default Set']);
            expect(result.removedPlaceholderDefault).toBe(false);
            expect(result.optionsPageActiveSetName).toBe('Default Set');
        });

        test('an active set other than the placeholder is left alone', () => {
            const result = runPrune(
                true,
                [{ name: 'Default Set', buttons: [] }, { name: 'Galls', buttons: [] }, { name: 'Bees', buttons: [] }],
                'Bees'
            );
            expect(result.configurationSets.map(s => s.name)).toEqual(['Galls', 'Bees']);
            expect(result.optionsPageActiveSetName).toBe('Bees');
        });
    });

    describe('processImportChoices drops the placeholder after a greenfield import', () => {
        const fn = optionsSource.match(
            /async function processImportChoices\(results\)[\s\S]*?\n\}/
        );

        test('processImportChoices is defined', () => {
            expect(fn).not.toBeNull();
        });

        test('greenfield state is captured before the sets array is mutated', () => {
            const body = fn[0];
            const captureIndex = body.indexOf('startedGreenfield = isGreenfieldSetup(configurationSets)');
            const mutationIndex = body.indexOf('configurationSets.push(...setsToAdd)');
            expect(captureIndex).toBeGreaterThan(-1);
            expect(mutationIndex).toBeGreaterThan(captureIndex);
        });

        test('the placeholder is removed only when real sets survived the import', () => {
            expect(fn[0]).toMatch(/if \(startedGreenfield && configurationSets\.length > 1\)/);
            expect(fn[0]).toMatch(/configurationSets\.splice\(placeholderIndex, 1\)/);
        });

        test('the active set name moves off the removed placeholder', () => {
            expect(fn[0]).toMatch(
                /optionsPageActiveSetName === placeholder\.name[\s\S]*?optionsPageActiveSetName = configurationSets\[0\]\.name/
            );
        });

        test('removal happens before the save so it is persisted', () => {
            const body = fn[0];
            expect(body.indexOf('configurationSets.splice(placeholderIndex, 1)'))
                .toBeLessThan(body.indexOf('await saveConfigurationSets()'));
        });

        test('the summary alert mentions the removal', () => {
            expect(fn[0]).toMatch(/removedPlaceholderDefault\) messageParts\.push/);
        });
    });

    describe('old-format (customButtons) import also replaces the placeholder', () => {
        const fn = optionsSource.match(/async function importConfigurations\(event\)[\s\S]*?\n\}/);

        test('a greenfield set list is emptied before the imported set is pushed', () => {
            expect(fn[0]).toMatch(/if \(isGreenfieldSetup\(currentSets\)\) \{\s*\n\s*currentSets = \[\];/);
        });

        test('the hardcoded Default Set fallback no longer reintroduces the placeholder', () => {
            expect(fn[0]).not.toMatch(/storageData\.configurationSets \|\| \[\{ name: 'Default Set'/);
        });
    });

    describe('empty containers do not trigger approval modals', () => {
        const fn = optionsSource.match(/async function importConfigurations\(event\)[\s\S]*?\n\}/);

        test('an empty customLists array skips the list import modal', () => {
            expect(fn[0]).toMatch(
                /setsImportShouldProceed && Array\.isArray\(importedData\.customLists\) && importedData\.customLists\.length > 0/
            );
        });

        test('an empty configurationSets array skips the set import modal', () => {
            expect(fn[0]).toMatch(
                /Array\.isArray\(importedData\.configurationSets\) && importedData\.configurationSets\.length > 0/
            );
        });

        test('an empty customButtons array skips the old-format naming prompt', () => {
            expect(fn[0]).toMatch(
                /Array\.isArray\(importedData\.customButtons\) && importedData\.customButtons\.length > 0/
            );
        });

        test('a file of empty containers reports "nothing to import", not "invalid format"', () => {
            expect(fn[0]).toMatch(/Nothing to import/);
            expect(fn[0]).toMatch(/Invalid import format/);
        });
    });
});
