let map;
let activeDrawTool = null;
let tooltipsEnabled = false;

document.addEventListener('DOMContentLoaded', function() {
    const addTaxonButton = document.getElementById('addTaxonButton');
    const addUserButton = document.getElementById('addUserButton');
    const addProjectButton = document.getElementById('addProjectButton');
    const addPlaceButton = document.getElementById('addPlaceButton');
    const addObservationFieldButton = document.getElementById('addObservationFieldButton');
    const addAnnotationButton = document.getElementById('addAnnotationButton');
    const addIdTaxonButton = document.getElementById('addIdTaxonButton');
    const addIdentifierButton = document.getElementById('addIdentifierButton');
    setupDateSelector('observed');
    setupDateSelector('added');

    populateCustomLists();
  
    // Check if all buttons are found
    if (!addTaxonButton) console.error('addTaxonButton not found');
    if (!addUserButton) console.error('addUserButton not found');
    if (!addProjectButton) console.error('addProjectButton not found');
    if (!addPlaceButton) console.error('addPlaceButton not found');
    if (!addObservationFieldButton) console.error('addObservationFieldButton not found');
    if (!addAnnotationButton) console.error('addAnnotationButton not found');

    addTaxonButton.addEventListener('click', () => addField('taxon'));
    addUserButton.addEventListener('click', () => addField('user'));
    addProjectButton.addEventListener('click', () => addField('project'));
    addPlaceButton.addEventListener('click', () => addField('place'));
    addObservationFieldButton.addEventListener('click', () => addField('observationField'));
    addAnnotationButton.addEventListener('click', () => addField('annotation'));
    addIdTaxonButton.addEventListener('click', () => addField('idTaxon'));
    addIdentifierButton.addEventListener('click', () => addField('identifier'));
   
    const filtersFieldset = document.getElementById('additionalFilters');

    const toggleFiltersButton = document.getElementById('toggleFilters');
    const toggleAdditionalParamsButton = document.getElementById('toggleAdditionalParams');
    const additionalParamsFieldset = document.getElementById('additionalParams');

    function setupCollapsible(toggleButton, fieldset) {
        toggleButton.addEventListener('click', function() {
          fieldset.classList.toggle('collapsed');
          this.textContent = fieldset.classList.contains('collapsed') 
            ? this.textContent.replace('▲', '▼')
            : this.textContent.replace('▼', '▲');
          
          // If this is the geographic fieldset, refresh the map after a short delay
          if (fieldset.id === 'geographicFieldset') {
            setTimeout(refreshMap, 100);  // Short delay to allow DOM to update
          }
        });
      }

    setupCollapsible(toggleFiltersButton, filtersFieldset);
    setupCollapsible(toggleAdditionalParamsButton, additionalParamsFieldset);
    setupCollapsible(toggleCategories, categoriesFieldset);
    setupCollapsible(toggleSortingRanking, sortingRankingFieldset);
    setupCollapsible(document.getElementById('toggleGeographic'), document.getElementById('geographicFieldset'));
    setupMap();
    setupMapObserver();

    const newInputs = [
        'listIdInput', 'descriptionTagInput', 'accountAgeMin', 'accountAgeMax',
        'noPhotosToggle', 'noSoundsToggle', 'hasIdentificationsToggle'
    ];

    newInputs.forEach(inputId => {
        const element = document.getElementById(inputId);
        if (element) {
        element.addEventListener('change', generateURL);
        }
    });

    // Add event listeners for license checkboxes
    const licenseCheckboxes = document.querySelectorAll('#photoLicenses input, #soundLicenses input');
    licenseCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', generateURL);
    });
  
      // Add event listeners for the search_on radio buttons
      document.querySelectorAll('input[name="searchOn"]').forEach(radio => {
        radio.addEventListener('change', generateURL);
    });
    document.querySelectorAll('input[name="geoSearchType"]').forEach(radio => {
        radio.addEventListener('change', toggleGeoInputs);
    });

    document.querySelectorAll('input[name="accType"]').forEach(radio => {
        radio.addEventListener('change', toggleAccInputs);
    });
    
    document.getElementById('generateUrlButton').addEventListener('click', function(e) {
        e.preventDefault();
        const url = generateURL();
        const link = document.createElement('a');
        link.href = url;  // Use the url directly, without additional encoding
        link.target = '_blank';
        link.textContent = url;
        /*generatedUrlDiv.innerHTML = '';
        generatedUrlDiv.appendChild(link); */
    });

    const geoInputs = [
        'nelat', 'nelng', 'swlat', 'swlng', 'lat', 'lng', 'radius',
        'accAbove', 'accBelow'
      ];
      geoInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', generateURL);
      });
    
      document.querySelectorAll('input[name="geoprivacy"], input[name="taxonGeoprivacy"]').forEach(radio => {
        radio.addEventListener('change', generateURL);
      });

    setupToggleListeners();
    
    const allRightsReserved = document.getElementById('allRightsReserved');
    const otherLicenses = document.querySelectorAll('#photoLicenses input:not(#allRightsReserved)');

    allRightsReserved.addEventListener('change', function() {
        if (this.checked) {
            otherLicenses.forEach(checkbox => {
                checkbox.checked = false;
                checkbox.disabled = true;
            });
        } else {
            otherLicenses.forEach(checkbox => {
                checkbox.disabled = false;
            });
        }
    });

    otherLicenses.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                allRightsReserved.checked = false;
            }
        });
    });
    // Load saved inputs when the page loads
    loadInputs();

    // Save inputs when the page is about to unload
    window.addEventListener('beforeunload', saveInputs);

    // Add event listener for the reset button
    const resetButton = document.getElementById('resetButton');
    if (resetButton) {
        resetButton.addEventListener('click', function(e) {
            e.preventDefault(); // Prevent form submission
            resetForm();
        });
    } else {
        console.error('Reset button not found');
    }
       
    // Add event listeners to save state when inputs change  
    document.querySelectorAll('input, select, textarea').forEach(input => {
        input.addEventListener('change', saveInputs);
    });

    document.addEventListener('DOMContentLoaded', function() {
        const container = document.getElementById('actionsContainer');
        if (container) {
            container.querySelectorAll('.action-box').forEach(setupActionBoxToggle);
        }
    });

    // Add event listeners to all form elements
    document.querySelectorAll('input, select, textarea').forEach(element => {
        if (element.tagName === 'SELECT') {
            element.addEventListener('change', generateURL);
        } else {
            element.addEventListener('input', generateURL);
            element.addEventListener('change', generateURL);
        }
    });

    // Event delegation for selects in dynamic containers
    document.getElementById('actionsContainer').addEventListener('change', function(e) {
        if (e.target.tagName === 'SELECT') {
            generateURL();
        }
    });

    // Handle button clicks
    document.getElementById('exploreButton').addEventListener('click', async function(e) {
        e.preventDefault();
        const queryString = await generateURL();
        window.open('https://www.inaturalist.org/observations?' + queryString, '_blank');
    });
    
    document.getElementById('identifyButton').addEventListener('click', async function(e) {
        e.preventDefault();
        const queryString = await generateURL();
        window.open('https://www.inaturalist.org/observations/identify?' + queryString, '_blank');
    });

    // Phenology prediction button handler
    let savedPhenoUrl = null;
    const phenoPredictButton = document.getElementById('phenoPredictButton');
    const saveForComparisonButton = document.getElementById('saveForComparisonButton');
    const comparisonModeToggle = document.getElementById('comparisonModeToggle');
    const phenoUrlStorage = document.getElementById('phenoUrlStorage');
    const savedUrl1Display = document.getElementById('savedUrl1Display');
    const compareButton = document.getElementById('compareWithCurrentButton');
    const clearButton = document.getElementById('clearSavedUrlButton');

    // Toggle comparison mode
    comparisonModeToggle.addEventListener('change', function() {
        if (this.checked) {
            saveForComparisonButton.style.display = 'block';
            // Increase padding for comparison mode UI
            document.body.style.paddingBottom = '450px';
        } else {
            saveForComparisonButton.style.display = 'none';
            // Clear saved URL if disabling comparison mode
            savedPhenoUrl = null;
            phenoUrlStorage.style.display = 'none';
            // Reset body padding
            document.body.style.paddingBottom = '200px';
        }
    });

    // Main button: Always predicts phenology with current URL
    phenoPredictButton.addEventListener('click', async function(e) {
        e.preventDefault();
        const queryString = await generateURL();
        const fullUrl = 'https://api.inaturalist.org/v1/observations?' + queryString;
        window.open('phenoPredictor.html?url1=' + encodeURIComponent(fullUrl), '_blank');
    });

    // Save for comparison button: Saves URL 1 for comparison
    saveForComparisonButton.addEventListener('click', async function(e) {
        e.preventDefault();
        const queryString = await generateURL();
        const fullUrl = 'https://api.inaturalist.org/v1/observations?' + queryString;

        savedPhenoUrl = fullUrl;
        savedUrl1Display.textContent = queryString.substring(0, 100) + '...';
        phenoUrlStorage.style.display = 'block';
        // Don't hide the button - keep it visible so user can save a new URL 1

        // Scroll to show the comparison box
        setTimeout(() => {
            phenoUrlStorage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    });

    compareButton.addEventListener('click', async function(e) {
        e.preventDefault();
        const queryString = await generateURL();
        const url2 = 'https://api.inaturalist.org/v1/observations?' + queryString;
        openPhenoComparison(savedPhenoUrl, url2);
    });

    clearButton.addEventListener('click', function(e) {
        e.preventDefault();
        savedPhenoUrl = null;
        phenoUrlStorage.style.display = 'none';
        saveForComparisonButton.style.display = 'none';

        // Reset body padding
        document.body.style.paddingBottom = '200px';
    });

    function openPhenoComparison(url1, url2) {
        const phenoUrl = `phenoPredictor.html?url1=${encodeURIComponent(url1)}&url2=${encodeURIComponent(url2)}`;
        window.open(phenoUrl, '_blank');
        // Clear saved state after comparison
        savedPhenoUrl = null;
        phenoUrlStorage.style.display = 'none';
        phenoPredictButton.textContent = 'Predict Phenology';
        phenoPredictButton.style.background = '';
    }

    const actionsContainer = document.getElementById('actionsContainer');
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' || 
                (mutation.type === 'characterData' && mutation.target.parentNode && mutation.target.parentNode.tagName === 'INPUT')) {
                generateURL();
            }
            // Also check for changes to readonly ID inputs which get populated by autocomplete
            if (mutation.target.tagName === 'INPUT' && mutation.target.hasAttribute('readonly')) {
                generateURL();
            }
        });
    });

    observer.observe(actionsContainer, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true
    });

    // Generate URL initially
    generateURL();
});

