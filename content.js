console.log("Content script loaded. URL:", window.location.href);

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

browserAPI.storage.local.get(['highlightColor', 'buttonMinWidth', 'verticalButtonLayout', 'buttonContainerMaxWidth'], function(data) {
    const color = data.highlightColor || '#FF6600';
    document.documentElement.style.setProperty('--highlight-color', color);

    const minWidth = data.buttonMinWidth || 100;
    const maxWidth = data.buttonContainerMaxWidth || 600;
    const isVertical = data.verticalButtonLayout || false;

    document.documentElement.style.setProperty('--button-min-width', minWidth + 'px');
    document.documentElement.style.setProperty('--button-container-max-width', maxWidth + 'px');
    document.documentElement.style.setProperty('--button-flex-direction', isVertical ? 'column' : 'row');
});

browserAPI.storage.onChanged.addListener(function(changes) {
    if (changes.highlightColor) {
        document.documentElement.style.setProperty('--highlight-color', changes.highlightColor.newValue);
    }
    if (changes.buttonMinWidth) {
        document.documentElement.style.setProperty('--button-min-width', changes.buttonMinWidth.newValue + 'px');
    }
    if (changes.buttonContainerMaxWidth) {
        document.documentElement.style.setProperty('--button-container-max-width', changes.buttonContainerMaxWidth.newValue + 'px');
    }
    if (changes.verticalButtonLayout) {
        document.documentElement.style.setProperty('--button-flex-direction', changes.verticalButtonLayout.newValue ? 'column' : 'row');
    }
});
let buttonPosition = 'bottom-right'; // Default position
let idDisplay;
let refreshEnabled = true;
let isButtonsVisible = true;
let customShortcuts = [];
let lastKnownUpdate = 0;
let shortcutListVisible = false;
let currentObservationId = null;
let checkInterval = null;
let observationTabsContainer = null;
let hasMoved = false;
let debugMode = false; 
let bulkActionModeEnabled = false;
let selectedObservations = new Set();
let currentUserId = null;
let configurationSets = [];
let currentSetName = '';
let currentSet = null;
let currentAvailableActions = [];
let onMouseDown;
let onMouseMove;
let onMouseUp;
let lastClickedObservationElementForShiftSelect = null;

const pendingOperations = new Map();

function createOperationKey(observationId, action) {
    // Create a unique key based on observation ID and action details
    const actionKey = JSON.stringify(action);
    return `${observationId}-${actionKey}`;
}

async function getCurrentUserId() {
    if (currentUserId) return currentUserId;
    
    try {
        const response = await makeAPIRequest('/users/me');
        currentUserId = response.results[0].id;
        return currentUserId;
    } catch (error) {
        console.error('Error fetching current user ID:', error);
        return null;
    }
}

function debugLog(message) {
    if (debugMode) {
        console.log(message);
    }
}

function enableDebugMode() {
    debugMode = true;
}

function disableDebugMode() {
    debugMode = false;
}

const qualityMetrics = [
    { value: 'needs_id', label: 'Can the Community Taxon still be confirmed or improved?' },
    { value: 'date', label: 'Date is accurate' },
    { value: 'location', label: 'Location is accurate' },
    { value: 'wild', label: 'Organism is wild' },
    { value: 'evidence', label: 'Evidence of organism' },
    { value: 'recent', label: 'Recent evidence of an organism' },
    { value: 'subject', label: 'Evidence related to a single subject' }
];

function toggleShortcutList() {
    if (shortcutListVisible) {
        document.getElementById('shortcut-list-container').remove();
        shortcutListVisible = false;
    } else {
        createShortcutList();
        shortcutListVisible = true;
    }
}

 
  const debouncedStartObservationCheck = debounce(startObservationCheck, 100);
  const debouncedStopAndClear = debounce(() => {
    stopObservationCheck();
    if (!window.location.pathname.match(/^\/observations\/\d+/)) {
    clearObservationId();
    }
    if (idDisplay) {
      idDisplay.style.display = 'none';
    }
  }, 100);
  
const observer = new MutationObserver((mutations) => {
    const modal = document.querySelector('.ObservationModal.FullScreenModal');
    const enableButton = document.getElementById('enable-bulk-mode-button');
    const bulkContainer = document.getElementById('bulk-action-container');

    if (!bulkActionManuallyHidden) {
        if (modal) {
            if (enableButton) enableButton.style.display = 'none';
        } else {
            if (enableButton && !bulkActionModeEnabled) enableButton.style.display = 'block';
        }
    }

    if (modal) {
        debouncedStartObservationCheck();
    } else {
        debouncedStopAndClear();
    }
});


function createShortcutList() {
    debugLog('Creating shortcut list');
    const container = document.createElement('div');
    container.id = 'shortcut-list-container';
    container.style.cssText = `
        position: fixed;
        top: 50%;
        left: 20px;
        transform: translateY(-50%);
        background-color: white;
        border: 1px solid #ccc;
        padding: 20px;
        z-index: 10001;
        max-height: 90vh;
        width: 300px;
        overflow-y: auto;
        box-shadow: 0 0 10px rgba(0,0,0,0.1);
        font-size: 16px;
        line-height: 1.5;
    `;

    const title = document.createElement('h2');
    title.textContent = 'Keyboard Shortcuts';
    title.style.fontSize = '20px';
    title.style.marginBottom = '15px';
    container.appendChild(title);

    const list = document.createElement('ul');
    list.style.paddingLeft = '20px';
    list.innerHTML = `
        <li>Shift + B: Toggle button visibility</li>
        <li>Shift + V: Toggle bulk action box</li>
        <li>Alt + N: Cycle button position</li>
        <li>Ctrl + Shift + R: Toggle refresh</li>
        <li>Alt + H: Toggle this shortcut list</li>
        <li>Alt + S: Cycle through button sets</li>
        <li>Alt + M: Toggle bulk action mode</li>
        <li>Ctrl + A: Select all observations (in bulk mode)</li>
        <li>Ctrl + Shift + A: Clear all selections (in bulk mode)</li>
        <li>Ctrl + Click: Open identify modal for observation (in bulk mode)</li>
    `;

    // Add custom shortcuts
    browserAPI.storage.local.get('customButtons', function(data) {
        const customButtons = data.customButtons || [];
        customButtons.forEach(button => {
            if (button.shortcut && button.shortcut.key) {
                const li = document.createElement('li');
                li.textContent = `${formatShortcut(button.shortcut)}: ${button.name}`;
                list.appendChild(li);
            }
        });
        container.appendChild(list);
        document.body.appendChild(container);
        debugLog('Shortcut list created and appended to body');
    });
}

let bulkActionManuallyHidden = false;

function toggleBulkActionVisibility() {
    const bulkButtonContainer = document.getElementById('bulk-action-container');
    const enableBulkModeButton = document.getElementById('enable-bulk-mode-button');
    
    if (bulkButtonContainer && enableBulkModeButton) {
        if (bulkButtonContainer.style.display !== 'none' || enableBulkModeButton.style.display !== 'none') {
            bulkButtonContainer.style.display = 'none';
            enableBulkModeButton.style.display = 'none';
            bulkActionManuallyHidden = true;
        } else {
            bulkActionManuallyHidden = false;
            if (bulkActionModeEnabled) {
                bulkButtonContainer.style.display = 'block';
                enableBulkModeButton.style.display = 'none';
            } else {
                bulkButtonContainer.style.display = 'none';
                enableBulkModeButton.style.display = 'block';
            }
        }
    }
}

// In content.js
function handleAllShortcuts(event) {
    const activeElement = document.activeElement;
    const isTyping = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable;

    // Alt+M for bulk action mode toggle is always available
    if (event.altKey && !event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        if (bulkActionModeEnabled) {
            disableBulkActionMode();
        } else {
            enableBulkActionMode();
        }
        return;
    }
    
    // --- NEW: Check if Action Selection Modal is Open for specific shortcuts ---
    const actionSelectModal = document.querySelector('#bulk-action-select'); // Check if the dropdown itself exists
    const isActionSelectModalOpen = actionSelectModal && actionSelectModal.closest('div[style*="z-index: 20001"]'); // A bit fragile, relies on z-index of modal

    if (isActionSelectModalOpen) {
        // If modal is open, prioritize shortcuts for it
        if (!isTyping) { // Allow typing in modal if any input fields were ever added
            // Check for custom action shortcuts to SELECT an item in the dropdown
            for (const buttonConfig of currentAvailableActions) { // Iterate over actions available in the modal
                if (buttonConfig.shortcut &&
                    event.key.toLowerCase() === buttonConfig.shortcut.key.toLowerCase() &&
                    event.ctrlKey === !!buttonConfig.shortcut.ctrlKey &&
                    event.shiftKey === !!buttonConfig.shortcut.shiftKey &&
                    event.altKey === !!buttonConfig.shortcut.altKey) {
                    
                    event.preventDefault();
                    actionSelectModal.value = buttonConfig.id;
                    // Manually trigger the change event to update description and enable Apply button
                    actionSelectModal.dispatchEvent(new Event('change'));
                    console.log(`Shortcut selected action: ${buttonConfig.name}`);
                    return; // Shortcut handled
                }
            }
            // Enter key to "Apply Action" when an action is selected in the modal (will be added in createActionModal)
            // Escape key to "Cancel" modal (will be added in createActionModal)
        }
    } else if (isTyping && !isActionSelectModalOpen) { // If typing outside the action select modal, do nothing further
        return;
    }
    // --- END NEW ---
    

    // Process standard non-modal shortcuts if not typing or modal not handled above
    if (!isTyping || !isActionSelectModalOpen) { // Ensure these don't fire if modal handled it or typing in general
        if (event.shiftKey && !event.altKey && !event.ctrlKey && event.key.toLowerCase() === 'b') {
            toggleButtonVisibility();
            return;
        }
        if (event.altKey && !event.shiftKey && !event.ctrlKey && event.key.toLowerCase() === 'n') {
            cycleButtonPosition();
            return;
        }
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'r') {
            event.preventDefault();
            toggleRefresh();
            return;
        }
        if (event.altKey && !event.shiftKey && !event.ctrlKey && event.key.toLowerCase() === 'h') {
            event.preventDefault();
            toggleShortcutList();
            return;
        }
        if (event.shiftKey && !event.altKey && !event.ctrlKey && event.key.toLowerCase() === 'v') {
            event.preventDefault();
            toggleBulkActionVisibility();
            return;
        }
        if (event.altKey && !event.shiftKey && !event.ctrlKey && event.key.toLowerCase() === 's') { // Cycle sets
             event.preventDefault();
             cycleConfigurationSet();
             return;
        }
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'a') {
            if (bulkActionModeEnabled) {
                event.preventDefault();
                selectAllObservations();
                return;
            }
        }
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'a') {
            if (bulkActionModeEnabled) {
                event.preventDefault();
                clearSelection();
                return;
            }
        }

        // Process custom shortcuts for individual observation actions (when bulk mode is NOT enabled)
        // OR Process custom shortcuts for BULK EXECUTION (when bulk mode IS enabled but action modal is NOT open)
        if (!isActionSelectModalOpen && currentSet && currentSet.buttons) {
            const actionsToConsider = bulkActionModeEnabled ? 
                                      currentAvailableActions : // For triggering bulk execution directly
                                      customShortcuts;          // For single observation buttons

            for (const item of actionsToConsider) {
                const shortcut = bulkActionModeEnabled ? item.shortcut : item; // Structure differs slightly
                const buttonToClick = bulkActionModeEnabled ? null : item.button; // Button element for single mode

                if (shortcut && shortcut.key &&
                    event.key.toLowerCase() === shortcut.key.toLowerCase() &&
                    event.ctrlKey === !!shortcut.ctrlKey &&
                    event.shiftKey === !!shortcut.shiftKey &&
                    event.altKey === !!shortcut.altKey) {
                    
                    event.preventDefault();
                    if (bulkActionModeEnabled) {
                        // Open the modal with this action pre-selected
                        if (item.id && document.getElementById('bulk-action-container')?.style.display === 'block') {
                            applyBulkActionFromShortcut(item);
                        }
                    } else if (!bulkActionModeEnabled && buttonToClick && buttonToClick.isConnected) {
                        buttonToClick.click(); // Click the single observation button
                    }
                    return; // Shortcut handled
                }
            }
        }
    }
}

document.addEventListener('keydown', handleAllShortcuts);

const positions = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
let currentPositionIndex = 0;

function toggleButtonVisibility() {
    const buttonDiv = document.getElementById('custom-extension-container').parentElement;
    isButtonsVisible = !isButtonsVisible;
    buttonDiv.style.display = isButtonsVisible ? 'block' : 'none';
}

function cycleButtonPosition() {
    currentPositionIndex = (currentPositionIndex + 1) % positions.length;
    buttonPosition = positions[currentPositionIndex];
    updatePositions();
    updateBulkButtonPosition();
    browserAPI.storage.local.set({buttonPosition: buttonPosition});
}

browserAPI.storage.local.get('buttonPosition', function(data) {
    if (data.buttonPosition) {
        buttonPosition = data.buttonPosition;
        currentPositionIndex = positions.indexOf(buttonPosition);
        updatePositions();
    }
});

function updatePositions() {
    console.log('Update Positions called');
    const buttonDiv = document.getElementById('custom-extension-container').parentElement;
    const sortButtonContainer = document.getElementById('sort-buttons-container');
    if (!buttonDiv || !sortButtonContainer) {
        setTimeout(updatePositions, 1); // Retry after a short delay
        return;
    }
    buttonDiv.style.top = buttonDiv.style.left = buttonDiv.style.bottom = buttonDiv.style.right = 'auto';
    sortButtonContainer.style.top = sortButtonContainer.style.left = sortButtonContainer.style.bottom = sortButtonContainer.style.right = 'auto';
    
    if (idDisplay) {
        idDisplay.style.top = idDisplay.style.left = idDisplay.style.bottom = idDisplay.style.right = 'auto';
    }
    
    switch (buttonPosition) {
        case 'top-left':
            buttonDiv.style.top = '10px';
            buttonDiv.style.left = '10px';
            sortButtonContainer.style.top = '100%';
            sortButtonContainer.style.left = '0';
            if (idDisplay) {
                idDisplay.style.top = '10px';
                idDisplay.style.right = '10px';
            }
            break;
        case 'top-right':
            buttonDiv.style.top = '10px';
            buttonDiv.style.right = '10px';
            sortButtonContainer.style.top = '100%';
            sortButtonContainer.style.right = '0';
            if (idDisplay) {
                idDisplay.style.top = '10px';
                idDisplay.style.left = '10px';
            }
            break;
        case 'bottom-left':
            buttonDiv.style.bottom = '10px';
            buttonDiv.style.left = '10px';
            sortButtonContainer.style.bottom = '100%';
            sortButtonContainer.style.left = '0';
            if (idDisplay) {
                idDisplay.style.bottom = '10px';
                idDisplay.style.right = '10px';
            }
            break;
        case 'bottom-right':
            buttonDiv.style.bottom = '10px';
            buttonDiv.style.right = '10px';
            sortButtonContainer.style.bottom = '100%';
            sortButtonContainer.style.right = '0';
            if (idDisplay) {
                idDisplay.style.bottom = '10px';
                idDisplay.style.left = '10px';
            }
            break;
    }
    updateBulkButtonPosition();
}

function updateBulkButtonPosition() {
    console.log('Updating bulk button position');
    const bulkButtonContainer = document.getElementById('bulk-action-container');
    if (!bulkButtonContainer) return;

    bulkButtonContainer.style.top = bulkButtonContainer.style.left = bulkButtonContainer.style.bottom = bulkButtonContainer.style.right = 'auto';
    
    switch (buttonPosition) {
        case 'top-left':
            bulkButtonContainer.style.top = '10px';
            bulkButtonContainer.style.right = '10px';
            break;
        case 'top-right':
            bulkButtonContainer.style.top = '10px';
            bulkButtonContainer.style.left = '10px';
            break;
        case 'bottom-left':
            bulkButtonContainer.style.bottom = '10px';
            bulkButtonContainer.style.right = '10px';
            break;
        case 'bottom-right':
            bulkButtonContainer.style.bottom = '10px';
            bulkButtonContainer.style.left = '10px';
            break;
    }
}

let lastLoggedState = {
    url: null,
    observationId: null,
    modalFound: null,
    gridFound: null
};

function extractObservationId() {
    const currentUrl = window.location.href;
    const currentState = {
        url: currentUrl,
        observationId: null,
        modalFound: false,
        gridFound: false
    };

    // Check if we're on an individual observation page
    if (window.location.pathname.match(/^\/observations\/\d+$/)) {
        const id = window.location.pathname.split('/').pop();
        if (id && /^\d+$/.test(id)) {
            currentState.observationId = id;
        }
    }

    const modal = document.querySelector('.ObservationModal.FullScreenModal');
    currentState.modalFound = !!modal;

    if (modal) {
        const selectors = [
            '.obs-modal-header a[href^="/observations/"]',
            '.obs-modal-header .comname.display-name',
            '.obs-modal-header .sciname.secondary-name'
        ];

        for (let selector of selectors) {
            const element = modal.querySelector(selector);
            if (element) {
                const href = element.getAttribute('href');
                if (href) {
                    const potentialId = href.split('/').pop();
                    if (potentialId && /^\d+$/.test(potentialId)) {
                        currentState.observationId = potentialId;
                        break;
                    }
                }
            }
        }
    }

    const grid = document.querySelector("#Identify > div > div.mainrow.false.row > div.main-col > div.ObservationsGrid.flowed.false.row");
    currentState.gridFound = !!grid;

    // Only log if there's a change or unexpected state
    if (JSON.stringify(currentState) !== JSON.stringify(lastLoggedState)) {
        console.log('extractObservationId: State changed', {
            url: currentState.url,
            observationId: currentState.observationId,
            modalFound: currentState.modalFound,
            gridFound: currentState.gridFound
        });

        if (!currentState.observationId) {
            console.log('extractObservationId: No valid observation ID found');
        }

        if (!currentState.modalFound && !currentState.gridFound) {
            console.log('extractObservationId: Neither modal nor grid found');
        }

        lastLoggedState = currentState;
    }

    if (currentState.observationId !== currentObservationId) {
        console.log('extractObservationId: New Observation ID:', currentState.observationId);
        currentObservationId = currentState.observationId;
        createOrUpdateIdDisplay(currentState.observationId || 'Unknown');
    }
}

function extractObservationIdFromUrl() {
    const url = window.location.href;
    console.log('Current URL:', url);
    const urlPattern = /https:\/\/www\.inaturalist\.org\/observations\/(\d+)/;
    const match = url.match(urlPattern);

    if (match && match[1]) {
        console.log('Extracted observation ID from URL:', match[1]);
        return match[1];
    }

    if (url.includes('/observations/identify')) {
        console.log('On identify page, no observation ID in URL');
        return null;
    }

    console.log('Unable to extract observation ID from URL:', url);
    return null;
}

function setupObservationTabsObserver() {
    debugLog('Setting up observation tabs observer');
    observationTabsContainer = document.querySelector('.ObservationsPane');
    if (!observationTabsContainer) {
        console.log('Observation tabs container not found, retrying in 1 second...');
        setTimeout(setupObservationTabsObserver, 1000);
        return;
    }

    debugLog('Observation tabs container found');
    const observer = new MutationObserver((mutations) => {
        for (let mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-id') {
                const newId = observationTabsContainer.getAttribute('data-id');
                debugLog('New data-id detected:', newId);
                if (newId && newId !== currentObservationId) {
                    currentObservationId = newId;
                    console.log('Current Observation ID (from tab change):', currentObservationId);
                    createOrUpdateIdDisplay(currentObservationId);
                }
                break;
            }
        }
    });

    observer.observe(observationTabsContainer, { attributes: true, attributeFilter: ['data-id'] });
    console.log('Observer set up successfully');
}

function logModalStructure() {
    const modal = document.querySelector('.ObservationModal.FullScreenModal');
    if (modal) {
        const header = modal.querySelector('.obs-modal-header');
        if (header) {
            debugLog('Header structure:', header.innerHTML);
        } else {
            debugLog('Header not found in modal');
        }
    } else {
        debugLog('Modal not found');
    }
}

function startObservationCheck() {
    if (checkInterval) clearInterval(checkInterval);
    checkInterval = setInterval(extractObservationId, 250);
}

function stopObservationCheck() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
}



observer.observe(document.body, { childList: true, subtree: true });

function ensureCorrectObservationId() {
    return new Promise((resolve) => {
        extractObservationId();
        setTimeout(() => {
            resolve(currentObservationId);
        }, 50);
    });
}

window.addEventListener('load', extractObservationId);

function animateButton(button) {
    button.style.transform = 'scale(0.9)';
    setTimeout(() => {
        button.style.transform = '';
    }, 100);
}

// Create buttons and add them to the page
let buttonDiv = document.createElement('div');
buttonDiv.style.position = 'fixed';
buttonDiv.style.zIndex = '10000';

const buttonContainer = document.createElement('div');
buttonContainer.id = 'custom-extension-container';

buttonDiv.appendChild(buttonContainer);
document.body.appendChild(buttonDiv);



async function addObservationField(observationId, fieldId, value, button = null) {
        if (!observationId) {
        console.log('No observation ID provided. Please select an observation first.');
        return { success: false, error: 'No observation ID provided' };
        }

       const jwt = await getJWT();
        if (!jwt) {
            console.error('No JWT found');
            return { success: false, error: 'No JWT found' };
        }

        const requestUrl = `https://api.inaturalist.org/v1/observation_field_values`;
        const headers = {
            'Authorization': `Bearer ${jwt}`,
            'Content-Type': 'application/json'
        };
        const data = {
            observation_field_value: {
                observation_id: observationId,
                observation_field_id: fieldId,
                value: value
            }
        };
        const options = {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data)
        };

        try {
            const response = await fetch(requestUrl, options);
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Network response was not ok. Status: ${response.status}, Body: ${text}`);
            }
            const responseData = await response.json();
            console.log('Added observation field:', responseData);
            return { success: true, data: responseData };
        } catch (error) {
            if (error.message.includes("Observation user does not accept fields from others")) {
                console.log('User does not accept fields from others:', error);
                return { success: false, error: 'User does not accept fields from others' };
            } else {
                console.error('Error in adding observation field:', error);
                return { success: false, error: error.message };
            }
        }
}

async function addAnnotation(observationId, attributeId, valueId) {
    if (!observationId) {
        console.log('No observation ID provided. Please select an observation first.');
        return { success: false, error: 'No observation ID provided' };
    }

    const jwt = await getJWT();
    if (!jwt) {
        console.error('No JWT found');
        return { success: false, error: 'No JWT found' };
    }

    const url = 'https://api.inaturalist.org/v1/annotations';
    const data = {
        annotation: {
            resource_type: "Observation",
            resource_id: observationId,
            controlled_attribute_id: attributeId,
            controlled_value_id: valueId
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwt}`
            },
            body: JSON.stringify(data)
        });
        const responseData = await response.json();
        if (responseData.errors) {
            console.log('Annotation not added:', responseData.errors);
            return { success: false, message: 'Annotation not added', data: responseData };
        } else {
            console.log('Annotation added successfully:', responseData);
            return { success: true, data: responseData, uuid: responseData.uuid };
        }
    } catch (error) {
        console.error('Error adding annotation:', error);
        return { success: false, error: safeErrorString(error) };
    }
}

async function addObservationToProject(observationId, projectId) {
    if (!observationId) {
        console.log('No observation ID provided. Please select an observation first.');
        return { success: false, error: 'No observation ID provided' };
    }

    const jwt = await getJWT();
    if (!jwt) {
        console.error('No JWT found');
        return { success: false, error: 'No JWT found' };
    }

    const url = 'https://api.inaturalist.org/v1/project_observations';
    const data = {
        project_observation: {
            observation_id: observationId,
            project_id: projectId
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwt}`
            },
            body: JSON.stringify(data)
        });
        const responseData = await response.json();
        if (responseData.errors) {
            console.log('Observation not added to project:', responseData.errors);
            return { success: false, message: 'Observation not added to project', data: responseData };
        } else {
            console.log('Observation added to project successfully:', responseData);
            return { success: true, data: responseData };
        }
    } catch (error) {
        console.error('Error adding observation to project:', error);
        return { success: false, error: safeErrorString(error) };
    }
}

async function addComment(observationId, commentBody) {
    if (!observationId) {
        console.log('No observation ID provided. Please select an observation first.');
        return { success: false, error: 'No observation ID provided' };
    }

    const jwt = await getJWT();
    if (!jwt) {
        console.error('No JWT found');
        return { success: false, error: 'No JWT found' };
    }

    const url = 'https://api.inaturalist.org/v1/comments';
    const data = {
        comment: {
            parent_type: 'Observation',
            parent_id: observationId,
            body: commentBody
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwt}`
            },
            body: JSON.stringify(data)
        });
        const responseData = await response.json();
        if (responseData.errors) {
            console.log('Comment not added:', responseData.errors);
            return { success: false, message: 'Comment not added', data: responseData };
        } else {
            console.log('Comment added successfully:', responseData);
            return { success: true, data: responseData, uuid: responseData.uuid };
        }
    } catch (error) {
        console.error('Error adding comment:', error);
        return { success: false, error: safeErrorString(error) };
    }
}

