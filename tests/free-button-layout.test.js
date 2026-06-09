const fs = require('fs');
const path = require('path');

const contentSource = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

// Issue #54: forum user konrad_k asked for the button cluster to be "freely
// resizable and movable", beyond the four corner presets cycled with Alt+N.
// Implementation adds a drag handle (move anywhere) and a corner grip (resize),
// persists the chosen layout to storage.local, re-clamps to the viewport, and
// lets Alt+N reset back to a corner preset.
describe('Free button positioning & resizing (issue #54)', () => {
    test('a drag handle element is created and inserted before the container', () => {
        expect(contentSource).toMatch(/id = 'button-drag-handle'/);
        expect(contentSource).toMatch(/buttonDiv\.insertBefore\(dragHandle, buttonContainer\)/);
    });

    test('a custom resize grip is created (not CSS resize, to avoid clipping tooltips)', () => {
        expect(contentSource).toMatch(/id = 'button-resize-grip'/);
        expect(contentSource).toMatch(/buttonDiv\.appendChild\(resizeGrip\)/);
    });

    test('drag updates left/top and clears the corner anchors', () => {
        expect(contentSource).toMatch(/function onButtonDragMove/);
        expect(contentSource).toMatch(/buttonDiv\.style\.right = 'auto'/);
        expect(contentSource).toMatch(/buttonDiv\.style\.bottom = 'auto'/);
    });

    test('drag and resize persist their results to storage.local', () => {
        expect(contentSource).toMatch(/storage\.local\.set\(\{ buttonFreePosition: freeButtonPosition \}\)/);
        expect(contentSource).toMatch(/storage\.local\.set\(\{ buttonFreeSize: freeButtonSize \}\)/);
    });

    test('saved free layout is restored on load', () => {
        expect(contentSource).toMatch(/storage\.local\.get\(\['buttonFreePosition', 'buttonFreeSize'\]/);
        expect(contentSource).toMatch(/applyFreeButtonPosition\(\)/);
        expect(contentSource).toMatch(/applyFreeButtonSize\(\)/);
    });

    test('position is clamped into the viewport (on apply and on window resize)', () => {
        expect(contentSource).toMatch(/function clampButtonToViewport/);
        expect(contentSource).toMatch(/window\.innerWidth - width/);
        expect(contentSource).toMatch(/window\.addEventListener\('resize', function\(\) \{\s*if \(freeButtonPosition\) applyFreeButtonPosition\(\);/);
    });

    test('resize overrides the max-width cap so the cluster can grow', () => {
        expect(contentSource).toMatch(/buttonContainer\.style\.maxWidth = 'none'/);
    });

    test('Alt+N (cycleButtonPosition) resets the free layout as an escape hatch', () => {
        expect(contentSource).toMatch(/if \(typeof resetFreeButtonLayout === 'function'\) resetFreeButtonLayout\(\)/);
        expect(contentSource).toMatch(/function resetFreeButtonLayout/);
        expect(contentSource).toMatch(/storage\.local\.remove\(\['buttonFreePosition', 'buttonFreeSize'\]\)/);
    });

    test('updatePositions re-applies a saved free position over the corner preset', () => {
        expect(contentSource).toMatch(/if \(typeof freeButtonPosition !== 'undefined' && freeButtonPosition\) \{\s*applyFreeButtonPosition\(\);/);
    });
});
