const fs = require('fs');
const path = require('path');
const { describe, test, expect, beforeAll } = require('@jest/globals');

describe('Configuration Schema Validation Tests', () => {
    let optionsJs;

    beforeAll(() => {
        optionsJs = fs.readFileSync(
            path.join(__dirname, '..', 'options.js'),
            'utf-8'
        );
    });

    describe('Configuration Object Structure', () => {
        test('Configuration has name property', () => {
            expect(optionsJs).toMatch(/name:\s*document\.getElementById\(['"]buttonName['"]\)\.value/);
        });

        test('Configuration has shortcut property', () => {
            expect(optionsJs).toMatch(/shortcut:\s*{/);
        });

        test('Shortcut has key property', () => {
            expect(optionsJs).toMatch(/key:\s*document\.getElementById\(['"]shortcut['"]\)/);
        });

        test('Shortcut has ctrlKey property', () => {
            expect(optionsJs).toMatch(/ctrlKey:\s*document\.getElementById\(['"]ctrlKey['"]\)\.checked/);
        });

        test('Shortcut has shiftKey property', () => {
            expect(optionsJs).toMatch(/shiftKey:\s*document\.getElementById\(['"]shiftKey['"]\)\.checked/);
        });

        test('Shortcut has altKey property', () => {
            expect(optionsJs).toMatch(/altKey:\s*document\.getElementById\(['"]altKey['"]\)\.checked/);
        });

        test('Configuration has actions array', () => {
            expect(optionsJs).toMatch(/actions:\s*extractActionsFromForm\(\)/);
        });
    });

    describe('Action Collection from Form', () => {
        test('extractActionsFromForm function exists', () => {
            expect(optionsJs).toMatch(/function extractActionsFromForm\(\)/);
        });

        test('extractActionsFromForm queries all action-item elements', () => {
            expect(optionsJs).toMatch(/querySelectorAll\(['"]\.action-item['"]\)/);
        });

        test('Each action gets type property from actionType select', () => {
            expect(optionsJs).toMatch(/querySelector\(['"]\.actionType['"]\)\.value/);
        });

        test('Action object is created with type property', () => {
            expect(optionsJs).toMatch(/actionType/);
        });
    });

    describe('Action Schema by Type', () => {
        test('observationField actions have required properties', () => {
            const lines = optionsJs.split('\n');
            let foundFieldIdAssignment = false;
            let foundFieldNameAssignment = false;
            let foundFieldValueAssignment = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.includes("case 'observationField':")) {
                    const nextLines = lines.slice(i, i + 20).join('\n');
                    foundFieldIdAssignment = /action\.fieldId\s*=/.test(nextLines);
                    foundFieldNameAssignment = /action\.fieldName\s*=/.test(nextLines);
                    foundFieldValueAssignment = /action\.fieldValue\s*=/.test(nextLines);
                    break;
                }
            }

            expect(foundFieldIdAssignment).toBe(true);
            expect(foundFieldNameAssignment).toBe(true);
            expect(foundFieldValueAssignment).toBe(true);
        });

        test('addComment actions have commentBody property', () => {
            const lines = optionsJs.split('\n');
            let foundCommentBody = false;

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes("case 'addComment':")) {
                    const nextLines = lines.slice(i, i + 10).join('\n');
                    foundCommentBody = /action\.commentBody\s*=/.test(nextLines);
                    break;
                }
            }

            expect(foundCommentBody).toBe(true);
        });

        test('addTaxonId actions have taxonId property', () => {
            const lines = optionsJs.split('\n');
            let foundTaxonId = false;

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes("case 'addTaxonId':")) {
                    const nextLines = lines.slice(i, i + 10).join('\n');
                    foundTaxonId = /action\.taxonId\s*=/.test(nextLines);
                    break;
                }
            }

            expect(foundTaxonId).toBe(true);
        });
    });

    describe('Configuration Storage', () => {
        test('Configurations are stored using browserAPI.storage', () => {
            expect(optionsJs).toMatch(/browserAPI\.storage.*\.set/);
        });

        test('Configurations use buttonConfigs key', () => {
            expect(optionsJs).toMatch(/buttonConfigs/);
        });

        test('saveConfiguration function exists', () => {
            expect(optionsJs).toMatch(/function saveConfiguration\(\)/);
        });
    });

    describe('Configuration Loading', () => {
        test('loadOptionsPageData function exists', () => {
            expect(optionsJs).toMatch(/function loadOptionsPageData\(\)/);
        });

        test('Configurations are loaded from storage', () => {
            expect(optionsJs).toMatch(/browserAPI\.storage.*\.get/);
        });

        test('displayConfigurations function exists', () => {
            expect(optionsJs).toMatch(/function displayConfigurations\(\)/);
        });
    });

    describe('Configuration Form Population', () => {
        test('editConfiguration function exists', () => {
            expect(optionsJs).toMatch(/function editConfiguration/);
        });

        test('Actions are populated back to form', () => {
            expect(optionsJs).toMatch(/addActionToForm/);
        });
    });

    describe('Configuration Sets', () => {
        test('configurationSets variable exists', () => {
            expect(optionsJs).toMatch(/let configurationSets\s*=\s*\[\]/);
        });

        test('setSelector element is referenced', () => {
            expect(optionsJs).toMatch(/getElementById\(['"]setSelector['"]\)/);
        });

        test('createNewSet function exists', () => {
            expect(optionsJs).toMatch(/function createNewSet\(\)/);
        });

        test('removeCurrentSet function exists', () => {
            expect(optionsJs).toMatch(/function removeCurrentSet\(\)/);
        });
    });

    describe('Quality Metrics Configuration', () => {
        test('qualityMetrics array is defined', () => {
            expect(optionsJs).toMatch(/const qualityMetrics\s*=\s*\[/);
        });

        test('Quality metrics have value and label properties', () => {
            expect(optionsJs).toMatch(/{\s*value:\s*['"][\w_]+['"],\s*label:/);
        });
    });

    describe('Auto-Follow/Review Prevention Settings', () => {
        test('preventTaxonFollow setting exists', () => {
            expect(optionsJs).toMatch(/getElementById\(['"]preventTaxonFollow['"]\)/);
        });

        test('preventFieldFollow setting exists', () => {
            expect(optionsJs).toMatch(/getElementById\(['"]preventFieldFollow['"]\)/);
        });

        test('preventTaxonReview setting exists', () => {
            expect(optionsJs).toMatch(/getElementById\(['"]preventTaxonReview['"]\)/);
        });

        test('saveAutoFollowSettings function exists', () => {
            expect(optionsJs).toMatch(/function saveAutoFollowSettings\(\)/);
        });
    });
});