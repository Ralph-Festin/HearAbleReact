import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

import StatusBadge from '../components/common/StatusBadge';
import Avatar from '../components/common/Avatar';
import SearchBar from '../components/common/SearchBar';
import { formatFullName } from '../utils/formatUtils';
import Modal from '../components/common/Modal'; 
import BackButton from '../components/common/BackButton'; 
import EmptyState from '../components/common/EmptyState'; 
import FilterSelect from '../components/common/FilterSelect'; 
import FormInput from '../components/common/FormInput'; 

export default function Applicants() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useAuth(); 
  
  // Data States
  const [applications, setApplications] = useState([]);
  const [availableJobs, setAvailableJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // UI & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState(() => location.state?.filterJobId ? 'all' : (localStorage.getItem('applicantsViewMode') || 'grouped')); 
  const [filterJobId, setFilterJobId] = useState(location.state?.filterJobId || 'all');
  
  const [statusFilter, setStatusFilter] = useState('All'); 
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  
  // Modal States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inspectModalApp, setInspectModalApp] = useState(null);
  const [previewResumeUrl, setPreviewResumeUrl] = useState(null);

  useEffect(() => {
    localStorage.setItem('applicantsViewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (['user', 'pending_user', 'rejected_user', 'guest'].includes(role)) {
      navigate('/');
      return;
    }
    fetchApplicants();
  }, [role, navigate]);

  useEffect(() => {
    if (applications.length > 0 && location.state?.inspectAppId) {
      const targetApp = applications.find(a => a.id === location.state.inspectAppId);
      if (targetApp && !inspectModalApp) {
        setInspectModalApp(targetApp);
        const newState = { ...location.state };
        delete newState.inspectAppId;
        navigate(location.pathname, { replace: true, state: newState });
      }
    }
  }, [applications, location.state, inspectModalApp, navigate]);

  // ------------------------------------------------------------------
  // Data Fetching
  // ------------------------------------------------------------------
  async function fetchApplicants() {
    setIsLoading(true);
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const [appsData, jobsData, profilesData, companiesData, jobSkillsData, profileSkillsData, skillsData] = await Promise.all([
      supabase.from('applications').select('*, resumes(file_url)').order('id', { ascending: false }).then(res => res.data),
      supabase.from('jobs').select('*').then(res => res.data),
      supabase.from('profiles').select('*').then(res => res.data),
      supabase.from('companies').select('*').then(res => res.data),
      supabase.from('job_skills').select('*').then(res => res.data),
      supabase.from('profile_skills').select('*').then(res => res.data),
      supabase.from('skills').select('*').then(res => res.data)
    ]);

    if (appsData && jobsData) {
      let mappedApps = appsData.map(app => {
        const job = jobsData.find(j => j.id === app.job_id) || {};
        const profile = profilesData?.find(p => p.id === app.applicant_id) || {};
        const company = companiesData?.find(c => c.id === job.company_id) || {};
        
        const pSkills = profileSkillsData?.filter(ps => ps.profile_id === app.applicant_id).map(ps => ps.skill_id) || [];
        const jSkills = jobSkillsData?.filter(js => js.job_id === app.job_id).map(js => js.skill_id) || [];
        const matchPercentage = jSkills.length > 0 ? Math.round((pSkills.filter(s => jSkills.includes(s)).length / jSkills.length) * 100) : 0;

        return {
          ...app,
          job_title: job.title || 'Unknown Job',
          company_id: job.company_id,
          company_name: company.name || 'Unknown Company',
          applicant_name: formatFullName(profile.first_name, profile.last_name, 'Unknown Candidate'),
          applicant_pic: profile.profile_pic || '',
          resume_url: app.resumes?.file_url || null,
          matchPercentage,
          hasSkillsRequired: jSkills.length > 0
        };
      });

      let mappedJobs = jobsData.map(job => {
        const company = companiesData?.find(c => c.id === job.company_id) || {};
        const requiredSkillNames = skillsData?.filter(s => jobSkillsData?.some(js => js.job_id === job.id && js.skill_id === s.id)).map(s => s.name) || [];
        
        return {
          ...job,
          company_name: company.name || 'Unknown Company',
          company_logo: company.logo_url || '',
          required_skills: requiredSkillNames.length > 0 ? requiredSkillNames.join(', ') : 'None specified'
        };
      });

      if (role === 'company') {
        mappedApps = mappedApps.filter(app => app.company_id === session.user.id);
        mappedJobs = mappedJobs.filter(j => j.company_id === session.user.id);
      }
      
      setAvailableJobs(mappedJobs);
      setApplications(mappedApps);
    }
    setIsLoading(false);
  }

  // ------------------------------------------------------------------
  // Actions 
  // ------------------------------------------------------------------
  async function updateApplicantStatus(app, newStatus, notifTitle, notifMessage) {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('applications').update({ status: newStatus }).eq('id', app.id);
      if (error) throw error;

      setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: newStatus } : a));
      await supabase.from('notifications').insert([{ user_id: app.applicant_id, title: notifTitle, message: notifMessage, link: `/user-jobs` }]);
      return true;
    } catch (error) {
      console.error(error);
      alert(`Failed to update status to ${newStatus}.`);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleViewResume = (resumeUrl) => {
    if (!resumeUrl) return alert("No resume file found for this applicant.");
    window.open(resumeUrl, '_blank', 'noopener,noreferrer');
  };

  const handleInspectModalStatusChange = async (app, newStatus, message) => {
    if (newStatus === 'Interviewing') {
      const defaultMsg = `You have been invited to an interview for ${app.job_title} at ${app.company_name}. Check your email or messages for details.`;
      const notifMsg = message ? message : defaultMsg;
      
      const success = await updateApplicantStatus(app, 'Interviewing', 'Interview Request! 🎉', notifMsg);
      if (success) {
        alert('Interview request sent!');
        setInspectModalApp(null);
      }
    } else if (newStatus === 'Rejected') {
      const defaultMsg = `Your application for ${app.job_title} at ${app.company_name} was rejected.`;
      const notifMsg = message ? message : defaultMsg;
      
      const success = await updateApplicantStatus(app, 'Rejected', 'Application Update', notifMsg);
      if (success) setInspectModalApp(null);
    } else if (newStatus === 'Hired') {
      const defaultMsg = `Congratulations! You have been hired for the ${app.job_title} position at ${app.company_name}.`;
      const notifMsg = message ? message : defaultMsg;

      const success = await updateApplicantStatus(app, 'Hired', 'You Got the Job! 🎉', notifMsg);
      if (success) {
        alert(`${app.applicant_name} has been hired successfully!`);
        setInspectModalApp(null);
      }
    }
  };

  // ------------------------------------------------------------------
  // Computed Data for Rendering
  // ------------------------------------------------------------------
  
  const displayApps = applications.filter(app => {
    const matchesJob = filterJobId === 'all' || app.job_id === filterJobId;
    const matchesSearch = app.applicant_name.toLowerCase().includes(searchQuery.toLowerCase()) || app.job_title.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesStatus = true;
    if (statusFilter === 'Under Review') {
      matchesStatus = app.status === 'Pending' || app.status === 'Under Review' || !app.status;
    } else if (statusFilter !== 'All') {
      matchesStatus = app.status === statusFilter;
    }

    return matchesJob && matchesSearch && matchesStatus;
  });

  const jobGroups = availableJobs.map(job => ({
    ...job, applicantCount: applications.filter(app => app.job_id === job.id).length
  })).filter(job => job.title.toLowerCase().includes(searchQuery.toLowerCase())); 

  const selectedJob = availableJobs.find(j => j.id === filterJobId);

  // ------------------------------------------------------------------
  // Main Render
  // ------------------------------------------------------------------
  return (
    <div className="page-container-wide">
      
      {/* Header & Controls */}
      {filterJobId === 'all' ? (
        <div className="mb-32 flex-col gap-16">
          <div className="flex-between align-center" style={{ flexWrap: 'wrap', gap: '16px' }}>
            <div className="flex-row align-center gap-16 flex-wrap">
              <h1 className="m-0">{role === 'admin' ? 'Manage Jobs' : 'Manage Applicants'}</h1>
              {role === 'admin' && (
                <div className="flex-row" style={{ background: 'var(--bg-color)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <button onClick={() => navigate('/jobs')} style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', fontWeight: '500', cursor: 'pointer', background: 'transparent', color: 'var(--secondary-text)' }}>Job Postings</button>
                  <button onClick={() => navigate('/applicants')} style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', fontWeight: '500', cursor: 'pointer', background: 'var(--card-bg)', color: 'var(--text-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>Applicants</button>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex-row gap-16 flex-wrap">
            <SearchBar value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={viewMode === 'grouped' ? "Search job postings..." : "Search candidates or job titles..."} style={{ flex: 1, minWidth: '250px' }} />
            
            {viewMode === 'all' && (
              <FilterSelect 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: 'All', label: 'All' },
                  { value: 'Under Review', label: 'Underreview' },
                  { value: 'Interviewing', label: 'For Interview' },
                  { value: 'Hired', label: 'Hired' },
                  { value: 'Rejected', label: 'Rejected' }
                ]}
                style={{ minWidth: '180px' }}
              />
            )}

            <FilterSelect 
              value={viewMode} 
              onChange={(e) => { 
                setViewMode(e.target.value); 
                if (e.target.value === 'grouped') {
                  setFilterJobId('all'); 
                  setStatusFilter('All'); 
                }
              }}
              options={[
                { value: 'grouped', label: 'View: Group by Job Post' },
                { value: 'all', label: 'View: All Applicants' }
              ]}
              style={{ minWidth: '220px' }}
            />
          </div>
        </div>
      ) : (
        <div className="mb-32 flex-col align-start">
          <BackButton onClick={() => { 
            if (location.state?.filterJobId) {
              navigate('/jobs', { state: { selectedJobId: location.state.filterJobId } });
            } else {
              setFilterJobId('all'); 
              setViewMode('grouped'); 
              setStatusFilter('All'); 
            }
          }} />
          <JobDetailsCard job={selectedJob} onShowSkills={() => setShowSkillsModal(true)} />
          
          <div className="mt-16">
            <FilterSelect 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'All', label: 'All' },
                { value: 'Under Review', label: 'Underreview' },
                { value: 'Interviewing', label: 'For Interview' },
                { value: 'Hired', label: 'Hired' },
                { value: 'Rejected', label: 'Rejected' }
              ]}
              style={{ minWidth: '180px' }}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {isLoading ? (
        <p className="text-center text-secondary">Loading applications...</p>
      ) : viewMode === 'grouped' && filterJobId === 'all' ? (
        jobGroups.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
            {jobGroups.map(group => (
              <JobGroupCard key={group.id} group={group} role={role} onClick={() => { setFilterJobId(group.id); setViewMode('all'); }} />
            ))}
          </div>
        ) : <EmptyState icon="📭" title="No job posts found" message="Try clearing your search query or posting a new job." />
      ) : (
        displayApps.length > 0 ? (
          <div className="flex-col gap-16">
            {displayApps.map(app => (
              <ApplicantCard 
                key={app.id} app={app} role={role} 
                onInspectClick={() => setInspectModalApp(app)}
              />
            ))}
          </div>
        ) : <EmptyState icon="📥" title="No applicants match this filter" message="Try changing your status filter or search query." />
      )}

      {/* Modals */}
      <SkillsModal isOpen={showSkillsModal} job={selectedJob} onClose={() => setShowSkillsModal(false)} />
      
      <InspectApplicantModal 
        isOpen={!!inspectModalApp} 
        onClose={() => setInspectModalApp(null)} 
        app={inspectModalApp} 
        navigate={navigate} 
        handleViewResume={handleViewResume} 
        onPreviewResume={(url) => setPreviewResumeUrl(url)} 
        onStatusChange={handleInspectModalStatusChange}
        role={role}
      />
      
      <ResumePreviewModal isOpen={!!previewResumeUrl} resumeUrl={previewResumeUrl} onClose={() => setPreviewResumeUrl(null)} />

    </div>
  );
}

