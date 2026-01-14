// Global state
let pricingData = null;
let items = [];

// Parse CSV text into array of objects
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];
    
    // Simple CSV parser - handles basic cases (no quoted fields with commas)
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines
        
        const values = line.split(',').map(v => v.trim());
        if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index];
            });
            rows.push(row);
        }
    }
    
    return rows;
}

// Load rates from CSV and merge into data.json
async function loadData() {
    try {
        // First, load rates.csv
        let rates = [];
        try {
            const ratesResponse = await fetch('rates.csv', { cache: 'no-store' });
            if (ratesResponse.ok) {
                const csvText = await ratesResponse.text();
                const csvRows = parseCSV(csvText);
                // Convert CSV rows to rate objects with proper types
                rates = csvRows.map(row => ({
                    service: row.service,
                    instrument: row.instrument,
                    method: row.method,
                    customerType: row.customerType,
                    unitType: row.unitType,
                    rate: parseFloat(row.rate) || 0
                }));
                console.log(`Loaded ${rates.length} rates from rates.csv`);
            } else {
                console.warn('rates.csv not found, using rates from data.json');
            }
        } catch (csvError) {
            console.warn('Error loading rates.csv:', csvError);
            console.warn('Falling back to rates from data.json');
        }
        
        // Load data.json
        const response = await fetch('data.json', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Failed to load data.json: ${response.status} ${response.statusText}`);
        }
        pricingData = await response.json();
        
        // If we loaded rates from CSV, replace the rates in data.json
        if (rates.length > 0) {
            pricingData.rates = rates;
            console.log('Updated data.json rates from rates.csv');
        }
        
        populateDropdowns();
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Failed to load pricing data. Please ensure data.json exists and you are running the app from a web server (not file://).\n\nYou can use a simple local server:\n- Python: python -m http.server\n- Node: npx http-server\n- Or open with a web server extension in your editor.');
    }
}

// Populate all dropdowns with options from JSON data
function populateDropdowns() {
    if (!pricingData) return;

    populateDropdown('service', pricingData.services);
    populateDropdown('customerType', pricingData.customerTypes);
    populateDropdown('unitType', pricingData.unitTypes);
    
    // Instruments and methods will be populated based on selections
    resetDropdown('instrument');
    resetDropdown('method');
    
    // Set up event listeners for dependent dropdowns and rate display
    setupDependentDropdownListeners();
    setupRateDisplayListeners();
}

// Populate a single dropdown
function populateDropdown(selectId, options) {
    const select = document.getElementById(selectId);
    if (!select) return;

    // Clear existing options except the first placeholder
    const placeholder = select.firstElementChild;
    select.innerHTML = '';
    if (placeholder) {
        select.appendChild(placeholder);
    }

    // Add options from data
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.id;
        optionElement.textContent = option.name;
        select.appendChild(optionElement);
    });
}

// Reset a dropdown to its placeholder
function resetDropdown(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    const placeholder = select.firstElementChild;
    select.innerHTML = '';
    if (placeholder) {
        select.appendChild(placeholder);
    }
}

// Get unique instruments for a given service
function getInstrumentsForService(serviceId) {
    if (!pricingData || !pricingData.rates || !serviceId) return [];
    
    const instrumentIds = new Set();
    pricingData.rates.forEach(rate => {
        if (rate.service === serviceId) {
            instrumentIds.add(rate.instrument);
        }
    });
    
    return pricingData.instruments.filter(instrument => 
        instrumentIds.has(instrument.id)
    );
}

// Get unique methods for a given service and instrument
function getMethodsForServiceAndInstrument(serviceId, instrumentId) {
    if (!pricingData || !pricingData.rates || !serviceId || !instrumentId) return [];
    
    const methodIds = new Set();
    pricingData.rates.forEach(rate => {
        if (rate.service === serviceId && rate.instrument === instrumentId) {
            methodIds.add(rate.method);
        }
    });
    
    return pricingData.methods.filter(method => 
        methodIds.has(method.id)
    );
}

// Update instrument dropdown based on selected service
function updateInstrumentDropdown() {
    const serviceId = document.getElementById('service').value;
    
    if (!serviceId) {
        resetDropdown('instrument');
        resetDropdown('method');
        updateRateDisplay();
        return;
    }
    
    const availableInstruments = getInstrumentsForService(serviceId);
    populateDropdown('instrument', availableInstruments);
    
    // Reset method dropdown when instrument changes
    resetDropdown('method');
    updateMethodDropdown();
    updateRateDisplay();
}

// Update method dropdown based on selected service and instrument
function updateMethodDropdown() {
    const serviceId = document.getElementById('service').value;
    const instrumentId = document.getElementById('instrument').value;
    
    if (!serviceId || !instrumentId) {
        resetDropdown('method');
        updateRateDisplay();
        return;
    }
    
    const availableMethods = getMethodsForServiceAndInstrument(serviceId, instrumentId);
    populateDropdown('method', availableMethods);
    updateRateDisplay();
}

// Set up event listeners for dependent dropdowns
function setupDependentDropdownListeners() {
    const serviceDropdown = document.getElementById('service');
    const instrumentDropdown = document.getElementById('instrument');
    
    if (serviceDropdown) {
        serviceDropdown.addEventListener('change', () => {
            updateInstrumentDropdown();
        });
    }
    
    if (instrumentDropdown) {
        instrumentDropdown.addEventListener('change', () => {
            updateMethodDropdown();
        });
    }
}

// Find rate for selected combination
function findRate(service, instrument, method, customerType, unitType) {
    if (!pricingData || !pricingData.rates) return null;

    const rate = pricingData.rates.find(r =>
        r.service === service &&
        r.instrument === instrument &&
        r.method === method &&
        r.customerType === customerType &&
        r.unitType === unitType
    );

    return rate ? rate.rate : null;
}

// Get display name for an ID
function getDisplayName(array, id) {
    if (!array) return id;
    const item = array.find(i => i.id === id);
    return item ? item.name : id;
}

// Update rate display based on current selections
function updateRateDisplay() {
    const service = document.getElementById('service').value;
    const instrument = document.getElementById('instrument').value;
    const method = document.getElementById('method').value;
    const customerType = document.getElementById('customerType').value;
    const unitType = document.getElementById('unitType').value;
    const rateDisplay = document.getElementById('rateDisplay');
    
    if (!rateDisplay) return;
    
    // Check if all fields are selected
    if (!service || !instrument || !method || !customerType || !unitType) {
        rateDisplay.value = '--';
        return;
    }
    
    // Find rate
    const rate = findRate(service, instrument, method, customerType, unitType);
    
    if (rate === null) {
        rateDisplay.value = 'N/A';
    } else {
        rateDisplay.value = `$${rate.toFixed(2)}`;
    }
}

// Set up event listeners for all dropdowns to update rate display
function setupRateDisplayListeners() {
    const dropdowns = ['service', 'instrument', 'method', 'customerType', 'unitType'];
    dropdowns.forEach(dropdownId => {
        const dropdown = document.getElementById(dropdownId);
        if (dropdown) {
            dropdown.addEventListener('change', updateRateDisplay);
        }
    });
}

// Add item to the list
function addItem() {
    const service = document.getElementById('service').value;
    const instrument = document.getElementById('instrument').value;
    const method = document.getElementById('method').value;
    const customerType = document.getElementById('customerType').value;
    const unitType = document.getElementById('unitType').value;
    const quantity = parseFloat(document.getElementById('quantity').value);

    // Validate all fields
    if (!service || !instrument || !method || !customerType || !unitType || !quantity || quantity <= 0) {
        alert('Please fill in all fields with valid values.');
        return;
    }

    // Find rate
    const rate = findRate(service, instrument, method, customerType, unitType);
    if (rate === null) {
        alert('No rate found for the selected combination. Please check your data.json file.');
        return;
    }

    // Calculate price
    const price = rate * quantity;

    // Create item object
    const item = {
        id: Date.now(), // Simple ID generation
        service,
        instrument,
        method,
        customerType,
        unitType,
        quantity,
        rate,
        price
    };

    // Add to items array
    items.push(item);

    // Update display
    renderItems();
    updateTotal();
    updateExportButton();
    updateExportButton();

    // Reset form
    document.getElementById('pricingForm').reset();
    // Reset dependent dropdowns properly
    resetDropdown('instrument');
    resetDropdown('method');
    updateRateDisplay(); // Update rate display after reset
}

// Remove item from list
function removeItem(itemId) {
    items = items.filter(item => item.id !== itemId);
    renderItems();
    updateTotal();
    updateExportButton();
}

// Render all items
function renderItems() {
    const itemsList = document.getElementById('itemsList');
    if (!itemsList) return;

    if (items.length === 0) {
        itemsList.innerHTML = '<p class="empty-message">No items added yet.</p>';
        return;
    }

    itemsList.innerHTML = items.map(item => {
        const serviceName = getDisplayName(pricingData.services, item.service);
        const instrumentName = getDisplayName(pricingData.instruments, item.instrument);
        const methodName = getDisplayName(pricingData.methods, item.method);
        const customerTypeName = getDisplayName(pricingData.customerTypes, item.customerType);
        const unitTypeName = getDisplayName(pricingData.unitTypes, item.unitType);

        return `
            <div class="item">
                <div class="item-details">
                    <div class="item-detail-row">
                        <span class="item-detail-label">Laboratory:</span>
                        <span>${serviceName}</span>
                    </div>
                    <div class="item-detail-row">
                        <span class="item-detail-label">Instrument:</span>
                        <span>${instrumentName}</span>
                    </div>
                    <div class="item-detail-row">
                        <span class="item-detail-label">Method:</span>
                        <span>${methodName}</span>
                    </div>
                    <div class="item-detail-row">
                        <span class="item-detail-label">Customer Type:</span>
                        <span>${customerTypeName}</span>
                    </div>
                    <div class="item-detail-row">
                        <span class="item-detail-label">Unit Type:</span>
                        <span>${unitTypeName}</span>
                    </div>
                    <div class="item-quantity">
                        Quantity: ${item.quantity} | Rate: $${item.rate.toFixed(2)} per ${unitTypeName.toLowerCase()}
                    </div>
                </div>
                <div class="item-price">
                    <div class="item-price-value">$${item.price.toFixed(2)}</div>
                </div>
                <button class="remove-button" onclick="removeItem(${item.id})">Remove</button>
            </div>
        `;
    }).join('');
}

// Update total cost
function updateTotal() {
    const total = items.reduce((sum, item) => sum + item.price, 0);
    const totalCostElement = document.getElementById('totalCost');
    if (totalCostElement) {
        totalCostElement.textContent = total.toFixed(2);
    }
}

// Update export button state
function updateExportButton() {
    const exportButton = document.getElementById('exportButton');
    if (exportButton) {
        exportButton.disabled = items.length === 0;
    }
}

// Export items to CSV
function exportToCSV() {
    if (items.length === 0) {
        alert('No items to export.');
        return;
    }

    // CSV headers
    const headers = [
        'Laboratory',
        'Instrument',
        'Method',
        'Customer Type',
        'Unit Type',
        'Quantity',
        'Rate ($)',
        'Price ($)'
    ];

    // Convert items to CSV rows
    const rows = items.map(item => {
        const laboratoryName = getDisplayName(pricingData.services, item.service);
        const instrumentName = getDisplayName(pricingData.instruments, item.instrument);
        const methodName = getDisplayName(pricingData.methods, item.method);
        const customerTypeName = getDisplayName(pricingData.customerTypes, item.customerType);
        const unitTypeName = getDisplayName(pricingData.unitTypes, item.unitType);

        return [
            escapeCSV(laboratoryName),
            escapeCSV(instrumentName),
            escapeCSV(methodName),
            escapeCSV(customerTypeName),
            escapeCSV(unitTypeName),
            item.quantity.toString(),
            item.rate.toFixed(2),
            item.price.toFixed(2)
        ];
    });

    // Add total row
    const total = items.reduce((sum, item) => sum + item.price, 0);
    rows.push([
        '',
        '',
        '',
        '',
        '',
        'Total',
        '',
        total.toFixed(2)
    ]);

    // Combine headers and rows
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `gcr_pricing_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up
    URL.revokeObjectURL(url);
}

// Escape CSV field (handle commas, quotes, and newlines)
function escapeCSV(field) {
    if (field == null) return '';
    
    const stringField = String(field);
    
    // If field contains comma, quote, or newline, wrap in quotes and escape quotes
    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
        return '"' + stringField.replace(/"/g, '""') + '"';
    }
    
    return stringField;
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    loadData().then(() => {
        // Update rate display after data is loaded
        updateRateDisplay();
        // Initialize export button state
        updateExportButton();
    });

    // Handle form submission
    const form = document.getElementById('pricingForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            addItem();
        });
    }

    // Handle export button
    const exportButton = document.getElementById('exportButton');
    if (exportButton) {
        exportButton.addEventListener('click', exportToCSV);
    }
});
