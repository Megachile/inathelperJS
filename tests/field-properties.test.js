const fs = require('fs');
const path = require('path');
const { describe, test, expect, beforeAll } = require('@jest/globals');

describe('Field Properties Consistency Tests', () => {
    let optionsJs;
    let contentJs;

    beforeAll(() => {
        optionsJs = fs.readFileSync(
            path.join(__dirname, '..', 'options.js'),
            'utf-8'
        );
        contentJs = fs.readFileSync(
            path.join(__dirname, '..', 'content.js'),
            'utf-8'
        );
    });

    describe('Observation Field Property Chain', () => {
        const fieldProperties = ['fieldId', 'fieldName', 'fieldValue', 'displayValue'];

        fieldProperties.forEach(property => {
            test(`Property "${property}" is collected from form in options.js`, () => {
                const regex = new RegExp(`action\\.${property}\\s*=`, 'g');
                expect(optionsJs).toMatch(regex);
            });

            test(`Property "${property}" is used in content.js`, () => {
                const regex = new RegExp(`action\\.${property}`, 'g');
                expect(contentJs).toMatch(regex);
            });
        });

        test('fieldId is extracted using querySelector in options.js', () => {
            expect(optionsJs).toMatch(/querySelector\(['"]\.fieldId['"]\)\.value/);
        });

        test('fieldName is extracted using querySelector in options.js', () => {
            expect(optionsJs).toMatch(/querySelector\(['"]\.fieldName['"]\)\.value/);
        });

        test('fieldValue is extracted using querySelector in options.js', () => {
            expect(optionsJs).toMatch(/querySelector\(['"]\.fieldValue['"]\)/);
        });

        test('fieldValueContainer is queried in options.js', () => {
            expect(optionsJs).toMatch(/querySelector\(['"]\.fieldValueContainer['"]\)/);
        });
    });

    describe('Field Property Usage in content.js', () => {
        test('fieldId is used to identify observation fields', () => {
            expect(contentJs).toMatch(/action\.fieldId/);
        });

        test('fieldName is used for display and logging', () => {
            expect(contentJs).toMatch(/action\.fieldName/);
        });

        test('fieldValue is used as the value to set', () => {
            expect(contentJs).toMatch(/action\.fieldValue/);
        });

        test('displayValue is used as fallback display representation', () => {
            expect(contentJs).toMatch(/action\.displayValue\s*\|\|\s*action\.fieldValue/);
        });

        test('addObservationField function uses fieldId and fieldValue', () => {
            expect(contentJs).toMatch(/addObservationField\([^,]+,\s*action\.fieldId,\s*action\.fieldValue\)/);
        });
    });

    describe('Field Property Validation', () => {
        test('options.js validates all three required field properties', () => {
            expect(optionsJs).toMatch(/!action\.fieldId\s*\|\|\s*!action\.fieldName\s*\|\|\s*!action\.fieldValue/);
        });

        test('Validation includes observationField type check', () => {
            const lines = optionsJs.split('\n');
            let foundValidation = false;

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('!action.fieldId') ||
                    lines[i].includes('!action.fieldName') ||
                    lines[i].includes('!action.fieldValue')) {

                    const contextStart = Math.max(0, i - 10);
                    const context = lines.slice(contextStart, i + 5).join('\n');

                    if (context.includes('observationField')) {
                        foundValidation = true;
                        break;
                    }
                }
            }

            expect(foundValidation).toBe(true);
        });
    });

    describe('Field Property Storage and Retrieval', () => {
        test('Fields are stored when editing configuration', () => {
            expect(optionsJs).toMatch(/\.fieldName\s*\|\|\s*['"]{2}/);
            expect(optionsJs).toMatch(/\.fieldId\s*\|\|\s*['"]{2}/);
            expect(optionsJs).toMatch(/\.fieldValue\s*\|\|\s*['"]{2}/);
        });

        test('Fields are loaded when populating form', () => {
            const loadingPattern = /querySelector\(['"]\.field(Name|Id|Value)['"]\)\.value\s*=\s*action\.field(Name|Id|Value)/;
            expect(optionsJs).toMatch(loadingPattern);
        });
    });

    describe('CSS Class Consistency', () => {
        const cssClasses = [
            'fieldName',
            'fieldId',
            'fieldValue',
            'fieldValueContainer'
        ];

        cssClasses.forEach(className => {
            test(`Class "${className}" is defined in options.js`, () => {
                const defineRegex = new RegExp(`class=["']${className}["']`, 'g');
                expect(optionsJs).toMatch(defineRegex);
            });

            test(`Class "${className}" is queried in options.js`, () => {
                const queryRegex = new RegExp(`querySelector\\(['"\`]\\.${className}['"\`]\\)`, 'g');
                expect(optionsJs).toMatch(queryRegex);
            });
        });
    });

    describe('Taxon-specific Field Handling', () => {
        test('fieldValue can store taxon ID from data attribute', () => {
            expect(optionsJs).toMatch(/fieldValueElement\.dataset\.taxonId/);
        });

        test('Taxon ID is preferred over plain value', () => {
            expect(optionsJs).toMatch(/fieldValueElement\.dataset\.taxonId\s*\|\|\s*fieldValueElement\.value/);
        });
    });
});