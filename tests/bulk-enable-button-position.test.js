const fs = require('fs');
const path = require('path');

const contentSource = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

// Issue #56 (Bug 1, reported by @mrtnlowr on Firefox): the "Enable Bulk Action
// Mode" button vanished off-screen whenever the button cluster was cycled away
// from the default bottom-right corner (Alt+N). All bulk UI lives inside
// #bulk-ui-wrapper, which is the element that gets `position: fixed`. The
// #enable-bulk-mode-button CSS rule kept its own stale `position: fixed` (with
// no offsets), so as a child it anchored to the viewport instead of flowing
// inside the wrapper. Fix: drop position/z-index from the button's rule so it
// follows the wrapper.
describe('Enable Bulk Action Mode button follows the bulk UI wrapper (issue #56)', () => {
    // isolate the `#enable-bulk-mode-button { ... }` CSS block (the styling rule,
    // not the :before pseudo-element or the JS getElementById lookups)
    const cssBlock = contentSource
        .match(/#enable-bulk-mode-button\s*\{([\s\S]*?)\}/);

    test('the button CSS rule exists', () => {
        expect(cssBlock).not.toBeNull();
    });

    test('the button CSS rule no longer sets its own position: fixed', () => {
        expect(cssBlock[1]).not.toMatch(/position:\s*fixed/);
    });

    test('the button CSS rule no longer sets its own z-index', () => {
        expect(cssBlock[1]).not.toMatch(/z-index/);
    });

    test('the wrapper is the element that is fixed-positioned', () => {
        expect(contentSource).toMatch(/bulkUiWrapper\.style\.position\s*=\s*'fixed'/);
        expect(contentSource).toMatch(/bulkUiWrapper\.style\.zIndex\s*=\s*'10000'/);
    });

    test('the enable button is appended into the wrapper', () => {
        expect(contentSource).toMatch(/bulkUiWrapper\.appendChild\(enableBulkModeButton\)/);
    });
});
