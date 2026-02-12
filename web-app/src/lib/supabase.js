// ============================================
// Plukrr - Supabase Client (Web App)
// ============================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ebejohsdxoidxkhbvbls.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_pei3qbLbgfzOK8nNgONkJA_KFYjV2Dq';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Extension communication
const EXTENSION_ID = import.meta.env.VITE_EXTENSION_ID || null;

/**
 * Send auth tokens to the Chrome extension
 */
export function sendTokensToExtension(session) {
    if (!session) return false;

    const payload = {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        user: session.user,
        expiresAt: new Date(Date.now() + (session.expires_in || 3600) * 1000).toISOString()
    };

    // Method 1 (Primary): Custom DOM event for content script bridge
    // This works reliably because the extension injects a content script on our domain
    try {
        window.dispatchEvent(new CustomEvent('plukrr-auth', {
            detail: {
                type: 'AUTH_TOKEN',
                payload
            }
        }));
        console.log('[Plukrr Web] Dispatched auth event for extension bridge');
    } catch (e) {
        console.warn('[Plukrr Web] DOM event dispatch failed:', e);
    }

    // Method 2: externally_connectable (if extension ID is known)
    if (EXTENSION_ID && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        try {
            chrome.runtime.sendMessage(EXTENSION_ID, { type: 'AUTH_TOKEN', ...payload });
            console.log('[Plukrr Web] Sent tokens to extension via chrome.runtime');
            return true;
        } catch (e) {
            console.warn('[Plukrr Web] chrome.runtime.sendMessage failed:', e);
        }
    }

    // Method 3: BroadcastChannel (fallback for same-origin tabs)
    try {
        const channel = new BroadcastChannel('plukrr_auth');
        channel.postMessage({ type: 'AUTH_TOKEN', ...payload });
        channel.close();
        console.log('[Plukrr Web] Sent tokens via BroadcastChannel');
    } catch (e) {
        console.warn('[Plukrr Web] BroadcastChannel failed:', e);
    }

    return true;
}

/**
 * Notify the extension that user signed out
 */
export function notifyExtensionSignOut() {
    try {
        window.dispatchEvent(new CustomEvent('plukrr-auth', {
            detail: { type: 'SIGN_OUT' }
        }));
        console.log('[Plukrr Web] Dispatched sign out event for extension');
    } catch (e) {
        console.warn('[Plukrr Web] Sign out event dispatch failed:', e);
    }
}

/**
 * Check if the Plukrr extension is installed
 */
export function isExtensionInstalled() {
    return window.__PLUKRR_EXTENSION_INSTALLED__ === true;
}

// Config
export const config = {
    SUPABASE_URL,
    CHECK_ACCESS_URL: `${SUPABASE_URL}/functions/v1/check-access`,
    CHECKOUT_URL: `${SUPABASE_URL}/functions/v1/create-checkout`,
    EXTENSION_ID,
    APP_NAME: 'Plukrr',
    SUPPORT_EMAIL: 'support@plukrr.com',
    WEBSITE_URL: 'https://plukrr.com',
};
