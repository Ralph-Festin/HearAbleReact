import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import JobCard from '../components/jobs/JobCard';

import StatusBadge from '../components/common/StatusBadge';
import { formatStandardDate } from '../utils/dateUtils';

export default function UserJobs() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  
  const [applications, setApplications] = useState([]);
  const [savedJobs, setSavedJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState('Applied');

  const [feedbackApp, setFeedbackApp] = useState(null);
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  useEffect(() => {
    if (!['user', 'pending_user', 'rejected_user'].includes(role)) {
      navigate('/');
      return;
    }
    if (user) fetchUserJobs();
  }, [user, role]);

  async function fetchUserJobs() {
    setIsLoading(true);

    const { data: appsData } = await supabase
      .from('applications')
      .select('*, jobs(*, locations(city), companies(name, logo_url, is_deaf_accessible), job_skills(skills(id, name)))')
      .eq('applicant_id', user.id)
      .order('created_at', { ascending: false });

    let mappedApps = [];
    if (appsData) {
      mappedApps = appsData.map(app => ({
        ...app,
        job: {
          ...app.jobs,
          location: app.jobs.locations?.city || '',
          skills: app.jobs.job_skills ? app.jobs.job_skills.map(js => ({ id: js.skills.id, name: js.skills.name })) : [],
          company: app.jobs.companies?.name || 'Unknown Company',
          is_deaf_accessible: app.jobs.companies?.is_deaf_accessible || false,
          date: formatStandardDate(app.jobs.created_at)
        }
      }));
      setApplications(mappedApps);
    }

    const { data: savedData } = await supabase
      .from('saved_jobs')
      .select('*, jobs(*, locations(city), companies(name, logo_url, is_deaf_accessible), job_skills(skills(id, name)))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (savedData) {
      const mappedSaved = savedData.map(saved => {
        const matchingApp = mappedApps.find(app => app.job_id === saved.job_id);
        return {
          ...saved,
          status: matchingApp ? matchingApp.status : null,
          job: {
            ...saved.jobs,
            location: saved.jobs.locations?.city || '',
            skills: saved.jobs.job_skills ? saved.jobs.job_skills.map(js => ({ id: js.skills.id, name: js.skills.name })) : [],
            company: saved.jobs.companies?.name || 'Unknown Company',
            is_deaf_accessible: saved.jobs.companies?.is_deaf_accessible || false,
            date: formatStandardDate(saved.jobs.created_at)
          }
        };
      });
      setSavedJobs(mappedSaved);
    }

    setIsLoading(false);
  }

  async function handleSubmitFeedback(e) {
    e.preventDefault();
    if (!comment.trim() || !feedbackTitle.trim()) return;

    setIsSubmittingFeedback(true);
    
    const finalMessage = `${comment.trim()}\n\n---\n📌 Job Title: ${feedbackApp.job?.title}\n[JobID:${feedbackApp.job?.id}]`;

    try {
      const { error } = await supabase.from('feedbacks').insert([{
        user_id: user.id,
        title: feedbackTitle.trim(),
        purpose: 'Jobs',
        message: finalMessage
      }]);
      
      if (error) throw error;
      
      alert('Thank you! Your feedback has been submitted successfully.');
      setFeedbackApp(null);
      setFeedbackTitle('');
      setComment('');
    } catch (error) {
      console.error("Failed to submit feedback:", error);
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  const isJobExpired = (dateString) => {
    if (!dateString) return false;
    return new Date(dateString) < new Date(new Date().setHours(0,0,0,0));
  };

  let displayList = [];
  if (activeTab === 'Saved') {
    displayList = savedJobs.filter(item => !isJobExpired(item.job?.closing_date));
  } else if (activeTab === 'Applied') {
    displayList = applications.filter(item => !isJobExpired(item.job?.closing_date));
  } else if (activeTab === 'Interviews') { 
    displayList = applications.filter(app => app.status === 'Interviewing' || app.status === 'Approved');
  } else if (activeTab === 'Hired') {
    displayList = applications.filter(app => app.status === 'Hired');
  } else if (activeTab === 'Archived') {
    displayList = applications.filter(app => app.status === 'Rejected' || app.status === 'Archived');
  }

  const tabs = ['Saved', 'Applied', 'Interviews', 'Hired', 'Archived'];

  return (
    <div className="page-container-wide">
      
      <div className="flex-between align-center mb-24">
        <button className="btn-outline btn-sm" onClick={() => navigate('/jobs')}>
          Find More Jobs
        </button>
      </div>

      <div className="flex-row gap-8 mb-32" style={{ overflowX: 'auto', borderBottom: '1px solid var(--border-color)' }}>
        {tabs.map(tab => {
          let count = 0;
          if (tab === 'Saved') count = savedJobs.filter(item => !isJobExpired(item.job?.closing_date)).length;
          if (tab === 'Applied') count = applications.filter(item => !isJobExpired(item.job?.closing_date)).length;
          if (tab === 'Interviews') count = applications.filter(a => a.status === 'Interviewing' || a.status === 'Approved').length;
          if (tab === 'Hired') count = applications.filter(a => a.status === 'Hired').length;
          if (tab === 'Archived') count = applications.filter(a => a.status === 'Rejected' || a.status === 'Archived').length;

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 20px',
                border: 'none',
                background: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--primary-color)' : '2px solid transparent',
                color: activeTab === tab ? 'var(--primary-color)' : 'var(--secondary-text)',
                fontWeight: activeTab === tab ? '600' : '400',
                cursor: 'pointer',
                fontSize: '1rem',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {tab} 
              <span style={{ 
                background: activeTab === tab ? 'var(--primary-color)' : 'var(--border-color)', 
                color: activeTab === tab ? 'white' : 'var(--text-color)', 
                padding: '2px 8px', 
                borderRadius: '12px', 
                fontSize: '0.75rem', 
                fontWeight: 'bold' 
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <p className="text-center text-secondary mt-32">Loading your applications...</p>
      ) : displayList.length > 0 ? (
        <div className="flex-col gap-24">
          {displayList.map(item => {
            const isInterviewStage = item.status === 'Interviewing' || item.status === 'Approved';
            const isHiredStage = item.status === 'Hired';
            const showFeedbackBtn = isInterviewStage || isHiredStage || activeTab === 'Interviews' || activeTab === 'Hired';
            
            const expired = isJobExpired(item.job?.closing_date);
            
            const disableClick = expired && activeTab === 'Archived';

            return (
              <div 
                key={item.id} 
                className="w-full" 
                style={{ 
                  position: 'relative', 
                  opacity: disableClick ? 0.7 : 1,
                  transition: 'opacity 0.2s'
                }}
              >
                
                <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 2, pointerEvents: 'none', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {expired && (
                    <span className="badge badge-neutral" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                      Closed
                    </span>
                  )}
                  {item.status ? (
                    <StatusBadge status={item.status} />
                  ) : (
                    <span className="badge badge-neutral" style={{ background: 'var(--bg-color)' }}>Saved</span>
                  )}
                </div>

                <div 
                  onClick={disableClick ? (e) => e.preventDefault() : undefined} 
                  style={{ cursor: disableClick ? 'default' : 'pointer' }}
                >
                  <JobCard 
                    job={item.job} 
                    isSelected={false} 
                    onClick={disableClick ? () => {} : () => navigate('/jobs', { state: { selectedJobId: item.job.id } })} 
                  >
                    {showFeedbackBtn && (
                      <button 
                        className="btn-sm" 
                        style={{ 
                          background: '#047857', 
                          border: 'none', 
                          color: '#ffffff', 
                          padding: '8px 24px',
                          fontWeight: '600',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          pointerEvents: 'auto'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFeedbackApp(item);
                        }}
                      >
                        Leave Feedback
                      </button>
                    )}
                  </JobCard>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card text-center text-secondary p-32 mt-32">
          <h3 className="mb-8">No {activeTab.toLowerCase()} jobs</h3>
          <p>You do not have any jobs in this category yet.</p>
        </div>
      )}

      {feedbackApp && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '20px' }}>
          <div className="card p-0" style={{ width: '100%', maxWidth: '500px', background: 'var(--card-bg)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="m-0" style={{ fontSize: '1.25rem' }}>Job Feedback</h3>
              <button 
                title="Close" 
                onClick={() => {
                  setFeedbackApp(null);
                  setFeedbackTitle('');
                  setComment('');
                }} 
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-color)', lineHeight: 1 }}
              >
                &times;
              </button>
            </div>
            
            <div style={{ padding: '24px' }}>
              <form onSubmit={handleSubmitFeedback} className="flex-col gap-16">
                <div>
                  <label className="block mb-8 font-medium">Title</label>
                  <input 
                    type="text" 
                    className="search-input w-full" 
                    placeholder="e.g., Great Interview Process!" 
                    value={feedbackTitle}
                    onChange={(e) => setFeedbackTitle(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block mb-8 font-medium">Details</label>
                  <textarea 
                    className="search-input w-full" 
                    rows="5" 
                    style={{ resize: 'vertical' }}
                    placeholder="Tell us about your experience with this job/interview..." 
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn-black w-full" style={{ padding: '12px', fontSize: '1rem' }} disabled={isSubmittingFeedback}>
                  {isSubmittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}