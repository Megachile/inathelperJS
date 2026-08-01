const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('URLgen.html');
const js = read('URLgen.js');
const bodyHtml = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];

// The URL builder's purpose is full UI access to iNat's observation search API. These
// tests pin the params that were added to close the gap against GET /observations, and
// check each one is actually reachable from the markup rather than only present in code.
describe('URL builder API param coverage', () => {
    const BOOLEAN_TOGGLES = [
        'endemic', 'out_of_range', 'expected_nearby', 'taxon_is_active', 'licensed',
        'verifiable', 'pcid', 'id_please',
        'fails_dqa_wild', 'fails_dqa_evidence', 'fails_dqa_date', 'fails_dqa_location',
        'fails_dqa_accurate', 'fails_dqa_recent', 'fails_dqa_subject', 'fails_dqa_needs_id'
    ];

    const TEXT_PARAMS = [
        ['taxonNameInput', 'taxon_name'], ['csInput', 'cs'], ['csaInput', 'csa'],
        ['hourInput', 'hour'], ['dayInput', 'day'], ['yearInput', 'year'],
        ['observedOnInput', 'observed_on'], ['createdDayInput', 'created_day'],
        ['createdYearInput', 'created_year'], ['createdOnInput', 'created_on'],
        ['updatedSinceInput', 'updated_since'],
        ['unobservedByUserInput', 'unobserved_by_user_id'],
        ['annotationUserInput', 'annotation_user_id'], ['userLoginInput', 'user_login'],
        ['viewerIdInput', 'viewer_id'], ['idAboveInput', 'id_above'],
        ['idBelowInput', 'id_below'], ['notIdInput', 'not_id'], ['siteIdInput', 'site_id'],
        ['accBelowOrUnknownInput', 'acc_below_or_unknown'],
        ['accuracyExperimentInput', 'observation_accuracy_experiment_id'],
        ['ofvDatatypeSelect', 'ofv_datatype'], ['localeInput', 'locale'],
        ['preferredPlaceInput', 'preferred_place_id']
    ];

    const ENUM_GROUPS = [
        ['rankFilter', 'rank'], ['csiFilter', 'csi'],
        ['obsLicenses', 'license'], ['obscurationFilter', 'obscuration']
    ];

    beforeEach(() => { document.body.innerHTML = bodyHtml; });

    describe('boolean toggles', () => {
        test.each(BOOLEAN_TOGGLES)('%s has a full any/yes/no radio group', (name) => {
            const radios = document.querySelectorAll(`input[name="${name}"]`);
            expect(radios).toHaveLength(3);
            expect(document.querySelector(`input[name="${name}"][value="any"]`).defaultChecked).toBe(true);
            expect(document.querySelector(`input[name="${name}"][value="true"]`)).not.toBeNull();
            expect(document.querySelector(`input[name="${name}"][value="false"]`)).not.toBeNull();
        });

        test.each(BOOLEAN_TOGGLES)('%s is registered in the toggles array', (name) => {
            const arr = js.match(/const toggles = \[([\s\S]*?)\];/)[1];
            expect(arr).toContain(`'${name}'`);
        });

        test('every name in the toggles array has markup (no silent no-ops)', () => {
            const arr = js.match(/const toggles = \[([\s\S]*?)\];/)[1];
            const names = Array.from(arr.matchAll(/'([a-z_]+)'/g)).map(m => m[1]);
            expect(names.length).toBeGreaterThanOrEqual(29);
            names.forEach(name => {
                expect(document.querySelector(`input[name="${name}"]:checked`)).not.toBeNull();
            });
        });
    });

    // Everything added here is opt-in: it lives inside the two collapsed fieldsets, so the
    // default view of the page is unchanged despite the number of new controls.
    describe('placement', () => {
        test('the new toggles sit inside the collapsed Toggles fieldset', () => {
            const fieldset = document.getElementById('additionalFilters');
            expect(fieldset.classList.contains('collapsed')).toBe(true);
            BOOLEAN_TOGGLES.forEach(name => {
                expect(fieldset.contains(document.querySelector(`input[name="${name}"]`))).toBe(true);
            });
        });

        test('the new inputs sit inside the collapsed Additional Parameters fieldset', () => {
            const fieldset = document.getElementById('additionalParams');
            expect(fieldset.classList.contains('collapsed')).toBe(true);
            TEXT_PARAMS.forEach(([id]) => {
                expect(fieldset.contains(document.getElementById(id))).toBe(true);
            });
            ENUM_GROUPS.forEach(([containerId]) => {
                expect(fieldset.contains(document.getElementById(containerId))).toBe(true);
            });
        });
    });

    // The Any/Yes/No buttons should form a straight vertical line down the list. That only
    // holds while the label column is a fixed width: with min-width, a long label pushes
    // its own buttons rightward and the column zigzags.
    describe('toggle label column', () => {
        const css = read('URLgen.css');
        const rule = css.match(/\.toggle-group label:first-child \{([^}]*)\}/)[1];

        test('the label column is a fixed width, not a minimum', () => {
            expect(rule).toMatch(/flex:\s*0 0 220px/);
            expect(rule).toMatch(/width:\s*220px/);
            expect(rule).not.toMatch(/min-width/);
        });

        test('no toggle label is long enough to overflow the column', () => {
            // 25 characters measures 187px in 16px Arial, the page's font for these labels,
            // against a 220px column. 30 leaves the measured headroom intact.
            const groups = Array.from(document.querySelectorAll('.toggle-group'));
            expect(groups.length).toBeGreaterThan(30);
            groups.forEach(group => {
                const first = group.querySelector('label');
                expect(first.textContent.trim().length).toBeLessThanOrEqual(30);
            });
        });
    });

    describe('text, number and select params', () => {
        test.each(TEXT_PARAMS)('%s exists in the markup', (id) => {
            expect(document.getElementById(id)).not.toBeNull();
        });

        test.each(TEXT_PARAMS)('%s is wired to its param', (id, param) => {
            expect(js).toMatch(new RegExp(`\\['${id}', '${param}'\\]`));
        });

        test('each has a label pointing at it', () => {
            TEXT_PARAMS.forEach(([id]) => {
                expect(document.querySelector(`label[for="${id}"]`)).not.toBeNull();
            });
        });
    });

    describe('multi-value enum groups', () => {
        test.each(ENUM_GROUPS)('%s has checkboxes carrying the %s param name', (containerId, param) => {
            const boxes = document.querySelectorAll(`#${containerId} input[type="checkbox"]`);
            expect(boxes.length).toBeGreaterThan(0);
            boxes.forEach(box => {
                expect(box.name).toBe(param);
                // ids are required: the generic save/restore loop keys on them.
                expect(box.id).toBeTruthy();
            });
        });

        test('rank offers the full set of iNat ranks', () => {
            expect(document.querySelectorAll('#rankFilter input')).toHaveLength(25);
        });

        test('license offers the seven CC options', () => {
            expect(document.querySelectorAll('#obsLicenses input')).toHaveLength(7);
        });
    });

    describe('generated URL', () => {
        // Run the real emitters against the real markup.
        const runBlock = (startMarker, endMarker) => {
            const start = js.indexOf(startMarker);
            const end = js.indexOf(endMarker, start);
            expect(start).toBeGreaterThan(-1);
            expect(end).toBeGreaterThan(start);
            // eslint-disable-next-line no-new-func
            return new Function(`const params = []; ${js.slice(start, end)} return params;`)();
        };

        const runAdditional = () => runBlock(
            '// --- Additional Parameters',
            '// Sorting'
        );

        test('nothing is emitted when the section is untouched', () => {
            expect(runAdditional()).toEqual([]);
        });

        test('a ticked enum option is comma-joined into its param', () => {
            document.getElementById('rankFilter-genus').checked = true;
            document.getElementById('rankFilter-species').checked = true;
            expect(runAdditional()).toContain('rank=genus,species');
        });

        test('text values are emitted and URL-encoded', () => {
            document.getElementById('taxonNameInput').value = 'Quercus alba';
            expect(runAdditional()).toContain('taxon_name=Quercus%20alba');
        });

        test('whitespace-only input is treated as blank', () => {
            document.getElementById('csInput').value = '   ';
            expect(runAdditional()).toEqual([]);
        });

        test('the toggle loop emits a flipped boolean and skips the rest', () => {
            document.querySelector('input[name="fails_dqa_wild"][value="true"]').checked = true;
            const params = runBlock('const toggles = [', 'const types = [');
            expect(params).toContain('fails_dqa_wild=true');
            expect(params).toHaveLength(1);
        });
    });
});
