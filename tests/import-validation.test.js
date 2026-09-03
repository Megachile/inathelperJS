const fs = require('fs');
const path = require('path');
const vm = require('vm');

const optionsSource = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8');

describe('Import validation (#62)', () => {
    let validateAndNormalizeImportData;

    beforeAll(() => {
        const sandbox = {
            console,
            document: { addEventListener: jest.fn() },
            browserAPI: { storage: { onChanged: { addListener: jest.fn() } } }
        };
        vm.runInNewContext(
            `${optionsSource}\n;globalThis.__importValidator = validateAndNormalizeImportData;`,
            sandbox
        );
        validateAndNormalizeImportData = sandbox.__importValidator;
    });

    const button = (overrides = {}) => ({
        id: 'button-1',
        name: 'Withdraw ID',
        shortcut: { key: '', ctrlKey: false, shiftKey: false, altKey: false },
        actions: [{ type: 'withdrawId' }],
        ...overrides
    });

    const importFile = (buttonOverrides = {}) => ({
        configurationSets: [{ name: 'Imported Set', buttons: [button(buttonOverrides)] }],
        customLists: [{ id: 'list-1', name: 'Review later', observations: [123, '456'] }]
    });

    test('accepts and clones a well-formed export', () => {
        const source = importFile();
        const normalized = validateAndNormalizeImportData(source);
        expect(JSON.parse(JSON.stringify(normalized))).toMatchObject(source);
        expect(normalized).not.toBe(source);
        expect(normalized.configurationSets).not.toBe(source.configurationSets);
        expect(normalized.customLists[0].observations).not.toBe(source.customLists[0].observations);
    });

    test('normalizes pre-v3.4 Agree actions to the historical community target', () => {
        const normalized = validateAndNormalizeImportData(importFile({
            actions: [{ type: 'agreeId' }]
        }));
        expect(normalized.configurationSets[0].buttons[0].actions[0].agreeTarget).toBe('community');
    });

    test('rejects an unsupported action with its exact JSON path', () => {
        expect(() => validateAndNormalizeImportData(importFile({
            actions: [{ type: 'runArbitraryCode' }]
        }))).toThrow('configurationSets[0].buttons[0].actions[0].type: unsupported action type');
    });

    test('runs action-specific validation on imported buttons', () => {
        expect(() => validateAndNormalizeImportData(importFile({
            actions: [{ type: 'addComment', commentBody: '' }]
        }))).toThrow('configurationSets[0].buttons[0]: Please enter a comment body');
        expect(() => validateAndNormalizeImportData(importFile({
            actions: [{ type: 'qualityMetric', metric: 'bogus', vote: 'agree' }]
        }))).toThrow('configurationSets[0].buttons[0]: Please select both a metric and a vote');
    });

    test('rejects truthy action properties of the wrong type', () => {
        expect(() => validateAndNormalizeImportData(importFile({
            actions: [{ type: 'addComment', commentBody: { text: 'not a string' } }]
        }))).toThrow('configurationSets[0].buttons[0].actions[0].commentBody: must be string');
        expect(() => validateAndNormalizeImportData(importFile({
            actions: [{ type: 'addToList', listId: 'list-1', remove: 'false' }]
        }))).toThrow('configurationSets[0].buttons[0].actions[0].remove: must be boolean');
    });

    test('rejects malformed sets before modal code can assume their shape', () => {
        expect(() => validateAndNormalizeImportData({
            configurationSets: [{ name: 'Broken' }]
        })).toThrow('configurationSets[0].buttons: must be an array');
        expect(() => validateAndNormalizeImportData({
            configurationSets: [{ name: '', buttons: [] }]
        })).toThrow('configurationSets[0].name: must be a non-empty string');
    });

    test('rejects duplicate names, IDs, and shortcuts within an imported set', () => {
        const duplicate = property => {
            const first = button();
            const second = button({ id: 'button-2', name: 'Second' });
            if (property === 'id') second.id = first.id;
            if (property === 'name') second.name = first.name;
            if (property === 'shortcut') {
                first.shortcut = { key: 'J', ctrlKey: true, shiftKey: false, altKey: false };
                second.shortcut = { ...first.shortcut };
            }
            return { configurationSets: [{ name: 'Imported Set', buttons: [first, second] }] };
        };

        expect(() => validateAndNormalizeImportData(duplicate('id'))).toThrow('duplicates button ID');
        expect(() => validateAndNormalizeImportData(duplicate('name'))).toThrow('button name is already in use');
        expect(() => validateAndNormalizeImportData(duplicate('shortcut'))).toThrow('shortcut is already used');
    });

    test('validates set ordering metadata and observation-field maps', () => {
        expect(() => validateAndNormalizeImportData({
            configurationSets: [{
                name: 'Imported Set',
                buttons: [button()],
                customOrder: ['missing-button']
            }]
        })).toThrow('configurationSets[0].customOrder: references unknown button ID');
        expect(() => validateAndNormalizeImportData({
            configurationSets: [{
                name: 'Imported Set',
                buttons: [button()],
                observationFieldMap: { 123: { name: 'not a string' } }
            }]
        })).toThrow('configurationSets[0].observationFieldMap: must map field IDs to field names');
    });

    test('validates legacy customButtons through the same path', () => {
        expect(() => validateAndNormalizeImportData({
            customButtons: [button({ actions: [{ type: 'notReal' }] })]
        })).toThrow('legacyConfigurationSets[0].buttons[0].actions[0].type');
    });

    test('rejects malformed and duplicate custom lists', () => {
        expect(() => validateAndNormalizeImportData({
            customLists: [{ id: 'x', name: 'Broken', observations: [{}] }]
        })).toThrow('customLists[0].observations: must contain only non-empty observation IDs');
        expect(() => validateAndNormalizeImportData({
            customLists: [
                { id: 'x', name: 'One', observations: [] },
                { id: 'x', name: 'Two', observations: [] }
            ]
        })).toThrow('customLists[1].id: duplicates list ID');
        expect(() => validateAndNormalizeImportData({
            customLists: [
                { id: 'x', name: 'Same', observations: [] },
                { id: 'y', name: 'Same', observations: [] }
            ]
        })).toThrow('customLists[1].name: duplicates the imported list name');
    });

    test('rejects non-object top-level JSON values', () => {
        expect(() => validateAndNormalizeImportData([])).toThrow('Import: the top-level JSON value must be an object');
        expect(() => validateAndNormalizeImportData(null)).toThrow('Import: the top-level JSON value must be an object');
    });

    test('the file handler validates before opening either import modal or prompting', () => {
        const handler = optionsSource.match(/async function importConfigurations\(event\)[\s\S]*?\n\}/)[0];
        const validation = handler.indexOf('validateAndNormalizeImportData(importedData)');
        expect(validation).toBeGreaterThan(-1);
        expect(validation).toBeLessThan(handler.indexOf('createImportModal(importedData.configurationSets)'));
        expect(validation).toBeLessThan(handler.indexOf('prompt("Enter a name for the imported set'));
        expect(validation).toBeLessThan(handler.indexOf('createListImportModal(importedData.customLists'));
    });

    test('the import allowlist exactly matches the configuration action picker', () => {
        const allowlist = optionsSource.match(/const supportedActionTypes = new Set\(\[([\s\S]*?)\]\);/)[1];
        const picker = optionsSource.match(/<select class="actionType">([\s\S]*?)<\/select>/)[1];
        const allowedTypes = [...allowlist.matchAll(/'([^']+)'/g)].map(match => match[1]).sort();
        const pickerTypes = [...picker.matchAll(/<option value="([^"]+)">/g)]
            .map(match => match[1])
            .filter(Boolean)
            .sort();
        expect(allowedTypes).toEqual(pickerTypes);
    });
});
