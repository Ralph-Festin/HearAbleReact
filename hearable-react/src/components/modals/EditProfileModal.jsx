import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import Avatar from '../common/Avatar';
import LocationSelect from '../common/LocationSelect';

export default function EditProfileModal({ isOpen, onClose, userId, onSuccess }) {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    profile_pic: '',
    headline: '',
    description: '', // 🚨 NEW: Added for the 'About Me' section
    city: '',
    country: '',
    contact_number: '',
    portfolio_url: ''
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && userId) {
      fetchUserData();
    }
  }, [isOpen, userId]);

  async function fetchUserData() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select(`*, locations ( city, country )`)
      .eq('id', userId)
      .maybeSingle();

    if (data && !error) {
      setFormData({
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        profile_pic: data.profile_pic || '',
        headline: data.headline || '',
        description: data.description || data.about || '', // 🚨 NEW: Fetches existing about data
        city: data.locations?.city || '',
        country: data.locations?.country || '',
        contact_number: data.contact_number || '',
        portfolio_url: data.portfolio_url || ''
      });
    }
    setIsLoading(false);
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleCountryChange = (val) => setFormData({ ...formData, country: val });
  const handleCityChange = (val) => setFormData({ ...formData, city: val });

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      let locationId = null;
      
      const safeCountry = String(formData.country).trim();
      const safeCity = String(formData.city).trim();

      if (safeCity || safeCountry) {
        const { data: locData, error: locError } = await supabase
          .from('locations')
          .insert([{ 
            city: safeCity || 'Not specified', 
            country: safeCountry || 'Not specified' 
          }])
          .select()
          .single();

        if (locData) {
          locationId = locData.id;
        }
      }

      const profileUpdatePayload = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        profile_pic: formData.profile_pic,
        headline: formData.headline,
        description: formData.description, // 🚨 NEW: Injects About Me into database update
        contact_number: formData.contact_number,
        portfolio_url: formData.portfolio_url
      };

      if (locationId) {
        profileUpdatePayload.location_id = locationId;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileUpdatePayload)
        .eq('id', userId);

      if (profileError) throw profileError;

      onSuccess(); 
      onClose(); 
    } catch (error) {
      console.error("Error updating profile:", error);
      alert("Failed to update profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      
      <div className="card p-32" style={{ width: '100%', maxWidth: '600px', margin: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 className="m-0 mb-24 text-2xl">Edit Profile</h2>

        {isLoading ? (
          <p className="text-center text-secondary">Loading your information...</p>
        ) : (
          <form onSubmit={handleSave} className="flex-col gap-24">
            
            <div className="flex-col gap-8">
              <label className="font-medium">Profile Picture URL</label>
              <div className="flex-row gap-16 align-center">
                <Avatar 
                  src={formData.profile_pic} 
                  fallbackName={formData.first_name || 'User'} 
                  size="md" 
                  type="user" 
                />
                <div className="w-full">
                  <input 
                    type="url" 
                    name="profile_pic" 
                    value={formData.profile_pic} 
                    onChange={handleChange} 
                    placeholder="Paste an image link (e.g., https://imgur.com/image.jpg)" 
                    className="input-field w-full" 
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', width: '100%' }} 
                  />
                </div>
              </div>
            </div>

            <div className="flex-row gap-16 flex-wrap">
              <div className="flex-col gap-8" style={{ flex: 1, minWidth: '200px' }}>
                <label className="font-medium">First Name</label>
                <input required type="text" name="first_name" value={formData.first_name} onChange={handleChange} className="input-field" style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
              </div>
              <div className="flex-col gap-8" style={{ flex: 1, minWidth: '200px' }}>
                <label className="font-medium">Last Name</label>
                <input required type="text" name="last_name" value={formData.last_name} onChange={handleChange} className="input-field" style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
              </div>
            </div>

            <div className="flex-col gap-8">
              <label className="font-medium">Headline</label>
              <input type="text" name="headline" value={formData.headline} onChange={handleChange} placeholder="e.g. Senior Frontend Developer" className="input-field" style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
            </div>

            {/* 🚨 NEW: About Me Text Area */}
            <div className="flex-col gap-8">
              <label className="font-medium">About Me</label>
              <textarea 
                name="description" 
                value={formData.description} 
                onChange={handleChange} 
                placeholder="Tell us a little bit about yourself..." 
                className="input-field" 
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', minHeight: '100px', resize: 'vertical' }} 
              />
            </div>

            <div className="flex-col gap-8">
              <label className="font-medium">Location</label>
              <LocationSelect 
                country={formData.country} 
                setCountry={handleCountryChange} 
                city={formData.city} 
                setCity={handleCityChange} 
              />
            </div>

            <div className="flex-col gap-8">
              <label className="font-medium">Contact Number</label>
              <input type="tel" name="contact_number" value={formData.contact_number} onChange={handleChange} className="input-field" style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
            </div>

            <div className="flex-col gap-8">
              <label className="font-medium">Portfolio URL</label>
              <input type="url" name="portfolio_url" value={formData.portfolio_url} onChange={handleChange} placeholder="e.g. https://github.com/yourusername" className="input-field" style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
            </div>

            <div className="flex-row gap-12 mt-16" style={{ justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
              <button type="button" className="btn-outline" onClick={onClose} disabled={isSaving}>
                Cancel
              </button>
              <button type="submit" className="btn-black" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>

          </form>
        )}
      </div>
    </div>
  );
}