const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

function safeErrorString(error) {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    try {
        const str = safeErrorString(error);
        if (str && str !== '[object Object]') return str;
    } catch (e) {}
    return 'Unknown error';
}

const controlledTerms = {
    "Alive or Dead": {
      id: 17,
      values: {
        "Alive": 18,
        "Dead": 19,
        "Cannot Be Determined": 20
      }
    },
    "Established": {
      id: 33,
      values: {
        "Not Established": 34
      }
    },
    "Life Stage": {
      id: 1,
      values: {
        "Adult": 2,
        "Teneral": 3,
        "Pupa": 4,
        "Nymph": 5,
        "Larva": 6,
        "Egg": 7,
        "Juvenile": 8,
        "Subimago": 16
      }
    },
    "Evidence of Presence": {
      id: 22,
      values: {
        "Feather": 23,
        "Organism": 24,
        "Scat": 25,
        "Gall": 29,
        "Track": 26,
        "Bone": 27,
        "Molt": 28,
        "Egg": 30,
        "Hair": 31,
        "Leafmine": 32,
        "Construction": 35
      }
    },
    "Leaves": {
      id: 36,
      values: {
        "Breaking Leaf Buds": 37,
        "Green Leaves": 38,
        "Colored Leaves": 39,
        "No Live Leaves": 40
      }
    },
    "Sex": {
      id: 9,
      values: {
        "Female": 10,
        "Male": 11,
        "Cannot Be Determined": 20
      }
    },
    "Flowers and Fruits": {
      id: 12,
      values: {
        "Flowers": 13,
        "Fruits or Seeds": 14,
        "Flower Buds": 15,
        "No Flowers or Fruits": 21
      }
    }
};

let currentJWT = null;
const API_URL = 'https://api.inaturalist.org/v1';

function lookupTaxon(query, per_page = 10) {
    const baseUrl = 'https://api.inaturalist.org/v1/taxa/autocomplete';
    const params = new URLSearchParams({
        q: query,
        per_page: per_page
    });
    const url = `${baseUrl}?${params.toString()}`;

    return fetch(url)
        .then(response => response.json())
        .then(data => data.results.map(taxon => ({
            ...taxon,
            displayName: taxon.preferred_common_name ? `${taxon.preferred_common_name} (${taxon.name})` : taxon.name
        })));
}

function lookupProject(query, perPage = 10) {
    const baseUrl = 'https://api.inaturalist.org/v1/projects';
    const params = new URLSearchParams({
        q: query,
        per_page: perPage,
        order_by: 'observation_count',
        order: 'desc'
    });
    const url = `${baseUrl}?${params.toString()}`;

    return fetch(url)
        .then(response => response.json())
        .then(data => data.results.map(project => ({
            ...project,
            displayName: `${project.title}`
        })));
}

function lookupObservationField(name, perPage = 10) {
    return new Promise((resolve, reject) => {
        const baseUrl = 'https://api.inaturalist.org/v1/observation_fields/autocomplete';
        const params = new URLSearchParams({
            q: name,
            per_page: perPage
        });
        const url = `${baseUrl}?${params.toString()}`;

        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.results && data.results.length > 0) {
                    const fieldsWithUsage = data.results.map(field => ({
                        ...field,
                        usageCount: field.values_count || 0 // Assuming 'values_count' represents usage
                    }));
                    resolve(fieldsWithUsage);
                } else {
                    reject(new Error('No observation fields found'));
                }
            })
            .catch(reject);
    });
}

function lookupPlace(query, perPage = 10) {
    const baseUrl = 'https://api.inaturalist.org/v1/places/autocomplete';
    const params = new URLSearchParams({
        q: query,
        per_page: perPage
    });
    const url = `${baseUrl}?${params.toString()}`;

    return fetch(url)
        .then(response => response.json())
        .then(data => data.results);
}

function lookupUser(query, perPage = 10) {
    const baseUrl = 'https://api.inaturalist.org/v1/users/autocomplete';
    const params = new URLSearchParams({
        q: query,
        per_page: perPage
    });
    const url = `${baseUrl}?${params.toString()}`;

    return fetch(url)
        .then(response => response.json())
        .then(data => data.results.map(user => ({
            ...user,
            displayName: `${user.login} (${user.name || ''})`,
            icon_url: user.icon_url
        })));
}

function setupAutocompleteDropdown(inputElement, lookupFunction, onSelectFunction) {
    const suggestionContainer = document.createElement('div');
    suggestionContainer.className = 'autocomplete-suggestions';
    inputElement.parentNode.insertBefore(suggestionContainer, inputElement.nextSibling);

    let debounceTimeout;
    inputElement.addEventListener('input', () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            if (inputElement.value.length < 2) {
                suggestionContainer.innerHTML = '';
                suggestionContainer.style.display = 'none'; // Hide when input is too short
                return;
            }
            lookupFunction(inputElement.value)
            .then(results => {
                suggestionContainer.innerHTML = '';
                if (results.length > 0) {
                    suggestionContainer.style.display = 'block'; // Show when there are results
                    results.forEach(result => {
                        const suggestion = document.createElement('div');
                        suggestion.className = 'autocomplete-suggestion';
                        if (result.icon_url) {
                            suggestion.innerHTML = `<img src="${result.icon_url}" alt="${result.login}" style="width: 30px; height: 30px; margin-right: 10px;">`;
                        }
                        suggestion.innerHTML += result.displayName || result.name || result.title || result.login;
                        if (result.usageCount !== undefined) {
                            suggestion.innerHTML += ` (${result.usageCount} uses)`;
                        }
                        suggestion.addEventListener('click', () => {
                            onSelectFunction(result, inputElement);
                            inputElement.value = result.login || result.name || result.title;
                            suggestionContainer.innerHTML = '';
                            suggestionContainer.style.display = 'none'; // Hide after selection
                        });
                        suggestionContainer.appendChild(suggestion);
                    });
                } else {
                    suggestionContainer.style.display = 'none'; // Hide if no results
                }
            })
            .catch(error => {
                console.error('Error fetching suggestions:', error);
                suggestionContainer.style.display = 'none'; // Hide on error
            });
        }, 300);
    });

    // Hide suggestions when input loses focus
    inputElement.addEventListener('blur', () => {
        setTimeout(() => {
            suggestionContainer.style.display = 'none';
        }, 200); // Small delay to allow for selection
    });

    document.addEventListener('click', (event) => {
        if (!inputElement.contains(event.target) && !suggestionContainer.contains(event.target)) {
            suggestionContainer.innerHTML = '';
            suggestionContainer.style.display = 'none'; // Hide when clicking outside
        }
    });
}


function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}


function setupFieldAutocomplete(nameInput, idInput, fieldValueContainer, fieldDescriptionElement) {
    console.log('Setting up field autocomplete with:', {
        nameInput,
        idInput,
        fieldValueContainer,
        fieldDescriptionElement
    });

    setupAutocompleteDropdown(nameInput, lookupObservationField, (result) => {
        console.log('Field selected in autocomplete:', result);
        idInput.value = result.id;  // Changed from fieldIdInput to idInput
        if (fieldDescriptionElement) {
            fieldDescriptionElement.textContent = result.description || '';
        }
        updateFieldValueInput(result, fieldValueContainer);
    });
}

function setupTaxonAutocomplete(inputElement, idElement) {
    console.log('Setting up taxon autocomplete for:', inputElement);
    
    const suggestionContainer = document.createElement('div');
    suggestionContainer.className = 'taxonSuggestions';
    suggestionContainer.style.position = 'absolute';
    suggestionContainer.style.display = 'none';
    document.body.appendChild(suggestionContainer);

    let debounceTimeout;

    function showTaxonSuggestions() {
        console.log('showTaxonSuggestions called for:', inputElement.value);
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            if (inputElement.value.length < 2) {
                console.log('Input too short, hiding suggestions');
                suggestionContainer.innerHTML = '';
                suggestionContainer.style.display = 'none';
                return;
            }
            console.log('Fetching taxon suggestions for:', inputElement.value);
            lookupTaxon(inputElement.value)
                .then(taxa => {
                    console.log('Received taxa suggestions:', taxa);
                    suggestionContainer.innerHTML = '';
                    taxa.forEach(taxon => {
                        const suggestion = document.createElement('div');
                        suggestion.className = 'taxonSuggestion';
                        suggestion.innerHTML = `
                            <img src="${taxon.default_photo?.square_url || 'placeholder.jpg'}" alt="${taxon.name}">
                            <span class="taxon-name">
                                ${taxon.preferred_common_name ? `${taxon.preferred_common_name} (` : ''}
                                <a href="https://www.inaturalist.org/taxa/${taxon.id}" target="_blank" class="taxon-link">
                                    ${taxon.name}
                                </a>
                                ${taxon.preferred_common_name ? ')' : ''}
                            </span>
                        `;
                        suggestion.addEventListener('click', (event) => {
                            if (event.target.tagName !== 'A') {
                                event.preventDefault();
                                const selectedName = taxon.preferred_common_name ? 
                                    `${taxon.preferred_common_name} (${taxon.name})` : 
                                    taxon.name;
                                console.log('Taxon selected:', {
                                    name: selectedName,
                                    id: taxon.id,
                                    inputElement: inputElement,
                                    idElement: idElement,
                                    dataset: inputElement.dataset
                                });
                                inputElement.value = selectedName;
                                inputElement.dataset.taxonId = taxon.id;
                                if (idElement) idElement.value = taxon.id;
                                suggestionContainer.innerHTML = '';
                                suggestionContainer.style.display = 'none';
                                console.log('Taxon selected:', taxon.name, 'ID:', taxon.id);
                            }
                        });
                        suggestionContainer.appendChild(suggestion);
                    });

                    const inputRect = inputElement.getBoundingClientRect();
                    suggestionContainer.style.top = `${inputRect.bottom + window.scrollY}px`;
                    suggestionContainer.style.left = `${inputRect.left + window.scrollX}px`;
                    suggestionContainer.style.width = `${inputRect.width}px`;
                    suggestionContainer.style.display = 'block';
                    console.log('Showing taxon suggestions');
                })
                .catch(error => console.error('Error fetching taxa:', error));
        }, 300);
    }

    inputElement.addEventListener('input', showTaxonSuggestions);
    inputElement.addEventListener('focus', showTaxonSuggestions);
    inputElement.addEventListener('blur', () => {
        setTimeout(() => {
            console.log('Hiding taxon suggestions on blur');
            suggestionContainer.innerHTML = '';
            suggestionContainer.style.display = 'none';
        }, 200);
    });

    console.log('Taxon autocomplete setup complete for:', inputElement);
}


