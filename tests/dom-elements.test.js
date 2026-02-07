const fs = require('fs');
const path = require('path');
const { describe, test, expect, beforeAll } = require('@jest/globals');

describe('DOM Elements Consistency Tests', () => {
    let optionsHtml;
    let optionsJs;

    beforeAll(() => {
        optionsHtml = fs.readFileSync(
            path.join(__dirname, '..', 'options.html'),
            'utf-8'
        );
        optionsJs = fs.readFileSync(
            path.join(__dirname, '..', 'options.js'),
            'utf-8'
        );
    });

    describe('Critical Input Field IDs', () => {
        const criticalFields = [
            { id: 'buttonName', description: 'Button name input' },
            { id: 'shortcut', description: 'Keyboard shortcut input' },
            { id: 'ctrlKey', description: 'Ctrl modifier checkbox' },
            { id: 'shiftKey', description: 'Shift modifier checkbox' },
            { id: 'altKey', description: 'Alt modifier checkbox' },
            { id: 'saveButton', description: 'Save configuration button' },
            { id: 'cancelButton', description: 'Cancel button' },
            { id: 'addActionButton', description: 'Add action button' },
            { id: 'actionsContainer', description: 'Actions container' },
            { id: 'buttonConfigs', description: 'Button configurations display' },
            { id: 'searchInput', description: 'Configuration search input' },
            { id: 'setSelector', description: 'Configuration set selector' },
            { id: 'preventTaxonFollow', description: 'Prevent taxon auto-follow checkbox' },
            { id: 'preventFieldFollow', description: 'Prevent field auto-follow checkbox' },
            { id: 'preventTaxonReview', description: 'Prevent taxon auto-review checkbox' }
        ];

        criticalFields.forEach(({ id, description }) => {
            test(`${description} (${id}) exists in HTML`, () => {
                const regex = new RegExp(`id=["']${id}["']`, 'g');
                expect(optionsHtml).toMatch(regex);
            });

            test(`${description} (${id}) is referenced in JavaScript`, () => {
                const regex = new RegExp(`getElementById\\(['"\`]${id}['"\`]\\)`, 'g');
                expect(optionsJs).toMatch(regex);
            });
        });
    });

    describe('Action Type Select Options', () => {
        test('actionType select element exists in generated action items', () => {
            expect(optionsJs).toMatch(/class=["']actionType["']/);
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

        actionTypes.forEach(actionType => {
            test(`Action type "${actionType}" is defined in options.js`, () => {
                const optionRegex = new RegExp(`<option value=["']${actionType}["']`, 'g');
                expect(optionsJs).toMatch(optionRegex);
            });
        });
    });

    describe('Dynamic Action Form Fields', () => {
        const dynamicFields = [
            { className: 'actionType', description: 'Action type selector' },
            { className: 'fieldName', description: 'Observation field name' },
            { className: 'fieldId', description: 'Observation field ID' },
            { className: 'fieldValue', description: 'Observation field value' },
            { className: 'fieldValueContainer', description: 'Field value container' }
        ];

        dynamicFields.forEach(({ className, description }) => {
            test(`${description} (${className}) is created in JavaScript`, () => {
                const regex = new RegExp(`class=["']${className}["']`, 'g');
                expect(optionsJs).toMatch(regex);
            });

            test(`${description} (${className}) is queried in JavaScript`, () => {
                const regex = new RegExp(`querySelector\\(['"\`]\\.${className}['"\`]\\)`, 'g');
                expect(optionsJs).toMatch(regex);
            });
        });
    });

    describe('Configuration Management Buttons', () => {
        const configButtons = [
            'deleteSelectedBtn',
            'hideSelectedBtn',
            'showSelectedBtn',
            'disableSelectedBtn',
            'enableSelectedBtn',
            'selectAllConfigs',
            'clearSelectionBtn',
            'expandSelectedConfigsBtn',
            'collapseSelectedConfigsBtn'
        ];

        configButtons.forEach(buttonId => {
            test(`Configuration button ${buttonId} exists in HTML`, () => {
                const regex = new RegExp(`id=["']${buttonId}["']`, 'g');
                expect(optionsHtml).toMatch(regex);
            });

            test(`Configuration button ${buttonId} is referenced in JavaScript`, () => {
                const regex = new RegExp(`getElementById\\(['"\`]${buttonId}['"\`]\\)`, 'g');
                expect(optionsJs).toMatch(regex);
            });
        });
    });
});