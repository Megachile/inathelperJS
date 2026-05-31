const fs = require('fs');
const path = require('path');

// Read the source file as text for pattern assertions (source-text-assertion style).
const optionsSource = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8');

// Regression test for GitHub issue #50:
// "Cannot read properties of null (reading 'value')" when editing an existing
// configuration and adding/editing an annotation action value, then clicking
// "Update Configuration".
//
// Root cause: two annotation code paths read `.value` (or assigned `.value`)
// directly off the result of `actionDiv.querySelector('.annotationField' /
// '.annotationValue')` without checking for null:
//   - the save/serialize path (case 'annotation' that builds the action object)
//   - populateActionInputs() (loads a saved config back into the editor)
// If the annotation sub-inputs aren't present/resolved for an action section,
// querySelector returns null and the bare `.value` access throws, aborting the
// save. The fix null-guards every one of these accesses.
describe('Annotation value null-guard (issue #50)', () => {
    test('save path: annotationField read is null-guarded (optional chaining, no bare .value)', () => {
        // Old crashing form must be gone.
        expect(optionsSource).not.toMatch(
            /action\.annotationField\s*=\s*actionDiv\.querySelector\('\.annotationField'\)\.value\s*;/
        );
        // New guarded form present.
        expect(optionsSource).toMatch(
            /action\.annotationField\s*=\s*actionDiv\.querySelector\('\.annotationField'\)\?\.value\s*\|\|\s*''\s*;/
        );
    });

    test('save path: annotationValue read is null-guarded (optional chaining, no bare .value)', () => {
        expect(optionsSource).not.toMatch(
            /action\.annotationValue\s*=\s*actionDiv\.querySelector\('\.annotationValue'\)\.value\s*;/
        );
        expect(optionsSource).toMatch(
            /action\.annotationValue\s*=\s*actionDiv\.querySelector\('\.annotationValue'\)\?\.value\s*\|\|\s*''\s*;/
        );
    });

    test('populate path: assigning .value is guarded behind null checks', () => {
        // The old unconditional assignment must be gone.
        expect(optionsSource).not.toMatch(
            /actionDiv\.querySelector\('\.annotationField'\)\.value\s*=\s*action\.annotationField/
        );
        // Guards present for both field and value before .value usage.
        expect(optionsSource).toMatch(/if\s*\(annotationField\)\s*annotationField\.value\s*=\s*action\.annotationField/);
        expect(optionsSource).toMatch(/if\s*\(annotationField\s*&&\s*annotationValue\)\s*\{/);
    });
});
