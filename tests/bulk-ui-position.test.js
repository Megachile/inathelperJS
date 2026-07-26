const fs = require('fs');
const path = require('path');
const { describe, test, expect, beforeAll } = require('@jest/globals');

// Issue #61 (reported by @bradbarnd): the bulk UI wrapper was anchored to the
// corner *opposite* the main button cluster. With the default cluster position of
// bottom-right that put it at top-left, on top of the iNaturalist header logo —
// the main way off the identify page. There was no way to move it independently
// (Alt+N dragged both) and no way to hide it.
//
// Fix: the bulk UI gets its own corner, defaulting to bottom-left, moved by
// dragging its own grip and snapping to the nearest corner on release.
describe('Bulk UI independent positioning (#61)', () => {
    let contentJs;

    beforeAll(() => {
        contentJs = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf-8');
    });

    describe('dead duplicate removed', () => {
        // Two definitions of updateBulkButtonPosition existed; the earlier one
        // positioned #bulk-action-container, which is now a child of the wrapper
        // and needs no positioning. Same footgun as #41.
        test('updateBulkButtonPosition is defined exactly once', () => {
            const matches = contentJs.match(/function updateBulkButtonPosition\(/g);
            expect(matches).toHaveLength(1);
        });

        test('nothing positions #bulk-action-container directly any more', () => {
            expect(contentJs).not.toMatch(
                /bulkButtonContainer\.style\.(top|left|bottom|right)\s*=\s*'10px'/
            );
        });
    });

    describe('independent corner state', () => {
        test('bulkPosition is declared with a bottom-left default', () => {
            expect(contentJs).toMatch(/let bulkPosition = 'bottom-left'/);
        });

        const positioner = () => contentJs.slice(
            contentJs.indexOf('function updateBulkButtonPosition('),
            contentJs.indexOf('function nearestCorner(')
        );

        test('positions from bulkPosition, not buttonPosition', () => {
            expect(positioner()).toMatch(/switch \(bulkPosition\)/);
            expect(positioner()).not.toMatch(/switch \(buttonPosition\)/);
        });

        test('bottom-left is the fallback for unrecognised values', () => {
            expect(positioner()).toMatch(/case 'bottom-left':\s*\n\s*default:|default:\s*\n\s*bulkUiWrapper\.style\.bottom/);
        });

        // The regression that started this: bottom-right cluster -> top-left bulk UI.
        test('no branch places the wrapper at top-left based on the cluster', () => {
            const topLeftCase = positioner().slice(
                positioner().indexOf("case 'top-left':"),
                positioner().indexOf("case 'top-right':")
            );
            expect(topLeftCase).toMatch(/style\.top = '10px'/);
            expect(topLeftCase).toMatch(/style\.left = '10px'/);
        });
    });

    // Alt+N rotates both clusters together by one corner clockwise, preserving
    // whatever relative arrangement the user has dragged them into.
    describe('Alt+N rotates both clusters together', () => {
        const cycle = () => contentJs.slice(
            contentJs.indexOf('function cycleButtonPosition('),
            contentJs.indexOf("browserAPI.storage.local.get('bulkPosition'")
        );

        test('the positions array is in clockwise order', () => {
            const arr = contentJs.match(/const positions = \[([^\]]*)\]/);
            expect(arr).not.toBeNull();
            const order = arr[1].split(',').map(s => s.trim().replace(/'/g, ''));
            expect(order).toEqual(['top-left', 'top-right', 'bottom-right', 'bottom-left']);
        });

        test('advances the bulk UI by the same single step', () => {
            expect(cycle()).toMatch(/positions\.indexOf\(bulkPosition\)/);
            expect(cycle()).toMatch(/\+ 1\) % positions\.length/);
        });

        test('repositions the bulk UI', () => {
            expect(cycle()).toMatch(/updateBulkButtonPosition\(\)/);
        });

        test('persists both positions', () => {
            expect(cycle()).toMatch(/buttonPosition: buttonPosition/);
            expect(cycle()).toMatch(/bulkPosition: bulkPosition/);
        });

        test('an unrecognised stored bulk corner does not produce undefined', () => {
            expect(cycle()).toMatch(/bulkIndex === -1 \? 0 : bulkIndex/);
        });

        // Both advance by exactly one step, so the offset between them is invariant.
        test('the offset between the two clusters is preserved', () => {
            const step = (i) => (i + 1) % 4;
            for (let main = 0; main < 4; main++) {
                for (let bulk = 0; bulk < 4; bulk++) {
                    const before = (bulk - main + 4) % 4;
                    const after = (step(bulk) - step(main) + 4) % 4;
                    expect(after).toBe(before);
                }
            }
        });
    });

    describe('drag grip', () => {
        test('a grip element is created and wired to the wrapper', () => {
            expect(contentJs).toMatch(/bulk-drag-handle/);
            expect(contentJs).toMatch(/bulk-move-grip/);
            expect(contentJs).toMatch(/setupBulkDragHandle\(bulkUiWrapper, bulkMoveGrip\)/);
        });

        test('the grip is appended to the wrapper', () => {
            const creator = contentJs.slice(
                contentJs.indexOf('function createBulkActionButtons('),
                contentJs.indexOf('function createCSVLoaderUI(')
            );
            expect(creator).toMatch(/bulkUiWrapper\.appendChild\(bulkDragHandle\)/);
        });

        const drag = () => contentJs.slice(
            contentJs.indexOf('function setupBulkDragHandle('),
            contentJs.indexOf('function getObservationElements(')
        );

        test('drag starts only from the grip, not the whole wrapper', () => {
            expect(drag()).toMatch(/grip\.addEventListener\('mousedown'/);
        });

        test('mousedown stops propagation so it does not toggle selection', () => {
            expect(drag()).toMatch(/e\.stopPropagation\(\)/);
        });

        test('listeners are torn down on release', () => {
            expect(drag()).toMatch(/removeEventListener\('mousemove'/);
            expect(drag()).toMatch(/removeEventListener\('mouseup'/);
        });

        test('release snaps to the nearest corner and persists it', () => {
            expect(drag()).toMatch(/nearestCorner\(/);
            expect(drag()).toMatch(/storage\.local\.set\(\{ bulkPosition/);
            expect(drag()).toMatch(/updateBulkButtonPosition\(\)/);
        });

        // Matches the main cluster's clampButtonToViewport: you can't drag it off-screen.
        test('the drag is clamped to the viewport', () => {
            expect(drag()).toMatch(/function clampBulk\(/);
            expect(drag()).toMatch(/viewportW\(\)/);
            expect(drag()).toMatch(/viewportH\(\)/);
        });

        test('onMove routes through the clamp rather than using raw pointer coords', () => {
            const onMove = drag().slice(drag().indexOf('function onMove('), drag().indexOf('function onEnd('));
            expect(onMove).toMatch(/clampBulk\(/);
            expect(onMove).not.toMatch(/style\.left = \(e\.clientX/);
        });

        test('the clamp re-measures each move (panels can open mid-drag)', () => {
            const clamp = drag().slice(drag().indexOf('function clampBulk('), drag().indexOf('function onMove('));
            expect(clamp).toMatch(/getBoundingClientRect\(\)/);
        });
    });

    // The disable half of #61: bradbarnd asked to "move or disable".
    describe('hide toggle', () => {
        test('hides the whole wrapper, not just the enable button', () => {
            const apply = contentJs.slice(
                contentJs.indexOf('function applyBulkUiVisibility('),
                contentJs.indexOf('function setBulkUiHidden(')
            );
            expect(apply).toMatch(/getElementById\('bulk-ui-wrapper'\)/);
            expect(apply).toMatch(/display = bulkActionManuallyHidden \? 'none' : ''/);
        });

        test('the state persists across reloads', () => {
            expect(contentJs).toMatch(/storage\.local\.set\(\{ bulkUiHidden/);
            expect(contentJs).toMatch(/storage\.local\.get\('bulkUiHidden'/);
        });

        test('Shift+V still toggles it', () => {
            expect(contentJs).toMatch(/shortcutKey === 'v'[\s\S]{0,120}toggleBulkActionVisibility\(\)/);
        });

        test('a persisted preference is applied when the UI is built', () => {
            const creator = contentJs.slice(
                contentJs.indexOf('function createBulkActionButtons('),
                contentJs.indexOf('function createCSVLoaderUI(')
            );
            expect(creator).toMatch(/applyBulkUiVisibility\(\)/);
        });

        test('the storage.onChanged sync does not re-persist and loop', () => {
            const sync = contentJs.slice(
                contentJs.indexOf('if (changes.bulkUiHidden)'),
                contentJs.indexOf('if (changes.safeMode)')
            );
            expect(sync).toMatch(/setBulkUiHidden\(changes\.bulkUiHidden\.newValue, false\)/);
        });

        test('the options page exposes a checkbox bound to the same key', () => {
            const optionsHtml = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf-8');
            const optionsJs = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf-8');
            expect(optionsHtml).toMatch(/id="hideBulkUi"/);
            expect(optionsJs).toMatch(/bulkUiHidden: document\.getElementById\('hideBulkUi'\)\.checked/);
            expect(optionsJs).toMatch(/getElementById\('hideBulkUi'\)\.checked = !!data\.bulkUiHidden/);
        });

        test('the checkbox follows a Shift+V toggle made while options is open', () => {
            const optionsJs = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf-8');
            expect(optionsJs).toMatch(/changes\.bulkUiHidden[\s\S]{0,200}box\.checked/);
        });
    });

    describe('nearestCorner', () => {
        let nearestCorner;

        beforeAll(() => {
            const src = contentJs.slice(
                contentJs.indexOf('function nearestCorner('),
                contentJs.indexOf('// Drag the bulk UI by its grip')
            );
            // eslint-disable-next-line no-new-func
            nearestCorner = new Function(
                'document', 'window',
                `${src}; return nearestCorner;`
            )(
                { documentElement: { clientWidth: 1000, clientHeight: 800 } },
                { innerWidth: 1000, innerHeight: 800 }
            );
        });

        const rect = (left, top) => ({ left, top, width: 100, height: 50 });

        test('resolves each quadrant', () => {
            expect(nearestCorner(rect(10, 10))).toBe('top-left');
            expect(nearestCorner(rect(880, 10))).toBe('top-right');
            expect(nearestCorner(rect(10, 730))).toBe('bottom-left');
            expect(nearestCorner(rect(880, 730))).toBe('bottom-right');
        });

        test('uses the element centre, not its origin', () => {
            // origin left of centre, but the box straddles it and centres right
            expect(nearestCorner({ left: 460, top: 10, width: 200, height: 50 }))
                .toBe('top-right');
        });

        test('always returns one of the four known corners', () => {
            const valid = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
            expect(valid).toContain(nearestCorner(rect(500, 400)));
        });
    });

    describe('persistence', () => {
        test('the saved corner is restored on load', () => {
            expect(contentJs).toMatch(/storage\.local\.get\('bulkPosition'/);
        });

        test('a corrupt stored value is rejected', () => {
            const restore = contentJs.slice(
                contentJs.indexOf("browserAPI.storage.local.get('bulkPosition'"),
                contentJs.indexOf("browserAPI.storage.local.get('bulkPosition'") + 350
            );
            expect(restore).toMatch(/positions\.includes\(data\.bulkPosition\)/);
        });

        test('changes sync across tabs', () => {
            const onChanged = contentJs.slice(
                contentJs.indexOf('if (changes.bulkPosition)'),
                contentJs.indexOf('if (changes.safeMode)')
            );
            expect(onChanged).toMatch(/bulkPosition = changes\.bulkPosition\.newValue/);
            expect(onChanged).toMatch(/updateBulkButtonPosition\(\)/);
        });
    });
});
