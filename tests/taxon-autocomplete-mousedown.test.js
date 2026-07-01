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

    // The taxon-page link used to be an <a> that activated on click. Because
    // click fires after blur, the 200 ms blur teardown could remove the link
    // before its click landed (reported by bazwal, Firefox/Linux v3.3.5). The
    // link is now a <span class="taxon-link"> opened programmatically inside the
    // mousedown handler, which fires before blur.
    test('the taxon-page link is a span, not an anchor', () => {
        expect(fnBody).toMatch(/<span class="taxon-link"/);
        expect(fnBody).not.toMatch(/<a [^>]*class="taxon-link"/);
    });

    test('clicking the taxon-link opens the taxon page programmatically', () => {
        expect(fnBody).toMatch(/event\.target\.classList\.contains\(\s*['"]taxon-link['"]\s*\)/);
        expect(fnBody).toMatch(/window\.open\(\s*taxonUrl/);
    });

    test('selection still records the taxon id on the input dataset', () => {
        expect(fnBody).toMatch(/inputElement\.dataset\.taxonId\s*=\s*taxon\.id/);
    });

    test('the blur handler that hides suggestions is still present', () => {
        expect(fnBody).toMatch(/addEventListener\(\s*['"]blur['"]/);
    });

    // Taxa with no default_photo previously fell back to a bundled
    // 'placeholder.jpg' that does not exist, rendering a broken-image icon.
    // No-photo taxa (and images that fail to load) now show a gray placeholder
    // rectangle sized to match the thumbnail, so text alignment stays
    // consistent (reported by Adam).
    describe('no-photo taxa show a placeholder, not a broken image', () => {
        test('the nonexistent placeholder.jpg fallback is gone', () => {
            expect(fnBody).not.toMatch(/placeholder\.jpg/);
        });

        test('a real photo is used when a URL exists', () => {
            expect(fnBody).toMatch(/if\s*\(\s*safeTaxonPhoto\s*\)/);
        });

        test('no-photo taxa append a placeholder rectangle', () => {
            expect(fnBody).toMatch(/else\s*\{\s*suggestion\.appendChild\(\s*createTaxonThumbPlaceholder\(\)\s*\)/);
        });

        test('a failed image load is replaced by the placeholder', () => {
            expect(fnBody).toMatch(/img\.onerror\s*=.*createTaxonThumbPlaceholder\(\)/);
        });

        test('the placeholder is sized to match the 40x40 thumbnail', () => {
            expect(sharedSource).toMatch(/function createTaxonThumbPlaceholder/);
            const phStart = sharedSource.indexOf('function createTaxonThumbPlaceholder');
            const phBody = sharedSource.slice(phStart, sharedSource.indexOf('\nfunction ', phStart + 1));
            expect(phBody).toMatch(/width:40px/);
            expect(phBody).toMatch(/height:40px/);
        });
    });
});
