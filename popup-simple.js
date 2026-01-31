// ============================================
// Design Copier - Simple Popup Script
// Just two actions: Select Element or Extract Full Page
// Intent selection happens on the results page
// ============================================

let aiEnhancementEnabled = false;

// ============================================
// UI EVENT HANDLERS
// ============================================

// Select element button
document.getElementById('selectBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });

        // Store AI state for results page
        chrome.storage.local.set({ aiEnabled: aiEnhancementEnabled });

        chrome.tabs.sendMessage(tab.id, { action: 'START_SELECTION' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error:', chrome.runtime.lastError.message);
                document.getElementById('status').innerText = 'Error: Please refresh the page and try again.';
            } else {
                window.close();
            }
        });
    } catch (e) {
        console.error('Injection failed:', e);
        document.getElementById('status').innerText = 'Cannot run on this page (try a public website).';
    }
});

// Extract Full Page button
document.getElementById('extractGlobalBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        document.getElementById('status').innerText = 'Error: No active tab found.';
        return;
    }
    
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://') || tab.url?.startsWith('about:')) {
        document.getElementById('status').innerText = 'Cannot run on this page (try a public website).';
        return;
    }

    const statusEl = document.getElementById('status');
    const extractBtn = document.getElementById('extractGlobalBtn');
    
    statusEl.innerHTML = '<span style="color: #6b8f71;">⏳ Scanning page...</span>';
    extractBtn.disabled = true;
    extractBtn.querySelector('span:last-child').textContent = 'Scanning...';

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        // Store AI state for results page
        chrome.storage.local.set({ aiEnabled: aiEnhancementEnabled });

        chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_GLOBAL_THEME' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error:', chrome.runtime.lastError.message);
                statusEl.innerHTML = '<span style="color: #e57373;">Error: ' + chrome.runtime.lastError.message + '</span>';
                extractBtn.disabled = false;
                extractBtn.querySelector('span:last-child').textContent = 'Extract Full Page';
                return;
            }
            
            if (response && response.status === 'error') {
                statusEl.innerHTML = '<span style="color: #e57373;">Error: ' + (response.message || 'Unknown error') + '</span>';
                extractBtn.disabled = false;
                extractBtn.querySelector('span:last-child').textContent = 'Extract Full Page';
                return;
            }
            
            window.close();
        });
    } catch (e) {
        console.error('Injection failed:', e);
        statusEl.innerHTML = '<span style="color: #e57373;">Cannot run on this page.</span>';
        extractBtn.disabled = false;
        extractBtn.querySelector('span:last-child').textContent = 'Extract Full Page';
    }
});

// ============================================
// AI STATUS MANAGEMENT
// ============================================

async function initializeAIStatus() {
    const aiToggle = document.getElementById('aiToggle');
    const aiStatus = document.getElementById('aiStatus');
    
    // Check if GeminiService is available (it's loaded separately)
    // For the simple popup, we just check storage
    chrome.storage.local.get(['geminiApiKey', 'aiEnabled'], async (result) => {
        if (result.geminiApiKey) {
            aiStatus.textContent = 'Ready';
            aiToggle.checked = result.aiEnabled !== false;
            aiEnhancementEnabled = result.aiEnabled !== false;
        } else {
            aiStatus.textContent = 'Click ⚙️ to setup';
            aiToggle.checked = false;
            aiEnhancementEnabled = false;
        }
    });
}

// AI Toggle handler
document.getElementById('aiToggle').addEventListener('change', async (e) => {
    const isChecked = e.target.checked;
    
    // Check if API key exists
    chrome.storage.local.get(['geminiApiKey'], (result) => {
        if (isChecked && !result.geminiApiKey) {
            e.target.checked = false;
            openSettings();
            return;
        }
        
        aiEnhancementEnabled = isChecked;
        chrome.storage.local.set({ aiEnabled: isChecked });
    });
});

// ============================================
// SETTINGS MODAL
// ============================================

function openSettings() {
    const modal = document.getElementById('settingsModal');
    const apiKeyInput = document.getElementById('apiKeyInput');
    
    modal.classList.add('active');
    
    // Load existing API key (masked)
    chrome.storage.local.get(['geminiApiKey'], (result) => {
        if (result.geminiApiKey) {
            apiKeyInput.value = '••••••••••••••••';
            apiKeyInput.dataset.hasKey = 'true';
        }
    });
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    modal.classList.remove('active');
}

async function saveApiKey() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const statusEl = document.getElementById('apiKeyStatus');
    const saveBtn = document.getElementById('saveApiKeyBtn');
    
    const key = apiKeyInput.value.trim();
    
    if (key === '••••••••••••••••') {
        closeSettings();
        return;
    }
    
    if (!key) {
        statusEl.className = 'api-status invalid';
        statusEl.innerHTML = '⚠️ Please enter an API key';
        statusEl.style.display = 'flex';
        return;
    }
    
    if (key.length < 20) {
        statusEl.className = 'api-status invalid';
        statusEl.innerHTML = '⚠️ API key seems too short';
        statusEl.style.display = 'flex';
        return;
    }
    
    statusEl.className = 'api-status checking';
    statusEl.innerHTML = '🔄 Validating...';
    statusEl.style.display = 'flex';
    saveBtn.disabled = true;
    
    try {
        // Simple validation - try to call the API
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: 'Hi' }] }],
                generationConfig: { maxOutputTokens: 10 }
            })
        });
        
        if (response.ok || response.status === 429) {
            // Save the key
            chrome.storage.local.set({ geminiApiKey: key, aiEnabled: true });
            
            statusEl.className = 'api-status valid';
            statusEl.innerHTML = '✓ API key saved!';
            
            aiEnhancementEnabled = true;
            document.getElementById('aiToggle').checked = true;
            document.getElementById('aiStatus').textContent = 'Ready';
            
            setTimeout(() => {
                closeSettings();
                statusEl.style.display = 'none';
            }, 1000);
        } else {
            statusEl.className = 'api-status invalid';
            statusEl.innerHTML = '✗ Invalid API key';
        }
    } catch (e) {
        statusEl.className = 'api-status invalid';
        statusEl.innerHTML = '✗ Error: ' + e.message;
    }
    
    saveBtn.disabled = false;
}

// Settings event listeners
document.getElementById('settingsBtn').addEventListener('click', openSettings);
document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
document.getElementById('saveApiKeyBtn').addEventListener('click', saveApiKey);
document.getElementById('settingsModal').addEventListener('click', (e) => {
    if (e.target.id === 'settingsModal') closeSettings();
});

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initializeAIStatus();
});
