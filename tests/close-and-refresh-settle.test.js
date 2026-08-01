const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { describe, test, expect, beforeEach, afterEach, jest: jestObj } = require('@jest/globals');

// Issue #64: "Close and Refresh" fired window.location.reload() the instant it was
// clicked, and the reload came back showing pre-action data — visually identical to
// the button doing nothing, which is how it got reported ("does not refresh at all").
//
// Measured on a 50-observation batch against a `without_field` filter: the observation
// DOCUMENT carries the new field within ~700ms, but rows kept dropping out of the
// filtered search from 633ms all the way to 8.8s. Document reads and filtered search
// settle at very different rates, which is why an earlier fixed 2s wait didn't help.
//
// Fix: poll the page's own filter for the observations just touched and reload when
// the match count clears or goes quiet. These tests drive the real modal source.
const sharedApi = fs.readFileSync(path.join(__dirname, '..', 'shared_api.js'), 'utf-8');
const contentJs = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf-8');

// Pull the modal and its helpers out of shared_api.js by brace matching, so the tests
// exercise shipped source rather than a transcription of it.
function sliceBlock(header, src = sharedApi) {
    const start = src.indexOf(header);
    if (start === -1) throw new Error(`not found: ${header}`);
    let depth = 0;
    for (let j = src.indexOf('{', start); j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}' && --depth === 0) return src.slice(start, j + 1);
    }
    throw new Error(`unbalanced braces: ${header}`);
}

// Records calls into the stubbed waitForGridToSettle and lets a test resolve it.
let sandboxCalls;

function loadModal() {
    sandboxCalls = [];
    const code = [
        sliceBlock('const controlledTerms = {') + ';',
        sliceBlock('function escapeHtml('),
        sliceBlock('function getINatSiteBase('),
        sliceBlock('function generateObservationURL('),
        sliceBlock('function getAnnotationValueName('),
        sliceBlock('function getAnnotationFieldName('),
        sliceBlock('function createDetailedActionResultsModal('),
        // Shared settle constant, read from source so a rename fails the test loudly.
        sharedApi.match(/const REFRESH_SETTLE_MS = \d+;/)[0],
        sliceBlock('function affectedObservationIds('),
        sharedApi.match(/const REFRESH_POLL_MAX_MS = \d+;/)[0],
    ].join('\n\n');

    const sandbox = {
        document: global.document,
        window: global.window,
        // Both must come from the test realm, not the vm context's own globals, or
        // jest's fake clock advances setTimeout while Date.now() keeps real time and
        // the elapsed-time branch can never be reached.
        setTimeout: global.setTimeout,
        setInterval: global.setInterval,
        clearInterval: global.clearInterval,
        Date: global.Date,
        console,
        debugLog: () => {},
        // Stubbed so the modal's wait is controllable; the real polling loop is
        // covered separately below against its own source.
        waitForGridToSettle: (ids, onTick) => {
            sandboxCalls.push({ ids, onTick });
            return new Promise((resolve) => { sandboxCalls.resolve = resolve; });
        },
        getStoredSiteBase: () => 'https://www.inaturalist.org',
        getIdentifyPageUrl: (...args) => `https://www.inaturalist.org/observations/identify?id=${args[0]}`,
    };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox;
}

const SUMMARY = {
    'observationField|host': {
        actionConfig: { type: 'observationField', fieldName: 'Host Plant', fieldValue: 'Quercus' },
        success: [{ observationId: '123' }],
        failed: [], skipped: [], warnings: [], downvoted: [],
    },
};

const SETTLE_MS = Number(sharedApi.match(/const REFRESH_SETTLE_MS = (\d+);/)[1]);
const POLL_MAX_MS = Number(sharedApi.match(/const REFRESH_POLL_MAX_MS = (\d+);/)[1]);
const POLL_QUIET_MS = Number(sharedApi.match(/const REFRESH_POLL_QUIET_MS = (\d+);/)[1]);
const POLL_INTERVAL_MS = Number(sharedApi.match(/const REFRESH_POLL_INTERVAL_MS = (\d+);/)[1]);
const POLL_ZERO_CONFIRMATIONS = Number(sharedApi.match(/const REFRESH_POLL_ZERO_CONFIRMATIONS = (\d+);/)[1]);