async function addTaxonId(observationId, taxonId, comment = '', disagreement = false) {
    if (!observationId) {
        console.log('No observation ID provided. Please select an observation first.');
        return { success: false, error: 'No observation ID provided' };
    }

    const jwt = await getJWT();
    if (!jwt) {
        console.error('No JWT found');
        return { success: false, error: 'No JWT found' };
    }

    const url = 'https://api.inaturalist.org/v1/identifications';
    const data = {
        identification: {
            observation_id: observationId,
            taxon_id: taxonId,
            body: comment,
            disagreement: disagreement
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwt}`
            },
            body: JSON.stringify(data)
        });
        const responseData = await response.json();
        if (responseData.errors) {
            console.log('Taxon ID not added:', responseData.errors);
            return { success: false, message: 'Taxon ID not added', data: responseData };
        } else {
            console.log('Taxon ID added successfully:', responseData);
            return { success: true, data: responseData, identificationUUID: responseData.uuid };
        }
    } catch (error) {
        console.error('Error adding Taxon ID:', error);
        return { success: false, error: safeErrorString(error) };
    }
}


async function handleQualityMetricAPI(observationId, metric, vote) {
    const jwt = await getJWT();
    if (!jwt) {
        console.error('No JWT found');
        return { success: false, error: 'No JWT found' };
    }

    let url, method, body;

    if (metric === 'needs_id') {
        if (vote === 'remove') {
            url = `https://api.inaturalist.org/v1/votes/unvote/observation/${observationId}?scope=needs_id`;
            method = 'DELETE';
            body = null;
        } else {
            url = `https://api.inaturalist.org/v1/votes/vote/observation/${observationId}`;
            method = 'POST';
            body = JSON.stringify({ vote: vote === 'agree' ? 'yes' : 'no', scope: 'needs_id' });
        }
    } else {
        url = `https://api.inaturalist.org/v1/observations/${observationId}/quality/${metric}`;
        method = vote === 'remove' ? 'DELETE' : 'POST';
        body = vote === 'disagree' ? JSON.stringify({ agree: "false" }) : null;
    }

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwt}`
            },
            body: body
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const responseData = await response.json();
        console.log(`Quality metric ${metric} ${vote} successful:`, responseData);

        if (metric !== 'needs_id') {
            await updateQualityMetrics(observationId);
        }

        return { success: true, data: responseData };
    } catch (error) {
        console.error(`Error in quality metric ${metric} ${vote}:`, error);
        return { success: false, error: safeErrorString(error) };
    }
}

async function handleQualityMetric(observationId, metricValue, vote) {
    const metricLabel = getMetricLabel(metricValue);
    console.log(`Handling quality metric: ${metricLabel}, vote: ${vote}`);
    
    const metricsContainer = document.querySelector('.QualityMetrics');
    if (!metricsContainer) {
        console.error('QualityMetrics container not found');
        return { success: false, error: 'QualityMetrics container not found' };
    }

    const rows = metricsContainer.querySelectorAll('tr');
    const targetRow = Array.from(rows).find(row => {
        const titleCell = row.querySelector('td.metric_title');
        return titleCell && titleCell.textContent.trim() === metricLabel;
    });

    if (!targetRow) {
        console.error(`Metric "${metricLabel}" not found`);
        return { success: false, error: 'Metric not found' };
    }

    const agreeCell = targetRow.querySelector('td.agree');
    const disagreeCell = targetRow.querySelector('td.disagree');
    const agreeButton = agreeCell.querySelector('button');
    const disagreeButton = disagreeCell.querySelector('button');
    
    if (!agreeButton || !disagreeButton) {
        console.error(`Buttons for "${metricLabel}" not found`);
        return { success: false, error: 'Buttons not found' };
    }

    const currentState = getCurrentState(agreeCell, disagreeCell);
    console.log(`Current state for ${metricLabel}: ${currentState}`);

    let buttonToClick;
    switch (vote) {
        case 'agree':
            buttonToClick = currentState !== 'agree' ? agreeButton : null;
            break;
        case 'disagree':
            buttonToClick = currentState !== 'disagree' ? disagreeButton : null;
            break;
        case 'remove':
            buttonToClick = currentState === 'agree' ? agreeButton : 
                            currentState === 'disagree' ? disagreeButton : null;
            break;
    }

    if (buttonToClick) {
        console.log(`Clicking ${buttonToClick === agreeButton ? 'agree' : 'disagree'} button for "${metricLabel}"`);
        buttonToClick.click();
        await waitForStateChange(targetRow, currentState);
    } else {
        console.log(`No action needed for ${metricLabel} - already in desired state`);
    }

    console.log(`${metricLabel} ${vote} action completed`);
    return { success: true };
}

function getCurrentState(agreeCell, disagreeCell) {
    const agreeButton = agreeCell.querySelector('button');
    const disagreeButton = disagreeCell.querySelector('button');

    if (agreeButton.querySelector('.fa-thumbs-up')) {
        return 'agree';
    } else if (disagreeButton.querySelector('.fa-thumbs-down')) {
        return 'disagree';
    } else {
        return 'none';
    }
}

function waitForStateChange(row, originalState) {
    return new Promise((resolve) => {
        const observer = new MutationObserver(() => {
            const newState = getCurrentState(row.querySelector('td.agree'), row.querySelector('td.disagree'));
            if (newState !== originalState) {
                observer.disconnect();
                resolve();
            }
        });

        observer.observe(row, { 
            subtree: true, 
            childList: true,
            attributes: true,
            attributeFilter: ['class']
        });

        // Timeout after 5 seconds in case the state doesn't change
        setTimeout(() => {
            observer.disconnect();
            resolve();
        }, 50);
    });
}

function getMetricLabel(value) {
    const metric = qualityMetrics.find(m => m.value === value);
    return metric ? metric.label : value;
}

async function copyObservationField(observationId, sourceFieldId, targetFieldId) {
    try {
        // GET request to fetch the observation details
        const observationResponse = await makeAPIRequest(`/observations/${observationId}`);
        if (!observationResponse.results || observationResponse.results.length === 0) {
            throw new Error('Observation not found');
        }

        const observation = observationResponse.results[0];
        const sourceFieldValue = observation.ofvs.find(ofv => ofv.field_id === parseInt(sourceFieldId));

        if (!sourceFieldValue) {
            throw new Error('Source field not found on the observation');
        }

        // POST request to add the value to the target field
        const postResponse = await makeAPIRequest('/observation_field_values', {
            method: 'POST',
            body: JSON.stringify({
                observation_field_value: {
                    observation_id: observationId,
                    observation_field_id: targetFieldId,
                    value: sourceFieldValue.value
                }
            })
        });

        console.log('Field value copied successfully:', postResponse);
        return { success: true, data: postResponse };
    } catch (error) {
        console.error('Error in copyObservationField:', error);
        return { success: false, error: safeErrorString(error) };
    }
}

function animateButtonResult(button, success) {
    button.classList.add(success ? 'button-success' : 'button-failure');
    setTimeout(() => {
        button.classList.remove('button-success', 'button-failure');
    }, 1200); 
}
const style = document.createElement('style');
style.textContent += `
    #custom-extension-container.edit-mode .button-ph {
        cursor: move;
        box-shadow: 0 0 3px rgba(0,0,0,0.3);
    }
    #custom-extension-container.edit-mode .button-ph:hover {
        transform: scale(1.05);
        transition: transform 0.1s ease-in-out;
    }
    #custom-extension-container.edit-mode .button-ph.dragging {
        opacity: 0.8;
        transform: scale(1.05);
        transition: none;
        pointer-events: none;
    }
    .button-placeholder {
        border: 2px dashed #cccccc;
        background-color: #f0f0f0a0; /* Semi-transparent */
        box-sizing: border-box; /* Important if you set width/height */
        /* Match dimensions of .button-ph or make it flexible */
        min-width: 100px; /* Example, match .button-ph */
        height: 30px;     /* Example, match .button-ph */
        margin: 3px;      /* Example, match .button-ph */
        flex-grow: 1;     /* If .button-ph uses flex-grow */
        border-radius: 5px;
    }
@keyframes clickPulse {
    0% { transform: scale(0.95); opacity: 1; }
    100% { transform: scale(1.05); opacity: 0; }
}
  #observation-id-display {
    position: fixed;
    background-color: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 10px;
    border-radius: 5px;
    font-family: Arial, sans-serif;
    z-index: 10000;
    transition: background-color 0.3s ease;
  }
  #observation-id-display.updated {
    background-color: rgba(0, 255, 0, 0.7);
    animation: pulseGreen 1.5s ease-out;
  }
  @keyframes pulseGreen {
      0% { box-shadow: 0 0 0 0 rgba(0, 255, 0, 0.7); transform: scale(1); }
      50% { box-shadow: 0 0 0 20px rgba(0, 255, 0, 0.3); transform: scale(1.1); }
      100% { box-shadow: 0 0 0 0 rgba(0, 255, 0, 0); transform: scale(1); }
  }
  @keyframes pulseRed {
      0% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.7); transform: scale(1); }
      50% { box-shadow: 0 0 0 20px rgba(255, 0, 0, 0.3); transform: scale(1.1); }
      100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0); transform: scale(1); }
  }
  .button-success {
      animation: pulseGreen 1.5s ease-out;
      background-color: rgba(0, 255, 0, 0.7) !important;
  }
  .button-failure {
      animation: pulseRed 1.5s ease-out;
      background-color: rgba(255, 0, 0, 0.7) !important;
  }
  #custom-extension-container {
      display: flex;
      flex-direction: var(--button-flex-direction, row);
      flex-wrap: wrap;
      gap: 5px;
      max-width: var(--button-container-max-width, 600px);
  }
    #custom-extension-container.dragging {
    height: var(--original-height);
    width: var(--original-width);
  }
  .button-ph {
        position: relative;
        margin: 3px;
        flex-grow: 1;
        min-width: var(--button-min-width, 100px);
    }
    .button-ph button:hover {
        background-color: rgba(0, 0, 0, 0.7) !important;
    }
    .button-ph .tooltip {
        visibility: hidden;
        background-color: black;
        color: white;
        text-align: center;
        border-radius: 6px;
        padding: 5px;
        position: absolute;
        z-index: 10002;
        bottom: 125%;
        left: 50%;
        transform: translateX(-50%);
        opacity: 0;
        transition: opacity 0.3s;
        pointer-events: none;
    }
    .button-ph:hover .tooltip {
        visibility: visible;
        opacity: 1;
    }
  .button-ph.dragging {
    opacity: 0.5;
    position: fixed;
    pointer-events: none;
    z-index: 1000;
  }
  .button-placeholder {
    border: 2px dashed #ccc;
    background-color: #f0f0f0;
    min-width: 100px;
    flex-grow: 1;
    margin: 3px;
    border-radius: 5px;
  }
  #custom-extension-input {
      width: 120px;
  }
  #custom-extension-input:focus + .tooltip {
      display: block;
  }
 .bulk-action-button {
        background-color: #4CAF50;
        border: none;
        color: white;
        text-align: center;
        text-decoration: none;
        display: inline-block;
        font-size: 14px;
        margin: 4px 2px;
        cursor: pointer;
        border-radius: 4px;
        padding: 10px 20px;
    }
    .ObservationsGridItem.selected {
        box-shadow: 0 0 0 6px var(--highlight-color, #FF6600);
    }
    #enable-bulk-mode-button {
        position: fixed;
        z-index: 10000;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }
    #enable-bulk-mode-button:before {
        content: '';
        position: absolute;
        top: -2px;
        left: -2px;
        right: -2px;
        bottom: -2px;
        border: 2px solid white;
        border-radius: 6px;
        z-index: -1;
    }
    .modal-link {
            word-break: break-all;
            color: blue;
            text-decoration: underline;
            cursor: pointer;
        }

    .modal-button {
        margin-top: 10px;
        padding: 5px 10px;
        background-color: #4CAF50;
        color: white;
        border: none;
        border-radius: 3px;
        cursor: pointer;
    }

    .modal-button:hover {
        background-color: #45a049;
    }
    #sort-buttons-container {
        position: absolute;
        top: -30px;
        right: 0;
        z-index: 10002;
    }
    #sort-button {
        background-color: rgba(0, 0, 0, 0.1);
        border: none;
        border-radius: 3px;
        padding: 5px 10px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
    }
    #sort-button:hover {
        background-color: rgba(0, 0, 0, 0.2);
    }
    #sort-button::after {
        content: '▼';
        margin-left: 5px;
        font-size: 10px;
    }
    #sort-dropdown {
        display: none;
        position: absolute;
        bottom: 100%;
        right: 0;
        background-color: white;
        border: 1px solid #ccc;
        border-radius: 3px;
        box-shadow: 0 -2px 5px rgba(0,0,0,0.1);
        padding: 5px 0;
        margin-bottom: 5px;
    }
    #sort-dropdown button {
        display: block;
        width: 100%;
        padding: 5px 10px;
        text-align: left;
        background: none;
        border: none;
        cursor: pointer;
        white-space: nowrap;
    }
    #sort-dropdown button:hover {
        background-color: #f0f0f0;
    }
`;
document.head.appendChild(style);

function createOrUpdateIdDisplay(id) {
    if (!idDisplay) {
        idDisplay = document.createElement('div');
        idDisplay.id = 'observation-id-display';
        document.body.appendChild(idDisplay);
        updatePositions();
    }
    
    idDisplay.innerHTML = `Current Observation ID: ${id}`;
    idDisplay.style.display = 'block'; // Ensure it's visible
    
    // Add refresh indicator if it doesn't exist
    if (!idDisplay.querySelector('#refresh-indicator')) {
        const refreshIndicator = document.createElement('span');
        refreshIndicator.id = 'refresh-indicator';
        refreshIndicator.style.marginLeft = '10px';
        idDisplay.appendChild(refreshIndicator);
    }
    
    updateRefreshIndicator();
    
    idDisplay.classList.add('updated');
    setTimeout(() => {
        idDisplay.classList.remove('updated');
    }, 300);
}

window.addEventListener('load', () => {
    console.log('Window load event fired');
    extractObservationId();
    if (window.location.href.includes('/observations/identify')) {
        console.log('On identify page, creating bulk action buttons');
        createBulkActionButtons();
        updateSelectedObservations();
        // Add this check
        setTimeout(() => {
            const enableButton = document.getElementById('enable-bulk-mode-button');
            if (enableButton) {
                console.log('Enable button exists after timeout');
                console.log('Enable button display:', getComputedStyle(enableButton).display);
                console.log('Enable button position:', enableButton.style.cssText);
            } else {
                console.log('Enable button not found after timeout');
            }
        }, 1000);
    } else if (window.location.pathname.match(/^\/observations\/\d+/)) {
        console.log('On individual observation page');
        const observationId = window.location.pathname.split('/').pop();
        console.log('Observation ID from URL:', observationId);
        currentObservationId = observationId;
        createOrUpdateIdDisplay(observationId);
    }
    if (!currentObservationId) {
        createOrUpdateIdDisplay('None');
    }
    createDynamicButtons();
});


function createRefreshIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'refresh-indicator';
    indicator.style.display = 'inline-block';
    indicator.style.marginLeft = '10px';
    indicator.style.padding = '5px';
    indicator.style.borderRadius = '5px';
    indicator.style.transition = 'background-color 0.3s';
    updateRefreshIndicator(indicator);
    return indicator;
}

function updateRefreshIndicator(indicator = document.getElementById('refresh-indicator')) {
    if (indicator) {
        indicator.textContent = refreshEnabled ? 'Refresh On' : 'Refresh Off';
        indicator.style.backgroundColor = refreshEnabled ? 'rgba(0, 255, 0, 0.7)' : 'rgba(255, 0, 0, 0.7)';
    }
}

async function updateQualityMetrics(observationId) {
    try {
        const jwt = await getJWT();
        if (!jwt) {
            console.error('No JWT found');
            return;
        }

        const qualityMetricsUrl = `https://api.inaturalist.org/v1/observations/${observationId}/quality_metrics?ttl=-1`;
        const response = await fetch(qualityMetricsUrl, {
            headers: {
                'Authorization': `Bearer ${jwt}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        updateQualityMetricsUI(data.results);
    } catch (error) {
        console.error('Error fetching quality metrics:', error);
    }
}


function updateQualityMetricsUI(metrics) {
    const qualityContainer = document.querySelector('.quality_assessment');
    if (!qualityContainer) return;

    metrics.forEach(metric => {
        if (metric.metric === 'needs_id') return; // Skip the needs_id metric

        const metricElement = qualityContainer.querySelector(`[data-metric="${metric.metric}"]`);
        if (metricElement) {
            metricElement.classList.toggle('assessed', metric.agree);
            const icon = metricElement.querySelector('.fa');
            if (icon) {
                icon.classList.toggle('fa-check-circle', metric.agree);
                icon.classList.toggle('fa-circle-o', !metric.agree);
            }
        }
    });
}


function clearObservationId() {
    currentObservationId = null;
    if (idDisplay) {
        idDisplay.textContent = 'Current Observation ID: None';
    }
    console.log('Observation ID cleared');
}

async function performActions(actions) {
    let observationId = await ensureCorrectObservationId();
    if (!observationId) {
        alert('Please open an observation before using this button.');
        return [];
    }

    // Get original states BEFORE actions
    const originalStates = await handleFollowAndReviewPrevention(observationId, actions, []);

    const results = [];
    try {
        // Perform all actions
        for (const action of actions) {
            const result = await performSingleAction(action, observationId);
            results.push(result);
        }

        // Now check and restore states using our stored original states
        await handleStateRestoration(observationId, actions, results, originalStates);

    } catch (error) {
        console.error('Error in performActions:', error);
        alert(`Error performing actions: ${error.message}`);
    }

    return results;
}

async function performSingleAction(action, observationId, isIdentifyPage) {
    switch (action.type) {
        case 'follow':
            const followState = await makeAPIRequest(`/observations/${observationId}/subscriptions`);
            const isCurrentlyFollowed = followState.results && followState.results.length > 0;
            const shouldBeFollowed = action.follow === 'follow';
            
            if (isCurrentlyFollowed === shouldBeFollowed) {
                console.log(`Observation ${observationId} already in desired follow state:`, shouldBeFollowed);
                return { success: true, message: 'Already in desired state' };
            }
            
            return toggleFollowObservation(observationId, shouldBeFollowed);
        case 'reviewed':
            return markObservationReviewed(observationId, action.reviewed === 'mark'); // Pass true for "mark as reviewed"
        case 'withdrawId':
            try {
                const currentUserId = await getCurrentUserId();
                console.log('Looking up current user ID:', currentUserId);
                
                // Get current identification so we can store it for undo
                const response = await makeAPIRequest(`/observations/${observationId}`);
                const observation = response.results[0];
                const userIdentifications = observation.identifications
                    .filter(id => id.user.id === currentUserId && id.current)
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                
                const currentIdentification = userIdentifications[0];
                if (!currentIdentification) {
                    return { success: false, error: 'No active identification found to withdraw' };
                }
        
                // Withdraw the identification by setting current to false
                await makeAPIRequest(`/identifications/${currentIdentification.uuid}`, {
                    method: 'PUT',
                    body: JSON.stringify({ current: false })
                });
                
                return { 
                    success: true, 
                    identificationUUID: currentIdentification.uuid,
                    taxonId: currentIdentification.taxon.id,
                    taxonName: currentIdentification.taxon.name
                };
            } catch (error) {
                console.error('Error withdrawing identification:', error);
                return { success: false, error: safeErrorString(error) };
            }
            case 'observationField':
                // Check if value is identical before calling addObservationField ---
                const existingValueDetails = await getFieldValueDetails(observationId, action.fieldId);
                const existingValue = existingValueDetails ? (existingValueDetails.displayValue || existingValueDetails.value) : null;
                const proposedValue = action.fieldValue; // This is the ID for taxon, or direct value for others
                const proposedDisplayValue = action.displayValue || action.fieldValue; // This is for comparison with displayValue
    
                // Compare intelligently:
                // If existingValueDetails has displayValue (it's a resolved taxon), compare with proposedDisplayValue.
                // Otherwise, compare proposedValue (which could be a taxon ID) with existingValueDetails.value (raw value).
                let isIdentical = false;
                if (existingValueDetails && existingValueDetails.displayValue) {
                    // This means existing is a resolved taxon, compare with the proposed display name
                    isIdentical = existingValueDetails.displayValue === proposedDisplayValue;
                } else if (existingValueDetails) {
                    // Existing is not a resolved taxon, or proposed is not a taxon from autocomplete
                    // Compare raw values. Note: action.fieldValue might be a taxon ID if it wasn't from autocomplete.
                    isIdentical = existingValueDetails.value === proposedValue;
                     // Special check if existing is a number (likely taxon ID) and proposed is a string that might be that ID
                    if (!isIdentical && typeof existingValueDetails.value === 'number' && typeof proposedValue === 'string' && existingValueDetails.value.toString() === proposedValue) {
                        isIdentical = true;
                    }
                }
    
    
                if (existingValue !== null && isIdentical) {
                    console.log(`Observation Field ${action.fieldName} for obs ${observationId} already has value "${proposedDisplayValue}". Skipping API call.`);
                    return { 
                        success: true, 
                        message: 'Value already set to the desired value.', 
                        noActionNeeded: true, // Add a flag to indicate no API call was made
                        fieldId: action.fieldId // For summarization
                    };
                }
                return addObservationField(observationId, action.fieldId, action.fieldValue);       case 'copyObservationField':
            const sourceValue = await getObservationFieldValue(observationId, action.sourceFieldId);
            if (sourceValue === null) {
                console.error(`Failed to copy field: source value is null for observation ${observationId}, field ${action.sourceFieldId}`);
                return { success: false, error: 'Source field value is null' };
            }
            return addObservationField(observationId, action.targetFieldId, sourceValue);    
        case 'annotation':
            const annotationResult = await addAnnotation(observationId, action.annotationField, action.annotationValue);
            return { ...annotationResult, annotationUUID: annotationResult.uuid };
        case 'addToProject':
            try {
                const result = await performProjectAction(observationId, action.projectId, action.remove);
                
                // For single actions, still display warnings:
                if (result.requiresWarning) {
                    displayWarning(`Observation ${observationId}: ${result.message}`);
                }

                // Show warning for not_in_project if the user might have selected the wrong project
                if (result.reason === 'not_in_project') {
                    displayWarning(`This observation isn't in that project - please make sure you've selected the correct project.`);
                }

                if (result.noActionNeeded) {
                    console.log(`No action needed for observation ${observationId}: ${result.message}`);
                }

                return result;
            } catch (error) {
                console.error('Error in project action:', error);
                return { success: false, error: safeErrorString(error) };
            }
        case 'addComment':
            const commentResult = await addComment(observationId, action.commentBody);
            return { ...commentResult, commentUUID: commentResult.uuid };
        case 'addTaxonId':
            const idResult = await addTaxonId(observationId, action.taxonId, action.comment, action.disagreement);
            return { 
                ...idResult, 
                identificationUUID: idResult.identificationUUID 
            };
        case 'qualityMetric':
            return handleQualityMetricAPI(observationId, action.metric, action.vote);
        case 'addToList':
            return addOrRemoveObservationFromList(observationId, action.listId, action.remove);
        default:
            console.warn(`Unknown action type: ${action.type}`);
            return Promise.resolve();
    }
}




function displayWarning(message) {
    const warningDiv = document.createElement('div');
    warningDiv.style.cssText = `
        position: fixed;
        bottom: 10px;
        right: 10px;
        background-color: #ffcc00;
        color: #000;
        padding: 10px;
        border-radius: 5px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        z-index: 10000;
    `;
    warningDiv.textContent = message;

    document.body.appendChild(warningDiv);

    // Auto-remove the warning after 5 seconds
    setTimeout(() => {
        document.body.removeChild(warningDiv);
    }, 5000);
}

async function getCurrentQualityMetricState(observationId) {
    console.log(`Getting current quality metric state for observation ${observationId}`);
    try {
        const response = await makeAPIRequest(`/observations/${observationId}`);
        const observation = response.results[0];
        console.log(`Observation data:`, observation);

        const qualityMetrics = {};
        observation.quality_metrics.forEach(qm => {
            qualityMetrics[qm.metric] = qm.agree ? 'agree' : 'disagree';
        });

        // Handle 'needs_id' separately
        if (observation.owners_identification && observation.owners_identification.current) {
            qualityMetrics['needs_id'] = 'agree';
        } else if (observation.community_taxon && observation.taxon.id !== observation.community_taxon.id) {
            qualityMetrics['needs_id'] = 'disagree';
        } else {
            qualityMetrics['needs_id'] = null;  // No vote for needs_id
        }

        console.log(`Current quality metrics:`, qualityMetrics);
        return qualityMetrics;
    } catch (error) {
        console.error(`Error fetching quality metric state for observation ${observationId}:`, error);
        return {};
    }
}

async function getObservationFieldValue(observationId, fieldId) {
    try {
        const response = await makeAPIRequest(`/observations/${observationId}`);
        if (response.results && response.results[0]) {
            const ofv = response.results[0].ofvs.find(ofv => ofv.field_id === parseInt(fieldId));
            return ofv ? ofv.value : null;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching observation field value: ${error}`);
        return null;
    }
}

function generateUndoRecord(preliminaryUndoRecord, results, overwrittenValues) {
    let finalUndoRecord = {...preliminaryUndoRecord};
    finalUndoRecord.observations = {};
    finalUndoRecord.overwrittenValues = overwrittenValues; // Store overwritten values

    results.forEach(result => {
        if (result.success) {
            const observationId = result.observationId;
            if (preliminaryUndoRecord.observations[observationId]) {
                finalUndoRecord.observations[observationId] = preliminaryUndoRecord.observations[observationId];
                // Add overwritten values info if it exists
                if (overwrittenValues[observationId]) {
                    finalUndoRecord.observations[observationId].overwrittenValues = 
                        overwrittenValues[observationId];
                }
                console.log(`Undo record for observation ${observationId}:`, 
                    finalUndoRecord.observations[observationId]);
            }
        }
    });

    finalUndoRecord.affectedObservationsCount = Object.keys(finalUndoRecord.observations).length;
    console.log('Final undo record:', finalUndoRecord);
    
    return finalUndoRecord;
}

function refreshObservation() {
    console.log('refreshObservation called');
    return new Promise((resolve, reject) => {
        const logState = {
            url: window.location.href,
            readyState: document.readyState,
            refreshEnabled,
            currentObservationId,
            userAgent: navigator.userAgent,
            screenWidth: window.innerWidth,
            screenHeight: window.innerHeight,
            timeStamp: new Date().toISOString()
        };
        console.log('Refresh attempt state:', logState);

        if (!refreshEnabled || !currentObservationId) {
            console.log('Refresh not enabled or no current observation ID');
            resolve();
            return;
        }

        if (window.location.pathname.match(/^\/observations\/\d+/)) {
            console.log('On individual observation page, reloading');
            window.location.reload();
            return;
        }

        const selectors = [
            "#Identify > div > div.mainrow.false.row > div.main-col > div.ObservationsGrid.flowed.false.row",
            ".ObservationsGrid",
            "#Identify .ObservationsGrid",
            "div[data-react-class='ObservationsGrid']"
        ];

        let grid = null;
        for (let selector of selectors) {
            grid = document.querySelector(selector);
            if (grid) {
                debugLog('Grid found with selector:', selector);
                break;
            }
        }

        if (!grid) {
            console.error('Grid not found, logging page structure');
            logPageStructure();
            reject(new Error('Grid not found'));
            return;
        }

        const gridInfo = {
            childCount: grid.childElementCount,
            classes: grid.className,
            id: grid.id,
            rect: grid.getBoundingClientRect()
        };
        debugLog('Grid info:', gridInfo);

        const observationLink = findObservationLink(grid, currentObservationId);
        
        if (observationLink) {
            debugLog('Clicking observation link');
            try {
                observationLink.click();
            } catch (error) {
                console.error('Error clicking observation link:', error);
                reject(error);
                return;
            }

            let modalCheckAttempts = 0;
            const modalCheckInterval = setInterval(() => {
                modalCheckAttempts++;
                const modal = document.querySelector('.ObservationModal');
                if (modal) {
                    debugLog('ObservationModal found after', modalCheckAttempts, 'attempts');
                    clearInterval(modalCheckInterval);
                    resolve();
                } else if (modalCheckAttempts >= 20) { // 2 seconds (100ms * 20)
                    console.error('ObservationModal not found after 2 seconds');
                    clearInterval(modalCheckInterval);
                    reject(new Error('ObservationModal not found after timeout'));
                }
            }, 100);
        } else {
            console.error('Observation not found in grid, rejecting');
            reject(new Error('Observation not found in grid'));
        }
    });
}