function toggleGeoInputs() {
    const boundingBoxInputs = document.getElementById('boundingBoxInputs');
    const circleInputs = document.getElementById('circleInputs');
    if (this.value === 'boundingBox') {
      boundingBoxInputs.style.display = 'block';
      circleInputs.style.display = 'none';
    } else {
      boundingBoxInputs.style.display = 'none';
      circleInputs.style.display = 'block';
    }
    generateURL();
  }
  

function toggleAccInputs() {
    const accInputs = document.getElementById('accInputs');
    accInputs.style.display = (this.value !== 'any' && this.value !== 'false') ? 'block' : 'none';
    generateURL();
}


function setupDateSelector(type) {
    const dateTypeInputs = document.querySelectorAll(`input[name="${type}DateType"]`);
    const containers = {
        exact: document.getElementById(`${type}ExactDateContainer`),
        range: document.getElementById(`${type}RangeDateContainer`),
        months: document.getElementById(`${type}MonthsContainer`),
        years: document.getElementById(`${type}YearsContainer`)
    };
    const monthCheckboxes = document.getElementById(`${type}MonthCheckboxes`);
    const yearSelect = document.getElementById(`${type}YearSelect`);

    if (!monthCheckboxes || !yearSelect) {
        console.error(`Required elements not found for ${type} date selector`);
        return;
    }

    // Populate month checkboxes
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    monthCheckboxes.innerHTML = ''; // Clear existing checkboxes
    months.forEach((month, index) => {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `${type}Month${index + 1}`;
        checkbox.value = index + 1;
        const label = document.createElement('label');
        label.htmlFor = `${type}Month${index + 1}`;
        label.textContent = month;
        monthCheckboxes.appendChild(checkbox);
        monthCheckboxes.appendChild(label);
        monthCheckboxes.appendChild(document.createElement('br'));
    });

    // Populate year select
    yearSelect.innerHTML = ''; // Clear existing options
    const currentYear = new Date().getFullYear();
    for (let year = currentYear; year >= 1900; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    }

    // Handle radio button changes
    dateTypeInputs.forEach(input => {
        input.addEventListener('change', function() {
            Object.values(containers).forEach(container => {
                if (container) container.style.display = 'none';
            });
            if (this.value in containers && containers[this.value]) {
                containers[this.value].style.display = 'block';
            }
        });
    });

    // Handle Select All / Deselect All for months
    const selectAllButton = document.getElementById(`selectAll${type.charAt(0).toUpperCase() + type.slice(1)}Months`);
    const deselectAllButton = document.getElementById(`deselectAll${type.charAt(0).toUpperCase() + type.slice(1)}Months`);
    
    if (selectAllButton) {
        selectAllButton.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent form submission
            monthCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
        });
    } else {
        console.error(`Select All button not found for ${type} date selector`);
    }
    
    if (deselectAllButton) {
        deselectAllButton.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent form submission
            monthCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        });
    } else {
        console.error(`Deselect All button not found for ${type} date selector`);
    }
}