describe('Close and Refresh settle window (#64)', () => {
    let reloads;

    beforeEach(() => {
        jestObj.useFakeTimers();
        document.body.innerHTML = '';
        reloads = 0;
        delete window.location;
        window.location = { href: 'https://www.inaturalist.org/observations', reload: () => { reloads++; } };
    });

    afterEach(() => {
        jestObj.useRealTimers();
    });

    const openModal = (sb) =>
        sb.createDetailedActionResultsModal(SUMMARY, 'Test set', [], {}, [], false);

    test('the button names the wait rather than promising an instant reload', () => {
        const sb = loadModal();
        const button = openModal(sb).querySelector('#detailed-results-close-refresh-button');
        expect(button.textContent).toBe('Refresh When Updated');
        expect(button.title).toMatch(/index/i);
    });

    test('an immediate click waits on the grid instead of reloading', () => {
        const sb = loadModal();
        const modal = openModal(sb);
        modal.querySelector('#detailed-results-close-refresh-button').click();

        expect(reloads).toBe(0);
        expect(sandboxCalls).toHaveLength(1);
    });

    test('it waits on the observations the action actually changed', () => {
        const sb = loadModal();
        const modal = openModal(sb);
        modal.querySelector('#detailed-results-close-refresh-button').click();

        expect(sandboxCalls[0].ids).toEqual(['123']);
    });

    test('it reloads once the grid reports settled', async () => {
        const sb = loadModal();
        const modal = openModal(sb);
        modal.querySelector('#detailed-results-close-refresh-button').click();

        sandboxCalls.resolve({ reason: 'settled', ms: 4200 });
        await Promise.resolve();
        await Promise.resolve();

        expect(reloads).toBe(1);
        expect(modal.parentNode).toBeNull();
    });

    test('the modal stays up while waiting, so the click never looks dead', () => {
        const sb = loadModal();
        const modal = openModal(sb);
        const button = modal.querySelector('#detailed-results-close-refresh-button');
        button.click();

        expect(modal.parentNode).not.toBeNull();
        expect(button.disabled).toBe(true);
        expect(button.textContent).toMatch(/Waiting for iNaturalist/);
        expect(modal.querySelector('#detailed-results-close-button').disabled).toBe(true);
    });

    test('progress ticks show how much is left to update', () => {
        const sb = loadModal();
        const modal = openModal(sb);
        const button = modal.querySelector('#detailed-results-close-refresh-button');
        button.click();

        sandboxCalls[0].onTick({ stillMatching: 7, ms: 1400 });
        expect(button.textContent).toMatch(/7 left/);
    });

    test('a click long after completion skips the wait entirely', () => {
        const sb = loadModal();
        const modal = openModal(sb);
        // Sat reading the results past the point where the grid could still be behind.
        jestObj.advanceTimersByTime(POLL_MAX_MS + 1000);
        modal.querySelector('#detailed-results-close-refresh-button').click();

        expect(sandboxCalls).toHaveLength(0);
        expect(reloads).toBe(1);
        expect(modal.parentNode).toBeNull();
    });

    test('plain Close still closes without reloading', () => {
        const sb = loadModal();
        const modal = openModal(sb);
        modal.querySelector('#detailed-results-close-button').click();
        jestObj.advanceTimersByTime(SETTLE_MS * 2);

        expect(modal.parentNode).toBeNull();
        expect(reloads).toBe(0);
    });

    test('auto-refresh mode still shows no refresh button and reloads on its own', () => {
        const sb = loadModal();
        const modal = sb.createDetailedActionResultsModal(SUMMARY, 'Test set', [], {}, [], true);
        expect(modal.querySelector('#detailed-results-close-refresh-button')).toBeNull();
        expect(modal.querySelector('#detailed-results-close-button')).not.toBeNull();
    });
});