function findObservationLink(gridElement, observationId) {
    debugLog('Searching for observation link with ID:', observationId);
    
    const directLink = gridElement.querySelector(`a[href="/observations/${observationId}"]`);
    if (directLink) {
        debugLog('Direct link found');
        return directLink;
    }
    
    const allLinks = gridElement.querySelectorAll('a[href^="/observations/"]');
    debugLog('Total observation links found:', allLinks.length);
    
    for (let link of allLinks) {
        if (link.href.endsWith(observationId)) {
            debugLog('Matching link found:', link.href);
            return link;
        }
    }
    
    console.error('No matching observation link found');
    logLinkDetails(allLinks);
    return null;
}

function logPageStructure() {
    debugLog('Body classes:', document.body.className);
    debugLog('Identify element:', document.getElementById('Identify')?.outerHTML);
    const mainContent = document.querySelector('main');
    debugLog('Main content classes:', mainContent?.className);
    debugLog('Main content child elements:', Array.from(mainContent?.children || []).map(el => ({
        tagName: el.tagName,
        id: el.id,
        className: el.className
    })));
    debugLog('All grid-like elements:', Array.from(document.querySelectorAll('[class*="grid" i], [class*="list" i]')).map(el => ({
        tagName: el.tagName,
        id: el.id,
        className: el.className
    })));
}

function logLinkDetails(links) {
    debugLog('Detailed link information:');
    Array.from(links).forEach((link, index) => {
        debugLog(`Link ${index}:`, {
            href: link.href,
            textContent: link.textContent,
            className: link.className,
            rect: link.getBoundingClientRect()
        });
    });
}

async function updateObservationPage(observationId) {
    try {
        const favContainer = document.querySelector('.Faves');
        if (!favContainer) {
            console.log('Fav button container not found');
            return false;
        }

        const linkText = favContainer.querySelector('.linky').textContent;
        const originalState = linkText === "You faved this!" ? 'faved' : 'unfaved';
        console.log(`Original fav state: ${originalState}`);

        // Click the fav button
        const favButton = favContainer.querySelector('.action');
        favButton.click();

        // Wait for the state to change
        await waitForFavStateChange(originalState);

        // Click again to revert to the original state
        await new Promise(resolve => setTimeout(resolve, 500)); // Short delay
        favButton.click();

        // Wait for the state to revert
        await waitForFavStateChange(originalState === 'faved' ? 'unfaved' : 'faved');

        console.log('Fav button clicked twice, returned to original state');
        console.log('Triggered site refresh mechanism');
        return true;
    } catch (error) {
        console.error('Error triggering site refresh:', error);
        return false;
    }
}

function waitForFavStateChange(originalState) {
    return new Promise((resolve, reject) => {
        const maxWaitTime = 10000; // 10 seconds
        const checkInterval = 100; // 0.1 seconds
        let elapsedTime = 0;

        const checkState = () => {
            const favContainer = document.querySelector('.Faves');
            const linkText = favContainer.querySelector('.linky').textContent;
            const currentState = linkText === "You faved this!" ? 'faved' : 'unfaved';

            if (currentState !== originalState) {
                resolve();
            } else if (elapsedTime >= maxWaitTime) {
                reject(new Error('Timeout waiting for fav state change'));
            } else {
                elapsedTime += checkInterval;
                setTimeout(checkState, checkInterval);
            }
        };

        checkState();
    });
}


function toggleRefresh() {
    refreshEnabled = !refreshEnabled;
    updateRefreshIndicator();
}

function isValidPageForButtons() {
    const path = window.location.pathname;
    return path.includes('/observations/identify') || /^\/observations\/\d+/.test(path);
}

function createDynamicButtons() {
    console.log('createDynamicButtons called');
    if (!isValidPageForButtons()) {
        console.log('Not a valid page for buttons, skipping creation');
        return;
    }

    const currentSet = configurationSets.find(set => set.name === currentSetName);
    if (currentSet && currentSet.buttons) {
        customButtons = currentSet.buttons;
        debugLog('Retrieved customButtons from current set:', customButtons);
        customShortcuts = [];
        buttonContainer.innerHTML = ''; // Clear existing buttons

        // Remove any existing sort button container
        const existingSortContainer = document.getElementById('sort-buttons-container');
        if (existingSortContainer) {
            existingSortContainer.remove();
        }

        // Create sort button container
        const sortButtonContainer = document.createElement('div');
        sortButtonContainer.id = 'sort-buttons-container';
        sortButtonContainer.style.cssText = `
            z-index: 10002;
            display: flex;
            align-items: center;
        `;
        buttonContainer.parentElement.insertBefore(sortButtonContainer, buttonContainer);

        // Add sort button and dropdown
        const sortButtonWrapper = document.createElement('div');
        sortButtonWrapper.style.cssText = `
            position: relative;
            display: inline-block;
        `;

        const sortButton = document.createElement('button');
        sortButton.id = 'sort-button';
        sortButton.innerHTML = getSortButtonText(currentSet.sortMethod || 'default');
        sortButton.title = 'Sort buttons';
        sortButton.style.cssText = `
            background-color: #f0f0f0;
            border: 1px solid #ccc;
            border-radius: 3px;
            padding: 5px 10px;
            font-size: 14px;
            cursor: pointer;
            margin-right: 5px;
        `;
        sortButtonWrapper.appendChild(sortButton);

        const sortDropdown = document.createElement('div');
        sortDropdown.id = 'sort-dropdown';
        sortDropdown.style.cssText = `
            display: none;
            position: absolute;
            background-color: white;
            border: 1px solid #ccc;
            border-radius: 3px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            padding: 5px 0;
            z-index: 10003;
            min-width: 120px;
            width: 100%;
        `;

        // Build dropdown HTML including custom option if it exists
        let dropdownHTML = `
            <button id="sort-az" class="sort-option">Sort A-Z</button>
            <button id="sort-za" class="sort-option">Sort Z-A</button>
            <button id="sort-new-old" class="sort-option">Sort New-Old</button>
            <button id="sort-old-new" class="sort-option">Sort Old-New</button>
        `;
        // Check for both customOrder and buttonOrder
        if (currentSet.customOrder || currentSet.buttonOrder) {
            dropdownHTML = `
                <button id="sort-custom" class="sort-option">Return to Custom</button>
                <div class="sort-divider"></div>
            ` + dropdownHTML;
        }
        sortDropdown.innerHTML = dropdownHTML;

        sortButtonWrapper.appendChild(sortDropdown);

        // Add Edit Layout button
        createEditLayoutButton();

        // Add CSS for sort options
        const style = document.createElement('style');
        style.textContent = `
            .sort-option {
                display: block;
                width: 100%;
                text-align: left;
                padding: 5px 10px;
                border: none;
                background: none;
                cursor: pointer;
            }
            .sort-option:hover {
                background-color: #f0f0f0;
            }
            .sort-divider {
                height: 1px;
                background-color: #ccc;
                margin: 5px 0;
            }
            #custom-extension-container.edit-mode .button-ph {
                cursor: move;
                box-shadow: 0 0 3px rgba(0,0,0,0.3);
            }
            #custom-extension-container.edit-mode .button-ph:hover {
                transform: scale(1.05);
                transition: transform 0.1s ease-in-out;
            }
            .button-placeholder {
                border: 2px dashed #ccc;
                background-color: #f0f0f0;
                min-width: 100px;
                flex-grow: 1;
                margin: 3px;
                border-radius: 5px;
            }
        `;
        document.head.appendChild(style);

        sortButtonContainer.appendChild(sortButtonWrapper);
   
        sortButton.addEventListener('click', toggleSortDropdown);
    
        document.getElementById('sort-az')?.addEventListener('click', () => sortButtons('az'));
        document.getElementById('sort-za')?.addEventListener('click', () => sortButtons('za'));
        document.getElementById('sort-new-old')?.addEventListener('click', () => sortButtons('new-old'));
        document.getElementById('sort-old-new')?.addEventListener('click', () => sortButtons('old-new'));
        document.getElementById('sort-custom')?.addEventListener('click', () => sortButtons('custom'));

        // Create set switcher
        createSetSwitcher();

        // Determine how to arrange buttons
        let orderedButtons = [];
        
        if (currentSet.sortMethod === 'custom') {
            // Use saved custom order (check both customOrder and buttonOrder)
            const savedOrder = currentSet.customOrder || currentSet.buttonOrder;
            if (savedOrder) {
                orderedButtons = savedOrder.map(buttonId => 
                    currentSet.buttons.find(c => c.id === buttonId)
                ).filter(Boolean);
            }
        } else if (currentSet.sortMethod && currentSet.sortMethod !== 'custom') {
            // Use sort method
            orderedButtons = currentSet.buttons.slice();
            orderedButtons.sort((a, b) => {
                switch (currentSet.sortMethod) {
                    case 'az':
                        return a.name.localeCompare(b.name);
                    case 'za':
                        return b.name.localeCompare(a.name);
                    case 'new-old':
                        return b.id.localeCompare(a.id);
                    case 'old-new':
                        return a.id.localeCompare(b.id);
                    default:
                        return 0;
                }
            });
        } else {
            // Default to original order
            orderedButtons = currentSet.buttons;
        }

        // Create buttons in determined order
        orderedButtons.forEach(config => {
            if (config && !config.configurationDisabled) {
                createButton(config);
            }
        });

        initializeDragAndDrop();
        updatePositions();
    }
    debugLog('All buttons created. Total buttons:', buttonContainer.children.length);
}

