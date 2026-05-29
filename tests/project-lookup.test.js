const fs = require('fs');
const path = require('path');
const { describe, test, expect, beforeAll } = require('@jest/globals');

// Guards for the #48 fix: project dropdown must use the relevance-ranked
// autocomplete endpoint, and the project ID field must accept manual entry
// with an ID -> name lookup.
describe('Project lookup and manual ID entry (#48)', () => {
    let sharedApiJs;
    let optionsJs;

    beforeAll(() => {
        sharedApiJs = fs.readFileSync(
            path.join(__dirname, '..', 'shared_api.js'),
            'utf-8'
        );
        optionsJs = fs.readFileSync(
            path.join(__dirname, '..', 'options.js'),
            'utf-8'
        );
    });

    describe('lookupProject endpoint', () => {
        test('queries the /projects/autocomplete endpoint', () => {
            const body = sharedApiJs.slice(
                sharedApiJs.indexOf('function lookupProject('),
                sharedApiJs.indexOf('function lookupProjectById(')
            );
            expect(body).toMatch(/\/projects\/autocomplete/);
        });

        test('no longer sorts by observation_count', () => {
            const body = sharedApiJs
                .slice(
                    sharedApiJs.indexOf('function lookupProject('),
                    sharedApiJs.indexOf('function lookupProjectById(')
                )
                // strip // comments so we only assert against executable code
                .replace(/\/\/.*$/gm, '');
            expect(body).not.toMatch(/order_by/);
            expect(body).not.toMatch(/observation_count/);
        });
    });

    describe('lookupProjectById helper', () => {
        test('is defined', () => {
            expect(sharedApiJs).toMatch(/function lookupProjectById\(/);
        });

        test('fetches a single project by ID', () => {
            const body = sharedApiJs.slice(
                sharedApiJs.indexOf('function lookupProjectById(')
            );
            expect(body).toMatch(/\/projects\/\$\{encodeURIComponent\(projectId\)\}/);
        });
    });

    describe('manual project ID entry in options.js', () => {
        test('project ID input is not readonly', () => {
            const inputMatch = optionsJs.match(/<input[^>]*class="projectId"[^>]*>/);
            expect(inputMatch).not.toBeNull();
            expect(inputMatch[0]).not.toMatch(/readonly/);
        });

        test('wires lookupProjectById to the ID input', () => {
            expect(optionsJs).toMatch(/lookupProjectById\(/);
        });
    });
});
