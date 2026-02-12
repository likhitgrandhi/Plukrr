// ============================================
// Plukrr - Web App Bridge
// Content script that runs on the web app to receive auth tokens
// ============================================

(function() {
    'use strict';

    console.log('[Plukrr Bridge] Content script loaded on web app');

    // Listen for auth events from the web app
    window.addEventListener('plukrr-auth', (event) => {
        const { type, payload } = event.detail || {};
        
        if (type === 'AUTH_TOKEN' && payload) {
            console.log('[Plukrr Bridge] Received auth token from web app');
            
            // Send to background script
            chrome.runtime.sendMessage({
                type: 'AUTH_TOKEN_FROM_WEBAPP',
                accessToken: payload.accessToken,
                refreshToken: payload.refreshToken,
                user: payload.user,
                expiresAt: payload.expiresAt
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[Plukrr Bridge] Failed to send auth to background:', chrome.runtime.lastError);
                    return;
                }
                console.log('[Plukrr Bridge] Auth tokens sent to extension:', response);
                
                // Notify web app that extension received the tokens
                window.dispatchEvent(new CustomEvent('plukrr-auth-received', {
                    detail: { success: true }
                }));
            });
        }
        
        if (type === 'SIGN_OUT') {
            console.log('[Plukrr Bridge] Sign out request from web app');
            chrome.runtime.sendMessage({ type: 'SIGN_OUT_FROM_WEBAPP' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[Plukrr Bridge] Failed to send sign out to background:', chrome.runtime.lastError);
                    return;
                }
                console.log('[Plukrr Bridge] Sign out processed:', response);
            });
        }
    });

    // Notify the web app that the extension is installed
    window.dispatchEvent(new CustomEvent('plukrr-extension-ready', {
        detail: { version: '1.0.0' }
    }));
    
    // Also set a flag on the window for easy checking
    window.__PLUKRR_EXTENSION_INSTALLED__ = true;
})();

