let dateSortNewestFirst = true;
let alphaSortAtoZ = true;
let lastUsedSort = 'date';
let searchTerm = '';
let observationFieldMap = {};
let configurationSets = [];
let optionsPageActiveSetName = ''; // Name of the set selected in the Options Page UI

const iNatSingleKeyPresses = [
    'x', 'r', 'c', 'a', 'i', 'f', 'z', 'space', 'left', 'right', 'up', 'down', '?',
    'e', 'l', 's', 'p'
];

const forbiddenShortcuts = [
    { ctrlKey: true, key: 'W' },  // Close tab
    { ctrlKey: true, key: 'T' },  // New tab
    { altKey: true, key: 'F4' },  // Close window
    { ctrlKey: true, shiftKey: true, key: 'W' },  // Close window
    { ctrlKey: true, shiftKey: true, key: 'T' }, // Reopen closed tab
    { altKey: true, key: 'B' },  // Firefox bookmarks
    { shiftKey: true, key: 'B' },  // Cycle button position
    { altKey: true, key: 'N' },    // Toggle button visibility
    { ctrlKey: true, shiftKey: true, key: 'R' },  // Toggle refresh
    { altKey: true, key: 'H' },     // Toggle shortcut list
    { shiftKey: true, key: 'V' },     // Toggle bulk action box
    { altKey: true, key: 'S' },     // Cycle button sets
    { altKey: true, key: 'M' }    // Toggle bulk action mode
];

const qualityMetrics = [
    { value: 'needs_id', label: 'Can the Community Taxon still be confirmed or improved?' },
    { value: 'date', label: 'Date is accurate' },
    { value: 'location', label: 'Location is accurate' },
    { value: 'wild', label: 'Organism is wild' },
    { value: 'evidence', label: 'Evidence of organism' },
    { value: 'recent', label: 'Recent evidence of organism' },
    { value: 'subject', label: 'Evidence related to a single subject' }
];

document.addEventListener('DOMContentLoaded', function() {
    // Initial data loading and UI setup
    loadOptionsPageData(); // This function now calls updateStorageUsageDisplay() internally
    populateFieldDatalist();
    displayLists();
    loadUndoRecords(); // For the modal, if it's present or built dynamically
    loadAutoFollowSettings();
    updateSortButtons();

    // Event Listeners for main configuration form
    document.getElementById('saveButton').addEventListener('click', saveConfiguration);
    document.getElementById('cancelButton').addEventListener('click', clearForm);
    document.getElementById('addActionButton').addEventListener('click', () => addActionToForm());

    // Event Listeners for sorting and filtering configurations
    document.getElementById('searchInput').addEventListener('input', filterConfigurations);
    document.getElementById('toggleDateSort').addEventListener('click', toggleDateSort);
    document.getElementById('toggleAlphaSort').addEventListener('click', toggleAlphaSort);

    // Event Listener for bulk actions page button
    const openBulkActionsButton = document.getElementById('openBulkActionsButton');
    if (openBulkActionsButton) { // Good practice to check if element exists
        openBulkActionsButton.addEventListener('click', () => {
            browserAPI.runtime.sendMessage({ action: "openBulkActionsPage" });
        });
    }

    // Event Listeners for import/export
    document.getElementById('exportButton').addEventListener('click', exportConfigurations);
    const importInput = document.getElementById('importInput');
    const importButton = document.getElementById('importButton');
    if (importInput && importButton) {
        importInput.addEventListener('change', importConfigurations);
        importButton.addEventListener('click', () => {
            importInput.click();
        });
    }

    // Event Listeners for configuration set management
    document.getElementById('createSetButton').addEventListener('click', createNewSet);
    document.getElementById('setSelector').addEventListener('change', handleOptionsPageSetSelectionChange); // Renamed for consistency if needed
    document.getElementById('duplicateSetButton').addEventListener('click', duplicateCurrentSet);
    document.getElementById('renameSetButton').addEventListener('click', renameCurrentSet);
    document.getElementById('removeSetButton').addEventListener('click', removeCurrentSet);

    // Event Listeners for auto-follow/review prevention settings
    document.getElementById('preventTaxonFollow').addEventListener('change', saveAutoFollowSettings);
    document.getElementById('preventFieldFollow').addEventListener('change', saveAutoFollowSettings);
    document.getElementById('preventTaxonReview').addEventListener('change', saveAutoFollowSettings);

    // Event Listeners for custom list management
    const createListButton = document.getElementById('createList');
    if (createListButton) {
        createListButton.addEventListener('click', createList);
    }
    const existingListsContainer = document.getElementById('existingLists');
    if (existingListsContainer) {
        existingListsContainer.addEventListener('click', function(e) {
            if (e.target.classList.contains('viewList')) {
                viewList(e.target.dataset.id);
            } else if (e.target.classList.contains('renameList')) {
                renameList(e.target.dataset.id);
            } else if (e.target.classList.contains('deleteList')) {
                deleteList(e.target.dataset.id);
            }
        });
    }

    // Event Listeners for bulk configuration actions (within the list)
    document.getElementById('selectAllConfigs').addEventListener('click', handleSelectAll);
    document.getElementById('clearSelectionBtn').addEventListener('click', clearSelection);
    document.getElementById('deleteSelectedBtn').addEventListener('click', () => performConfigurationAction('delete'));
    document.getElementById('hideSelectedBtn').addEventListener('click', () => performConfigurationAction('hide'));
    document.getElementById('showSelectedBtn').addEventListener('click', () => performConfigurationAction('show'));
    document.getElementById('disableSelectedBtn').addEventListener('click', () => performConfigurationAction('disable'));
    document.getElementById('enableSelectedBtn').addEventListener('click', () => performConfigurationAction('enable'));
    document.getElementById('expandSelectedConfigsBtn').addEventListener('click', expandSelectedConfigurations);
    document.getElementById('collapseSelectedConfigsBtn').addEventListener('click', collapseSelectedConfigurations);

    // UI Toggles for collapsible sections
    const shortcutsToggle = document.getElementById('hardcoded-shortcuts-toggle');
    const shortcutsList = document.getElementById('hardcoded-shortcuts-list');
    if (shortcutsToggle && shortcutsList) {
        shortcutsToggle.addEventListener('click', function() {
            const isHidden = shortcutsList.style.display === 'none';
            shortcutsList.style.display = isHidden ? 'block' : 'none';
            shortcutsToggle.textContent = isHidden ? 'General Shortcuts [-]' : 'General Shortcuts [+]';
        });
    }

    const preventionToggle = document.getElementById('auto-prevention-toggle');
    const preventionSettings = document.getElementById('auto-prevention-settings');
    if (preventionToggle && preventionSettings) {
        preventionToggle.addEventListener('click', function() {
            const isHidden = preventionSettings.style.display === 'none';
            preventionSettings.style.display = isHidden ? 'block' : 'none';
            preventionToggle.textContent = isHidden ? 'Prevent Auto-reviewed/Followed [-]' : 'Prevent Auto-reviewed/Followed [+]';
        });
    }
    
    // Modal related (if applicable)
    const showUndoRecordsButton = document.getElementById('showUndoRecordsButton');
    if (showUndoRecordsButton) {
        showUndoRecordsButton.addEventListener('click', showUndoRecordsModal);
    }

    // Storage change listener (only one needed)
    browserAPI.storage.onChanged.addListener(handleStorageChangeForOptionsPage); // Ensure this is the intended single handler
});  

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function updateStorageUsageDisplay() {
    const storageStatusElement = document.getElementById('storageStatus');

    // --- CRITICAL DEBUGGING ---
    console.log('Directly accessing browserAPI.storage.local.QUOTA_BYTES:', browserAPI.storage.local.QUOTA_BYTES, 
                'Type:', typeof browserAPI.storage.local.QUOTA_BYTES);
    // --- END CRITICAL DEBUGGING ---

    let totalQuota = browserAPI.storage.local.QUOTA_BYTES;

    // Fallback if QUOTA_BYTES is not a valid number (e.g., undefined, NaN, or 0)
    if (typeof totalQuota !== 'number' || isNaN(totalQuota) || totalQuota <= 0) {
        console.warn('browserAPI.storage.local.QUOTA_BYTES was invalid (' + totalQuota + '). Falling back to a default value of 5MB for Firefox.');
        totalQuota = 5 * 1024 * 1024; // 5,242,880 bytes - Standard Firefox local storage quota
    }

    // --- DEBUG LOG for browserAPI object structure ---
    if (browserAPI && browserAPI.storage && browserAPI.storage.local) {
        console.log("In updateStorageUsageDisplay - browserAPI.storage.local.getBytesInUse is:", browserAPI.storage.local.getBytesInUse, "(Type:", typeof browserAPI.storage.local.getBytesInUse, ")");
    } else {
        console.error("browserAPI or browserAPI.storage.local is not defined!");
        if (storageStatusElement) {
            storageStatusElement.textContent = 'Storage Usage: API Error';
            storageStatusElement.style.color = 'red';
        }
        return;
    }
    // --- END DEBUG LOG ---

    if (storageStatusElement && typeof browserAPI.storage.local.getBytesInUse === 'function') {
        try {
            browserAPI.storage.local.getBytesInUse(null, function(bytesInUse) {
                console.log("getBytesInUse callback invoked. bytesInUse:", bytesInUse, "typeof bytesInUse:", typeof bytesInUse);
                if (browserAPI.runtime.lastError) {
                    console.error("Error calling getBytesInUse:", browserAPI.runtime.lastError.message);
                    estimateStorageUsage(storageStatusElement, totalQuota); // Use the potentially corrected totalQuota
                    return;
                }

                if (typeof bytesInUse === 'number' && isFinite(bytesInUse)) {
                    displayFormattedUsage(bytesInUse, totalQuota, storageStatusElement); // Use the potentially corrected totalQuota
                } else {
                    console.warn("getBytesInUse did not return a valid number. Received:", bytesInUse, "Falling back to estimation.");
                    estimateStorageUsage(storageStatusElement, totalQuota); // Use the potentially corrected totalQuota
                }
            });
        } catch (e) {
            console.error("Synchronous error when trying to call getBytesInUse:", e, "Falling back to estimation.");
            estimateStorageUsage(storageStatusElement, totalQuota); // Use the potentially corrected totalQuota
        }
    } else if (storageStatusElement) {
        console.warn("browserAPI.storage.local.getBytesInUse is not available. Estimating usage instead.");
        estimateStorageUsage(storageStatusElement, totalQuota); // Use the potentially corrected totalQuota
    }
}

function estimateStorageUsage(statusElement, totalQuota) {
    browserAPI.storage.local.get(null, function(items) {
        if (browserAPI.runtime.lastError) {
            console.error("Error retrieving all items for size estimation:", browserAPI.runtime.lastError.message);
            statusElement.textContent = 'Storage Usage: Error estimating usage';
            statusElement.style.color = 'red';
            return;
        }

        try {
            // Estimate size based on the JSON stringified representation (UTF-8 bytes)
            const allDataString = JSON.stringify(items);
            const estimatedBytesInUse = new TextEncoder().encode(allDataString).length;
            
            console.log("Estimated storage usage (bytes):", estimatedBytesInUse);
            displayFormattedUsage(estimatedBytesInUse, totalQuota, statusElement, "(estimated)");

        } catch (e) {
            console.error("Error during size estimation process:", e);
            statusElement.textContent = 'Storage Usage: Estimation failed';
            statusElement.style.color = 'red';
        }
    });
}

function displayFormattedUsage(bytesInUse, totalQuota, element, suffix = "") {
    const usedFormatted = formatBytes(bytesInUse);
    const totalFormatted = formatBytes(totalQuota);
    const percentage = totalQuota > 0 ? ((bytesInUse / totalQuota) * 100).toFixed(1) : "0.0";
    
    element.textContent = `Storage Usage: ${usedFormatted} / ${totalFormatted} (${percentage}%) ${suffix}`;
    element.style.color = '#555'; // Default

    const numericPercentage = parseFloat(percentage);
    if (numericPercentage > 95) {
        element.style.color = 'red';
    } else if (numericPercentage > 80) {
        element.style.color = 'orange';
    }
}

