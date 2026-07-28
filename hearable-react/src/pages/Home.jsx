import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useJobs } from '../hooks/useJobs';

import StatCard from '../components/dashboard/StatCard';
import AdminOverview from '../components/dashboard/AdminOverview';
import RecentApplicantsCard from '../components/dashboard/RecentApplicantsCard';
import RecentJobsCard from '../components/jobs/RecentJobsCard'; 
import CompanyOnboardingModal from '../components/modals/CompanyOnboardingModal'; 
import { MatchedJobsWidget } from '../components/jobs/MatchedJobsWidget'; 

import Avatar from '../components/common/Avatar';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { formatFullName } from '../utils/formatUtils';

export default function Home() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  
  const { jobs: allJobs, isLoading: isJobsLoading } = useJobs(); 
  
  const [recentJobs, setRecentJobs] = useState([]);
  const [recentApplicants, setRecentApplicants] = useState([]);
  
  const [userProfile, setUserProfile] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [stats, setStats] = useState({ stat1: 0, stat2: 0, stat3: 0, stat4: 0 });
  const [adminStats, setAdminStats] = useState({ users: 0, pendingUsers: 0, companies: 0, activeJobs: 0, pendingJobs: 0, pendingResumes: 0 });
  
  const [recentPendingUsers, setRecentPendingUsers] = useState([]);
  const [recentPendingJobs, setRecentPendingJobs] = useState([]);
  const [recentPendingResumes, setRecentPendingResumes] = useState([]);
  
  const [showCompanyOnboarding, setShowCompanyOnboarding] = useState(false); 

  useEffect(() => {
    setShowCompanyOnboarding(false);
    fetchDashboardData();
  }, [role, user]); 

  async function fetchDashboardData() {
    setIsLoading(true);
    setUserProfile(null);
    setCompanyProfile(null);
    
    const activeId = user?.id;

    if (role === 'admin') {
      const [
        { count: usersCount },
        { count: companyCount },
        { count: activeJobsCount },
        { data: pUsers, count: pendingUsersCount },
        { data: pJobs, count: pendingJobsCount },
        { data: pResumes, count: pendingResumesCount }
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('companies').select('*', { count: 'exact', head: true }),
        supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'Approved'),
        
        supabase.from('profiles').select('id, first_name, last_name, created_at', { count: 'exact' }).eq('status', 'Pending').order('created_at', { ascending: false }).limit(3),
        
        supabase.from('jobs').select('*, companies(*)', { count: 'exact' }).eq('status', 'Pending').order('created_at', { ascending: false }).limit(3),
        
        supabase.from('resumes').select('id, title, created_at, file_url', { count: 'exact' }).eq('status', 'Pending').order('created_at', { ascending: false }).limit(3)
      ]);
      
      setAdminStats({ 
        users: usersCount || 0, 
        pendingUsers: pendingUsersCount || 0,
        companies: companyCount || 0,
        activeJobs: activeJobsCount || 0,
        pendingJobs: pendingJobsCount || 0,
        pendingResumes: pendingResumesCount || 0
      });

      setRecentPendingUsers((pUsers || []).map(u => ({ id: u.id, title: formatFullName(u.first_name, u.last_name, 'Unknown User'), created_at: u.created_at })));
      
      setRecentPendingJobs(pJobs || []);
      
      setRecentPendingResumes((pResumes || []).map(r => ({ id: r.id, title: r.title || 'Untitled Resume', created_at: r.created_at, file_url: r.file_url })));

      setIsLoading(false);
      return;
    }

    if (role === 'company' && activeId) {
      const { data: compData } = await supabase.from('companies').select('*').eq('id', activeId).maybeSingle();
      
      if (compData) {
        setCompanyProfile(compData);

        if (!compData.description) {
          setShowCompanyOnboarding(true);
        }

        const { count: jobCount } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('company_id', compData.id);
        const { count: appCount } = await supabase.from('applications').select('job_id, jobs!inner(company_id)', { count: 'exact', head: true }).eq('jobs.company_id', compData.id);
        setStats({ stat1: jobCount || 0, stat2: appCount || 0, stat3: 0, stat4: 0 });

        const { data: appsData } = await supabase
          .from('applications')
          .select(`
            id,
            created_at,
            status,
            profiles ( id, first_name, last_name, email, profile_pic ),
            jobs!inner ( id, title, company_id )
          `)
          .eq('jobs.company_id', compData.id)
          .order('created_at', { ascending: false })
          .limit(4);

        if (appsData) {
          const mappedApps = appsData.map(app => ({
            ...app,
            profiles: {
              ...app.profiles,
              name: formatFullName(app.profiles?.first_name, app.profiles?.last_name, 'Unknown User')
            }
          }));
          setRecentApplicants(mappedApps);
        }
      }
      setIsLoading(false);
      return;
    }

    const { data: jobsData } = await supabase
      .from('jobs')
      .select(`
        *,
        locations ( city ),
        companies ( name, status, is_deaf_accessible, has_interpreters, has_trained_staff, has_visual_alarms, has_captioning, locations ( city ) )
      `)
      .eq('status', 'Approved')
      .order('created_at', { ascending: false })
      .limit(20);

    if (jobsData) {
      const isGuest = role === 'guest';

      const validRecentJobs = jobsData.filter(job => {
        const isDeadlinePassed = job.closing_date ? new Date(job.closing_date) < new Date(new Date().setHours(0,0,0,0)) : false;
        
        // 🚨 NEW: Filter out jobs from archived companies
        const isCompanyActive = job.companies && !['Archived', 'Rejected'].includes(job.companies.status);
        
        if (role === 'admin') return true;
        return !isDeadlinePassed && isCompanyActive;
      }).slice(0, 4);

      const formattedJobs = validRecentJobs.map(job => ({
        ...job, 
        location: isGuest ? 'Sign in to view location' : (job.locations?.city || job.companies?.locations?.city || 'Location not specified'),
        company: isGuest ? 'Company Hidden' : (job.companies?.name || 'Unknown Company'),
        is_deaf_accessible: job.is_deaf_accessible || job.companies?.is_deaf_accessible
      }));
      setRecentJobs(formattedJobs);
    }

    if (role === 'guest') {
      const { count: jobCount } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'Approved');
      const { count: companyCount } = await supabase.from('companies').select('*', { count: 'exact', head: true });
      setStats({ stat1: jobCount || 0, stat2: companyCount || 0, stat3: 0, stat4: 0 });
    } 
    else if (['user', 'pending_user', 'rejected_user'].includes(role) && activeId) {
      const { data: userData } = await supabase.from('profiles').select('*').eq('id', activeId).maybeSingle();
      
      if (userData) {
        setUserProfile(userData);

        if (!userData.first_name || !userData.degree_id) {
          navigate('/onboarding');
          return; 
        }

        const { count: appCount } = await supabase.from('applications').select('*', { count: 'exact', head: true }).eq('applicant_id', userData.id);
        const { count: totalJobsCount } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'Approved');
        setStats({ stat1: appCount || 0, stat2: totalJobsCount || 0, stat3: 0, stat4: 0 });
      }
    }

    setIsLoading(false);
  }

  function handleCompanyOnboardingComplete() {
    setShowCompanyOnboarding(false);
    fetchDashboardData();
  }

  const handleGoToJob = (jobId) => {
    navigate('/jobs', { state: { selectedJobId: jobId } });
  };

  if (isLoading && role === 'admin') {
     return <div className="page-container-wide mt-32"><LoadingSpinner message="Loading dashboard..." /></div>;
  }

  const validAllJobs = (allJobs || []).filter(job => {
    const isDeadlinePassed = job.closing_date ? new Date(job.closing_date) < new Date(new Date().setHours(0,0,0,0)) : false;
    
    // 🚨 NEW: Filter out jobs from archived companies
    const isCompanyActive = job.companies && !['Archived', 'Rejected'].includes(job.companies.status);

    if (role === 'admin') return true;
    return job.status === 'Approved' && !isDeadlinePassed && isCompanyActive;
  });

  return (
    <div className="page-container-wide">
      <CompanyOnboardingModal 
        isOpen={showCompanyOnboarding}
        companyData={companyProfile}
        onSuccess={handleCompanyOnboardingComplete}
      />

      {role === 'guest' && (
        <div className="flex-col gap-24 mb-32">
          <div className="card text-center p-32" style={{ backgroundColor: 'var(--primary-color)', color: 'var(--bg-color)', border: 'none' }}>
            <h1 className="text-3xl m-0 mb-16" style={{ color: 'var(--bg-color)' }}>
              Empowering the Deaf Community in the Workplace
            </h1>
            <p className="text-lg m-0 mb-32" style={{ color: 'var(--bg-color)', opacity: 0.9, maxWidth: '800px', margin: '0 auto 32px' }}>
              HearAble is a dedicated career platform designed to bridge the gap between talented deaf and hard-of-hearing professionals and inclusive employers.
            </p>
            
            <div className="flex-row gap-16 align-center mobile-action-group" style={{ justifyContent: 'center' }}>
              <button onClick={() => navigate('/jobs')} style={{ backgroundColor: 'var(--card-bg)', color: 'var(--primary-color)', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
                Browse Jobs
              </button>
              <button onClick={() => navigate('/companies')} style={{ backgroundColor: 'transparent', color: 'var(--bg-color)', border: '2px solid var(--bg-color)', padding: '10px 24px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
                Explore Companies
              </button>
            </div>
          </div>

          <div>
            <div className="card p-24 text-center">
              <h3 className="mb-16 mt-0">For Deaf Job Seekers</h3>
              <p className="text-secondary m-0" style={{ lineHeight: '1.6' }}>
                Find companies that value your talent and provide deaf-accessible environments. Build your profile, showcase your skills, and apply to roles where you can truly thrive.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className={role === 'admin' ? "flex-col" : "dashboard-layout"}>
        <div className="w-full">
          {role === 'admin' && (
            <AdminOverview 
              adminStats={adminStats}
              recentPendingUsers={recentPendingUsers}
              recentPendingJobs={recentPendingJobs}
              recentPendingResumes={recentPendingResumes}
              isLoading={isLoading}
            />
          )}

          {role !== 'admin' && (
            <div className="flex-col gap-24">
              {(role === 'user' || role === 'pending_user') && !isJobsLoading && validAllJobs.length > 0 && (
                <MatchedJobsWidget jobs={validAllJobs} onSelectJob={handleGoToJob} />
              )}

              <div className="card">
                {role === 'company' ? (
                  <RecentApplicantsCard 
                    recentApplicants={recentApplicants} 
                    isLoading={isLoading} 
                    navigate={navigate} 
                  />
                ) : (
                  <RecentJobsCard 
                    recentJobs={recentJobs} 
                    isLoading={isLoading} 
                    navigate={navigate} 
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {role !== 'admin' && (
          <div className="dashboard-sidebar">
            {role === 'guest' ? (
              <div className="card text-center p-24">
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                  <Avatar fallbackName="Guest" size="lg" type="user" />
                </div>
                <h3 className="m-0 mb-8">Join Hearable</h3>
                <p className="text-sm text-secondary m-0 mb-24">Create an account to apply to jobs and get noticed by companies.</p>
                <button className="btn-black w-full" onClick={() => navigate('/login')}>Sign Up Now</button>
              </div>
            ) : role === 'company' ? (
              <div className="card text-center p-24">
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                  <Avatar src={companyProfile?.logo_url} fallbackName={companyProfile?.name || 'Company'} size="lg" type="company" />
                </div>
                <h3 className="m-0 mb-8">{companyProfile?.name}</h3>
                
                {(companyProfile?.status === 'Archived' || companyProfile?.status === 'Rejected') && (
                  <div className="mb-12">
                    <span style={{ 
                      background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', 
                      padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', display: 'inline-block' 
                    }}>
                      Account Disabled
                    </span>
                  </div>
                )}
                
                <p className="text-sm text-secondary m-0 mb-24">{companyProfile?.address}</p>
                <button className="btn-black w-full" disabled={!companyProfile?.id} onClick={() => navigate(`/company/${companyProfile?.id}`)}>
                  {companyProfile?.id ? 'View Company Profile' : 'No Profile Found'}
                </button>
              </div>
            ) : (
              <div className="card text-center p-24">
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                  <Avatar 
                    src={userProfile?.profile_pic} 
                    fallbackName={formatFullName(userProfile?.first_name, userProfile?.last_name, 'User')} 
                    size="lg" 
                    type="user" 
                  />
                </div>
                <h3 className="m-0 mb-8">
                  {formatFullName(userProfile?.first_name, userProfile?.last_name, 'Incomplete Profile')}
                </h3>
                <p className="text-sm text-secondary m-0 mb-24">{userProfile?.headline || 'Talent Profile'}</p>
                <button className="btn-black w-full" disabled={!userProfile?.id} onClick={() => navigate(`/user/${userProfile?.id}`)}>
                  {userProfile?.id ? 'View Profile' : 'No Profile Found'}
                </button>
              </div>
            )}

            <div className="flex-col gap-16">
              <StatCard value={stats.stat1} label={role === 'company' ? 'Active Job Postings' : role === 'guest' ? 'Total Open Jobs' : 'Applications Sent'} isLoading={isLoading} />
              <StatCard value={stats.stat2} label={role === 'company' ? 'Total Applicants' : role === 'guest' ? 'Companies Hiring' : 'Open Jobs'} isLoading={isLoading} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}