function debugButtonCreation(config) {
    debugLog("Debug: Button Creation Start for", config.name);
    debugLog("Button Config:", JSON.stringify(config));

    try {
        // Create a test button
        const testButton = document.createElement('button');
        testButton.textContent = config.name || "Test Button";
        testButton.setAttribute('data-shortcut', formatShortcut(config.shortcut));
        
        // Log button properties
        debugLog("Button Text:", testButton.textContent);
        debugLog("Button Shortcut:", testButton.getAttribute('data-shortcut'));
        
        // Check if the button is valid
        debugLog("Is button valid HTML:", testButton.outerHTML.length > 0);
        
        // Test button visibility
        document.body.appendChild(testButton);
        const isVisible = window.getComputedStyle(testButton).display !== 'none';
        debugLog("Is button visible:", isVisible);
        document.body.removeChild(testButton);

        // Log character codes
        debugLog("Name character codes:", Array.from(config.name || "").map(c => c.charCodeAt(0)));
        debugLog("Shortcut character codes:", Array.from(formatShortcut(config.shortcut) || "").map(c => c.charCodeAt(0)));

        // Check for potential problematic characters
        const problematicChars = /[~!@#$%^&*()]/;
        debugLog("Contains problematic chars in name:", problematicChars.test(config.name || ""));
        debugLog("Contains problematic chars in shortcut:", problematicChars.test(formatShortcut(config.shortcut) || ""));

    } catch (error) {
        console.error("Error in button creation:", error);
    }

    debugLog("Debug: Button Creation End for", config.name);
}

function createEditLayoutButton() {
    const sortButtonContainer = document.getElementById('sort-buttons-container');
    if (!sortButtonContainer) return;

    const editLayoutButton = document.createElement('button');
    editLayoutButton.id = 'edit-layout-button';
    editLayoutButton.textContent = 'Edit Layout';
    editLayoutButton.style.cssText = `
        background-color: #f0f0f0;
        border: 1px solid #ccc;
        border-radius: 3px;
        padding: 5px 10px;
        font-size: 14px;
        cursor: pointer;
        margin-left: 10px;
    `;
    editLayoutButton.onclick = toggleEditMode;
    sortButtonContainer.appendChild(editLayoutButton);
}

let editModeEnabled = false;

function toggleEditMode() {
    editModeEnabled = !editModeEnabled;
    const editLayoutButton = document.getElementById('edit-layout-button');
    const container = document.getElementById('custom-extension-container');
    if (!editLayoutButton || !container) return;


    if (editModeEnabled) {
        editLayoutButton.textContent = 'Save Layout';
        editLayoutButton.style.backgroundColor = '#4CAF50'; // Green for save mode
        editLayoutButton.style.color = 'white';
        container.classList.add('edit-mode');
        initializeDragAndDrop(); // Sets up mousedown listener
    } else {
        // This is when "Save Layout" is clicked, transitioning out of edit mode
        editLayoutButton.textContent = 'Edit Layout';
        editLayoutButton.style.backgroundColor = '#f0f0f0'; // Default non-edit style
        editLayoutButton.style.color = 'black';
        container.classList.remove('edit-mode');
        disableDragAndDrop(); // Removes mousedown listener and cleans up
        saveButtonOrder(); // <<< SAVE THE ORDER HERE
    }
}

function createButton(config) {
    debugButtonCreation(config);
    function hasNonASCII(str) {
        return /[^\u0000-\u007f]/.test(str);
    }
    
    debugLog('Button name contains non-ASCII:', hasNonASCII(config.name));
    if (config.shortcut && config.shortcut.key) {
        debugLog('Shortcut key contains non-ASCII:', hasNonASCII(config.shortcut.key));
    }

    let buttonWrapper = document.createElement('div');
    buttonWrapper.classList.add('button-ph');
    buttonWrapper.dataset.buttonId = config.id;
    
    let button = document.createElement('button');
    button.innerText = config.name;
    button.style.width = '100%';
    button.style.height = '100%';
    button.style.border = 'none';
    button.style.borderRadius = '5px';
    button.style.background = 'rgba(0, 0, 0, 0.5)';
    button.style.color = 'white';
    button.style.cursor = 'pointer';
    button.style.padding = '5px 10px';
    button.style.fontSize = '14px';
    button.style.transition = 'background-color 0.3s ease';
    buttonWrapper.appendChild(button);
    
    // Create tooltip if shortcut exists
    if (config.shortcut && config.shortcut.key) {
        let tooltip = document.createElement('span');
        tooltip.classList.add('tooltip');
        tooltip.textContent = formatShortcut(config.shortcut);
        buttonWrapper.appendChild(tooltip);
    }
    
    button.onclick = function(e) {
      const currentButtonConfig = config; 

        animateButton(this);
        performActions(currentButtonConfig.actions) 
            .then((resultsArray) => { 
                let allSuccessfulInBatch = true;
                let warningsToShow = [];

                resultsArray.forEach(result => {
                    if (!result.success) {
                        allSuccessfulInBatch = false;
                        console.error('Action failed:', result); 
                        
                        if (result.action === 'addToProject' || (result.projectId && result.reason)) {
                            // Find the original project action config to get the projectName
                            const projectActionConfig = currentButtonConfig.actions.find(
                                action => action.type === 'addToProject' && action.projectId === result.projectId
                            );
                            const displayProjectName = projectActionConfig ? projectActionConfig.projectName : result.projectId;

                            if (result.requiresWarning) { 
                                warningsToShow.push(`Observation ${result.observationId || currentObservationId}: ${result.message} (Project: "${displayProjectName}")`);
                            } else if (result.reason === 'addition_failed_api_logic' || result.reason === 'addition_failed_network_or_http') {
                                let specificApiErrors = "Could not determine specific reason from API.";
                                if (result.message && typeof result.message === 'string') {
                                    try {
                                        const jsonErrorMatch = result.message.match(/body: (\{.*\})/s);
                                        if (jsonErrorMatch && jsonErrorMatch[1]) {
                                            const errorBody = JSON.parse(jsonErrorMatch[1]);
                                            if (errorBody.error && errorBody.error.original && Array.isArray(errorBody.error.original.errors)) {
                                                specificApiErrors = errorBody.error.original.errors.join('; ');
                                            } else if (errorBody.error && typeof errorBody.error === 'string') {
                                                specificApiErrors = errorBody.error;
                                            }
                                        } else {
                                            specificApiErrors = result.message.length > 100 ? result.message.substring(0, 97) + "..." : result.message;
                                        }
                                    } catch (parseError) {
                                        console.warn("Could not parse detailed API error from message for project addition failure:", parseError, result.message);
                                        specificApiErrors = result.message.length > 100 ? result.message.substring(0, 97) + "..." : result.message; 
                                    }
                                }
                                warningsToShow.push(`Obs. ${result.observationId || currentObservationId}: Failed to add to project "${displayProjectName}". Reasons: ${specificApiErrors}`);
                            } else if (result.reason === 'not_in_project' && currentButtonConfig.actions.some(a => a.type === 'addToProject' && a.remove && a.projectId === result.projectId)) {
                                warningsToShow.push(`Observation ${result.observationId || currentObservationId}: Not in project "${displayProjectName}", so removal had no effect.`);
                            } else if (result.reason === 'already_member' && currentButtonConfig.actions.some(a => a.type === 'addToProject' && !a.remove && a.projectId === result.projectId)) {
                                warningsToShow.push(`Observation ${result.observationId || currentObservationId}: Already a member of project "${displayProjectName}".`);
                            }
                        } else if (result.error) {
                             warningsToShow.push(`Action failed: ${getCleanErrorMessage(result.error)}`);
                        }
                    }
                });

                animateButtonResult(this, allSuccessfulInBatch);

                if (warningsToShow.length > 0) {
                    displayWarning(warningsToShow.join('\n')); 
                }

                if (allSuccessfulInBatch && refreshEnabled) {
                    refreshObservation().catch(err => console.error("Refresh after single action failed:", err));
                }
            })
            .catch(error => {
                console.error('Error performing actions for single button:', error);
                animateButtonResult(this, false);
                displayWarning(`Error: ${error.message}`); 
            });
    };
    
    buttonWrapper.style.display = config.buttonHidden ? 'none' : 'inline-block';
    buttonContainer.appendChild(buttonWrapper);
    if (config.shortcut) {
        customShortcuts.push({
            name: config.name,
            key: config.shortcut.key,
            ctrlKey: config.shortcut.ctrlKey,
            shiftKey: config.shortcut.shiftKey,
            altKey: config.shortcut.altKey,
            button: button
        });
    }
    debugLog("Button created and added to DOM:", buttonWrapper.outerHTML);
}

function formatShortcut(shortcut) {
    if (!shortcut || !shortcut.key) return '';
    let parts = [];
    if (shortcut.ctrlKey) parts.push('Ctrl');
    if (shortcut.shiftKey) parts.push('Shift');
    if (shortcut.altKey) parts.push('Alt');
    parts.push(shortcut.key);
    return parts.join(' + ');
}


window.addEventListener('error', function(event) {
    if (event.error && event.error.message && event.error.message.includes('Extension context invalidated')) {
        debugLog('Extension context invalidated. This is likely due to the extension being reloaded.');
        event.preventDefault(); // Prevent the error from being thrown
    }
});

let draggingElement = null;
let placeholderElement = null; // A simple div, not a clone
let dragOffsetX, dragOffsetY;
// Remove: let buttonPositions = []; // We'll calculate targets differently

function initializeDragAndDrop() {
    if (!editModeEnabled) return;
    const container = document.getElementById('custom-extension-container');
    if (!container) return;

    // Create placeholder once and reuse, or create on demand
    placeholderElement = document.createElement('div');
    placeholderElement.classList.add('button-placeholder'); // Style this appropriately
    // Placeholder style might need to match button-ph dimensions roughly

    onMouseDown = function(e) {
        if (!editModeEnabled) return;
        const buttonWrapper = e.target.closest('.button-ph');
        if (buttonWrapper && e.button === 0) { // Only main mouse button
            e.preventDefault();
            draggingElement = buttonWrapper;
            const rect = draggingElement.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;

            // Style the dragged element
            draggingElement.style.position = 'fixed'; // Or 'absolute' relative to a positioned parent
            draggingElement.style.zIndex = '10001'; // Above other buttons
            draggingElement.style.width = `${rect.width}px`;
            draggingElement.style.height = `${rect.height}px`;
            draggingElement.classList.add('dragging');
            // Initially hide it or move it out of flow, so placeholder can take its spot
            // For fixed positioning, it's already out of flow.

            // Insert placeholder where the element was (or just before it to start)
            // The placeholder's size should be set by CSS to match button-ph
            if (draggingElement.parentNode) {
                 draggingElement.parentNode.insertBefore(placeholderElement, draggingElement);
            }
            
            // Move draggingElement to mouse position
            draggingElement.style.left = `${e.clientX - dragOffsetX}px`;
            draggingElement.style.top = `${e.clientY - dragOffsetY}px`;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }
    };

    onMouseMove = function(e) {
        if (!draggingElement) return;
        e.preventDefault();

        draggingElement.style.left = `${e.clientX - dragOffsetX}px`;
        draggingElement.style.top = `${e.clientY - dragOffsetY}px`;

        // Determine where placeholder should go
        let targetElement = null;
        let insertBefore = false;
        const staticButtons = Array.from(container.querySelectorAll('.button-ph:not(.dragging)'));

        for (const staticButton of staticButtons) {
            const rect = staticButton.getBoundingClientRect();
            // Check if mouse is over this static button or in its vicinity
            if (e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom) {
                
                targetElement = staticButton;
                // If mouse is in the first half of the button's width, insert before, else after
                insertBefore = (e.clientX < rect.left + rect.width / 2);
                break;
            }
        }
        
        // If not directly over a button, find the closest one (simplified)
        // or insert at start/end if near container edges.
        // For now, let's stick to inserting relative to an existing button.
        // If not over any button, placeholder might stay where it is or move to end.

        if (targetElement) {
            if (insertBefore) {
                if (placeholderElement.nextSibling !== targetElement) {
                    targetElement.parentNode.insertBefore(placeholderElement, targetElement);
                }
            } else {
                if (placeholderElement !== targetElement.nextSibling) {
                    targetElement.parentNode.insertBefore(placeholderElement, targetElement.nextSibling);
                }
            }
        } else {
            // If not over any specific button, maybe append placeholder to the end if not already there
            if (placeholderElement.parentNode !== container || container.lastChild !== placeholderElement) {
                //container.appendChild(placeholderElement); // Could cause issues if placeholder is already child
            }
        }
    };

    onMouseUp = function(e) {
        if (!draggingElement) return;
        e.preventDefault();

        if (placeholderElement.parentNode) {
            placeholderElement.parentNode.insertBefore(draggingElement, placeholderElement);
            if (placeholderElement.parentNode === container) { // Only remove if it's our placeholder
                placeholderElement.remove(); 
            }
        } else {
            container.appendChild(draggingElement);
            console.warn("Drag-and-drop: Placeholder lost its parent during onMouseUp.");
        }
        
        draggingElement.classList.remove('dragging');
        draggingElement.style.removeProperty('position');
        draggingElement.style.removeProperty('left');
        draggingElement.style.removeProperty('top');
        draggingElement.style.removeProperty('width');
        draggingElement.style.removeProperty('height');
        draggingElement.style.removeProperty('z-index');

        draggingElement = null;
        // placeholderElement is a persistent div, so we don't nullify it, just ensure it's removed if it was in use
        // If you recreate placeholderElement in onMouseDown, then nullify here:
        // if (placeholderElement && placeholderElement.parentNode) placeholderElement.remove();
        // placeholderElement = null;


        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        
        // --- REMOVED: saveButtonOrder(); --- 
        // Saving will now only happen when "Save Layout" (the toggled editLayoutButton) is clicked.
    };

    container.addEventListener('mousedown', onMouseDown);
}

function saveButtonOrder() {
    const container = document.getElementById('custom-extension-container');
    if (!container) return;

    const buttons = container.querySelectorAll('.button-ph');
    // Ensure unique IDs in the order
    const uniqueOrderedIds = [];
    const seenIds = new Set();
    Array.from(buttons).forEach(button => {
        const buttonId = button.dataset.buttonId;
        if (buttonId && !seenIds.has(buttonId)) {
            uniqueOrderedIds.push(buttonId);
            seenIds.add(buttonId);
        } else if (buttonId && seenIds.has(buttonId)) {
            console.warn("Duplicate buttonId found in DOM during saveButtonOrder:", buttonId, "This should not happen. Removing duplicate.");
            button.remove(); // Attempt to remove the duplicate from DOM to prevent future issues
        }
    });
    
    const order = uniqueOrderedIds; // Use the filtered unique list

    console.log("Saving button order:", order); // Debug
    
    browserAPI.storage.local.get('configurationSets', function(data) {
        const sets = data.configurationSets || [];
        const setIndex = sets.findIndex(set => set.name === currentSetName);
        
        if (setIndex !== -1) {
            sets[setIndex].customOrder = order; 
            sets[setIndex].sortMethod = 'custom'; // Explicitly set sort method to custom
            
            browserAPI.storage.local.set({ configurationSets: sets }, function() {
                if (browserAPI.runtime.lastError) {
                    console.error("Error saving button order:", browserAPI.runtime.lastError);
                } else {
                    debugLog('Custom button order saved for set:', currentSetName, order);
                    if (currentSet) { // Update in-memory currentSet
                        currentSet.customOrder = order;
                        currentSet.sortMethod = 'custom';
                    }
                    // Update sort button text on the page
                    const sortButton = document.getElementById('sort-button');
                    const sortButtonTextSpan = sortButton ? sortButton.querySelector('span') : null;
                    if (sortButtonTextSpan) {
                        sortButtonTextSpan.textContent = getSortButtonText('custom');
                    }
                     // Re-add the 'Return to Custom' option if it's not there and custom order exists
                     const sortDropdown = document.getElementById('sort-dropdown');
                     if (sortDropdown && !sortDropdown.querySelector('#sort-custom') && order.length > 0) {
                         const customOption = document.createElement('button');
                         customOption.id = 'sort-custom';
                         customOption.className = 'sort-option';
                         customOption.textContent = 'Return to Custom';
                         customOption.onclick = () => sortButtons('custom');
                         
                         const divider = document.createElement('div');
                         divider.className = 'sort-divider';

                         sortDropdown.insertBefore(divider, sortDropdown.firstChild);
                         sortDropdown.insertBefore(customOption, sortDropdown.firstChild);
                     }
                }
            });
        } else {
            console.error("Could not find current set to save button order:", currentSetName);
        }
    });
}

function disableDragAndDrop() {
    const container = document.getElementById('custom-extension-container');
    
    // Remove event listeners
    if (onMouseDown) {
        container.removeEventListener('mousedown', onMouseDown);
    }
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    
    // Clean up any dragging elements
    const draggingElement = container.querySelector('.button-ph.dragging');
    if (draggingElement) {
        draggingElement.classList.remove('dragging');
        draggingElement.style.removeProperty('position');
        draggingElement.style.removeProperty('left');
        draggingElement.style.removeProperty('top');
        draggingElement.style.removeProperty('width');
        draggingElement.style.removeProperty('height');
        draggingElement.style.removeProperty('z-index');
    }
    
    // Remove any placeholders
    const placeholder = container.querySelector('.button-placeholder');
    if (placeholder) {
        placeholder.remove();
    }
}

function showClickFeedback(button) {
    const feedback = document.createElement('div');
    feedback.className = 'click-feedback';
    feedback.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(255, 255, 255, 0.5);
        border-radius: 5px;
        pointer-events: none;
        animation: clickPulse 0.3s ease-out;
    `;
    button.appendChild(feedback);
    setTimeout(() => feedback.remove(), 300);
}

function getClosestButton(container, x, y) {
    const buttons = Array.from(container.querySelectorAll('.button-ph:not(.dragging), .button-placeholder'));
    return buttons.reduce((closest, button) => {
        const box = button.getBoundingClientRect();
        const offsetX = x - (box.left + box.width / 2);
        const offsetY = y - (box.top + box.height / 2);
        const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
        
        if (distance < closest.distance) {
            return { distance, element: button };
        } else {
            return closest;
        }
    }, { distance: Number.POSITIVE_INFINITY }).element;
}

function isBeforeButton(y, button) {
    const box = button.getBoundingClientRect();
    return y < box.top + box.height / 2;
}

function saveButtonOrder() {
    const buttons = document.querySelectorAll('.button-ph');
    const order = Array.from(buttons).map(button => button.dataset.buttonId);
    
    browserAPI.storage.local.get('configurationSets', function(data) {
        const sets = data.configurationSets || [];
        const setIndex = sets.findIndex(set => set.name === currentSetName);
        
        if (setIndex !== -1) {
            sets[setIndex].customOrder = order;  // Save as customOrder instead of buttonOrder
            sets[setIndex].sortMethod = 'custom';
            
            browserAPI.storage.local.set({ configurationSets: sets }, function() {
                debugLog('Custom button order saved for set:', currentSetName, order);
                
                // Update current set in memory
                currentSet.customOrder = order;
                currentSet.sortMethod = 'custom';
                
                // Update sort button text
                const sortButton = document.getElementById('sort-button');
                if (sortButton) {
                    sortButton.innerHTML = getSortButtonText('custom');
                }
            });
        }
    });
}

function loadButtonOrder() {
    // First try to get set-specific order
    if (currentSet && currentSet.buttonOrder) {
        debugLog('Loading set-specific button order:', currentSet.buttonOrder);
        const container = document.getElementById('custom-extension-container');
        currentSet.buttonOrder.forEach(buttonId => {
            const button = container.querySelector(`.button-ph[data-button-id="${buttonId}"]`);
            if (button) container.appendChild(button);
        });
    } else {
        // Fall back to overall button order for backwards compatibility
        browserAPI.storage.local.get('buttonOrder', (data) => {
            if (data.buttonOrder) {
                debugLog('Loading global button order:', data.buttonOrder);
                const container = document.getElementById('custom-extension-container');
                data.buttonOrder.forEach(buttonId => {
                    const button = container.querySelector(`.button-ph[data-button-id="${buttonId}"]`);
                    if (button) container.appendChild(button);
                });
            }
        });
    }
}

createDynamicButtons();

function createBulkActionButtons() {
    console.log('Creating bulk action UI wrapper');
    // 1. Create a single parent wrapper for all bulk UI
    const bulkUiWrapper = document.createElement('div');
    bulkUiWrapper.id = 'bulk-ui-wrapper'; // New ID for the wrapper
    bulkUiWrapper.style.position = 'fixed';
    bulkUiWrapper.style.zIndex = '10000';
    
    // 2. Create the container for the active bulk mode buttons (as before)
    const bulkButtonContainer = document.createElement('div');
    bulkButtonContainer.id = 'bulk-action-container';
    // No positioning needed here, it will be inside the wrapper
    bulkButtonContainer.style.backgroundColor = 'white';
    bulkButtonContainer.style.padding = '10px';
    bulkButtonContainer.style.border = '1px solid black';
    bulkButtonContainer.style.display = 'none'; // Initially hidden

    // 3. Create the "Enable Bulk Action Mode" button (as before)
    const enableBulkModeButton = document.createElement('button');
    enableBulkModeButton.textContent = 'Enable Bulk Action Mode';
    enableBulkModeButton.id = 'enable-bulk-mode-button';
    enableBulkModeButton.classList.add('bulk-action-button');
    enableBulkModeButton.addEventListener('click', enableBulkActionMode);
    // Note: The general .bulk-action-button style is fine, no fixed position needed.

    // 4. Create CSV loader UI
    const csvLoaderContainer = createCSVLoaderUI();

    // 5. Append the button and containers to the new wrapper
    bulkUiWrapper.appendChild(enableBulkModeButton);
    bulkUiWrapper.appendChild(bulkButtonContainer);
    bulkUiWrapper.appendChild(csvLoaderContainer);

    // 6. Append the single wrapper to the body
    document.body.appendChild(bulkUiWrapper);

    console.log('Bulk action UI created');
    updateBulkButtonPosition(); // Position the new wrapper
}

function createCSVLoaderUI() {
    const container = document.createElement('div');
    container.id = 'csv-loader-container';
    container.style.backgroundColor = 'white';
    container.style.padding = '10px';
    container.style.border = '1px solid black';
    container.style.marginTop = '10px';
    container.style.display = 'none';

    const title = document.createElement('h3');
    title.textContent = 'Load Observations from CSV';
    title.style.margin = '0 0 10px 0';

    const helpText = document.createElement('p');
    helpText.textContent = 'Upload a CSV with observation IDs or URLs (one per line or comma-separated)';
    helpText.style.fontSize = '12px';
    helpText.style.color = '#666';
    helpText.style.margin = '0 0 10px 0';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.txt';
    fileInput.id = 'csv-file-input';

    const loadButton = createBulkActionButton('Load & Open in Identify', () => {
        const file = fileInput.files[0];
        if (!file) {
            alert('Please select a CSV file');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            parseCSVObservations(text);
        };
        reader.readAsText(file);
    });

    container.appendChild(title);
    container.appendChild(helpText);
    container.appendChild(fileInput);
    container.appendChild(loadButton);

    const toggleButton = document.createElement('button');
    toggleButton.textContent = 'CSV Loader';
    toggleButton.id = 'csv-loader-toggle';
    toggleButton.classList.add('bulk-action-button');
    toggleButton.addEventListener('click', () => {
        const isHidden = container.style.display === 'none';
        container.style.display = isHidden ? 'block' : 'none';
    });

    const wrapper = document.createElement('div');
    wrapper.appendChild(toggleButton);
    wrapper.appendChild(container);

    return wrapper;
}

function parseCSVObservations(csvText) {
    const lines = csvText.split('\n');
    const ids = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parts = trimmed.split(/[,\s]+/);
        for (const part of parts) {
            const cleaned = part.trim().replace(/['"]/g, '');

            // Extract ID from full URL like https://www.inaturalist.org/observations/208103778
            const urlMatch = cleaned.match(/inaturalist\.org\/observations\/(\d+)/);
            if (urlMatch) {
                ids.push(urlMatch[1]);
            }
            // Or just a plain number
            else if (/^\d+$/.test(cleaned)) {
                ids.push(cleaned);
            }
        }
    }

    if (ids.length === 0) {
        alert('No observation IDs found in CSV');
        return;
    }

    // Remove duplicates
    const uniqueIds = [...new Set(ids)];

    const identifyUrl = `https://www.inaturalist.org/observations/identify?quality_grade=casual,needs_id,research&reviewed=any&verifiable=any&place_id=any&per_page=${uniqueIds.length}&id=${uniqueIds.join(',')}`;

    window.location.href = identifyUrl;
}

function createBulkActionButton(text, onClickFunction) {
    const button = document.createElement('button');
    button.textContent = text;
    button.classList.add('bulk-action-button');
    button.style.margin = '5px';
    button.style.padding = '5px 10px';
    button.addEventListener('click', onClickFunction);
    return button;
}

function enableBulkActionMode() {
    bulkActionModeEnabled = true;
    document.getElementById('bulk-action-container').style.display = 'block';
    document.getElementById('enable-bulk-mode-button').style.display = 'none';
    
    // Restore previously selected observations
    getObservationElements().forEach(obs => {
        const observationId = obs.querySelector('a[href^="/observations/"]')?.href.split('/').pop();
        if (observationId && selectedObservations.has(observationId)) {
            obs.classList.add('selected');
        }
    });
    
    // Set up observer for changes in the observation grid
    const observationGrid = document.querySelector('.ObservationsGrid');
    if (observationGrid) {
        const observer = new MutationObserver(() => {
            updateSelectedObservations();
        });
        observer.observe(observationGrid, { childList: true, subtree: true });
    }

    updateAllSelections();
    updateBulkActionButtons(); // Add this line to update bulk action buttons
}

function disableBulkActionMode() {
    bulkActionModeEnabled = false;
    document.getElementById('bulk-action-container').style.display = 'none';
    document.getElementById('enable-bulk-mode-button').style.display = 'block';
    // Remove visual selection but keep the IDs in selectedObservations
    getObservationElements().forEach(obs => obs.classList.remove('selected'));
}

function updateBulkButtonPosition() {
    console.log('Updating bulk UI wrapper position');
    // This function now ONLY positions the single parent wrapper
    const bulkUiWrapper = document.getElementById('bulk-ui-wrapper');
    if (!bulkUiWrapper) return;

    bulkUiWrapper.style.top = bulkUiWrapper.style.left = bulkUiWrapper.style.bottom = bulkUiWrapper.style.right = 'auto';
    
    switch (buttonPosition) {
        case 'top-left': // Main buttons top-left, so bulk UI goes bottom-right
            bulkUiWrapper.style.bottom = '10px';
            bulkUiWrapper.style.right = '10px';
            break;
        case 'top-right': // Main buttons top-right, so bulk UI goes bottom-left
            bulkUiWrapper.style.bottom = '10px';
            bulkUiWrapper.style.left = '10px';
            break;
        case 'bottom-left': // Main buttons bottom-left, so bulk UI goes top-right
             bulkUiWrapper.style.top = '10px';
             bulkUiWrapper.style.right = '10px';
             break;
        case 'bottom-right': // Main buttons bottom-right, so bulk UI goes top-left
            bulkUiWrapper.style.top = '10px';
            bulkUiWrapper.style.left = '10px';
            break;
    }
}

function getObservationElements() {
    return document.querySelectorAll('.ObservationsGridItem');
}

function toggleSelection(element) {
    if (bulkActionModeEnabled) {
        const observationId = element.querySelector('a[href^="/observations/"]')?.href.split('/').pop();
        if (observationId) {
            if (element.classList.toggle('selected')) {
                selectedObservations.add(observationId);
            } else {
                selectedObservations.delete(observationId);
            }
            console.log('Updated selections:', selectedObservations);
        }
    }
    updateVisualSelection();
    updateBulkActionButtons();
    updateModalTitle();
}

function updateVisualSelection() {
    getObservationElements().forEach(obsElement => {
        const id = obsElement.querySelector('a[href^="/observations/"]')?.href.split('/').pop();
        if (id) {
            if (selectedObservations.has(id)) {
                obsElement.classList.add('selected');
            } else {
                obsElement.classList.remove('selected');
            }
        }
    });
}

function updateAllSelections() {
    selectedObservations.clear();
    getObservationElements().forEach(obs => {
        if (obs.classList.contains('selected')) {
            const observationId = obs.querySelector('a[href^="/observations/"]')?.href.split('/').pop();
            if (observationId) {
                selectedObservations.add(observationId);
            }
        }
    });
    console.log('Updated all selections:', selectedObservations);
}

function selectAllObservations() {
    console.log('Selecting all observations');
    getObservationElements().forEach(obs => obs.classList.add('selected'));
    updateAllSelections();
    updateBulkActionButtons();
    updateModalTitle();
}

function invertSelection() {
    console.log('Inverting selection');
    getObservationElements().forEach(obs => obs.classList.toggle('selected'));
    updateAllSelections();
    updateBulkActionButtons();
    updateModalTitle();
}

document.body.addEventListener('click', (e) => {
    if (bulkActionModeEnabled) {
        const clickedObsElement = e.target.closest('.ObservationsGridItem');
        if (clickedObsElement) {
            // Allow Ctrl+click to open the identify modal even in bulk mode
            if (e.ctrlKey) {
                // Don't prevent default - let the normal click behavior open the modal
                return;
            }

            // Prevent default navigation/action if clicking within the item,
            // as we are capturing the click for selection purposes.
            e.preventDefault();
            e.stopPropagation();

            const observationId = clickedObsElement.querySelector('a[href^="/observations/"]')?.href.split('/').pop();
            if (!observationId) {
                console.warn("Could not find observation ID for clicked item.", clickedObsElement);
                return;
            }

            if (e.shiftKey && lastClickedObservationElementForShiftSelect && lastClickedObservationElementForShiftSelect !== clickedObsElement) {
                // --- SHIFT-CLICK LOGIC ---
                const allObsElements = Array.from(getObservationElements()); // Assumes getObservationElements() returns currently visible grid items
                const lastClickedIndex = allObsElements.indexOf(lastClickedObservationElementForShiftSelect);
                const currentIndex = allObsElements.indexOf(clickedObsElement);

                if (lastClickedIndex !== -1 && currentIndex !== -1) {
                    const start = Math.min(lastClickedIndex, currentIndex);
                    const end = Math.max(lastClickedIndex, currentIndex);

                    // Standard shift-click behavior: select everything in the range.
                    // If you want to toggle based on the target's state, that's a different UX.
                    // This implementation ensures all items in the range become selected.
                    for (let i = start; i <= end; i++) {
                        const obsInRange = allObsElements[i];
                        const idInRange = obsInRange.querySelector('a[href^="/observations/"]')?.href.split('/').pop();
                        if (idInRange) {
                            if (!selectedObservations.has(idInRange)) { // Add to set if not already there
                                selectedObservations.add(idInRange);
                            }
                            // Visual class is handled by updateVisualSelection later
                        }
                    }
                } else {
                    console.warn("Shift-click: One of the elements not found in current grid items.", 
                                 {lastClicked: lastClickedObservationElementForShiftSelect, current: clickedObsElement });
                    // Fallback to normal toggle for the clicked element if range calculation fails
                    toggleSingleObservationSelection(clickedObsElement, observationId);
                }
            } else {
                // --- NORMAL CLICK LOGIC (single item toggle) ---
                toggleSingleObservationSelection(clickedObsElement, observationId);
            }

            // Update the last clicked element for the *next* potential shift-click
            // Only update if it was a primary click (not part of a range modification that failed)
            if (!e.shiftKey || (lastClickedObservationElementForShiftSelect && lastClickedObservationElementForShiftSelect !== clickedObsElement) ) {
                 lastClickedObservationElementForShiftSelect = clickedObsElement;
            }


            updateVisualSelection(); // Update all visuals based on the selectedObservations set
            updateBulkActionButtons(); // Update button states (e.g., enabled/disabled)
            updateModalTitle();      // Update title of action selection modal if open
            
            console.log('Selected observations count:', selectedObservations.size);
        }
    }
}, true); // Use capture phase

// Helper function to toggle selection for a single observation
function toggleSingleObservationSelection(element, observationId) {
    if (selectedObservations.has(observationId)) {
        selectedObservations.delete(observationId);
    } else {
        selectedObservations.add(observationId);
    }
    // Visual update will be handled by updateVisualSelection() called by the main handler
}

function updateSelectedObservations() {
    const visibleObservations = new Set(
        Array.from(getObservationElements()).map(obs => 
            obs.querySelector('a[href^="/observations/"]')?.href.split('/').pop()
        ).filter(Boolean)
    );

    const toRemove = [];
    for (const id of selectedObservations) {
        if (!visibleObservations.has(id)) {
            toRemove.push(id);
        }
    }

    toRemove.forEach(id => selectedObservations.delete(id));

    if (toRemove.length > 0) {
        console.log(`Removed ${toRemove.length} observations from selection due to filter change`);
    }
}


async function getAvailableActions() {
    return currentSet.buttons.filter(button => !button.configurationDisabled && !button.buttonHidden);
}

function setupTitleUpdater(modal) {
    const title = document.createElement('h2');
    title.id = 'action-selection-title';
    modal.insertBefore(title, modal.firstChild);

    function updateTitle() {
        title.textContent = `Select Action for ${selectedObservations.size} Observations`;
    }

    updateTitle();

    const observer = new MutationObserver(updateTitle);
    observer.observe(document.body, { 
        subtree: true, 
        attributes: true, 
        attributeFilter: ['class']
    });

    return observer;
}

function setupModalCloseHandler(cancelButton, modal) {
    cancelButton.onclick = () => document.body.removeChild(modal);
}

async function executeBulkAction(selectedActionConfig, modal, isCancelledFunc) {
    const observationIds = Array.from(selectedObservations);
    const totalObservations = observationIds.length;
    let processedObservations = 0;
    const allActionResults = [];
    const skippedObservationsDueToSafeMode = [];
    const overwrittenValues = {}; // This will store actual overwrites { obsId: { fieldName: { oldValue, newValue } } }
    const errorMessages = [];

    // Enhanced cancellation check that looks at modal state
    const checkCancelled = () => {
        return isCancelledFunc() || modal.dataset.cancelled === 'true';
    };

    const { safeMode = true } = await new Promise(resolve =>
        browserAPI.storage.local.get('safeMode', resolve)
    );

    const progressFill = modal.querySelector('.progress-fill');
    if (progressFill) progressFill.style.width = '0%'; // Ensure progress bar exists

    const statusElement = modal.querySelector('#bulk-action-status'); // Ensure status element exists
    // if (!statusElement) { // This was in previous code, but modal passed in should have it
    //     statusElement = document.createElement('p');
    //     statusElement.id = 'bulk-action-status';
    //     modal.appendChild(statusElement);
    // }


    try {
        const preActionStates = await generatePreActionStates(observationIds, checkCancelled, modal);

        // Check if cancelled during pre-action state fetch
        if (checkCancelled()) {
            if (modal.parentNode) document.body.removeChild(modal);
            return { results: [], skippedObservations: [], overwrittenValues: {}, errorMessages: [] };
        }

        console.log('Pre-action states:', preActionStates);

        const preliminaryUndoRecord = await generatePreliminaryUndoRecord(selectedActionConfig, observationIds, preActionStates);
        const preventionStates = {};
        for (const observationId of observationIds) {
            preventionStates[observationId] = await handleFollowAndReviewPrevention(observationId, selectedActionConfig.actions, []);
        }

        for (const observationId of observationIds) {
            if (checkCancelled()) {
                if(statusElement) statusElement.textContent = 'Action cancelled. Processing completed actions...';
                break;
            }

            // Skip observations that don't have pre-action states (failed to fetch)
            if (!preActionStates[observationId]) {
                console.error(`Skipping observation ${observationId} - pre-action state not available`);
                allActionResults.push({
                    observationId,
                    action: 'fetch',
                    success: false,
                    message: 'Failed to fetch observation data from API',
                    error: 'Pre-action state unavailable'
                });
                processedObservations++;
                if (progressFill) await updateProgressBar(progressFill, (processedObservations / totalObservations) * 100);
                if (statusElement) statusElement.textContent = `Processing observation ${processedObservations}/${totalObservations}...`;
                continue;
            }

            let observationSkippedThisIterationDueToSafeMode = false;
            const actualOverwritesForThisObs = {}; // Stores actual overwrites for *this* observation

            if (safeMode) {
                for (const action of selectedActionConfig.actions) {
                    if (action.type === 'observationField') {
                        const existingValueDetails = await getFieldValueDetails(observationId, action.fieldId);
                        if (existingValueDetails) {
                            observationSkippedThisIterationDueToSafeMode = true;
                            if (!skippedObservationsDueToSafeMode.includes(observationId)) {
                                skippedObservationsDueToSafeMode.push(observationId);
                            }
                            // Add a "skipped by safe mode" result for this specific action on this obs
                            // This helps the detailed modal explain why nothing happened for this OF action
                            allActionResults.push({
                                observationId,
                                action: action.type,
                                fieldId: action.fieldId,
                                success: false, 
                                message: 'Skipped by Safe Mode due to existing value.',
                                reason: 'safe_mode_skip'
                            });
                            // Important: In safe mode, if one OF would overwrite, we skip *all* actions for this obs.
                            // However, the above push to allActionResults is for this *specific* OF action.
                            // The overall skipping of other actions for this obs is handled by the next `if` block.
                        }
                    }
                }
                 if (observationSkippedThisIterationDueToSafeMode) {
                    // If any OF caused a safe mode skip, we skip all actions for this observation
                     console.log(`Obs ${observationId} skipped entirely due to Safe Mode and existing OF values.`);
                     processedObservations++;
                     if (progressFill) await updateProgressBar(progressFill, (processedObservations / totalObservations) * 100);
                     if (statusElement) statusElement.textContent = `Processing observation ${processedObservations}/${totalObservations}...`;
                     continue; // Move to the next observationId
                 }
            }
            
            // If not skipped by safe mode, proceed with actions
            const currentObservationResults = [];
            for (const action of selectedActionConfig.actions) {
                try {
                    let actionResult;
                    let oldValueForOverwriteReport = null;

                    // Get old value details if it's an OF action and we might overwrite (only in Overwrite Mode)
                    if (action.type === 'observationField' && !safeMode) {
                         const existingValueDetailsForOverwriteCheck = await getFieldValueDetails(observationId, action.fieldId);
                         if (existingValueDetailsForOverwriteCheck) {
                             oldValueForOverwriteReport = existingValueDetailsForOverwriteCheck.displayValue || existingValueDetailsForOverwriteCheck.value;
                         }
                    }

                    if (action.type === 'addToProject') {
                        actionResult = await performProjectAction(
                            observationId, 
                            action.projectId, 
                            action.remove
                        );
                        actionResult.projectId = action.projectId; // Ensure projectId is on the result for summarization
                        // Update undo record for project action based on actual outcome
                        if (preliminaryUndoRecord.observations[observationId]) {
                            const undoAction = preliminaryUndoRecord.observations[observationId].undoActions.find(
                                ua => ua.type === 'removeFromProject' && ua.projectId === action.projectId
                            );
                            if (undoAction) {
                                undoAction.actionApplied = actionResult.success && !actionResult.noActionNeeded;
                                if (actionResult.reason) undoAction.reason = actionResult.reason;
                            }
                        }
                    } else {
                        actionResult = await performSingleAction(
                            action, 
                            observationId, 
                            preActionStates[observationId] // Pass pre-action state for this specific observation
                        );
                    }
                    
                    let resultForSummary = { ...actionResult, observationId, action: action.type };
                    if (action.type === 'observationField') resultForSummary.fieldId = action.fieldId;
                    // Add other potential differentiators if actions of same type can vary (e.g. annotation field ID)
                    if (action.type === 'annotation') resultForSummary.annotationField = action.annotationField;
                    // Ensure error is also stored as message for consistency with display code
                    if (!actionResult.success && actionResult.error && !actionResult.message) {
                        resultForSummary.message = actionResult.error;
                    }


                    currentObservationResults.push(resultForSummary);

                    // If an OF action succeeded, wasn't skipped (noActionNeeded means values were identical),
                    // and we had an old value (meaning it existed before), and we're in Overwrite Mode,
                    // then record it for the "Values Overwritten" report.
                    if (action.type === 'observationField' && 
                        actionResult.success && 
                        !actionResult.noActionNeeded && 
                        oldValueForOverwriteReport !== null && // This ensures the field actually existed
                        !safeMode) {
                        actualOverwritesForThisObs[action.fieldName || action.fieldId] = {
                            oldValue: oldValueForOverwriteReport,
                            newValue: action.displayValue || action.fieldValue
                        };
                    }

                } catch (error) {
                    console.error(`Error executing action ${action.type} for observation ${observationId}:`, error);
                    const errorMessage = error?.message || (typeof error === 'string' ? error : 'Unknown error');
                    errorMessages.push(`Error processing observation ${observationId} (action: ${action.type}): ${errorMessage}`);
                    currentObservationResults.push({
                        success: false,
                        error: errorMessage,
                        message: errorMessage,
                        observationId,
                        action: action.type,
                        fieldId: action.type === 'observationField' ? action.fieldId : undefined,
                        annotationField: action.type === 'annotation' ? action.annotationField : undefined
                    });
                }
            }

            if (Object.keys(actualOverwritesForThisObs).length > 0) {
                 overwrittenValues[observationId] = actualOverwritesForThisObs;
            }

            // Check if all actions for *this specific observation* were successful or appropriately skipped
            const allSucceededOrProjectSkippedForThisObs = currentObservationResults.every(r => 
                r.success || (r.noActionNeeded && r.action === 'addToProject')
            );

            if (allSucceededOrProjectSkippedForThisObs) {
                await handleStateRestoration(
                    observationId, 
                    selectedActionConfig.actions, 
                    currentObservationResults, 
                    preventionStates[observationId]
                );
            }
            allActionResults.push(...currentObservationResults);

            processedObservations++;
            if (progressFill) await updateProgressBar(progressFill, (processedObservations / totalObservations) * 100);
            if (statusElement) statusElement.textContent = `Processing observation ${processedObservations}/${totalObservations}...`;
        } // End of for...of observationIds loop

        // DEBUG: Comprehensive logging for issue #27
        console.log('=== UNDO RECORD DEBUG START ===');
        console.log('Total observations processed:', observationIds.length);
        console.log('Total action results:', allActionResults.length);

        const successfulResults = allActionResults.filter(r => r.success);
        console.log('Successful action results:', successfulResults.length);

        const uniqueSuccessfulObsIds = [...new Set(successfulResults.map(r => r.observationId))];
        console.log('Unique successful observation IDs:', uniqueSuccessfulObsIds.length);
        console.log('Unique successful IDs:', uniqueSuccessfulObsIds);

        const prelimObsIds = Object.keys(preliminaryUndoRecord.observations);
        console.log('Preliminary undo record observation count:', prelimObsIds.length);
        console.log('Preliminary undo record IDs:', prelimObsIds);

        // Find observations that succeeded but are not in preliminary record
        const missingFromPrelim = uniqueSuccessfulObsIds.filter(id => !prelimObsIds.includes(id));
        if (missingFromPrelim.length > 0) {
            console.error('⚠️ OBSERVATIONS MISSING FROM PRELIMINARY UNDO RECORD:', missingFromPrelim);
            console.error('These observations had successful actions but won\'t be in undo record!');
        }

        const finalUndoRecord = generateUndoRecord(preliminaryUndoRecord, allActionResults, overwrittenValues);

        const finalObsIds = Object.keys(finalUndoRecord.observations);
        console.log('Final undo record observation count:', finalObsIds.length);
        console.log('Final undo record IDs:', finalObsIds);

        // Find observations that succeeded but are not in final record
        const missingFromFinal = uniqueSuccessfulObsIds.filter(id => !finalObsIds.includes(id));
        if (missingFromFinal.length > 0) {
            console.error('⚠️ OBSERVATIONS MISSING FROM FINAL UNDO RECORD:', missingFromFinal);
            console.error('Count discrepancy: Successful =', uniqueSuccessfulObsIds.length, 'vs Undo Record =', finalObsIds.length);
        }

        console.log('=== UNDO RECORD DEBUG END ===');

        await storeUndoRecord(finalUndoRecord);

        if (modal.parentNode) document.body.removeChild(modal); // remove progress modal

        const { autoRefreshAfterBulk = false } = await new Promise(resolve =>
            browserAPI.storage.local.get('autoRefreshAfterBulk', resolve)
        );

        const actionSpecificSummary = summarizeBulkActionOutcomes(allActionResults, selectedActionConfig.actions);
        const resultsModal = createDetailedActionResultsModal(
            actionSpecificSummary,
            selectedActionConfig.name,
            skippedObservationsDueToSafeMode, // Pass the array of IDs skipped by safe mode
            overwrittenValues,
            errorMessages,
            autoRefreshAfterBulk // Pass the refresh setting to the modal
        );
        document.body.appendChild(resultsModal);

        // If auto-refresh is enabled, refresh after 2 seconds
        if (autoRefreshAfterBulk) {
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        }

        return { results: allActionResults, skippedObservations: skippedObservationsDueToSafeMode, overwrittenValues, errorMessages };
    } catch (error) {
        console.error('Error in bulk action execution:', error);
        if(statusElement) statusElement.textContent = `Error: ${error.message}`;
        if (modal.parentNode) document.body.removeChild(modal); // ensure progress modal is removed on error too
        throw error;
    }
}

async function executeAction(action, observationId, preActionStates, preliminaryUndoRecord, results, skippedObservations) {
    try {
        const shouldExecuteAction = determineIfActionShouldExecute(action, observationId, preActionStates, skippedObservations);
        if (shouldExecuteAction) {
            console.log(`Performing action ${action.type} for observation ${observationId}`);
            const result = await performSingleAction(action, observationId, true);
            console.log(`Action result:`, result);
            handleActionResult(result, action, observationId, preliminaryUndoRecord, results, skippedObservations);
        }
    } catch (error) {
        console.error(`Failed to perform action ${action.type} for observation ${observationId}:`, error);
        results.push({ observationId, action: action.type, success: false, error: safeErrorString(error) });
    }
}

function determineIfActionShouldExecute(action, observationId, preActionStates, skippedObservations) {
    if (action.type === 'qualityMetric') {
        const currentState = getCurrentQualityMetricState(observationId, action.metric);
        console.log(`Current state for ${action.metric}:`, currentState);
        
        if (currentState === action.vote) {
            console.log(`Skipping ${action.metric} for observation ${observationId} as it's already in the desired state`);
            return false;
        }
    } else if (action.type === 'observationField' || action.type === 'copyObservationField') {
        let fieldId = action.fieldId;
        let fieldValue = action.fieldValue;

        if (action.type === 'copyObservationField') {
            fieldId = action.targetFieldId;
            fieldValue = getExistingObservationFieldValue(preActionStates[observationId], action.sourceFieldId);
            if (fieldValue === null) {
                console.log(`Observation ${observationId}: Source field ${action.sourceFieldId} does not exist or is empty - skipping`);
                return false;
            }
        }

        const existingValue = getExistingObservationFieldValue(preActionStates[observationId], fieldId);
        console.log(`Observation ${observationId}: Existing value: "${existingValue}", Desired value: "${fieldValue}"`);
        
        if (existingValue !== null) {
            if (existingValue === fieldValue) {
                console.log(`Observation ${observationId}: Existing value matches desired value - silently skipping`);
                return false;
            } else {
/*                 console.log(`Observation ${observationId}: Existing value differs from desired value - skipping and adding to skipped list`);
                skippedObservations.push(observationId); */
                return true;
            }
        }
    }
    return true;
}

function handleActionResult(result, action, observationId, preliminaryUndoRecord, results, skippedObservations) {
    if (result.success) {
        if (action.type === 'addComment' && result.commentUUID) {
            const undoAction = preliminaryUndoRecord.observations[observationId].undoActions.find(
                ua => ua.type === 'removeComment' && ua.commentBody === action.commentBody
            );
            if (undoAction) {
                undoAction.commentUUID = result.commentUUID;
                console.log(`Updated undo action with comment UUID: ${result.commentUUID}`);
            }
        } else if (action.type === 'annotation' && result.annotationUUID) {
            const undoAction = preliminaryUndoRecord.observations[observationId].undoActions.find(
                ua => ua.type === 'removeAnnotation' &&
                    ua.attributeId === action.annotationField &&
                    ua.valueId === action.annotationValue
            );
            if (undoAction) {
                undoAction.uuid = result.annotationUUID;
            }
        } else if (action.type === 'addTaxonId' && result.identificationUUID) {
            const undoAction = preliminaryUndoRecord.observations[observationId].undoActions.find(
                ua => ua.type === 'removeIdentification' && ua.taxonId === action.taxonId
            );
            if (undoAction) {
                undoAction.identificationUUID = result.identificationUUID;
                console.log(`Updated undo action with identification UUID: ${result.identificationUUID}`);
            }
        }
    } else {
        console.error(`Action failed for observation ${observationId}:`, result.error);
        skippedObservations.push(observationId);
    }
    results.push({ observationId, action: action.type, success: result.success, error: result.error });
}

function handleActionResults(results, skippedObservations, undoRecord, errorMessages) {
    const successCount = results.filter(r => r.success).length;
    const totalActions = results.length;
    const skippedCount = skippedObservations.length;
    const errorCount = errorMessages.length;
    
    let message = `Bulk action applied: ${successCount} out of ${totalActions} actions completed successfully.`;
    
    if (skippedCount > 0) {
        const skippedURL = generateObservationURL(skippedObservations);
        console.log('Generated URL for skipped observations:', skippedURL);
        createActionResultsModal(skippedCount, skippedURL, errorMessages);
    } else if (errorCount > 0) {
        createErrorModal(errorMessages);
    } else {
        alert(message);
    }

    console.log('Bulk action results:', results);
}

async function getCurrentQualityMetricState(observationId, metric) {
    try {
        const response = await makeAPIRequest(`/observations/${observationId}`);
        const observation = response.results[0];
        const qualityMetric = observation.quality_metrics.find(qm => qm.metric === metric);
        if (qualityMetric) {
            return qualityMetric.agree ? 'agree' : 'disagree';
        }
        return 'unknown';
    } catch (error) {
        console.error(`Error fetching quality metric state for observation ${observationId}:`, error);
        return 'unknown';
    }
}

function getExistingObservationFieldValue(observationState, fieldId) {
    console.log('Checking existing value for field:', fieldId, 'in state:', observationState);
    if (observationState && observationState.ofvs) {
        const field = observationState.ofvs.find(f => f.field_id.toString() === fieldId);
        console.log('Found field:', field);
        return field ? field.value : null;
    }
    console.log('No existing value found');
    return null;
}


function storeUndoRecord(undoRecord) {
    return new Promise((resolve, reject) => {
        browserAPI.storage.local.get('undoRecords', function(result) {
            let undoRecords = result.undoRecords || [];
            undoRecords.push(undoRecord);
            browserAPI.storage.local.set({undoRecords: undoRecords}, function() {
                console.log('Undo record stored:', undoRecord);
                console.log('Total undo records:', undoRecords.length);
                // Notify other tabs about the new undo record
                browserAPI.runtime.sendMessage({action: "undoRecordAdded", record: undoRecord});
                resolve();
            });
        });
    });
}

function downloadTextFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function generatePreActionStates(observationIds, checkCancelled, modal) {
    console.log('=== PRE-ACTION STATES DEBUG START ===');
    console.log('Fetching pre-action states for', observationIds.length, 'observations');
    const preActionStates = {};
    const failedFetches = [];
    const maxRetries = 3;
    const baseDelay = 200;
    const statusElement = modal ? modal.querySelector('#bulk-action-status') : null;

    async function fetchWithRetry(url, retries = 0) {
        try {
            const response = await fetch(url);
            if (response.status === 429) {
                if (retries < maxRetries) {
                    const delay = baseDelay * Math.pow(2, retries);
                    console.log(`Rate limited, retrying after ${delay}ms`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return fetchWithRetry(url, retries + 1);
                } else {
                    throw new Error('Max retries reached');
                }
            }
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error fetching ${url}:`, error);
            throw error;
        }
    }

    // Fetch observations in batches using the API's multi-ID support
    const batchSize = 30; // API supports up to 30 IDs per request
    for (let i = 0; i < observationIds.length; i += batchSize) {
        // Check for cancellation
        if (checkCancelled && checkCancelled()) {
            console.log('Pre-action state fetch cancelled by user');
            if (statusElement) statusElement.textContent = 'Cancelled';
            break;
        }

        const batch = observationIds.slice(i, i + batchSize);
        const idsParam = batch.join(',');

        if (statusElement) {
            statusElement.textContent = `Fetching observation data (${Math.min(i + batchSize, observationIds.length)}/${observationIds.length})...`;
        }

        try {
            // Fetch all observations in this batch with a single API call
            const obsData = await fetchWithRetry(`https://api.inaturalist.org/v1/observations/${idsParam}`);

            // Store each observation's data
            for (const obs of obsData.results) {
                preActionStates[obs.id] = obs;
            }

            // Now fetch subscription data for each observation in this batch
            for (const id of batch) {
                if (preActionStates[id]) {
                    try {
                        const subscriptionData = await makeAPIRequest(`/observations/${id}/subscriptions`);
                        preActionStates[id].isSubscribed = subscriptionData.results &&
                            subscriptionData.results.length > 0;
                    } catch (error) {
                        console.error(`Error fetching subscription data for observation ${id}:`, error);
                        preActionStates[id].isSubscribed = false;
                    }
                }
            }

            // Check if any IDs from this batch weren't returned
            const returnedIds = obsData.results.map(obs => obs.id.toString());
            const missingIds = batch.filter(id => !returnedIds.includes(id));
            if (missingIds.length > 0) {
                console.error(`⚠️ DEBUG ISSUE #27: Observations not returned by API:`, missingIds);
                failedFetches.push(...missingIds);
            }
        } catch (error) {
            console.error(`⚠️ DEBUG ISSUE #27: Failed to fetch batch starting at ${batch[0]}:`, error);
            failedFetches.push(...batch);
        }

        // Update progress
        const progress = Math.min(100, ((i + batchSize) / observationIds.length) * 100);
        updateProgressBar(document.querySelector('.progress-fill'), progress);

        // Add delay between batches (not needed as much with batch fetching, but still good practice)
        if (i + batchSize < observationIds.length) {
            await delay(500); // 500ms between batches of 30
        }
    }

    console.log('Pre-action states fetched for', Object.keys(preActionStates).length, 'observations');
    if (failedFetches.length > 0) {
        console.error(`⚠️ DEBUG ISSUE #27: Failed to fetch ${failedFetches.length} pre-action states`);
        console.error('Failed observation IDs:', failedFetches);
        console.error('These observations will NOT be in the undo record!');
    }
    console.log('=== PRE-ACTION STATES DEBUG END ===');

    return preActionStates;
}

function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

async function generatePreliminaryUndoRecord(action, observationIds, preActionStates) {
    console.log('Generating preliminary undo record for action:', action.name);
    console.log('Total observation IDs to process:', observationIds.length);
    console.log('Pre-action states available:', Object.keys(preActionStates).length);

    let undoRecord = {
        id: generateUniqueId(),
        timestamp: new Date().toISOString(),
        action: action.name,
        observations: {}
    };

    const currentUserId = await getCurrentUserId();
    console.log('Current user ID:', currentUserId);

    const missingPreActionStates = [];

    for (const observationId of observationIds) {
        if (!preActionStates[observationId]) {
            console.error(`⚠️ DEBUG ISSUE #27: No pre-action state found for observation ${observationId} - WILL NOT BE IN UNDO RECORD`);
            missingPreActionStates.push(observationId);
            continue;
        }

        undoRecord.observations[observationId] = {
            undoActions: []
        };

        let currentIdentification; // Declare once, outside of the switch

        for (const actionItem of action.actions) {
            let undoAction;

            switch (actionItem.type) {
                case 'follow':
                    const isCurrentlyFollowed = preActionStates[observationId].isSubscribed;
                    const willBeFollowed = actionItem.follow === 'follow';
                    undoAction = {
                        type: 'follow',
                        alreadyInDesiredState: isCurrentlyFollowed === willBeFollowed,
                        originalState: isCurrentlyFollowed ? 'followed' : 'unfollowed'
                    };
                    console.log('Follow state for observation', observationId, ':', {
                        current: isCurrentlyFollowed,
                        willBe: willBeFollowed,
                        originalState: undoAction.originalState
                    });
                    break;
                case 'reviewed':
                    // Check if current user is in the reviewed_by array
                    const isCurrentlyReviewed = preActionStates[observationId].reviewed_by &&
                        preActionStates[observationId].reviewed_by.includes(currentUserId);
                    undoAction = {
                        type: 'reviewed',
                        originalState: isCurrentlyReviewed ? 'reviewed' : 'unreviewed'
                    };
                    console.log(`Original reviewed state for observation ${observationId}:`, 
                        isCurrentlyReviewed, 
                        'reviewed_by:', preActionStates[observationId].reviewed_by);
                    break;           
                case 'withdrawId':
                    currentIdentification = preActionStates[observationId].identifications
                        .filter(id => id.user.id === currentUserId && id.current)
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

                    if (currentIdentification) {
                        undoAction = {
                            type: 'restoreIdentification',
                            identificationUUID: currentIdentification.uuid
                        };
                    }
                    break;
                case 'observationField':
                    undoAction = {
                        type: 'updateObservationField',
                        fieldId: actionItem.fieldId,
                        originalValue: preActionStates[observationId].ofvs?.find(ofv => ofv.field_id === parseInt(actionItem.fieldId))?.value
                    };
                    break;
                case 'annotation':
                    undoAction = {
                        type: 'removeAnnotation',
                        attributeId: actionItem.annotationField,
                        valueId: actionItem.annotationValue,
                        uuid: null // This will be filled in after the action is performed
                    };
                    break;
                case 'addToProject':
                    try {
                        const isInProject = preActionStates[observationId].project_observations.some(
                            po => po.project.id === parseInt(actionItem.projectId)
                        );

                        if (actionItem.remove) {
                            // Removing from project
                            undoAction = {
                                type: 'removeFromProject',
                                projectId: actionItem.projectId,
                                projectName: actionItem.projectName,
                                remove: !actionItem.remove, // Invert the action for undo
                                alreadyInDesiredState: !isInProject,
                                shouldUndo: isInProject, // We only undo if the original remove was actually applied
                                originalState: isInProject ? 'in_project' : 'not_in_project'
                            };
                        } else {
                            // Adding to project
                            undoAction = {
                                type: 'removeFromProject',
                                projectId: actionItem.projectId,
                                projectName: actionItem.projectName,
                                remove: !actionItem.remove,
                                alreadyInDesiredState: isInProject,
                                shouldUndo: !isInProject, // We only undo if the original add was actually applied
                                originalState: isInProject ? 'in_project' : 'not_in_project'
                            };
                        }
                    } catch (error) {
                        console.error('Error generating undo record for project action:', error);
                        undoAction = { 
                            success: false, 
                            error: safeErrorString(error),
                            projectId: actionItem.projectId,
                            projectName: actionItem.projectName,
                            type: 'removeFromProject'
                        };
                    }
                    break;
                case 'addTaxonId':
                    const userIdentifications = preActionStates[observationId].identifications
                        .filter(id => id.user.id === currentUserId && id.current)
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                    console.log('User active identifications:', userIdentifications);

                    currentIdentification = userIdentifications[0]; // Assign here without redeclaring
                    console.log('Current active identification:', currentIdentification);

                    undoAction = {
                        type: 'removeIdentification',
                        taxonId: actionItem.taxonId,
                        identificationUUID: null, // This will be filled in after the action is performed
                        previousIdentificationUUID: currentIdentification ? currentIdentification.uuid : null
                    };
                    console.log('Generated undo action:', undoAction);
                    break;
                case 'qualityMetric':
                        undoAction = {
                            type: 'qualityMetric',
                            metric: actionItem.metric,
                            vote: actionItem.vote
                        };
                        console.log(`Generated undo action for quality metric addition:`, undoAction);
                    break;
                case 'copyObservationField':
                    undoRecord.observations[observationId].undoActions.push({
                        type: 'updateObservationField',
                        fieldId: actionItem.targetFieldId,
                        originalValue: preActionStates[observationId].ofvs.find(ofv => ofv.field_id === parseInt(actionItem.targetFieldId))?.value
                    });
                    break;
                case 'addToList':
                    undoAction = {
                        type: 'addToList',
                        listId: actionItem.listId,
                        remove: !actionItem.remove // Invert the remove action for undo
                    };
                    break;
            }
            if (undoAction) {
                undoRecord.observations[observationId].undoActions.push(undoAction);
            }
        }
    }

    if (missingPreActionStates.length > 0) {
        console.error(`⚠️ DEBUG ISSUE #27: ${missingPreActionStates.length} observations missing from pre-action states!`);
        console.error('Missing observation IDs:', missingPreActionStates);
    }

    console.log('Generated preliminary undo record with', Object.keys(undoRecord.observations).length, 'observations');
    console.log('Generated preliminary undo record:', undoRecord);
    return undoRecord;
}


function updateUndoRecord(undoRecord, actionResults) {
    for (const [observationId, results] of Object.entries(actionResults)) {
        undoRecord.observations[observationId].undoActions.forEach(undoAction => {
            if (undoAction.type === 'removeComment') {
                undoAction.commentId = results.addedCommentId;
            } else if (undoAction.type === 'removeIdentification') {
                undoAction.identificationId = results.addedIdentificationId;
            }
        });
    }
    return undoRecord;
}

function generateUndoSummary(undoRecord) {
    let summary = `Undo Record for action: ${undoRecord.action}\n\n`;
    
    for (const [observationId, observationData] of Object.entries(undoRecord.observations)) {
        summary += `Observation ${observationId}:\n`;
        observationData.undoActions.forEach(undoAction => {
            switch (undoAction.type) {
                case 'updateAnnotation':
                    summary += `  - Revert annotation ${undoAction.attributeId} to ${undoAction.originalValue || 'None'}\n`;
                    break;
                case 'updateObservationField':
                    summary += `  - Revert observation field ${undoAction.fieldId} to ${undoAction.originalValue || 'None'}\n`;
                    break;
                case 'removeFromProject':
                    summary += `  - ${undoAction.remove ? 'Add to' : 'Remove from'} project: ${undoAction.projectName}\n`;
                    break;                    
                case 'removeComment':
                    summary += `  - Remove added comment (ID: ${undoAction.commentId || 'Unknown'})\n`;
                    break;
                case 'removeIdentification':
                    summary += `  - Remove added identification (ID: ${undoAction.identificationId || 'Unknown'})\n`;
                    break;
                case 'removeQualityMetric':
                    summary += `  - Remove quality metric ${undoAction.metric}\n`;
                    break;
            }
        });
        summary += '\n';
    }
    
    return summary;
}


function downloadUndoRecord(undoRecord) {
    const content = JSON.stringify(undoRecord, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'undo_record.json';
    a.click();
    URL.revokeObjectURL(url);
}

function getQualityMetricName(metric) {
    const metricNames = {
        'needs_id': 'Needs ID',
        'date': 'Date',
        'location': 'Location',
        'wild': 'Wild',
        'evidence': 'Evidence',
        'recent': 'Recent',
        'subject': 'Subject'
    };
    return metricNames[metric] || metric;
}

function showUndoRecordsModal() {
    getUndoRecords(function(undoRecords) {
        console.log('Retrieved undo records:', undoRecords);
        if (undoRecords.length === 0) {
            alert('No undo records available.');
            return;
        }

        const modal = createUndoRecordsModal(undoRecords, function(record) {
            performUndoActions(record)
                .then(() => {
                    removeUndoRecord(record.id, function() {
                        document.body.removeChild(modal);
                        showUndoRecordsModal(); // Refresh the modal
                    });
                })
                .catch(error => {
                    alert(`Error performing undo actions: ${error.message}`);
                });
        });

        document.body.appendChild(modal);
    });
}

function createActionResultsModal(results, skippedCount, skippedURL, overwrittenCount, overwrittenDetails, errorMessages) {
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

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background-color: white;
        padding: 20px;
        border-radius: 5px;
        max-width: 80%;
        max-height: 80%;
        overflow-y: auto;
        font-size: 14px; /* Added for consistency */
    `;

    let contentHTML = `<h2 style="margin-top:0;">Bulk Action Results</h2>`; // Added style for consistency

    const pluralizeLocal = (count, singular, plural = null) => { // Local pluralize
        if (plural === null) plural = singular + 's';
        return count === 1 ? singular : plural;
    };

    const successCount = results.filter(r => r.success && !r.noActionNeeded).length; // Exclude noActionNeeded from pure success count here
    const noActionNeededCount = results.filter(r => r.success && r.noActionNeeded).length;

    if (successCount > 0) {
        contentHTML += `<p style="color: green;">${successCount} action(s) completed successfully.</p>`;
    }
    if (noActionNeededCount > 0) {
        contentHTML += `<p style="color: #666;">${noActionNeededCount} action(s) required no change (e.g., value already set).</p>`;
    }


    if (overwrittenCount > 0) {
        contentHTML += `
            <div style="margin: 15px 0; padding: 10px; background: #ffebee; border: 1px solid #ffcdd2; border-radius: 4px;">
                <h4>Values Overwritten (${overwrittenCount} ${pluralizeLocal(overwrittenCount, "observation")})</h4>
                <p>The following observation field values were overwritten (Overwrite Mode was ON):</p>
                <div style="max-height: 150px; overflow-y: auto;"><ul>
        `;
        Object.entries(overwrittenDetails).forEach(([observationId, fields]) => { // Changed from 'details' to 'fields'
            contentHTML += `
                <li>
                    <a href="https://www.inaturalist.org/observations/${observationId}" 
                       target="_blank" 
                       style="color: #0077cc; text-decoration: underline;">
                        Observation ${observationId}
                    </a>:
                    <ul>
            `;
            Object.entries(fields).forEach(([fieldName, values]) => { // Changed from 'details' to 'values'
                contentHTML += `<li>"${fieldName}": from "${values.oldValue}" to "${values.newValue}"</li>`;
            });
            contentHTML += `</ul></li>`;
        });
        contentHTML += `</ul></div></div>`;
    }

    if (skippedCount > 0 && skippedURL) { // Ensure skippedURL is present
        contentHTML += `
            <div style="margin: 15px 0; padding: 10px; background: #fff8e1; border: 1px solid #ffecb3; border-radius: 4px;">
                <h4>Observations Skipped by Safe Mode (${skippedCount})</h4>
                <p>
                    <a class="modal-link" href="${skippedURL}" target="_blank" style="color: #4caf50; text-decoration: underline;">
                        View ${skippedCount} skipped ${pluralizeLocal(skippedCount, "observation")}
                    </a>
                </p>
            </div>
        `;
    }

    const actualFailures = results.filter(r => !r.success);
    if (actualFailures.length > 0) {
         contentHTML += `
            <div style="margin: 15px 0; padding: 10px; background: #ffeded; border: 1px solid #ffcccb; border-radius: 4px;">
                <h4>Failed Actions (${actualFailures.length})</h4>
                <div style="max-height: 150px; overflow-y: auto;"><ul>`;
        actualFailures.forEach(f => {
             contentHTML += `<li>Obs. <a href="https.www.inaturalist.org/observations/${f.observationId}" target="_blank">${f.observationId}</a> (Action: ${f.action || 'Unknown'}): ${getCleanErrorMessage(f.message || f.error)} ${f.reason ? `(${f.reason})` : ''}</li>`;
        });
        contentHTML += `</ul></div></div>`;
    }
    
    if (errorMessages && errorMessages.length > 0) {
        contentHTML += `
            <div style="margin: 15px 0; padding: 10px; background: #fff1f0; border: 1px solid #ffcccb; border-radius: 4px;">
                <h4>Overall Errors Encountered:</h4>
                <ul>${errorMessages.map(err => `<li>${err}</li>`).join('')}</ul>
            </div>`;
    }
    
    if (successCount === 0 && noActionNeededCount === 0 && skippedCount === 0 && actualFailures.length === 0 && (!errorMessages || errorMessages.length === 0)) {
        contentHTML += "<p><em>No actions were performed or had notable outcomes.</em></p>";
    }


    contentHTML += `<button id="general-results-close-button" class="modal-button" style="margin-top:15px;">Close</button>`;
    modalContent.innerHTML = contentHTML;
    modal.appendChild(modalContent);

    document.body.appendChild(modal);

    const closeButton = modalContent.querySelector('#general-results-close-button');
    const handleKeyPress = (event) => {
        if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault();
            if(closeButton) closeButton.click();
        }
    };
    document.addEventListener('keydown', handleKeyPress);

    if (closeButton) {
        closeButton.addEventListener('click', () => {
            document.removeEventListener('keydown', handleKeyPress);
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        });
    }
}

window.addEventListener('popstate', updateSelectedObservations);
window.addEventListener('pushstate', updateSelectedObservations);
window.addEventListener('replacestate', updateSelectedObservations);

function toggleSortDropdown(event) {
    event.stopPropagation();
    const sortButton = event.target;
    const dropdown = document.getElementById('sort-dropdown');
    const isHidden = dropdown.style.display === 'none' || dropdown.style.display === '';
    
    if (isHidden) {
        dropdown.style.display = 'block';
        dropdown.style.width = `${sortButton.offsetWidth}px`; // Match dropdown width to button width

        if (buttonPosition.startsWith('top')) {
            dropdown.style.top = '100%';
            dropdown.style.bottom = 'auto';
        } else {
            dropdown.style.bottom = '100%';
            dropdown.style.top = 'auto';
        }

        dropdown.style.left = '0';
        dropdown.style.right = 'auto';

        document.addEventListener('click', closeSortDropdown);
    } else {
        dropdown.style.display = 'none';
        document.removeEventListener('click', closeSortDropdown);
    }
}

function closeSortDropdown(event) {
    const dropdown = document.getElementById('sort-dropdown');
    const sortButton = document.getElementById('sort-button');
    if (!dropdown.contains(event.target) && event.target !== sortButton) {
        dropdown.style.display = 'none';
        document.removeEventListener('click', closeSortDropdown);
    }
}

function sortButtons(method) {
    const buttons = Array.from(buttonContainer.querySelectorAll('.button-ph'));
    
    if (method === 'custom' && currentSet.customOrder) {
        // Ensure custom order is up to date before sorting
        updateCustomOrderForSet(currentSet);
        
        // Sort buttons according to custom order
        buttons.sort((a, b) => {
            return currentSet.customOrder.indexOf(a.dataset.buttonId) - 
                   currentSet.customOrder.indexOf(b.dataset.buttonId);
        });
    } else {
        buttons.sort((a, b) => {
            switch (method) {
                case 'az':
                    return a.innerText.localeCompare(b.innerText);
                case 'za':
                    return b.innerText.localeCompare(a.innerText);
                case 'new-old':
                    return b.dataset.buttonId.localeCompare(a.dataset.buttonId);
                case 'old-new':
                    return a.dataset.buttonId.localeCompare(b.dataset.buttonId);
            }
        });
    }

    // Reorder buttons in the container
    buttons.forEach(button => buttonContainer.appendChild(button));
    
    // Update sort button text
    const sortButton = document.getElementById('sort-button');
    if (sortButton) {
        sortButton.innerHTML = getSortButtonText(method);
    }
    
    // Save the updated configuration
    browserAPI.storage.local.get('configurationSets', function(data) {
        const sets = data.configurationSets || [];
        const setIndex = sets.findIndex(set => set.name === currentSetName);
        if (setIndex !== -1) {
            sets[setIndex].sortMethod = method;
            if (method === 'custom') {
                sets[setIndex].customOrder = currentSet.customOrder;
            }
            browserAPI.storage.local.set({ configurationSets: sets }, function() {
                debugLog('Sort method and custom order saved for set:', currentSetName, {
                    method,
                    customOrder: method === 'custom' ? currentSet.customOrder : undefined
                });
                // Update current set in memory
                currentSet.sortMethod = method;
            });
        }
    });
    
    document.getElementById('sort-dropdown').style.display = 'none';
}

function getSortButtonText(method) {
    switch (method) {
        case 'az':
            return 'Sort: A-Z';
        case 'za':
            return 'Sort: Z-A';
        case 'new-old':
            return 'Sort: New-Old';
        case 'old-new':
            return 'Sort: Old-New';
        case 'custom':
            return 'Sort: Custom';
        default:
            return 'Sort';
    }
}

function updateCustomOrderForSet(set) {
    if (!set.customOrder || !set.buttons) return false;

    const allButtonIds = new Set(set.buttons.map(button => button.id));
    const originalOrder = [...set.customOrder];

    // Remove non-existent buttons
    set.customOrder = set.customOrder.filter(id => allButtonIds.has(id));

    // Add new buttons to the end
    const missingButtons = Array.from(allButtonIds).filter(id => !set.customOrder.includes(id));
    if (missingButtons.length > 0) {
        set.customOrder = [...set.customOrder, ...missingButtons];
    }

    // Return true if the order changed
    return JSON.stringify(originalOrder) !== JSON.stringify(set.customOrder);
}

browserAPI.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'local') {
        let needsConfigReload = false;
        let configSetsChanged = false;

        if (changes.configurationSets) {
            debugLog("content.js: configurationSets changed in storage.");
            needsConfigReload = true;
            configSetsChanged = true; // Specifically note that the sets array itself changed
        }

        // Listen for the correct key that options.js uses to indicate the active set for content scripts
        if (changes.contentScriptActiveSetName) {
            debugLog("content.js: contentScriptActiveSetName changed to:", changes.contentScriptActiveSetName.newValue);
            needsConfigReload = true;
        }

        // If configurationSets array changed, we might need to update custom orders
        // This logic was in your second listener. We integrate it here.
        if (configSetsChanged) {
            const updatedSets = changes.configurationSets.newValue;
            if (updatedSets) {
                let needsOrderUpdateInStorage = false;
                updatedSets.forEach(set => {
                    // Assuming updateCustomOrderForSet modifies 'set' in place if an update happens
                    // AND returns true if an update was made.
                    if (updateCustomOrderForSet(set)) {
                        needsOrderUpdateInStorage = true;
                    }
                });

                if (needsOrderUpdateInStorage) {
                    // The updatedSets array (which is a copy from the change object)
                    // now has potentially modified customOrder properties. Save it back.
                    browserAPI.storage.local.set({ configurationSets: updatedSets }, function() {
                        if (browserAPI.runtime.lastError) {
                            console.error("content.js: Error saving updated custom orders from storage.onChanged:", browserAPI.runtime.lastError);
                        } else {
                            debugLog('content.js: Updated custom orders in storage after external change.');
                        }
                        // Whether order update save succeeded or failed, or if no update was needed,
                        // we still need to reload based on the new data.
                        if (needsConfigReload) { // Re-check, as needsConfigReload might have been true for other reasons
                           loadConfigurationSets();
                        }
                    });
                    return; // Return here because loadConfigurationSets will be called in the callback
                }
            }
        }

        // If we need a reload (and didn't return early for custom order saving)
        if (needsConfigReload) {
            loadConfigurationSets();
        }

        // Handle other specific, independent changes
        if (changes.buttonPosition) {
            buttonPosition = changes.buttonPosition.newValue;
            // Ensure currentPositionIndex is updated if buttonPosition is a string like 'top-left'
            currentPositionIndex = positions.indexOf(buttonPosition);
            if (currentPositionIndex === -1) currentPositionIndex = 0; // Fallback
            updatePositions();
        }

        if (changes.safeMode) {
            // safeMode = changes.safeMode.newValue;
            // handleSafeModeChange(safeMode); // Example
        }
        // Add other specific key listeners here
    }
});

function loadConfigurationSets() {
    debugLog("content.js: loadConfigurationSets called");
    browserAPI.storage.local.get(['configurationSets', 'contentScriptActiveSetName'], function(data) {
        if (browserAPI.runtime.lastError) {
            console.error("content.js: Error getting data from storage in loadConfigurationSets:", browserAPI.runtime.lastError);
            // Potentially try to render with existing globals if data is stale but present, or clear UI
            configurationSets = configurationSets || []; // Keep stale if available
            currentSet = currentSet || (configurationSets.find(s => s.name === currentSetName)); // Try to keep stale
            // createDynamicButtons(); createSetSwitcher(); updateBulkActionButtons(); // Attempt to render stale
            return;
        }

        const loadedSets = data.configurationSets || [];
        let activeSetNameFromStorage = data.contentScriptActiveSetName;

        // Check if the loaded sets are different from the current global ones
        // A simple length check or stringify can be a heuristic, but for robust checking,
        // you might need a deep compare if only content changed but not the object reference.
        // For now, let's assume `changes.configurationSets` in onChanged is the main trigger for full re-evaluation.
        configurationSets = loadedSets;

        // Determine the active set name
        if (activeSetNameFromStorage && configurationSets.some(set => set.name === activeSetNameFromStorage)) {
            currentSetName = activeSetNameFromStorage;
        } else if (configurationSets.length > 0) {
            // Active set from storage is invalid or missing, default to the first set
            currentSetName = configurationSets[0].name;
            console.warn(`content.js: contentScriptActiveSetName "${activeSetNameFromStorage}" not found or invalid. Defaulting to "${currentSetName}".`);
            // Save this default back to storage so options.js and other instances are consistent
            browserAPI.storage.local.set({ contentScriptActiveSetName: currentSetName }, () => {
                if (browserAPI.runtime.lastError) {
                    console.error("content.js: Error saving default contentScriptActiveSetName:", browserAPI.runtime.lastError);
                }
            });
        } else {
            // No sets available at all
            currentSetName = null;
            console.warn("content.js: No configuration sets found. No active set.");
        }

        // Update custom orders for all sets (this might have been done by onChanged if sets array changed)
        // However, doing it here ensures orders are checked even on initial load.
        // This assumes updateCustomOrderForSet modifies the set objects within the `configurationSets` array directly.
        let needsOrderUpdateInStorage = false;
        if (configurationSets && configurationSets.length > 0) {
            configurationSets.forEach(set => {
                if (updateCustomOrderForSet(set)) {
                    needsOrderUpdateInStorage = true;
                }
            });
        }

        if (needsOrderUpdateInStorage) {
            browserAPI.storage.local.set({ configurationSets: configurationSets }, function() {
                if (browserAPI.runtime.lastError) {
                    console.error("content.js: Error saving updated custom orders from loadConfigurationSets:", browserAPI.runtime.lastError);
                } else {
                    debugLog('content.js: Updated custom orders in storage during loadConfigurationSets.');
                }
                // Proceed to find currentSet and update UI even if this save fails
                findCurrentSetAndRender();
            });
        } else {
            findCurrentSetAndRender();
        }
    });

    function findCurrentSetAndRender() {
        if (currentSetName) {
            currentSet = configurationSets.find(set => set.name === currentSetName);
        } else {
            currentSet = null;
        }

        if (!currentSet && currentSetName && configurationSets.length > 0) {
            // This case implies currentSetName was set, but the set disappeared (e.g. deleted in options)
            // and the fallback in the main part of loadConfigurationSets didn't catch it before order update.
            console.warn(`content.js: Active set "${currentSetName}" became invalid. Defaulting to first available.`);
            currentSet = configurationSets[0];
            currentSetName = currentSet.name;
            browserAPI.storage.local.set({ contentScriptActiveSetName: currentSetName }); // Persist this correction
        } else if (!currentSet && !currentSetName) {
             console.log("content.js: No active set to render.");
        }


        // Update global currentAvailableActions if used by other functions
        currentAvailableActions = currentSet ? currentSet.buttons.filter(button => !button.configurationDisabled && !button.buttonHidden) : [];

        debugLog("content.js: Effective currentSet for rendering:", currentSet ? currentSet.name : "None");
        createDynamicButtons();    // Uses global currentSetName/currentSet
        createSetSwitcher();       // Uses global currentSetName/configurationSets
        updateBulkActionButtons(); // Uses global currentSet or currentAvailableActions
    }
}

function createSetSwitcher() {
    // Remove existing switcher if it exists
    const existingSwitcher = document.getElementById('set-switcher');
    if (existingSwitcher) {
        existingSwitcher.remove();
    }

    const switcher = document.createElement('div');
    switcher.id = 'set-switcher';
    switcher.style.cssText = `
        display: inline-block;
        margin-left: 10px;
        vertical-align: middle;
        position: relative;
    `;

    const currentSet = document.createElement('div');
    currentSet.id = 'current-set';
    currentSet.textContent = currentSetName;
    currentSet.style.cssText = `
        background-color: #f0f0f0;
        border: 1px solid #ccc;
        border-radius: 3px;
        padding: 5px 24px 5px 10px;
        font-size: 14px;
        cursor: pointer;
        user-select: none;
        position: relative;
    `;

    // Add a dropdown arrow
    const arrow = document.createElement('span');
    arrow.textContent = '▼';
    arrow.style.cssText = `
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 10px;
    `;
    currentSet.appendChild(arrow);

    const dropdown = document.createElement('div');
    dropdown.id = 'set-switcher-dropdown';
    dropdown.style.cssText = `
        display: none;
        position: absolute;
        top: 100%;
        left: 0;
        background-color: white;
        border: 1px solid #ccc;
        border-radius: 3px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        z-index: 10002;
        min-width: 100%;
    `;

    configurationSets.forEach(set => {
        const option = document.createElement('div');
        option.textContent = set.name;
        option.style.cssText = `
            padding: 5px 10px;
            cursor: pointer;
            white-space: nowrap;
        `;
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            switchConfigurationSet(set.name);
            currentSet.textContent = set.name;
            currentSet.appendChild(arrow);
            dropdown.style.display = 'none';
        });
        option.addEventListener('mouseover', () => {
            option.style.backgroundColor = '#f0f0f0';
        });
        option.addEventListener('mouseout', () => {
            option.style.backgroundColor = 'white';
        });
        dropdown.appendChild(option);
    });

    currentSet.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', () => {
        dropdown.style.display = 'none';
    });

    switcher.appendChild(currentSet);
    switcher.appendChild(dropdown);

    const sortButtonContainer = document.getElementById('sort-buttons-container');
    if (sortButtonContainer) {
        sortButtonContainer.appendChild(switcher);
    }

    // Ensure the dropdown is positioned correctly
    function positionDropdown() {
        const rect = currentSet.getBoundingClientRect();
        dropdown.style.minWidth = `${rect.width}px`;
        
        // Check if dropdown would go off the bottom of the screen
        if (rect.bottom + dropdown.offsetHeight > window.innerHeight) {
            dropdown.style.top = 'auto';
            dropdown.style.bottom = '100%';
        } else {
            dropdown.style.top = '100%';
            dropdown.style.bottom = 'auto';
        }
    }

    // Position the dropdown when it's displayed
    new MutationObserver(() => {
        if (dropdown.style.display === 'block') {
            positionDropdown();
        }
    }).observe(dropdown, { attributes: true, attributeFilter: ['style'] });

    // Reposition on window resize
    window.addEventListener('resize', () => {
        if (dropdown.style.display === 'block') {
            positionDropdown();
        }
    });
}

function switchConfigurationSet(setName) {
    if (currentSetName === setName && currentSet) return; // No change needed

    const newSet = configurationSets.find(set => set.name === setName);

    if (!newSet) {
        console.error(`content.js: Attempted to switch to non-existent set: ${setName}`);
        // Fallback to first available set
        const fallbackSetName = configurationSets.length > 0 ? configurationSets[0].name : null;
        browserAPI.storage.local.set({ contentScriptActiveSetName: fallbackSetName });
        return;
    }

    // Just update storage - let the listener handle everything else
    browserAPI.storage.local.set({ contentScriptActiveSetName: setName }, function() {
        if (browserAPI.runtime.lastError) {
            console.error("content.js: Error saving active set:", browserAPI.runtime.lastError);
        } else {
            debugLog('content.js: Requested switch to set:', setName);
        }
    });
}


function updateBulkActionDropdown(actionSelect, availableActions) {
    console.log('Updating bulk action dropdown. Available actions:', availableActions);
    if (actionSelect) {
        // Save the current selection
        const currentSelection = actionSelect.value;
        
        // Clear existing options
        actionSelect.innerHTML = '';
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = "";
        defaultOption.textContent = "Select an action";
        defaultOption.disabled = true;
        defaultOption.selected = true;
        actionSelect.appendChild(defaultOption);
        
        // Add options for each available action
        availableActions.forEach(button => {
            const option = document.createElement('option');
            option.value = button.id;
            option.textContent = button.name;
            actionSelect.appendChild(option);
        });
        
        // Restore the previous selection if it still exists
        if (Array.from(actionSelect.options).some(option => option.value === currentSelection)) {
            actionSelect.value = currentSelection;
        } else {
            actionSelect.value = ""; // Reset to default if the previous selection is no longer available
        }
        
        // Update the action description
        updateActionDescription(actionSelect);
    }
}

function updateActionDescription(actionSelect) {
    const descriptionElement = document.getElementById('action-description');
    if (actionSelect && descriptionElement) {
        const selectedAction = currentSet.buttons.find(button => button.id === actionSelect.value);
        if (selectedAction) {
            let descriptionHTML = '<strong>This action will:</strong><ul>';
            selectedAction.actions.forEach(action => {
                let actionDesc = '';
                switch(action.type) {
                    case 'reviewed':
                        actionDesc = `Mark the observation as ${action.reviewed === 'mark' ? 'reviewed' : 'unreviewed'}`;
                        break;                          
                    case 'follow':
                        actionDesc = `${action.follow === 'follow' ? 'Follow' : 'Unfollow'} the observation`;
                        break;                     
                    case 'withdrawId' :
                        actionDesc = `Withdraw your current identification`;
                        break;  
                    case 'observationField':
                        const displayValue = action.displayValue || action.fieldValue;
                        actionDesc = `Set field "${action.fieldName}" to "${displayValue}"`;
                        break;
                    case 'annotation':
                        // Find the field name by ID
                        let annotationFieldName = 'Unknown';
                        let annotationValueName = 'Unknown';
                        
                        for (const [key, value] of Object.entries(controlledTerms)) {
                            if (value.id === parseInt(action.annotationField)) {
                                annotationFieldName = key;
                                // Look up the value name
                                for (const [valueName, valueId] of Object.entries(value.values)) {
                                    if (valueId === parseInt(action.annotationValue)) {
                                        annotationValueName = valueName;
                                        break;
                                    }
                                }
                                break;
                            }
                        }
                        actionDesc = `Add annotation: ${annotationFieldName} = ${annotationValueName}`;
                        break;
                    case 'addToProject':
                        actionDesc = `${action.remove ? 'Remove from' : 'Add to'} project: ${action.projectName}`;
                        break;
                    case 'addComment':
                        actionDesc = `Add comment: "${action.commentBody.substring(0, 50)}${action.commentBody.length > 50 ? '...' : ''}"`;
                        break;
                    case 'addTaxonId':
                        actionDesc = `Add taxon ID: ${action.taxonName}`;
                        break;
                    case 'qualityMetric':
                        const metricName = getQualityMetricName(action.metric);
                        actionDesc = `Set quality metric: ${metricName} to ${action.vote}`;
                        break;
                    case 'copyObservationField':
                        actionDesc = `Copy field: ${action.sourceFieldName} to ${action.targetFieldName}`;
                        break;
                }
                if (actionDesc) {
                    descriptionHTML += `<li>${actionDesc}</li>`;
                }
            });
            descriptionHTML += '</ul>';

            const hasDQIRemoval = selectedAction.actions.some(action => 
                action.type === 'qualityMetric' && action.vote === 'remove'
            );

            if (hasDQIRemoval) {
                descriptionHTML += '<p style="color: red;"><strong>Note:</strong> Removing DQI votes cannot be undone in bulk due to API limitations.</p>';
            }

            descriptionElement.innerHTML = descriptionHTML;
        } else {
            descriptionElement.innerHTML = 'No action selected.';
        }
    }
}

async function fetchTaxonData(taxonId) {
    const response = await fetch(`https://api.inaturalist.org/v1/taxa/${taxonId}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.results[0];
}

function getQualityMetricName(metric) {
    const metricNames = {
        'needs_id': 'Needs ID',
        'date': 'Date',
        'location': 'Location',
        'wild': 'Wild',
        'evidence': 'Evidence',
        'recent': 'Recent',
        'subject': 'Subject'
    };
    return metricNames[metric] || metric;
}

// Add keyboard shortcut to cycle through sets
document.addEventListener('keydown', function(event) {
    if (event.altKey && event.key === 's') {  // Alt+S to switch sets
        event.preventDefault();
        cycleConfigurationSet();
    }
});

function updateBulkActionButtons() {
    const bulkButtonContainer = document.getElementById('bulk-action-container');
    const enableBulkModeButton = document.getElementById('enable-bulk-mode-button');
    
    // Only show the container when bulk mode is enabled
    if (bulkButtonContainer) {
        bulkButtonContainer.style.display = bulkActionModeEnabled ? 'block' : 'none';
    }
    
    if (enableBulkModeButton) {
        enableBulkModeButton.style.display = bulkActionModeEnabled ? 'none' : 'block';
    }

    if (bulkActionModeEnabled && bulkButtonContainer) {
        // Preserve existing toggle if it exists
        const existingToggle = bulkButtonContainer.querySelector('.safe-mode-toggle');
        bulkButtonContainer.innerHTML = '';
        
        // Create button wrapper for first row
        const buttonWrapper = document.createElement('div');
        buttonWrapper.style.cssText = `
            display: flex;
            align-items: center;
            gap: 5px;
            margin-bottom: 10px;
        `;
        
        // Either reuse existing toggle or create new one
        const safeModeToggle = existingToggle || createSafeModeToggle();
        buttonWrapper.appendChild(safeModeToggle);
        
        // Add main action buttons
        const selectAllButton = createBulkActionButton('Select All', selectAllObservations);
        const invertSelectionButton = createBulkActionButton('Invert Selection', invertSelection);
        const clearSelectionButton = createBulkActionButton('Clear Selection', clearSelection);
        const selectAndApplyButton = createBulkActionButton('Select and Apply Action', applyBulkAction);   const disableBulkModeButton = createBulkActionButton('Disable Bulk Mode', disableBulkActionMode);
        const showUndoRecordsButton = createBulkActionButton('Show Undo Records', showUndoRecordsModal);

        // Add buttons to wrapper
        buttonWrapper.appendChild(selectAllButton);
        buttonWrapper.appendChild(invertSelectionButton);
        buttonWrapper.appendChild(clearSelectionButton);
        
        // Create second row for remaining buttons
        const secondRowWrapper = document.createElement('div');
        secondRowWrapper.style.cssText = `
            display: flex;
            align-items: center;
            gap: 5px;
        `;
        
        secondRowWrapper.appendChild(selectAndApplyButton);
        secondRowWrapper.appendChild(disableBulkModeButton);
        secondRowWrapper.appendChild(showUndoRecordsButton);

        // Add both rows to container
        bulkButtonContainer.appendChild(buttonWrapper);
        bulkButtonContainer.appendChild(secondRowWrapper);

        // Update button states
        clearSelectionButton.disabled = selectedObservations.size === 0;
    }
}

function cycleConfigurationSet() {
    const currentIndex = configurationSets.findIndex(set => set.name === currentSetName);
    const nextIndex = (currentIndex + 1) % configurationSets.length;
    switchConfigurationSet(configurationSets[nextIndex].name);
}

// Initial load
loadConfigurationSets();

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createErrorModal(errorMessages) {
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

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background-color: white;
        padding: 20px;
        border-radius: 5px;
        max-width: 80%;
        max-height: 80%;
        overflow-y: auto;
    `;

    let contentHTML = `
        <h2>Bulk Action Errors</h2>
        <p>${errorMessages.length} errors occurred during execution:</p>
        <ul>
            ${errorMessages.map(error => `<li>${error}</li>`).join('')}
        </ul>
        <button id="closeModal" class="modal-button">Close</button>
    `;

    modalContent.innerHTML = contentHTML;

    modal.appendChild(modalContent);

    document.body.appendChild(modal);

    document.getElementById('closeModal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
}

function clearSelection() {
    selectedObservations.clear();
    getObservationElements().forEach(obs => obs.classList.remove('selected'));
    updateBulkActionButtons();
    updateModalTitle();
    console.log('Selection cleared');
}

function updateModalTitle() {
    const title = document.getElementById('action-selection-title');
    if (title) {
        if (selectedObservations.size > 0) {
            title.textContent = `Select Action for ${selectedObservations.size} Observation${selectedObservations.size > 1 ? 's' : ''}`;
        } else {
            title.textContent = 'Select Action (No Observations Selected)';
        }
    }
}

function createSafeModeToggle() {
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'safe-mode-toggle';
    toggleContainer.style.cssText = `
        display: inline-flex;
        align-items: center;
        margin-right: 10px;
        vertical-align: middle;
    `;

    const toggle = document.createElement('button');
    toggle.className = 'mode-toggle-button';
    toggle.style.cssText = `
        width: 44px;
        height: 24px;
        border-radius: 12px;
        background-color: #4CAF50;
        position: relative;
        transition: background-color 0.2s;
        border: none;
        cursor: pointer;
        margin-right: 8px;
        vertical-align: middle;
    `;

    const slider = document.createElement('span');
    slider.style.cssText = `
        position: absolute;
        top: 2px;
        left: 2px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background-color: white;
        transition: transform 0.2s;
    `;
    toggle.appendChild(slider);

    const label = document.createElement('span');
    label.textContent = 'Safe Mode';
    label.style.cssText = `
        font-size: 14px;
        vertical-align: middle;
    `;

    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
        position: absolute;
        background-color: black;
        color: white;
        padding: 8px;
        border-radius: 4px;
        font-size: 12px;
        max-width: 200px;
        visibility: hidden;
        opacity: 0;
        transition: opacity 0.2s;
        top: 100%;
        left: 0;
        margin-top: 8px;
        z-index: 1000;
        pointer-events: none;
    `;

    let safeMode = true; // Default to true

    function updateToggleState() {
        toggle.style.backgroundColor = safeMode ? '#4CAF50' : '#666';
        slider.style.transform = safeMode ? 'translateX(0)' : 'translateX(20px)';
        label.textContent = safeMode ? 'Safe Mode' : 'Overwrite Mode';
        tooltip.textContent = safeMode ? 
            'Safe Mode: Skips observations with existing values to prevent data loss' :
            'Overwrite Mode: Allows overwriting existing values - use with caution';
    }

    browserAPI.storage.local.get('safeMode', function(data) {
        safeMode = data.safeMode !== false; // Default to true if not set
        updateToggleState();
    });

    toggle.addEventListener('click', () => {
        safeMode = !safeMode;
        browserAPI.storage.local.set({ safeMode });
        updateToggleState();
    });

    toggleContainer.addEventListener('mouseenter', () => {
        tooltip.style.visibility = 'visible';
        tooltip.style.opacity = '1';
    });

    toggleContainer.addEventListener('mouseleave', () => {
        tooltip.style.visibility = 'hidden';
        tooltip.style.opacity = '0';
    });

    toggleContainer.appendChild(toggle);
    toggleContainer.appendChild(label);
    toggleContainer.appendChild(tooltip);

    return toggleContainer;
}

const safeModeStyles = `
    .safe-mode-toggle {
        position: relative;
        margin-bottom: 10px;
    }
    .mode-toggle-button:focus {
        outline: none;
        box-shadow: 0 0 0 2px rgba(0,0,0,0.1);
    }
`;
document.head.appendChild(document.createElement('style')).textContent += safeModeStyles;

const highlightStyles = `
    #warning-icons-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1000;
    }

    #warning-icons-overlay > * {
        pointer-events: auto;
    }

    .observation-warning-icon {
        position: fixed;
        width: 24px;
        height: 24px;
        background-color: white !important;
        border-radius: 50%;
        padding: 2px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        cursor: help;
        isolation: isolate !important;
        contain: paint !important;
        opacity: 1 !important;
        transform: translateZ(0) !important;
        z-index: 1000;
    }

    #active-tooltip {
        position: fixed;
        background-color: white !important;
        border: 1px solid #E5E7EB;
        border-radius: 6px;
        padding: 8px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        z-index: 1001;
        font-size: 11px;
        pointer-events: none;
        width: 200px;
        display: none;
    }

    .tooltip-header {
        font-weight: 600 !important;
        color: #1F2937 !important;
        margin-bottom: 8px !important;
        padding-bottom: 4px !important;
        border-bottom: 1px solid #E5E7EB !important;
        display: block !important;
    }

    .tooltip-field {
        margin-bottom: 8px !important;
        display: block !important;
    }

    .tooltip-field:last-child {
        margin-bottom: 0;
    }

    .tooltip-field-name {
        font-weight: 500 !important;
        color: #4B5563 !important;
        margin-bottom: 2px !important;
        display: block !important;
    }

    .tooltip-value {
        padding-left: 4px !important;
        display: block !important;
    }

    .tooltip-current {
        color: #4B5563 !important;
        display: block !important;
    }

    .tooltip-proposed {
        color: #DC2626 !important;
        display: block !important;
        font-weight: 500 !important;
    }
`;


function highlightObservationsWithExistingValues(observationsWithValues, selectedAction, reset = false) {
    document.getElementById('warning-icons-overlay')?.remove();
    document.getElementById('active-tooltip')?.remove();

    if (reset) return;

    // Create tooltip element
    const activeTooltip = document.createElement('div');
    activeTooltip.id = 'active-tooltip';
    document.body.appendChild(activeTooltip);

    const overlay = document.createElement('div');
    overlay.id = 'warning-icons-overlay';
    document.body.appendChild(overlay);

    function updateIconPositions() {
        overlay.querySelectorAll('.observation-warning-icon').forEach(icon => {
            const observationId = icon.dataset.observationId;
            const observationElement = document.querySelector(
                `.ObservationsGridItem a[href$="/observations/${observationId}"]`
            )?.closest('.ObservationsGridItem');
            
            if (observationElement) {
                const rect = observationElement.getBoundingClientRect();
                icon.style.top = `${rect.top + 8}px`;
                icon.style.left = `${rect.right - 32}px`;
            }
        });
    }

    observationsWithValues.forEach(({ observationId, fieldValues }) => {
        const observationElement = document.querySelector(
            `.ObservationsGridItem a[href$="/observations/${observationId}"]`
        )?.closest('.ObservationsGridItem');

        if (observationElement) {
            const rect = observationElement.getBoundingClientRect();
            
            const warningIcon = document.createElement('div');
            warningIcon.className = 'observation-warning-icon';
            warningIcon.innerHTML = createWarningIcon();
            warningIcon.dataset.observationId = observationId;
            warningIcon.style.top = `${rect.top + 8}px`;
            warningIcon.style.left = `${rect.right - 32}px`;
            
            // Store field values data on the icon
            warningIcon.dataset.fieldValues = JSON.stringify(fieldValues);
            
            warningIcon.addEventListener('mouseenter', async (e) => {
                const iconRect = e.target.getBoundingClientRect();
                const windowWidth = window.innerWidth;
                const tooltipWidth = 200;

                // Update tooltip content
                activeTooltip.innerHTML = await createTooltipContent(fieldValues, selectedAction);

                // Position tooltip
                if (iconRect.left < tooltipWidth + 40) {
                    activeTooltip.style.left = `${iconRect.right + 8}px`;
                    activeTooltip.style.transform = 'none';
                } else {
                    activeTooltip.style.left = `${iconRect.left - 8}px`;
                    activeTooltip.style.transform = 'translateX(-100%)';
                }
                activeTooltip.style.top = `${iconRect.top}px`;
                
                // Show tooltip
                activeTooltip.style.display = 'block';
            });

            warningIcon.addEventListener('mouseleave', () => {
                activeTooltip.style.display = 'none';
            });
            
            overlay.appendChild(warningIcon);
        }
    });

    window.addEventListener('scroll', updateIconPositions, { passive: true });
    window.addEventListener('resize', updateIconPositions, { passive: true });
}

// Add styles to document
const styleSheet = document.createElement('style');
styleSheet.textContent = highlightStyles;
document.head.appendChild(styleSheet);

function createWarningIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FF4444" stroke="#FF0000" stroke-width="1.5">
        <path d="M12 3L3 21h18L12 3z" />  /* Adjusted triangle to fit better */
        <path d="M12 9v6" stroke="white" stroke-width="2" />
        <circle cx="12" cy="17.5" r="1" fill="white" />
    </svg>`;
}

async function createTooltipContent(fieldValues, selectedAction) {
    let content = `
        <div class="tooltip-header">Field Values Will Change</div>
    `;
    
    for (const [fieldName, values] of Object.entries(fieldValues)) {
        // For the proposed value, get it from the action which has displayValue
        const matchingAction = selectedAction.actions.find(a => 
            a.type === 'observationField' && a.fieldName === fieldName
        );
        const proposedDisplay = matchingAction ? 
            (matchingAction.displayValue || matchingAction.fieldValue) : 
            values.proposed;

        // For current value, if it's a number (likely a taxon ID), look it up
        let currentDisplay = values.current;
        if (!isNaN(values.current)) {
            try {
                const taxonData = await lookupTaxon(values.current, 1);
                if (taxonData && taxonData[0]) {
                    currentDisplay = taxonData[0].preferred_common_name ? 
                        `${taxonData[0].preferred_common_name} (${taxonData[0].name})` : 
                        taxonData[0].name;
                }
            } catch (error) {
                console.error('Error looking up taxon:', error);
            }
        }

        content += `
            <div class="tooltip-field">
                <div class="tooltip-field-name">${fieldName}</div>
                <div class="tooltip-value">
                    <span class="tooltip-current">Current: "${currentDisplay}"</span>
                    <span class="tooltip-proposed">Will change to: "${proposedDisplay}"</span>
                </div>
            </div>
        `;
    }
    
    return content;
}

function toggleObservationSelection(element, selected) {
    if (selected) {
        element.classList.add('observation-selected');
    } else {
        element.classList.remove('observation-selected');
    }
}

// Helper function to handle z-index when both highlights are present
function updateHighlightZIndex(element) {
    const hasExistingValues = element.classList.contains('observation-existing-values');
    const isSelected = element.classList.contains('observation-selected');
    
    if (hasExistingValues && isSelected) {
        const warningIcon = element.querySelector('.observation-warning-icon');
        if (warningIcon) {
            warningIcon.style.zIndex = '1002';
        }
    }
}

async function validateBulkAction(selectedAction, observationIds, getIsCancelled) {
    console.log('Starting validateBulkAction with:', {selectedAction, observationIds});
    const results = {
        total: observationIds.length,
        toProcess: [],
        toSkip: [], // Primarily for Safe Mode
        fieldNames: new Map(),
        existingValues: new Map(), // In Overwrite Mode, this will store actual *differing* values
        proposedValues: new Map()
    };

    if (getIsCancelled && getIsCancelled()) {
        console.log("validateBulkAction: Operation cancelled at the very beginning.");
        throw new Error('ValidationCancelled');
    }

    const { safeMode = true } = await new Promise(resolve =>
        browserAPI.storage.local.get('safeMode', resolve)
    );

    selectedAction.actions.forEach(action => {
        if (action.type === 'observationField') {
            results.fieldNames.set(action.fieldId, action.fieldName);
            // Store both the raw value and display value for proposed
            results.proposedValues.set(action.fieldId, {
                value: action.fieldValue, 
                displayValue: action.displayValue || action.fieldValue 
            });
        }
    });

    for (const observationId of observationIds) {
        if (getIsCancelled && getIsCancelled()) {
            console.log("validateBulkAction: Operation cancelled. Aborting validation loop for observationId:", observationId);
            throw new Error('ValidationCancelled');
        }

        let wouldOverwriteInSafeMode = false;
        const differingExistingFieldsForOverwriteMode = new Map(); // Store { fieldId: {current: X, proposed: Y} }

        for (const action of selectedAction.actions) {
            if (getIsCancelled && getIsCancelled()) {
                console.log("validateBulkAction: Operation cancelled during field check for observationId:", observationId);
                throw new Error('ValidationCancelled');
            }
            if (action.type === 'observationField') {
                try {
                    const existingValueDetails = await getFieldValueDetails(observationId, action.fieldId);
                    console.log(`VALIDATE_ACTION: Obs ${observationId}, Field ${action.fieldId}, existingValueDetails from getFieldValueDetails:`, 
                        existingValueDetails ? JSON.parse(JSON.stringify(existingValueDetails)) : null); 
                    const proposed = results.proposedValues.get(action.fieldId); // {value, displayValue}

                    if (existingValueDetails) { // Field exists on observation
                        wouldOverwriteInSafeMode = true; // For Safe Mode, any existing value is a reason to skip

                        if (!safeMode) { // In Overwrite Mode, check if values actually differ
                            const currentValue = existingValueDetails.displayValue || existingValueDetails.value;
                            const proposedDisplay = proposed.displayValue;
                            
                            let isIdentical = false;
                            if (existingValueDetails.displayValue) { // Existing is resolved taxon
                                isIdentical = existingValueDetails.displayValue === proposed.displayValue;
                            } else { // Existing is raw value or non-taxon
                                isIdentical = existingValueDetails.value === proposed.value;
                                if (!isIdentical && typeof existingValueDetails.value === 'number' && typeof proposed.value === 'string' && existingValueDetails.value.toString() === proposed.value) {
                                    isIdentical = true; // Taxon ID match
                                }
                            }

                            if (!isIdentical) {
                                let currentDisplayForModal = existingValueDetails.displayValue || existingValueDetails.value;
                                // --- NEW LOGS ---
                                console.log(`VALIDATE_ACTION: Obs ${observationId}, Field ${action.fieldId}: Initial currentDisplayForModal:`, currentDisplayForModal, `(Type: ${typeof currentDisplayForModal})`);
                                // --- END NEW LOGS ---
    
                                if (typeof currentDisplayForModal === 'object' && currentDisplayForModal !== null) {
                                    currentDisplayForModal = JSON.stringify(currentDisplayForModal); 
                                    console.warn(`VALIDATE_ACTION: Field ${action.fieldName} (ID: ${action.fieldId}) for obs ${observationId} had an object as current value. Stringified to: ${currentDisplayForModal}`);
                                }
    
                                // --- NEW LOGS ---
                                console.log(`VALIDATE_ACTION: Obs ${observationId}, Field ${action.fieldId}: Final current for modal storage:`, String(currentDisplayForModal));
                                console.log(`VALIDATE_ACTION: Obs ${observationId}, Field ${action.fieldId}: Final proposed for modal storage:`, String(proposed.displayValue));
                                // --- END NEW LOGS ---
    
                                differingExistingFieldsForOverwriteMode.set(action.fieldId, {
                                    current: String(currentDisplayForModal), 
                                    proposed: String(proposed.displayValue) 
                                });
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error checking field values for observation ${observationId}, field ${action.fieldId}:`, error);
                }
            }
        }

        if (safeMode) {
            if (wouldOverwriteInSafeMode) {
                // In Safe Mode, we need to gather all existing fields that would be part of the action
                const existingFieldsForSkipMessage = new Map();
                 for (const action of selectedAction.actions) {
                    if (action.type === 'observationField') {
                        const evd = await getFieldValueDetails(observationId, action.fieldId);
                        if (evd) {
                            existingFieldsForSkipMessage.set(action.fieldId, evd.displayValue || evd.value);
                        }
                    }
                }
                results.toSkip.push({ 
                    observationId, 
                    existingFields: Object.fromEntries(existingFieldsForSkipMessage)
                });
            } else {
                results.toProcess.push(observationId);
            }
        } else { // Overwrite Mode
            results.toProcess.push(observationId); // Always process in overwrite mode
            if (differingExistingFieldsForOverwriteMode.size > 0) {
                // Store the fields that will actually change
                results.existingValues.set(observationId, {
                    observationId,
                    existingFields: Object.fromEntries(differingExistingFieldsForOverwriteMode)
                });
            }
        }
    }
    
    if (getIsCancelled && getIsCancelled()) {
        console.log("validateBulkAction: Operation cancelled just before returning results.");
        throw new Error('ValidationCancelled');
    }

    console.log("validateBulkAction finished. Results:", JSON.parse(JSON.stringify(results))); // Deep copy for logging complex map
    return results;
}


