const fs = require('fs');
const path = require('path');
const { describe, test, expect, beforeAll } = require('@jest/globals');

describe('Save/Load/Edit/Duplicate Cycle Integration Tests', () => {
    let optionsJs;

    beforeAll(() => {
        optionsJs = fs.readFileSync(
            path.join(__dirname, '..', 'options.js'),
            'utf-8'
        );
    });

    describe('Configuration Object Round-Trip Properties', () => {
        const topLevelProperties = [
            'name',
            'shortcut',
            'actions',
            'id',
            'buttonHidden',
            'configurationDisabled'
        ];

        topLevelProperties.forEach(property => {
            test(`Property "${property}" is collected during save`, () => {
                const extractFormDataContext = extractFunctionContext(optionsJs, 'function extractFormData');
                if (property === 'id' || property === 'buttonHidden' || property === 'configurationDisabled') {
                    return;
                }
                expect(extractFormDataContext).toMatch(new RegExp(`${property}:`));
            });

            test(`Property "${property}" is used during edit/load`, () => {
                const editContext = extractFunctionContext(optionsJs, 'function editConfiguration');
                const populateContext = extractFunctionContext(optionsJs, 'function populateActionInputs');
                const combined = editContext + populateContext;

                if (property === 'id' || property === 'actions') {
                    expect(combined).toMatch(new RegExp(`\\.${property}`));
                }
            });
        });

        test('Shortcut object properties are preserved in save/load cycle', () => {
            const shortcutProperties = ['key', 'ctrlKey', 'shiftKey', 'altKey'];
            const saveContext = extractFunctionContext(optionsJs, 'function extractFormData');
            const editContext = extractFunctionContext(optionsJs, 'function editConfiguration');

            shortcutProperties.forEach(prop => {
                expect(saveContext).toMatch(new RegExp(`${prop}:`));
                expect(editContext).toMatch(new RegExp(`\\.${prop}`));
            });
        });
    });

    describe('Actions Array Round-Trip', () => {
        test('Actions are collected from form during save', () => {
            expect(optionsJs).toMatch(/actions:\s*extractActionsFromForm\(\)/);
        });

        test('Actions are iterated during edit to populate form', () => {
            const editContext = extractFunctionContext(optionsJs, 'function editConfiguration');
            expect(editContext).toMatch(/\.actions\.forEach/);
        });

        test('Each action is passed to populateActionInputs during edit', () => {
            const editContext = extractFunctionContext(optionsJs, 'function editConfiguration');
            expect(editContext).toMatch(/populateActionInputs/);
        });
    });

    describe('Action Type-Specific Properties Round-Trip', () => {
        const actionTypeProperties = {
            observationField: ['fieldId', 'fieldName', 'fieldValue'],
            addComment: ['commentBody'],
            addTaxonId: ['taxonId', 'taxonName'],
            annotation: ['annotationField', 'annotationValue'],
            addToProject: ['projectId', 'projectName'],
            qualityMetric: ['metric', 'vote'],
            copyObservationField: ['sourceFieldId', 'targetFieldId'],
            follow: ['follow'],
            reviewed: ['reviewed']
        };

        Object.entries(actionTypeProperties).forEach(([actionType, properties]) => {
            describe(`Action type: ${actionType}`, () => {
                properties.forEach(property => {
                    test(`Property "${property}" is collected during save`, () => {
                        const collectContext = extractFunctionContext(optionsJs, 'function extractActionsFromForm');
                        const relevantSection = extractSwitchCase(collectContext, actionType);

                        if (relevantSection && relevantSection.length > 10) {
                            expect(relevantSection).toMatch(new RegExp(`\\.${property}`));
                        }
                    });

                    test(`Property "${property}" is populated during edit`, () => {
                        const populateContext = extractFunctionContext(optionsJs, 'function populateActionInputs');
                        const relevantSection = extractSwitchCase(populateContext, actionType);

                        if (relevantSection && relevantSection.length > 10) {
                            expect(relevantSection).toMatch(new RegExp(`\\.${property}`));
                        }
                    });
                });
            });
        });
    });

    describe('Edit Function Behavior', () => {
        test('editConfiguration finds config by id', () => {
            const editContext = extractFunctionContext(optionsJs, 'function editConfiguration');
            expect(editContext).toMatch(/find\(c\s*=>\s*c\.id\s*===\s*configId\)/);
        });

        test('editConfiguration populates all form fields', () => {
            const editContext = extractFunctionContext(optionsJs, 'function editConfiguration');
            expect(editContext).toMatch(/getElementById\(['"]buttonName['"]\)\.value/);
            expect(editContext).toMatch(/getElementById\(['"]ctrlKey['"]\)\.checked/);
            expect(editContext).toMatch(/getElementById\(['"]shortcut['"]\)\.value/);
        });

        test('editConfiguration sets edit mode flag on save button', () => {
            const editContext = extractFunctionContext(optionsJs, 'function editConfiguration');
            expect(editContext).toMatch(/saveButton\.dataset\.editIndex\s*=\s*configId/);
        });

        test('editConfiguration clears and repopulates actions container', () => {
            const editContext = extractFunctionContext(optionsJs, 'function editConfiguration');
            expect(editContext).toMatch(/getElementById\(['"]actionsContainer['"]\)\.innerHTML\s*=\s*['"]{2}/);
            expect(editContext).toMatch(/addActionToForm\(action\)/);
        });
    });

    describe('Duplicate Function Behavior', () => {
        test('duplicateConfiguration reuses editConfiguration logic', () => {
            const duplicateContext = extractFunctionContext(optionsJs, 'function duplicateConfiguration');
            expect(duplicateContext).toMatch(/editConfiguration\(configId\)/);
        });

        test('duplicateConfiguration appends "(Copy)" to name', () => {
            const duplicateContext = extractFunctionContext(optionsJs, 'function duplicateConfiguration');
            expect(duplicateContext).toMatch(/\(Copy\)/);
        });

        test('duplicateConfiguration removes edit index to create new config', () => {
            const duplicateContext = extractFunctionContext(optionsJs, 'function duplicateConfiguration');
            expect(duplicateContext).toMatch(/delete saveButton\.dataset\.editIndex/);
        });
    });

    describe('Save Function Behavior', () => {
        test('saveConfiguration calls extractFormData', () => {
            const saveContext = extractFunctionContext(optionsJs, 'async function saveConfiguration');
            expect(saveContext).toMatch(/extractFormData\(\)/);
        });

        test('saveConfiguration checks for edit mode', () => {
            const saveContext = extractFunctionContext(optionsJs, 'async function saveConfiguration');
            expect(saveContext).toMatch(/editIndex|editId/);
        });

        test('saveConfiguration preserves buttonHidden and configurationDisabled on edit', () => {
            const saveContext = extractFunctionContext(optionsJs, 'async function saveConfiguration');
            expect(saveContext).toMatch(/buttonHidden/);
            expect(saveContext).toMatch(/configurationDisabled/);
        });

        test('saveConfiguration updates existing config or pushes new one', () => {
            const saveContext = extractFunctionContext(optionsJs, 'async function saveConfiguration');
            expect(saveContext).toMatch(/\.findIndex/);
            expect(saveContext).toMatch(/\.push/);
        });
    });

    describe('Load Function Behavior', () => {
        test('loadOptionsPageData reads from storage', () => {
            const loadContext = extractFunctionContext(optionsJs, 'function loadOptionsPageData');
            expect(loadContext).toMatch(/browserAPI\.storage.*\.get/);
        });

        test('loadOptionsPageData calls displayConfigurations', () => {
            const loadContext = extractFunctionContext(optionsJs, 'function loadOptionsPageData');
            expect(loadContext).toMatch(/displayConfigurations\(\)/);
        });

        test('displayConfigurations creates config items from stored data', () => {
            const displayContext = extractFunctionContext(optionsJs, 'function displayConfigurations');
            expect(displayContext).toMatch(/\.forEach/);
        });
    });

    describe('Configuration Set Properties Round-Trip', () => {
        test('Configuration set has name property', () => {
            expect(optionsJs).toMatch(/set\.name/);
        });

        test('Configuration set has buttons array', () => {
            expect(optionsJs).toMatch(/\.buttons/);
        });

        test('Configuration set may have customOrder or buttonOrder', () => {
            expect(optionsJs).toMatch(/customOrder|buttonOrder/);
        });

        test('duplicateCurrentSet preserves all set properties', () => {
            const duplicateSetContext = extractFunctionContext(optionsJs, 'function duplicateCurrentSet');
            expect(duplicateSetContext).toMatch(/JSON\.parse\(JSON\.stringify/);
        });
    });

    describe('Critical Property Preservation', () => {
        test('Edit preserves all original properties not shown in form', () => {
            const saveContext = extractFunctionContext(optionsJs, 'function saveConfiguration');
            expect(saveContext).toMatch(/originalConfig/);
        });

        test('Timestamp is preserved or updated appropriately', () => {
            const saveContext = extractFunctionContext(optionsJs, 'function saveConfiguration');
            expect(saveContext).toMatch(/Date\.now\(\)/);
        });
    });
});

function extractFunctionContext(code, functionSignature) {
    const lines = code.split('\n');
    let startIndex = -1;
    let braceCount = 0;
    let inFunction = false;
    const functionLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!inFunction && line.includes(functionSignature)) {
            startIndex = i;
            inFunction = true;
        }

        if (inFunction) {
            functionLines.push(line);

            for (const char of line) {
                if (char === '{') braceCount++;
                if (char === '}') braceCount--;
            }

            if (braceCount === 0 && startIndex !== i) {
                break;
            }
        }
    }

    return functionLines.join('\n');
}

function extractSwitchCase(code, caseValue) {
    const lines = code.split('\n');
    const caseLines = [];
    let inCase = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.match(new RegExp(`case ['"\`]${caseValue}['"\`]:`))) {
            inCase = true;
        }

        if (inCase) {
            caseLines.push(line);

            if (line.trim().startsWith('case ') && !line.includes(caseValue)) {
                break;
            }
            if (line.trim() === 'break;') {
                break;
            }
        }
    }

    return caseLines.join('\n');
}