function updateFieldValueInput(field, container, existingValue = null) {
    console.log('Updating field value input for:', {
        field,
        container,
        existingValue
    });
    
    // Always clear the container
    container.innerHTML = '';
    console.log('Container after clearing:', container.innerHTML);
    
    let input;
    console.log('Creating input for field type:', field.datatype);

    switch (field.datatype) {
        case 'text':
        case 'date':
        case 'datetime':
        case 'time':
            input = document.createElement('input');
            input.type = field.datatype;
            break;
        case 'numeric':
            input = document.createElement('input');
            input.type = 'number';
            break;
        case 'boolean':
            input = document.createElement('select');
            ['', 'Yes', 'No'].forEach(option => {
                const opt = document.createElement('option');
                opt.value = option;
                opt.textContent = option;
                input.appendChild(opt);
            });
            break;
        case 'taxon':
            input = document.createElement('input');
            input.type = 'text';
            input.className = 'taxonInput';
            input.placeholder = 'Enter Taxon Name (or ID)';
            console.log('Setting up taxon autocomplete for field:', field);
            setupTaxonAutocomplete(input, null); 
            console.log('Created taxon input:', input);
            break;
        default:
            input = document.createElement('input');
            input.type = 'text';
    }

    input.className = 'fieldValue';
    input.placeholder = 'Field Value';
    
    if (existingValue !== null) {
        input.value = existingValue;
    }    

    console.log('Created input:', input);
    container.appendChild(input);
    console.log('Final container state:', container.innerHTML);

    // Handle allowed values
    if (field.allowed_values && field.datatype !== 'taxon') {
        console.log('Setting up allowed values for non-taxon field');
        const allowedValues = field.allowed_values.split('|');
        if (allowedValues.length > 0) {
            const datalist = document.createElement('datalist');
            datalist.id = `allowedValues-${field.id || Date.now()}`;
            allowedValues.forEach(value => {
                const option = document.createElement('option');
                option.value = value.trim();
                datalist.appendChild(option);
            });
            container.appendChild(datalist);
            input.setAttribute('list', datalist.id);
        }
    }

    console.log('Field value input updated');
    return input;
}

function setupObservationFieldAutocomplete(nameInput, idInput) {
    setupAutocompleteDropdown(nameInput, lookupObservationField, (result) => {
        idInput.value = result.id;
        const actionItem = nameInput.closest('.action-item') || nameInput.closest('.field-group');
        if (actionItem) {
            const fieldDescription = actionItem.querySelector('.fieldDescription');
            if (fieldDescription) {
                fieldDescription.textContent = result.description || '';
            }
            const fieldValueContainer = actionItem.querySelector('.fieldValueContainer');
            if (fieldValueContainer) {
                updateFieldValueInput(result, fieldValueContainer);
            }
        }
    });
}


function generateObservationURL(observationIds) {
    const baseURL = 'https://www.inaturalist.org/observations/identify?quality_grade=casual,needs_id,research&reviewed=any&verifiable=any&place_id=any';
    return `${baseURL}&per_page=${observationIds.length}&id=${observationIds.join(',')}`;
}