function addField(type) {
    const container = document.getElementById('actionsContainer');
    const fieldCount = container.querySelectorAll('.action-box').length;
    const actionBox = document.createElement('div');
    actionBox.className = 'action-box';

    const actionType = document.createElement('div');
    actionType.className = 'action-type';
    actionType.textContent = type;
    actionBox.appendChild(actionType);

    const fieldGroup = document.createElement('div');
    fieldGroup.className = 'field-group';

    if (type === 'taxon') {
        fieldGroup.innerHTML = `
            <input type="text" id="${type}${fieldCount}" placeholder="Enter Taxon Name (or ID)">
            <input type="text" id="${type}Id${fieldCount}" placeholder="${type} ID" readonly>
            <button class="removeFieldButton">Remove</button>
            <label><input type="checkbox" class="negationCheckbox"> Without</label>
            <label data-tooltip="Match/exclude only this exact taxon, not its descendants"><input type="checkbox" class="exactCheckbox"> Exact</label>
        `;
        } else if (type === 'idTaxon') {
            fieldGroup.innerHTML = `
                <input type="text" id="${type}${fieldCount}" placeholder="Enter ID taxon (name or ID)">
                <input type="text" id="${type}Id${fieldCount}" placeholder="ID Taxon ID" readonly>
                <button class="removeFieldButton">Remove</button>
                <label><input type="checkbox" class="negationCheckbox"> Without</label>
            `;
    } else if (type === 'project') {
        fieldGroup.innerHTML = `
            <input type="text" id="${type}${fieldCount}" placeholder="Enter ${type}">
            <input type="text" id="${type}Id${fieldCount}" placeholder="${type} ID" readonly>
            <button class="removeFieldButton">Remove</button>
            <label data-tooltip="If selected with Follows Project Rules, filters for observations that violate the rules"><input type="checkbox" class="negationCheckbox"> Without</label>
            <label><input type="checkbox" class="rulesCheckbox"> Follows Project Rules</label>
        `;
    } else if (type === 'annotation') {
        fieldGroup.innerHTML = `
            <select class="annotationField">
                <option value="">Select Field</option>
            </select>
            <select class="annotationValue" disabled>
                <option value="">Select Value</option>
            </select>
            <button class="removeFieldButton">Remove</button>
            <label><input type="checkbox" class="negationCheckbox"> Without</label>
            <span class="negationNote" style="display:none; color: #888; font-style: italic;">No value: selects obs. blank for this annotation. With value: selects obs. with other values, not blank.</span>
        `;
        setupAnnotationDropdowns(fieldCount);
    } else if (type === 'observationField') {
        fieldGroup.innerHTML = `
            <input type="text" id="${type}${fieldCount}" placeholder="Enter ${type}">
            <input type="text" id="${type}Id${fieldCount}" placeholder="${type} ID" readonly>
            <div class="fieldValueContainer"></div>
            <div class="fieldDescription"></div>
            <button class="removeFieldButton">Remove</button>
            <label><input type="checkbox" class="negationCheckbox"> Without</label>
            <span class="negationNote" style="display:none; color: #888; font-style: italic;">Selects obs. without this field. Specific value exclusion not supported.</span>   
        `;
    } else {
        fieldGroup.innerHTML = `
            <input type="text" id="${type}${fieldCount}" placeholder="Enter ${type}">
            <input type="text" id="${type}Id${fieldCount}" placeholder="${type} ID" readonly>
            <button class="removeFieldButton">Remove</button>
            <label><input type="checkbox" class="negationCheckbox"> Without</label>
        `;
    }

    console.log(`Adding field of type: ${type}`);
    actionBox.appendChild(fieldGroup);
    container.appendChild(actionBox);

    if (type === 'annotation') {
        setupAnnotationDropdowns(fieldCount);
    } else if (type === 'idTaxon' || type === 'taxon') {
        setupTaxonAutocomplete(
            fieldGroup.querySelector(`#${type}${fieldCount}`),
            fieldGroup.querySelector(`#${type}Id${fieldCount}`)
        );
    } else if (type === 'identifier') {
        setupAutocompleteDropdown(
            fieldGroup.querySelector(`#${type}${fieldCount}`),
            lookupUser,
            (result) => {
                fieldGroup.querySelector(`#${type}Id${fieldCount}`).value = result.id;
            }
        );
    } else if (type === 'observationField') {
        const nameInput = fieldGroup.querySelector(`#${type}${fieldCount}`);
        const idInput = fieldGroup.querySelector(`#${type}Id${fieldCount}`);
        const valueContainer = fieldGroup.querySelector('.fieldValueContainer');
        const descriptionElement = fieldGroup.querySelector('.fieldDescription');
        setupFieldAutocomplete(nameInput, idInput, valueContainer, descriptionElement);
        valueContainer.addEventListener('change', generateURL);
    } else {
        setupAutocomplete(type, fieldCount);
    }

    fieldGroup.querySelector('.removeFieldButton').addEventListener('click', removeField);
    fieldGroup.querySelector('.negationCheckbox').addEventListener('change', toggleNegation);
    
    // Add this directly instead of the recursive redefinition
    setupActionBoxToggle(actionBox);  // Note: actionBox, not lastActionBox

    console.log(`Field added: `, fieldGroup);
    saveInputs();
}

document.getElementById('actionsContainer').addEventListener('change', saveInputs);

function setupAutocomplete(type, index) {
    let input = document.getElementById(`${type}${index}`);
    let idInput = document.getElementById(`${type}Id${index}`);

    if (!input || !idInput) {
        console.error(`Input elements not found for ${type}${index}`);
        return;
    }

    console.log(`Setting up autocomplete for type ${type} with index ${index}`);

    if (type === 'taxon') {
        setupTaxonAutocomplete(input, idInput);
    } else {
        setupAutocompleteDropdown(input, window[`lookup${type.charAt(0).toUpperCase() + type.slice(1)}`], (result) => {
            idInput.value = result.id;
            input.value = result.name || result.title || result.login;
            console.log(`Autocomplete selection for ${type}:`, { value: input.value, id: idInput.value });
            console.log(`ID input (${type}Id${index}) value set to:`, idInput.value);
        });
    }

    input.addEventListener('input', () => {
        if (input.value === '') {
            idInput.value = '';
            console.log(`Cleared ID for ${type}${index}`);
            clearFieldFromUrl(input.id);
        } else {
            generateURL();
        }
    });
}

function setupAnnotationDropdowns(index) {
    const fieldGroup = document.querySelectorAll('.field-group')[index];
    if (!fieldGroup) {
        console.error('Field group not found for index:', index);
        return;
    }

    const fieldSelect = fieldGroup.querySelector('.annotationField');
    const valueSelect = fieldGroup.querySelector('.annotationValue');

    if (!fieldSelect || !valueSelect) {
        console.error('Annotation selects not found in field group:', fieldGroup);
        return;
    }

    // Populate annotation fields
    Object.entries(controlledTerms).forEach(([term, data]) => {
        const option = document.createElement('option');
        option.value = data.id;
        option.textContent = term;
        fieldSelect.appendChild(option);
    });

    fieldSelect.addEventListener('change', () => {
        const selectedField = controlledTerms[fieldSelect.options[fieldSelect.selectedIndex].text];
        valueSelect.innerHTML = '<option value="">Select Value</option>';
        if (selectedField && fieldSelect.value !== "") {
            Object.entries(selectedField.values).forEach(([key, value]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = key;
                valueSelect.appendChild(option);
            });
            valueSelect.disabled = false;
        } else {
            valueSelect.disabled = true;
        }
        saveInputs(); // Save state when field changes
    });

    valueSelect.addEventListener('change', saveInputs); // Save state when value changes

    // Ensure value select is initially disabled
    valueSelect.disabled = true;
    fieldSelect.addEventListener('change', generateURL);
    valueSelect.addEventListener('change', generateURL);
}

function removeField(event) {
    const actionBox = event.target.closest('.action-box');
    if (actionBox) {
        actionBox.remove();
    }
    generateURL();
}

function toggleNegation(event) {
    const actionBox = event.target.closest('.action-box');
    const isNegated = event.target.checked;
    const negationNote = actionBox.querySelector('.negationNote');
    
    if (negationNote) {
        negationNote.style.display = isNegated ? 'inline' : 'none';
    }
    
    generateURL();
}

function clearFieldFromUrl(fieldName) {
    const input = document.getElementById(fieldName);
    if (input) {
        input.value = '';
        input.dataset.id = '';
    }
    generateURL();
}

function safeEncode(str) {
    // First, decode the string in case it's already encoded
    let decodedStr = decodeURIComponent(str);
    // Then, encode it properly
    return encodeURIComponent(decodedStr);
}

function processInputs(type) {
    const container = document.getElementById('actionsContainer');
    if (!container) {
        console.error('Actions container not found');
        return { ids: [], withoutIds: [], exactIds: [], withoutDirectIds: [], applyRulesIds: [], notMatchingRulesIds: [] };
    }

    const result = {
        ids: [],
        withoutIds: [],
        exactIds: [],
        withoutDirectIds: [],
        applyRulesIds: [],
        notMatchingRulesIds: []
    };

    const actionBoxes = container.querySelectorAll('.action-box');
    actionBoxes.forEach((box, index) => {
        // Skip disabled action boxes
        if (box.classList.contains('disabled')) {
            return;
        }

        const actionType = box.querySelector('.action-type');
        if (!actionType) {
            console.error(`Action type not found in box ${index}`);
            return;
        }

        if (actionType.textContent.toLowerCase() === type.toLowerCase()) {
            const input = box.querySelector(`input[id^="${type}"]`);
            const idInput = box.querySelector(`input[id^="${type}Id"]`);
            const negationCheckbox = box.querySelector('.negationCheckbox');
            const exactCheckbox = box.querySelector('.exactCheckbox');
            const rulesCheckbox = box.querySelector('.rulesCheckbox');

            if (input && idInput && idInput.value) {
                const negated = negationCheckbox ? negationCheckbox.checked : false;
                const exact = exactCheckbox ? exactCheckbox.checked : false;
                const applyRules = rulesCheckbox ? rulesCheckbox.checked : false;

                if (negated) {
                    if (type === 'taxon' && exact) {
                        result.withoutDirectIds.push(idInput.value);
                    } else if (type === 'project' && applyRules) {
                        result.notMatchingRulesIds.push(idInput.value);
                    } else {
                        result.withoutIds.push(idInput.value);
                    }
                } else if (exact) {
                    result.exactIds.push(idInput.value);
                } else if (applyRules) {
                    result.applyRulesIds.push(idInput.value);
                } else {
                    result.ids.push(idInput.value);
                }
            }
        }
    });

    return result;
}

