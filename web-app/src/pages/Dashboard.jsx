import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { config, supabase } from '../lib/supabase';
import './Dashboard.css';

export default function Dashboard() {
    const { user, session, signOut, loading: authLoading } = useAuth();
    const navigate = useNavigate();

    const [access, setAccess] = useState(null);
    const [loading, setLoading] = useState(true);
    const [checkoutLoading, setCheckoutLoading] = useState(null);

    // Redirect if not logged in
    useEffect(() => {
        if (!authLoading && !user) navigate('/login');
    }, [user, authLoading, navigate]);

    // Fetch access info
    useEffect(() => {
        if (!session) return;
        fetchAccess();
    }, [session]);

    const fetchAccess = async () => {
        try {
            const res = await fetch(config.CHECK_ACCESS_URL, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': config.SUPABASE_URL.includes('supabase.co')
                        ? import.meta.env.VITE_SUPABASE_ANON_KEY
                        : ''
                }
            });
            if (res.ok) {
                setAccess(await res.json());
            }
        } catch (e) {
            console.error('Failed to fetch access:', e);
        }
        setLoading(false);
    };

    const handleCheckout = async (plan) => {
        if (!user || !session) return;
        setCheckoutLoading(plan);

        try {
            const res = await fetch(config.CHECKOUT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    productId: plan.productId,
                    userId: user.id,
                    email: user.email,
                    successUrl: `${window.location.origin}/dashboard?checkout=success`,
                })
            });

            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                console.error('No checkout URL returned');
            }
        } catch (e) {
            console.error('Checkout error:', e);
        }
        setCheckoutLoading(null);
    };

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    if (authLoading || loading) {
        return (
            <div className="dash-page">
                <div className="dash-loading">
                    <div className="spinner" />
                    <p>Loading your account...</p>
                </div>
            </div>
        );
    }

    const tier = access?.tier || 'free';
    const plan = access?.plan;

    return (
        <div className="dash-page">
            <div className="dash-container">
                {/* Header */}
                <header className="dash-header">
                    <div className="dash-logo">Plukrr</div>
                    <button className="btn-ghost" onClick={handleSignOut}>Sign Out</button>
                </header>

                {/* Account Section */}
                <section className="dash-section">
                    <div className="dash-card account-card">
                        <div className="account-info">
                            <div className="account-avatar">
                                {user?.email?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="account-details">
                                <div className="account-email">{user?.email}</div>
                                <div className="account-tier">
                                    <span className={`tier-badge tier-${tier}`}>
                                        {tierLabel(tier)}
                                    </span>
                                    {plan?.status === 'canceled' && (
                                        <span className="status-badge canceled">Canceling</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {plan && tier !== 'free' && (
                            <div className="plan-details">
                                {plan.currentPeriodEnd && tier !== 'lifetime' && (
                                    <div className="plan-row">
                                        <span className="plan-label">
                                            {plan.cancelAtPeriodEnd ? 'Access until' : 'Renews'}
                                        </span>
                                        <span className="plan-value">
                                            {new Date(plan.currentPeriodEnd).toLocaleDateString()}
                                        </span>
                                    </div>
                                )}
                                {access?.limits?.trialDaysRemaining !== undefined && (
                                    <div className="plan-row">
                                        <span className="plan-label">Trial</span>
                                        <span className="plan-value">
                                            {access.limits.trialDaysRemaining} days remaining
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {tier === 'free' && (
                            <div className="plan-details">
                                <div className="plan-row">
                                    <span className="plan-label">Free selections</span>
                                    <span className="plan-value">
                                        {access?.limits?.freeSelectionsRemaining ?? 10} remaining
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                {/* Features Section */}
                <section className="dash-section">
                    <h2 className="section-title">Your Features</h2>
                    <div className="features-grid">
                        <FeatureCard
                            name="Copy Element"
                            description="Extract any element's design"
                            enabled={access?.features?.copyElement}
                        />
                        <FeatureCard
                            name="Live Edit"
                            description="Edit designs in real-time"
                            enabled={access?.features?.liveEdit}
                        />
                        <FeatureCard
                            name="Full Page Extraction"
                            description="Extract entire page designs"
                            enabled={access?.features?.fullPageExtraction}
                        />
                    </div>
                </section>

                {/* Pricing Section (show for free users only) */}
                {tier === 'free' && (
                    <section className="dash-section">
                        <h2 className="section-title">Upgrade Your Plan</h2>
                        <div className="pricing-grid">
                            <PricingCard
                                name="Launch Offer"
                                price="$0"
                                period="/ 3 days free"
                                features={[
                                    'Everything free for 3 days',
                                    'Full design extraction',
                                    'Live Edit mode',
                                    'No commitment',
                                ]}
                                onSelect={() => handleCheckout({ productId: '622b7b6a-fd7a-4dd2-9587-8ed7d6ba8f49' })}
                                loading={checkoutLoading === 'launch_offer'}
                                current={tier === 'launch_offer'}
                            />
                            <PricingCard
                                name="Plukrr Monthly"
                                price="$8"
                                period="/month"
                                features={[
                                    'Unlimited selections',
                                    'Live Edit',
                                    'Full Page Extraction',
                                    'AI Enhancement',
                                ]}
                                onSelect={() => handleCheckout({ productId: 'ee8e71c5-8a01-4f17-a6a8-b507541f32ee' })}
                                loading={checkoutLoading === 'monthly'}
                                current={tier === 'pro'}
                            />
                            <PricingCard
                                name="Plukrr Lifetime"
                                price="$30"
                                period="one-time"
                                features={[
                                    'Everything in Monthly',
                                    'Lifetime access',
                                    'All future updates',
                                    'Priority support',
                                ]}
                                onSelect={() => handleCheckout({ productId: '1fd257e0-fbf1-430b-8abb-496b911ead22' })}
                                loading={checkoutLoading === 'lifetime'}
                                current={tier === 'lifetime'}
                                highlighted
                            />
                        </div>
                    </section>
                )}

                {/* Upgrade Section (show for launch_offer users) */}
                {tier === 'launch_offer' && (
                    <section className="dash-section">
                        <h2 className="section-title">Upgrade Your Plan</h2>
                        <div className="pricing-grid">
                            <PricingCard
                                name="Plukrr Monthly"
                                price="$8"
                                period="/month"
                                features={[
                                    'Unlimited selections',
                                    'Live Edit',
                                    'Full Page Extraction',
                                    'AI Enhancement',
                                ]}
                                onSelect={() => handleCheckout({ productId: 'ee8e71c5-8a01-4f17-a6a8-b507541f32ee' })}
                                loading={checkoutLoading === 'monthly'}
                                current={tier === 'pro'}
                            />
                            <PricingCard
                                name="Plukrr Lifetime"
                                price="$30"
                                period="one-time"
                                features={[
                                    'Everything in Monthly',
                                    'Lifetime access',
                                    'All future updates',
                                    'Priority support',
                                ]}
                                onSelect={() => handleCheckout({ productId: '1fd257e0-fbf1-430b-8abb-496b911ead22' })}
                                loading={checkoutLoading === 'lifetime'}
                                current={tier === 'lifetime'}
                                highlighted
                            />
                        </div>
                    </section>
                )}

                {/* Checkout success banner */}
                {new URLSearchParams(window.location.search).get('checkout') === 'success' && (
                    <div className="checkout-success">
                        <span>🎉</span>
                        <p>Payment successful! Your plan will be updated shortly.</p>
                        <button className="link-btn" onClick={fetchAccess}>Refresh</button>
                    </div>
                )}
            </div>
        </div>
    );
}

function FeatureCard({ name, description, enabled }) {
    return (
        <div className={`feature-card ${enabled ? 'enabled' : 'locked'}`}>
            <div className="feature-icon">{enabled ? '✓' : '🔒'}</div>
            <div className="feature-info">
                <div className="feature-name">{name}</div>
                <div className="feature-desc">{description}</div>
            </div>
        </div>
    );
}

function PricingCard({ name, price, period, features, onSelect, loading, current, highlighted }) {
    return (
        <div className={`pricing-card ${highlighted ? 'highlighted' : ''} ${current ? 'current' : ''}`}>
            {highlighted && <div className="pricing-badge">Best Value</div>}
            <div className="pricing-header">
                <h3 className="pricing-name">{name}</h3>
                <div className="pricing-price">
                    <span className="price-amount">{price}</span>
                    <span className="price-period">{period}</span>
                </div>
            </div>
            <ul className="pricing-features">
                {features.map((f, i) => (
                    <li key={i}>
                        <span className="check">✓</span>
                        {f}
                    </li>
                ))}
            </ul>
            <button
                className={`btn-primary ${current ? 'btn-current' : ''}`}
                onClick={onSelect}
                disabled={loading || current}
            >
                {current ? 'Current Plan' : loading ? <span className="spinner" /> : 'Upgrade'}
            </button>
        </div>
    );
}

function tierLabel(tier) {
    const labels = {
        free: 'Free',
        launch_offer: 'Launch Offer',
        pro: 'Plukrr Monthly',
        lifetime: 'Plukrr Lifetime',
    };
    return labels[tier] || tier;
}
