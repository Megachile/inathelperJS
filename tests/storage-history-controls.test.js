const fs = require('fs');
const path = require('path');
const { TextEncoder } = require('util');

const repo = path.join(__dirname, '..');
const optionsSource = fs.readFileSync(path.join(repo, 'options.js'), 'utf8');
const sharedSource = fs.readFileSync(path.join(repo, 'shared_api.js'), 'utf8');
const optionsHtml = fs.readFileSync(path.join(repo, 'options.html'), 'utf8');

describe('storage usage and bulk action history (#68)', () => {
    describe('storage usage labels', () => {
        let formatBytes;
        let displayFormattedUsage;
        let calculateStorageBreakdown;
        let renderStorageBreakdown;

        beforeAll(() => {
            const helpers = optionsSource.slice(
                optionsSource.indexOf('function formatBytes('),
                optionsSource.indexOf('async function setStorageWithQuotaCheck(')
            );
            const exported = new Function('browserAPI', 'TextEncoder', `
                ${helpers}
                return { formatBytes, displayFormattedUsage, calculateStorageBreakdown, renderStorageBreakdown };
            `)({}, TextEncoder);
            formatBytes = exported.formatBytes;
            displayFormattedUsage = exported.displayFormattedUsage;
            calculateStorageBreakdown = exported.calculateStorageBreakdown;
            renderStorageBreakdown = exported.renderStorageBreakdown;
        });

        test('Firefox-style unknown quotas do not invent a 5 MB denominator or warning color', () => {
            const element = document.createElement('div');
            displayFormattedUsage(6.95 * 1024 * 1024, null, element);

            expect(element.textContent).toBe('Storage Usage: 6.95 MB used (browser-managed limit)');
            expect(element.textContent).not.toMatch(/\/ 5 MB|139/);
            expect(element.style.color).not.toBe('red');
        });

        test('browsers that expose a quota retain percentage warnings', () => {
            const element = document.createElement('div');
            displayFormattedUsage(9.6 * 1024 * 1024, 10 * 1024 * 1024, element);

            expect(element.textContent).toBe('Storage Usage: 9.6 MB / 10 MB (96.0%)');
            expect(element.style.color).toBe('red');
        });

        test('invalid byte values have a readable fallback', () => {
            expect(formatBytes(undefined)).toBe('Unknown');
            expect(formatBytes(NaN)).toBe('Unknown');
        });

        test('the options page explains the stored data and includes a category breakdown', () => {
            const storageDetailsTag = optionsHtml.match(/<details\b[^>]*id="storageDetails"[^>]*>/);
            expect(storageDetailsTag).not.toBeNull();
            expect(storageDetailsTag[0]).not.toMatch(/\bopen\b/);
            expect(optionsHtml).toMatch(/id="storageExplanation"/);
            expect(optionsHtml).toMatch(/id="storageBreakdown"/);
            expect(optionsHtml).toContain('Stored only in this browser');
            expect(optionsHtml).toContain('does not reverse any actions');
        });

        test('the breakdown accounts for every stored key and adds useful counts', () => {
            const element = document.createElement('div');
            const items = {
                configurationSets: [{ name: 'Main', buttons: [{ id: 'a' }, { id: 'b' }] }],
                customLists: [{ name: 'Review', observations: ['1', '2', '3'] }],
                undoRecords: [{ id: 'a' }, { id: 'b' }],
                jwt: 'session-token',
                highlightColor: '#ff6600'
            };

            const categories = calculateStorageBreakdown(items);
            renderStorageBreakdown(items, element);
            const expectedTotal = Object.entries(items).reduce(
                (total, [key, value]) => total + new TextEncoder().encode(key + JSON.stringify(value)).length,
                0
            );

            expect(categories).toHaveLength(5);
            expect(categories.every(category => category.bytes > 0)).toBe(true);
            expect(categories.reduce((total, category) => total + category.bytes, 0)).toBe(expectedTotal);
            expect(element.textContent).toContain('Button configurations (1 set, 2 buttons)');
            expect(element.textContent).toContain('Custom lists (1 list, 3 saved observations)');
            expect(element.textContent).toContain('Bulk action history (2 records)');
            expect(element.textContent).toContain('iNaturalist sign-in session');
            expect(element.textContent).toContain('Preferences and layout');
            expect(element.querySelectorAll('.storage-breakdown-row')).toHaveLength(5);
            expect([...element.querySelectorAll('.storage-breakdown-row')].every(row => row.textContent.includes('%'))).toBe(true);
        });
    });

    describe('bulk action record controls', () => {
        const buildModal = ({ records, confirmResult = true } = {}) => {
            const modalSource = sharedSource.slice(
                sharedSource.indexOf('function createUndoRecordsModal('),
                sharedSource.indexOf('function showUndoRecordsModal(')
            );
            const removeUndoRecord = jest.fn((_id, callback) => callback(null));
            const clearUndoRecords = jest.fn(callback => callback(null));
            const confirm = jest.fn(() => confirmResult);
            const alert = jest.fn();
            const createProgressBar = () => {
                const bar = document.createElement('div');
                const fill = document.createElement('div');
                fill.className = 'progress-fill';
                bar.appendChild(fill);
                return bar;
            };
            const createUndoRecordsModal = new Function(
                'document', 'createProgressBar', 'generateObservationURL', 'performUndoActions',
                'updateProgressBar', 'markRecordAsUndone', 'debugLog', 'removeUndoRecord',
                'clearUndoRecords', 'alert', 'confirm', 'safeErrorString',
                `${modalSource}; return createUndoRecordsModal;`
            )(
                document,
                createProgressBar,
                () => 'https://www.inaturalist.org/observations/identify',
                jest.fn(),
                jest.fn(),
                jest.fn(),
                jest.fn(),
                removeUndoRecord,
                clearUndoRecords,
                alert,
                confirm,
                error => error.message || String(error)
            );
            const modal = createUndoRecordsModal(records || []);
            document.body.appendChild(modal);
            return { modal, removeUndoRecord, clearUndoRecords, confirm, alert };
        };

        const record = id => ({
            id,
            action: `Action ${id}`,
            timestamp: '2026-08-20T16:23:34Z',
            affectedObservationsCount: 1,
            observations: { [id]: { undoActions: [] } }
        });

        afterEach(() => {
            document.body.innerHTML = '';
        });

        test('the retention explanation is hidden behind an accessible hover hint', () => {
            const { modal } = buildModal({ records: [record('1')] });
            const helpButton = modal.querySelector('.undo-records-help');
            const tooltip = modal.querySelector('.undo-records-help-tooltip');

            expect(helpButton).not.toBeNull();
            expect(helpButton.getAttribute('aria-describedby')).toBe(tooltip.id);
            expect(tooltip.getAttribute('role')).toBe('tooltip');
            expect(tooltip.textContent).toContain('Deleting a record only removes its undo history');
            expect(tooltip.textContent).toContain('approaches 9 MB');
            expect(tooltip.style.display).toBe('none');

            helpButton.dispatchEvent(new MouseEvent('mouseenter'));
            expect(tooltip.style.display).toBe('block');

            helpButton.dispatchEvent(new MouseEvent('mouseleave'));
            expect(tooltip.style.display).toBe('none');

            helpButton.focus();
            expect(tooltip.style.display).toBe('block');
            helpButton.blur();
            expect(tooltip.style.display).toBe('none');
        });

        test('deleting one record confirms that no action is reversed and removes its card', () => {
            const { modal, removeUndoRecord, confirm } = buildModal({ records: [record('1')] });
            const deleteButton = [...modal.querySelectorAll('button')]
                .find(button => button.textContent === 'Delete Record');

            deleteButton.click();

            expect(confirm).toHaveBeenCalledWith(expect.stringContaining('will not reverse any actions'));
            expect(removeUndoRecord).toHaveBeenCalledWith('1', expect.any(Function));
            expect(modal.querySelectorAll('.undo-record')).toHaveLength(0);
            expect(modal.querySelector('h2').textContent).toBe('Bulk Action Records (0)');
        });

        test('clear all removes every card after confirmation', () => {
            const { modal, clearUndoRecords, confirm } = buildModal({
                records: [record('1'), record('2')]
            });
            const clearButton = [...modal.querySelectorAll('button')]
                .find(button => button.textContent === 'Clear All Records');

            clearButton.click();

            expect(confirm).toHaveBeenCalledWith(expect.stringContaining('will not reverse any actions'));
            expect(clearUndoRecords).toHaveBeenCalledTimes(1);
            expect(modal.querySelectorAll('.undo-record')).toHaveLength(0);
            expect(clearButton.disabled).toBe(true);
        });

        test('cancelling a deletion leaves storage and the card untouched', () => {
            const { modal, removeUndoRecord } = buildModal({
                records: [record('1')],
                confirmResult: false
            });
            const deleteButton = [...modal.querySelectorAll('button')]
                .find(button => button.textContent === 'Delete Record');

            deleteButton.click();

            expect(removeUndoRecord).not.toHaveBeenCalled();
            expect(modal.querySelectorAll('.undo-record')).toHaveLength(1);
        });
    });

    describe('bulk action history storage mutations', () => {
        const buildStorageHelpers = initialRecords => {
            let storedRecords = initialRecords;
            const local = {
                get: jest.fn((_key, callback) => callback({ undoRecords: storedRecords })),
                set: jest.fn((data, callback) => {
                    storedRecords = data.undoRecords;
                    callback();
                }),
                remove: jest.fn((_key, callback) => {
                    storedRecords = undefined;
                    callback();
                })
            };
            const browserAPI = { runtime: {}, storage: { local } };
            const helperSource = sharedSource.slice(
                sharedSource.indexOf('function removeUndoRecord('),
                sharedSource.indexOf('function createUndoRecordsModal(')
            );
            const helpers = new Function('browserAPI', 'debugLog', `
                ${helperSource}
                return { removeUndoRecord, clearUndoRecords };
            `)(browserAPI, jest.fn());
            return { ...helpers, local, getStoredRecords: () => storedRecords };
        };

        test('removeUndoRecord persists every record except the selected one', async () => {
            const { removeUndoRecord, local, getStoredRecords } = buildStorageHelpers([
                { id: 'a' }, { id: 'b' }, { id: 'c' }
            ]);

            await new Promise((resolve, reject) => {
                removeUndoRecord('b', error => error ? reject(error) : resolve());
            });

            expect(local.set).toHaveBeenCalledTimes(1);
            expect(getStoredRecords()).toEqual([{ id: 'a' }, { id: 'c' }]);
        });

        test('clearUndoRecords removes only the undoRecords storage key', async () => {
            const { clearUndoRecords, local, getStoredRecords } = buildStorageHelpers([{ id: 'a' }]);

            await new Promise((resolve, reject) => {
                clearUndoRecords(error => error ? reject(error) : resolve());
            });

            expect(local.remove).toHaveBeenCalledWith('undoRecords', expect.any(Function));
            expect(getStoredRecords()).toBeUndefined();
        });
    });
});