async function generateURL() {
    console.log('Generating URL...');
    let url = 'https://www.inaturalist.org/observations/identify?';
    let params = [];

    // Get selected observations first
    const selectedObservations = await getSelectedObservations();
    if (selectedObservations.length > 0) {
        params.push(`id=${selectedObservations.join(',')}`);
    }

     // Quality Grade
     const qualityGrades = Array.from(document.querySelectorAll('input[name="quality_grade"]:checked'))
     .map(input => input.value);
    if (qualityGrades.length > 0) {
        params.push(`quality_grade=${qualityGrades.join(',')}`);
    }

    // Reviewed Status
    const reviewedStatus = document.querySelector('input[name="reviewed"]:checked');
    if (reviewedStatus) {
        params.push(`reviewed=${encodeURIComponent(reviewedStatus.value)}`);
        console.log('Added reviewed status:', params[params.length - 1]);
    }

    // Handle toggles
    const toggles = ['captive', 'sounds', 'photos', 'threatened', 'introduced', 'native', 'popular', 'identified', 'description', 'tags', 'geo', 'mappable'];

    toggles.forEach(toggle => {
        const selectedValue = document.querySelector(`input[name="${toggle}"]:checked`).value;
        if (selectedValue !== 'any') {
            params.push(`${toggle}=${selectedValue}`);
        }
    });
    
    const types = ['taxon', 'idTaxon', 'user', 'identifier', 'project', 'place'];
    types.forEach(type => {
        const { ids, withoutIds, exactIds, withoutDirectIds, applyRulesIds, notMatchingRulesIds } = processInputs(type);
        
        if (ids.length > 0) {
            switch(type) {
                case 'idTaxon':
                    const isExclusive = document.getElementById('idTaxonExclusive').checked;
                    const encodedIds = ids.map(id => encodeURIComponent(id)).join(',');
                    params.push(`ident_taxon_id${isExclusive ? '_exclusive' : ''}=${encodedIds}`);
                    break;
                case 'identifier':
                    params.push(`ident_user_id=${encodeURIComponent(ids.join(','))}`);
                    break;
                case 'project':
                    params.push(`project_id=${encodeURIComponent(ids.join(','))}`);
                    break;
                default:
                    params.push(`${type}_id=${encodeURIComponent(ids.join(','))}`);
            }
            console.log(`Added ${type} ids:`, params[params.length - 1]);
        }
        if (withoutIds.length > 0) {
            let withoutParam;
            switch(type) {
                case 'place':
                    withoutParam = 'not_in_place';
                    break;
                case 'user':
                    withoutParam = 'not_user_id';
                    break;
                case 'identifier':
                    withoutParam = 'without_ident_user_id';
                    break;
                case 'project':
                    withoutParam = 'not_in_project';
                    break;
                case 'taxon':
                    withoutParam = 'without_taxon_id';
                    break;
                case 'idTaxon':
                    withoutParam = 'without_ident_taxon_id';
                    break;
            }
            params.push(`${withoutParam}=${encodeURIComponent(withoutIds.join(','))}`);
            console.log(`Added ${type} without ids:`, params[params.length - 1]);
        }
        if (type === 'taxon') {
            if (exactIds.length > 0) {
                params.push(`exact_taxon_id=${encodeURIComponent(exactIds.join(','))}`);
                console.log(`Added exact taxon ids:`, params[params.length - 1]);
            }
            if (withoutDirectIds.length > 0) {
                params.push(`without_direct_taxon_id=${encodeURIComponent(withoutDirectIds.join(','))}`);
                console.log(`Added without direct taxon ids:`, params[params.length - 1]);
            }
        }
        if (type === 'project') {
            if (applyRulesIds.length > 0) {
                params.push(`apply_project_rules_for=${encodeURIComponent(applyRulesIds.join(','))}`);
                console.log(`Added apply project rules ids:`, params[params.length - 1]);
            }
            if (notMatchingRulesIds.length > 0) {
                params.push(`not_matching_project_rules_for=${encodeURIComponent(notMatchingRulesIds.join(','))}`);
                console.log(`Added not matching project rules ids:`, params[params.length - 1]);
            }
        }
    });

    // dates
    addDateParams('observed', params);
    addDateParams('added', params);

    // Observation Field
    const ofInputs = document.querySelectorAll('#actionsContainer .action-box');
    ofInputs.forEach((box) => {
        // Skip if box is disabled
        if (box.classList.contains('disabled')) {
            return;
        }

        const actionType = box.querySelector('.action-type');
        if (actionType && actionType.textContent.toLowerCase() === 'observationfield') {
            const fieldNameInput = box.querySelector(`input[id^="observationField"]`);
            const fieldValueInput = box.querySelector('.fieldValue');
            const negated = box.querySelector('.negationCheckbox').checked;
            
            if (fieldNameInput && fieldNameInput.value) {
                const fieldName = safeEncode(fieldNameInput.value);
                
                if (negated) {
                    params.push(`without_field=${fieldName}`);
                } else {
                    if (fieldValueInput && fieldValueInput.value) {
                        // If it's a taxon input, use the stored taxonId from the dataset
                        if (fieldValueInput.dataset && fieldValueInput.dataset.taxonId) {
                            params.push(`field:${fieldName}=${fieldValueInput.dataset.taxonId}`);
                        } else {
                            // For non-taxon fields, use the value directly
                            const fieldValue = safeEncode(fieldValueInput.value);
                            params.push(`field:${fieldName}=${fieldValue}`);
                        }
                    } else {
                        // Add field without value requirement
                        params.push(`field:${fieldName}`);
                    }
                }
            }
        }
    });

    // Annotation
    const annotationInputs = document.querySelectorAll('#actionsContainer .action-box');
    annotationInputs.forEach((box) => {
        // Skip if box is disabled
        if (box.classList.contains('disabled')) {
            return;
        }

        const actionType = box.querySelector('.action-type');
        if (actionType && actionType.textContent.toLowerCase() === 'annotation') {
            const fieldSelect = box.querySelector('.annotationField');
            const valueSelect = box.querySelector('.annotationValue');
            const negated = box.querySelector('.negationCheckbox').checked;
            
            if (fieldSelect && fieldSelect.value) {
                if (negated) {
                    if (valueSelect && valueSelect.value) {
                        params.push(`term_id=${encodeURIComponent(fieldSelect.value)}`);
                        params.push(`without_term_value_id=${encodeURIComponent(valueSelect.value)}`);
                    } else {
                        params.push(`without_term_id=${encodeURIComponent(fieldSelect.value)}`);
                    }
                } else {
                    params.push(`term_id=${encodeURIComponent(fieldSelect.value)}`);
                    if (valueSelect && valueSelect.value) {
                        params.push(`term_value_id=${encodeURIComponent(valueSelect.value)}`);
                    }
                }
            }
        }
    });

    // List ID
    const listId = document.getElementById('listIdInput').value.trim();
    if (listId) {
        params.push(`list_id=${encodeURIComponent(listId)}`);
    }

    // Description/Tag Search
    const descriptionTag = document.getElementById('descriptionTagInput').value.trim();
    if (descriptionTag) {
        params.push(`q=${encodeURIComponent(descriptionTag)}`);
        
        const searchOn = document.querySelector('input[name="searchOn"]:checked').value;
        if (searchOn !== 'all') {
            params.push(`search_on=${searchOn}`);
        }
    }

    // Account Age
    const accountAgeMin = document.getElementById('accountAgeMin').value;
    const accountAgeMax = document.getElementById('accountAgeMax').value;
    if (accountAgeMin) params.push(`user_after=${accountAgeMin}w`);
    if (accountAgeMax) params.push(`user_before=${accountAgeMax}w`);

    // Photo Licenses
    const photoLicenses = Array.from(document.querySelectorAll('#photoLicenses input:checked:not(#allRightsReserved)'))
        .map(input => input.value);
    const allRightsReserved = document.getElementById('allRightsReserved').checked;

    if (allRightsReserved) {
        params.push('photo_licensed=false');
    } else if (photoLicenses.length > 0) {
        params.push(`photo_license=${photoLicenses.join(',')}`);
    }

    // Sound Licenses
    const soundLicenses = Array.from(document.querySelectorAll('#soundLicenses input:checked'))
        .map(input => input.value);
    if (soundLicenses.length > 0) {
        params.push(`sound_license=${soundLicenses.join(',')}`);
    }

      // Sorting
      const sortBy = document.getElementById('sortBy').value;
        const sortOrder = document.getElementById('sortOrder').value;
        if (sortBy && sortBy !== 'created_at') {  // Only add if it's not the default value
            params.push(`order_by=${sortBy}`);
        }
        if (sortOrder === 'asc') {  // Only add if it's not the default (descending)
            params.push(`order=asc`);
        }
  
      // Ranking
      const rankHigh = document.getElementById('rankHigh').value;
      const rankLow = document.getElementById('rankLow').value;
      if (rankHigh) {
          params.push(`hrank=${rankHigh}`);
      }
      if (rankLow) {
          params.push(`lrank=${rankLow}`);
      }
  
      // Results per page
      const perPage = document.getElementById('perPage').value;
      if (perPage && perPage !== '30') {  // Only add if it's not the default value
          params.push(`per_page=${perPage}`);
      }

    // Categories
    const categories = Array.from(document.querySelectorAll('input[name="categories"]:checked'))
                            .map(checkbox => checkbox.value);
    if (categories.length > 0) {
        params.push(`iconic_taxa=${categories.join(',')}`);
    }

    // Observation Sources
        const observationSources = Array.from(document.querySelectorAll('#observationSources input:checked:not([value="any"])'))
        .map(checkbox => checkbox.value);
    
    if (observationSources.length > 0) {
        params.push(`oauth_application_id=${observationSources.join(',')}`);
    }

    // Add geographic parameters
    const boundingBoxInputs = document.getElementById('boundingBoxInputs');
    const circleInputs = document.getElementById('circleInputs');

    if (boundingBoxInputs.style.display !== 'none') {
        const nelat = document.getElementById('nelat').value;
        const nelng = document.getElementById('nelng').value;
        const swlat = document.getElementById('swlat').value;
        const swlng = document.getElementById('swlng').value;
        if (nelat && nelng && swlat && swlng) {
            params.push(`nelat=${nelat}&nelng=${nelng}&swlat=${swlat}&swlng=${swlng}`);
        }
    } else if (circleInputs.style.display !== 'none') {
        const lat = document.getElementById('lat').value;
        const lng = document.getElementById('lng').value;
        const radius = document.getElementById('radius').value;
        if (lat && lng && radius) {
            params.push(`lat=${lat}&lng=${lng}&radius=${radius}`);
        }
    }


  // Add accuracy parameters
  const accType = document.querySelector('input[name="accType"]:checked');
  if (accType && accType.value !== 'any') {
    params.push(`acc=${accType.value}`);
    if (accType.value === 'true') {
      const accAbove = document.getElementById('accAbove').value;
      const accBelow = document.getElementById('accBelow').value;
      if (accAbove) params.push(`acc_above=${accAbove}`);
      if (accBelow) params.push(`acc_below=${accBelow}`);
    }
  }

  // Add geoprivacy parameters
  const geoprivacy = document.querySelector('input[name="geoprivacy"]:checked');
  if (geoprivacy) {
    params.push(`geoprivacy=${geoprivacy.value}`);
  }

  const taxonGeoprivacy = document.querySelector('input[name="taxonGeoprivacy"]:checked');
  if (taxonGeoprivacy) {
    params.push(`taxon_geoprivacy=${taxonGeoprivacy.value}`);
  }
    
  const rawUrl = url + params.join('&');
  console.log('Raw generated URL:', rawUrl);

    const queryString = params.join('&');
    console.log('Generated query string:', queryString);

    // Update the plain text URL output
    const plainUrlText = document.getElementById('plainUrlText');
    plainUrlText.value = queryString;

    // Update the button URLs
    const exploreButton = document.getElementById('exploreButton');
    const identifyButton = document.getElementById('identifyButton');
    
    exploreButton.href = 'https://www.inaturalist.org/observations?' + queryString;
    identifyButton.href = 'https://www.inaturalist.org/observations/identify?' + queryString;

    // Show the URL outputs
    document.getElementById('urlOutputs').style.display = 'block';

    return queryString;
}

