const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('URLgen.html');
const js = read('URLgen.js');

// Issue #53: URL builder Geographic Selectors fixes.
describe('URL builder Location Accuracy labels (issue #53)', () => {
    test('each accuracy radio has a working label (for matches a real radio id)', () => {
        // radios are accAny / accTrue / accFalse — labels must point at those, not the
        // old non-existent acc / acc_above / acc_below ids.
        expect(html).toMatch(/<label for="accAny">/);
        expect(html).toMatch(/<label for="accTrue"/);
        expect(html).toMatch(/<label for="accFalse"/);
        expect(html).not.toMatch(/<label for="acc_above"/);
        expect(html).not.toMatch(/<label for="acc_below"/);
        expect(html).not.toMatch(/<label for="acc"[ >]/);
    });

    test('Accuracy Above/Below labels are attached to the number inputs', () => {
        expect(html).toMatch(/<label for="accAbove"/);
        expect(html).toMatch(/<label for="accBelow"/);
    });
});

describe('URL builder Geoprivacy can be cleared (issue #53)', () => {
    test('both geoprivacy groups have an "Any" option checked by default', () => {
        expect(html).toMatch(/name="geoprivacy" id="geoAny" value="any" checked/);
        expect(html).toMatch(/name="taxonGeoprivacy" id="taxonGeoAny" value="any" checked/);
    });

    test('generateURL omits the param when geoprivacy is "any"', () => {
        expect(js).toMatch(/geoprivacy && geoprivacy\.value !== 'any'/);
        expect(js).toMatch(/taxonGeoprivacy && taxonGeoprivacy\.value !== 'any'/);
    });
});