async function createValidationSummary(validationResults) {
    const { safeMode = true } = await new Promise(resolve => 
        browserAPI.storage.local.get('safeMode', resolve)
    );

    let summary = '<div style="margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px;">';
    
    const hasExistingValues = validationResults.toSkip.length > 0 || validationResults.existingValues.size > 0;
    
    if (hasExistingValues) {
        if (safeMode) {
            summary += `
                <p><strong>Safe Mode is ON</strong></p>
                <p>Will process: ${validationResults.toProcess.length} observation(s)</p>
                <p>Will skip: ${validationResults.toSkip.length} observation(s) with existing values</p>
            `;

            if (validationResults.toSkip.length <= 10) {
                summary += '<div style="margin-top: 10px;"><strong>Observations to skip:</strong><ul>';
                validationResults.toSkip.forEach(({ observationId, existingFields }) => {
                    const fieldsList = Object.entries(existingFields)
                        .map(([fieldId, value]) => {
                            const fieldName = validationResults.fieldNames.get(fieldId);
                            const newValue = validationResults.proposedValues?.get(fieldId);
                            return `${fieldName}: "${value}" (would be "${newValue}")`;
                        })
                        .join(', ');
                    summary += `<li>Observation ${observationId}: ${fieldsList}</li>`;
                });
                summary += '</ul></div>';
            }
        } else {
            summary += `
                <p><strong>Overwrite Mode is ON</strong></p>
                <p style="color: red;">Warning: This will overwrite existing values in ${validationResults.existingValues.size} observation(s)</p>
                <p>Total observations to process: ${validationResults.total}</p>
            `;

            if (validationResults.existingValues.size <= 10) {
                summary += '<div style="margin-top: 10px;"><strong>Values that will be overwritten:</strong><ul>';
                for (const [observationId, info] of validationResults.existingValues) {
                    const fieldsList = Object.entries(info.existingFields)
                        .map(([fieldId, value]) => {
                            const fieldName = validationResults.fieldNames.get(fieldId);
                            const newValue = validationResults.proposedValues?.get(fieldId);
                            return `${fieldName}: "${value}" → "${newValue}"`;
                        })
                        .join(', ');
                    summary += `<li>Observation ${observationId}: ${fieldsList}</li>`;
                }
                summary += '</ul></div>';
            }
        }
    } else {
        summary += `
            <p>All ${validationResults.total} selected observation(s) will be processed.</p>
            <p>No existing values found.</p>
        `;
    }
    
    summary += '</div>';
    return summary;
}