async function setStorageWithQuotaCheck(dataToSet, keyBeingPrimarilyModified = null) {
    // --- START TEST MODIFICATION ---
    const IS_TESTING_QUOTA = false; 
    const REAL_QUOTA = browserAPI.storage.local.QUOTA_BYTES;
    let quotaToUse;

    if (IS_TESTING_QUOTA) {
        const TEST_QUOTA_MB = 0.01; // <<<  TRY A VERY SMALL VALUE, e.g., 0.01 MB = 10KB
        quotaToUse = TEST_QUOTA_MB * 1024 * 1024;
        if (document.getElementById('storageStatus')) { 
             console.warn(`INTERNAL QUOTA CHECK USING **TEST LIMIT**: ${formatBytes(quotaToUse)} (Real Total Quota is ${formatBytes(REAL_QUOTA)})`);
        }
    } else {
        quotaToUse = REAL_QUOTA;
    }
    // --- END TEST MODIFICATION ---
    
    const safetyMarginPercentage = 0.05; 
    let safetyMargin = safetyMarginPercentage * quotaToUse;

    if (IS_TESTING_QUOTA && quotaToUse < 50 * 1024) { 
         safetyMargin = 0.01 * quotaToUse; // Even smaller margin for tiny test quotas, like 1%
         console.log(`Using very small safety margin for test: ${formatBytes(safetyMargin)}`);
    }
    
    const currentStorageState = await new Promise(resolve => browserAPI.storage.local.get(null, data => resolve(data || {})));
    
    const nextFullStorageState = {
        ...currentStorageState,
        ...dataToSet
    };

    // Calculate size. JSON.stringify().length gives UTF-16 character count.
    // For a rough byte estimate, especially for ASCII/Latin1 heavy JSON, it's okay.
    // For more precision, you might use TextEncoder, but for quota check, this is usually sufficient.
    const estimatedTotalSizeAfterSave = new TextEncoder().encode(JSON.stringify(nextFullStorageState)).length;
    // const estimatedTotalSizeAfterSave = JSON.stringify(nextFullStorageState).length; // Original estimate

    console.log(`Check: Est. Size (bytes) ${formatBytes(estimatedTotalSizeAfterSave)}, Limit (incl. margin) ${formatBytes(quotaToUse - safetyMargin)}, Test Quota (raw) ${formatBytes(quotaToUse)}`);

    if (estimatedTotalSizeAfterSave > quotaToUse - safetyMargin) {
        // --- NEW DETAILED LOGS INSIDE THE IF BLOCK ---
        console.log(">>> QUOTA EXCEEDED CONDITION MET (TEST) <<<");
        console.log(`>>> Estimated: ${formatBytes(estimatedTotalSizeAfterSave)}, Limit: ${formatBytes(quotaToUse - safetyMargin)}`);
        // --- END NEW LOGS ---
    
        const limitFormatted = formatBytes(quotaToUse); 
        let alertMessage = `SAVE ABORTED (TEST): Saving would exceed test limit of ${limitFormatted}.\n\n`;
        alertMessage += `Estimated total storage required for this save: ${formatBytes(estimatedTotalSizeAfterSave)}.\n`;
        
        const currentBytesInUse = await new Promise(resolve => {
            if (browserAPI.storage.local.getBytesInUse) {
                browserAPI.storage.local.getBytesInUse(null, bytes => resolve(bytes));
            } else {
                resolve(null); 
            }
        });
    
        if (currentBytesInUse !== null) {
             alertMessage += `Current actual storage usage: ${formatBytes(currentBytesInUse)} (out of real ${formatBytes(REAL_QUOTA)}).\n\n`;
        }
        alertMessage += "Please remove some unused configurations to free up space.";
        if (IS_TESTING_QUOTA) {
            alertMessage += "\n(This limit was triggered by a test setting.)";
        }
        
        // --- NEW LOG BEFORE ALERT ---
        console.log(">>> Preparing to show alert (TEST):", alertMessage);
        // --- END NEW LOG ---
        
        alert(alertMessage); // THIS IS THE ALERT THAT SHOULD APPEAR
        
        // --- NEW LOG AFTER ALERT ---
        console.log(">>> Alert shown (TEST). Preparing to throw error.");
        // --- END NEW LOG ---
    
        console.warn(`Pre-save quota check ${IS_TESTING_QUOTA ? "(TEST)" : ""}: Estimated total size after save ${formatBytes(estimatedTotalSizeAfterSave)} EXCEEDS test quota ${formatBytes(quotaToUse)}. Save aborted.`);
        throw new Error(`Storage quota check failed ${IS_TESTING_QUOTA ? "(TEST)" : ""}: Estimated size exceeds quota. Save operation aborted.`);
    }

    // Proceed with saving the data
    return new Promise((resolve, reject) => {
        // ... (rest of the saving logic) ...
        browserAPI.storage.local.set(dataToSet, function() {
            if (browserAPI.runtime.lastError) {
                // ... error handling ...
            } else {
                console.log(`Data saved successfully via setStorageWithQuotaCheck (IS_TESTING_QUOTA: ${IS_TESTING_QUOTA})`);
                updateStorageUsageDisplay(); 
                resolve();
            }
        });
    });
}


function isShortcutForbidden(shortcut) {
    if (!shortcut) return false; // If no shortcut, it can't be forbidden

    // Check against predefined forbidden shortcuts
    const isForbidden = forbiddenShortcuts.some(forbidden => {
        return Object.keys(forbidden).every(key => 
            key === 'key' ? 
                forbidden[key].toLowerCase() === (shortcut.key || '').toLowerCase() :
                !!forbidden[key] === !!shortcut[key]
        );
    });

    // Check if it's a single key press used by iNaturalist
    const isSingleKeyPress = !shortcut.ctrlKey && !shortcut.shiftKey && !shortcut.altKey &&
                             iNatSingleKeyPresses.includes(shortcut.key.toLowerCase());

    return isForbidden || isSingleKeyPress;
}

function filterConfigurations() {
    searchTerm = document.getElementById('searchInput').value.toLowerCase();
    displayConfigurations();
}

function updateSortButtons() {
    const dateButton = document.getElementById('toggleDateSort');
    const alphaButton = document.getElementById('toggleAlphaSort');

    dateButton.textContent = dateSortNewestFirst ? 'Sorted Newest First' : 'Sorted Oldest First';
    alphaButton.textContent = alphaSortAtoZ ? 'Sorted A-Z' : 'Sorted Z-A';

    // Reset all button styles
    dateButton.classList.remove('active-sort', 'inactive-sort');
    alphaButton.classList.remove('active-sort', 'inactive-sort');
    dateButton.classList.add('sort-button');
    alphaButton.classList.add('sort-button');

    // Apply active and inactive styles
    if (lastUsedSort === 'date') {
        dateButton.classList.add('active-sort');
        alphaButton.classList.add('inactive-sort');
    } else {
        alphaButton.classList.add('active-sort');
        dateButton.classList.add('inactive-sort');
    }
}

function toggleDateSort() {
    dateSortNewestFirst = !dateSortNewestFirst;
    lastUsedSort = 'date';
    updateSortButtons();
    displayConfigurations();
}

function toggleAlphaSort() {
    alphaSortAtoZ = !alphaSortAtoZ;
    lastUsedSort = 'alpha';
    updateSortButtons();
    displayConfigurations();
}

function extractFormData() {
    return {
        name: document.getElementById('buttonName').value.trim(),
        shortcut: {
            key: document.getElementById('shortcut').value.trim().toUpperCase(),
            ctrlKey: document.getElementById('ctrlKey').checked,
            shiftKey: document.getElementById('shiftKey').checked,
            altKey: document.getElementById('altKey').checked
        },
        actions: extractActionsFromForm()
    };
}

function extractActionsFromForm() {
    return Array.from(document.querySelectorAll('.action-item')).map(actionDiv => {
        const actionType = actionDiv.querySelector('.actionType').value;
        const action = { type: actionType };

        switch (actionType) {
            case 'follow':
                action.follow = actionDiv.querySelector('input[name^="followToggle"]:checked').value; // Extract "follow" or "unfollow"
                break;
            case 'reviewed':
                action.reviewed = actionDiv.querySelector('input[name^="reviewedToggle"]:checked').value; // Extract "mark" or "unmark"
                break;                  
            case 'withdrawId' :
                break;
            case 'observationField':
                action.fieldId = actionDiv.querySelector('.fieldId').value.trim();
                action.fieldName = actionDiv.querySelector('.fieldName').value.trim();
                const fieldValueElement = actionDiv.querySelector('.fieldValue');
                action.fieldValue = fieldValueElement.dataset.taxonId || fieldValueElement.value.trim();
                action.displayValue = fieldValueElement.value.trim();
                break;
            case 'annotation':
                action.annotationField = actionDiv.querySelector('.annotationField').value;
                action.annotationValue = actionDiv.querySelector('.annotationValue').value;
                break;
            case 'addToProject':
                action.projectId = actionDiv.querySelector('.projectId').value.trim();
                action.projectName = actionDiv.querySelector('.projectName').value.trim();
                action.remove = actionDiv.querySelector('.removeFromProject').checked;
                break;
            case 'addComment':
                action.commentBody = actionDiv.querySelector('.commentBody').value.trim();
                break;
            case 'addTaxonId':
                const taxonNameInput = actionDiv.querySelector('.taxonName');
                action.taxonId = taxonNameInput.dataset.taxonId;
                action.taxonName = taxonNameInput.value.trim();
                action.comment = actionDiv.querySelector('.taxonComment').value.trim();
                action.disagreement = actionDiv.querySelector('.disagreementCheckbox').checked;
                break;
            case 'qualityMetric':
                action.metric = actionDiv.querySelector('.qualityMetricType').value;
                action.vote = actionDiv.querySelector('.qualityMetricVote').value;
                break;
            case 'copyObservationField':
                action.sourceFieldId = actionDiv.querySelector('.sourceFieldId').value.trim();
                action.sourceFieldName = actionDiv.querySelector('.sourceFieldName').value.trim();
                action.targetFieldId = actionDiv.querySelector('.targetFieldId').value.trim();
                action.targetFieldName = actionDiv.querySelector('.targetFieldName').value.trim();
                break;
            case 'addToList':
                action.listId = actionDiv.querySelector('.listSelect').value;
                action.remove = actionDiv.querySelector('.removeFromList').checked;
                break;
        }
        return action;
    });
}

function validateNewConfiguration(config, buttonsInCurrentSet) {
    if (!config.name) {
        throw new Error("Please enter a button name.");
    }
    const duplicateName = buttonsInCurrentSet.find(button => button.name === config.name);
    if (duplicateName) {
        throw new Error("This button name is already in use in the current set. Please choose a different name.");
    }
    if (config.shortcut && isShortcutForbidden(config.shortcut)) {
        throw new Error("This shortcut is not allowed as it conflicts with iNat shortcuts, browser functionality, or extension shortcuts.");
    }
    if (config.shortcut && (config.shortcut.key || config.shortcut.ctrlKey || config.shortcut.shiftKey || config.shortcut.altKey)) {
        const conflictingShortcut = buttonsInCurrentSet.find((button) => {
            return button.shortcut &&
                   button.shortcut.key === config.shortcut.key &&
                   button.shortcut.ctrlKey === config.shortcut.ctrlKey &&
                   button.shortcut.shiftKey === config.shortcut.shiftKey &&
                   button.shortcut.altKey === config.shortcut.altKey;
        });
        if (conflictingShortcut) {
            throw new Error(`This shortcut is already used for the button: "${conflictingShortcut.name}" in the current set. Please choose a different shortcut.`);
        }
    }
    validateCommonConfiguration(config);
}

function validateEditConfiguration(config, originalConfig, buttonsInCurrentSet) {
    if (!config.name) {
        throw new Error("Please enter a button name.");
    }
    const duplicateName = buttonsInCurrentSet.find(button => button.name === config.name && button.id !== originalConfig.id);
    if (duplicateName) {
        throw new Error("This button name is already in use in the current set. Please choose a different name.");
    }
    if (config.shortcut && isShortcutForbidden(config.shortcut)) {
        throw new Error("This shortcut is not allowed as it conflicts with browser functionality or extension shortcuts.");
    }
    if (config.shortcut && (config.shortcut.key || config.shortcut.ctrlKey || config.shortcut.shiftKey || config.shortcut.altKey)) {
        const conflictingShortcut = buttonsInCurrentSet.find((button) => {
            return button.id !== originalConfig.id &&
                   button.shortcut &&
                   button.shortcut.key === config.shortcut.key &&
                   button.shortcut.ctrlKey === config.shortcut.ctrlKey &&
                   button.shortcut.shiftKey === config.shortcut.shiftKey &&
                   button.shortcut.altKey === config.shortcut.altKey;
        });
        if (conflictingShortcut) {
            throw new Error(`This shortcut is already used for the button: "${conflictingShortcut.name}" in the current set. Please choose a different shortcut.`);
        }
    }
    validateCommonConfiguration(config);
}

function validateCommonConfiguration(config) {
    if (config.actions.length === 0) {
        throw new Error("Please add at least one action to the configuration.");
    }

    if (config.shortcut) {
        if (!config.shortcut.key && (config.shortcut.ctrlKey || config.shortcut.shiftKey || config.shortcut.altKey)) {
            throw new Error("A key must be selected along with modifier keys for the shortcut.");
        }
    }

    config.actions.forEach(action => {
        switch (action.type) {
            case 'follow':
                if (!['follow', 'unfollow'].includes(action.follow)) {
                    throw new Error("Invalid follow action type. Must be 'follow' or 'unfollow'.");
                }
                break;
            case 'reviewed':
                if (!['mark', 'unmark'].includes(action.reviewed)) {
                    throw new Error("Invalid reviewed action type. Must be 'mark' or 'unmark'.");
                }
                break;                      
            case 'withdrawId' :
                break;
            case 'observationField':
                if (!action.fieldId || !action.fieldName || !action.fieldValue) {
                    throw new Error("Please enter Field Name, ID, and Value for all Observation Field actions.");
                }
                break;
            case 'annotation':
                if (!action.annotationField || !action.annotationValue) {
                    throw new Error("Please select both Annotation Field and Annotation Value for all Annotation actions.");
                }
                break;
            case 'addToProject':
                if (!action.projectId || !action.projectName) {
                    throw new Error("Please enter both Project Name and ID for all Add to Project actions.");
                }
                break;
            case 'addComment':
                if (!action.commentBody) {
                    throw new Error("Please enter a comment body for all Add Comment actions.");
                }
                break;
            case 'addTaxonId':
                if (!action.taxonId || !action.taxonName) {
                    throw new Error("Please select a valid taxon for all Add Taxon ID actions.");
                }
                break;
            case 'qualityMetric':
                if (!action.metric || !action.vote) {
                    throw new Error("Please select both a metric and a vote for all Quality Metric actions.");
                }
                break;
            case 'copyObservationField':
                if (!action.sourceFieldId || !action.sourceFieldName || !action.targetFieldId || !action.targetFieldName) {
                    throw new Error("Please enter Source Field Name, ID, Target Field Name, and ID for all Copy Observation Field actions.");
                }
                break;
        }
    });
}

