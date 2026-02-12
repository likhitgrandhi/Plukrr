// ============================================
// ExactAI - Authentication Service
// Handles Supabase passwordless authentication (OTP-based)
// ============================================

const AuthService = {
    supabase: null,
    STORAGE_KEY: 'exactai_auth',

    /**
     * Initialize Supabase client
     */
    init() {
        if (this.supabase) {
            return this.supabase;
        }

        // Check if CONFIG is available
        if (typeof CONFIG === 'undefined') {
            console.error('[AuthService] CONFIG not loaded');
            return null;
        }

        // Check if Supabase is configured
        if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL === 'YOUR_SUPABASE_URL') {
            console.warn('[AuthService] Supabase not configured');
            return null;
        }

        // Create Supabase client
        this.supabase = this._createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

        return this.supabase;
    },

    /**
     * Create a minimal Supabase client for Chrome extensions
     */
    _createClient(url, anonKey) {
        return {
            url,
            anonKey,

            // Auth methods using REST API
            auth: {
                // Send OTP code to email
                signInWithOtp: async (options) => {
                    const response = await fetch(`${url}/auth/v1/otp`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': anonKey
                        },
                        body: JSON.stringify({
                            email: options.email,
                            options: options.options || {}
                        })
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        return { data: null, error };
                    }

                    return { data: { message: 'OTP sent' }, error: null };
                },

                // Verify OTP code
                verifyOtp: async (options) => {
                    const response = await fetch(`${url}/auth/v1/verify`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': anonKey
                        },
                        body: JSON.stringify({
                            email: options.email,
                            token: options.token,
                            type: options.type || 'email'
                        })
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        return { data: null, error };
                    }

                    const data = await response.json();
                    return { data, error: null };
                },

                getSession: async () => {
                    const authData = await AuthService.getStoredAuth();
                    if (!authData || !authData.accessToken) {
                        return { data: { session: null }, error: null };
                    }

                    // Check if token is expired
                    if (authData.expiresAt && new Date(authData.expiresAt) < new Date()) {
                        const refreshed = await AuthService.refreshSession();
                        if (!refreshed) {
                            return { data: { session: null }, error: null };
                        }
                        return { data: { session: refreshed }, error: null };
                    }

                    return {
                        data: {
                            session: {
                                access_token: authData.accessToken,
                                refresh_token: authData.refreshToken,
                                user: authData.user,
                                expires_at: authData.expiresAt
                            }
                        },
                        error: null
                    };
                },

                refreshSession: async () => {
                    const authData = await AuthService.getStoredAuth();
                    if (!authData || !authData.refreshToken) {
                        return { data: { session: null }, error: { message: 'No refresh token' } };
                    }

                    const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': anonKey
                        },
                        body: JSON.stringify({
                            refresh_token: authData.refreshToken
                        })
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        return { data: { session: null }, error };
                    }

                    const data = await response.json();

                    // Store new tokens
                    await AuthService.storeAuth({
                        accessToken: data.access_token,
                        refreshToken: data.refresh_token,
                        user: data.user,
                        expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString()
                    });

                    return { data: { session: data }, error: null };
                },

                signOut: async () => {
                    const authData = await AuthService.getStoredAuth();
                    if (authData && authData.accessToken) {
                        try {
                            await fetch(`${url}/auth/v1/logout`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'apikey': anonKey,
                                    'Authorization': `Bearer ${authData.accessToken}`
                                }
                            });
                        } catch (e) {
                            console.warn('[AuthService] Logout API call failed:', e);
                        }
                    }

                    await AuthService.clearAuth();
                    return { error: null };
                },

                getUser: async () => {
                    const authData = await AuthService.getStoredAuth();
                    if (!authData || !authData.accessToken) {
                        return { data: { user: null }, error: null };
                    }

                    const response = await fetch(`${url}/auth/v1/user`, {
                        method: 'GET',
                        headers: {
                            'apikey': anonKey,
                            'Authorization': `Bearer ${authData.accessToken}`
                        }
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        return { data: { user: null }, error };
                    }

                    const user = await response.json();
                    return { data: { user }, error: null };
                }
            },

            // Database methods using REST API
            from: (table) => ({
                select: (columns = '*') => ({
                    eq: (column, value) => ({
                        single: async () => {
                            const authData = await AuthService.getStoredAuth();
                            const headers = {
                                'apikey': anonKey,
                                'Content-Type': 'application/json'
                            };
                            if (authData?.accessToken) {
                                headers['Authorization'] = `Bearer ${authData.accessToken}`;
                            }

                            const response = await fetch(
                                `${url}/rest/v1/${table}?select=${columns}&${column}=eq.${value}`,
                                { headers }
                            );

                            if (!response.ok) {
                                const error = await response.json();
                                return { data: null, error };
                            }

                            const data = await response.json();
                            return { data: data[0] || null, error: null };
                        },
                        async then(resolve) {
                            const authData = await AuthService.getStoredAuth();
                            const headers = {
                                'apikey': anonKey,
                                'Content-Type': 'application/json'
                            };
                            if (authData?.accessToken) {
                                headers['Authorization'] = `Bearer ${authData.accessToken}`;
                            }

                            const response = await fetch(
                                `${url}/rest/v1/${table}?select=${columns}&${column}=eq.${value}`,
                                { headers }
                            );

                            if (!response.ok) {
                                const error = await response.json();
                                resolve({ data: null, error });
                                return;
                            }

                            const data = await response.json();
                            resolve({ data, error: null });
                        }
                    })
                }),
                insert: (data) => ({
                    select: () => ({
                        single: async () => {
                            const authData = await AuthService.getStoredAuth();
                            const headers = {
                                'apikey': anonKey,
                                'Content-Type': 'application/json',
                                'Prefer': 'return=representation'
                            };
                            if (authData?.accessToken) {
                                headers['Authorization'] = `Bearer ${authData.accessToken}`;
                            }

                            const response = await fetch(`${url}/rest/v1/${table}`, {
                                method: 'POST',
                                headers,
                                body: JSON.stringify(data)
                            });

                            if (!response.ok) {
                                const error = await response.json();
                                return { data: null, error };
                            }

                            const result = await response.json();
                            return { data: result[0] || result, error: null };
                        }
                    })
                }),
                update: (data) => ({
                    eq: (column, value) => ({
                        select: () => ({
                            single: async () => {
                                const authData = await AuthService.getStoredAuth();
                                const headers = {
                                    'apikey': anonKey,
                                    'Content-Type': 'application/json',
                                    'Prefer': 'return=representation'
                                };
                                if (authData?.accessToken) {
                                    headers['Authorization'] = `Bearer ${authData.accessToken}`;
                                }

                                const response = await fetch(
                                    `${url}/rest/v1/${table}?${column}=eq.${value}`,
                                    {
                                        method: 'PATCH',
                                        headers,
                                        body: JSON.stringify(data)
                                    }
                                );

                                if (!response.ok) {
                                    const error = await response.json();
                                    return { data: null, error };
                                }

                                const result = await response.json();
                                return { data: result[0] || result, error: null };
                            }
                        })
                    })
                })
            }),

            // RPC calls
            rpc: async (fnName, params = {}) => {
                const authData = await AuthService.getStoredAuth();
                const headers = {
                    'apikey': anonKey,
                    'Content-Type': 'application/json'
                };
                if (authData?.accessToken) {
                    headers['Authorization'] = `Bearer ${authData.accessToken}`;
                }

                const response = await fetch(`${url}/rest/v1/rpc/${fnName}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(params)
                });

                if (!response.ok) {
                    const error = await response.json();
                    return { data: null, error };
                }

                const data = await response.json();
                return { data, error: null };
            }
        };
    },

    /**
     * Send OTP code to email (handles both login and signup)
     */
    async sendOTP(email) {
        const client = this.init();
        if (!client) {
            return { success: false, error: 'Supabase not configured' };
        }

        try {
            const { data, error } = await client.auth.signInWithOtp({
                email,
                options: {
                    // Don't use redirect - we'll verify the code manually
                    shouldCreateUser: true
                }
            });

            if (error) {
                console.error('[AuthService] OTP send error:', error);
                return { success: false, error: error.message || error.msg || 'Failed to send code' };
            }

            console.log('[AuthService] OTP sent to:', email);
            return { success: true, data };
        } catch (e) {
            console.error('[AuthService] OTP exception:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Verify OTP code and complete authentication
     */
    async verifyOTP(email, code) {
        const client = this.init();
        if (!client) {
            return { success: false, error: 'Supabase not configured' };
        }

        try {
            const { data, error } = await client.auth.verifyOtp({
                email,
                token: code,
                type: 'email'
            });

            if (error) {
                console.error('[AuthService] OTP verify error:', error);
                return { success: false, error: error.message || error.msg || 'Invalid code' };
            }

            // Store auth data
            if (data && data.access_token) {
                await this.storeAuth({
                    accessToken: data.access_token,
                    refreshToken: data.refresh_token,
                    user: data.user,
                    expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
                });

                // Auth successful - subscription status will be checked when needed
            }

            console.log('[AuthService] OTP verified successfully');
            return { success: true, user: data.user };
        } catch (e) {
            console.error('[AuthService] OTP verify exception:', e);
            return { success: false, error: e.message };
        }
    },

    // Keep old method names for compatibility
    async sendMagicLink(email) {
        return this.sendOTP(email);
    },

    async verifyMagicLink(token, email) {
        return this.verifyOTP(email, token);
    },

    /**
     * Get current authenticated user
     */
    async getCurrentUser() {
        const authData = await this.getStoredAuth();
        return authData?.user || null;
    },

    /**
     * Check if user is authenticated
     */
    async isAuthenticated() {
        const authData = await this.getStoredAuth();
        if (!authData || !authData.accessToken) {
            return false;
        }

        // Check if token is expired
        if (authData.expiresAt && new Date(authData.expiresAt) < new Date()) {
            // Try to refresh
            const refreshed = await this.refreshSession();
            return !!refreshed;
        }

        return true;
    },

    /**
     * Refresh the current session
     */
    async refreshSession() {
        const client = this.init();
        if (!client) {
            return null;
        }

        try {
            const { data, error } = await client.auth.refreshSession();

            if (error || !data.session) {
                console.warn('[AuthService] Session refresh failed:', error);
                await this.clearAuth();
                return null;
            }

            return data.session;
        } catch (e) {
            console.error('[AuthService] Refresh exception:', e);
            return null;
        }
    },

    /**
     * Sign out the current user
     */
    async signOut() {
        const client = this.init();
        if (client) {
            await client.auth.signOut();
        } else {
            await this.clearAuth();
        }

        console.log('[AuthService] User signed out');
        return { success: true };
    },

    /**
     * Store auth data in Chrome storage
     */
    async storeAuth(authData) {
        await chrome.storage.local.set({ [this.STORAGE_KEY]: authData });
    },

    /**
     * Get stored auth data
     */
    async getStoredAuth() {
        const result = await chrome.storage.local.get([this.STORAGE_KEY]);
        return result[this.STORAGE_KEY] || null;
    },

    /**
     * Clear stored auth data
     */
    async clearAuth() {
        await chrome.storage.local.remove([this.STORAGE_KEY]);
    },

    /**
     * Get auth header for API requests
     */
    async getAuthHeader() {
        const authData = await this.getStoredAuth();
        if (!authData || !authData.accessToken) {
            return null;
        }
        return `Bearer ${authData.accessToken}`;
    },

    /**
     * Get Supabase client (for direct API calls)
     */
    getClient() {
        return this.init();
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}