function setupUserAutocomplete(input, idInput) {
    setupAutocompleteDropdown(input, lookupUser, (result) => {
        idInput.value = result.id;
        input.value = result.login;
    });
}

function setupProjectAutocomplete(input, idInput) {
    setupAutocompleteDropdown(input, lookupProject, (result) => {
        idInput.value = result.id;
        input.value = result.title;
    });
}


function addDateParams(type, params) {
    const dateType = document.querySelector(`input[name="${type}DateType"]:checked`);
    if (!dateType || dateType.value === 'any') return; // Exit if type is 'any'

    const prefix = type === 'added' ? 'created_' : '';
    
    switch(dateType.value) {
        case 'exact':
            const exactDate = document.getElementById(`${type}ExactDate`)?.value;
            if (exactDate) {
                params.push(`${prefix}d1=${exactDate}`);
                params.push(`${prefix}d2=${exactDate}`);
            }
            break;
        case 'range':
            const startDate = document.getElementById(`${type}RangeStart`)?.value;
            const endDate = document.getElementById(`${type}RangeEnd`)?.value;
            if (startDate) params.push(`${prefix}d1=${startDate}`);
            if (endDate) params.push(`${prefix}d2=${endDate}`);
            break;
        case 'months':
            const selectedMonths = Array.from(document.querySelectorAll(`#${type}MonthCheckboxes input:checked`))
                                        .map(cb => cb.value);
            if (selectedMonths.length > 0) {
                params.push(`${prefix}month=${selectedMonths.join(',')}`);
            }
            break;
        case 'years':
            const selectedYears = Array.from(document.getElementById(`${type}YearSelect`)?.selectedOptions || [])
                                       .map(option => option.value);
            if (selectedYears.length > 0) {
                const minYear = Math.min(...selectedYears);
                const maxYear = Math.max(...selectedYears);
                params.push(`${prefix}d1=${minYear}-01-01`);
                params.push(`${prefix}d2=${maxYear}-12-31`);
            }
            break;
    }

    if (type === 'added' && dateType.value !== 'any') {
        params.push(`createdDateType=${dateType.value}`);
    }
}

function setupToggleListeners() {
    const toggles = document.querySelectorAll('.toggle-group input[type="radio"]');
    toggles.forEach(toggle => {
        toggle.addEventListener('change', generateURL);
    });
}