async function saveConfiguration() {
    try {
        const formData = extractFormData();
        const editId = document.getElementById('saveButton').dataset.editIndex;
        const currentlySelectedSetInUI = document.getElementById('setSelector').value;

        // It's important that latestConfigurationSets is fetched fresh or is a deep copy
        // if it's based on the global `configurationSets`, to avoid modifying global state prematurely.
        const storageData = await new Promise(resolve => browserAPI.storage.local.get(['configurationSets'], resolve));
        let latestConfigurationSets = JSON.parse(JSON.stringify(storageData.configurationSets || [{ name: 'Default Set', buttons: [] }]));


        const targetSetIndex = latestConfigurationSets.findIndex(set => set.name === currentlySelectedSetInUI);
        if (targetSetIndex === -1) {
            // This case should ideally not happen if UI is synchronized
            throw new Error(`Set "${currentlySelectedSetInUI}" not found. Cannot save button.`);
        }
        const targetSetObject = latestConfigurationSets[targetSetIndex];

        let originalConfig = null; // For edit mode
        if (editId) {
            originalConfig = targetSetObject.buttons.find(c => c.id === editId);
            if (!originalConfig) {
                // This might happen if the config was deleted from another tab/window
                throw new Error(`Button with ID ${editId} not found in set "${targetSetObject.name}" for editing. The configuration might have been changed or deleted elsewhere.`);
            }
            validateEditConfiguration(formData, originalConfig, targetSetObject.buttons);
        } else {
            validateNewConfiguration(formData, targetSetObject.buttons);
        }

        const newConfigData = {
            id: editId || Date.now().toString(),
            ...formData,
            buttonHidden: (editId && originalConfig) ? originalConfig.buttonHidden : false,
            configurationDisabled: (editId && originalConfig) ? originalConfig.configurationDisabled : false,
        };

        const existingButtonIndex = targetSetObject.buttons.findIndex(c => c.id === newConfigData.id);
        if (existingButtonIndex !== -1) {
            targetSetObject.buttons[existingButtonIndex] = newConfigData;
        } else {
            targetSetObject.buttons.push(newConfigData);
            // Handle custom order if it exists
            if (targetSetObject.customOrder && Array.isArray(targetSetObject.customOrder)) {
                targetSetObject.customOrder.push(newConfigData.id);
            } else if (targetSetObject.buttonOrder && Array.isArray(targetSetObject.buttonOrder)) { // Legacy
                 targetSetObject.buttonOrder.push(newConfigData.id);
            }
        }

        // Preserve UI states like expanded details
        const expandedStates = {};
        document.querySelectorAll('.config-item').forEach(item => {
            const details = item.querySelector('.config-details');
            if (details) {
                expandedStates[item.dataset.id] = details.style.display === 'block';
            }
        });

        const dataToSave = {
            configurationSets: latestConfigurationSets,
            lastConfigUpdate: Date.now()
        };

        await setStorageWithQuotaCheck(dataToSave, 'configurationSets'); // Use the helper

        // If save is successful, update global state and UI
        configurationSets = latestConfigurationSets; // Update the global variable
        optionsPageActiveSetName = currentlySelectedSetInUI;

        clearForm();
        displayConfigurations(); // This will re-render based on the new global `configurationSets`

        // Restore expanded states
        setTimeout(() => {
            Object.entries(expandedStates).forEach(([id, isExpanded]) => {
                const configDiv = document.querySelector(`.config-item[data-id="${id}"]`);
                if (configDiv) {
                    const details = configDiv.querySelector('.config-details');
                    const toggle = configDiv.querySelector('.toggle-details');
                    if (details && toggle) {
                        details.style.display = isExpanded ? 'block' : 'none';
                        toggle.innerHTML = isExpanded ? '▲' : '▼';
                    }
                }
            });
            // Ensure the newly saved/updated config is expanded if it was before or is new
             const newOrUpdatedConfigDiv = document.querySelector(`.config-item[data-id="${newConfigData.id}"]`);
             if (newOrUpdatedConfigDiv) {
                const details = newOrUpdatedConfigDiv.querySelector('.config-details');
                const toggle = newOrUpdatedConfigDiv.querySelector('.toggle-details');
                if (details && toggle && (expandedStates[newConfigData.id] || !editId)) { // Expand if new or was expanded
                    details.style.display = 'block';
                    toggle.innerHTML = '▲';
                }
             }
        }, 100);

    } catch (error) {
        // Errors from validation or setStorageWithQuotaCheck will be caught here.
        // setStorageWithQuotaCheck already shows an alert for quota issues.
        // Validation errors are also alerted.
        if (!error.message.startsWith("Storage quota check failed") && 
            !error.message.startsWith("Please enter") && 
            !error.message.includes("already in use") &&
            !error.message.includes("not allowed") &&
            !error.message.includes("must be selected") &&
            !error.message.includes("Please add at least one action")) {
            // Alert for other unexpected errors
            alert(`An unexpected error occurred: ${error.message}`);
        }
        console.error("Error saving configuration:", error);
        // No need to call updateStorageUsageDisplay here as setStorageWithQuotaCheck handles it.
    }
}

function editConfiguration(configId) {
    const currentSet = getCurrentSet();
    if (!currentSet) return;

    const config = currentSet.buttons.find(c => c.id === configId);
    if (!config) {
        console.error(`Configuration with id ${configId} not found`);
        return;
    }

    // Populate form fields with config data
    document.getElementById('buttonName').value = config.name;
    
    if (config.shortcut) {
        document.getElementById('ctrlKey').checked = config.shortcut.ctrlKey;
        document.getElementById('shiftKey').checked = config.shortcut.shiftKey;
        document.getElementById('altKey').checked = config.shortcut.altKey;
        document.getElementById('shortcut').value = config.shortcut.key;
    } else {
        document.getElementById('ctrlKey').checked = false;
        document.getElementById('shiftKey').checked = false;
        document.getElementById('altKey').checked = false;
        document.getElementById('shortcut').value = '';
    }

    document.getElementById('actionsContainer').innerHTML = '';
    config.actions.forEach(action => {
        const actionDiv = addActionToForm(action);
        populateActionInputs(actionDiv, action);
    });

    const saveButton = document.getElementById('saveButton');
    saveButton.textContent = 'Update Configuration';
    saveButton.dataset.editIndex = configId;

    window.scrollTo(0, 0);
}

function populateActionInputs(actionDiv, action) {
    console.log('Populating action inputs for:', action.type);
    const actionType = actionDiv.querySelector('.actionType');
    actionType.value = action.type;
    actionType.dispatchEvent(new Event('change'));

    switch (action.type) {
        case 'follow':
            const followRadios = actionDiv.querySelectorAll('input[name^="followToggle"]');
            followRadios.forEach(radio => {
                if (radio.value === action.follow) {
                    radio.checked = true;
                }
            });
            break;
        case 'reviewed':
            const reviewedRadios = actionDiv.querySelectorAll('input[name^="reviewedToggle"]');
            reviewedRadios.forEach(radio => {
                if (radio.value === action.reviewed) {
                    radio.checked = true;
                }
            });
            break;
        case 'withdrawId':
            break;
        case 'observationField':
            actionDiv.querySelector('.fieldName').value = action.fieldName || '';
            actionDiv.querySelector('.fieldId').value = action.fieldId || '';
            actionDiv.querySelector('.fieldValue').value = action.fieldValue || '';
            break;
        case 'annotation':
            actionDiv.querySelector('.annotationField').value = action.annotationField || '';
            const annotationValue = actionDiv.querySelector('.annotationValue');
            updateAnnotationValues(actionDiv.querySelector('.annotationField'), annotationValue);
            annotationValue.value = action.annotationValue || '';
            break;
        case 'addToProject':
            actionDiv.querySelector('.projectName').value = action.projectName || '';
            actionDiv.querySelector('.projectId').value = action.projectId || '';
            const removeCheckbox = actionDiv.querySelector('.removeFromProject');
            if (removeCheckbox) {
                removeCheckbox.checked = action.remove || false;
            }
            break;
        case 'addComment':
            actionDiv.querySelector('.commentBody').value = action.commentBody || '';
            break;
        case 'addTaxonId':
            actionDiv.querySelector('.taxonName').value = action.taxonName || '';
            actionDiv.querySelector('.taxonId').value = action.taxonId || '';
            actionDiv.querySelector('.taxonComment').value = action.comment || '';
            if (actionDiv.querySelector('.disagreementCheckbox')) {
                actionDiv.querySelector('.disagreementCheckbox').checked = action.disagreement || false;
            }
            break;
        case 'qualityMetric':
            actionDiv.querySelector('.qualityMetricType').value = action.metric || '';
            actionDiv.querySelector('.qualityMetricVote').value = action.vote || '';
            break;
        case 'copyObservationField':
            actionDiv.querySelector('.sourceFieldName').value = action.sourceFieldName || '';
            actionDiv.querySelector('.sourceFieldId').value = action.sourceFieldId || '';
            actionDiv.querySelector('.targetFieldName').value = action.targetFieldName || '';
            actionDiv.querySelector('.targetFieldId').value = action.targetFieldId || '';
            break;
        case 'addToList':
            const listSelect = actionDiv.querySelector('.listSelect');
            if (listSelect) {
                console.log('Refreshing list select for existing Add to List action');
                refreshListSelect(listSelect);
                setTimeout(() => {
                    console.log('Setting list select value to:', action.listId);
                    listSelect.value = action.listId || '';
                }, 100);
            }
            break;
    }
}

function duplicateConfiguration(configId) {
    const currentSet = getCurrentSet();
    if (!currentSet) return;

    const config = currentSet.buttons.find(c => c.id === configId);
    if (!config) {
        console.error(`Configuration with id ${configId} not found`);
        return;
    }

    editConfiguration(configId); // Reuse edit logic to populate form

    document.getElementById('buttonName').value = `${config.name} (Copy)`;

    const saveButton = document.getElementById('saveButton');
    saveButton.textContent = 'Save New Configuration';
    delete saveButton.dataset.editIndex;
}