// ----------------------------------------------------------------------
// Extracted UI Components
// ----------------------------------------------------------------------

function JobGroupCard({ group, role, onClick }) {
  return (
    <div className="card p-24 hover-lift" style={{ cursor: 'pointer', border: '1px solid var(--border-color)', minWidth: 0 }} onClick={onClick}>
      <div className="flex-row gap-16 align-center mb-24" style={{ minWidth: 0 }}>
        <div style={{ flexShrink: 0 }}><Avatar src={group.company_logo} fallbackName={group.company_name} type="company" size="md" /></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 className="m-0 mb-4 text-truncate" style={{ fontSize: '1.1rem' }}>{group.title}</h3>
          {role === 'admin' && <p className="text-secondary text-sm m-0 text-truncate">{group.company_name}</p>}
        </div>
      </div>
      <div className="flex-between align-center" style={{ paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
        <span style={{ fontWeight: '600', color: group.applicantCount > 0 ? 'var(--primary-color)' : 'var(--secondary-text)' }}>
          👥 {group.applicantCount} {group.applicantCount === 1 ? 'Applicant' : 'Applicants'}
        </span>
        <span className="text-primary text-sm" style={{ fontWeight: '500' }}>View List →</span>
      </div>
    </div>
  );
}

function JobDetailsCard({ job, onShowSkills }) {
  const skillsArray = job?.required_skills && job.required_skills !== 'None specified' ? job.required_skills.split(', ') : [];
  
  return (
    <div className="card p-24 w-full">
      <h2 style={{ margin: '0 0 16px 0', color: 'var(--primary-color)' }}>{job?.title || 'Job Posting'}</h2>
      <div className="flex-col gap-12">
        <div className="flex-row align-center gap-8">
          <strong className="text-secondary">Type:</strong>
          <span style={{ fontSize: '1rem', fontWeight: '500' }}>{job?.type || 'Not specified'}</span>
        </div>
        <div>
          <strong className="text-secondary block mb-8">Required Skills:</strong>
          <div className="flex-row-wrap gap-8 align-center">
            {skillsArray.length > 0 ? (
              <>
                {skillsArray.slice(0, 3).map((skill, index) => <span key={index} className="badge badge-neutral">{skill}</span>)}
                {skillsArray.length > 3 && <button className="btn-outline btn-sm" style={{ padding: '4px 8px', fontSize: '0.85rem' }} onClick={onShowSkills}>View More (+{skillsArray.length - 3})</button>}
              </>
            ) : <span className="text-secondary text-sm">No skills specified</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ApplicantCard({ app, role, onInspectClick }) {
  const matchColor = app.matchPercentage >= 80 ? '#065f46' : app.matchPercentage >= 50 ? '#b45309' : '#991b1b';
  const matchBg = app.matchPercentage >= 80 ? '#ecfdf5' : app.matchPercentage >= 50 ? '#fffbeb' : '#fef2f2';
  const matchBorder = app.matchPercentage >= 80 ? '#a7f3d0' : app.matchPercentage >= 50 ? '#fde68a' : '#fecaca';

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="flex-between-start" style={{ padding: '24px' }}>
        <div className="flex-row gap-16" style={{ minWidth: 0, flex: 1, paddingRight: '16px' }}>
          <div style={{ flexShrink: 0 }}><Avatar src={app.applicant_pic} fallbackName={app.applicant_name} type="user" size="md" /></div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 className="text-lg m-0 mb-4 text-truncate" title={app.applicant_name}>{app.applicant_name}</h3>
            <p className="text-sm text-secondary m-0 text-truncate" title={app.job_title}>Applied for: <strong className="text-primary">{app.job_title}</strong></p>
            {role === 'admin' && <p className="text-sm text-secondary mt-4 m-0 text-truncate" title={app.company_name}>{app.company_name}</p>}
          </div>
        </div>
        <div className="flex-col align-end gap-8" style={{ flexShrink: 0 }}>
          <StatusBadge status={app.status || 'Pending'} />
          {app.hasSkillsRequired ? (
            <span style={{ background: matchBg, color: matchColor, border: `1px solid ${matchBorder}`, padding: '4px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              {app.matchPercentage}% Match
            </span>
          ) : <span className="text-sm text-secondary font-medium">No Job Skills Set</span>}
        </div>
      </div>
      
      <div className="flex-between align-center flex-wrap gap-24" style={{ padding: '16px 24px', background: 'var(--bg-color)', borderTop: '1px solid var(--border-color)', borderBottomLeftRadius: 'inherit', borderBottomRightRadius: 'inherit' }}>
        <button className="btn-outline btn-sm" onClick={onInspectClick} style={{ background: 'var(--card-bg)' }}>🔍 Inspect Job Seeker</button>
        
        {(() => {
          const getStage = (status) => {
            if (['Hired', 'Rejected'].includes(status)) return 3;
            if (status === 'Interviewing') return 2;
            return 1; 
          };
          
          const stage = getStage(app.status);
          const isRejected = app.status === 'Rejected';
          const isHired = app.status === 'Hired';
          
          const stage3Color = isRejected ? '#dc2626' : (isHired ? '#10b981' : 'var(--border-color)');
          const stage3TextColor = isRejected ? '#dc2626' : (isHired ? '#10b981' : 'var(--secondary-text)');

          return (
            <div className="flex-row gap-4" style={{ flex: 1, minWidth: '180px', maxWidth: '300px' }}>
              
              <div className="flex-col gap-4" style={{ flex: 1, alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase', color: stage >= 1 ? 'var(--text-color)' : 'var(--secondary-text)' }}>Viewing</span>
                <div style={{ height: '4px', width: '100%', borderRadius: '2px', background: stage >= 1 ? 'var(--primary-color)' : 'var(--border-color)' }}></div>
              </div>
              
              <div className="flex-col gap-4" style={{ flex: 1, alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase', color: stage >= 2 ? 'var(--text-color)' : 'var(--secondary-text)' }}>Interview</span>
                <div style={{ height: '4px', width: '100%', borderRadius: '2px', background: stage >= 2 ? 'var(--primary-color)' : 'var(--border-color)' }}></div>
              </div>
              
              <div className="flex-col gap-4" style={{ flex: 1, alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase', color: stage >= 3 ? stage3TextColor : 'var(--secondary-text)' }}>Decision</span>
                <div style={{ height: '4px', width: '100%', borderRadius: '2px', background: stage >= 3 ? stage3Color : 'var(--border-color)' }}></div>
              </div>

            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Modals 
// ----------------------------------------------------------------------

function SkillsModal({ isOpen, job, onClose }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="All Required Skills" maxWidth="400px">
      <div className="flex-row-wrap gap-8">
        {job?.required_skills?.split(', ').map((skill, index) => (
          <span key={index} className="badge badge-neutral" style={{ fontSize: '0.95rem', padding: '6px 12px' }}>
            {skill}
          </span>
        ))}
      </div>
    </Modal>
  );
}

function InspectApplicantModal({ isOpen, onClose, app, navigate, handleViewResume, onPreviewResume, onStatusChange, role }) {
  const [pendingAction, setPendingAction] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    setPendingAction(null);
    setStatusMessage('');
  }, [app]);

  if (!app) return null;

  const handleConfirmAction = () => {
    if (!pendingAction) return;
    onStatusChange(app, pendingAction, statusMessage);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Inspect Job Seeker" maxWidth="400px">
      <div className="flex-col gap-16">
        <div className="flex-row gap-16 align-center mb-8">
          <Avatar src={app.applicant_pic} fallbackName={app.applicant_name} type="user" size="lg" />
          <div>
            <h3 className="m-0" style={{ fontSize: '1.2rem' }}>{app.applicant_name}</h3>
            <p className="text-sm text-secondary m-0">{app.matchPercentage}% Skill Match</p>
          </div>
        </div>
        
        <button className="btn-outline w-full" onClick={() => { navigate(`/user/${app.applicant_id}`); onClose(); }}>👤 View Profile</button>
        <button className="btn-outline w-full" onClick={() => { if (!app.resume_url) return alert("No resume found."); onPreviewResume(app.resume_url); onClose(); }}>👁️ View Resume Preview</button>
        <button className="btn-outline w-full" onClick={() => { handleViewResume(app.resume_url); onClose(); }}>📄 View Resume PDF</button>

        {role !== 'admin' && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
            <h4 className="m-0 mb-16 text-secondary" style={{ fontSize: '0.9rem' }}>Application Actions</h4>
            
            {pendingAction ? (
              <div className="flex-col gap-8 p-16" style={{ background: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <label className="text-sm font-bold">
                  {pendingAction === 'Interviewing' ? 'Interview Details & Instructions' : pendingAction === 'Rejected' ? 'Reason for Rejection (Optional)' : 'Congratulatory Message (Optional)'}
                </label>
                <FormInput 
                  type="textarea"
                  placeholder={pendingAction === 'Interviewing' ? "e.g. Please join us for a Zoom interview on Friday at 2PM..." : "Add a message to the candidate..."}
                  value={statusMessage}
                  onChange={(e) => setStatusMessage(e.target.value)}
                />
                <div className="flex-row gap-8 mt-8">
                  <button className="btn-black" style={pendingAction === 'Hired' ? {background: '#10b981', borderColor: '#10b981'} : pendingAction === 'Rejected' ? {background: '#dc2626', borderColor: '#dc2626'} : {}} onClick={handleConfirmAction}>
                    Confirm {pendingAction}
                  </button>
                  <button className="btn-outline" onClick={() => { setPendingAction(null); setStatusMessage(''); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex-col gap-12">
                {/* 🚨 UPDATED: Removed Reject from Step 2, only allows scheduling interview */}
                {(app.status === 'Pending' || app.status === 'Under Review' || !app.status) && (
                  <>
                    <p className="text-sm m-0"><strong>Step 2:</strong> Invite this candidate to an interview to learn more about them.</p>
                    <div className="flex-row gap-8">
                      <button className="btn-black" onClick={() => setPendingAction('Interviewing')}>Schedule Interview</button>
                    </div>
                  </>
                )}
                
                {/* 🚨 UPDATED: Allowed infinite Interview scheduling, plus Decision routing */}
                {app.status === 'Interviewing' && (
                  <>
                    <p className="text-sm m-0"><strong>Step 3:</strong> Schedule another interview or make your final decision.</p>
                    <div className="flex-col gap-8">
                      <button className="btn-outline w-full" onClick={() => setPendingAction('Interviewing')}>Schedule Another Interview</button>
                      <div className="flex-row gap-8 mt-8">
                        <button className="btn-black flex-grow" style={{background: '#10b981', borderColor: '#10b981'}} onClick={() => setPendingAction('Hired')}>Hire Candidate</button>
                        <button className="btn-outline flex-grow" onClick={() => setPendingAction('Rejected')} style={{color: '#dc2626', borderColor: '#fecaca'}}>Reject</button>
                      </div>
                    </div>
                  </>
                )}
                
                {(app.status === 'Hired' || app.status === 'Rejected') && (
                  <div className="p-16 text-center" style={{ background: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <p className="text-sm text-secondary m-0">This application has been concluded as <strong style={{color: app.status === 'Hired' ? '#10b981' : '#dc2626'}}>{app.status}</strong>.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ResumePreviewModal({ isOpen, resumeUrl, onClose }) {
  if (!resumeUrl) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Resume Preview" maxWidth="800px">
      <div style={{ width: '100%', height: '75vh', backgroundColor: '#525659', margin: '-24px', overflow: 'hidden' }}>
        <iframe 
          src={`${resumeUrl}#view=FitH&toolbar=0`} 
          width="100%" 
          height="100%" 
          style={{ border: 'none', display: 'block' }} 
          title="Resume Preview" 
        />
      </div>
    </Modal>
  );
}