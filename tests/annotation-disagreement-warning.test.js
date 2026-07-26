const fs = require('fs');
const path = require('path');
const { describe, test, expect, beforeAll } = require('@jest/globals');

// Issue #59 (reported by @rcavasin): when a button's annotation action can't be
// applied because a conflicting annotation already exists and isn't the user's to
// replace, voteOnExistingAnnotation falls back to casting a *downvote* and returns
// success. The button flashed green, so users adding annotations by keyboard
// shortcut (while looking at the Info tab, not the Annotations tab) had no way to
// know their configured annotation was never added.
//
// Fix: a third "warning" outcome flashes the button amber and surfaces a warning
// naming the annotation that was downvoted. The deliberate downvote option from
// #43 must NOT trigger it — that path is the user asking for a downvote.
describe('Annotation disagreement warning (#59)', () => {
    let contentJs;

    beforeAll(() => {
        contentJs = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf-8');
    });

    describe('voteOnExistingAnnotation result shape', () => {
        // Slice the whole function rather than anchoring on "action: 'disagreed'" —
        // that string also appears in the comments here.
        const disagreedReturn = () => contentJs.slice(
            contentJs.indexOf('async function voteOnExistingAnnotation('),
            contentJs.indexOf('async function disagreeWithAnnotation(')
        );

        test("still reports action: 'disagreed'", () => {
            expect(contentJs).toMatch(/action: 'disagreed'/);
        });

        // The bulk summary rebuilds results as `{ ...actionResult, action: action.type }`,
        // which clobbers `action`. A separate key is what actually survives to the modal.
        test('sets a downvotedOnly flag that survives the bulk result respread', () => {
            expect(disagreedReturn()).toMatch(/downvotedOnly: true/);
        });

        test('carries the attribute id back for naming', () => {
            expect(disagreedReturn()).toMatch(/disagreedAttributeId/);
        });

        test('carries the existing (downvoted) value id back', () => {
            expect(disagreedReturn()).toMatch(/disagreedValueId/);
        });

        test('carries the value the user actually wanted to add', () => {
            expect(disagreedReturn()).toMatch(/intendedValueId/);
        });
    });

    describe('animateButtonResult three-state outcome', () => {
        const body = () => contentJs.slice(
            contentJs.indexOf('function animateButtonResult('),
            contentJs.indexOf('const style = document.createElement')
        );

        test('maps a warning outcome to button-warning', () => {
            expect(body()).toMatch(/'warning'.*button-warning|button-warning/s);
        });

        test('still accepts a legacy boolean true as success', () => {
            expect(body()).toMatch(/outcome === true/);
        });

        test('clears all three classes on teardown', () => {
            const teardown = body().match(/classList\.remove\(([^)]*)\)/);
            expect(teardown).not.toBeNull();
            expect(teardown[1]).toMatch(/button-success/);
            expect(teardown[1]).toMatch(/button-warning/);
            expect(teardown[1]).toMatch(/button-failure/);
        });
    });

    describe('amber flash styling', () => {
        test('defines a pulseYellow keyframe animation', () => {
            expect(contentJs).toMatch(/@keyframes pulseYellow/);
        });

        test('.button-warning uses it', () => {
            const rule = contentJs.slice(
                contentJs.indexOf('.button-warning {'),
                contentJs.indexOf('.button-warning {') + 200
            );
            expect(rule).toMatch(/animation: pulseYellow/);
            expect(rule).toMatch(/background-color/);
        });
    });

    describe('click handler wiring', () => {
        const handler = () => contentJs.slice(
            contentJs.indexOf('let allSuccessfulInBatch = true;'),
            contentJs.indexOf('if (allSuccessfulInBatch && refreshEnabled)')
        );

        test('tracks disagreements separately from failures', () => {
            expect(handler()).toMatch(/sawDisagreement/);
        });

        test('only treats a downvote-only result as a warning', () => {
            expect(handler()).toMatch(/result\.success && result\.downvotedOnly/);
        });

        test('does not key off the deliberate-downvote flag from #43', () => {
            // `disagree: true` is the user-configured downvote and must stay green.
            const guard = handler().match(/if \(result\.success && ([^)]*)\)/);
            expect(guard).not.toBeNull();
            expect(guard[1]).not.toMatch(/result\.disagree\b/);
        });

        test('failure still outranks warning', () => {
            expect(handler()).toMatch(/!allSuccessfulInBatch \? 'failure'/);
        });

        test('names the annotation in the warning text', () => {
            expect(handler()).toMatch(/getAnnotationFieldName/);
            expect(handler()).toMatch(/getAnnotationValueName/);
        });
    });

    // The single-button path flashes amber; the bulk path has no button to flash, so
    // the results modal carries the same information.
    //
    // The live bulk summary is summarizeBulkActionOutcomes /
    // createDetailedActionResultsModal in shared_api.js. content.js used to also carry
    // a superseded twin (createActionResultsModal + handleActionResult(s)) that nothing
    // called; a fix added there rendered nowhere. That twin has since been deleted.
    describe('bulk summary (live path)', () => {
        let sharedApiJs;

        beforeAll(() => {
            sharedApiJs = fs.readFileSync(path.join(__dirname, '..', 'shared_api.js'), 'utf-8');
        });

        const summarize = () => sharedApiJs.slice(
            sharedApiJs.indexOf('function summarizeBulkActionOutcomes('),
            sharedApiJs.indexOf('function createDetailedActionResultsModal(')
        );

        test('the functions we extend are the ones actually called', () => {
            expect(contentJs).toMatch(/summarizeBulkActionOutcomes\(allActionResults/);
            expect(contentJs).toMatch(/createDetailedActionResultsModal\(/);
        });

        // The superseded twin is gone; guard against it being reintroduced, since a fix
        // landing there would silently render nowhere.
        test('the superseded results-reporting twin stays deleted', () => {
            const code = contentJs.replace(/\/\/[^\n]*/g, ''); // strip line comments
            expect(code).not.toMatch(/function handleActionResults?\s*\(/);
            expect(code).not.toMatch(/function createActionResultsModal\s*\(/);
        });

        test('a downvoted bucket is initialised for every action', () => {
            expect(summarize()).toMatch(/downvoted: \[\]/);
        });

        test('the fallback bucket for unmapped results has one too', () => {
            const fallback = summarize().slice(summarize().indexOf('actionKey = result.action + "-unknown"'));
            expect(fallback).toMatch(/downvoted: \[\]/);
        });

        test('downvote-only results are routed there, not into success', () => {
            expect(summarize()).toMatch(/else if \(result\.downvotedOnly\)/);
            const branch = summarize().slice(summarize().indexOf('else if (result.downvotedOnly)'));
            expect(branch).toMatch(/\.downvoted\.push/);
        });

        test('it carries the ids needed to name the annotation', () => {
            const branch = summarize().slice(summarize().indexOf('else if (result.downvotedOnly)'));
            expect(branch).toMatch(/attributeId: result\.disagreedAttributeId/);
            expect(branch).toMatch(/existingValueId: result\.disagreedValueId/);
            expect(branch).toMatch(/intendedValueId: result\.intendedValueId/);
        });

        describe('rendering', () => {
            // generateObservationURL is defined far earlier in the file, so the end
            // boundary has to be searched forward from the function's own offset.
            const modal = () => {
                const start = sharedApiJs.indexOf('function createDetailedActionResultsModal(');
                expect(start).toBeGreaterThan(-1);
                return sharedApiJs.slice(start, sharedApiJs.indexOf('\nfunction ', start + 10));
            };

            test('the bucket is destructured defensively for older records', () => {
                expect(modal()).toMatch(/actionSummary\.downvoted \|\| \[\]/);
            });

            test('renders a downvote-only section', () => {
                expect(modal()).toMatch(/Recorded as a downvote only/);
            });

            test('links each affected observation', () => {
                const section = modal().slice(modal().indexOf('Recorded as a downvote only'));
                expect(section).toMatch(/getINatSiteBase\(\)/);
                expect(section).toMatch(/encodeURIComponent\(d\.observationId\)/);
            });

            test('names both the wanted and the downvoted value', () => {
                const section = modal().slice(modal().indexOf('Recorded as a downvote only'));
                expect(section).toMatch(/d\.intendedValueId/);
                expect(section).toMatch(/d\.existingValueId/);
                expect(section).toMatch(/getAnnotationFieldName\(d\.attributeId\)/);
            });

            test('escapes interpolated values', () => {
                const section = modal().slice(modal().indexOf('Recorded as a downvote only'));
                expect(section).toMatch(/escapeHtml\(/);
            });

            // Otherwise a disagreement-only action reads "nothing was processed".
            test('a downvote-only action is not reported as unprocessed', () => {
                const guard = modal().match(/if \(success\.length === 0 &&[^)]*\)[^)]*\)\s*\{/);
                expect(guard).not.toBeNull();
                expect(guard[0]).toMatch(/downvoted\.length === 0/);
            });
        });
    });

    // Pre-existing bug surfaced while testing this: annotation undo records were only
    // populated inside the dead handleActionResult(), so every bulk annotation undo
    // failed with "Annotation UUID not found".
    describe('bulk annotation undo records', () => {
        const block = () => contentJs.slice(
            contentJs.indexOf("if (action.type === 'annotation' && actionResult.success &&"),
            contentJs.indexOf('let resultForSummary =')
        );

        test('the undo record is populated on the live bulk path', () => {
            expect(block()).toMatch(/undoAction\.uuid = uuid/);
        });

        test('a created annotation is undone by deleting it', () => {
            expect(block()).toMatch(/'removeAnnotation'/);
        });

        test('a vote-only outcome is undone by withdrawing the vote', () => {
            expect(block()).toMatch(/voteOnly \? 'removeAnnotationVote' : 'removeAnnotation'/);
        });

        test('all three vote-only cases are recognised', () => {
            expect(block()).toMatch(/actionResult\.downvotedOnly/);      // couldn't replace
            expect(block()).toMatch(/actionResult\.action === 'voted'/); // agreed with existing
            expect(block()).toMatch(/action\.disagree/);                 // deliberate downvote (#43)
        });

        test('an un-undoable delete is dropped rather than left to fail', () => {
            expect(block()).toMatch(/if \(!uuid && !voteOnly\)/);
            expect(block()).toMatch(/undoActions\.splice/);
        });

        test('only unfilled entries are matched, so repeats do not collide', () => {
            expect(block()).toMatch(/!ua\.uuid/);
        });

        // Reported case: 3 observations annotated Alive, bulk-set to Dead, then undone —
        // undo deleted the Dead annotation but left them bare instead of restoring Alive.
        // The action replaces (delete + re-add), so undo has to reinstate the old value.
        describe('restores a replaced annotation', () => {
            let sharedApiJs;
            beforeAll(() => {
                sharedApiJs = fs.readFileSync(path.join(__dirname, '..', 'shared_api.js'), 'utf-8');
            });

            test('pre-action state fetches annotations at all', () => {
                const fields = contentJs.match(/const fieldsParam = '([^']*)'/);
                expect(fields).not.toBeNull();
                expect(fields[1]).toMatch(/annotations:\(/);
                expect(fields[1]).toMatch(/controlled_attribute_id:!t/);
                expect(fields[1]).toMatch(/controlled_value_id:!t/);
            });

            test('the undo record captures the value being replaced', () => {
                const fnStart = contentJs.indexOf('async function generatePreliminaryUndoRecord(');
                expect(fnStart).toBeGreaterThan(-1);
                const caseStart = contentJs.indexOf("case 'annotation':", fnStart);
                const builder = contentJs.slice(caseStart, contentJs.indexOf("case 'addToProject':", caseStart));
                expect(builder).toMatch(/originalValueId/);
                expect(builder).toMatch(/controlled_attribute_id === attrId/);
                expect(builder).toMatch(/preActionStates\[observationId\]\.annotations/);
            });

            test('nothing is recorded when the value already matched', () => {
                expect(contentJs).toMatch(/priorValueId !== parseInt\(actionItem\.annotationValue\)/);
            });

            test('undo re-adds the original value after deleting ours', () => {
                const handler = sharedApiJs.slice(
                    sharedApiJs.indexOf("case 'removeAnnotation':"),
                    sharedApiJs.indexOf("case 'removeAnnotationVote':")
                );
                expect(handler).toMatch(/undoAction\.originalValueId/);
                expect(handler).toMatch(/method: 'POST'/);
                expect(handler).toMatch(/controlled_value_id: undoAction\.originalValueId/);
            });

            test('the restore POST declares its content type', () => {
                const handler = sharedApiJs.slice(
                    sharedApiJs.indexOf("case 'removeAnnotation':"),
                    sharedApiJs.indexOf("case 'removeAnnotationVote':")
                );
                expect(handler).toMatch(/'Content-Type': 'application\/json'/);
            });

            test('restore only runs if the delete actually happened', () => {
                const handler = sharedApiJs.slice(
                    sharedApiJs.indexOf("case 'removeAnnotation':"),
                    sharedApiJs.indexOf("case 'removeAnnotationVote':")
                );
                expect(handler).toMatch(/if \(deleted && undoAction\.originalValueId\)/);
            });

            // A 404 on delete means it's already gone — still restore.
            test('an already-deleted annotation still triggers the restore', () => {
                const handler = sharedApiJs.slice(
                    sharedApiJs.indexOf("case 'removeAnnotation':"),
                    sharedApiJs.indexOf("case 'removeAnnotationVote':")
                );
                expect(handler).toMatch(/404[\s\S]{0,140}deleted = true/);
            });

            // Our annotation is gone either way; a failed restore must not read as
            // "undo failed" or the record would look re-runnable.
            test('a failed restore reports partial success, not failure', () => {
                const handler = sharedApiJs.slice(
                    sharedApiJs.indexOf("case 'removeAnnotation':"),
                    sharedApiJs.indexOf("case 'removeAnnotationVote':")
                );
                const restoreCatch = handler.slice(handler.indexOf('Error restoring original annotation'));
                expect(restoreCatch).toMatch(/success: true/);
                expect(restoreCatch).toMatch(/could not be restored/);
            });
        });

        // Found by an external review pass: vote-only outcomes are undone by withdrawing
        // the vote, but if the user had ALREADY voted on that annotation before the bulk
        // action ran, withdrawing destroys state the action never created.
        describe('does not withdraw a vote that pre-dated the action', () => {
            let sharedApiJs;
            beforeAll(() => {
                sharedApiJs = fs.readFileSync(path.join(__dirname, '..', 'shared_api.js'), 'utf-8');
            });

            test('pre-action state fetches existing votes', () => {
                const fields = contentJs.match(/const fieldsParam = '([^']*)'/);
                expect(fields[1]).toMatch(/votes:\(user_id:!t,vote_flag:!t\)/);
            });

            const builder = () => {
                const fnStart = contentJs.indexOf('async function generatePreliminaryUndoRecord(');
                const caseStart = contentJs.indexOf("case 'annotation':", fnStart);
                return contentJs.slice(caseStart, contentJs.indexOf("case 'addToProject':", caseStart));
            };
            const voteHandler = () => sharedApiJs.slice(
                sharedApiJs.indexOf("case 'removeAnnotationVote':"),
                sharedApiJs.indexOf("case 'updateObservationField':")
            );

            test('prior-vote ownership is matched against the current user', () => {
                expect(builder()).toMatch(/await getCurrentUserId\(\)/);
                expect(builder()).toMatch(/v\.user_id === myUserId/);
            });

            // A bare boolean was not enough: it left a *flipped* vote in place (prior
            // downvote + agree action, or prior agree + downvote action). The direction is
            // recorded per annotation uuid, because which annotation gets voted on is not
            // knowable in advance and multivalued attributes carry several.
            test('the vote DIRECTION is recorded, not just its existence', () => {
                expect(builder()).toMatch(/priorVotes\[a\.uuid\] = mine\.vote_flag/);
                expect(builder()).not.toMatch(/hadPriorVote/);
            });

            test('both annotation undo shapes carry the map and the known-flag', () => {
                expect((builder().match(/priorVotes,/g) || []).length).toBe(2);
                expect((builder().match(/priorVotesKnown/g) || []).length).toBe(3); // decl + 2 shapes
            });

            test('undo restores the original direction rather than skipping', () => {
                expect(voteHandler()).toMatch(/hasOwnProperty\.call\(priorVotes, undoAction\.uuid\)/);
                expect(voteHandler()).toMatch(/vote: priorFlag/);
                // The restore POST must come before the unvote fallback.
                expect(voteHandler().indexOf('vote: priorFlag'))
                    .toBeLessThan(voteHandler().indexOf('/votes/unvote/'));
            });

            test('the restore POST declares its content type', () => {
                const restore = voteHandler().slice(voteHandler().indexOf('if (hadPrior)'));
                expect(restore).toMatch(/'Content-Type': 'application\/json'/);
            });

            // Losing a real vote is worse than an incomplete undo, so an unknown user id
            // must leave votes alone rather than withdraw them.
            test('an unknown user id degrades to leaving the vote in place', () => {
                expect(voteHandler()).toMatch(/undoAction\.priorVotesKnown === false/);
                const guardAt = voteHandler().indexOf('priorVotesKnown === false');
                expect(guardAt).toBeLessThan(voteHandler().indexOf('/votes/unvote/'));
                expect(guardAt).toBeLessThan(voteHandler().indexOf('vote: priorFlag'));
            });
        });

        // The undo record's type is what performSingleUndoAction switches on, so these
        // are the only two values the annotation path may produce.
        test('only undo types that performSingleUndoAction handles are emitted', () => {
            const emitted = [...block().matchAll(/'(remove[A-Za-z]+)'/g)].map(m => m[1]);
            const sharedApiJs = fs.readFileSync(path.join(__dirname, '..', 'shared_api.js'), 'utf-8');
            for (const type of new Set(emitted)) {
                expect(sharedApiJs).toMatch(new RegExp(`case '${type}':`));
            }
        });
    });

    describe('naming helpers are available to content.js', () => {
        test('both are defined in shared_api.js, which loads first', () => {
            const sharedApiJs = fs.readFileSync(
                path.join(__dirname, '..', 'shared_api.js'), 'utf-8'
            );
            expect(sharedApiJs).toMatch(/function getAnnotationFieldName\(/);
            expect(sharedApiJs).toMatch(/function getAnnotationValueName\(/);

            const manifest = JSON.parse(
                fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf-8')
            );
            const js = manifest.content_scripts[0].js;
            expect(js.indexOf('shared_api.js')).toBeLessThan(js.indexOf('content.js'));
        });
    });
});