function addActionToForm(action = null) {
    const actionDiv = document.createElement('div');
    actionDiv.className = 'action-item';
    actionDiv.innerHTML = `
        <select class="actionType">
            <option value="addTaxonId">Add Taxon ID</option>
            <option value="withdrawId">Withdraw ID</option>
            <option value="addComment">Add Comment</option>
            <option value="annotation">Annotation</option> 
            <option value="addToProject">Add to/Remove from Project</option>
            <option value="observationField">Observation Field</option>
            <option value="copyObservationField">Copy Observation Field</option>
            <option value="qualityMetric">Data Quality Indicators</option>
            <option value="follow">Follow/Unfollow Observation</option>
            <option value="reviewed">Mark Observation as Reviewed/Unreviewed</option>                                    
            <option value="addToList">Add/Remove Observation To/From List</option>
        </select>
       <div class="follow-options" style="display: none;">
            <div class="inline-radio">
                <input type="radio" id="follow" name="followToggle" value="follow" checked>
                <label for="follow">Follow</label>
                <input type="radio" id="unfollow" name="followToggle" value="unfollow">
                <label for="unfollow">Unfollow</label>
            </div>
        </div>
        <div class="reviewed-options" style="display: none;">
            <div class="inline-radio">
                <input type="radio" id="markReviewed" name="reviewedToggle" value="mark" checked>
                <label for="markReviewed">Mark as Reviewed</label>
                <input type="radio" id="unmarkReviewed" name="reviewedToggle" value="unmark">
                <label for="unmarkReviewed">Mark as Unreviewed</label>
            </div>
        </div>
        <div class="ofInputs">
            <input type="text" class="fieldName" placeholder="Observation Field Name">
            <input type="number" class="fieldId" placeholder="Field ID" readonly>
            <div class="fieldValueContainer">
                <input type="text" class="fieldValue" placeholder="Field Value">
            </div>
            <p class="fieldDescription"></p>
        </div>
        <div class="annotationInputs" style="display:none;">
            <select class="annotationField"></select>
            <select class="annotationValue"></select>
        </div>
        <div class="projectInputs" style="display:none;">
            <input type="text" class="projectName" placeholder="Project Name">
            <input type="number" class="projectId" placeholder="Project ID" readonly>
            <div class="checkboxContainer" style="display: flex; align-items: center; margin-top: 10px;">
                <input type="checkbox" id="removeFromProject-${Date.now()}" class="removeFromProject">
                <label for="removeFromProject-${Date.now()}" style="margin-left: 5px; font-size: 14px; cursor: pointer;">
                    Remove from project instead of adding (NOTE: observations cannot be removed from projects with automatic inclusion! You also may not have permission to remove observations other users have added to projects.)
                </label>
            </div>
        </div>
        <div class="commentInput" style="display:none;">
            <textarea class="commentBody" placeholder="Enter comment"></textarea>
        </div>
        <div class="taxonIdInputs" style="display:none;">
            <input type="text" class="taxonName" placeholder="Taxon Name (or ID)">
            <input type="hidden" class="taxonId">
        </div>
        <div class="qualityMetricInputs" style="display:none;">
            <select class="qualityMetricType">
                ${qualityMetrics.map(metric => `<option value="${metric.value}">${metric.label}</option>`).join('')}
            </select>
            <select class="qualityMetricVote">
                <option value="agree">Agree</option>
                <option value="disagree">Disagree</option>
                <option value="remove">Remove Vote</option>
            </select>
        </div>
        <div class="copyObservationFieldInputs" style="display:none;">
            <input type="text" class="sourceFieldName" placeholder="Source Field Name">
            <input type="number" class="sourceFieldId" placeholder="Source Field ID" readonly>
            <input type="text" class="targetFieldName" placeholder="Target Field Name">
            <input type="number" class="targetFieldId" placeholder="Target Field ID" readonly>
        </div>        
        <div class="addToListInputs" style="display:none;">
            <select class="listSelect">
                <option value="">Select a List</option>
            </select>
            <!-- Add checkbox and label directly here -->
            <div class="checkboxContainer" style="display: flex; align-items: center; margin-top: 10px;">
                <input type="checkbox" id="removeFromList-${Date.now()}" class="removeFromList">
                <label for="removeFromList-${Date.now()}" style="margin-left: 5px; font-size: 14px; cursor: pointer;">
                    Remove from list instead of adding
                </label>
            </div>
        </div>
        <button class="removeActionButton">Remove Action</button>

    `;
    document.getElementById('actionsContainer').appendChild(actionDiv);

    const actionType = actionDiv.querySelector('.actionType');
    const followOptions = actionDiv.querySelector('.follow-options');
    const reviewedOptions = actionDiv.querySelector('.reviewed-options');
    const ofInputs = actionDiv.querySelector('.ofInputs');
    const annotationInputs = actionDiv.querySelector('.annotationInputs');
    const commentInput = actionDiv.querySelector('.commentInput');
    const projectInputs = actionDiv.querySelector('.projectInputs');
    const taxonIdInputs = actionDiv.querySelector('.taxonIdInputs');
    const qualityMetricInputs = actionDiv.querySelector('.qualityMetricInputs');
    const copyObservationFieldInputs = actionDiv.querySelector('.copyObservationFieldInputs');
    const addToListInputs = actionDiv.querySelector('.addToListInputs');
    const listSelect = actionDiv.querySelector('.listSelect');
    if (taxonIdInputs) {
        taxonIdInputs.innerHTML += `
        <textarea class="taxonComment" placeholder="Enter comment (optional)"></textarea>
        <div class="checkboxContainer" style="display: flex; align-items: center; margin-top: 10px; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="disagreement-${Date.now()}" class="disagreementCheckbox" style="margin: 0;">
                <label for="disagreement-${Date.now()}" style="margin: 0; font-size: 14px; cursor: pointer; line-height: 1.4;">
                    Disagree with current ID (only affects higher level IDs; otherwise default behavior applies)
                </label>
            </div>
        </div>
    `;
    }
    actionType.addEventListener('change', () => {
        ofInputs.style.display = actionType.value === 'observationField' ? 'block' : 'none';
        annotationInputs.style.display = actionType.value === 'annotation' ? 'block' : 'none';
        projectInputs.style.display = actionType.value === 'addToProject' ? 'block' : 'none';
        commentInput.style.display = actionType.value === 'addComment' ? 'block' : 'none';
        taxonIdInputs.style.display = actionType.value === 'addTaxonId' ? 'block' : 'none';
        qualityMetricInputs.style.display = actionType.value === 'qualityMetric' ? 'block' : 'none';
        copyObservationFieldInputs.style.display = actionType.value === 'copyObservationField' ? 'block' : 'none';
        addToListInputs.style.display = actionType.value === 'addToList' ? 'block' : 'none';
        followOptions.style.display = actionType.value === 'follow' ? 'block' : 'none'; // Add this line
        reviewedOptions.style.display = actionType.value === 'reviewed' ? 'block' : 'none'; // Add this line
    
        if (actionType.value === 'addToList') {
            console.log('Add to List selected, refreshing list select');
            refreshListSelect(listSelect);
            
            // Clear only the list select element, not the entire div
            const listSelectElement = addToListInputs.querySelector('.listSelect');
            
            if (listSelectElement) {
                addToListInputs.removeChild(listSelectElement); // Remove only the list select element
            }
            
            // Re-append the list select element in the correct order
            if (!addToListInputs.querySelector('.listSelect')) {
                addToListInputs.insertBefore(listSelect, addToListInputs.firstChild); // Insert before any existing children
            }
        }
              
        
    });

    actionType.dispatchEvent(new Event('change'));

    // Populate list select
    browserAPI.storage.local.get('customLists', function(data) {
    const customLists = data.customLists || [];
    customLists.forEach(list => {
        const option = document.createElement('option');
        option.value = list.id;
        option.textContent = list.name;
        listSelect.appendChild(option);
    });
    });

    const fieldNameInput = actionDiv.querySelector('.fieldName');
    const fieldIdInput = actionDiv.querySelector('.fieldId');
    const fieldValueContainer = actionDiv.querySelector('.fieldValueContainer');
    const fieldValueInput = fieldValueContainer.querySelector('.fieldValue');
    
    setupAutocompleteDropdown(fieldNameInput, lookupObservationField, (result) => {
        fieldIdInput.value = result.id;
        const updatedFieldValueInput = updateFieldValueInput(result, fieldValueContainer);
        if (result.datatype === 'taxon') {
            setupTaxonAutocompleteForInput(updatedFieldValueInput);
        }
    });

    const taxonNameInput = actionDiv.querySelector('.taxonName');
    const taxonIdInput = actionDiv.querySelector('.taxonId');
    
    function setupTaxonAutocompleteForInput(input, idInput) {
        if (input) {
            setupTaxonAutocomplete(input, idInput);
            input.addEventListener('focus', () => {
                if (input.value.length >= 2) {
                    input.dispatchEvent(new Event('input'));
                }
            });
        }
    }
          
    setupTaxonAutocompleteForInput(taxonNameInput, taxonIdInput);

    const projectNameInput = actionDiv.querySelector('.projectName');
    const projectIdInput = actionDiv.querySelector('.projectId');
    setupAutocompleteDropdown(projectNameInput, lookupProject, (result) => {
        projectIdInput.value = result.id;
    });

    const annotationField = actionDiv.querySelector('.annotationField');
    const annotationValue = actionDiv.querySelector('.annotationValue');
    populateAnnotationFields(annotationField);
    annotationField.addEventListener('change', () => updateAnnotationValues(annotationField, annotationValue));

    const sourceFieldNameInput = actionDiv.querySelector('.sourceFieldName');
    const sourceFieldIdInput = actionDiv.querySelector('.sourceFieldId');
    setupAutocompleteDropdown(sourceFieldNameInput, lookupObservationField, (result) => {
        sourceFieldIdInput.value = result.id;
    });

    const targetFieldNameInput = actionDiv.querySelector('.targetFieldName');
    const targetFieldIdInput = actionDiv.querySelector('.targetFieldId');
    setupAutocompleteDropdown(targetFieldNameInput, lookupObservationField, (result) => {
        targetFieldIdInput.value = result.id;
    });

    const removeButton = actionDiv.querySelector('.removeActionButton');
    removeButton.addEventListener('click', () => actionDiv.remove());

    if (action) {
        actionType.value = action.type;
        actionType.dispatchEvent(new Event('change'));
    
    }
    return actionDiv;  // Make sure to return the actionDiv
}

function refreshListSelect(selectElement) {
    console.log('Refreshing list select');
    browserAPI.storage.local.get('customLists', function(data) {
        const customLists = data.customLists || [];
        console.log('Custom lists:', customLists);
        selectElement.innerHTML = '<option value="">Select a List</option>';
        customLists.forEach(list => {
            const option = document.createElement('option');
            option.value = list.id;
            option.textContent = list.name;
            selectElement.appendChild(option);
        });
        console.log('List select refreshed with options:', selectElement.innerHTML);
    });
}


function updateAllListSelects() {
    const listSelects = document.querySelectorAll('.listSelect');
    listSelects.forEach(refreshListSelect);
}

function loadOptionsPageData() {
    updateStorageUsageDisplay();
    browserAPI.storage.local.get(
        ['configurationSets', 'currentOptionsPageSetName', 'contentScriptActiveSetName', 'observationFieldMap'],
        function(data) {
            configurationSets = data.configurationSets || [];
            if (configurationSets.length === 0) { // Ensure default set if absolutely empty
                const defaultSet = { name: 'Default Set', buttons: [] };
                configurationSets.push(defaultSet);
                // Save this immediately if it was created
                browserAPI.storage.local.set({
                    configurationSets: configurationSets,
                    currentOptionsPageSetName: defaultSet.name, // Set for options
                    contentScriptActiveSetName: defaultSet.name  // Set for content too
                }, () => {
                    optionsPageActiveSetName = defaultSet.name;
                    observationFieldMap = data.observationFieldMap || {};
                    updateSetSelector();
                    displayConfigurations();
                    updateSetManagementButtons();
                    populateFieldDatalist();
                });
                return; // Return early, UI will update after save
            }

            // Determine the set to display in THIS options page instance
            optionsPageActiveSetName = data.currentOptionsPageSetName || // 1. Last viewed in options
                                       data.contentScriptActiveSetName || // 2. What's active on content.js
                                       (configurationSets[0] ? configurationSets[0].name : ''); // 3. First available

            // Ensure optionsPageActiveSetName is valid
            if (!configurationSets.some(set => set.name === optionsPageActiveSetName) && configurationSets.length > 0) {
                optionsPageActiveSetName = configurationSets[0].name;
            }
            
            // Save currentOptionsPageSetName if it was just determined or changed by fallback
            if (data.currentOptionsPageSetName !== optionsPageActiveSetName) {
                browserAPI.storage.local.set({ currentOptionsPageSetName: optionsPageActiveSetName });
            }

            // If contentScriptActiveSetName is missing entirely, set it to a sensible default (e.g., the first set)
            // This is a one-time initialization for content.js if it was never set.
            if (!data.contentScriptActiveSetName && configurationSets.length > 0) {
                browserAPI.storage.local.set({ contentScriptActiveSetName: configurationSets[0].name });
            }


            observationFieldMap = data.observationFieldMap || {};
            updateSetSelector();
            displayConfigurations();
            updateSetManagementButtons();
            populateFieldDatalist();
        }
    );
}

