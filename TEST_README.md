# iNaturalist Metadata Tool - Test Suite

This test suite ensures consistency and prevents regressions between the setup page (`options.html` + `options.js`) and the identify page (`content.js`).

## Overview

The test suite focuses on preventing the two main categories of bugs that have occurred historically:

1. **Input field mismatches** - When HTML element IDs don't match JavaScript `getElementById` calls
2. **Setup/Identify page mismatches** - When button configurations saved in the setup page don't match what the identify page expects

## Installation

Install test dependencies:

```bash
npm install
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Files

### 1. `dom-elements.test.js`
Tests that HTML element IDs match JavaScript references.

**What it checks:**
- All critical input fields in `options.html` have matching `getElementById` calls in `options.js`
- Configuration management buttons exist in both HTML and JavaScript
- Dynamic form elements (like `.actionType`, `.fieldName`) are created and queried consistently

**Key areas covered:**
- Button name, shortcut, and modifier key inputs
- Action type selector
- Configuration management buttons (save, cancel, delete, etc.)
- Auto-follow/review prevention checkboxes

### 2. `action-types.test.js`
Tests that action types are handled consistently across the extension.

**What it checks:**
- All action types defined in `options.js` are handled in `content.js`
- Action type validation logic is consistent
- Form visibility toggles work for all action types

**Action types tested:**
- `observationField` - Adding observation field values
- `addComment` - Adding comments to observations
- `addTaxonId` - Adding taxon identifications
- `annotation` - Setting annotations
- `addToProject` - Adding to projects
- `qualityMetric` - Setting quality metrics
- `copyObservationField` - Copying field values
- `addToList` - Adding to personal lists
- `follow` - Following/unfollowing observations
- `reviewed` - Marking observations as reviewed

### 3. `field-properties.test.js`
Tests the critical `fieldId`, `fieldName`, and `fieldValue` properties.

**What it checks:**
- These properties are collected from the form in `options.js`
- These properties are used correctly in `content.js`
- Validation ensures all three properties are present
- CSS class names match between element creation and querying

**Why this matters:**
This test prevents the most common bug: when the setup page saves a configuration with certain property names, but the identify page expects different property names.

### 4. `configuration-schema.test.js`
Tests the structure of configuration objects stored and retrieved.

**What it checks:**
- Configuration object has all required top-level properties (name, shortcut, actions)
- Shortcut object has all modifier keys (ctrlKey, shiftKey, altKey)
- Each action type has its required properties
- Configuration storage and loading functions exist
- Configuration sets functionality is present

### 5. `save-load-cycle.test.js` ⭐ **Integration Test**
Tests the complete round-trip cycle: save → load → edit → duplicate → save again.

**What it checks:**
- All configuration properties survive the save/load cycle
- `editConfiguration` correctly populates form fields from saved data
- `duplicateConfiguration` preserves all properties
- `saveConfiguration` preserves properties not shown in the form (like `buttonHidden`)
- Action-specific properties (fieldId, fieldName, fieldValue, etc.) round-trip correctly
- Configuration sets preserve all properties through duplicate/rename operations

**Why this is critical:**
This is the test that catches the bug you described - if you add a new property to the configuration object but forget to update the edit/duplicate functions, this test will fail. It validates that the entire object lifecycle works together.

## Understanding Test Failures

### "Element exists in HTML but not referenced in JavaScript"
This means an input field exists in `options.html` but isn't being used in `options.js`. Either:
- Add the JavaScript code to use this element, or
- Remove the unused HTML element

### "Action type defined but not handled in content.js"
An action type can be selected in the setup page, but the identify page doesn't know how to execute it. You need to add a case for this action type in `content.js`.

### "Field property collected but not used"
A property is being saved from the form but never used in `content.js`. Either:
- Add code in `content.js` to use this property, or
- Stop collecting it in `options.js`

### "CSS class created but not queried" (or vice versa)
The code creates elements with a CSS class but never tries to find them (or finds elements with a class that doesn't exist). Make sure the class names match exactly.

### "Property collected during save but not populated during edit"
This means you're saving a property from the form, but when editing an existing configuration, that property isn't being loaded back into the form. This will cause data loss on edit. You need to add code in `editConfiguration` or `populateActionInputs` to restore this property.

### "Property populated during edit but not collected during save"
This means you're loading a property into the form when editing, but not collecting it when saving. The property will be lost after editing. You need to add code in `collectActionsFromForm` to save this property.

## CI/CD Integration

To run these tests automatically on every commit or pull request, add a GitHub Actions workflow:

Create `.github/workflows/test.yml`:

```yaml
name: Run Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      run: npm install
      working-directory: ./inathelperJS

    - name: Run tests
      run: npm test
      working-directory: ./inathelperJS
```

## Adding New Tests

When adding new features, update the tests:

1. **New input field?** Add it to `dom-elements.test.js`
2. **New action type?** Add it to `action-types.test.js`
3. **New configuration property?** Add it to `configuration-schema.test.js` AND `save-load-cycle.test.js`
4. **New field property for observation fields?** Add it to `field-properties.test.js`
5. **New action-specific property?** Add it to the `actionTypeProperties` object in `save-load-cycle.test.js`

## Common Patterns to Test

When making changes, ask yourself:

- [ ] Did I add a new `<input>` or `<select>` with an ID? → Test it in `dom-elements.test.js`
- [ ] Did I add a new action type? → Test it in `action-types.test.js`
- [ ] Did I change how actions are stored? → Test it in `configuration-schema.test.js`
- [ ] Did I add a new property to observation field actions? → Test it in `field-properties.test.js`
- [ ] Did I add a new property to the configuration object? → Test it in `save-load-cycle.test.js`
- [ ] Did I modify `saveConfiguration`, `editConfiguration`, or `duplicateConfiguration`? → Run `save-load-cycle.test.js` to ensure nothing broke

## Limitations

These tests are **static code analysis** tests. They check that:
- Element IDs exist in HTML and are referenced in JavaScript
- Properties collected in setup page are used in identify page
- Action types have handlers

They do **not** test:
- Runtime behavior (e.g., does the button actually work?)
- API calls to iNaturalist
- Browser extension APIs
- User interactions

For full end-to-end testing, you would need additional tools like Selenium or Puppeteer.

## Maintenance

Run these tests before every release and whenever you:
- Add or rename input fields
- Add new action types
- Change configuration storage format
- Refactor form handling code

Keep the tests up to date as the codebase evolves.