function refreshMap() {
    if (map) {
      console.log("Refreshing map...");
      map.invalidateSize();
      map.fitWorld();  // This will ensure the map fills the container
    }
  }
  
  function setupMap() {
      console.log("Setting up map...");
      
      if (typeof L === 'undefined') {
          console.error('Leaflet is not loaded');
          return;
      }
  
      const mapContainer = document.getElementById('mapContainer');
      if (!mapContainer) {
          console.error('Map container not found');
          return;
      }
  
      // Check if map is already initialized
      if (map) {
          console.log("Map already initialized. Skipping setup.");
          return;
      }
  
      console.log("Initializing map...");
      map = L.map('mapContainer', {
          center: [0, 0],
          zoom: 2,
          zoomControl: false
      });
  
      console.log("Adding tile layer...");
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
      }).addTo(map);
  
      // Add custom controls for drawing
      const drawControl = L.control({position: 'topright'});
      drawControl.onAdd = function(map) {
          const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
          container.innerHTML = `
              <a href="#" id="drawRectangle" title="Draw Rectangle"><i class="fa fa-square-o"></i></a>
              <a href="#" id="drawCircle" title="Draw Circle"><i class="fa fa-circle-o"></i></a>
          `;
          return container;
      };
      drawControl.addTo(map);
  
      let searchLayer;
      let drawingMode = null;
      let isDrawing = false;
      let startPoint;

      function setActiveDrawTool(tool) {
        if (activeDrawTool) {
            activeDrawTool.classList.remove('active');
        }
        if (tool) {
            tool.classList.add('active');
            map.dragging.disable();
        } else {
            map.dragging.enable();
        }
        activeDrawTool = tool;
        drawingMode = tool ? tool.id === 'drawRectangle' ? 'rectangle' : 'circle' : null;
    }


        document.getElementById('drawRectangle').addEventListener('click', function(e) {
            e.preventDefault();
            setActiveDrawTool(this === activeDrawTool ? null : this);
        });

        document.getElementById('drawCircle').addEventListener('click', function(e) {
            e.preventDefault();
            setActiveDrawTool(this === activeDrawTool ? null : this);
        });

    document.getElementById('drawRectangle').addEventListener('click', function(e) {
        e.preventDefault();
        drawingMode = 'rectangle';
        setActiveDrawTool(this);
        // Don't disable dragging here
    });
    
    document.getElementById('drawCircle').addEventListener('click', function(e) {
        e.preventDefault();
        drawingMode = 'circle';
        setActiveDrawTool(this);
        // Don't disable dragging here
    });

    ['nelat', 'nelng', 'swlat', 'swlng', 'lat', 'lng', 'radius'].forEach(id => {
        document.getElementById(id).addEventListener('change', updateMapFromInputs);
    });    
  
    map.on('mousedown', function(e) {
        if (drawingMode) {
            isDrawing = true;
            startPoint = e.latlng;
            if (searchLayer) {
                map.removeLayer(searchLayer);
            }
            searchLayer = L.layerGroup().addTo(map);
        }
    });
    
    map.on('mousemove', function(e) {
        if (isDrawing && startPoint) {
            searchLayer.clearLayers();
            if (drawingMode === 'rectangle') {
                L.rectangle([startPoint, e.latlng], {color: "#ff7800", weight: 1}).addTo(searchLayer);
            } else if (drawingMode === 'circle') {
                const radius = startPoint.distanceTo(e.latlng);
                L.circle(startPoint, {radius: radius, color: 'red', fillColor: '#f03', fillOpacity: 0.5}).addTo(searchLayer);
            }
        }
    });
    
    map.on('mouseup', function(e) {
        if (isDrawing) {
            isDrawing = false;
            if (drawingMode === 'rectangle') {
                const bounds = L.latLngBounds(startPoint, e.latlng);
                updateBoundingBoxInputs(bounds);
            } else if (drawingMode === 'circle') {
                const center = startPoint;
                const radius = center.distanceTo(e.latlng);
                updateCircleInputs(center, radius);
            }
            setActiveDrawTool(null);
        }
    });
  
      // Add logging for debugging
      map.on('load', () => {
          console.log("Map load event fired");
      });
  
      map.on('tileloadstart', () => {
          console.log("Tile load started");
      });
  
      map.on('tileload', () => {
          console.log("Tile loaded");
      });
  
      map.on('tileerror', (error) => {
          console.error("Tile error:", error);
      });
  
      console.log("Map setup complete.");
      
      // Force initial map update
      setTimeout(refreshMap, 100);
  
      // Setup the observer
      setupMapObserver();
  }
  
  function refreshMap() {
      if (map) {
          console.log("Refreshing map...");
          map.invalidateSize();
          map.fitWorld();  // This will ensure the map fills the container
      } else {
          console.warn("Map not initialized yet");
      }
  }
  
  function setupMapObserver() {
      const mapContainer = document.getElementById('mapContainer');
      const geographicFieldset = document.getElementById('geographicFieldset');
  
      if (!mapContainer || !geographicFieldset) return;
  
      const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
              if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                  setTimeout(refreshMap, 100);
              }
          });
      });
  
      observer.observe(geographicFieldset, { attributes: true, attributeFilter: ['style'] });
  }

function clearInputs() {
    ['nelat', 'nelng', 'swlat', 'swlng', 'lat', 'lng', 'radius'].forEach(id => {
        document.getElementById(id).value = '';
    });
}

function updateBoundingBoxInputs(bounds) {
    clearInputs();
    document.getElementById('nelat').value = bounds.getNorthEast().lat.toFixed(6);
    document.getElementById('nelng').value = normalizeLongitude(bounds.getNorthEast().lng).toFixed(6);
    document.getElementById('swlat').value = bounds.getSouthWest().lat.toFixed(6);
    document.getElementById('swlng').value = normalizeLongitude(bounds.getSouthWest().lng).toFixed(6);
    document.getElementById('boundingBoxInputs').style.display = 'block';
    document.getElementById('circleInputs').style.display = 'none';
    document.getElementById('boundingBox').checked = true;
    generateURL();
}

function updateCircleInputs(center, radius) {
    clearInputs();
    document.getElementById('lat').value = center.lat.toFixed(6);
    document.getElementById('lng').value = normalizeLongitude(center.lng).toFixed(6);
    document.getElementById('radius').value = (radius / 1000).toFixed(2);
    document.getElementById('boundingBoxInputs').style.display = 'none';
    document.getElementById('circleInputs').style.display = 'block';
    document.getElementById('circle').checked = true;
    generateURL();
}

function updateMapFromInputs() {
    if (map && searchLayer) {
        map.removeLayer(searchLayer);
    }
    searchLayer = L.layerGroup().addTo(map);

    if (document.getElementById('boundingBox').checked) {
        const nelat = parseFloat(document.getElementById('nelat').value);
        const nelng = parseFloat(document.getElementById('nelng').value);
        const swlat = parseFloat(document.getElementById('swlat').value);
        const swlng = parseFloat(document.getElementById('swlng').value);
        
        if (nelat && nelng && swlat && swlng) {
            const rectangle = L.rectangle([[swlat, swlng], [nelat, nelng]], {color: "#ff7800", weight: 1}).addTo(searchLayer);
            map.fitBounds(rectangle.getBounds());
        }
    } else if (document.getElementById('circle').checked) {
        const lat = parseFloat(document.getElementById('lat').value);
        const lng = parseFloat(document.getElementById('lng').value);
        const radius = parseFloat(document.getElementById('radius').value) * 1000;
        
        if (lat && lng && radius) {
            const circle = L.circle([lat, lng], {radius: radius, color: 'red', fillColor: '#f03', fillOpacity: 0.5}).addTo(searchLayer);
            map.fitBounds(circle.getBounds());
        }
    }
}

document.getElementById('boundingBox').addEventListener('change', function() {
    if (this.checked) {
        document.getElementById('boundingBoxInputs').style.display = 'block';
        document.getElementById('circleInputs').style.display = 'none';
        updateMapFromInputs();
    }
});

document.getElementById('circle').addEventListener('change', function() {
    if (this.checked) {
        document.getElementById('boundingBoxInputs').style.display = 'none';
        document.getElementById('circleInputs').style.display = 'block';
        updateMapFromInputs();
    }
});