async function displayConfigurations() {
    const container = document.getElementById('buttonConfigs');
    const previouslyExpandedIds = new Set();

    // Before clearing, record which items were expanded
    // Ensure we are querying within the correct container if it might be dynamically populated elsewhere first
    // For this options page, 'container' should be the correct one.
    container.querySelectorAll('.config-item').forEach(item => {
        const details = item.querySelector('.config-details');
        if (details && details.style.display === 'block') {
            previouslyExpandedIds.add(item.dataset.id);
        }
    });

    container.innerHTML = ''; // Clear existing configurations from the display

    const currentSet = getCurrentSet(); // getCurrentSet() should return the set object based on optionsPageActiveSetName
    if (!currentSet) {
        console.error('Current set not found. Cannot display configurations.');
        // Optionally display a message in the container
        // container.textContent = 'No configuration set selected or an error occurred.';
        return;
    }

    if (!currentSet.buttons || currentSet.buttons.length === 0) {
        // console.log('No buttons in the current set to display.');
        // Optionally display a message
        // container.textContent = 'This configuration set is empty.';
        // return; // Keep this commented if you want an empty filterable list
    }


    let buttonsToDisplay = [...currentSet.buttons]; // Create a new array to avoid modifying the original

    // Apply sorting
    if (lastUsedSort === 'date') {
        buttonsToDisplay.sort((a, b) => {
            // Assuming IDs are sortable chronologically (e.g., timestamps or incrementing numbers)
            const idA = parseInt(a.id, 10) || 0;
            const idB = parseInt(b.id, 10) || 0;
            return dateSortNewestFirst ? (idB - idA) : (idA - idB);
        });
    } else { // lastUsedSort === 'alpha'
        buttonsToDisplay.sort((a, b) => {
            return alphaSortAtoZ ?
                a.name.localeCompare(b.name) :
                b.name.localeCompare(a.name);
        });
    }

    // Apply filtering (if searchTerm is not empty)
    const filteredButtons = searchTerm ? buttonsToDisplay.filter(config => {
        const nameMatch = config.name.toLowerCase().includes(searchTerm);
        if (nameMatch) return true;
        // Check if any action's formatted string matches the search term
        // This requires formatAction to be synchronous or for this filtering to handle promises.
        // For simplicity, if formatAction is async, this part of filtering might need adjustment
        // or formatAction needs a synchronous version for filtering.
        // Assuming formatAction can be called and its result (even if a promise) can be eventually checked.
        // For now, let's assume a simple check on readily available action properties for filtering if formatAction is async.
        // A more robust way if formatAction is async would be to pre-format all actions or filter after formatting.
        // This is a simplification for the example:
        const actionMatch = config.actions.some(action => {
            // Simple sync check for demonstration; real async formatAction would require different handling here.
            if (action.type === 'addComment' && action.commentBody) return action.commentBody.toLowerCase().includes(searchTerm);
            if (action.type === 'addTaxonId' && action.taxonName) return action.taxonName.toLowerCase().includes(searchTerm);
            // Add more simple checks for other action types if needed for filtering
            return false;
        });
        return actionMatch;
    }) : buttonsToDisplay;


    if (filteredButtons.length === 0 && searchTerm) {
        container.textContent = 'No configurations match your search term.';
    } else if (filteredButtons.length === 0 && currentSet.buttons && currentSet.buttons.length > 0) {
        container.textContent = 'No configurations to display (they might all be filtered out).';
    } else if (!currentSet.buttons || currentSet.buttons.length === 0) {
        container.textContent = 'This configuration set is empty.';
    }


    for (const config of filteredButtons) {
        const configDiv = document.createElement('div');
        configDiv.className = 'config-item';
        configDiv.dataset.id = config.id;
        if (config.configurationDisabled) {
            configDiv.classList.add('disabled-config');
        }

        // Await formatted actions if formatAction is async
        const actionsHtmlPromises = config.actions.map(action => formatAction(action));
        const resolvedActionsHtml = await Promise.all(actionsHtmlPromises);
        const actionsHtmlString = resolvedActionsHtml.map(formattedAction => `<p>${formattedAction}</p>`).join('');

        configDiv.innerHTML = `
            <div class="config-header">
                <input type="checkbox" class="configuration-checkbox" data-config-id="${config.id}">
                <span class="config-name">${config.name}</span>
                <span class="config-shortcut">${formatShortcut(config.shortcut)}</span>
                <span class="toggle-details"></span> <!-- Placeholder, will be filled below -->
            </div>
            <div class="config-details" style="display: none;"> <!-- Default to none -->
                ${actionsHtmlString}
                <div class="button-actions">
                    <label><input type="checkbox" class="hide-button-checkbox" ${config.buttonHidden ? 'checked' : ''}> Hide Button</label>
                    <label><input type="checkbox" class="disable-config-checkbox" ${config.configurationDisabled ? 'checked' : ''}> Disable Configuration</label>
                    <button class="edit-button">Edit</button>
                    <button class="duplicate-button">Duplicate</button>
                    <button class="delete-button">Delete</button>
                </div>
            </div>
        `;

        const checkbox = configDiv.querySelector('.configuration-checkbox');
        checkbox.checked = selectedConfigurations.has(config.id);
        checkbox.addEventListener('change', handleConfigurationSelection);
        checkbox.addEventListener('click', (e) => e.stopPropagation());

        const header = configDiv.querySelector('.config-header');
        const detailsDiv = configDiv.querySelector('.config-details');
        const toggleSpan = configDiv.querySelector('.toggle-details');

        // Restore expanded state
        if (previouslyExpandedIds.has(config.id)) {
            detailsDiv.style.display = 'block';
            toggleSpan.innerHTML = '&#9650;'; // Up arrow for expanded
        } else {
            detailsDiv.style.display = 'none';
            toggleSpan.innerHTML = '&#9660;'; // Down arrow for collapsed
        }

        header.addEventListener('click', () => {
            const isCurrentlyHidden = detailsDiv.style.display === 'none';
            detailsDiv.style.display = isCurrentlyHidden ? 'block' : 'none';
            toggleSpan.innerHTML = isCurrentlyHidden ? '&#9650;' : '&#9660;';
        });

        // Attach event listeners to buttons within this config item
        const hideButtonCheckbox = configDiv.querySelector('.hide-button-checkbox');
        hideButtonCheckbox.addEventListener('change', (event) => toggleHideButton(config.id, event.target));

        const disableConfigCheckbox = configDiv.querySelector('.disable-config-checkbox');
        disableConfigCheckbox.addEventListener('change', (event) => toggleDisableConfiguration(config.id, event.target));

        configDiv.querySelector('.edit-button').addEventListener('click', () => editConfiguration(config.id));
        configDiv.querySelector('.delete-button').addEventListener('click', () => deleteConfiguration(config.id));
        configDiv.querySelector('.duplicate-button').addEventListener('click', () => duplicateConfiguration(config.id));

        container.appendChild(configDiv);
    }
}


async function formatAction(action) {
    switch (action.type) {
        case 'follow':
            return action.follow === 'follow' ? 'Follow the observation' : 'Unfollow the observation';
        case 'reviewed':
            return action.reviewed === 'mark' ? 'Mark the observation as reviewed' : 'Mark the observation as unreviewed';        
        case 'observationField':
            let displayValue = action.displayValue || action.fieldValue;
            return `Add value "${displayValue}" to ${action.fieldName || `Field ${action.fieldId}`}`;
        case 'annotation':
            const fieldName = getAnnotationFieldName(action.annotationField);
            const valueName = getAnnotationValueName(action.annotationField, action.annotationValue);
            return `Set "${fieldName}" to "${valueName}"`;
        case 'addToProject':
                return action.remove ? 
                    `Remove from project: ${action.projectName || action.projectId}` :
                    `Add to project: ${action.projectName || action.projectId}`;            
        case 'addComment':
            return `Add comment: "${action.commentBody.substring(0, 30)}${action.commentBody.length > 30 ? '...' : ''}"`;
        case 'addTaxonId':
            let taxonDisplay = `Add taxon ID: ${action.taxonName} (ID: ${action.taxonId})`;
            if (action.disagreement) {
                taxonDisplay += ' [Disagreement]';
            }
            if (action.comment) {
                taxonDisplay += `\nwith\ncomment: "${action.comment.substring(0, 30)}${action.comment.length > 30 ? '...' : ''}"`;
            }
            return taxonDisplay;
        case 'qualityMetric':
            const metricLabel = qualityMetrics.find(m => m.value === action.metric).label;
            return `Quality Metric: "${metricLabel}" - ${action.vote}`;
        case 'copyObservationField':
            return `Copy value from "${action.sourceFieldName}" to "${action.targetFieldName}"`;
        case 'withdrawId' :
            return 'Withdraw active identification';
        case 'addToList':
            const listName = await getListName(action.listId);
            return action.remove ? 
                `Remove from list: ${listName}` : 
                `Add to list: ${listName}`;
        default:
            return 'Unknown action';       
    }
}

function getListName(listId) {
    return new Promise((resolve) => {
        browserAPI.storage.local.get('customLists', function(data) {
            const customLists = data.customLists || [];
            const list = customLists.find(l => l.id === listId);
            resolve(list ? list.name : 'Unknown List');
        });
    });
}

async function toggleHideButton(configId, checkbox) { // Make async
    const currentSet = getCurrentSet();
    if (!currentSet) return;

    const config = currentSet.buttons.find(c => c.id === configId);
    if (config) {
        const oldValue = config.buttonHidden; // Store old value
        config.buttonHidden = checkbox.checked;
        
        try {
            // Pass a callback that expects an error
            await saveConfigurationSets(null, false); // Await the save
            // UI update only on success
            const configDiv = document.querySelector(`.config-item[data-id="${configId}"]`);
            if (configDiv) {
                // updateConfigurationDisplay(config); // This function updates DOM based on config object
                                                  // which is already modified.
            }
        } catch (error) {
            console.error("Failed to toggle hide button:", error);
            // Revert optimistic UI change if save failed
            config.buttonHidden = oldValue;
            checkbox.checked = oldValue;
            // Error already alerted by helper.
        }
    }
}

async function toggleDisableConfiguration(configId, checkbox) { // Make async
    const currentSet = getCurrentSet();
    if (!currentSet) return;

    const config = currentSet.buttons.find(c => c.id === configId);
    if (config) {
        const oldValue = config.configurationDisabled;
        config.configurationDisabled = checkbox.checked;
        
        const configDiv = document.querySelector(`.config-item[data-id="${configId}"]`); // Get div before save

        try {
            await saveConfigurationSets(null, false); // Await
            // If successful, update UI (already optimistically done or handled by display functions)
             if (configDiv) { // Update class after successful save
                configDiv.classList.toggle('disabled-config', config.configurationDisabled);
             }
        } catch (error) {
            console.error("Failed to toggle disable configuration:", error);
            // Revert optimistic change
            config.configurationDisabled = oldValue;
            checkbox.checked = oldValue;
            if (configDiv) { // Revert class change
                configDiv.classList.toggle('disabled-config', config.configurationDisabled);
            }
        }
    }
}

function updateConfigurationDisplay(config) {
    const configDiv = document.querySelector(`.config-item[data-id="${config.id}"]`);
    if (configDiv) {
        configDiv.classList.toggle('disabled-config', config.configurationDisabled);
        
        // Update checkboxes without triggering change events
        const hideCheckbox = configDiv.querySelector('.hide-button-checkbox');
        if (hideCheckbox) {
            hideCheckbox.checked = config.buttonHidden;
        }
        
        const disableCheckbox = configDiv.querySelector('.disable-config-checkbox');
        if (disableCheckbox) {
            disableCheckbox.checked = config.configurationDisabled;
        }
    }
}
function formatShortcut(shortcut) {
    if (!shortcut || (!shortcut.ctrlKey && !shortcut.shiftKey && !shortcut.altKey && !shortcut.key)) {
        return 'None';
    }
    let parts = [];
    if (shortcut.ctrlKey) parts.push('Ctrl');
    if (shortcut.shiftKey) parts.push('Shift');
    if (shortcut.altKey) parts.push('Alt');
    if (shortcut.key) parts.push(shortcut.key);
    return parts.join(' + ');
}

function clearForm() {
    document.getElementById('buttonName').value = '';
    document.getElementById('ctrlKey').checked = false;
    document.getElementById('shiftKey').checked = false;
    document.getElementById('altKey').checked = false;
    document.getElementById('shortcut').value = '';
    document.getElementById('actionsContainer').innerHTML = '';
    const saveButton = document.getElementById('saveButton');
    saveButton.textContent = 'Save Configuration';
    delete saveButton.dataset.editIndex;
}

async function deleteConfiguration(configId) {
    if (confirm('Are you sure you want to delete this configuration?')) {
        const currentSet = getCurrentSet();
        if (!currentSet) {
            console.error("Cannot delete configuration: current set not found.");
            return;
        }

        const originalButtons = JSON.parse(JSON.stringify(currentSet.buttons)); // Deep copy for potential revert
        currentSet.buttons = currentSet.buttons.filter(c => c.id !== configId);

        try {
            await saveConfigurationSets(false); // Call with refreshDisplay = false, as we'll update UI here or rely on displayConfigurations
            console.log('Configuration deleted successfully.');
            // UI update: remove the element or re-render
            // If saveConfigurationSets is set to refreshDisplay=true by default, this might be redundant
            // but explicit removal here can be faster if saveConfigurationSets doesn't refresh.
            const configDiv = document.querySelector(`.config-item[data-id="${configId}"]`);
            if (configDiv) {
                configDiv.remove();
            }
            // If not relying on saveConfigurationSets to refresh the whole display:
            // updateSelectedCount(); // If the deleted item was selected
            // updateActionButtonStates();
        } catch (error) {
            console.error('Failed to save after deleting configuration:', error.message);
            alert('Failed to delete configuration. Please try again. Error: ' + error.message);
            // Revert the change to the global `configurationSets` if save failed
            const setToRevert = configurationSets.find(set => set.name === currentSet.name);
            if (setToRevert) {
                setToRevert.buttons = originalButtons;
            }
            // Optionally, force a full refresh from storage if things are uncertain
            // loadOptionsPageData();
        }
    }
}

function populateAnnotationFields(select) {
    select.innerHTML = '<option value="">Select Field</option>';
    Object.keys(controlledTerms).forEach(term => {
        const option = document.createElement('option');
        option.value = controlledTerms[term].id;
        option.textContent = term;
        select.appendChild(option);
    });
}

function updateAnnotationValues(fieldSelect, valueSelect) {
    valueSelect.innerHTML = '<option value="">Select Value</option>';
    const selectedField = controlledTerms[fieldSelect.options[fieldSelect.selectedIndex].text];
    if (selectedField) {
        Object.entries(selectedField.values).forEach(([key, value]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = key;
            valueSelect.appendChild(option);
        });
    }
}

function populateFieldDatalist() {
    const datalist = document.getElementById('fieldDatalist') || document.createElement('datalist');
    datalist.id = 'fieldDatalist';
    datalist.innerHTML = '';
    Object.entries(observationFieldMap).forEach(([id, name]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = name;
        datalist.appendChild(option);
    });
    document.body.appendChild(datalist);
}

