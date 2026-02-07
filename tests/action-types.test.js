const fs = require('fs');
const path = require('path');
const { describe, test, expect, beforeAll } = require('@jest/globals');

describe('Action Type Consistency Tests', () => {
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

    const actionTypes = [
        'observationField',
        'addComment',
        'addTaxonId',
        'annotation',
        'addToProject',
        'qualityMetric',
        'copyObservationField',
        'addToList',
        'follow',
        'reviewed'
    ];

    describe('Action Types in options.js', () => {
        actionTypes.forEach(actionType => {
            test(`Action type "${actionType}" has option element in options.js`, () => {
                const optionRegex = new RegExp(`<option value=["']${actionType}["']`, 'g');
                expect(optionsJs).toMatch(optionRegex);
            });

            test(`Action type "${actionType}" has switch case in collectActionsFromForm`, () => {
                const caseRegex = new RegExp(`case ['"\`]${actionType}['"\`]:`, 'g');
                expect(optionsJs).toMatch(caseRegex);
            });
        });
    });

    describe('Action Types in content.js', () => {
        actionTypes.forEach(actionType => {
            test(`Action type "${actionType}" is handled in content.js executeAction`, () => {
                const caseRegex = new RegExp(`case ['"\`]${actionType}['"\`]:`, 'g');
                expect(contentJs).toMatch(caseRegex);
            });
        });
    });

    describe('Field Property Requirements', () => {
        test('observationField actions require fieldId in options.js', () => {
            expect(optionsJs).toMatch(/action\.fieldId\s*=\s*actionDiv\.querySelector\(['"]\.fieldId['"]\)/);
        });

        test('observationField actions require fieldName in options.js', () => {
            expect(optionsJs).toMatch(/action\.fieldName\s*=\s*actionDiv\.querySelector\(['"]\.fieldName['"]\)/);
        });

        test('observationField actions require fieldValue in options.js', () => {
            expect(optionsJs).toMatch(/action\.fieldValue\s*=.*fieldValueElement/);
        });

        test('observationField actions use fieldId in content.js', () => {
            expect(contentJs).toMatch(/action\.fieldId/);
        });

        test('observationField actions use fieldName in content.js', () => {
            expect(contentJs).toMatch(/action\.fieldName/);
        });

        test('observationField actions use fieldValue in content.js', () => {
            expect(contentJs).toMatch(/action\.fieldValue/);
        });
    });

    describe('Action Validation', () => {
        test('options.js validates observationField fields are not empty', () => {
            const validationRegex = /!action\.fieldId\s*\|\|\s*!action\.fieldName\s*\|\|\s*!action\.fieldValue/;
            expect(optionsJs).toMatch(validationRegex);
        });

        test('addComment action requires commentBody', () => {
            expect(optionsJs).toMatch(/action\.commentBody/);
        });

        test('addTaxonId action requires taxonId', () => {
            expect(optionsJs).toMatch(/action\.taxonId/);
        });
    });

    describe('Action Type Toggle Logic', () => {
        test('actionType change event updates visibility of observationField inputs', () => {
            const regex = /actionType\.value\s*===\s*['"]observationField['"]\s*\?\s*['"]block['"]\s*:\s*['"]none['"]/;
            expect(optionsJs).toMatch(regex);
        });

        test('actionType change event updates visibility of addComment inputs', () => {
            const regex = /actionType\.value\s*===\s*['"]addComment['"]\s*\?\s*['"]block['"]\s*:\s*['"]none['"]/;
            expect(optionsJs).toMatch(regex);
        });

        test('actionType change event updates visibility of addTaxonId inputs', () => {
            const regex = /actionType\.value\s*===\s*['"]addTaxonId['"]\s*\?\s*['"]block['"]\s*:\s*['"]none['"]/;
            expect(optionsJs).toMatch(regex);
        });
    });
});