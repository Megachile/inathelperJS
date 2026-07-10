const fs = require('fs');
const path = require('path');

const contentSource = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const sharedApiSource = fs.readFileSync(path.join(__dirname, '..', 'shared_api.js'), 'utf8');
const optionsSource = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8');

// Feature (#58, requested by @rcavasin): an "Agree" bulk action that posts an
// identification of each observation's current community/leading taxon. iNat has
// no dedicated agree endpoint — agreeing is just POSTing an identification of the
// community taxon — so this reuses addTaxonId, but resolves the target taxon
// per-observation at run time (a selection can span many community taxa).
describe('Agree with Community ID bulk action (#58)', () => {
    describe('content.js — core behavior', () => {
        const fn = contentSource.match(/async function agreeWithObservation\(observationId\)\s*\{([\s\S]*?)\n\}/);

        test('agreeWithObservation is defined', () => {
            expect(fn).not.toBeNull();
        });

        test('resolves the community taxon, falling back to the leading taxon', () => {
            expect(fn[1]).toMatch(/community_taxon_id\s*\|\|\s*observation\.taxon\?\.id/);
        });

        test('skips (noActionNeeded) when there is no taxon to agree with', () => {
            expect(fn[1]).toMatch(/if \(!targetTaxonId\)/);
            expect(fn[1]).toMatch(/noActionNeeded:\s*true/);
        });

        test('skips when the user already has a current ID at the target taxon', () => {
            expect(fn[1]).toMatch(/alreadyAgreeing/);
            expect(fn[1]).toMatch(/id\.current\s*&&\s*id\.taxon\?\.id === targetTaxonId/);
        });

        test('agrees by posting an identification and never a disagreement', () => {
            expect(fn[1]).toMatch(/addTaxonId\(observationId, targetTaxonId, '', false\)/);
        });

        test('performSingleAction dispatches the agreeId action type', () => {
            expect(contentSource).toMatch(/case 'agreeId':\s*\n\s*return agreeWithObservation\(observationId\)/);
        });

        test('auto-follow/review prevention treats agreeId as a taxon action', () => {
            expect(contentSource).toMatch(/action\.type === 'addTaxonId' \|\| action\.type === 'agreeId'/);
        });
    });

    describe('content.js — undo support', () => {
        test('the undo pre-pass builds a removeIdentification record marked source: agree', () => {
            expect(contentSource).toMatch(/case 'agreeId':[\s\S]*?type: 'removeIdentification',\s*\n\s*source: 'agree'/);
        });

        test('the pre-pass captures the prior current ID for restore on undo', () => {
            // The agree undo record stores previousIdentificationUUID so undo can restore
            // the identification that adding a new one auto-withdrew.
            expect(contentSource).toMatch(/source: 'agree',[\s\S]*?previousIdentificationUUID: currentIdentification \? currentIdentification\.uuid : null/);
        });

        test('the live bulk loop wires the posted identification UUID into the undo record', () => {
            // Covers both addTaxonId and agreeId; agree is matched by its source marker.
            expect(contentSource).toMatch(/action\.type === 'addTaxonId' \|\| action\.type === 'agreeId'/);
            expect(contentSource).toMatch(/undoAction\.identificationUUID = actionResult\.identificationUUID/);
            expect(contentSource).toMatch(/ua\.source === 'agree' : ua\.taxonId === action\.taxonId/);
        });

        test('a no-op agree drops its phantom undo entry instead of leaving a null UUID', () => {
            expect(contentSource).toMatch(/undoActions\.splice\(undoActions\.indexOf\(undoAction\), 1\)/);
        });
    });

    describe('shared_api.js — results modal', () => {
        test('the results modal has a label for agreeId', () => {
            expect(sharedApiSource).toMatch(/actionConfig\.type === 'agreeId'/);
            expect(sharedApiSource).toMatch(/Agree with Community ID/);
        });
    });

    describe('options.js — configuration UI', () => {
        test('the action-type dropdown offers Agree with Community ID', () => {
            expect(optionsSource).toMatch(/<option value="agreeId">Agree with Community ID<\/option>/);
        });

        test('extract, validate, and populate all handle agreeId as a no-input action', () => {
            // three distinct `case 'agreeId':` sites (extractActionsFromForm,
            // validateCommonConfiguration, populateActionInputs)
            const cases = optionsSource.match(/case 'agreeId':/g) || [];
            expect(cases.length).toBeGreaterThanOrEqual(3);
        });

        test('the config summary describes the agree action', () => {
            expect(optionsSource).toMatch(/Agree with the community ID/);
        });
    });
});