function handleStorageChangeForOptionsPage(changes, areaName) { // Was handleStorageChangesForOptionsPage
    if (areaName === 'local') {
        let needsFullDisplayRefresh = false; // Renamed from needsDisplayRefresh for clarity

        if (changes.configurationSets) {
            console.log("options.js (storage.onChanged): configurationSets changed.");
            configurationSets = changes.configurationSets.newValue || configurationSets;
            needsFullDisplayRefresh = true;
        }

        if (changes.currentOptionsPageSetName) {
            const newOptPageSet = changes.currentOptionsPageSetName.newValue; // Renamed from newOptSet
            if (newOptPageSet && newOptPageSet !== optionsPageActiveSetName) {
                console.log("options.js (storage.onChanged): currentOptionsPageSetName changed by another options instance.");
                optionsPageActiveSetName = newOptPageSet;
                needsFullDisplayRefresh = true;
            }
        }

        if (changes.customLists) {
            console.log("options.js (storage.onChanged): customLists changed.");
            // Assuming displayLists and updateAllListSelects are defined and handle this
            displayLists();
            updateAllListSelects();
        }
        if (changes.observationFieldMap) {
             console.log("options.js (storage.onChanged): observationFieldMap changed.");
             observationFieldMap = changes.observationFieldMap.newValue || {};
             populateFieldDatalist();
        }

        if (needsFullDisplayRefresh) {
            console.log("options.js (storage.onChanged): Refreshing display due to storage changes.");
            updateSetSelector();
            displayConfigurations();
            updateSetManagementButtons();

            const editId = document.getElementById('saveButton').dataset.editIndex;
            if (editId) {
                const currentSetObj = configurationSets.find(set => set.name === optionsPageActiveSetName);
                const configExists = currentSetObj && currentSetObj.buttons.find(c => c.id === editId);
                if (!configExists) {
                    console.warn("options.js (storage.onChanged): The config being edited changed/removed externally. Clearing form.");
                    clearForm();
                    alert("The configuration you were editing has been modified or removed elsewhere. The form has been cleared.");
                }
            }
        }
        // After any storage change, it's good to update the usage display
        updateStorageUsageDisplay();
    }
}

function showUndoRecordsModal() {
    getUndoRecords(function(undoRecords) {
        console.log('Retrieved undo records:', undoRecords);
        if (undoRecords.length === 0) {
            alert('No undo records available.');
            return;
        }

        const modal = createUndoRecordsModal(undoRecords, function(record) {
            // For the options page, we might want to just mark the record as undone
            // without actually performing the undo action
            markRecordAsUndone(record.id);
        });

        document.body.appendChild(modal);
    });
}