// Add event listeners to the observation sources checkboxes
document.querySelectorAll('#observationSources input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      if (this.value === 'any' && this.checked) {
        // If "Any" is checked, uncheck all other options
        document.querySelectorAll('#observationSources input:not([value="any"])').forEach(cb => {
          cb.checked = false;
        });
      } else if (this.checked) {
        // If any other option is checked, uncheck "Any"
        document.querySelector('#observationSources input[value="any"]').checked = false;
      } else if (!document.querySelectorAll('#observationSources input:checked:not([value="any"])').length) {
        // If no other options are checked, check "Any"
        document.querySelector('#observationSources input[value="any"]').checked = true;
      }
      generateURL();
    });
  });

  let tooltipEl = null;
  let tooltipTimeout = null;
  
  function setupTooltips() {
    setupTooltipToggle(); // Call this new function
    document.body.addEventListener('mouseover', handleMouseOver);
    document.body.addEventListener('mouseout', handleMouseOut);
}
  
  function handleMouseOver(e) {
    if (tooltipsEnabled && e.target.dataset.tooltip) {
        clearTimeout(tooltipTimeout);
        showTooltip(e.target);
    }
}
  
  function handleMouseOut(e) {
    if (e.target.dataset.tooltip) {
      tooltipTimeout = setTimeout(() => {
        hideTooltip();
      }, 100); // Small delay to prevent flickering
    }
  }
  
  function showTooltip(target) {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'tooltip';
      document.body.appendChild(tooltipEl);
    }
  
    tooltipEl.textContent = target.dataset.tooltip;
    positionTooltip(target);
    tooltipEl.style.opacity = '1';
    tooltipEl.style.visibility = 'visible';
  }
  
  function hideTooltip() {
    if (tooltipEl) {
      tooltipEl.style.opacity = '0';
      tooltipEl.style.visibility = 'hidden';
    }
  }
  
  function positionTooltip(target) {
    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();
    
    let top = rect.top + window.scrollY - tooltipRect.height - 10;
    let left = rect.left + (rect.width / 2);
  
    // Adjust if tooltip would go off the top of the screen
    if (top < window.scrollY) {
      top = rect.bottom + window.scrollY + 10;
    }
  
    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.transform = 'translateX(-50%)';
  }
  
  function setupTooltipToggle() {
    const toggleSwitch = document.getElementById('tooltipToggle');
    
    toggleSwitch.addEventListener('change', function() {
        tooltipsEnabled = this.checked;
        if (!tooltipsEnabled) {
            hideTooltip(); // Hide any visible tooltip
        }
    });

}

  document.addEventListener('DOMContentLoaded', setupTooltips);

  document.getElementById('copyUrlButton').addEventListener('click', function() {
    const plainUrlText = document.getElementById('plainUrlText');
    plainUrlText.select();
    document.execCommand('copy');
    alert('URL copied to clipboard!');
});

function normalizeLongitude(lng) {
    while (lng > 180) {
        lng -= 360;
    }
    while (lng < -180) {
        lng += 360;
    }
    return lng;
}

function saveInputs() {
    const savedState = JSON.parse(localStorage.getItem('urlGenState') || '{}');

    const actionsContainer = document.getElementById('actionsContainer');
    if (actionsContainer) {
        // Reset the dynamic fields array
        savedState.dynamicFields = [];
        
        actionsContainer.querySelectorAll('.action-box').forEach(actionBox => {
            const actionType = actionBox.querySelector('.action-type').textContent;
            const inputs = Array.from(actionBox.querySelectorAll('input, select'));
            
            const fieldData = {
                type: actionType,
                disabled: actionBox.classList.contains('disabled'),
                inputs: []
            };

            // For fields with name-ID pairs from lookups, ensure both values exist
            if (['taxon', 'user', 'project', 'place', 'identifier'].includes(actionType)) {
                const nameInput = inputs.find(input => input.id?.startsWith(actionType) && !input.id?.includes('Id'));
                const idInput = inputs.find(input => input.id?.includes('Id'));
                
                // Only save if both name and ID exist
                if (nameInput?.value && idInput?.value) {
                    fieldData.inputs = inputs.map(input => ({
                        type: input.type,
                        value: input.type === 'checkbox' ? input.checked : input.value,
                        id: input.id,
                        className: input.className
                    }));
                }
            } else {
                // For other field types, save all inputs as before
                fieldData.inputs = inputs.map(input => ({
                    type: input.type,
                    value: input.type === 'checkbox' ? input.checked : input.value,
                    id: input.id,
                    className: input.className
                }));
            }

            // Only add the field if we have inputs to save
            if (fieldData.inputs.length > 0) {
                savedState.dynamicFields.push(fieldData);
            }
        });
    }

    localStorage.setItem('urlGenState', JSON.stringify(savedState));
}

function loadInputs() {
    const savedState = JSON.parse(localStorage.getItem('urlGenState'));
    if (!savedState) return;

    // Load static inputs
    Object.keys(savedState.inputs || {}).forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            if (element.type === 'checkbox' || element.type === 'radio') {
                element.checked = savedState.inputs[id];
            } else {
                element.value = savedState.inputs[id];
            }
        }
    });

    // Load custom lists
    if (savedState.selectedCustomLists) {
        const container = document.getElementById('customListsContainer');
        savedState.selectedCustomLists.forEach(listId => {
            const checkbox = container.querySelector(`input[value="${listId}"]`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
    }

    // Load quality grade checkboxes
    (savedState.qualityGrade || []).forEach(value => {
        const checkbox = document.querySelector(`input[name="quality_grade"][value="${value}"]`);
        if (checkbox) checkbox.checked = true;
    });

    // Load reviewed status
    if (savedState.reviewedStatus) {
        const reviewedStatus = document.querySelector(`input[name="reviewed"][value="${savedState.reviewedStatus}"]`);
        if (reviewedStatus) reviewedStatus.checked = true;
    }

    // Load "search on" toggle
    if (savedState.searchOn) {
        const searchOn = document.querySelector(`input[name="searchOn"][value="${savedState.searchOn}"]`);
        if (searchOn) searchOn.checked = true;
    }

    // Load licenses
    if (savedState.licenses) {
        (savedState.licenses.photo || []).forEach(license => {
            const checkbox = document.querySelector(`#photoLicenses input[value="${license}"]`);
            if (checkbox) checkbox.checked = true;
        });
        (savedState.licenses.sound || []).forEach(license => {
            const checkbox = document.querySelector(`#soundLicenses input[value="${license}"]`);
            if (checkbox) checkbox.checked = true;
        });
    }

    // Load observation sources
    const anySourceCheckbox = document.querySelector('#observationSources input[value="any"]');
    let specificSourceSelected = false;
    (savedState.observationSources || []).forEach(source => {
        const checkbox = document.querySelector(`#observationSources input[value="${source}"]`);
        if (checkbox) {
            checkbox.checked = true;
            if (source !== 'any') {
                specificSourceSelected = true;
            }
        }
    });

    // Adjust the "Any" checkbox based on other selections
    if (anySourceCheckbox) {
        anySourceCheckbox.checked = !specificSourceSelected;
    }

    // Load geographic bounding box
    Object.keys(savedState.geographicBoundingBox || {}).forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.value = savedState.geographicBoundingBox[id];
        }
    });

        // Load dynamic fields with their disabled states
        const actionsContainer = document.getElementById('actionsContainer');
        if (actionsContainer && savedState.dynamicFields) {
            savedState.dynamicFields.forEach(field => {
                addField(field.type);
                const lastActionBox = actionsContainer.lastElementChild;
                
                if (field.disabled) {
                    lastActionBox.classList.add('disabled');
                }
                
                if (field.type === 'annotation') {
                    const fieldInput = field.inputs.find(i => i.className === 'annotationField');
                    const valueInput = field.inputs.find(i => i.className === 'annotationValue');
                    if (fieldInput && valueInput) {
                        setupAnnotationField(lastActionBox, fieldInput.value, valueInput.value);
                    }
                    field.inputs.forEach(inputData => {
                        if (inputData.className === 'negationCheckbox') {
                            const checkbox = lastActionBox.querySelector(`.${inputData.className}`);
                            if (checkbox) {
                                checkbox.checked = inputData.value;
                            }
                        }
                    });
                } else if (field.type === 'observationField') {
                    const fieldId = field.inputs.find(i => i.id.includes('observationFieldId'))?.value;
                    const fieldValue = field.inputs.find(i => i.className === 'fieldValue')?.value;
                    const fieldName = field.inputs.find(i => i.id.includes('observationField') && !i.id.includes('Id'))?.value;
                    
                    if (fieldId && fieldName) {
                        lookupObservationField(fieldName).then(fields => {
                            const fieldData = fields[0];
                            if (fieldData) {
                                const fieldValueContainer = lastActionBox.querySelector('.fieldValueContainer');
                                const fieldNameInput = lastActionBox.querySelector(`input[id^="observationField"]`);
                                const fieldIdInput = lastActionBox.querySelector(`input[id^="observationFieldId"]`);
                                
                                if (fieldNameInput) {
                                    fieldNameInput.value = fieldData.name;
                                }
                                if (fieldIdInput) {
                                    fieldIdInput.value = fieldData.id;
                                }
                                if (fieldValueContainer) {
                                    updateFieldValueInput(fieldData, fieldValueContainer, fieldValue);
                                }
                            }
                        });
                    }
                } else {
                    field.inputs.forEach(inputData => {
                        let input;
                        if (inputData.id && inputData.id.trim() !== '') {
                            input = lastActionBox.querySelector(`#${inputData.id}`);
                        } else if (inputData.className && inputData.className.trim() !== '') {
                            input = lastActionBox.querySelector(`.${inputData.className}`);
                        }
                        if (input) {
                            if (input.type === 'checkbox') {
                                input.checked = inputData.value;
                            } else {
                                input.value = inputData.value;
                            }
                        }
                    });
                }
            });
        }

    generateURL();
}