describe('Both refresh paths share one settle constant', () => {
    test('shared_api.js defines REFRESH_SETTLE_MS', () => {
        expect(sharedApi).toMatch(/const REFRESH_SETTLE_MS = \d+;/);
    });

    test('auto-refresh waits on the same grid check as the button', () => {
        const block = contentJs.slice(
            contentJs.indexOf('if (autoRefreshAfterBulk) {', contentJs.indexOf('const actionSpecificSummary')),
        ).slice(0, 400);
        expect(block).toMatch(/waitForGridToSettle\(uniqueSuccessfulObsIds\)/);
        expect(block).not.toMatch(/setTimeout/);
    });

    test('the button path calls it too', () => {
        const modalSrc = sliceBlock('function createDetailedActionResultsModal(');
        expect(modalSrc).toMatch(/waitForGridToSettle\(affectedObservationIds\(summaryByActionType\)/);
    });

});

// The measured behavior these guard against (#64), from a 50-observation batch:
// counts fell from 33 to 5 over 8.8s, bounced UPWARD twice (28→29, 12→14) as queries
// hit Elasticsearch replicas at different refresh states, and never reached zero
// because five observations belonged to users who disallow observation fields.
describe('waitForGridToSettle', () => {
    const settleSrc = () => {
        const start = sharedApi.indexOf('async function waitForGridToSettle(');
        let depth = 0;
        for (let j = sharedApi.indexOf('{', start); j < sharedApi.length; j++) {
            if (sharedApi[j] === '{') depth++;
            else if (sharedApi[j] === '}' && --depth === 0) return sharedApi.slice(start, j + 1);
        }
    };

    test('falls back to quiescence, since the count often never reaches zero', () => {
        // Five observations in the measured run belonged to users who disallow
        // observation fields and never cleared, so zero cannot be the only exit.
        expect(settleSrc()).toMatch(/Date\.now\(\) - lastChangeAt >= REFRESH_POLL_QUIET_MS/);
    });

    test('exits as soon as zero is confirmed, without serving the quiet window', () => {
        // At zero there is nothing left to drain, so waiting out quiescence would be
        // dead time in the common case where every edit landed.
        expect(settleSrc()).toMatch(/zeroReadings >= REFRESH_POLL_ZERO_CONFIRMATIONS/);
        expect(settleSrc()).toMatch(/reason: 'cleared'/);
    });

    test('zero still takes one confirming poll, because counts bounce upward', () => {
        expect(POLL_ZERO_CONFIRMATIONS).toBeGreaterThan(1);
        // ...but confirmation must stay cheaper than the quiet window it replaces.
        expect(POLL_ZERO_CONFIRMATIONS * POLL_INTERVAL_MS).toBeLessThan(POLL_QUIET_MS);
    });

    test('a non-zero reading resets the zero streak', () => {
        // Otherwise a bounce like 0 → 2 → 0 would count as two confirmations.
        expect(settleSrc()).toMatch(/zeroReadings = count === 0 \? zeroReadings \+ 1 : 0/);
    });

    test('requires having seen movement before it can call things settled', () => {
        // Without this, two identical polls before anything propagates read as
        // "settled" and reload immediately — the original bug with extra steps.
        expect(settleSrc()).toMatch(/sawChange && count === lastCount && Date\.now\(\) - lastChangeAt/);
    });

    test('quiet period spans several polls, so a replica bounce cannot end it early', () => {
        expect(POLL_QUIET_MS).toBeGreaterThan(POLL_INTERVAL_MS * 2);
    });

    test('gives up rather than hanging when nothing ever moves', () => {
        expect(settleSrc()).toMatch(/reason: 'no-movement'/);
        expect(settleSrc()).toMatch(/reason: 'timeout'/);
    });

    test('falls back to a flat wait on a page with no filter to watch', () => {
        expect(settleSrc()).toMatch(/reason: 'no-filter'/);
    });

    test('polls with cache:no-store, since the count endpoint is cacheable for 300s', () => {
        expect(sliceBlock('async function fetchFilterMatchCount(')).toMatch(/cache: 'no-store'/);
    });

    test('restricts the filter query to the touched observations', () => {
        const builder = sliceBlock('function buildPageFilterQuery(');
        expect(builder).toMatch(/params\.set\('id'/);
        expect(builder).toMatch(/params\.set\('per_page', '0'\)/);
    });

    test('drops pagination params so page 2 of a grid cannot skew the count', () => {
        expect(sharedApi).toMatch(/const PAGINATION_PARAMS = \[[^\]]*'page'[^\]]*'per_page'/);
    });

    test('affectedObservationIds collects successes across every action type', () => {
        const sb = loadModal();
        const ids = sb.affectedObservationIds({
            a: { success: [{ observationId: '1' }, { observationId: '2' }] },
            b: { success: [{ observationId: '2' }, { observationId: '3' }] },
            c: { success: [] },
        });
        expect(ids.sort()).toEqual(['1', '2', '3']);
    });
});