function removeUndoRecord(id, callback) {
    browserAPI.storage.local.get('undoRecords', function(result) {
        let undoRecords = result.undoRecords || [];
        undoRecords = undoRecords.filter(record => record.id !== id);
        browserAPI.storage.local.set({undoRecords: undoRecords}, function() {
            console.log('Undo record removed');
            callback();
        });
    });
}
function createUndoRecordsModal(undoRecords, onUndoClick) {
    try {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10002;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background-color: white;
            border-radius: 5px;
            width: 80%;
            max-width: 600px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        `;

        const headerSection = document.createElement('div');
        headerSection.style.cssText = `
            position: sticky;
            top: 0;
            background-color: white;
            padding: 20px;
            border-bottom: 1px solid #ccc;
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 1;
        `;
        const title = document.createElement('h2');
        title.textContent = 'Undo Records';
        title.style.margin = '0';

        const closeButton = document.createElement('button');
        closeButton.textContent = '\u2715';
        closeButton.style.cssText = `
            font-size: 16px;
            background: #f0f0f0;
            border: 1px solid #ccc;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: #333;
            padding: 0;
            line-height: 1;
        `;
        closeButton.onclick = () => document.body.removeChild(overlay);

        const contentSection = document.createElement('div');
        contentSection.style.cssText = `
            padding: 20px;
            overflow-y: auto;
            flex-grow: 1;
        `;
        
        headerSection.appendChild(title);
        headerSection.appendChild(closeButton);
        modalContent.appendChild(headerSection);
        const progressBar = createProgressBar();
        modalContent.appendChild(progressBar);
        modalContent.appendChild(contentSection);

        undoRecords.forEach((record, index) => {
            try {
                const recordDiv = document.createElement('div');
                recordDiv.style.cssText = `
                    border: 1px solid #ccc;
                    border-radius: 5px;
                    padding: 15px;
                    margin-bottom: ${index < undoRecords.length - 1 ? '15px' : '0'};
                    ${record.undone ? 'text-decoration: line-through;' : ''}
                `;

                const actionInfo = document.createElement('p');
                actionInfo.textContent = `${record.action} - ${new Date(record.timestamp).toLocaleString()}`;
                actionInfo.style.margin = '0 0 10px 0';
                recordDiv.appendChild(actionInfo);

                // Add disclaimers
                const disclaimers = [];
                        
                // Check for DQI removal actions with robust error handling
                if (record && record.observations && Object.values(record.observations).some(obs => 
                    obs && Array.isArray(obs.undoActions) && obs.undoActions.some(action => 
                        action && action.type === 'qualityMetric' && action.vote === 'remove'
                    )
                )) {
                    disclaimers.push("Note: Removed DQI votes cannot be restored due to API limitations.");
                }

                if (disclaimers.length > 0) {
                    const disclaimerParagraph = document.createElement('p');
                    disclaimerParagraph.style.color = 'red';
                    disclaimerParagraph.style.fontStyle = 'italic';
                    disclaimerParagraph.style.fontSize = '0.9em';
                    disclaimerParagraph.textContent = disclaimers.join(' ');
                    recordDiv.appendChild(disclaimerParagraph);
                }

                const observationIds = Object.keys(record.observations);
                const observationUrl = generateObservationURL(observationIds);

                const linkParagraph = document.createElement('a');
                linkParagraph.href = observationUrl;
                linkParagraph.textContent = `View ${record.affectedObservationsCount} affected observation${record.affectedObservationsCount !== 1 ? 's' : ''}`;
                linkParagraph.target = '_blank';
                linkParagraph.style.display = 'block';
                linkParagraph.style.marginBottom = '10px';
                recordDiv.appendChild(linkParagraph);

                const undoButton = document.createElement('button');
                undoButton.textContent = record.undone ? 'Undone' : 'Undo';
                undoButton.disabled = record.undone;
                undoButton.onclick = async function() {
                    progressBar.style.display = 'block'; // Show progress bar
                    const progressFill = progressBar.querySelector('.progress-fill');
                    try {
                        const result = await performUndoActions(record, progressFill);
                        await updateProgressBar(progressFill, 100);
                        await new Promise(resolve => setTimeout(resolve, 300));
                        if (result.success) {
                            markRecordAsUndone(record.id);
                            undoButton.textContent = 'Undone';
                            undoButton.disabled = true;
                            recordDiv.style.textDecoration = 'line-through';
                            console.log('All undo actions completed successfully:', result.results);
                        } else {
                            console.error('Some undo actions failed:', result.results);
                            alert('Some undo actions failed. Please check the console for details.');
                        }
                    } catch (error) {
                        console.error('Error in performUndoActions:', error);
                        alert(`Error performing undo actions: ${error.message}`);
                    } finally {
                        progressBar.style.display = 'none'; // Hide progress bar after completion
                    }
                };
                recordDiv.appendChild(undoButton);
                contentSection.appendChild(recordDiv);
            } catch (error) {
                console.error('Error processing undo record:', error);
                // Optionally, add an error message to the modal
                const errorDiv = document.createElement('div');
                errorDiv.textContent = `Error processing undo record: ${error.message}`;
                errorDiv.style.color = 'red';
                contentSection.appendChild(errorDiv);
            }
        });

        overlay.appendChild(modalContent);
        return overlay;
    } catch (error) {
        console.error('Error creating undo records modal:', error);
        alert('An error occurred while creating the undo records modal. Please check the console for more details.');
        return null;
    }
}

function getUndoRecords(callback) {
    browserAPI.storage.local.get('undoRecords', function(result) {
        const records = result.undoRecords || [];
        // Sort records by timestamp, newest first
        records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        console.log('Sorted undo records:', records);
        callback(records);
    });
}

async function performUndoActions(undoRecord, progressFill) {
    console.log('Performing undo actions for record:', JSON.stringify(undoRecord, null, 2));
    let allActionsSuccessful = true;
    const results = [];

    const totalActions = Object.values(undoRecord.observations).reduce((sum, obs) => sum + obs.undoActions.length, 0);
    let completedActions = 0;

    for (const [observationId, observationData] of Object.entries(undoRecord.observations)) {
        console.log(`Processing undo actions for observation ${observationId}:`, observationData);
        for (const undoAction of observationData.undoActions) { 
            try {
                const result = await performSingleUndoAction(observationId, undoAction);
                console.log('Undo action result:', result);
                if (result.success) {
                    results.push({ observationId, action: result.action, message: result.message });
                } else {
                    allActionsSuccessful = false;
                    console.error('Undo action failed:', undoAction, 'Result:', result);
                    results.push({ observationId, action: undoAction.type, error: result.error });
                }
            } catch (error) {
                console.error('Error performing undo action:', undoAction, 'Error:', error);
                allActionsSuccessful = false;
                results.push({ observationId, action: undoAction.type, error: safeErrorString(error) });
            }

            completedActions++;
            await updateProgressBar(progressFill, (completedActions / totalActions) * 100);
        }
    }

    return { success: allActionsSuccessful, results };
}

function markRecordAsUndone(recordId) {
    browserAPI.storage.local.get('undoRecords', function(result) {
        let undoRecords = result.undoRecords || [];
        const recordIndex = undoRecords.findIndex(r => r.id === recordId);
        if (recordIndex !== -1) {
            undoRecords[recordIndex].undone = true;
            browserAPI.storage.local.set({undoRecords: undoRecords}, function() {
                console.log('Undo record marked as undone');
            });
        }
    });
}

async function performSingleUndoAction(observationId, undoAction) {
    console.log('Performing undo action:', undoAction, 'for observation:', observationId);
    switch (undoAction.type) {
            case 'follow':
                if (undoAction.alreadyInDesiredState) {
                    console.log('No follow toggle needed for undo; already in desired state.');
                    return { success: true, message: 'No action needed for follow undo' };
                }
            
                console.log('Restoring original follow state:', undoAction.originalState);
                try {
                    const result = await toggleFollowObservation(observationId, undoAction.originalState === 'followed');
                    return {
                        success: true,
                        action: 'follow',
                        message: `Follow state restored to ${undoAction.originalState}`
                    };
                } catch (error) {
                    console.error('Error restoring follow state:', error);
                    return { success: false, error: safeErrorString(error) };
                }
            case 'reviewed':
                console.log('Undo action for review:', {
                    undoAction,
                    originalState: undoAction.originalState,
                    observationId
                });
                const shouldMarkAsReviewed = undoAction.originalState === 'reviewed';
                console.log('Should mark as reviewed?', {
                    shouldMarkAsReviewed,
                    originalState: undoAction.originalState,
                    comparison: undoAction.originalState === 'reviewed'
                });
                try {
                    const result = await markObservationReviewed(observationId, shouldMarkAsReviewed);                return {
                    success: true,
                    action: 'reviewed',
                    message: `Restored reviewed state to ${undoAction.originalState}`
                };
            } catch (error) {
                console.error('Error restoring reviewed state for undo:', error);
                return { success: false, error: safeErrorString(error) };
            }    
            case 'removeAnnotation':
                if (undoAction.uuid) {
                    try {
                        const response = await makeAPIRequest(`/annotations/${undoAction.uuid}`, { method: 'DELETE' });
                        console.log('Annotation deletion response:', response);
                        return { success: true, action: 'removeAnnotation', message: 'Annotation removed successfully' };
                    } catch (error) {
                        console.error('Error removing annotation:', error);
                        if (error.message && error.message.includes('HTTP error! status: 404')) {
                            console.log('Annotation not found (404). It may have been already deleted.');
                            return { success: true, action: 'removeAnnotation', message: 'Annotation already removed or not found' };
                        }
                        return { success: false, error: safeErrorString(error) };
                    }
                } else {
                    console.error('Annotation UUID not found for undo action');
                    return { success: false, error: 'Annotation UUID not found' };
                }
            case 'updateObservationField':
                // First, get the current state of the observation
                const observationResponse = await makeAPIRequest(`/observations/${observationId}`);
                console.log('Current observation state:', observationResponse.results[0]);
                
                const ofv = observationResponse.results[0].ofvs.find(ofv => ofv.field_id === parseInt(undoAction.fieldId));
                
                if (ofv) {
                    console.log('Found existing OFV:', ofv);
                    
                    // Delete the current value
                    const deleteResult = await makeAPIRequest(`/observation_field_values/${ofv.id}`, {
                        method: 'DELETE'
                    });
                    console.log('Delete result:', deleteResult);
                    
                    // Verify the deletion
                    const checkResponse = await makeAPIRequest(`/observations/${observationId}`);
                    const checkOfv = checkResponse.results[0].ofvs.find(ofv => ofv.field_id === parseInt(undoAction.fieldId));
                    
                    if (!checkOfv) {
                        // Deletion successful, now restore original value if it exists
                        if (undoAction.originalValue !== undefined && undoAction.originalValue !== null) {
                            console.log('Restoring original value:', undoAction.originalValue);
                            const restoreResult = await makeAPIRequest('/observation_field_values', {
                                method: 'POST',
                                body: JSON.stringify({
                                    observation_field_value: {
                                        observation_id: observationId,
                                        observation_field_id: undoAction.fieldId,
                                        value: undoAction.originalValue
                                    }
                                })
                            });
                            return { success: true, action: 'restored', fieldId: undoAction.fieldId, value: undoAction.originalValue };
                        }
                        return { success: true, action: 'deleted', fieldId: undoAction.fieldId };
                    } else {
                        console.error('Field value not deleted successfully');
                        return { success: false, error: 'Failed to delete field value' };
                    }
                } else if (undoAction.originalValue) {
                    // No current value but we have an original value to restore
                    console.log('No current value, restoring original:', undoAction.originalValue);
                    const restoreResult = await makeAPIRequest('/observation_field_values', {
                        method: 'POST',
                        body: JSON.stringify({
                            observation_field_value: {
                                observation_id: observationId,
                                observation_field_id: undoAction.fieldId,
                                value: undoAction.originalValue
                            }
                        })
                    });
                    return { success: true, action: 'restored', fieldId: undoAction.fieldId, value: undoAction.originalValue };
                }
                
                console.warn(`No action needed for field ID ${undoAction.fieldId} on observation ${observationId}`);
                return { success: true, message: 'No action needed' };
            case 'removeFromProject':
                if (!undoAction.actionApplied) {
                    console.log(`Skipping undo for observation ${observationId} - original action wasn't applied. Reason: ${undoAction.reason}`);
                    return {
                        success: true,
                        message: 'No undo needed - original action was not applied',
                        reason: undoAction.reason
                    };
                }
            
                try {
                    // Pass the remove parameter so that "remove: true" calls the removal path.
                    const result = await performProjectAction(
                        observationId, 
                        undoAction.projectId, 
                        undoAction.remove
                    );
                    return result;
                } catch (error) {
                    console.error('Error in project undo action:', error);
                    return {
                        success: false,
                        error: safeErrorString(error),
                        projectId: undoAction.projectId,
                        projectName: undoAction.projectName
                    };
                }
                        
            case 'removeComment':
                console.log('Attempting to remove comment:', undoAction);
                if (undoAction.commentUUID) {
                    try {
                        const response = await makeAPIRequest(`/comments/${undoAction.commentUUID}`, { method: 'DELETE' });
                        console.log('Comment deletion response:', response);
                        return { success: true, action: 'removeComment', message: 'Comment removed successfully' };
                    } catch (error) {
                        console.error('Error removing comment:', error);
                        if (error.message && error.message.includes('HTTP error! status: 404')) {
                            console.log('Comment not found (404). It may have been already deleted.');
                            return { success: true, action: 'removeComment', message: 'Comment already removed or not found' };
                        }
                        return { success: false, error: safeErrorString(error) };
                    }
                } else {
                    console.error('Comment UUID not found for undo action:', undoAction);
                    return { success: false, error: 'Comment UUID not found' };
                }
            case 'removeIdentification':
                if (undoAction.identificationUUID) {
                    try {
                        console.log('Removing identification:', undoAction.identificationUUID);
                        await makeAPIRequest(`/identifications/${undoAction.identificationUUID}`, { method: 'DELETE' });
                        console.log('Identification successfully deleted');
            
                        if (undoAction.previousIdentificationUUID) {
                            console.log('Restoring previous identification:', undoAction.previousIdentificationUUID);
                            await makeAPIRequest(`/identifications/${undoAction.previousIdentificationUUID}`, {
                                method: 'PUT',
                                body: JSON.stringify({ current: true })
                            });
                            console.log('Previous identification restored');
                        }
            
                        return { 
                            success: true, 
                            action: 'removeIdentification', 
                            message: 'Identification removed and previous restored if available'
                        };
                    } catch (error) {
                        console.error('Error in removeIdentification action:', error);
                        return { success: false, error: safeErrorString(error) };
                    }
                } else {
                    console.error('Identification UUID not found for undo action');
                    return { success: false, error: 'Identification UUID not found' };
                }
            case 'restoreIdentification':
                if (undoAction.identificationUUID) {
                    try {
                        console.log('Restoring withdrawn identification:', undoAction.identificationUUID);
                        await makeAPIRequest(`/identifications/${undoAction.identificationUUID}`, {
                            method: 'PUT',
                            body: JSON.stringify({ current: true })
                        });
                        return { 
                            success: true, 
                            action: 'restoreIdentification', 
                            message: 'Withdrawn identification restored'
                        };
                    } catch (error) {
                        console.error('Error in restoreIdentification action:', error);
                        return { success: false, error: safeErrorString(error) };
                    }
                } else {
                    console.error('Identification UUID not found for undo action');
                    return { success: false, error: 'Identification UUID not found' };
                }    
            case 'qualityMetric':
                if (undoAction.vote === 'remove') {
                    console.log('Skipping undo for DQI removal as it\'s not supported');
                    return { success: true, action: 'qualityMetric', message: 'Undo of DQI removal not supported' };
                }
                
                const isNeedsId = undoAction.metric === 'needs_id';
                const endpoint = isNeedsId
                    ? `/votes/unvote/observation/${observationId}?scope=needs_id`
                    : `/observations/${observationId}/quality/${undoAction.metric}`;
                
                try {
                    const response = await makeAPIRequest(endpoint, { method: 'DELETE' });
                    console.log(`Quality metric vote removal response for ${undoAction.metric}:`, response);
                    
                    return {
                        success: true,
                        action: 'qualityMetric',
                        message: `Removed ${undoAction.metric} vote`
                    };
                } catch (error) {
                    console.error(`Error in quality metric undo action for ${undoAction.metric}:`, error);
                    return { success: false, error: safeErrorString(error) };
                }
            case 'addToList':
                try {
                    const result = await addOrRemoveObservationFromList(observationId, undoAction.listId, undoAction.remove);
                    return {
                        success: true,
                        action: undoAction.remove ? 'removedFromList' : 'addedToList',
                        listId: undoAction.listId,
                        message: result.message
                    };
                } catch (error) {
                    console.error('Error in undo addToList action:', error);
                    return { success: false, error: safeErrorString(error) };
            }
            default:
                console.warn(`Unknown undo action type: ${undoAction.type}`);
                return Promise.resolve({ success: false, error: 'Unknown undo action type' }

                );
    }
}