function exportConfigurations() {
    browserAPI.storage.local.get(['configurationSets', 'optionsPageActiveSetName', 'customLists'], function(data) {
        const exportData = {
            configurationSets: data.configurationSets || [],
            optionsPageActiveSetName: data.optionsPageActiveSetName || '',
            customLists: data.customLists || []
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `iNaturalist_tool_config_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });
}

async function importConfigurations(event) {
    const file = event.target.files[0];
    if (!file) {
        if (event.target) event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        let importedData;
        try {
            importedData = JSON.parse(this.result);
        } catch (parseError) {
            alert('Error parsing the imported file. Please make sure it\'s a valid JSON file from this extension.\nError: ' + parseError.message);
            console.error('Import parse error:', parseError);
            if (event.target) event.target.value = '';
            return;
        }

        let setsImportAttempted = false;
        let setsImportShouldProceed = true; // Flag to control progression

        if (importedData.configurationSets) {
            setsImportAttempted = true;
            try {
                const importResults = await createImportModal(importedData.configurationSets);
                await processImportChoices(importResults); // This will throw on quota error if saveConfigurationSets fails
                // If processImportChoices completes without error, it means saving was successful (or no save was needed)
            } catch (error) {
                setsImportShouldProceed = false; // Mark that we should not proceed past set import attempts
                if (error.message !== 'Import cancelled' && !error.message.toLowerCase().includes("quota check failed")) {
                    console.error('Error during configuration set import process:', error);
                    alert('Error during configuration set import process: ' + error.message);
                } else if (error.message.toLowerCase().includes("quota check failed")) {
                    console.warn('Configuration set import aborted due to storage quota issue (already alerted).');
                } else {
                    console.log('Configuration set import cancelled by user.');
                }
            }
        } else if (importedData.customButtons) {
            setsImportAttempted = true;
            const setName = prompt("Enter a name for the imported set (old format):", `Imported Set ${new Date().toLocaleString()}`);
            if (setName) {
                const newSet = { name: setName, buttons: importedData.customButtons };
                try {
                    const storageData = await new Promise(resolve => browserAPI.storage.local.get(['configurationSets'], resolve));
                    let currentSets = storageData.configurationSets || [{ name: 'Default Set', buttons: [] }];
                    currentSets.push(newSet);
                    await setStorageWithQuotaCheck({ configurationSets: currentSets }, 'configurationSets');
                    configurationSets = currentSets;
                    optionsPageActiveSetName = newSet.name;
                } catch (error) {
                    setsImportShouldProceed = false; // Mark that we should not proceed
                    console.error("Error saving imported old-format set:", error.message);
                    // Quota error is already alerted by setStorageWithQuotaCheck
                }
            } else {
                console.log("Import of old-format set cancelled by user (no name provided).");
                setsImportShouldProceed = false; // If user cancels naming, don't proceed with lists from this import
            }
        }

        let listsImportAttempted = false;

        // --- CRITICAL CHECK: Only proceed to list import if setsImportShouldProceed is true ---
        if (setsImportShouldProceed && importedData.customLists) {
            listsImportAttempted = true;
            try {
                const existingListsData = await new Promise(resolve => browserAPI.storage.local.get('customLists', resolve));
                const existingLists = existingListsData.customLists || [];
                const listImportResults = await createListImportModal(importedData.customLists, existingLists);
                await processListImportChoices(listImportResults, existingLists); // This will throw on quota error
            } catch (error) {
                // listsImportShouldProceed is not strictly needed here as it's the last step, but good for consistency
                if (error.message !== 'Import cancelled' && !error.message.toLowerCase().includes("quota check failed")) {
                    console.error('Error during list import process:', error);
                    alert('Error during list import process: ' + error.message);
                } else if (error.message.toLowerCase().includes("quota check failed")) {
                    console.warn('List import aborted due to storage quota issue (already alerted).');
                } else {
                    console.log('List import cancelled by user.');
                }
            }
        }

        if (!setsImportAttempted && !listsImportAttempted && !importedData.customButtons) {
            alert('Invalid import format: No configurationSets, customButtons, or customLists found in the file.');
        }

        loadOptionsPageData(); // Always refresh UI from storage at the end
    };
    reader.readAsText(file);
    if (event.target) event.target.value = '';
}

function isSetEqual(set1, set2) {
    return JSON.stringify(set1) === JSON.stringify(set2);
}

function mergeConfigurationSets(importedSetsToProcess) {
    importedSetsToProcess.forEach(importedSet => {
        const existingSetIndex = configurationSets.findIndex(set => set.name === importedSet.name);
        if (existingSetIndex !== -1) {
            const targetExistingSet = configurationSets[existingSetIndex];
            importedSet.buttons.forEach(importedButton => {
                const existingButtonIndex = targetExistingSet.buttons.findIndex(b => b.name === importedButton.name);
                if (existingButtonIndex !== -1) {
                    if (confirm(`Button "${importedButton.name}" already exists in set "${targetExistingSet.name}". Replace it with the imported version?`)) {
                        targetExistingSet.buttons[existingButtonIndex] = importedButton;
                    }
                } else {
                    targetExistingSet.buttons.push(importedButton);
                }
            });
            targetExistingSet.observationFieldMap = {
                ...targetExistingSet.observationFieldMap,
                ...(importedSet.observationFieldMap || {})
            };
        } else {
            console.warn(`Merge target set "${importedSet.name}" not found in existing configurationSets. Adding as new.`);
            configurationSets.push(JSON.parse(JSON.stringify(importedSet)));
        }
    });
}

function loadUndoRecords() {
    const container = document.getElementById('undoRecordsContainer');
    if (!container) {
        console.log('Undo records container not found. This is expected if the modal is not open.');
        return;
    }

    browserAPI.storage.local.get('undoRecords', function(result) {
        const undoRecords = result.undoRecords || [];
        if (undoRecords.length === 0) {
            container.textContent = 'No undo records available.';
            return;
        }

        undoRecords.forEach(record => {
            const recordDiv = document.createElement('div');
            recordDiv.className = 'undo-record';
            
            const actionInfo = document.createElement('p');
            actionInfo.textContent = `${record.action} - ${new Date(record.timestamp).toLocaleString()}`;
            recordDiv.appendChild(actionInfo);
            
            const observationIds = Object.keys(record.observations);
            const observationUrl = generateObservationURL(observationIds);
            
            const linkParagraph = document.createElement('a');
            linkParagraph.href = observationUrl;
            linkParagraph.textContent = 'View affected observations';
            linkParagraph.target = '_blank';
            recordDiv.appendChild(linkParagraph);
            
            const removeButton = document.createElement('button');
            removeButton.textContent = 'Remove Record';
            removeButton.onclick = function() {
                removeUndoRecord(record.id, function() {
                    recordDiv.remove();
                });
            };
            recordDiv.appendChild(removeButton);
            
            container.appendChild(recordDiv);
        });
    });
}

async function createList() {
    const listNameInput = document.getElementById('newListName');
    const listName = listNameInput.value.trim();
    console.log("Create List called. List name: '", listName, "'");

    if (listName) {
        try {
            const data = await new Promise(resolve => browserAPI.storage.local.get('customLists', resolve));
            const customLists = data.customLists || [];

            if (customLists.some(list => list.name === listName)) {
                alert("A list with this name already exists. Please choose a different name.");
                return;
            }

            const newList = {
                id: Date.now().toString(),
                name: listName,
                observations: []
            };
            customLists.push(newList);

            await setStorageWithQuotaCheck({ customLists: customLists }, 'customLists');

            displayLists();
            updateAllListSelects();
            listNameInput.value = ''; // Clear the input field after successful creation
            console.log("List created successfully:", newList.name);
        } catch (error) {
            console.error("Error creating list:", error.message);
            // Quota error is handled by setStorageWithQuotaCheck's alert
            if (!error.message.toLowerCase().includes("quota check failed")) {
                alert("An error occurred while creating the list: " + error.message);
            }
        }
    } else {
        // User tried to create a list with an empty name
        console.log("Attempted to create list with empty name.");
        alert("Please enter a name for the new list.");
        listNameInput.focus(); // Optionally focus the input field
    }
}
  
function displayLists() {
    const container = document.getElementById('existingLists');
    container.innerHTML = '';
    browserAPI.storage.local.get('customLists', function(data) {
        const customLists = data.customLists || [];
        customLists.forEach(list => {
            const listDiv = document.createElement('div');
            listDiv.className = 'list-item';
            listDiv.innerHTML = `
                <div class="list-name">${list.name} (${list.observations.length} observations)</div>
                <div class="list-actions">
                    <button class="viewList" data-id="${list.id}">View</button>
                    <button class="renameList" data-id="${list.id}">Rename</button>
                    <button class="deleteList" data-id="${list.id}">Delete</button>
                </div>
            `;
            container.appendChild(listDiv);
        });
    });
}
  
async function renameList(listId) { // Make async
    const newName = prompt("Enter new name for the list:");
    if (newName && newName.trim() !== "") {
        try {
            const data = await new Promise(resolve => browserAPI.storage.local.get('customLists', resolve));
            const customLists = data.customLists || [];
            
            // Check if new name conflicts with another existing list (excluding the current one being renamed)
            if (customLists.some(list => list.id !== listId && list.name === newName.trim())) {
                alert("Another list with this name already exists. Please choose a different name.");
                return;
            }

            const listIndex = customLists.findIndex(list => list.id === listId);
            if (listIndex !== -1) {
                customLists[listIndex].name = newName.trim();
                
                await setStorageWithQuotaCheck({ customLists: customLists }, 'customLists');

                displayLists();
                updateAllListSelects();
            } else {
                alert("List not found for renaming."); // Should not happen if UI is correct
            }
        } catch (error) {
            console.error("Error renaming list:", error.message);
        }
    }
}

async function deleteList(listId) { // Make async
    if (confirm("Are you sure you want to delete this list?")) {
        try {
            const data = await new Promise(resolve => browserAPI.storage.local.get('customLists', resolve));
            let customLists = data.customLists || [];
            const updatedLists = customLists.filter(list => list.id !== listId);
            
            // Check if list was actually found and removed (i.e., length changed)
            if (updatedLists.length < customLists.length) {
                await setStorageWithQuotaCheck({ customLists: updatedLists }, 'customLists');
                displayLists();
                updateAllListSelects();
            } else {
                 console.warn("List not found for deletion, or list was already empty.");
                 // Still refresh display in case of discrepancies
                 displayLists();
                 updateAllListSelects();
            }
        } catch (error) {
            console.error("Error deleting list:", error.message);
        }
    }
}
  
async function viewList(listId) {
    const url = await generateListObservationURL(listId);
    if (url) {
        window.open(url, '_blank');
    } else {
        alert('This list is empty or not found.');
    }
}

function updateSetSelector() {
    const selector = document.getElementById('setSelector');
    selector.innerHTML = '';
    configurationSets.forEach(set => {
        const option = document.createElement('option');
        option.value = set.name;
        option.textContent = set.name;
        selector.appendChild(option);
    });
    // `optionsPageActiveSetName` is the global variable holding the options page's selection
    selector.value = optionsPageActiveSetName;
}

function handleOptionsPageSetSelectionChange() {
    optionsPageActiveSetName = document.getElementById('setSelector').value;
    browserAPI.storage.local.set({
        currentOptionsPageSetName: optionsPageActiveSetName // Only for this options page's UI
    });
    displayConfigurations(); // Update display for the new selection in this options page
    selectedConfigurations.clear();
    updateSelectedCount();
    updateActionButtonStates();
}

function updateSetManagementButtons() {
    const disableButtons = configurationSets.length <= 1;
    document.getElementById('duplicateSetButton').disabled = false;
    document.getElementById('renameSetButton').disabled = false;
    document.getElementById('removeSetButton').disabled = disableButtons;
}

function createNewSet() {
    const setName = prompt("Enter a name for the new configuration set:");
    if (setName) {
        if (configurationSets.some(set => set.name === setName)) {
            alert("A set with this name already exists. Please choose a different name.");
            return;
        }
        const newSet = { name: setName, buttons: [], observationFieldMap: {} };
        configurationSets.push(newSet);
        optionsPageActiveSetName = setName;
        saveConfigurationSets();
    }
}

function duplicateCurrentSet() {
    const currentSet = configurationSets.find(set => set.name === optionsPageActiveSetName);
    if (currentSet) {
        const newSetName = prompt("Enter a name for the duplicated set:", `${currentSet.name} (Copy)`);
        if (newSetName) {
            if (configurationSets.some(set => set.name === newSetName)) {
                alert("A set with this name already exists. Please choose a different name.");
                return;
            }
            const newSet = JSON.parse(JSON.stringify(currentSet));
            newSet.name = newSetName;
            configurationSets.push(newSet);
            optionsPageActiveSetName = newSetName;
            saveConfigurationSets();
        }
    }
}

// In options.js
async function renameCurrentSet() { // Make async
    const oldSetName = optionsPageActiveSetName;
    const currentSet = configurationSets.find(set => set.name === oldSetName);
    if (currentSet) {
        const newName = prompt("Enter a new name for the current set:", currentSet.name);
        if (newName && newName.trim() !== "" && newName.trim() !== oldSetName) {
            if (configurationSets.some(set => set.name === newName.trim())) {
                alert("A set with this name already exists. Please choose a different name.");
                return;
            }
            
            // Update the name in the main configurationSets array
            currentSet.name = newName.trim();
            optionsPageActiveSetName = newName.trim(); // Update options page's view

            // Check if the renamed set was the one active in content.js
            const storageData = await new Promise(resolve => browserAPI.storage.local.get('contentScriptActiveSetName', resolve));
            let dataToUpdateInStorage = {};
            if (storageData.contentScriptActiveSetName === oldSetName) {
                dataToUpdateInStorage.contentScriptActiveSetName = newName.trim();
            }

            // Call saveConfigurationSets, which will save all sets and currentOptionsPageSetName.
            // It will also handle contentScriptActiveSetName correctly now if it wasn't the one renamed.
            // If it WAS the one renamed, we need to pass that along.
            // For simplicity, let saveConfigurationSets handle the full save,
            // but we ensure contentScriptActiveSetName is part of the update if it changed.

            try {
                // saveConfigurationSets now handles saving its own currentOptionsPageSetName
                // and makes sure contentScriptActiveSetName is valid
                await saveConfigurationSets(); // refreshDisplay defaults to true
                // If we needed to explicitly update contentScriptActiveSetName because IT was renamed:
                if (dataToUpdateInStorage.contentScriptActiveSetName) {
                    await browserAPI.storage.local.set(dataToUpdateInStorage);
                }
            } catch (e) { /* error already handled by saveConfigurationSets */ }
        }
    }
}

// removeCurrentSet() will rely on the updated saveConfigurationSets to fix contentScriptActiveSetName if needed.

function removeCurrentSet() {
    if (configurationSets.length > 1) {
        if (confirm(`Are you sure you want to remove the "${optionsPageActiveSetName}" set?`)) {
            configurationSets = configurationSets.filter(set => set.name !== optionsPageActiveSetName);
            optionsPageActiveSetName = configurationSets[0].name;
            saveConfigurationSets();
        }
    } else {
        alert("You cannot remove the last configuration set.");
    }
}

async function saveConfigurationSets(refreshDisplay = true) {
    let activeContentSetName = await new Promise(resolve => // Get current content script active name
        browserAPI.storage.local.get('contentScriptActiveSetName', data => resolve(data.contentScriptActiveSetName))
    );

    // Check if the set currently active in content.js still exists
    const contentScriptActiveSetExists = configurationSets.some(set => set.name === activeContentSetName);

    if (!contentScriptActiveSetExists && configurationSets.length > 0) {
        // The set active on content.js was deleted or renamed, pick a new default for it
        activeContentSetName = configurationSets[0].name;
    } else if (!contentScriptActiveSetExists && configurationSets.length === 0) {
        // All sets deleted, content script will have no active set
        activeContentSetName = null; // Or an empty string
    }

    const dataToSave = {
        configurationSets: configurationSets,
        currentOptionsPageSetName: optionsPageActiveSetName, // What this options page is viewing
        lastConfigUpdate: Date.now()
    };

    // Only update contentScriptActiveSetName if it needed to be changed
    if (dataToSave.contentScriptActiveSetName !== activeContentSetName) {
         dataToSave.contentScriptActiveSetName = activeContentSetName;
    }


    try {
        await setStorageWithQuotaCheck(dataToSave, 'configurationSets');
        console.log('Configuration sets and relevant active set names updated.');

        if (refreshDisplay) {
            // optionsPageActiveSetName is already set for the current UI
            updateSetSelector();
            displayConfigurations();
            updateSetManagementButtons();
        }
    } catch (error) {
        console.error("Error in saveConfigurationSets:", error.message);
        throw error;
    }
}

function mergeLists(importedLists) {
    browserAPI.storage.local.get('customLists', async function(data) {
        let existingLists = data.customLists || [];
        
        try {
            const importResults = await createListImportModal(importedLists, existingLists);
            processListImportChoices(importResults, existingLists);
        } catch (error) {
            if (error.message !== 'Import cancelled') {
                console.error('Error during list import:', error);
                alert('Error importing lists');
            }
        }
    });
}

async function processListImportChoices(results, existingLists) {
    let listsToAdd = [];
    let listsToMerge = []; // For lists chosen to be merged
    let skippedListsCount = 0;

    results.forEach(result => {
        switch (result.action) {
            case 'new':
                listsToAdd.push({
                    ...result.list,
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
                });
                break;
            case 'rename':
                 listsToAdd.push({
                    ...result.list,
                    name: result.newName,
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
                });
                break;
            case 'merge':
                const existingListToMergeWith = existingLists.find(el => el.id === result.list.id);
                if (existingListToMergeWith) {
                    const combinedObservations = [
                        ...existingListToMergeWith.observations,
                        ...result.list.observations
                    ];
                    existingListToMergeWith.observations = [...new Set(combinedObservations)];
                    // existingLists is modified in place for merges
                } else {
                    listsToAdd.push({
                         ...result.list,
                         id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
                    });
                }
                break;
            case 'skip':
                skippedListsCount++;
                break;
        }
    });

    const finalLists = [...existingLists, ...listsToAdd];
    const madeChanges = listsToAdd.length > 0 || results.some(r => r.action === 'merge');

    if (madeChanges) {
        try {
            await setStorageWithQuotaCheck({ customLists: finalLists }, 'customLists');

            let messageParts = [];
            if (listsToAdd.length > 0) messageParts.push(`Added or renamed ${listsToAdd.length} new list(s).`);
            if (results.some(r => r.action === 'merge')) messageParts.push(`Merged existing lists with imported data.`); // Or be more specific if you track merge counts

            let alertMessage = "List import successful.";
            if (messageParts.length > 0) {
                alertMessage += `\nDetails:\n- ${messageParts.join('\n- ')}`;
            }
            if (skippedListsCount > 0) { // Assuming skippedListsCount is correctly calculated for lists
                alertMessage += `\n- Skipped ${skippedListsCount} list(s) based on user choice.`;
            }

            if (messageParts.length > 0 || skippedListsCount > 0) {
                alert(alertMessage);
            } else {
                console.log("List import: No new, merged, or skipped lists to report, but save was successful.");
            }

        } catch (error) {
            console.error("Error saving imported/merged lists:", error.message);
            // Quota error is already alerted by setStorageWithQuotaCheck.
            if (!error.message.toLowerCase().includes("quota check failed") &&
                !error.message.toLowerCase().includes("storage limit")) {
                alert(`Failed to save list changes. Error: ${error.message}`);
            }
            throw error; // Re-throw for importConfigurations to handle flow
        }
    } else if (skippedListsCount > 0 && results.length === skippedListsCount) {
         alert("List import: All lists were skipped based on user choice. No changes made.");
    } else if (results.length === 0) {
        console.log("List import: No lists were provided for import.");
    }
}


function getCurrentSet() {
    // This function is used by various UI actions on the options page (delete, duplicate, edit etc.)
    // It should refer to the set currently selected in the options page UI.
    const selectedSetNameInUI = document.getElementById('setSelector').value || optionsPageActiveSetName;
    return configurationSets.find(set => set.name === selectedSetNameInUI);
}


let selectedConfigurations = new Set();

function handleSelectAll() {
    const currentSet = getCurrentSet();
    if (!currentSet) return;
    
    // Add all visible (filtered) configuration IDs to the selection
    const configItems = document.querySelectorAll('.config-item');
    configItems.forEach(item => {
        const checkbox = item.querySelector('.configuration-checkbox');
        checkbox.checked = true;
        selectedConfigurations.add(item.dataset.id);
    });
    
    updateSelectedCount();
    updateActionButtonStates();
}

function clearSelection() {
    const configItems = document.querySelectorAll('.config-item');
    configItems.forEach(item => {
        const checkbox = item.querySelector('.configuration-checkbox');
        checkbox.checked = false;
    });
    selectedConfigurations.clear();
    updateSelectedCount();
    updateActionButtonStates();
}

function handleConfigurationSelection(event) {
    const checkbox = event.target;
    const configId = checkbox.dataset.configId;
    
    if (checkbox.checked) {
        selectedConfigurations.add(configId);
    } else {
        selectedConfigurations.delete(configId);
    }
    
    updateSelectedCount();
    updateActionButtonStates();
}

function updateSelectedCount() {
    const count = selectedConfigurations.size;
    document.getElementById('selectedCount').textContent = `${count} selected`;
}

function updateActionButtonStates() {
    const hasSelection = selectedConfigurations.size > 0;
    document.querySelectorAll('.configuration-action-btn').forEach(btn => {
        btn.disabled = !hasSelection;
    });
}

function performConfigurationAction(action) {
    if (selectedConfigurations.size === 0) {
        // No action if nothing is selected, buttons should be disabled anyway by updateActionButtonStates
        return;
    }

    const currentSet = getCurrentSet();
    if (!currentSet) {
        console.error("Cannot perform action: current set not found.");
        return;
    }

    let changesMade = false; // Flag to track if any actual change occurred

    // --- DELETE ACTION ---
    if (action === 'delete') {
        if (!confirm('Are you sure you want to delete these configurations?')) return;

        const originalButtonCount = currentSet.buttons.length;
        const originalButtons = JSON.parse(JSON.stringify(currentSet.buttons)); // For revert

        currentSet.buttons = currentSet.buttons.filter(c => !selectedConfigurations.has(c.id));

        if (currentSet.buttons.length < originalButtonCount) {
            changesMade = true;
            (async () => { // IIFE to use async/await
                try {
                    await saveConfigurationSets(false); // Save, no full refresh
                    selectedConfigurations.forEach(id => {
                        const configDiv = document.querySelector(`.config-item[data-id="${id}"]`);
                        if (configDiv) configDiv.remove();
                    });
                    clearSelection(); // Clear selection UI
                } catch (error) {
                    console.error("Failed to delete selected configurations:", error);
                    // Revert optimistic change to global `configurationSets`
                    const setToRevert = configurationSets.find(set => set.name === currentSet.name);
                    if (setToRevert) setToRevert.buttons = originalButtons;
                    alert("Failed to delete configurations. Error: " + error.message);
                    // Optionally reload all from storage to be safe: loadOptionsPageData();
                }
            })();
        } else {
            console.log("No configurations found for deletion in the current selection.");
            clearSelection();
        }
        return; // Exit after delete action
    }

    // --- OTHER BULK ACTIONS (HIDE, SHOW, ENABLE, DISABLE) ---
    currentSet.buttons.forEach(c => {
        if (selectedConfigurations.has(c.id)) {
            const configDiv = document.querySelector(`.config-item[data-id="${c.id}"]`);
            let specificChangeMadeForThisConfig = false;

            switch (action) {
                case 'hide':
                    if (!c.buttonHidden) {
                        c.buttonHidden = true;
                        if (configDiv) configDiv.querySelector('.hide-button-checkbox').checked = true;
                        specificChangeMadeForThisConfig = true;
                    }
                    break;
                case 'show':
                    if (c.buttonHidden) {
                        c.buttonHidden = false;
                        if (configDiv) configDiv.querySelector('.hide-button-checkbox').checked = false;
                        specificChangeMadeForThisConfig = true;
                    }
                    break;
                case 'disable':
                    if (!c.configurationDisabled) {
                        c.configurationDisabled = true;
                        if (configDiv) {
                            configDiv.querySelector('.disable-config-checkbox').checked = true;
                            configDiv.classList.add('disabled-config');
                        }
                        specificChangeMadeForThisConfig = true;
                    }
                    break;
                case 'enable':
                    if (c.configurationDisabled) {
                        c.configurationDisabled = false;
                        if (configDiv) {
                            configDiv.querySelector('.disable-config-checkbox').checked = false;
                            configDiv.classList.remove('disabled-config');
                        }
                        specificChangeMadeForThisConfig = true;
                    }
                    break;
            }
            if (specificChangeMadeForThisConfig) {
                changesMade = true;
            }
        }
    });

    if (changesMade) {
        saveConfigurationSets(false) // Save data, no full UI refresh from this
            .catch(error => {
                console.error(`Error saving after bulk action '${action}':`, error.message);
                alert(`An error occurred while performing '${action}'. Please try again.`);
                loadOptionsPageData(); // Revert UI to last known good state from storage
            });
    } else {
        console.log(`Bulk action '${action}' resulted in no changes to selected configurations.`);
    }
    // Do NOT call clearSelection() here for hide/show/enable/disable, user might want to perform more actions on same selection.
    // The individual item states (checkboxes, class) are updated directly.
}

function expandSelectedConfigurations() {
    if (selectedConfigurations.size === 0) {
        // alert("Please select one or more configurations to expand."); // Optional: user feedback
        return;
    }
    selectedConfigurations.forEach(configId => {
        const configDiv = document.querySelector(`.config-item[data-id="${configId}"]`);
        if (configDiv) {
            const detailsDiv = configDiv.querySelector('.config-details');
            const toggleSpan = configDiv.querySelector('.toggle-details');
            if (detailsDiv && toggleSpan) {
                detailsDiv.style.display = 'block';
                toggleSpan.innerHTML = '&#9650'; // Up arrow
            }
        }
    });
}

function collapseSelectedConfigurations() {
    if (selectedConfigurations.size === 0) {
        // alert("Please select one or more configurations to collapse."); // Optional: user feedback
        return;
    }
    selectedConfigurations.forEach(configId => {
        const configDiv = document.querySelector(`.config-item[data-id="${configId}"]`);
        if (configDiv) {
            const detailsDiv = configDiv.querySelector('.config-details');
            const toggleSpan = configDiv.querySelector('.toggle-details');
            if (detailsDiv && toggleSpan) {
                detailsDiv.style.display = 'none';
                toggleSpan.innerHTML = '&#9660'; // Down arrow
            }
        }
    });
}

function expandConfigurations(configIds) {
    configIds.forEach(id => {
        const configDiv = document.querySelector(`.config-item[data-id="${id}"]`);
        if (configDiv) {
            const detailsDiv = configDiv.querySelector('.config-details');
            const toggleSpan = configDiv.querySelector('.toggle-details');
            if (detailsDiv && toggleSpan) {
                detailsDiv.style.display = 'block';
                toggleSpan.innerHTML = '&#9650;';
            }
        }
    });
    updateToggleAllButton();
}

function createImportModal(importedSets) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;

    const content = document.createElement('div');
    content.className = 'modal-content';
    content.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        max-width: 80%;
        max-height: 80%;
        overflow-y: auto;
    `;

    let html = '<h2>Import Configuration Sets</h2>';
    html += '<p>Please select how to handle each configuration set:</p>';
    
    importedSets.forEach((set, index) => {
        const existingSet = configurationSets.find(existing => existing.name === set.name);
        const isIdentical = existingSet ? isSetEqual(existingSet, set) : false;
        
        html += `
            <div class="import-set-item" style="margin: 10px 0; padding: 10px; border: 1px solid #ccc;">
                <h3>${set.name}</h3>
                <p>Contains ${set.buttons.length} buttons</p>
                ${existingSet ? 
                    isIdentical ? 
                        '<p style="color: #666;">This set is identical to an existing set and will be skipped</p>' :
                        `<select id="action-${index}" class="import-action">
                            <option value="rename">Import as new set with different name</option>
                            <option value="merge">Merge with existing set</option>
                            <option value="skip">Skip this set</option>
                        </select>
                        <div id="rename-${index}" style="margin-top: 10px;">
                            <input type="text" id="newname-${index}" value="${set.name} (New)" 
                                style="width: 200px; margin-right: 10px;">
                        </div>`
                    : '<p style="color: green;">Will be imported as new set</p>'
                }
            </div>`;
    });

    html += `
        <div style="margin-top: 20px; text-align: right;">
            <button id="import-cancel" style="margin-right: 10px;">Cancel</button>
            <button id="import-confirm">Import</button>
        </div>
    `;

    content.innerHTML = html;
    modal.appendChild(content);

    // Add event listeners for action selects
    importedSets.forEach((set, index) => {
        const existingSet = configurationSets.find(existing => existing.name === set.name);
        if (existingSet && !isSetEqual(existingSet, set)) {
            setTimeout(() => {
                const actionSelect = document.getElementById(`action-${index}`);
                const renameDiv = document.getElementById(`rename-${index}`);
                if (actionSelect && renameDiv) {
                    actionSelect.addEventListener('change', () => {
                        renameDiv.style.display = actionSelect.value === 'rename' ? 'block' : 'none';
                    });
                }
            }, 0);
        }
    });

    return new Promise((resolve, reject) => {
        document.body.appendChild(modal);

        document.getElementById('import-cancel').onclick = () => {
            document.body.removeChild(modal);
            reject(new Error('Import cancelled'));
        };

        document.getElementById('import-confirm').onclick = () => {
            const results = importedSets.map((set, index) => {
                const existingSet = configurationSets.find(existing => existing.name === set.name);
                if (!existingSet) {
                    return { action: 'new', set: set };
                }
                if (isSetEqual(existingSet, set)) {
                    return { action: 'skip', set: set };
                }
                const actionSelect = document.getElementById(`action-${index}`);
                const newNameInput = document.getElementById(`newname-${index}`);
                return {
                    action: actionSelect.value,
                    set: set,
                    newName: newNameInput ? newNameInput.value : null
                };
            });
            document.body.removeChild(modal);
            resolve(results);
        };
    });
}

async function processImportChoices(results) { // For Configuration Sets
    let setsToAdd = [];
    let setsMarkedForMerge = [];
    let skippedSetsCount = 0;

    results.forEach(result => {
        switch (result.action) {
            case 'new':
                setsToAdd.push(result.set);
                break;
            case 'rename':
                let newName = result.newName;
                let counter = 1;
                while (configurationSets.some(set => set.name === newName) || setsToAdd.some(s => s.name === newName)) {
                    newName = `${result.set.name} (${counter++})`;
                }
                setsToAdd.push({ ...result.set, name: newName });
                break;
            case 'merge':
                setsMarkedForMerge.push(result.set);
                break;
            case 'skip':
                skippedSetsCount++;
                break;
        }
    });

    if (setsMarkedForMerge.length > 0) {
        mergeConfigurationSets(setsMarkedForMerge);
    }

    if (setsToAdd.length > 0) {
        configurationSets.push(...setsToAdd);
        if (!optionsPageActiveSetName || !configurationSets.some(set => set.name === optionsPageActiveSetName)) {
            if (setsToAdd.length > 0) {
                 optionsPageActiveSetName = setsToAdd[setsToAdd.length - 1].name;
            } else if (configurationSets.length > 0) {
                 optionsPageActiveSetName = configurationSets[0].name;
            }
        }
    }

    if (setsToAdd.length > 0 || setsMarkedForMerge.length > 0) {
        try {
            await saveConfigurationSets(); // This will throw on quota error

            let messageParts = [];
            if (setsToAdd.length > 0) messageParts.push(`Added or renamed ${setsToAdd.length} new configuration set(s).`);
            if (setsMarkedForMerge.length > 0) messageParts.push(`Processed ${setsMarkedForMerge.length} configuration set(s) for merging.`);

            let alertMessage = "Configuration set import successful.";
            if (messageParts.length > 0) {
                alertMessage += `\nDetails:\n- ${messageParts.join('\n- ')}`;
            }
            if (skippedSetsCount > 0) {
                alertMessage += `\n- Skipped ${skippedSetsCount} set(s) based on user choice.`;
            }
            // Only alert if there's something to report beyond just "successful"
            if (messageParts.length > 0 || skippedSetsCount > 0) {
                alert(alertMessage);
            } else {
                console.log("Configuration set import: No new, merged, or skipped sets to report, but save was successful (e.g., empty import file processed).");
            }

        } catch (error) {
            console.error("Error saving processed configuration sets:", error.message);
            // Quota error is already alerted by setStorageWithQuotaCheck (via saveConfigurationSets)
            if (!error.message.toLowerCase().includes("quota check failed") &&
                !error.message.toLowerCase().includes("storage limit")) {
                alert("Failed to save configuration set changes. Error: " + error.message);
            }
            throw error; // Re-throw for importConfigurations to handle flow
        }
    } else if (skippedSetsCount > 0 && results.length === skippedSetsCount) {
        alert("Configuration set import: All sets were skipped based on user choice. No changes saved.");
    } else if (results.length === 0) {
        console.log("Configuration set import: No sets were provided for import.");
    }
}

function createListImportModal(importedLists, existingLists) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;

    const content = document.createElement('div');
    content.className = 'modal-content';
    content.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        max-width: 80%;
        max-height: 80%;
        overflow-y: auto;
    `;

    let html = '<h2>Import Lists</h2>';
    html += '<p>Please select how to handle each list:</p>';
    
    importedLists.forEach((list, index) => {
        const existingList = existingLists.find(existing => existing.id === list.id);
        const isIdentical = existingList ? 
            JSON.stringify(existingList.observations.sort()) === JSON.stringify(list.observations.sort()) : 
            false;
        
        html += `
            <div class="import-list-item" style="margin: 10px 0; padding: 10px; border: 1px solid #ccc;">
                <h3>${list.name}</h3>
                <p>Contains ${list.observations.length} observations</p>
                ${existingList ? 
                    isIdentical ? 
                        '<p style="color: #666;">This list is identical to an existing list and will be skipped</p>' :
                        `<select id="list-action-${index}" class="import-action">
                            <option value="rename">Import as new list with different name</option>
                            <option value="merge">Merge with existing list</option>
                            <option value="skip">Skip this list</option>
                        </select>
                        <div id="list-rename-${index}" style="margin-top: 10px;">
                            <input type="text" id="list-newname-${index}" value="${list.name} (New)" 
                                style="width: 200px; margin-right: 10px;">
                        </div>`
                    : '<p style="color: green;">Will be imported as new list</p>'
                }
            </div>`;
    });

    html += `
        <div style="margin-top: 20px; text-align: right;">
            <button id="list-import-cancel" style="margin-right: 10px;">Cancel</button>
            <button id="list-import-confirm">Import</button>
        </div>
    `;

    content.innerHTML = html;
    modal.appendChild(content);

    // Add event listeners for action selects
    importedLists.forEach((list, index) => {
        const existingList = existingLists.find(existing => existing.id === list.id);
        if (existingList && !JSON.stringify(existingList.observations.sort()) === JSON.stringify(list.observations.sort())) {
            setTimeout(() => {
                const actionSelect = document.getElementById(`list-action-${index}`);
                const renameDiv = document.getElementById(`list-rename-${index}`);
                if (actionSelect && renameDiv) {
                    actionSelect.addEventListener('change', () => {
                        renameDiv.style.display = actionSelect.value === 'rename' ? 'block' : 'none';
                    });
                }
            }, 0);
        }
    });

    return new Promise((resolve, reject) => {
        document.body.appendChild(modal);

        document.getElementById('list-import-cancel').onclick = () => {
            document.body.removeChild(modal);
            reject(new Error('Import cancelled'));
        };

        document.getElementById('list-import-confirm').onclick = () => {
            const results = importedLists.map((list, index) => {
                const existingList = existingLists.find(existing => existing.id === list.id);
                if (!existingList) {
                    return { action: 'new', list: list };
                }
                if (JSON.stringify(existingList.observations.sort()) === JSON.stringify(list.observations.sort())) {
                    return { action: 'skip', list: list };
                }
                const actionSelect = document.getElementById(`list-action-${index}`);
                const newNameInput = document.getElementById(`list-newname-${index}`);
                return {
                    action: actionSelect.value,
                    list: list,
                    newName: newNameInput ? newNameInput.value : null
                };
            });
            document.body.removeChild(modal);
            resolve(results);
        };
    });
}

function loadAutoFollowSettings() {
    browserAPI.storage.local.get(
        ['preventTaxonFollow', 'preventFieldFollow', 'preventTaxonReview'], 
        function(data) {
            document.getElementById('preventTaxonFollow').checked = !!data.preventTaxonFollow;
            document.getElementById('preventFieldFollow').checked = !!data.preventFieldFollow;
            document.getElementById('preventTaxonReview').checked = !!data.preventTaxonReview;
        }
    );
}

function saveAutoFollowSettings() {
    const settings = {
        preventTaxonFollow: document.getElementById('preventTaxonFollow').checked,
        preventFieldFollow: document.getElementById('preventFieldFollow').checked,
        preventTaxonReview: document.getElementById('preventTaxonReview').checked
    };
    browserAPI.storage.local.set(settings);
}