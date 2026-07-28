import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

import EditCompanyModal from '../components/modals/EditCompanyModal';
import JobCard from '../components/jobs/JobCard';
import DeafAccessibleBadge from '../components/common/DeafAccessibleBadge';
import StatusBadge from '../components/common/StatusBadge'; 
import BackButton from '../components/common/BackButton'; 
import ProfileBanner from '../components/profile/ProfileBanner'; 
import Avatar from '../components/common/Avatar';
import EmptyState from '../components/common/EmptyState'; 
import { formatLocation } from '../utils/formatUtils';
import { formatStandardDate } from '../utils/dateUtils';

export default function CompanyProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, role } = useAuth(); 
  
  const [company, setCompany] = useState(null);
  const [companyJobs, setCompanyJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [refreshData, setRefreshData] = useState(0);

  useEffect(() => {
    async function fetchCompanyData() {
      setIsLoading(true);

      const { data: companyData } = await supabase
        .from('companies')
        .select('*, locations(*), company_contacts(*)')
        .eq('id', id)
        .single();
        
      if (companyData) setCompany(companyData);
      
      if (companyData) {
        const { data: jobsData } = await supabase
          .from('jobs')
          .select('*')
          .eq('company_id', id)
          .eq('status', 'Approved') 
          .order('created_at', { ascending: false });

        if (jobsData) {
          // 🚨 UPDATED: Removed ownership bypass. Expired jobs hide entirely on profile.
          const mappedJobs = jobsData
            .filter(job => {
              const isDeadlinePassed = job.closing_date ? new Date(job.closing_date) < new Date(new Date().setHours(0,0,0,0)) : false;
              if (role === 'admin') return true;
              return !isDeadlinePassed;
            })
            .map(job => ({
              ...job,
              company: companyData.name,
              date: formatStandardDate(job.created_at),
              is_deaf_accessible: companyData.is_deaf_accessible,
              has_interpreters: companyData.has_interpreters,
              has_trained_staff: companyData.has_trained_staff,
              has_visual_alarms: companyData.has_visual_alarms,
              has_captioning: companyData.has_captioning
            }));
          setCompanyJobs(mappedJobs);
        }
      }
      setIsLoading(false);
    }
    fetchCompanyData();
  }, [id, refreshData]); 

  async function handleUpdateStatus(newStatus) {
    if (role !== 'admin') return;
    const updatePayload = { status: newStatus };
    if (newStatus === 'Active') updatePayload.approved_at = new Date().toISOString();

    const { error } = await supabase.from('companies').update(updatePayload).eq('id', company.id);
    if (!error) {
      setCompany({ ...company, status: newStatus });
    } else {
      alert("Failed to update status.");
    }
  }

  async function handleFeatureToggle(featureKey, newValue) {
    if (role !== 'admin') return;
    
    const updatedCompany = { ...company, [featureKey]: newValue };
    
    const isNowAccessible = !!(
      updatedCompany.has_interpreters || 
      updatedCompany.has_trained_staff || 
      updatedCompany.has_visual_alarms || 
      updatedCompany.has_captioning
    );

    const updatePayload = { 
      [featureKey]: newValue,
      is_deaf_accessible: isNowAccessible 
    };

    const { error } = await supabase.from('companies').update(updatePayload).eq('id', company.id);
    
    if (!error) {
      setCompany({ ...updatedCompany, is_deaf_accessible: isNowAccessible });
    } else {
      console.error(error);
      alert("Failed to update accessibility status.");
    }
  }

  if (isLoading) return <div className="page-container-wide text-center mt-32"><p className="text-secondary">Loading company profile...</p></div>;
  if (!company) return <div className="page-container-wide text-center mt-32"><h2>🏢</h2><p className="text-secondary">Company not found.</p></div>;

  const isOwnProfile = currentUser?.id === id;
  const isAdmin = role === 'admin';

  if (!isAdmin && !isOwnProfile && (company.status === 'Archived' || company.status === 'Rejected')) {
    return (
      <div className="page-container-wide text-center mt-32">
        <h2 style={{ fontSize: '3rem', margin: '0 0 16px 0' }}>🏢</h2>
        <h3 className="m-0 mb-8">Profile Unavailable</h3>
        <p className="text-secondary">This company profile is currently disabled or under review.</p>
        <button className="btn-outline mt-24" onClick={() => navigate('/companies')}>View Active Companies</button>
      </div>
    );
  }
  
  const loc = company.locations || {};
  const locationText = formatLocation(loc.city, loc.country, '');
  
  const contact = company.company_contacts && company.company_contacts.length > 0 ? company.company_contacts[0] : {};
  const hasContact = role !== 'guest' && (contact.name || contact.email || contact.contact_number);
  const currentStatus = company.status === 'Approved' ? 'Active' : (company.status || 'Active');

  const hasDeafBadge = company.has_interpreters || company.has_trained_staff || company.has_visual_alarms || company.has_captioning;

  return (
    <div className="page-container-wide">
      
      <BackButton />

      {isEditing && (
        <EditCompanyModal 
          companyId={company.id}
          onClose={() => { setIsEditing(false); setRefreshData(prev => prev + 1); }} 
        />
      )}

      <ProfileBanner 
        avatarSrc={company.logo_url}
        fallbackName={company.name}
        avatarType="company"
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {company.name}
            
            {isOwnProfile && ['Archived', 'Rejected'].includes(company.status) && (
              <span style={{ 
                background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', 
                fontSize: '0.85rem', padding: '4px 12px', borderRadius: '12px', fontWeight: 'bold' 
              }}>
                Account Disabled
              </span>
            )}

            {hasDeafBadge && role !== 'guest' && <DeafAccessibleBadge size="lg" showText={true} features={company} isAccessible={company.is_deaf_accessible} />}
          </div>
        }
        subtitle={
          <>
            {locationText && <span className="text-secondary text-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>📍 {locationText}</span>}
            {company.website && (
              <span className="text-secondary text-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                🌐 <a href={company.website} target="_blank" rel="noreferrer" className="text-primary" style={{ color: 'var(--primary-color)', fontWeight: '500' }}>
                  {company.website.replace(/^https?:\/\//, '')}
                </a>
              </span>
            )}
          </>
        }
        actionButton={
          isOwnProfile ? (
            <button className="btn-outline" onClick={() => setIsEditing(true)}>⚙️ Edit Profile</button>
          ) : null
        }
      />

      {isAdmin && (
        <div className="card p-24 mb-32 flex-col gap-16" style={{ border: '1px solid var(--primary-color)', background: 'var(--card-bg)' }}>
          <div className="flex-between align-center flex-wrap gap-16">
            <div className="flex-row gap-12 align-center">
              <strong style={{ color: 'var(--primary-color)' }}>Admin Controls:</strong>
              <StatusBadge status={currentStatus} />
            </div>
            <div className="flex-row gap-8 flex-wrap">
              {currentStatus !== 'Active' && <button className="btn-outline btn-sm" onClick={() => handleUpdateStatus('Active')} style={{ borderColor: '#86efac', color: '#166534', background: '#ecfdf5' }}>Set Active</button>}
              {currentStatus !== 'Inactive' && <button className="btn-outline btn-sm" onClick={() => handleUpdateStatus('Inactive')} style={{ borderColor: '#fde047', color: '#854d0e', background: '#fefce8' }}>Set Inactive</button>}
              {currentStatus !== 'Archived' && <button className="btn-outline btn-sm" onClick={() => handleUpdateStatus('Archived')} style={{ borderColor: '#d1d5db', color: '#374151', background: '#f9fafb' }}>Archive</button>}
            </div>
          </div>
          
          <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
            <strong className="text-sm text-secondary" style={{ display: 'block', marginBottom: '12px' }}>Deaf Accessibility Certifications (Checking any box awards the badge)</strong>
            <div className="flex-row gap-24 flex-wrap">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' }}>
                <input type="checkbox" checked={!!company.has_interpreters} onChange={(e) => handleFeatureToggle('has_interpreters', e.target.checked)} style={{ width: '16px', height: '16px' }} />
                Sign Language Interpreters
              </label>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' }}>
                <input type="checkbox" checked={!!company.has_trained_staff} onChange={(e) => handleFeatureToggle('has_trained_staff', e.target.checked)} style={{ width: '16px', height: '16px' }} />
                Sign Language Trained Staff
              </label>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' }}>
                <input type="checkbox" checked={!!company.has_visual_alarms} onChange={(e) => handleFeatureToggle('has_visual_alarms', e.target.checked)} style={{ width: '16px', height: '16px' }} />
                Visual Emergency Alarms
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' }}>
                <input type="checkbox" checked={!!company.has_captioning} onChange={(e) => handleFeatureToggle('has_captioning', e.target.checked)} style={{ width: '16px', height: '16px' }} />
                Captioned Meetings & Training
              </label>
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-layout">
        <div className="flex-col gap-32">
          <div className="card p-24">
            <h3 className="mb-16 m-0">About Us</h3>
            <p className="text-secondary" style={{ lineHeight: '1.7', whiteSpace: 'pre-wrap', margin: 0 }}>
              {company.description || "This company hasn't added a description yet."}
            </p>
          </div>

          <div>
            <h3 className="mb-16 m-0">Active Job Postings</h3>
            {role === 'guest' ? (
              <EmptyState 
                title="Sign In To View Active Jobs"
                message={`Create a free account to view open positions, salary details, and apply directly to ${company.name}!`}
                actionButton={
                  <button className="btn-black" style={{ padding: '12px 24px', fontSize: '1rem' }} onClick={() => navigate('/login')}>
                    Sign In
                  </button>
                }
                style={{ border: '2px dashed var(--border-color)', backgroundColor: 'transparent', boxShadow: 'none' }}
              />
            ) : companyJobs.length > 0 ? (
              <div className="flex-col gap-16">
                {companyJobs.map(job => (
                  <JobCard key={job.id} job={job} isSelected={false} onClick={() => navigate('/jobs', { state: { selectedJobId: job.id } })} role={role} />
                ))}
              </div>
            ) : (
              <EmptyState 
                icon="📭"
                message="No active job postings at the moment."
              />
            )}
          </div>
        </div>

        <div style={{ position: 'sticky', top: '90px' }}>
          <div className="card p-24">
            <h3 className="mb-16 m-0">Company Details</h3>
            {role === 'guest' ? (
              <p className="text-secondary text-sm italic m-0">Please sign in to view company details.</p>
            ) : (
              <div className="flex-col gap-16">
                <div style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                  <span className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>Industry</span>
                  <strong style={{ fontSize: '1rem' }}>{company.industry || 'Not specified'}</strong>
                </div>
                <div style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                  <span className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>Founded</span>
                  <strong style={{ fontSize: '1rem' }}>{company.founded_year || 'Not specified'}</strong>
                </div>
                <div>
                  <span className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>Headquarters</span>
                  <strong style={{ fontSize: '1rem' }}>{locationText || 'Not specified'}</strong>
                </div>
              </div>
            )}
          </div>

          {hasContact && (
            <div className="card p-24" style={{ marginTop: '24px' }}>
              <h3 className="mb-16 m-0">Representative</h3>
              <div className="flex-row gap-16 align-center">
                <Avatar src={contact.profile_pic_url} fallbackName={contact.name} size="md" type="user" />
                <div style={{ overflow: 'hidden' }}>
                  <strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {contact.name || 'Contact Person'}
                  </strong>
                  {contact.email && <span className="text-sm text-secondary" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '2px' }}>✉️ {contact.email}</span>}
                  {contact.contact_number && <span className="text-sm text-secondary" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📞 {contact.contact_number}</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}