function createProgressBar() {
    console.log('Creating progress bar');
    const progressBarContainer = document.createElement('div');
    progressBarContainer.style.cssText = `
        width: 100%;
        padding: 0 20px;
        box-sizing: border-box;
    `;

    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
        width: 100%;
        height: 20px;
        background-color: #f0f0f0;
        border-radius: 10px;
        overflow: hidden;
        margin: 10px 0;
    `;

    const progressFill = document.createElement('div');
    progressFill.classList.add('progress-fill');
    progressFill.style.cssText = `
        width: 0%;
        height: 100%;
        background-color: #4CAF50;
        transition: width 0.3s ease;
    `;

    progressBar.appendChild(progressFill);
    progressBarContainer.appendChild(progressBar);
    progressBarContainer.style.display = 'block'; 

    return progressBarContainer;
}

async function updateProgressBar(progressFill, progress) {
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            progressFill.style.width = `${progress}%`;
            void progressFill.offsetWidth;
            requestAnimationFrame(resolve);
        });
    });
}

async function makeAPIRequest(endpoint, options = {}) {
    const jwt = await getJWT();
    if (!jwt) {
        console.error('No JWT available');
        throw new Error('No JWT available');
    }
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${jwt}`
    };
    let fullUrl = `${API_URL}${endpoint}`;
    if (options.method === 'DELETE') {
        fullUrl += '?delete=true';
    }
    console.log(`Making ${options.method || 'GET'} request to: ${fullUrl}`);
    try {
        const response = await fetch(fullUrl, {
            ...options,
            headers
        });
        console.log(`Response status: ${response.status}`);
        console.log('Response headers:', response.headers);
        const responseText = await response.text();
        if (!response.ok) {
            // This is where we modify the error object
            const error = new Error(`HTTP error! status: ${response.status}, body: ${responseText}`);
            error.status = response.status;
            error.responseBody = responseText;
            throw error;
        }
        if (responseText) {
            try {
                const responseData = JSON.parse(responseText);
                return responseData;
            } catch (e) {
                return responseText;
            }
        }
        return null;
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

// Initialize and test JWT when the script loads
(async function() {
    const jwt = await getJWT();
    if (jwt) {
        const isValid = await testJWT();
        if (isValid) {
            console.log('JWT is valid');
        } else {
            console.log('JWT is invalid, will try to get a new one on next API call');
            currentJWT = null;
            if (isOptionsPage()) {
                showJWTAlert();
            }
        }
    } else {
        console.log('No JWT found');
        if (isOptionsPage()) {
            showJWTAlert();
        }
    }
})();

function isOptionsPage() {
    return window.location.pathname.endsWith('options.html');
}

function showJWTAlert() {
    // Create modal container
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        z-index: 9999;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0,0,0,0.4);
        display: flex;
        justify-content: center;
        align-items: center;
    `;

    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background-color: #fefefe;
        padding: 20px;
        border: 1px solid #888;
        width: 80%;
        max-width: 500px;
        border-radius: 5px;
        text-align: center;
    `;

    // Add message and link
    modalContent.innerHTML = `
        <h2 style="margin-top: 0;">Authentication Required</h2>
        <p>This extension submits actions to the iNaturalist server using your account credentials. Please ensure you are logged into iNaturalist and have recently visited an iNaturalist page. This allows the extension to securely connect to your iNaturalist account.</p>
        <p>After you navigate to an Identify page logged in to your account, refresh this page. If your credentials were obtained, this note should not appear.</p>
        <a href="https://www.inaturalist.org/observations/identify" target="_blank" style="color: blue; text-decoration: underline;">Open iNaturalist Identify Page</a>
        <button id="closeJWTAlert" style="display: block; margin: 20px auto 0; padding: 10px 20px;">Close</button>
    `;

    // Append modal content to modal container
    modal.appendChild(modalContent);

    // Append modal to body
    document.body.appendChild(modal);

    // Close modal when close button is clicked
    document.getElementById('closeJWTAlert').onclick = function() {
        if (modal.parentNode) { // Check if modal is still in DOM
            document.body.removeChild(modal);
        }
    };

    // Close modal when clicking outside of it
    modal.onclick = function(event) {
        if (event.target == modal) {
            if (modal.parentNode) { // Check if modal is still in DOM
                document.body.removeChild(modal);
            }
        }
    };
}


function getJWTFromPage() {
    const metaTag = document.querySelector('meta[name="inaturalist-api-token"]');
    return metaTag ? metaTag.getAttribute('content') : null;
}

async function getJWT() {
    if (currentJWT) return currentJWT;
    
    currentJWT = getJWTFromPage();
    if (currentJWT) {
        browserAPI.storage.local.set({jwt: currentJWT});
        return currentJWT;
    }
    
    // If not on page, try to get from storage
    const stored = await browserAPI.storage.local.get('jwt');
    if (stored.jwt) {
        currentJWT = stored.jwt;
        return currentJWT;
    }
    
    console.error('No JWT available');
    return null;
}


async function testJWT() {
    try {
        const response = await makeAPIRequest('/users/me');
        console.log('JWT test response:', response);
        return response && response.results && response.results[0] && response.results[0].id;
    } catch (error) {
        console.error('Error in JWT test:', error);
        return false;
    }
}

function generateListObservationURL(listId) {
    return new Promise((resolve) => {
        browserAPI.storage.local.get('customLists', function(data) {
            const customLists = data.customLists || [];
            const list = customLists.find(l => l.id === listId);
            if (list && list.observations.length > 0) {
                const baseURL = 'https://www.inaturalist.org/observations/identify?quality_grade=casual,needs_id,research&reviewed=any&verifiable=any&place_id=any';
                const url = `${baseURL}&per_page=${list.observations.length}&id=${list.observations.join(',')}`;
                resolve(url);
            } else {
                resolve(null);
            }
        });
    });
}


async function addOrRemoveObservationFromList(observationId, listId, isRemove = false) {
    return new Promise((resolve, reject) => {
        browserAPI.storage.local.get('customLists', function(data) {
            const customLists = data.customLists || [];
            const listIndex = customLists.findIndex(list => list.id === listId);
            if (listIndex !== -1) {
                const observationIndex = customLists[listIndex].observations.indexOf(observationId);
                if (isRemove) {
                    if (observationIndex !== -1) {
                        customLists[listIndex].observations.splice(observationIndex, 1);
                        browserAPI.storage.local.set({customLists: customLists}, function() {
                            console.log(`Observation ${observationId} removed from list ${customLists[listIndex].name}`);
                            resolve({ success: true, message: `Observation removed from list: ${customLists[listIndex].name}` });
                        });
                    } else {
                        console.log(`Observation ${observationId} not in list ${customLists[listIndex].name}`);
                        resolve({ success: true, message: 'Observation not in list' });
                    }
                } else {
                    if (observationIndex === -1) {
                        customLists[listIndex].observations.push(observationId);
                        browserAPI.storage.local.set({customLists: customLists}, function() {
                            console.log(`Observation ${observationId} added to list ${customLists[listIndex].name}`);
                            resolve({ success: true, message: `Observation added to list: ${customLists[listIndex].name}` });
                        });
                    } else {
                        console.log(`Observation ${observationId} already in list ${customLists[listIndex].name}`);
                        resolve({ success: true, message: 'Observation already in list' });
                    }
                }
            } else {
                console.error(`List with ID ${listId} not found`);
                reject(new Error('List not found'));
            }
        });
    });
}

async function lookupTaxonById(taxonId) {
    const baseUrl = 'https://api.inaturalist.org/v1/taxa';
    const response = await fetch(`${baseUrl}/${taxonId}`);
    const data = await response.json();
    return data.results;
}

