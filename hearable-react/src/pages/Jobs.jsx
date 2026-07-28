import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

import { useJobs } from '../hooks/useJobs';
import JobCard from '../components/jobs/JobCard';
import JobDetailsPane from '../components/jobs/JobDetailsPane';
import SearchBar from '../components/common/SearchBar';
import JobFilters from '../components/common/JobFilters';
import RejectModal from '../components/modals/RejectModal';
import './Jobs.css'; 

export default function Jobs() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser, role } = useAuth();

  const { jobs, companies, isLoading, setJobs } = useJobs();

  const [selectedJobId, setSelectedJobId] = useState(null);
  
  const [savedJobs, setSavedJobs] = useState([]);
  const [appliedJobs, setAppliedJobs] = useState([]); 
  
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const [showApplyModal, setShowApplyModal] = useState(false);
  const [userResumes, setUserResumes] = useState([]);
  const [isLoadingResumes, setIsLoadingResumes] = useState(false);
  const [selectedResumeId, setSelectedResumeId] = useState('');
  
  const [newResumeTitle, setNewResumeTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null); // 🚨 NEW: Added file state to match UserResumes.jsx
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  
  const [applyModalTab, setApplyModalTab] = useState('select'); 

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);
  const [jobToReject, setJobToReject] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterModality, setFilterModality] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [filterDate, setFilterDate] = useState('All');
  
  const [adminStatusFilter, setAdminStatusFilter] = useState(location.state?.activeTab || (role === 'admin' ? 'Approved' : 'Active')); 

  useEffect(() => {
    if (location.state?.activeTab) {
      setAdminStatusFilter(location.state.activeTab);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    if (currentUser) fetchUserData();
    if (location.state?.selectedJobId) {
      setSelectedJobId(location.state.selectedJobId);
    }
  }, [currentUser, location.state?.selectedJobId]);

  useEffect(() => {
    if (location.state?.openApply && role === 'user' && selectedJobId === location.state?.selectedJobId) {
      const newState = { ...location.state };
      delete newState.openApply;
      navigate(location.pathname, { replace: true, state: newState });
      
      handleApplyClick();
    }
  }, [location.state?.openApply, role, selectedJobId]);

  const filteredJobs = (jobs || [])
    .filter(job => {
      const isDeadlinePassed = job.closing_date 
        ? new Date(job.closing_date) < new Date(new Date().setHours(0,0,0,0)) 
        : false;

      const isOwner = currentUser && job.company_id === currentUser.id;

      if (role === 'admin') {
        if (adminStatusFilter === 'Archived') {
          if (!isDeadlinePassed && job.status !== 'Archived') return false;
        } else if (adminStatusFilter !== 'All') {
          if (job.status !== adminStatusFilter) return false;
          if (adminStatusFilter === 'Approved' && isDeadlinePassed) return false; 
        }
      } else {
        if (job.status !== 'Approved') return false;
        
        const userApp = appliedJobs.find(a => a.job_id === job.id);
        const isAdvancedCandidate = userApp && ['Interviewing', 'Approved', 'Hired'].includes(userApp.status);

        if (adminStatusFilter === 'Archived') {
          if (!isDeadlinePassed) return false;
        } else {
          if (isDeadlinePassed && !isOwner && !isAdvancedCandidate) return false;
        }
      }

      const matchesSearch = (job.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (job.company || '').toLowerCase().includes(searchQuery.toLowerCase());
                            
      const matchesModality = filterModality === 'All' || job.work_model === filterModality;
      const matchesType = filterType === 'All' || job.type === filterType;
      let matchesDate = true;
      
      if (filterDate !== 'All' && job.created_at) {
        const jobDate = new Date(job.created_at);
        const diffDays = Math.ceil(Math.abs(new Date() - jobDate) / (1000 * 60 * 60 * 24));
        if (filterDate === '24h') matchesDate = diffDays <= 1;
        else if (filterDate === '7d') matchesDate = diffDays <= 7;
        else if (filterDate === '30d') matchesDate = diffDays <= 30;
      }
      
      return matchesSearch && matchesModality && matchesType && matchesDate;
    })
    .map(job => {
      if (role === 'guest') {
        return {
          ...job,
          company: job.companies?.industry || 'Confidential Industry', 
          location: 'Sign in to view location',
          pay_blurred: true, 
          pay_rate: ''
        };
      }
      return job;
    });

  const selectedJobData = filteredJobs.find(j => j.id === selectedJobId);
  let selectedCompanyData = selectedJobData ? companies?.find(c => c.id === selectedJobData.company_id) : null;

  if (role === 'guest' && selectedCompanyData) {
    selectedCompanyData = {
      ...selectedCompanyData,
      name: selectedCompanyData.industry || 'Confidential Industry',
      description: 'Sign in or create an account to view full company details and learn more about this employer.',
      locations: { city: 'Sign in to view location', country: '' },
      logo_url: null,
      representative: null,
      website: null,
      contact_email: null
    };
  }

  useEffect(() => {
    if (!isLoading && (jobs || []).length > 0 && !selectedJobId && window.innerWidth > 768) {
      const firstVisible = filteredJobs[0];
      if (firstVisible) setSelectedJobId(firstVisible.id);
    }
  }, [isLoading, jobs, selectedJobId, adminStatusFilter]);

  async function fetchUserData() {
    if (['guest', 'company', 'admin'].includes(role)) return;
    
    const { data: saved } = await supabase.from('saved_jobs').select('job_id').eq('user_id', currentUser.id);
    const { data: applied } = await supabase.from('applications').select('job_id, status').eq('applicant_id', currentUser.id);
    
    if (saved) setSavedJobs(saved.map(s => s.job_id));
    if (applied) setAppliedJobs(applied);
  }

  async function handleApplyClick() {
    if (!currentUser) return navigate('/login', { state: { returnTo: '/jobs', returnState: { selectedJobId: selectedJobId, openApply: true } } });
    if (role !== 'user') return alert("Only approved standard users can apply for jobs.");
    
    setShowApplyModal(true);
    setIsLoadingResumes(true);
    
    const { data, error } = await supabase
      .from('resumes')
      .select('*')
      .eq('user_id', currentUser.id);
      
    if (!error && data) {
      setUserResumes(data);
      const approved = data.filter(r => r.status === 'Approved');
      if (approved.length > 0) {
        setSelectedResumeId(approved[0].id);
        setApplyModalTab('select'); 
      } else {
        setApplyModalTab('upload'); 
      }
    }
    setIsLoadingResumes(false);
  }

  async function submitApplication() {
    if (!selectedResumeId) return alert("Please select a resume.");
    
    setIsApplying(true);
    const { error } = await supabase.from('applications').insert([{ 
      applicant_id: currentUser.id, 
      job_id: selectedJobId,
      resume_id: selectedResumeId
    }]);

    if (!error) {
      setAppliedJobs([...appliedJobs, { job_id: selectedJobId, status: 'Pending' }]);
      alert("Application sent successfully!");
      setShowApplyModal(false);
    } else {
      console.error("Application error:", error);
      alert("Failed to send application. Please try again.");
    }
    setIsApplying(false);
  }

  async function handleWithdrawApplication() {
    if (!window.confirm("Are you sure you want to withdraw your application? This will remove you from the employer's applicant pool.")) return;
    
    setIsApplying(true);
    const { error } = await supabase
      .from('applications')
      .delete()
      .match({ applicant_id: currentUser.id, job_id: selectedJobId });

    if (!error) {
      setAppliedJobs(appliedJobs.filter(a => a.job_id !== selectedJobId));
      alert("Application withdrawn successfully.");
    } else {
      console.error("Withdrawal error:", error);
      alert("Failed to withdraw application. Please try again.");
    }
    setIsApplying(false);
  }

  // 🚨 UPDATED: Now uses Supabase Storage PDF upload to exactly match UserResumes.jsx
  async function handleUploadResume(e) {
    e.preventDefault();
    if (!newResumeTitle || !selectedFile) return alert("Please provide a title and select a PDF file.");
    
    if (selectedFile.type !== 'application/pdf') {
      return alert("Only PDF files are allowed.");
    }

    setIsUploadingResume(true);

    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`;
      const filePath = `${currentUser.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('resumes')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase.from('resumes').insert([{
        user_id: currentUser.id,
        title: newResumeTitle,
        file_url: publicUrl,
        status: 'Pending'
      }]);

      if (dbError) throw dbError;

      alert("Resume submitted successfully! Once an admin approves it, you can apply for this job.");
      setShowApplyModal(false);
      setNewResumeTitle('');
      setSelectedFile(null);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload resume. Please try again.");
    } finally {
      setIsUploadingResume(false);
    }
  }

  async function handleSaveJob() {
    if (!currentUser) return navigate('/login', { state: { returnTo: '/jobs', returnState: { selectedJobId: selectedJobId } } });
    if (!['user', 'pending_user', 'rejected_user'].includes(role)) return;
    
    setIsSaving(true);
    const isCurrentlySaved = savedJobs.includes(selectedJobId);

    if (isCurrentlySaved) {
      const { error } = await supabase.from('saved_jobs').delete().match({ user_id: currentUser.id, job_id: selectedJobId });
      if (!error) setSavedJobs(savedJobs.filter(id => id !== selectedJobId));
    } else {
      const { error } = await supabase.from('saved_jobs').insert([{ user_id: currentUser.id, job_id: selectedJobId }]);
      if (!error) setSavedJobs([...savedJobs, selectedJobId]);
    }
    setIsSaving(false);
  }

  async function handleUpdateJobStatus(jobId, newStatus, reason = '') {
    if (role !== 'admin') return;

    if (newStatus === 'Rejected' && !reason) {
      setJobToReject(jobId);
      setShowRejectModal(true);
      return;
    }

    setIsSubmittingReject(true);
    
    const updateData = { status: newStatus };
    const { error } = await supabase.from('jobs').update(updateData).eq('id', jobId);
    
    if (!error) {
      setJobs(jobs?.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
      
      if (newStatus === 'Rejected' && reason) {
        const job = jobs?.find(j => j.id === jobId);
        if (job) {
          await supabase.from('notifications').insert([{
            user_id: job.company_id,
            title: 'Job Posting Rejected',
            message: `Your job posting "${job.title}" was rejected. Reason: ${reason}`,
            type: 'job',
            link: '/my-jobs'
          }]);
        }
      }

      if (newStatus === 'Rejected' && adminStatusFilter === 'Pending') {
        setSelectedJobId(null);
      }
      
      if (showRejectModal) {
        setShowRejectModal(false);
        setRejectReason('');
        setJobToReject(null);
      }
    } else {
      alert("Failed to update job status.");
    }
    setIsSubmittingReject(false);
  }

  async function handleDeleteJob() {
    if (role !== 'admin') return;
    if (!window.confirm("Are you sure you want to delete this job posting? This cannot be undone.")) return;

    try {
      const { data: applicants, error: fetchError } = await supabase
        .from('applications')
        .select('applicant_id')
        .eq('job_id', selectedJobId);

      if (fetchError) throw fetchError;

      if (applicants && applicants.length > 0) {
        const uniqueApplicantIds = [...new Set(applicants.map(app => app.applicant_id))];
        const jobTitle = selectedJobData?.title || 'a recent job';
        
        const notificationsToInsert = uniqueApplicantIds.map(applicantId => ({
          user_id: applicantId,
          title: 'Job Post Closed',
          message: `The job post for "${jobTitle}" has been closed by the employer. Thank you for your interest!`,
          link: `/user-jobs`
        }));

        await supabase.from('notifications').insert(notificationsToInsert);
      }

      const { error } = await supabase.from('jobs').delete().eq('id', selectedJobId);
      
      if (!error) { 
        setJobs(jobs?.filter(job => job.id !== selectedJobId)); 
        setSelectedJobId(null); 
        alert("Job deleted successfully, and applicants have been notified!");
      } else {
        alert("Failed to delete job.");
      }
    } catch (error) {
      console.error("Error deleting job:", error);
      alert("An error occurred while trying to delete the job.");
    }
  }

  const renderJobList = (jobList) => (
    <div className="flex-col gap-12">
      {jobList.map(job => {
        const relatedCompany = companies?.find(c => c.id === job.company_id);

        return (
          <div key={job.id} style={{ position: 'relative' }}>
            {role === 'admin' && job.applicantCount > 0 && (
              <div className="badge badge-primary" style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 2, pointerEvents: 'none' }} title={`This job has ${job.applicantCount} active applications`}>
                {job.applicantCount} {job.applicantCount === 1 ? 'Applicant' : 'Applicants'}
              </div>
            )}
            <JobCard 
              job={job} 
              companyData={relatedCompany}
              isSelected={job.id === selectedJobId} 
              onClick={() => {
                setSelectedJobId(job.id);
                if (window.innerWidth <= 768) window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              hideMatchScore={true}
              role={role}
            />
          </div>
        );
      })}
    </div>
  );

  const tabs = role === 'admin' 
    ? ['All', 'Pending', 'Approved', 'Rejected', 'Archived']
    : ['Active', 'Archived'];

  return (
    <div className="page-container-wide" style={{ paddingBottom: '24px' }}>

      <div>
        <div className="flex-between mb-24" style={{ flexWrap: 'wrap', gap: '16px' }}>
          <div className="flex-row align-center gap-16 flex-wrap">
            <h1 style={{ margin: 0 }}>{role === 'admin' ? 'Manage Jobs' : 'Job Postings'}</h1>
            {role === 'admin' && (
              <div className="flex-row" style={{ background: 'var(--bg-color)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <button 
                  title="View and manage all job postings"
                  onClick={() => navigate('/jobs')}
                  style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', fontWeight: '500', cursor: 'pointer', background: 'var(--card-bg)', color: 'var(--text-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                >
                  Job Postings
                </button>
                <button 
                  title="Review users who have applied to jobs"
                  onClick={() => navigate('/applicants')}
                  style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', fontWeight: '500', cursor: 'pointer', background: 'transparent', color: 'var(--secondary-text)', boxShadow: 'none' }}
                >
                  Applicants
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-row gap-8 mb-24" style={{ overflowX: 'auto', paddingBottom: '4px', borderBottom: '1px solid var(--border-color)' }}>
          {tabs.map(tab => (
            <button
              key={tab} 
              title={`Filter jobs by ${tab} status`}
              onClick={() => { setAdminStatusFilter(tab); setSelectedJobId(null); }}
              style={{
                padding: '8px 20px', border: 'none', background: 'none',
                borderBottom: adminStatusFilter === tab ? '2px solid var(--primary-color)' : '2px solid transparent',
                color: adminStatusFilter === tab ? 'var(--primary-color)' : 'var(--secondary-text)',
                fontWeight: adminStatusFilter === tab ? '600' : '400', cursor: 'pointer', fontSize: '1rem',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        
        <div className="mb-16">
          <SearchBar 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            placeholder="Search by job title or company..." 
          />
        </div>
        
        <div className="mb-24">
          <JobFilters 
            filterModality={filterModality} setFilterModality={setFilterModality}
            filterType={filterType} setFilterType={setFilterType}
            filterDate={filterDate} setFilterDate={setFilterDate}
          />
        </div>
      </div>

      <div className={`jobs-split-layout ${selectedJobId ? 'active-split' : ''}`}>
        
        <div className="jobs-list-column">
          {isLoading ? (
            <p className="text-center text-secondary p-20">Loading opportunities...</p>
          ) : filteredJobs.length > 0 ? (
            <div className="flex-col gap-24">
              {renderJobList(filteredJobs)}
            </div>
          ) : (
            <div className="card text-center text-secondary p-32">
              <h3 className="m-0 mb-8">{role === 'admin' && adminStatusFilter === 'Pending' ? 'All caught up!' : 'No jobs found'}</h3>
              <p className="m-0">{role === 'admin' && adminStatusFilter === 'Pending' ? 'There are no pending jobs requiring approval.' : 'Try adjusting your search or filters to find what you\'re looking for.'}</p>
            </div>
          )}
        </div>

        <div className="job-details-column">
          {selectedJobId && selectedJobData ? (
            <JobDetailsPane
              selectedJob={selectedJobData}
              selectedCompany={selectedCompanyData}
              role={role}
              currentUser={currentUser}
              isApplying={isApplying}
              hasApplied={appliedJobs.some(a => a.job_id === selectedJobId)}
              applicationStatus={appliedJobs.find(a => a.job_id === selectedJobId)?.status}
              isSaved={savedJobs.includes(selectedJobId)}
              isSaving={isSaving}
              handleApply={handleApplyClick} 
              handleSaveJob={handleSaveJob}
              handleDeleteJob={handleDeleteJob} 
              handleUpdateJobStatus={handleUpdateJobStatus}
              handleWithdrawApplication={handleWithdrawApplication} 
              navigate={navigate}
              handleClose={() => setSelectedJobId(null)} 
              initialOpenJobDesc={location.state?.selectedJobId === selectedJobData.id ? location.state?.openJobDesc : false}
              initialOpenCompDesc={location.state?.selectedJobId === selectedJobData.id ? location.state?.openCompDesc : false}
            />
          ) : (
            <div className="card h-full flex-col align-center justify-center text-center text-secondary p-32" style={{ display: window.innerWidth > 768 ? 'flex' : 'none' }}>
              <h3 className="m-0 mb-8" style={{ fontSize: '1.5rem' }}>Select a job</h3>
              <p className="m-0 text-sm">Click on any job posting in the list to view its full details here.</p>
            </div>
          )}
        </div>
      </div>

      {showApplyModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '20px' }}>
          <div className="card p-0" style={{ width: '100%', maxWidth: '500px', background: 'var(--card-bg)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="m-0" style={{ fontSize: '1.25rem' }}>Apply for Role</h3>
              <button title="Cancel Application" onClick={() => { setShowApplyModal(false); setSelectedFile(null); }} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-color)', lineHeight: 1 }}>&times;</button>
            </div>
            
            <div style={{ padding: '24px' }}>
              {isLoadingResumes ? (
                <p className="text-center text-secondary">Checking your profile...</p>
              ) : (
                (() => {
                  const approvedResumes = userResumes.filter(r => r.status === 'Approved');
                  const pendingResumes = userResumes.filter(r => r.status === 'Pending');

                  return (
                    <>
                      {approvedResumes.length > 0 && (
                        <div className="flex-row gap-16 mb-24" style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <button
                            title="Select from your previously approved resumes"
                            style={{ 
                              background: 'none', border: 'none', padding: '0 0 12px 0', fontSize: '1rem', cursor: 'pointer',
                              fontWeight: applyModalTab === 'select' ? '600' : '400', 
                              color: applyModalTab === 'select' ? 'var(--primary-color)' : 'var(--secondary-text)',
                              borderBottom: applyModalTab === 'select' ? '2px solid var(--primary-color)' : '2px solid transparent'
                            }}
                            onClick={() => setApplyModalTab('select')}
                          >
                            Use Approved File
                          </button>
                          <button
                            title="Upload a new resume for approval"
                            style={{ 
                              background: 'none', border: 'none', padding: '0 0 12px 0', fontSize: '1rem', cursor: 'pointer',
                              fontWeight: applyModalTab === 'upload' ? '600' : '400', 
                              color: applyModalTab === 'upload' ? 'var(--primary-color)' : 'var(--secondary-text)',
                              borderBottom: applyModalTab === 'upload' ? '2px solid var(--primary-color)' : '2px solid transparent'
                            }}
                            onClick={() => setApplyModalTab('upload')}
                          >
                            Submit New Resume
                          </button>
                        </div>
                      )}

                      {applyModalTab === 'select' ? (
                        <div className="flex-col gap-16">
                          <p className="m-0 text-secondary">Select an approved resume to include with your application:</p>
                          <select 
                            className="search-input w-full" 
                            value={selectedResumeId} 
                            onChange={(e) => setSelectedResumeId(e.target.value)}
                          >
                            {approvedResumes.map(r => (
                              <option key={r.id} value={r.id}>{r.title}</option>
                            ))}
                          </select>
                          <button 
                            className="btn-black w-full" 
                            style={{ padding: '12px', fontSize: '1rem', marginTop: '8px' }}
                            onClick={submitApplication}
                            disabled={isApplying}
                          >
                            {isApplying ? 'Submitting...' : 'Submit Application'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex-col gap-16">
                          
                          {/* 🚨 NEW: Added visual empty state styled like UserResumes.jsx */}
                          {approvedResumes.length === 0 && pendingResumes.length === 0 && (
                            <div className="card text-center text-secondary p-32 mb-8" style={{ background: 'var(--bg-color)', border: '1px dashed var(--border-color)', boxShadow: 'none' }}>
                              <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>📄</div>
                              <h3 className="m-0 mb-8" style={{ color: 'var(--text-color)' }}>No Resumes Found</h3>
                              <p className="m-0 text-sm">Please upload your PDF resume below to continue applying.</p>
                            </div>
                          )}

                          {approvedResumes.length === 0 && pendingResumes.length > 0 && (
                            <div className="card p-16" style={{ background: '#fffbeb', border: '1px solid #fde68a', marginBottom: '8px', boxShadow: 'none' }}>
                              <p className="m-0" style={{ color: '#b45309', fontWeight: '500', fontSize: '0.95rem' }}>
                                You currently have a resume pending approval. Once an admin approves it, you can apply for this job!
                              </p>
                            </div>
                          )}

                          {/* 🚨 UPDATED: File upload form matches UserResumes.jsx */}
                          <form onSubmit={handleUploadResume} className="flex-col gap-16">
                            <div>
                              <label className="block mb-8 font-medium text-sm">Resume Title</label>
                              <input 
                                type="text" 
                                className="search-input w-full" 
                                required 
                                placeholder="e.g., Senior Developer 2024"
                                value={newResumeTitle}
                                onChange={(e) => setNewResumeTitle(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="block mb-8 font-medium text-sm">Select File (PDF only)</label>
                              <input 
                                type="file" 
                                accept="application/pdf"
                                className="search-input w-full" 
                                required 
                                onChange={(e) => setSelectedFile(e.target.files[0])}
                                style={{ padding: '8px' }}
                              />
                            </div>
                            <button 
                              type="submit"
                              className="btn-black w-full" 
                              style={{ padding: '12px', fontSize: '1rem', marginTop: '8px' }}
                              disabled={isUploadingResume}
                            >
                              {isUploadingResume ? 'Uploading...' : 'Upload Resume'}
                            </button>
                          </form>
                        </div>
                      )}
                    </>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

      <RejectModal 
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        onSubmit={(reason) => handleUpdateJobStatus(jobToReject, 'Rejected', reason)}
        rejectReason={rejectReason}
        setRejectReason={setRejectReason}
        isSubmitting={isSubmittingReject}
        title="Reject Job Posting"
        placeholder="Provide a reason for rejecting this job posting (this will be sent to the company)..."
      />
    </div>
  );
}