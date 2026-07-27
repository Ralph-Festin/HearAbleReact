import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate, useLocation, Link } from 'react-router-dom';

export default function Login({ setRole }) {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [isLogin, setIsLogin] = useState(!location.state?.isSignUp);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); // 🚨 NEW: State for password visibility
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    setErrorMsg('');
    setSuccessMsg('');
    setEmail('');
    setPassword('');
    setShowPassword(false); // Reset visibility when switching tabs
  }, [isLogin]);

  async function handleAuth(e) {
    e.preventDefault();
    setLoading(true); 
    setErrorMsg(''); 
    setSuccessMsg('');

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await routeUserAfterLogin(data.user);
      } else {

        // Enforces at least 1 lowercase (?=.*[a-z]), 1 uppercase (?=.*[A-Z]), 1 number (?=.*\d), 1 special char, and min 8 chars
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
        if (!passwordRegex.test(password)) {
          setErrorMsg('Password must be at least 8 characters long and contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.');
          setLoading(false);
          return;
        }

        const { data: adminData } = await supabase.from('admins').select('email').eq('email', email.toLowerCase()).maybeSingle();
        const { data: preApprovedData } = await supabase.from('pre_approved_companies').select('*').eq('email', email.toLowerCase()).maybeSingle();

        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        if (data.user && preApprovedData) {
          await supabase.from('companies').insert([{
            id: data.user.id, 
            name: preApprovedData.name, 
            location_id: preApprovedData.location_id, 
            industry: preApprovedData.industry, 
            founded_year: preApprovedData.founded_year,  
            website: preApprovedData.website, 
            description: preApprovedData.description,    
            status: 'Approved'
          }]);
        }

        if (data.user && !data.session) {
          setSuccessMsg('Registration successful! Please check your email inbox for a verification link to activate your account.');
          setLoading(false);
          return; 
        }

        const returnTo = location.state?.returnTo || '/';
        const returnState = location.state?.returnState || null;

        if (adminData || email.toLowerCase() === 'admin@hearable.com') {
          setRole('admin'); 
          navigate('/');
        } else if (preApprovedData) {
          setRole('company'); 
          navigate('/');
        } else {
          setRole('needs_onboarding'); 
          navigate('/onboarding', { state: { returnTo, returnState } });
        }
      }
    } catch (err) { 
      if (err.message.includes('Email not confirmed')) {
        setErrorMsg('Please verify your email address first. Check your inbox for the activation link.');
      } else {
        setErrorMsg(err.message); 
      }
    } finally { 
      setLoading(false); 
    }
  }

  async function handleForgotPassword() {
    if (!email) return setErrorMsg('Please enter your email address in the field above first.');
    
    setLoading(true); 
    setErrorMsg(''); 
    setSuccessMsg('');
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    
    setLoading(false);
    
    if (error && error.status === 429) {
      setErrorMsg('Too many requests. Please wait a minute and try again.');
    } else {
      setSuccessMsg('If an account with that email exists, a password reset link has been sent!');
    }
  }

  async function routeUserAfterLogin(user) {
    try {
      const returnTo = location.state?.returnTo || '/';
      const returnState = location.state?.returnState || null;

      const { data: adminData } = await supabase.from('admins').select('email').eq('email', user.email).maybeSingle();
      if (adminData || user.email === 'admin@hearable.com') { 
        setRole('admin'); 
        navigate('/'); 
        return; 
      }

      const { data: companyData } = await supabase.from('companies').select('id').eq('id', user.id).maybeSingle();
      if (companyData) { 
        setRole('company'); 
        navigate('/'); 
        return; 
      }

      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      
      if (!profileData || !profileData.first_name || !profileData.degree_id) {
        setRole('needs_onboarding'); 
        navigate('/onboarding', { state: { returnTo, returnState } });
      } else if (profileData.status === 'Pending') {
        setRole('pending_user'); 
        navigate(returnTo, { state: returnState });
      } else if (profileData.status === 'Rejected') {
        setRole('rejected_user'); 
        navigate('/');
      } else {
        setRole('user'); 
        navigate(returnTo, { state: returnState });
      }
    } catch (error) { 
      console.error("Routing error:", error); 
    }
  }

  return (
    <div className="page-container flex-col align-center" style={{ justifyContent: 'center', minHeight: '80vh' }}>
      <div className="card p-0 w-full" style={{ maxWidth: '400px', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}>
        
        <div className="flex-row" style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
          <button 
            onClick={() => setIsLogin(true)} 
            style={{ flex: 1, padding: '16px', border: 'none', background: 'none', fontSize: '1rem', fontWeight: isLogin ? '600' : '400', color: isLogin ? 'var(--primary-color)' : 'var(--secondary-text)', borderBottom: isLogin ? '2px solid var(--primary-color)' : '2px solid transparent', cursor: 'pointer' }}
          >
            Sign In
          </button>
          <button 
            onClick={() => setIsLogin(false)} 
            style={{ flex: 1, padding: '16px', border: 'none', background: 'none', fontSize: '1rem', fontWeight: !isLogin ? '600' : '400', color: !isLogin ? 'var(--primary-color)' : 'var(--secondary-text)', borderBottom: !isLogin ? '2px solid var(--primary-color)' : '2px solid transparent', cursor: 'pointer' }}
          >
            Sign Up
          </button>
        </div>

        <div className="p-32">
          <div className="text-center mb-24">
            <h2 className="m-0 mb-8">{isLogin ? 'Welcome Back' : 'Create an Account'}</h2>
            <p className="text-secondary text-sm m-0">
              {isLogin ? 'Enter your details to access your account.' : 'Join the Hearable network today.'}
            </p>
          </div>

          {errorMsg && <div className="mb-16" style={{ background: '#fef2f2', color: '#dc2626', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', border: '1px solid #fecaca' }}>{errorMsg}</div>}
          {successMsg && <div className="mb-16" style={{ background: '#f0fdf4', color: '#166534', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', border: '1px solid #bbf7d0' }}>{successMsg}</div>}

          <form onSubmit={handleAuth} className="flex-col gap-16">
            <div>
              <label className="block mb-8 text-sm font-bold">Email Address</label>
              <input 
                type="email" 
                className="search-input w-full" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                autoComplete={isLogin ? "username" : "off"} 
              />
            </div>
            
            <div>
              <div className="flex-between align-center mb-8">
                <label className="m-0 text-sm font-bold">Password</label>
                {isLogin && (
                  <button type="button" onClick={handleForgotPassword} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, fontWeight: '500' }}>
                    Forgot Password?
                  </button>
                )}
              </div>
              
              {/* 🚨 UPDATED: Relative container for the password input and eye toggle */}
              <div style={{ position: 'relative' }}>
                <input 
                  type={showPassword ? "text" : "password"} 
                  className="search-input w-full" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                  minLength={isLogin ? "6" : "8"} 
                  autoComplete={isLogin ? "current-password" : "new-password"} 
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--secondary-text)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0
                  }}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  )}
                </button>
              </div>

              {!isLogin && <p className="text-secondary mt-8" style={{ fontSize: '0.75rem' }}>Must be at least 8 characters and include 1 uppercase, 1 lowercase, 1 number, and 1 special character.</p>}
            </div>

            <button type="submit" className="btn-black w-full mt-16" disabled={loading} style={{ padding: '12px' }}>
              {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <div className="text-center mt-24">
            <p className="text-secondary m-0" style={{ fontSize: '0.8rem', lineHeight: '1.5' }}>
              By continuing, you agree to HearAble's{' '}
              <Link to="/terms" style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: '600' }}>
                User Agreement
              </Link>
              ,{' '}
              <Link to="/privacy-policy" style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: '600' }}>
                Privacy Policy
              </Link>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}