// In shared_api.js
async function getFieldValueDetails(observationId, fieldId) {
    try {
        console.log(`getFieldValueDetails: Fetching obs ${observationId} for field ${fieldId}`);
        const response = await makeAPIRequest(`/observations/${observationId}`);
        if (!response || !response.results || !response.results[0]) {
            console.warn(`getFieldValueDetails: Observation ${observationId} not found or no results.`);
            return null;
        }
        const observation = response.results[0];
        const numericFieldId = parseInt(fieldId); // Ensure fieldId is a number for matching
        const fieldValue = observation.ofvs.find(ofv => ofv.field_id === numericFieldId);
        
        console.log(`getFieldValueDetails: For obs ${observationId}, field ${fieldId}: Found OFV:`, 
            fieldValue ? JSON.parse(JSON.stringify(fieldValue)) : null); // Log a copy

        if (!fieldValue) {
            console.log(`getFieldValueDetails: No OFV found for field ${fieldId} on obs ${observationId}.`);
            return null;
        }

        // --- ADD DETAILED LOGGING FOR fieldValue.value ---
        console.log(`getFieldValueDetails: For field ${fieldId} (Obs: ${observationId}), raw fieldValue.value is:`, fieldValue.value);
        console.log(`getFieldValueDetails: Type of fieldValue.value is:`, typeof fieldValue.value);
        if (typeof fieldValue.value === 'object' && fieldValue.value !== null) {
            console.log(`getFieldValueDetails: fieldValue.value is an object. Keys:`, Object.keys(fieldValue.value));
            try {
                console.log(`getFieldValueDetails: fieldValue.value stringified:`, JSON.stringify(fieldValue.value));
            } catch (e) {
                console.warn(`getFieldValueDetails: Could not stringify fieldValue.value object.`);
            }
        }
        // --- END DETAILED LOGGING ---


        if (fieldValue.datatype === 'taxon' && fieldValue.value) {
            // This part assumes fieldValue.value is a taxon ID (number or string convertible to number)
            let taxonApiId = fieldValue.value;
            if (typeof taxonApiId === 'object' && taxonApiId !== null && taxonApiId.id) {
                // If value is an object like {id: 123, name: "..."} (unlikely for raw OFV value but defensive)
                taxonApiId = taxonApiId.id; 
            } else if (typeof taxonApiId === 'object'){
                 console.error(`getFieldValueDetails: Taxon field value is an unexpected object for field ${fieldId} on obs ${observationId}:`, fieldValue.value);
                 // Fallback or decide how to handle - for now, let it try to use it as is, or return an error indicator
            }

            try {
                const taxonData = await lookupTaxonById(taxonApiId); // Expects an ID
                if (taxonData && taxonData[0]) {
                    return {
                        value: String(taxonApiId), // Store the ID as string
                        displayValue: taxonData[0].preferred_common_name ? 
                            `${taxonData[0].preferred_common_name} (${taxonData[0].name})` : 
                            taxonData[0].name,
                        timestamp: fieldValue.updated_at || fieldValue.created_at,
                        datatype: 'taxon' // Add datatype for clarity downstream
                    };
                } else {
                     console.warn(`getFieldValueDetails: Taxon lookup failed or no data for ID ${taxonApiId} (field ${fieldId}, obs ${observationId})`);
                }
            } catch (error) {
                console.error(`getFieldValueDetails: Error looking up taxon ID ${taxonApiId} (field ${fieldId}, obs ${observationId}):`, error);
                 // Fallback to just returning the ID if lookup fails, so it doesn't break entirely
                 return {
                    value: String(fieldValue.value), // Or String(taxonApiId)
                    displayValue: `Taxon ID: ${fieldValue.value}`, // Fallback display
                    timestamp: fieldValue.updated_at || fieldValue.created_at,
                    datatype: 'taxon'
                };
            }
        }
        
        // For non-taxon fields, or taxon fields where lookup failed/value wasn't an ID
        let valueToReturn = fieldValue.value;
        if (typeof valueToReturn === 'object' && valueToReturn !== null) {
            console.warn(`getFieldValueDetails: Field ${fieldId} (Obs ${observationId}) has a non-taxon object value: ${JSON.stringify(valueToReturn)}. Returning as stringified JSON.`);
            valueToReturn = JSON.stringify(valueToReturn); // Default stringification for unexpected objects
        }

        return {
            value: String(valueToReturn), // Ensure it's a string
            // displayValue is not set here for non-taxon, so validateBulkAction will use .value
            timestamp: fieldValue.updated_at || fieldValue.created_at,
            datatype: fieldValue.datatype || 'unknown' // Add datatype
        };
    } catch (error) {
        console.error(`getFieldValueDetails: Error getting field value details for obs ${observationId}, field ${fieldId}:`, error);
        // throw error; // Or return null/error object
        return null; // Return null to indicate failure to retrieve details
    }
}

function compareFieldValues(existingValue, newValue, datatype) {
    if (!existingValue) return true; // No existing value means values are different

    switch (datatype) {
        case 'numeric':
            return parseFloat(existingValue) !== parseFloat(newValue);
        case 'date':
        case 'datetime':
            return new Date(existingValue).getTime() !== new Date(newValue).getTime();
        default:
            return existingValue !== newValue;
    }
}

async function markObservationReviewed(observationId, markAsReviewed) {
    const jwt = await getJWT(); // Ensure the user is authenticated
    if (!jwt) {
        console.error('No JWT found');
        return { success: false, error: 'No JWT found' };
    }

    // Step 1: Check the current reviewed state
    const checkUrl = `https://api.inaturalist.org/v1/observations/${observationId}`;
    try {
        const response = await fetch(checkUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to check reviewed state. Status: ${response.status}`);
        }

        const data = await response.json();
        const observation = data.results[0]; // Assuming the observation is the first result
        const isCurrentlyReviewed = observation.reviewed;

        // Step 2: Determine if action is needed
        if (markAsReviewed === isCurrentlyReviewed) {
            console.log(`Observation ${observationId} is already in the desired reviewed state (${markAsReviewed ? 'reviewed' : 'unreviewed'}). No action taken.`);
            return { success: true, originalState: isCurrentlyReviewed ? 'reviewed' : 'unreviewed' };
        }

        // Step 3: Perform the action
        const url = `https://api.inaturalist.org/v1/observations/${observationId}/review`;
        const method = markAsReviewed ? 'POST' : 'DELETE';
        const body = markAsReviewed ? JSON.stringify({ reviewed: "true" }) : null;

        const actionResponse = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/json',
            },
            body,
        });

        if (!actionResponse.ok) {
            throw new Error(`Failed to mark as ${markAsReviewed ? 'reviewed' : 'unreviewed'}. Status: ${actionResponse.status}`);
        }

        console.log(`Successfully marked observation ${observationId} as ${markAsReviewed ? 'reviewed' : 'unreviewed'}`);
        return { success: true, originalState: isCurrentlyReviewed ? 'reviewed' : 'unreviewed' };
    } catch (error) {
        console.error(`Error marking observation ${observationId} as reviewed/unreviewed:`, error);
        throw error;
    }
}

async function toggleFollowObservation(observationId) {
    try {
        const response = await makeAPIRequest(`/subscriptions/Observation/${observationId}/subscribe`, {
            method: 'POST'
        });

        console.log(`Successfully toggled follow state for observation ${observationId}`);
        return { success: true };
    } catch (error) {
        console.error(`Error toggling follow state for observation ${observationId}:`, error);
        return { success: false, error: safeErrorString(error) };
    }
}

