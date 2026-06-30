const fs = require('fs');
const path = require('path');

const sharedSource = fs.readFileSync(path.join(__dirname, '..', 'shared_api.js'), 'utf8');

// Taxon autocomplete reliability: setupTaxonAutocomplete hides the suggestion
// list ~200 ms after the input blurs. Selecting a suggestion used to run on
// `click`, which fires AFTER blur, so the list could be torn down before the
// click landed and the pick was lost. Selection now runs on `mousedown` with
// preventDefault, which fires BEFORE blur and keeps the input focused.
describe('Taxon autocomplete selection fires on mousedown (pre-blur)', () => {
    // isolate the body of setupTaxonAutocomplete
    const fnStart = sharedSource.indexOf('function setupTaxonAutocomplete');
    const fnBody = sharedSource.slice(fnStart, sharedSource.indexOf('\nfunction ', fnStart + 1));

    test('setupTaxonAutocomplete exists', () => {
        expect(fnStart).toBeGreaterThan(-1);
    });

    test('a suggestion is selected on mousedown, not click', () => {
        expect(fnBody).toMatch(/suggestion\.addEventListener\(\s*['"]mousedown['"]/);
        expect(fnBody).not.toMatch(/suggestion\.addEventListener\(\s*['"]click['"]/);
    });

    test('the handler calls preventDefault so the input does not blur first', () => {
        expect(fnBody).toMatch(/event\.preventDefault\(\)/);
    });

    test('clicks on the taxon-page link (A tag) are still passed through', () => {
        expect(fnBody).toMatch(/event\.target\.tagName\s*!==\s*['"]A['"]/);
    });

    test('selection still records the taxon id on the input dataset', () => {
        expect(fnBody).toMatch(/inputElement\.dataset\.taxonId\s*=\s*taxon\.id/);
    });

    test('the blur handler that hides suggestions is still present', () => {
        expect(fnBody).toMatch(/addEventListener\(\s*['"]blur['"]/);
    });
});
