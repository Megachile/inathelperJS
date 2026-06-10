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
        expect(contentSource).toMatch(/viewportW\(\) - o\.width/);
        expect(contentSource).toMatch(/window\.addEventListener\('resize', function\(\) \{\s*if \(freeButtonPosition\) applyFreeButtonPosition\(\);/);
    });

    test('clamp excludes the scrollbar gutter (documentElement.clientWidth, not innerWidth)', () => {
        // Right-/bottom-sticking grips were sliding under the scrollbar because
        // window.innerWidth includes it; clientWidth does not.
        expect(contentSource).toMatch(/function viewportW\(\) \{ return document\.documentElement\.clientWidth/);
        expect(contentSource).toMatch(/function viewportH\(\) \{ return document\.documentElement\.clientHeight/);
    });

    test('clamp accounts for the overhanging sort/edit/set controls (no top-edge clipping)', () => {
        // #54 follow-up: the sort-buttons-container is absolutely positioned and
        // overhangs buttonDiv, so clamping on buttonDiv alone let it clip past
        // the top edge. The clamp now measures the full cluster extent.
        expect(contentSource).toMatch(/function getClusterOverhang/);
        expect(contentSource).toMatch(/getElementById\('sort-buttons-container'\)/);
        expect(contentSource).toMatch(/overTop: divRect\.top - top/);
        expect(contentSource).toMatch(/visTop = top - o\.overTop/);
    });

    test('sort/edit/set controls snap to the nearest side and vertical edge', () => {
        // #54 follow-up: they stayed right-aligned regardless of where the
        // cluster was dragged. Now they snap left/right and above/below.
        expect(contentSource).toMatch(/function alignSortContainerToCluster/);
        expect(contentSource).toMatch(/sortC\.style\.left = '0'; sortC\.style\.right = 'auto'/);
        expect(contentSource).toMatch(/sortC\.style\.right = '0'; sortC\.style\.left = 'auto'/);
        expect(contentSource).toMatch(/sortC\.style\.top = '100%'; sortC\.style\.bottom = 'auto'/);
        expect(contentSource).toMatch(/sortC\.style\.bottom = '100%'; sortC\.style\.top = 'auto'/);
    });

    test('alignment is re-applied live while dragging', () => {
        expect(contentSource).toMatch(/function onButtonDragMove[\s\S]*?alignSortContainerToCluster\(\);/);
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

    test('the wrapper has an id to anchor hover-reveal CSS', () => {
        expect(contentSource).toMatch(/buttonDiv\.id = 'custom-extension-wrapper'/);
    });

    test('utility controls are hidden by default and revealed behind the gear (#54 polish)', () => {
        // The sort/edit/set controls take up permanent space for rarely-used
        // actions, so they hide behind a gear and only show when the menu is open.
        expect(contentSource).toMatch(/#sort-buttons-container \{[\s\S]*?opacity: 0;[\s\S]*?pointer-events: none;[\s\S]*?\}/);
        expect(contentSource).toMatch(/#custom-extension-wrapper\.menu-open #sort-buttons-container \{[\s\S]*?opacity: 1;[\s\S]*?pointer-events: auto;/);
    });

    test('a gear button is added and toggles the menu', () => {
        expect(contentSource).toMatch(/id = 'button-gear'/);
        expect(contentSource).toMatch(/gearButton\.addEventListener\('click', function\(e\) \{[\s\S]*?buttonDiv\.classList\.toggle\('menu-open'\)/);
    });

    test('grip + gear are hidden until hover, then enlarge and darken', () => {
        expect(contentSource).toMatch(/#button-move-grip, #button-gear \{[\s\S]*?opacity: 0;/);
        expect(contentSource).toMatch(/#custom-extension-wrapper:hover #button-move-grip,\s*#custom-extension-wrapper:hover #button-gear,\s*#custom-extension-wrapper\.menu-open #button-gear \{[\s\S]*?opacity: 1;[\s\S]*?transform: scale\(1\.25\);/);
        expect(contentSource).toMatch(/#button-move-grip:hover,\s*#button-gear:hover \{ color: #000; transform: scale\(1\.4\); \}/);
    });

    test('the grip + gear are grouped to the right, not spread to opposite edges', () => {
        expect(contentSource).toMatch(/#button-drag-handle \{[\s\S]*?justify-content: flex-end;/);
    });

    test('click-away closes the gear menu', () => {
        expect(contentSource).toMatch(/document\.addEventListener\('click', function\(e\) \{[\s\S]*?!buttonDiv\.contains\(e\.target\)[\s\S]*?classList\.remove\('menu-open'\)/);
    });

    test('only the move grip starts a drag (gear clicks do not move the cluster)', () => {
        expect(contentSource).toMatch(/id = 'button-move-grip'/);
        expect(contentSource).toMatch(/moveGrip\.addEventListener\('mousedown'/);
    });

    test('resize uses min-height (not a hard height) so content never spills out', () => {
        // Fixes the "toolbar lands in the middle of the buttons" bug: a hard
        // height with overflow:visible let buttons spill past the box edge.
        expect(contentSource).toMatch(/buttonContainer\.style\.minHeight = h \+ 'px'/);
        expect(contentSource).toMatch(/buttonContainer\.style\.minHeight = freeButtonSize\.height \+ 'px'/);
        expect(contentSource).not.toMatch(/buttonContainer\.style\.height = h \+ 'px'/);
        // align-content keeps wrapped rows top-packed when min-height adds slack.
        expect(contentSource).toMatch(/align-content: flex-start/);
    });

    test('resize grip is offset off the corner and also hover-revealed', () => {
        expect(contentSource).toMatch(/#button-resize-grip \{[\s\S]*?right: -7px;[\s\S]*?bottom: -7px;/);
        expect(contentSource).toMatch(/#custom-extension-wrapper:hover #button-resize-grip \{[\s\S]*?opacity: 0\.55;[\s\S]*?pointer-events: auto;/);
    });

    test('overhang measurement includes the resize grip so the offset cannot clip off-screen', () => {
        expect(contentSource).toMatch(/const overhangers = \[document\.getElementById\('sort-buttons-container'\), resizeGrip\]/);
    });
});