async function createActionModal(preSelectedActionId = null) {
    let isActionCancelled = false;
    window.isBulkActionSelectionModalOpen = true; 

    const modal = document.createElement('div');
    modal.id = 'bulk-action-selection-modal'; 
    // ... (modal styling, title, controlsContainer, sortButtonContainer, actionSelect ...)
    modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: white;
        padding: 20px;
        border-radius: 5px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 20001;
        max-width: 80%;
        min-width: 400px; 
        max-height: 80%;
        overflow-y: auto;
    `;
    
    const title = document.createElement('h2');
    title.id = 'action-selection-title';
    title.textContent = `Select Action for ${selectedObservations.size} Observations`;
    modal.appendChild(title);

    const controlsContainer = document.createElement('div');
    controlsContainer.style.cssText = `
        display: flex; 
        justify-content: space-between; 
        align-items: center; 
        margin-bottom: 5px;
        position: relative;
    `;

    const actionSelectLabel = document.createElement('label');
    actionSelectLabel.textContent = "Action:";
    actionSelectLabel.htmlFor = 'bulk-action-select';
    controlsContainer.appendChild(actionSelectLabel);

    const sortButtonContainer = document.createElement('div');
    sortButtonContainer.style.position = 'relative';

    const sortButton = document.createElement('button');
    sortButton.id = 'bulk-action-sort-button';
    sortButton.title = 'Change action sort order';
    sortButton.style.cssText = `
        padding: 4px 8px; 
        font-size: 12px; 
        background-color: #f0f0f0; 
        border: 1px solid #ccc;
        border-radius: 3px;
        cursor: pointer;
        display: flex;
        align-items: center;
    `;
    const sortButtonTextSpan = document.createElement('span');
    sortButton.appendChild(sortButtonTextSpan);
    const sortDropdownArrow = document.createElement('span');
    sortDropdownArrow.innerHTML = ' ▾'; 
    sortDropdownArrow.style.marginLeft = '5px';
    sortButton.appendChild(sortDropdownArrow);
    sortButtonContainer.appendChild(sortButton);

    const sortOptionsDropdown = document.createElement('div');
    sortOptionsDropdown.id = 'bulk-action-sort-options-dropdown';
    sortOptionsDropdown.style.cssText = `
        display: none;
        position: absolute;
        top: 100%; 
        right: 0; 
        background-color: white;
        border: 1px solid #ccc;
        border-radius: 3px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        z-index: 20002; 
        min-width: 120px;
    `;
    const sortOptions = [
        { label: 'Sort: Default', method: 'default' },
        { label: 'Sort: A-Z', method: 'az' },
        { label: 'Sort: Z-A', method: 'za' }
    ];
    sortOptions.forEach(opt => {
        const optionButton = document.createElement('button');
        optionButton.textContent = opt.label;
        optionButton.dataset.sortMethod = opt.method;
        optionButton.style.cssText = `
            display: block;
            width: 100%;
            padding: 6px 10px;
            text-align: left;
            background: none;
            border: none;
            cursor: pointer;
            font-size: 12px;
        `;
        optionButton.onmouseover = () => optionButton.style.backgroundColor = '#f0f0f0';
        optionButton.onmouseout = () => optionButton.style.backgroundColor = 'white';
        optionButton.onclick = () => {
            populateDropdownWithOptions(opt.method);
            browserAPI.storage.local.set({ bulkActionDropdownSortPreference: opt.method });
            sortOptionsDropdown.style.display = 'none';
        };
        sortOptionsDropdown.appendChild(optionButton);
    });
    sortButtonContainer.appendChild(sortOptionsDropdown);
    controlsContainer.appendChild(sortButtonContainer);
    modal.appendChild(controlsContainer);

    const actionSelect = document.createElement('select');
    actionSelect.id = 'bulk-action-select';
    actionSelect.style.cssText = `
        width: 100%;
        padding: 8px;
        margin-top: 0; 
        margin-bottom: 10px;
        border-radius: 4px;
        border: 1px solid #ccc;
    `;
    modal.appendChild(actionSelect); 

    const descriptionArea = document.createElement('p');
    descriptionArea.id = 'action-description';
    descriptionArea.style.marginBottom = '10px';
    modal.appendChild(descriptionArea);

    const buttonContainerElement = document.createElement('div');
    buttonContainerElement.style.cssText = `
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
    `;

    const applyButtonElement = document.createElement('button'); 
    applyButtonElement.textContent = 'Apply Action';
    applyButtonElement.classList.add('modal-button');
    applyButtonElement.style.marginRight = '10px';
    applyButtonElement.disabled = true; 

    const cancelButtonElement = document.createElement('button');
    cancelButtonElement.textContent = 'Cancel';
    cancelButtonElement.classList.add('modal-button');

    buttonContainerElement.appendChild(cancelButtonElement);
    buttonContainerElement.appendChild(applyButtonElement);
    modal.appendChild(buttonContainerElement);
    
    let currentSortMethod = 'default'; 
    const populateDropdownWithOptions = (sortPref) => {
        const selectedValueBeforeSort = actionSelect.value; 
        actionSelect.innerHTML = ''; 
        const defaultOptionElement = document.createElement('option');
        defaultOptionElement.value = "";
        defaultOptionElement.textContent = "Select an action";
        defaultOptionElement.disabled = true;
        actionSelect.appendChild(defaultOptionElement);

        const actionsToDisplay = sortAvailableActions(currentAvailableActions, sortPref);

        actionsToDisplay.forEach(buttonConfig => {
            const option = document.createElement('option');
            option.value = buttonConfig.id;
            option.textContent = buttonConfig.name;
            actionSelect.appendChild(option);
        });
        
        if (actionsToDisplay.some(a => a.id === selectedValueBeforeSort)) {
            actionSelect.value = selectedValueBeforeSort;
        } else {
            actionSelect.value = ""; 
        }
        
        const currentSelectedActionInDropdown = currentAvailableActions.find(bc => bc.id === actionSelect.value);
        if (currentSelectedActionInDropdown) {
            updateActionDescription(actionSelect); 
            applyButtonElement.disabled = false;
        } else {
            descriptionArea.innerHTML = 'No action selected.';
            applyButtonElement.disabled = true;
        }

        const selectedSortOption = sortOptions.find(opt => opt.method === sortPref);
        sortButtonTextSpan.textContent = selectedSortOption ? selectedSortOption.label : 'Sort';
        currentSortMethod = sortPref; 
    };

    (async () => {
        const storedSortPrefData = await browserAPI.storage.local.get('bulkActionDropdownSortPreference');
        currentSortMethod = storedSortPrefData.bulkActionDropdownSortPreference || 'default';
        populateDropdownWithOptions(currentSortMethod);

        // If a pre-selected action was specified, select it now
        if (preSelectedActionId) {
            actionSelect.value = preSelectedActionId;
            actionSelect.dispatchEvent(new Event('change'));
            console.log(`Pre-selected action in dropdown: ${preSelectedActionId}`);
        } else if(actionSelect.value) {
            actionSelect.dispatchEvent(new Event('change'));
        } else {
            descriptionArea.innerHTML = 'No action selected.';
            applyButtonElement.disabled = true;
        }
    })();

    document.body.appendChild(modal); 

    actionSelect.onchange = () => {
        const selectedActionFromDropdown = currentAvailableActions.find(buttonConfig => buttonConfig.id === actionSelect.value);
        if (selectedActionFromDropdown) {
            updateActionDescription(actionSelect);
            applyButtonElement.disabled = false;
        } else {
            descriptionArea.innerHTML = 'No action selected.';
            applyButtonElement.disabled = true;
        }
    };

    sortButton.onclick = (e) => {
        e.stopPropagation(); 
        sortOptionsDropdown.style.display = sortOptionsDropdown.style.display === 'none' ? 'block' : 'none';
    };
    
    const closeSortDropdownOnClickOutside = (e) => {
        if (sortButtonContainer && sortOptionsDropdown && !sortButtonContainer.contains(e.target) && sortOptionsDropdown.style.display === 'block') {
            sortOptionsDropdown.style.display = 'none';
        }
    };
    // Define removeThisModal BEFORE it's used in handleModalKeys or button clicks
    const removeThisModal = (isCancelledByUser = false) => {
        window.isBulkActionSelectionModalOpen = false; 
        document.removeEventListener('click', closeSortDropdownOnClickOutside, true);
        document.removeEventListener('keydown', handleModalKeys); // Ensure this specific listener is removed
        if (isCancelledByUser) {
            console.log("Action selection modal process is being explicitly cancelled by user flag.");
        }
        highlightObservationsWithExistingValues([], null, true); 
        if (modal.parentNode === document.body) {
            document.body.removeChild(modal);
        } else {
            console.warn("removeThisModal called, but modal was not a child of document.body or already removed.");
        }
    };


    const handleModalKeys = (event) => {
        if (!document.body.contains(modal) || modal.style.display === 'none') {
            removeThisModal(); // Clean up if modal somehow got removed externally
            return;
        }

        if (event.key === 'Enter') {
            // --- MODIFIED: Check actionSelect.value directly and button state ---
            if (actionSelect.value && actionSelect.value !== "" && !applyButtonElement.disabled) {
                event.preventDefault();
                applyButtonElement.click();
            } else {
                console.log("Enter pressed in action modal, but no action selected or apply button disabled.");
                // Optionally, add a visual cue like shaking the modal or focusing the select
            }
        } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelButtonElement.click(); // This will call removeThisModal
        }
    };
    document.addEventListener('keydown', handleModalKeys);


    applyButtonElement.onclick = async () => {
        const selectedAction = currentAvailableActions.find(buttonConfig => buttonConfig.id === actionSelect.value);
        // --- ADDED: Guard against no selected action ---
        if (!selectedAction) {
            console.warn("Apply button clicked, but no action is selected in the dropdown.");
            // Optionally, briefly highlight the dropdown or show a small message
            descriptionArea.innerHTML = '<span style="color:red;">Please select an action first.</span>';
            setTimeout(() => {
                if (actionSelect.value === "") descriptionArea.innerHTML = 'No action selected.';
            }, 2000);
            return;
        }
        // --- END ADDED ---

        if (isActionCancelled) { 
            removeThisModal(true); 
            return;
        }
        
        // No need to remove handleModalKeys here, removeThisModal will do it.
        applyButtonElement.textContent = 'Validating...';
        applyButtonElement.disabled = true;
        cancelButtonElement.disabled = true; 
        
        let validationResults;
        try {
            const { safeMode = true } = await browserAPI.storage.local.get('safeMode');
            const observationIds = Array.from(selectedObservations);
            
            validationResults = await validateBulkAction(selectedAction, observationIds, () => isActionCancelled);

            if (isActionCancelled) { 
                removeThisModal(true);
                return;
            }
            
            removeThisModal(false); 

            let hasConflictsOrSkipsToShow = false;
            if (safeMode) {
                if (validationResults.toSkip.length > 0) hasConflictsOrSkipsToShow = true;
            } else { 
                if (validationResults.existingValues.size > 0) hasConflictsOrSkipsToShow = true;
            }

            if (!hasConflictsOrSkipsToShow) {
                highlightObservationsWithExistingValues([], null, true);
                const progressModal = createProgressModal();
                document.body.appendChild(progressModal);
                await executeBulkAction(selectedAction, progressModal, () => false); 
                return; 
            }
            
            const observationsToHighlight = safeMode ?
                 validationResults.toSkip.map(item => ({
                    observationId: item.observationId,
                    fieldValues: Object.fromEntries(
                        Object.entries(item.existingFields || {}).map(([fieldId, value]) => [ 
                            validationResults.fieldNames.get(fieldId),
                            { current: value, proposed: validationResults.proposedValues.get(fieldId) }
                        ])
                    )
                })) :
                Array.from(validationResults.existingValues.entries()).map(([observationId, info]) => ({
                    observationId,
                    fieldValues: Object.fromEntries(
                        Object.entries(info.existingFields || {}).map(([fieldId, valueDetails]) => [ 
                            validationResults.fieldNames.get(fieldId),
                            { current: valueDetails.current, proposed: valueDetails.proposed }
                        ])
                    )
                }));

            highlightObservationsWithExistingValues(observationsToHighlight, selectedAction);

            const validationModal = await createValidationModal(
                validationResults, selectedAction,
                async () => { 
                    highlightObservationsWithExistingValues([], null, true);
                    const progressModal = createProgressModal();
                    document.body.appendChild(progressModal);
                    await executeBulkAction(selectedAction, progressModal, () => false);
                },
                () => { 
                    highlightObservationsWithExistingValues([], null, true);
                    console.log('Validation confirmation cancelled');
                }
            );
            document.body.appendChild(validationModal);

        } catch (error) {
            if (error.message === 'ValidationCancelled') {
                removeThisModal(true); 
            } else {
                console.error('Error in bulk action apply process:', error);
                alert(`Error: ${error.message}`);
                if (document.body.contains(modal)) { // Check if modal still exists before trying to reset buttons
                    applyButtonElement.textContent = 'Apply Action';
                    if (actionSelect.value) applyButtonElement.disabled = false;
                    cancelButtonElement.disabled = false;
                }
                removeThisModal(false); 
            }
        }
    };

    cancelButtonElement.onclick = () => {
        isActionCancelled = true; 
        removeThisModal(true);
    };

    return modal;
}

/**
 * Apply bulk action from keyboard shortcut
 * Opens the action modal with the specified action pre-selected
 * @param {Object} buttonConfig - The button configuration for the action to apply
 */
async function applyBulkActionFromShortcut(buttonConfig) {
    console.log(`Bulk action shortcut triggered for: ${buttonConfig.name}`);

    // Check if observations are selected
    if (selectedObservations.size === 0) {
        alert('Please select at least one observation first.');
        return;
    }

    // Check if a modal is already open
    if (window.isBulkActionSelectionModalOpen === true) {
        console.warn("A modal is already open. Ignoring shortcut.");
        return;
    }

    try {
        // Create and open the modal with the action pre-selected
        const modalNode = await createActionModal(buttonConfig.id);

        if (modalNode && document.body.contains(modalNode)) {
            console.log(`Modal opened with pre-selected action: ${buttonConfig.name}`);
        } else {
            console.error("Modal creation failed");
            window.isBulkActionSelectionModalOpen = false;
        }
    } catch (error) {
        console.error("Error opening modal from shortcut:", error);
        window.isBulkActionSelectionModalOpen = false;
        alert("An error occurred while trying to open the action dialog. Please check the console.");
    }
}

async function createValidationModal(validationResults, selectedAction, onConfirm, onCancel) {
    const { safeMode = true } = await new Promise(resolve => 
        browserAPI.storage.local.get('safeMode', resolve)
    );

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
        z-index: 20001;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        max-width: 80%;
        max-height: 80%;
        overflow-y: auto;
        position: relative;
    `;

    const title = document.createElement('h2');
    title.textContent = 'Action Validation';
    title.style.marginTop = '0';
    content.appendChild(title);

    // Add action description at the top
    const actionDescription = document.createElement('div');
    actionDescription.style.cssText = `
        margin-bottom: 20px;
        padding: 15px;
        background: #f8f9fa;
        border-radius: 8px;
        border: 1px solid #e9ecef;
    `;

    actionDescription.innerHTML = `
        <h3 style="margin-top: 0; margin-bottom: 10px; color: #1a73e8;">
            Action: ${selectedAction.name}
        </h3>
        <div style="color: #202124;">
            ${selectedAction.actions.map(action => {
                let actionDesc = '';
                switch(action.type) {
                    case 'reviewed':
                        actionDesc = `Mark the observation as ${action.reviewed === 'mark' ? 'reviewed' : 'unreviewed'}`;
                        break;
                    case 'follow':
                        actionDesc = `${action.follow === 'follow' ? 'Follow' : 'Unfollow'} the observation`;
                        break;
                    case 'withdrawId':
                        actionDesc = `Withdraw your current identification`;
                        break;
                    case 'observationField':
                        const displayValue = action.displayValue || action.fieldValue;
                        actionDesc = `Set field "${action.fieldName}" to "${displayValue}"`;
                        break;
                    case 'annotation':
                        // Find the field name by ID
                        let annotationFieldName = getAnnotationFieldName(action.annotationField); // Ensure getAnnotationFieldName is available
                        let annotationValueName = getAnnotationValueName(action.annotationField, action.annotationValue); // Ensure getAnnotationValueName is available
                        actionDesc = `Add annotation: ${annotationFieldName} = ${annotationValueName}`;
                        break;
                    case 'addToProject':
                        actionDesc = `${action.remove ? 'Remove from' : 'Add to'} project: ${action.projectName}`;
                        break;
                    case 'addComment':
                        actionDesc = `Add comment: "${action.commentBody.substring(0, 50)}${action.commentBody.length > 50 ? '...' : ''}"`;
                        break;
                    case 'addTaxonId':
                        actionDesc = `Add taxon ID: ${action.taxonName}`;
                        break;
                    case 'qualityMetric':
                        const metricName = getQualityMetricName(action.metric); // Ensure getQualityMetricName is available
                        actionDesc = `Set quality metric: ${metricName} to ${action.vote}`;
                        break;
                    case 'copyObservationField':
                        actionDesc = `Copy field: "${action.sourceFieldName}" to "${action.targetFieldName}"`;
                        break;
                }
                return actionDesc ? `
                    <div style="margin: 8px 0; padding-left: 20px; position: relative;">
                        <span style="position: absolute; left: 8px; color: #1a73e8;">•</span>
                        ${actionDesc}
                    </div>` : '';
            }).join('')}
        </div>
    `;
    content.appendChild(actionDescription);

    const summary = document.createElement('div');
    summary.style.marginBottom = '20px';

    if (validationResults.toSkip.length > 0 || validationResults.existingValues.size > 0) {
        if (safeMode) {
            summary.innerHTML = `
                <p><strong>Safe Mode is ON</strong></p>
                <p>${validationResults.toProcess.length} observations will be processed</p>
                <p>${validationResults.toSkip.length} observations will be skipped due to existing values:</p>
            `;

            if (validationResults.toSkip.length > 0) {
                const skipList = document.createElement('div');
                skipList.style.cssText = `
                    max-height: 200px;
                    overflow-y: auto;
                    border: 1px solid #ccc;
                    padding: 10px;
                    margin: 10px 0;
                    background: #fff3e0;
                    border-radius: 4px;
                `;

                validationResults.toSkip.forEach(({ observationId, existingFields }) => {
                    const item = document.createElement('div');
                    item.style.marginBottom = '10px';
                    item.innerHTML = `
                        <a href="https://www.inaturalist.org/observations/${observationId}" 
                           target="_blank" 
                           style="color: #0077cc;">
                            Observation ${observationId}
                        </a>:
                        <ul style="margin: 5px 0; padding-left: 20px;">
                    `;
                    
                    Object.entries(existingFields).forEach(([fieldId, value]) => {
                        const fieldName = validationResults.fieldNames.get(fieldId);
                        const actionItemForField = selectedAction.actions.find(
                            act => act.type === 'observationField' && act.fieldId === fieldId
                        );
                        const proposedDisplayValue = (actionItemForField && actionItemForField.displayValue) ? 
                                                      actionItemForField.displayValue : 
                                                      validationResults.proposedValues.get(fieldId);
                        item.innerHTML += `
                            <li>${fieldName}: 
                                <span style="color: #666;">"${value}"</span>
                                <span style="color: #999;"> (would be set to </span>
                                <span style="color: #666;">"${proposedDisplayValue}"</span>
                                <span style="color: #999;">)</span>
                            </li>
                        `;
                    });
                    
                    item.innerHTML += '</ul>';
                    skipList.appendChild(item);
                });

                summary.appendChild(skipList);
            }

            if (validationResults.toProcess.length === 0) {
                summary.innerHTML += `
                    <p style="color: red; margin-top: 10px;">
                        No observations will be processed. All selected observations have existing values.
                    </p>
                `;
            }
        } else { // Overwrite Mode
            summary.innerHTML = `
                <p><strong>Overwrite Mode is ON</strong></p>
                <p style="color: red;">Warning: This will overwrite existing values in ${validationResults.existingValues.size} observations:</p>
            `;

            const overwriteList = document.createElement('div');
            overwriteList.style.cssText = `
                max-height: 200px;
                overflow-y: auto;
                border: 1px solid #ccc;
                padding: 10px;
                margin: 10px 0;
                background: #ffebee;
                border-radius: 4px;
            `;

            for (const [observationId, info] of validationResults.existingValues) { // info is { observationId, existingFields }
                const item = document.createElement('div');
                item.style.marginBottom = '10px';
                item.innerHTML = `
                    <a href="https://www.inaturalist.org/observations/${observationId}" 
                       target="_blank" 
                       style="color: #0077cc;">
                        Observation ${observationId}
                    </a>:
                    <ul style="margin: 5px 0; padding-left: 20px;">
                `;
                
                Object.entries(info.existingFields).forEach(([fieldId, valueDetails]) => { // valueDetails is {current, proposed}
                    const fieldName = validationResults.fieldNames.get(fieldId); // fieldId here is the key from info.existingFields

                    // --- NEW LOG ---
                    console.log(`CREATE_VALIDATION_MODAL: Obs ${observationId}, Field ID ${fieldId} (${fieldName || 'Unknown Name'}), valueDetails.current:`, 
                        valueDetails.current, 
                        `(Type: ${typeof valueDetails.current})`);
                    console.log(`CREATE_VALIDATION_MODAL: Obs ${observationId}, Field ID ${fieldId} (${fieldName || 'Unknown Name'}), valueDetails.proposed:`,
                        valueDetails.proposed,
                        `(Type: ${typeof valueDetails.proposed})`);
                    // --- END NEW LOG ---
                    
                    item.innerHTML += `
                        <li>${fieldName || `Field ID ${fieldId}`}: 
                            <span style="color: #666;">"${String(valueDetails.current)}"</span> 
                            <span style="color: #999;"> → </span>
                            <span style="color: #666;">"${String(valueDetails.proposed)}"</span>
                        </li>
                    `;
                });
                
                item.innerHTML += '</ul>';
                overwriteList.appendChild(item);
            }

            summary.appendChild(overwriteList);
            summary.innerHTML += `<p>Total observations to process: ${validationResults.total}</p>`;
        }
    } else {
        summary.innerHTML = `
            <p>All ${validationResults.total} selected observation(s) will be processed.</p>
            <p>No existing values found that would conflict with this action.</p>
        `;
    }

    content.appendChild(summary);

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
    `;

    const confirmButton = document.createElement('button');
    confirmButton.textContent = 'Proceed';
    confirmButton.className = 'bulk-action-button';
    
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'bulk-action-button';

    // --- NEW: Keydown event listener for Enter key ---
    const handleEnterKey = (event) => {
        if (event.key === 'Enter') {
            if (confirmButton.disabled) {
                console.log("Enter pressed, but Proceed button is disabled.");
                return;
            }
            event.preventDefault();
            confirmButton.click();
        } else if (event.key === 'Escape') { // Optional: Allow Escape to cancel
             event.preventDefault();
             cancelButton.click();
        }
    };
    // Add listener to the document when modal is active.
    // We attach to document because the modal itself might not always have focus.
    document.addEventListener('keydown', handleEnterKey);
    // --- END NEW ---

    confirmButton.onclick = () => {
        document.removeEventListener('keydown', handleEnterKey); // --- NEW: Remove listener ---
        if (modal.parentNode) document.body.removeChild(modal);
        onConfirm();
    };

    cancelButton.onclick = () => {
        document.removeEventListener('keydown', handleEnterKey); // --- NEW: Remove listener ---
        if (modal.parentNode) document.body.removeChild(modal);
        onCancel();
    };

    // Disable confirm button if no observations will be processed
    if (safeMode && validationResults.toProcess.length === 0) {
        confirmButton.disabled = true;
        confirmButton.title = 'No observations to process';
    }

    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(confirmButton);
    content.appendChild(buttonContainer);
    modal.appendChild(content);

    return modal;
}

function createProgressModal() {
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
        z-index: 10001;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        max-width: 500px;
        width: 90%;
    `;

    const title = document.createElement('h2');
    title.textContent = 'Processing Observations';
    title.style.marginTop = '0';

    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = `
        width: 100%;
        height: 20px;
        background: #f0f0f0;
        border-radius: 10px;
        overflow: hidden;
        margin: 20px 0;
    `;

    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    progressFill.style.cssText = `
        width: 0%;
        height: 100%;
        background: #4CAF50;
        transition: width 0.3s ease;
    `;

    const status = document.createElement('p');
    status.id = 'bulk-action-status';
    status.style.textAlign = 'center';

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'bulk-action-button';
    cancelButton.style.cssText = `
        margin-top: 10px;
        padding: 10px 20px;
        background-color: #f44336;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    `;
    cancelButton.onclick = () => {
        if (confirm('Are you sure you want to cancel? Actions already performed cannot be undone by canceling.')) {
            modal.dataset.cancelled = 'true';
            cancelButton.disabled = true;
            cancelButton.textContent = 'Cancelling...';
            status.textContent = 'Cancelling - waiting for current action to complete...';
        }
    };

    progressContainer.appendChild(progressFill);
    content.appendChild(title);
    content.appendChild(progressContainer);
    content.appendChild(status);
    content.appendChild(cancelButton);
    modal.appendChild(content);

    return modal;
}