// In shared_api.js
async function performProjectAction(observationId, projectId, remove = false) {
    const actionType = 'addToProject';
    const jwt = await getJWT(); // Get JWT here for direct fetch call

    if (!jwt && !remove) { // JWT is essential for POST
        console.error('No JWT available for adding to project.');
        return {
            success: false,
            message: 'Authentication token not found. Cannot add to project.',
            reason: 'auth_error',
            action: actionType, projectId
        };
    }

    try {
        // Initial observation fetch can still use makeAPIRequest
        const observationData = await makeAPIRequest(`/observations/${observationId}`);
        
        if (!observationData || !observationData.results || !observationData.results[0]) {
            return {
                success: false,
                message: 'Failed to fetch observation details',
                reason: 'fetch_error',
                action: actionType, projectId
            };
        }
        const observation = observationData.results[0];

        const isExplicitlyInProject = observation.project_observations.some(
            po => po.project.id === parseInt(projectId)
        );

        if (!remove) { // Adding to project
            if (isExplicitlyInProject) {
                return {
                    success: true,
                    message: 'Already in project',
                    reason: 'already_member',
                    noActionNeeded: true,
                    action: actionType, projectId
                };
            }
            try {
                // --- DIRECT FETCH FOR POST ---
                const projectAddUrl = `${API_URL}/project_observations`;
                const projectAddData = {
                    project_observation: {
                        observation_id: observationId,
                        project_id: projectId
                    }
                };
                console.log(`Making DIRECT POST to: ${projectAddUrl} with body:`, JSON.stringify(projectAddData).substring(0,100) + "...");

                const response = await fetch(projectAddUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${jwt}`
                    },
                    body: JSON.stringify(projectAddData)
                });

                const responseText = await response.text();
                console.log(`Direct POST response status: ${response.status} for ${projectAddUrl}`);

                if (!response.ok) {
                    const error = new Error(`HTTP error (direct POST)! status: ${response.status}, body: ${responseText}`);
                    error.status = response.status;
                    error.responseBody = responseText;
                    console.error("Direct POST Error Details:", { url: projectAddUrl, data: projectAddData, error });
                    throw error;
                }

                let responseDataJson = null;
                if (responseText) {
                    try {
                        responseDataJson = JSON.parse(responseText);
                    } catch (e) {
                        console.warn("Direct POST response was not JSON:", responseText);
                        // If not JSON but response was ok (e.g. 201 Created with no body), it might still be a success.
                        // However, iNat usually returns JSON for this.
                    }
                }
                // --- END DIRECT FETCH ---

                if (responseDataJson && responseDataJson.uuid) { // Check for uuid or other success indicators
                    return {
                        success: true,
                        message: 'Added to project successfully',
                        additionUUID: responseDataJson.uuid,
                        action: actionType, projectId
                    };
                } else if (response.ok && !responseDataJson && response.status >= 200 && response.status < 300) {
                    // Handle cases where API might return 201/200 OK with no body or non-JSON body for success
                    console.warn("Project add POST was successful but no JSON UUID returned. Assuming success based on status.", response.status);
                    return {
                        success: true,
                        message: 'Added to project (assumed success from status)',
                        action: actionType, projectId
                    };
                }
                 else {
                     // This case means response was .ok but didn't have expected success markers in JSON
                    const errorMessage = (responseDataJson && responseDataJson.error) ? responseDataJson.error : 
                                         (responseText ? `Unexpected response: ${responseText.substring(0,100)}` : 'Unknown error after POST');
                    return {
                        success: false,
                        message: `Failed to add to project: ${errorMessage}`,
                        reason: 'addition_failed_api_logic', // More specific reason
                        action: actionType, projectId
                    };
                }
            } catch (error) { // Catches network errors or errors thrown from !response.ok
                return { success: false, message: error.message || safeErrorString(error), reason: 'addition_failed_network_or_http', action: actionType, projectId };
            }
        } else { // Removing from project (can continue to use makeAPIRequest for DELETE)
            if (!isExplicitlyInProject) {
                const dynamicInclusionCheck = await makeAPIRequest(`/observations?project_id=${projectId}&id=${observationId}`);
                const isDynamicallyIncluded = dynamicInclusionCheck && dynamicInclusionCheck.total_results > 0;
                if (isDynamicallyIncluded) {
                    return {
                        success: false,
                        message: 'Cannot remove - observation is automatically included by project rules.',
                        reason: 'dynamic_inclusion',
                        requiresWarning: true,
                        action: actionType, projectId
                    };
                } else {
                    return {
                        success: true,
                        message: 'Not in project, no removal action needed.',
                        reason: 'not_in_project',
                        noActionNeeded: true,
                        action: actionType, projectId
                    };
                }
            }
            try {
                // makeAPIRequest for DELETE should be fine
                await makeAPIRequest(`/projects/${projectId}/remove?observation_id=${observationId}`, {
                    method: 'DELETE'
                });
                return { 
                    success: true, 
                    message: 'Observation removed successfully', 
                    explicitlyRemoved: true,
                    action: actionType, projectId
                };
            } catch (error) {
                if (error.message && error.message.includes("you don't have permission to remove")) {
                    return {
                        success: false,
                        message: 'Permission denied to remove from project.',
                        reason: 'permission_denied',
                        requiresWarning: true,
                        action: actionType, projectId
                    };
                }
                return { success: false, message: safeErrorString(error), reason: 'removal_failed', action: actionType, projectId };
            }
        }
    } catch (error) {
        console.error('Unexpected error in performProjectAction (outer try):', error);
        return { 
            success: false, 
            message: error.message || safeErrorString(error), 
            reason: 'unexpected_error_outer',
            action: actionType, projectId
        };
    }
}


function handleProjectActionResults(results, wasRemoval = false) {
    console.log('Raw results for project action summary:', results);
    const summary = {
        projectSuccess: [], // Observations where project action succeeded
        projectSkipped: [], // Observations where project action was skipped (noActionNeeded)
        projectFailed: [],  // Observations where project action failed
        otherActionsSucceededForFailedProject: [], // Obs where project failed but other actions might have succeeded
        warnings: [] // Warnings specifically from project action
    };

    // Group results by observationId
    const resultsByObservation = results.reduce((acc, result) => {
        acc[result.observationId] = acc[result.observationId] || [];
        acc[result.observationId].push(result);
        return acc;
    }, {});

    for (const observationId in resultsByObservation) {
        const obsActions = resultsByObservation[observationId];
        const projectActionResult = obsActions.find(r => r.action === 'addToProject' || (r.projectId && (r.explicitlyRemoved !== undefined || r.reason))); // find project-specific result

        if (projectActionResult) {
            if (projectActionResult.success) {
                if (projectActionResult.noActionNeeded) {
                    summary.projectSkipped.push({
                        observationId,
                        reason: projectActionResult.reason,
                        message: projectActionResult.message
                    });
                } else {
                    summary.projectSuccess.push({
                        observationId,
                        message: projectActionResult.message,
                        additionUUID: projectActionResult.additionUUID,
                        explicitlyRemoved: projectActionResult.explicitlyRemoved
                    });
                }
            } else { // Project action failed or had warning
                if (projectActionResult.requiresWarning) {
                    summary.warnings.push({
                        observationId,
                        message: projectActionResult.message,
                        reason: projectActionResult.reason
                    });
                }
                // Even if it's a warning, if it's not a success, it's a failure in terms of project addition/removal
                summary.projectFailed.push({
                    observationId,
                    message: projectActionResult.message,
                    reason: projectActionResult.reason
                });

                // Check if other actions for this observation succeeded despite project failure
                const otherSuccessfulActions = obsActions.filter(
                    r => r.action !== 'addToProject' && r.success && r.action !== (wasRemoval ? 'removedFromProject' : 'addedToProject')
                ).length > 0;

                if (otherSuccessfulActions) {
                    summary.otherActionsSucceededForFailedProject.push(observationId);
                }
            }
        } else {
            // This case should ideally not happen if this function is called for project actions
            // But as a fallback, if an observation has results but no specific project action result,
            // consider it a general failure for this summary.
            console.warn(`Observation ${observationId} had results but no specific project action result.`);
            summary.projectFailed.push({
                observationId,
                message: "Project action outcome unclear, but other actions processed.",
                reason: "missing_project_result"
            });
        }
    }
    console.log("Generated project summary:", summary);
    return summary;
}

function createProjectActionResultsModal(summary, projectName, wasRemoval = false) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background-color: white;
        padding: 20px;
        border-radius: 5px;
        max-width: 80%;
        max-height: 80%;
        overflow-y: auto;
    `;

    let contentHTML = `<h2>Project Action Results</h2>`;

    const allInvolvedObsIds = new Set([
        ...summary.projectSuccess.map(s => s.observationId),
        ...summary.projectSkipped.map(s => s.observationId),
        ...summary.projectFailed.map(f => f.observationId),
        ...summary.warnings.map(w => w.observationId)
    ]);

    const fullySuccessfulObs = summary.projectSuccess.map(s => s.observationId);
    const partiallySuccessfulObsIds = summary.otherActionsSucceededForFailedProject; // ObsIds where project failed/skipped but others OK

    // --- Section for Fully Successful Observations (including project action) ---
    if (fullySuccessfulObs.length > 0) {
        contentHTML += `
            <div style="margin: 15px 0;">
                <h3>Project Action Successful (${fullySuccessfulObs.length} observations)</h3>
                <p>The configured actions, including ${wasRemoval ? 'removal from' : 'addition to'} project "${projectName}", fully succeeded for:</p>
                <div class="observation-list">
                    ${generateObservationList(fullySuccessfulObs)}
                </div>
            </div>
        `;
    }
    
    // --- Section for Partially Successful Observations (Project failed/skipped, others OK) ---
    if (partiallySuccessfulObsIds.length > 0) {
         contentHTML += `
            <div style="margin: 15px 0; padding: 10px; background: #e0f2f1; border-radius: 4px;">
                <h3>Partial Success (${partiallySuccessfulObsIds.length} observations)</h3>
                <p>For these observations, the specific project action failed or was skipped, BUT other configured actions succeeded:</p>
                <div class="observation-list">
                    ${generateObservationList(partiallySuccessfulObsIds)}
                </div>
                 <p><small>Details for the project action's outcome for these observations can be found in the 'Project Action Warnings' or 'Project Action Failed' sections below.</small></p>
            </div>
        `;
    }

    // --- Section for Project Action Skipped (and not a partial success) ---
    // Filter out those already covered by partial success or full success.
    const purelySkippedObsDetails = summary.projectSkipped.filter(s => 
        !partiallySuccessfulObsIds.includes(s.observationId) && 
        !fullySuccessfulObs.includes(s.observationId)
    );
    if (purelySkippedObsDetails.length > 0) {
        contentHTML += `
            <div style="margin: 15px 0; padding: 10px; background: #fff3e0; border-radius: 4px;">
                <h3>Project Action Skipped (${purelySkippedObsDetails.length} observations)</h3>
                <p>The project action was skipped (e.g., observation already in/not in project), and no other actions led to a 'Partial Success' status for these:</p>
                <ul>
                    ${purelySkippedObsDetails.map(skipped => `
                        <li>
                            <a href="https://www.inaturalist.org/observations/${skipped.observationId}" 
                               target="_blank" style="color: #0077cc; text-decoration: underline;">
                                Observation ${skipped.observationId}
                            </a>: ${skipped.message || 'No action needed'} (${skipped.reason || 'Skipped'})
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }
    
    // --- Section for Project Action Warnings ---
    // This section should list ALL warnings, including those for partially successful observations.
    if (summary.warnings.length > 0) {
        contentHTML += `
            <div style="margin: 15px 0; padding: 10px; background: #fff1f0; border-radius: 4px;">
                <h3>Project Action Warnings (${summary.warnings.length})</h3>
                <p>These warnings are specific to the project addition/removal action:</p>
                <ul>
                    ${summary.warnings.map(warning => `
                        <li>
                            <a href="https://www.inaturalist.org/observations/${warning.observationId}" 
                               target="_blank" style="color: #0077cc; text-decoration: underline;">
                                Observation ${warning.observationId}
                            </a>: ${warning.message}
                            ${warning.reason === 'dynamic_inclusion' ? ' (Automatically included by project rules)' : ''}
                            ${warning.reason === 'permission_denied' ? ' (Insufficient permissions)' : ''}
                            ${partiallySuccessfulObsIds.includes(warning.observationId) ? ' <strong style="color: #00897b;">(Also listed under Partial Success)</strong>' : ''}
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    // --- Section for Project Action Failed ---
    // List all project failures, indicating if they were also "Partial Success" due to other actions.
    // Exclude failures that are already covered *as the primary reason* in the warnings section if they have the same reason.
    const failuresToList = summary.projectFailed.filter(f => 
        !summary.warnings.some(w => w.observationId === f.observationId && w.reason === f.reason && w.message === f.message)
    );

    if (failuresToList.length > 0) {
        contentHTML += `
            <div style="margin: 15px 0; padding: 10px; background: #ffeded; border-radius: 4px;">
                <h3>Project Action Failed (${failuresToList.length} observations)</h3>
                 <p>The project addition/removal action failed for these observations:</p>
                <p><a href="https://www.inaturalist.org/observations/identify?quality_grade=casual,needs_id,research&reviewed=any&verifiable=any&place_id=any&id=${failuresToList.map(f => f.observationId).join(',')}" 
                      target="_blank" style="color: #0077cc; text-decoration: underline;">
                    View these observations
                </a></p>
                <ul>
                    ${failuresToList.map(failure => `
                        <li>
                            <a href="https://www.inaturalist.org/observations/${failure.observationId}" 
                               target="_blank" style="color: #0077cc; text-decoration: underline;">
                                Observation ${failure.observationId}
                            </a>: 
                            ${getCleanErrorMessage(failure.message)}
                            ${failure.reason ? `(${failure.reason})` : ''}
                            ${partiallySuccessfulObsIds.includes(failure.observationId) ? ' <strong style="color: #00897b;">(Also listed under Partial Success)</strong>' : ''}
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    contentHTML += `<button onclick="this.closest('.modal').remove()" class="modal-button">Close</button>`;
    
    content.innerHTML = contentHTML;
    modal.appendChild(content);
    modal.className = 'modal';

    return modal;
}

function generateObservationList(observationIds) {
    const url = generateObservationURL(observationIds);
    return `<a href="${url}" target="_blank">View ${observationIds.length} observation${observationIds.length !== 1 ? 's' : ''}</a>`;
}

function getCleanErrorMessage(error) {
    const errorString = safeErrorString(error);

    const match = errorString.match(/Didn't pass rule: (.+?)"/);
    if (match && match[1]) {
        return match[1];
    }

    return errorString.length > 150 ? errorString.substring(0, 147) + "..." : errorString;
}

// New function to summarize outcomes by action type
function summarizeBulkActionOutcomes(allActionResults, configuredActions) {
    console.log('Summarizing bulk action outcomes. All results:', allActionResults, 'Configured actions:', configuredActions);
    const summaryByActionType = {};

    // Initialize summary structure based on the actions in the pressed button
    configuredActions.forEach(configAction => {
        let key = configAction.type;
        // Differentiate if multiple actions of the same type exist (e.g., two different OFs)
        if (configAction.type === 'observationField') key += `-${configAction.fieldId}`;
        if (configAction.type === 'addToProject') key += `-${configAction.projectId}`;
        if (configAction.type === 'annotation') key += `-${configAction.annotationField}`;
        // Add more differentiators if needed for other types

        summaryByActionType[key] = {
            actionConfig: { ...configAction }, // Store the config for display
            success: [],
            failed: [],
            skipped: [], // For actions like project add/remove where 'noActionNeeded' is a distinct state
            warnings: []  // For project-specific warnings
        };
    });

    // Group raw results by observationId first to process all actions for one obs
    const resultsByObservation = allActionResults.reduce((acc, result) => {
        acc[result.observationId] = acc[result.observationId] || [];
        acc[result.observationId].push(result);
        return acc;
    }, {});

    for (const observationId in resultsByObservation) {
        const obsActionResults = resultsByObservation[observationId];

        obsActionResults.forEach(result => {
            let actionKey = result.action; // result.action is the type like 'observationField'
            
            // Reconstruct the key used for summaryByActionType initialization
            const originalConfigAction = configuredActions.find(ca => {
                if (ca.type !== result.action) return false;
                if (ca.type === 'observationField' && result.fieldId) return ca.fieldId === result.fieldId.toString();
                if (ca.type === 'observationField' && result.data && result.data.observation_field_id) return ca.fieldId === result.data.observation_field_id.toString();
                if (ca.type === 'addToProject' && result.projectId) return ca.projectId === result.projectId.toString();
                if (ca.type === 'annotation' && result.data && result.data.controlled_attribute_id) return ca.annotationField === result.data.controlled_attribute_id.toString();
                // Add more specific checks if necessary based on what `performSingleAction` returns
                return true; // Fallback for simpler actions
            });

            if (originalConfigAction) {
                 if (originalConfigAction.type === 'observationField') actionKey += `-${originalConfigAction.fieldId}`;
                 if (originalConfigAction.type === 'addToProject') actionKey += `-${originalConfigAction.projectId}`;
                 if (originalConfigAction.type === 'annotation') actionKey += `-${originalConfigAction.annotationField}`;
            } else {
                console.warn("Could not map result to original configured action:", result);
                // Use a generic key if mapping fails, though this shouldn't happen often
                actionKey = result.action + "-unknown";
                if (!summaryByActionType[actionKey]) {
                     summaryByActionType[actionKey] = {
                        actionConfig: { type: result.action, name: "Unknown " + result.action },
                        success: [], failed: [], skipped: [], warnings: []
                     };
                }
            }


            if (summaryByActionType[actionKey]) {
                const obsDetail = { observationId, message: result.message, reason: result.reason };
                if (result.success) {
                    if (result.noActionNeeded) { // Typically for project actions
                        summaryByActionType[actionKey].skipped.push(obsDetail);
                    } else {
                        summaryByActionType[actionKey].success.push(obsDetail);
                    }
                } else {
                    summaryByActionType[actionKey].failed.push(obsDetail);
                    if (result.requiresWarning) { // Typically for project actions
                        summaryByActionType[actionKey].warnings.push(obsDetail);
                    }
                }
            } else {
                console.warn(`Action key ${actionKey} not found in summary structure. Result:`, result);
            }
        });
    }
    console.log("Generated summary by action type:", summaryByActionType);
    return summaryByActionType;
}

function createDetailedActionResultsModal(summaryByActionType, actionSetName, skippedSafeModeObsIds, overwrittenValues, generalErrorMessages, autoRefreshAfterBulk = false) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background-color: rgba(0, 0, 0, 0.5); display: flex;
        justify-content: center; align-items: center; z-index: 10000;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background-color: white; padding: 20px; border-radius: 5px;
        max-width: 80%; max-height: 80%; overflow-y: auto; font-size: 14px;
    `;

    let contentHTML = `<h2 style="margin-top:0;">Results for: "${actionSetName}"</h2>`;

    const pluralize = (count, singular, plural = null) => {
        if (plural === null) plural = singular + 's';
        return count === 1 ? singular : plural;
    };

    if (skippedSafeModeObsIds && skippedSafeModeObsIds.length > 0) {
        const uniqueSkippedIds = [...new Set(skippedSafeModeObsIds)];
        contentHTML += `
            <div style="margin: 15px 0; padding: 10px; background: #fff8e1; border: 1px solid #ffecb3; border-radius: 4px;">
                <h4>Skipped by Safe Mode (<a href="${generateObservationURL(uniqueSkippedIds)}" target="_blank" style="color: #4caf50; text-decoration: underline;">${uniqueSkippedIds.length} ${pluralize(uniqueSkippedIds.length, "observation")}</a>)</h4>
                <p>These observations were skipped entirely because at least one 'Observation Field' action would have overwritten an existing value, and Safe Mode is ON.</p>
                ${uniqueSkippedIds.length <= 15 && uniqueSkippedIds.length > 0 ? `<ul>${uniqueSkippedIds.map(id => `<li><a href="https://www.inaturalist.org/observations/${id}" target="_blank">${id}</a></li>`).join('')}</ul>` : ''}
            </div>`;
    }
    
    if (Object.keys(overwrittenValues).length > 0) {
        const overwrittenCount = Object.keys(overwrittenValues).length;
        contentHTML += `
            <div style="margin: 15px 0; padding: 10px; background: #ffebee; border: 1px solid #ffcdd2; border-radius: 4px;">
                <h4>Values Overwritten (<a href="${generateObservationURL(Object.keys(overwrittenValues))}" target="_blank" style="color: #d32f2f; text-decoration: underline;">${overwrittenCount} ${pluralize(overwrittenCount, "observation")}</a>)</h4>
                <p>The following observation field values were overwritten (Overwrite Mode was ON):</p>
                <div style="max-height: 150px; overflow-y: auto;"><ul>`;
        for (const [obsId, fields] of Object.entries(overwrittenValues)) {
            contentHTML += `<li><a href="https://www.inaturalist.org/observations/${obsId}" target="_blank">${obsId}</a>:<ul>`;
            for (const [fieldName, change] of Object.entries(fields)) {
                contentHTML += `<li>"${fieldName}": from "${change.oldValue}" to "${change.newValue}"</li>`;
            }
            contentHTML += `</ul></li>`;
        }
        contentHTML += `</ul></div></div>`;
    }

    for (const actionKey in summaryByActionType) {
        const actionSummary = summaryByActionType[actionKey];
        const { actionConfig, success, failed, skipped, warnings } = actionSummary;

        let actionDisplayName = actionConfig.type; 
        if (actionConfig.type === 'observationField') {
            actionDisplayName = `Set Field: "${actionConfig.fieldName || actionConfig.fieldId}" to "${actionConfig.displayValue || actionConfig.fieldValue}"`;
        } else if (actionConfig.type === 'addToProject') {
            actionDisplayName = `${actionConfig.remove ? 'Remove from' : 'Add to'} Project: "${actionConfig.projectName || actionConfig.projectId}"`;
        } else if (actionConfig.type === 'annotation') {
            const fieldName = getAnnotationFieldName(actionConfig.annotationField);
            const valueName = getAnnotationValueName(actionConfig.annotationField, actionConfig.annotationValue);
            actionDisplayName = `Annotation: ${fieldName} = ${valueName}`;
        } else if (actionConfig.type === 'addTaxonId') {
            actionDisplayName = `Add ID: ${actionConfig.taxonName}`;
        } else if (actionConfig.type === 'addComment') {
            actionDisplayName = `Add Comment: "${actionConfig.commentBody.substring(0,30)}..."`;
        } else if (actionConfig.type === 'qualityMetric') {
            actionDisplayName = `Quality Metric: ${getQualityMetricName(actionConfig.metric)} = ${actionConfig.vote}`;
        } else if (actionConfig.type === 'withdrawId') {
            actionDisplayName = `Withdraw Identification`;
        } else if (actionConfig.type === 'follow') {
            actionDisplayName = actionConfig.follow === 'follow' ? `Follow Observation` : `Unfollow Observation`;
        } else if (actionConfig.type === 'reviewed') {
            actionDisplayName = actionConfig.reviewed === 'mark' ? `Mark as Reviewed` : `Mark as Unreviewed`;
        } else if (actionConfig.type === 'copyObservationField') {
            actionDisplayName = `Copy Field: "${actionConfig.sourceFieldName}" to "${actionConfig.targetFieldName}"`;
        } else if (actionConfig.type === 'addToList') {
             actionDisplayName = `${actionConfig.remove ? 'Remove from' : 'Add to'} List ID: "${actionConfig.listId}"`;
        }

        contentHTML += `<div style="margin-bottom: 20px; padding: 10px; border: 1px solid #eee; border-radius: 4px;">`;
        contentHTML += `<h4 style="margin-top:0; margin-bottom: 10px; color: #333;">Action: ${actionDisplayName}</h4>`;

        if (success.length > 0) {
            const uniqueSuccessIds = [...new Set(success.map(s => s.observationId))];
            contentHTML += `<p style="color: green;">Succeeded for <a href="${generateObservationURL(uniqueSuccessIds)}" target="_blank" style="color: green; text-decoration: underline;">${uniqueSuccessIds.length} ${pluralize(uniqueSuccessIds.length, "observation")}</a>.</p>`;
        }

        if (failed.length > 0) {
            const actualFailures = failed.filter(f => f.reason !== 'safe_mode_skip');
            if (actualFailures.length > 0) {
                const uniqueFailedIds = [...new Set(actualFailures.map(f => f.observationId))];
                contentHTML += `<p style="color: red;">Failed for <a href="${generateObservationURL(uniqueFailedIds)}" target="_blank" style="color: red; text-decoration: underline;">${uniqueFailedIds.length} ${pluralize(uniqueFailedIds.length, "observation")}</a>:</p>`;
                contentHTML += `<div style="max-height: 150px; overflow-y: auto;"><ul>`;
                actualFailures.forEach(f => {
                    contentHTML += `<li><a href="https://www.inaturalist.org/observations/${f.observationId}" target="_blank">${f.observationId}</a>: ${getCleanErrorMessage(f.message || f.error)} ${f.reason && f.reason !== 'safe_mode_skip' ? `(${f.reason})` : ''}</li>`;
                });
                contentHTML += `</ul></div>`;
            }
        }
        
        if (skipped.length > 0) { 
            const uniqueSkippedIds = [...new Set(skipped.map(s => s.observationId))];
             contentHTML += `<p style="color: orange;">Skipped for <a href="${generateObservationURL(uniqueSkippedIds)}" target="_blank" style="color: orange; text-decoration: underline;">${uniqueSkippedIds.length} ${pluralize(uniqueSkippedIds.length, "observation")}</a> (e.g., no action needed):</p>`;
             if (uniqueSkippedIds.length <= 10 && uniqueSkippedIds.length > 0) { 
                contentHTML += `<div style="max-height: 100px; overflow-y: auto;"><ul>`;
                const displayedSkippedReasons = new Map();
                skipped.forEach(s => {
                    if (!displayedSkippedReasons.has(s.observationId)) {
                        contentHTML += `<li><a href="https://www.inaturalist.org/observations/${s.observationId}" target="_blank">${s.observationId}</a>: ${s.message || 'No specific message'} ${s.reason ? `(${s.reason})` : ''}</li>`;
                        displayedSkippedReasons.set(s.observationId, true);
                    }
                });
                contentHTML += `</ul></div>`;
             }
        }

        if (warnings.length > 0) { 
            const uniqueWarningIds = [...new Set(warnings.map(w => w.observationId))];
            contentHTML += `<p style="color: #c65102;">Warnings for <a href="${generateObservationURL(uniqueWarningIds)}" target="_blank" style="color: #c65102; text-decoration: underline;">${uniqueWarningIds.length} ${pluralize(uniqueWarningIds.length, "observation")}</a>:</p>`;
             if (uniqueWarningIds.length <= 10 && uniqueWarningIds.length > 0) { 
                contentHTML += `<div style="max-height: 100px; overflow-y: auto;"><ul>`;
                const displayedWarningReasons = new Map();
                warnings.forEach(w => { 
                     if (!displayedWarningReasons.has(w.observationId)) {
                        contentHTML += `<li><a href="https://www.inaturalist.org/observations/${w.observationId}" target="_blank">${w.observationId}</a>: ${w.message || 'No specific message'} ${w.reason ? `(${w.reason})` : ''}</li>`;
                        displayedWarningReasons.set(w.observationId, true);
                     }
                });
                contentHTML += `</ul></div>`;
             }
        }
        
        if (success.length === 0 && failed.filter(f => f.reason !== 'safe_mode_skip').length === 0 && skipped.length === 0 && warnings.length === 0) {
            contentHTML += `<p><em>No observations were processed or had issues for this specific action (they may have been skipped by Safe Mode overall).</em></p>`;
        }

        contentHTML += `</div>`; 
    }
    
    if (generalErrorMessages && generalErrorMessages.length > 0) {
        contentHTML += `
            <div style="margin: 15px 0; padding: 10px; background: #fff1f0; border: 1px solid #ffcccb; border-radius: 4px;">
                <h4>Overall Errors Encountered:</h4>
                <ul>${generalErrorMessages.map(err => `<li>${err}</li>`).join('')}</ul>
            </div>`;
    }

    // Add buttons based on auto-refresh setting
    if (autoRefreshAfterBulk) {
        // Auto-refresh is ON - show only Close button (refresh happens automatically via timer)
        contentHTML += `<button id="detailed-results-close-button" class="modal-button" style="margin-top:15px;">Close</button>`;
    } else {
        // Auto-refresh is OFF - show both Close and Close & Refresh buttons
        contentHTML += `
            <div style="display: flex; gap: 10px; margin-top: 15px; justify-content: flex-end;">
                <button id="detailed-results-close-button" class="modal-button">Close</button>
                <button id="detailed-results-close-refresh-button" class="modal-button" style="background-color: #4caf50; color: white;">Close and Refresh</button>
            </div>`;
    }

    content.innerHTML = contentHTML;
    modal.appendChild(content);
    document.body.appendChild(modal);

    const closeButton = content.querySelector('#detailed-results-close-button');
    const closeRefreshButton = content.querySelector('#detailed-results-close-refresh-button');

    // --- NEW: Keydown event listener for Enter/Escape ---
    const handleModalKeyPress = (event) => {
        if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault();
            closeButton.click(); // Simulate a click on the close button
        }
    };
    document.addEventListener('keydown', handleModalKeyPress);
    // --- END NEW ---

    if (closeButton) {
        closeButton.addEventListener('click', function() {
            document.removeEventListener('keydown', handleModalKeyPress);
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        });
    }

    if (closeRefreshButton) {
        closeRefreshButton.addEventListener('click', function() {
            document.removeEventListener('keydown', handleModalKeyPress);
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
            window.location.reload();
        });
    }

    return modal;
}

function getAnnotationValueName(fieldId, valueId) {
    for (let [key, value] of Object.entries(controlledTerms)) {
        if (value.id === parseInt(fieldId)) {
            for (let [valueName, valueIdInner] of Object.entries(value.values)) {
                if (valueIdInner === parseInt(valueId)) {
                    return valueName;
                }
            }
        }
    }
    return 'Unknown';
}

function getAnnotationFieldName(fieldId) {
    for (let [key, value] of Object.entries(controlledTerms)) {
        if (value.id === parseInt(fieldId)) {
            return key;
        }
    }
    return 'Unknown';
}