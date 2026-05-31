const fs = require('fs');
const path = require('path');

const optionsSource = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8');

// Issue #50 (real cause): follow/reviewed radio buttons used hardcoded name/id
// attributes, so every action's radios shared one document-wide radio group.
// Selecting one cleared the others, leaving an action with nothing checked, and
// the save crashed on querySelector('...:checked').value (null). The fix gives
// each action a unique uid suffix on the radio name/id attributes, and guards the
// save reads with optional chaining + a sensible default.
describe('Reviewed/follow radio group uniqueness (issue #50)', () => {
    test('a per-action uid counter exists', () => {
        expect(optionsSource).toMatch(/let actionUidCounter = 0;/);
        expect(optionsSource).toMatch(/const uid = 'act' \+ \(actionUidCounter\+\+\);/);
    });

    test('reviewed radios use a uid-suffixed name (not a shared hardcoded group)', () => {
        expect(optionsSource).toMatch(/name="reviewedToggle-\$\{uid\}"/);
        expect(optionsSource).not.toMatch(/name="reviewedToggle"/);
    });

    test('follow radios use a uid-suffixed name (not a shared hardcoded group)', () => {
        expect(optionsSource).toMatch(/name="followToggle-\$\{uid\}"/);
        expect(optionsSource).not.toMatch(/name="followToggle"/);
    });

    test('reviewed radio ids and their label "for" targets are uid-suffixed', () => {
        expect(optionsSource).toMatch(/id="markReviewed-\$\{uid\}"/);
        expect(optionsSource).toMatch(/id="unmarkReviewed-\$\{uid\}"/);
        expect(optionsSource).toMatch(/for="markReviewed-\$\{uid\}"/);
        expect(optionsSource).not.toMatch(/id="markReviewed"/);
    });

    test('follow radio ids and their label "for" targets are uid-suffixed', () => {
        expect(optionsSource).toMatch(/id="follow-\$\{uid\}"/);
        expect(optionsSource).toMatch(/id="unfollow-\$\{uid\}"/);
        expect(optionsSource).toMatch(/for="follow-\$\{uid\}"/);
    });

    test('save reads are null-guarded with a sensible default', () => {
        expect(optionsSource).toMatch(/reviewedToggle"\]:checked'\)\?\.value \|\| 'mark'/);
        expect(optionsSource).toMatch(/followToggle"\]:checked'\)\?\.value \|\| 'follow'/);
    });

    test('save/populate still use starts-with (name^=) selectors that match the suffixed names', () => {
        expect(optionsSource).toMatch(/input\[name\^="reviewedToggle"\]/);
        expect(optionsSource).toMatch(/input\[name\^="followToggle"\]/);
    });
});
