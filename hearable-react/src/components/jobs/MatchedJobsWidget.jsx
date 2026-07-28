import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import DeafAccessibleBadge from '../common/DeafAccessibleBadge';

export function MatchedJobsWidget({ jobs, onSelectJob }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const matchedJobs = (jobs || [])
    .filter(job => {
      const isExpired = job.closing_date ? new Date(job.closing_date) < new Date(new Date().setHours(0,0,0,0)) : false;
      
      // 🚨 NEW: Filter out jobs from archived companies
      const isCompanyActive = job.companies && !['Archived', 'Rejected'].includes(job.companies.status);
      
      return job.matchScore && job.matchScore > 0 && !isExpired && isCompanyActive;
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 6); 

  if (matchedJobs.length === 0) {
    return (
      <div className="card text-center p-32 mb-24" style={{ border: '2px dashed var(--border-color)', backgroundColor: 'transparent', boxShadow: 'none' }}>
        <h3 className="m-0 mb-8 text-xl">Unlock Your Top Matches</h3>
        <p className="text-secondary m-0 mb-24" style={{ maxWidth: '500px', margin: '0 auto 24px auto', lineHeight: '1.6' }}>
          We need to know a little more about you! Add more skills to your profile to get personalized job recommendations.
        </p>
        <button className="btn-black" style={{ padding: '12px 24px', fontSize: '1rem' }} onClick={() => navigate(`/user/${user?.id}`, { state: { openAddSkill: true } })}>
          Update My Skills
        </button>
      </div>
    );
  }

  return (
    <div className="card mb-24 p-24">
      <div className="flex-between align-center mb-16" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <h3 className="m-0">Top Matches For You</h3>
        <button 
          onClick={() => navigate('/jobs')} 
          style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', fontSize: '0.9rem', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
        >
          View All &rarr;
        </button>
      </div>
      
      <div className="flex-col gap-0">
        {matchedJobs.map((job, index) => {
          const accessData = job.companies || {};
          const hasDeafBadge = accessData.has_interpreters || accessData.has_trained_staff || accessData.has_visual_alarms || accessData.has_captioning;
          
          return (
            <div 
              key={job.id} 
              className="flex-between align-center mobile-stack" 
              style={{ padding: '16px 0', borderBottom: index !== matchedJobs.length - 1 ? '1px solid var(--border-color)' : 'none', cursor: 'pointer' }}
              onClick={() => onSelectJob(job.id)}
            >
              <div style={{ width: '100%', minWidth: 0, paddingRight: '16px' }}>
                <h4 className="text-lg m-0 mb-4 text-primary flex-row align-center gap-8 flex-wrap">
                  {job.title}
                  <span style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    {job.matchScore}% Match
                  </span>
                </h4>
                
                <div className="text-sm text-secondary m-0 mb-12 flex-row align-center gap-8" style={{ width: '100%', minWidth: 0 }}>
                  <span 
                    style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '50%' }}
                    title={job.company || 'Unknown Company'}
                  >
                    {job.company || 'Unknown Company'}
                  </span>
                  
                  {job.location && (
                    <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                      • {job.location}
                    </span>
                  )}

                  {hasDeafBadge && (
                    <div style={{ flexShrink: 0 }}>
                      <DeafAccessibleBadge size="sm" showText={true} features={accessData} isAccessible={hasDeafBadge} />
                    </div>
                  )}
                </div>
                
                <div className="flex-row gap-8 flex-wrap">
                  {job.type && (
                    <span style={{ padding: '4px 12px', background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-color)' }}>
                      {job.type}
                    </span>
                  )}
                  {job.work_model && (
                    <span style={{ padding: '4px 12px', background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-color)' }}>
                      {job.work_model}
                    </span>
                  )}
                </div>
              </div>
              
              <button className="btn-outline btn-sm mobile-w-full" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>View Role</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}