// Bulk action shortcut handler
async function handleBulkActionShortcut(selectedAction) {
    try {
        const observationIds = Array.from(selectedObservations);
        const validationResults = await validateBulkAction(selectedAction, observationIds);
        
        // Get the safe mode setting
        const { safeMode = true } = await new Promise(resolve => 
            browserAPI.storage.local.get('safeMode', resolve)
        );

        // Get observations to highlight based on validation results
        const observationsToHighlight = safeMode ? 
            validationResults.toSkip.map(item => ({
                observationId: item.observationId,
                fieldValues: Object.fromEntries(
                    Object.entries(item.existingFields).map(([fieldId, value]) => [
                        validationResults.fieldNames.get(fieldId),
                        {
                            current: value,
                            proposed: validationResults.proposedValues.get(fieldId)
                        }
                    ])
                )
            })) :
            Array.from(validationResults.existingValues.entries()).map(([observationId, info]) => ({
                observationId,
                fieldValues: Object.fromEntries(
                    Object.entries(info.existingFields).map(([fieldId, value]) => [
                        validationResults.fieldNames.get(fieldId),
                        {
                            current: value,
                            proposed: validationResults.proposedValues.get(fieldId)
                        }
                    ])
                )
            }));

        // Show warnings for observations with existing values
        highlightObservationsWithExistingValues(observationsToHighlight, selectedAction);

        const validationModal = await createValidationModal(
            validationResults,
            selectedAction,
            async () => {
                // Clear highlights when proceeding
                highlightObservationsWithExistingValues([], null, true);
                const progressModal = createProgressModal();
                document.body.appendChild(progressModal);
                await executeBulkAction(selectedAction, progressModal, () => false);
            },
            () => {
                // Clear highlights when cancelling
                highlightObservationsWithExistingValues([], null, true);
                console.log('Validation cancelled');
            }
        );
        
        document.body.appendChild(validationModal);
    } catch (error) {
        console.error('Error in bulk action shortcut:', error);
        alert(`Error: ${error.message}`);
        highlightObservationsWithExistingValues([], null, true);
    }
}