function resetForm() {
    // Reset static inputs
    document.querySelectorAll('input, select, textarea').forEach(input => {
        if (input.type === 'checkbox' || input.type === 'radio') {
            input.checked = input.defaultChecked;
        } else if (input.type === 'select-one' || input.type === 'select-multiple') {
            Array.from(input.options).forEach(option => {
                option.selected = option.defaultSelected;
            });
        } else {
            input.value = input.defaultValue;
        }
    });

    // Reset quality grade checkboxes
    document.querySelectorAll('input[name="quality_grade"]').forEach(checkbox => {
        checkbox.checked = checkbox.defaultChecked;
    });

    // Clear dynamic fields
    const actionsContainer = document.getElementById('actionsContainer');
    if (actionsContainer) {
        actionsContainer.innerHTML = '';
    }

    // Reset map
    if (map && searchLayer) {
        map.removeLayer(searchLayer);
        searchLayer = L.layerGroup().addTo(map);
        map.setView([0, 0], 2);
    }

    // Reset specific elements to their default states
    resetSpecificElements();

    // Clear localStorage
    localStorage.removeItem('urlGenState');

    // Regenerate the URL after resetting inputs
    generateURL();
}

function resetSpecificElements() {
    // Reset date selectors
    ['observed', 'added'].forEach(type => {
        document.querySelector(`input[name="${type}DateType"][value="any"]`).checked = true;
        document.getElementById(`${type}ExactDateContainer`).style.display = 'none';
        document.getElementById(`${type}RangeDateContainer`).style.display = 'none';
        document.getElementById(`${type}MonthsContainer`).style.display = 'none';
        document.getElementById(`${type}YearsContainer`).style.display = 'none';
    });

    // Reset geographic selectors
    document.getElementById('boundingBoxInputs').style.display = 'none';
    document.getElementById('circleInputs').style.display = 'none';
    document.querySelector('input[name="geoSearchType"][value="boundingBox"]').checked = true;
    clearInputs(); // Call the original clearInputs function to clear geographic inputs

    // Reset observation sources
    document.querySelector('#observationSources input[value="any"]').checked = true;
    document.querySelectorAll('#observationSources input:not([value="any"])').forEach(cb => {
        cb.checked = false;
    });

}

function populateCustomLists() {
    const container = document.getElementById('customListsContainer');
    container.innerHTML = ''; // Clear existing checkboxes
  
    browserAPI.storage.local.get('customLists', function(data) {
      const customLists = data.customLists || [];
      customLists.forEach(list => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'custom-list-checkbox';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `list-${list.id}`;
        checkbox.value = list.id;
        
        const label = document.createElement('label');
        label.htmlFor = `list-${list.id}`;
        label.textContent = `${list.name} (${list.observations.length} observations)`;
        
        checkboxDiv.appendChild(checkbox);
        checkboxDiv.appendChild(label);
        container.appendChild(checkboxDiv);
  
        checkbox.addEventListener('change', generateURL);
      });
    });
  }
  
function getSelectedObservations() {
    return new Promise((resolve) => {
      const container = document.getElementById('customListsContainer');
      const selectedCheckboxes = container.querySelectorAll('input[type="checkbox"]:checked');
      const selectedListIds = Array.from(selectedCheckboxes).map(checkbox => checkbox.value);
  
      browserAPI.storage.local.get('customLists', function(data) {
        const customLists = data.customLists || [];
        const selectedObservations = customLists
          .filter(list => selectedListIds.includes(list.id))
          .flatMap(list => list.observations);
  
        resolve(selectedObservations);
      });
    });
  }

  function setupAnnotationField(actionBox, savedField, savedValue) {
    const fieldSelect = actionBox.querySelector('.annotationField');
    const valueSelect = actionBox.querySelector('.annotationValue');
    
    if (!fieldSelect || !valueSelect) {
        console.error('Annotation selects not found');
        return;
    }

    // First set the field value
    fieldSelect.value = savedField;

    // Enable and populate the value select
    if (savedField) {
        valueSelect.disabled = false;
        const selectedField = controlledTerms[fieldSelect.options[fieldSelect.selectedIndex].text];
        
        if (selectedField) {
            // Clear and repopulate value options
            valueSelect.innerHTML = '<option value="">Select Value</option>';
            Object.entries(selectedField.values).forEach(([key, value]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = key;
                valueSelect.appendChild(option);
            });

            // Set the saved value after populating options
            if (savedValue) {
                valueSelect.value = savedValue;
            }
        }
    }
}

function setupActionBoxToggle(actionBox) {
    actionBox.addEventListener('click', function(e) {
        // Only toggle if clicking directly on the action-box itself or the action-type header
        if (e.target !== actionBox && e.target !== actionBox.querySelector('.action-type')) {
            return;
        }

        // Toggle the disabled state
        this.classList.toggle('disabled');
        
        // Regenerate URL and save state
        generateURL();
        saveInputs();
    });
}

function verifyNameIdConsistency() {
    const actionsContainer = document.getElementById('actionsContainer');
    if (!actionsContainer) return;

    actionsContainer.querySelectorAll('.action-box').forEach(actionBox => {
        const actionType = actionBox.querySelector('.action-type').textContent;
        
        if (['taxon', 'user', 'project', 'place', 'identifier'].includes(actionType)) {
            const nameInput = actionBox.querySelector(`input[id^="${actionType}"][id$="Id"]`);
            const idInput = actionBox.querySelector(`input[id^="${actionType}Id"]`);
            
            // If one exists without the other, clear both
            if (nameInput && idInput) {
                if ((!nameInput.value && idInput.value) || (nameInput.value && !idInput.value)) {
                    console.log(`Clearing mismatched ${actionType} field`);
                    nameInput.value = '';
                    idInput.value = '';
                }
            }
        }
    });
}