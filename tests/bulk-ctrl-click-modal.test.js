const fs = require('fs');
const path = require('path');

const contentSource = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

// Issue #56 (Bug 2, reported by @rcavasin): Ctrl+click on an observation in bulk
// mode is meant to be an escape hatch that opens the iNat observation modal
// instead of toggling selection. The body click handler returns early (no
// preventDefault, no selection) when the modifier is held. The original guard
// only checked `e.ctrlKey`, so Mac users pressing Cmd+click (which sets
// `e.metaKey`, not `e.ctrlKey`) fell through and had the observation selected
// instead. Fix: honor both ctrlKey and metaKey, matching the Ctrl/Cmd+A
// shortcut handling elsewhere in the file.
describe('Ctrl/Cmd+click escape hatch in bulk mode (issue #56, Bug 2)', () => {
    // isolate the `if (...) { ... return; }` guard that sits directly under the
    // "open the identify modal even in bulk mode" comment
    const guard = contentSource.match(
        /open the identify modal even in bulk mode\s*\n\s*if \(([^)]*)\)/
    );

    test('the ctrl/cmd-click escape-hatch guard exists', () => {
        expect(guard).not.toBeNull();
    });

    test('the guard honors ctrlKey (Windows/Linux)', () => {
        expect(guard[1]).toMatch(/e\.ctrlKey/);
    });

    test('the guard also honors metaKey (Mac Cmd+click)', () => {
        expect(guard[1]).toMatch(/e\.metaKey/);
    });
});