// Helper function to create action description HTML
function createActionDescription(selectedAction) {
    const container = document.createElement('div');
    container.style.cssText = `
        margin-bottom: 20px;
        padding: 15px;
        background: #f8f9fa;
        border-radius: 8px;
        border: 1px solid #e9ecef;
    `;

    container.innerHTML = `
        <h3 style="margin-top: 0; margin-bottom: 10px; color: #1a73e8;">Action: ${selectedAction.name}</h3>
        <div class="action-details" style="color: #202124;">
            ${selectedAction.actions.map(action => {
                let actionDesc = '';
                switch(action.type) {
                    case 'reviewed':
                        actionDesc = `Mark the observation as ${action.reviewed === 'mark' ? 'reviewed' : 'unreviewed'}`;
                        break;
                    case 'follow':
                        actionDesc = `${action.follow === 'follow' ? 'Follow' : 'Unfollow'} the observation`;
                        break;
                    case 'withdrawId':
                        actionDesc = `Withdraw your current identification`;
                        break;
                    case 'observationField':
                        const displayValue = action.displayValue || action.fieldValue;
                        actionDesc = `Set field "${action.fieldName}" to "${displayValue}"`;
                        break;
                    case 'annotation':
                        const fieldName = getAnnotationFieldName(action.annotationField);
                        const valueName = getAnnotationValueName(action.annotationField, action.annotationValue);
                        actionDesc = `Add annotation: ${fieldName} = ${valueName}`;
                        break;
                    case 'addToProject':
                        actionDesc = `${action.remove ? 'Remove from' : 'Add to'} project: ${action.projectName}`;
                        break;
                    case 'addComment':
                        actionDesc = `Add comment: "${action.commentBody.substring(0, 50)}${action.commentBody.length > 50 ? '...' : ''}"`;
                        break;
                    case 'addTaxonId':
                        actionDesc = `Add taxon ID: ${action.taxonName}`;
                        break;
                    case 'qualityMetric':
                        const metricName = getQualityMetricName(action.metric);
                        actionDesc = `Set quality metric: ${metricName} to ${action.vote}`;
                        break;
                    case 'copyObservationField':
                        actionDesc = `Copy field: ${action.sourceFieldName} to ${action.targetFieldName}`;
                        break;
                }
                return actionDesc ? `
                    <div class="action-item" style="
                        margin: 8px 0;
                        padding-left: 20px;
                        position: relative;
                    ">
                        <span style="
                            position: absolute;
                            left: 8px;
                            color: #1a73e8;
                        ">•</span>
                        ${actionDesc}
                    </div>` : '';
            }).join('')}
        </div>
    `;

    return container;
}

async function handleFollowAndReviewPrevention(observationId, actions, results) {
    // Get prevention settings
    const { preventTaxonFollow, preventFieldFollow, preventTaxonReview } = await new Promise(resolve => 
        browserAPI.storage.local.get(['preventTaxonFollow', 'preventFieldFollow', 'preventTaxonReview'], resolve)
    );
    console.log('Prevention settings:', { preventTaxonFollow, preventFieldFollow, preventTaxonReview });

    // Action type checks
    const hasTaxonAction = actions.some(action => action.type === 'addTaxonId');
    const hasFieldAction = actions.some(action => action.type === 'observationField');
    const hasExplicitFollowAction = actions.some(action => action.type === 'follow');
    const hasExplicitReviewAction = actions.some(action => action.type === 'reviewed');

    // Follow prevention check
    const shouldPreventFollow = !hasExplicitFollowAction && (
        (hasTaxonAction && !hasFieldAction && preventTaxonFollow) ||
        (!hasTaxonAction && hasFieldAction && preventFieldFollow) ||
        (hasTaxonAction && hasFieldAction && preventTaxonFollow && preventFieldFollow)
    );

    // Review prevention check
    const shouldPreventReview = !hasExplicitReviewAction && 
        hasTaxonAction && 
        preventTaxonReview;

    // Get initial states BEFORE any actions occur
    let originalFollowState = null;
    let originalReviewState = null;

    if (shouldPreventFollow) {
        const followState = await makeAPIRequest(`/observations/${observationId}/subscriptions`);
        originalFollowState = followState.results && 
            followState.results.some(sub => sub.resource_type === "Observation");
        console.log('Original follow state:', originalFollowState);
    }

    if (shouldPreventReview) {
        const observation = await makeAPIRequest(`/observations/${observationId}`);
        originalReviewState = observation.results[0].reviewed_by && 
            observation.results[0].reviewed_by.includes(await getCurrentUserId());
        console.log('Original review state:', originalReviewState);
    }

    // Store these original states for use after actions complete
    const originalStates = { originalFollowState, originalReviewState };
    
    return originalStates;  // Return these to be used after actions complete
}


async function handleStateRestoration(observationId, actions, results, originalStates) {
    if (results.every(r => r.success)) {
        console.log('Actions completed successfully, checking states...');
        await delay(500); // Wait for iNat's auto-actions to take effect

        const { originalFollowState, originalReviewState } = originalStates;

        // Follow check
        if (originalFollowState !== null) {
            const currentState = await makeAPIRequest(`/observations/${observationId}/subscriptions`);
            const isCurrentlyFollowed = currentState.results && 
                currentState.results.some(sub => sub.resource_type === "Observation");
            console.log('Current follow state:', isCurrentlyFollowed);

            if (!originalFollowState && isCurrentlyFollowed) {
                console.log('Attempting to restore unfollowed state...');
                await makeAPIRequest(`/subscriptions/Observation/${observationId}/subscribe`, {
                    method: 'POST'
                });
            }
        }

        // Review check
        if (originalReviewState !== null) {
            const observation = await makeAPIRequest(`/observations/${observationId}`);
            const isCurrentlyReviewed = observation.results[0].reviewed_by && 
                observation.results[0].reviewed_by.includes(await getCurrentUserId());

            if (!originalReviewState && isCurrentlyReviewed) {
                await makeAPIRequest(`/observations/${observationId}/review`, {
                    method: 'DELETE'
                });
            }
        }
    }
}

function sortAvailableActions(actions, sortMethod) {
    const sortedActions = [...actions]; // Create a copy to avoid modifying the original
    switch (sortMethod) {
        case 'az':
            sortedActions.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            break;
        case 'za':
            sortedActions.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
            break;
        case 'default': // This would be the order they come from storage / configuration
            // No sorting needed, already in default order from currentAvailableActions
            break;
        default:
            // Default to 'default' or 'az' if unknown sortMethod
            break; 
    }
    return sortedActions;
}

async function openActionSelectionModalWorkflow() {
    console.log('Bulk Action: Initiating action selection modal workflow...');
    if (selectedObservations.size === 0) {
        alert('Please select at least one observation first.');
        return;
    }

    try {
        // createActionModal is async and now appends itself to the body.
        // We await it to ensure its setup (including its own event listeners) completes.
        const modalNode = await createActionModal();
        
        // This check is mostly for sanity; createActionModal should throw if it fails badly.
        if (!modalNode || !document.body.contains(modalNode)) {
            console.error("openActionSelectionModalWorkflow: createActionModal did not successfully create or append the modal to the document.");
            window.isBulkActionSelectionModalOpen = false; // Ensure flag is reset
        } else {
            console.log("Action selection modal opened successfully.");
        }
    } catch (error) {
        console.error("Error opening or during creation of the action selection modal:", error);
        window.isBulkActionSelectionModalOpen = false; // Ensure flag is reset on error
        alert("Could not open the action selection dialog. Please check the console for errors.");
    }
}


async function applyBulkAction() { // Make it async
    console.log('Button "Select and Apply Action" clicked. Initiating modal workflow.');

    // --- NEW: Check if a modal is already open ---
    if (window.isBulkActionSelectionModalOpen === true) {
        console.warn("applyBulkAction (initiator) called, but an action selection modal seems to be already open. Aborting to prevent duplication.");
        // Optionally, try to focus the existing modal or its select element
        const existingModalSelect = document.getElementById('bulk-action-select');
        if (existingModalSelect) {
            existingModalSelect.focus();
        }
        return;
    }
    // --- END NEW ---

    if (selectedObservations.size === 0) {
        alert('Please select at least one observation first.');
        return;
    }

    // Set the flag immediately BEFORE creating the modal
    // createActionModal will also set it, but this is an earlier guard.
    window.isBulkActionSelectionModalOpen = true; 

    try {
        const modalNode = await createActionModal(); 
        
        if (modalNode && document.body.contains(modalNode)) {
            console.log("Action selection modal has been successfully opened by createActionModal.");
        } else {
             console.error("applyBulkAction (initiator): createActionModal resolved, but modalNode is not valid or not in DOM. Flag was:", window.isBulkActionSelectionModalOpen);
             // If modal creation failed internally and didn't set the flag to false, reset it here.
             if (window.isBulkActionSelectionModalOpen) { // Check because createActionModal's cleanup should set it false
                window.isBulkActionSelectionModalOpen = false;
             }
        }
    } catch (error) {
        console.error("Error occurred during the createActionModal call from applyBulkAction (initiator):", error);
        window.isBulkActionSelectionModalOpen = false; 
        alert("An error occurred while trying to open the action selection dialog. Please check the console.");
    }
}