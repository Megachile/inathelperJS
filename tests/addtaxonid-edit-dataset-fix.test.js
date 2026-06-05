const fs = require('fs');
const path = require('path');

const optionsSource = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8');

// Issue #52: editing a button with an "Add Taxon ID" action and hitting Update
// immediately failed validation ("Please select a valid taxon...") until the
// taxon was re-picked. Cause: extractFormData reads the id from
// taxonNameInput.dataset.taxonId (set only by the autocomplete selection), but
// populateActionInputs restored .value and the hidden .taxonId input WITHOUT
// restoring dataset.taxonId on the name input. Unlike the observationField taxon
// case, the addTaxonId extraction has no .value fallback, so the id was lost.
describe('Add Taxon ID edit restores dataset.taxonId (issue #52)', () => {
    test('extraction still reads the id from the name input dataset', () => {
        // guards the assumption the fix depends on
        expect(optionsSource).toMatch(/action\.taxonId = taxonNameInput\.dataset\.taxonId;/);
    });

    test('populateActionInputs restores dataset.taxonId on the name input', () => {
        expect(optionsSource).toMatch(/taxonNameEl\.dataset\.taxonId = action\.taxonId \|\| '';/);
    });

    test('the populate (edit-load) case sets value, dataset id, and hidden id', () => {
        // the populate block is the one that references taxonNameEl
        const block = optionsSource
            .split('break;')
            .find(b => b.includes("case 'addTaxonId':") && b.includes('taxonNameEl'));
        expect(block).toBeDefined();
        expect(block).toMatch(/taxonNameEl\.value = action\.taxonName \|\| '';/);
        expect(block).toMatch(/taxonNameEl\.dataset\.taxonId = action\.taxonId \|\| '';/);
        expect(block).toMatch(/\.taxonId'\)\.value = action\.taxonId \|\| '';/);
    });
});
