import { useState, useEffect, createContext, useContext } from 'react';
import { supabase, sendTokensToExtension, notifyExtensionSignOut } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);

            // Send tokens to extension on login
            if (session) {
                sendTokensToExtension(session);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const sendOTP = async (email) => {
        const { data, error } = await supabase.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: true }
        });
        return { data, error };
    };

    const verifyOTP = async (email, token) => {
        const { data, error } = await supabase.auth.verifyOtp({
            email,
            token,
            type: 'email'
        });

        if (!error && data.session) {
            sendTokensToExtension(data.session);
        }

        return { data, error };
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        notifyExtensionSignOut();
        setUser(null);
        setSession(null);
    };

    return (
        <AuthContext.Provider value={{ user, session, loading, sendOTP, verifyOTP, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
}
