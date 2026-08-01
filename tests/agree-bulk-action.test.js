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
        const fn = contentSource.match(/async function agreeWithObservation\(observationId, agreeTarget = 'community'\)\s*\{([\s\S]*?)\n\}/);

        test('agreeWithObservation is defined', () => {
            expect(fn).not.toBeNull();
        });

        // #67: the target is configurable — 'community' (the default) or 'displayed' — because
        // the two routinely differ on Needs ID observations, and agreeing with the coarser one
        // by accident is silent and tedious to undo.
        test('resolves the configured taxon, falling back to the other one', () => {
            expect(fn[1]).toMatch(/const communityTaxonId = observation\.community_taxon_id/);
            expect(fn[1]).toMatch(/const displayedTaxonId = observation\.taxon\?\.id/);
            expect(fn[1]).toMatch(/agreeTarget === 'displayed'/);
            expect(fn[1]).toMatch(/\(displayedTaxonId \|\| communityTaxonId\)/);
            expect(fn[1]).toMatch(/\(communityTaxonId \|\| displayedTaxonId\)/);
        });

        test('defaults to the community taxon so pre-#67 configs behave unchanged', () => {
            expect(contentSource).toMatch(/agreeWithObservation\(observationId, agreeTarget = 'community'\)/);
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

        test('performSingleAction dispatches the agreeId action type with its target', () => {
            expect(contentSource).toMatch(/case 'agreeId':\s*\n\s*return agreeWithObservation\(observationId, action\.agreeTarget\)/);
        });

        test('both confirmation summaries name the chosen target', () => {
            const summaries = contentSource.match(
                /Agree with the \$\{action\.agreeTarget === 'displayed' \? 'displayed' : 'community'\} ID/g
            ) || [];
            expect(summaries.length).toBe(2);
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
        test('the results modal labels agreeId by its target', () => {
            expect(sharedApiSource).toMatch(/actionConfig\.type === 'agreeId'/);
            expect(sharedApiSource).toMatch(/actionConfig\.agreeTarget === 'displayed'/);
            expect(sharedApiSource).toMatch(/Agree with Displayed ID/);
            expect(sharedApiSource).toMatch(/Agree with Community ID/);
        });
    });

    describe('options.js — configuration UI', () => {
        test('the action-type dropdown offers the agree action', () => {
            expect(optionsSource).toMatch(/<option value="agreeId">Agree with ID<\/option>/);
        });

        test('extract, validate, and populate all handle agreeId', () => {
            // three distinct `case 'agreeId':` sites (extractActionsFromForm,
            // validateCommonConfiguration, populateActionInputs)
            const cases = optionsSource.match(/case 'agreeId':/g) || [];
            expect(cases.length).toBeGreaterThanOrEqual(3);
        });

        test('the config summary names the target', () => {
            expect(optionsSource).toMatch(/Agree with the displayed ID/);
            expect(optionsSource).toMatch(/Agree with the community ID/);
        });

        // #67 — the target picker and the explanation that goes with it
        test('the target radio group exists and shows only for agreeId', () => {
            expect(optionsSource).toMatch(/name="agreeTarget-\$\{uid\}" value="community" checked/);
            expect(optionsSource).toMatch(/name="agreeTarget-\$\{uid\}" value="displayed"/);
            expect(optionsSource).toMatch(
                /agreeOptions\.style\.display = actionType\.value === 'agreeId' \? 'block' : 'none'/
            );
        });

        test('the options page explains how the two targets differ', () => {
            const helpBlock = optionsSource.match(/<div class="agree-options"[\s\S]*?<div class="ofInputs">/);
            expect(helpBlock).not.toBeNull();
            expect(helpBlock[0]).toMatch(/Needs ID/);
            expect(helpBlock[0]).toMatch(/consensus taxon/);
            expect(helpBlock[0]).toMatch(/thumbnail/);
        });

        test('legacy actions without a target fall back to community', () => {
            expect(optionsSource).toMatch(/input\[name\^="agreeTarget"\]:checked'\)\?\.value \|\| 'community'/);
            expect(optionsSource).toMatch(/const agreeTarget = action\.agreeTarget \|\| 'community'/);
        });

        test('the target is validated on save', () => {
            expect(optionsSource).toMatch(/\['community', 'displayed'\]\.includes\(action\.agreeTarget\)/);
        });
    });
});
