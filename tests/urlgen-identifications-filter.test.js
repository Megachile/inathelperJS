const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('URLgen.html');
const js = read('URLgen.js');

// iNat's `identifications` param (most_agree / some_agree / most_disagree) describes how
// the identifications relate to the observation's displayed taxon. It was a real API filter
// the URL builder didn't expose. It is single-valued — comma-separated values are silently
// ignored by the API and fall back to unfiltered results — so it is a radio group.
describe('URL builder ID Agreement filter', () => {
    const bodyHtml = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];

    // The real toggle loop out of generateURL, run against the real markup.
    const togglesBlock = js.slice(
        js.indexOf('const toggles = ['),
        js.indexOf('});', js.indexOf('toggles.forEach')) + 3
    );

    const runToggles = (selectValue) => {
        document.body.innerHTML = bodyHtml;
        if (selectValue) {
            const radio = document.querySelector(`input[name="identifications"][value="${selectValue}"]`);
            expect(radio).not.toBeNull();
            radio.checked = true;
        }
        // eslint-disable-next-line no-new-func
        return new Function(`const params = []; ${togglesBlock} return params;`)();
    };

    test('the param is omitted by default', () => {
        const params = runToggles(null);
        expect(params.filter(p => p.startsWith('identifications='))).toEqual([]);
    });

    test.each(['most_agree', 'some_agree', 'most_disagree'])('selecting %s emits it', (value) => {
        expect(runToggles(value)).toContain(`identifications=${value}`);
    });

    test('choosing one option deselects the others (single-valued param)', () => {
        const params = runToggles('some_agree');
        expect(params.filter(p => p.startsWith('identifications='))).toHaveLength(1);
    });

    test('the toggle loop finds a checked radio, so generateURL cannot throw on it', () => {
        // The loop does querySelector(...).value with no null guard — an unchecked group
        // would take the whole URL build down.
        document.body.innerHTML = bodyHtml;
        expect(document.querySelector('input[name="identifications"]:checked')).not.toBeNull();
    });

    test('every option label points at a radio that exists', () => {
        document.body.innerHTML = bodyHtml;
        const group = document.querySelector('input[name="identifications"]').closest('.toggle-group');
        const labels = Array.from(group.querySelectorAll('label[for]'));
        expect(labels).toHaveLength(4);
        labels.forEach(label => {
            expect(document.getElementById(label.htmlFor)).not.toBeNull();
        });
    });

    test('the radios are saved and restored with saved filters', () => {
        // saveInputs serializes any input[id] whose name is not in groupedNames, so the
        // options need ids and must not be added to that exclusion set.
        document.body.innerHTML = bodyHtml;
        document.querySelectorAll('input[name="identifications"]').forEach(radio => {
            expect(radio.id).toBeTruthy();
        });
        const grouped = js.match(/const groupedNames = new Set\(\[([^\]]*)\]\)/)[1];
        expect(grouped).not.toMatch(/identifications/);
    });
});
