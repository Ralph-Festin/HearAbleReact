import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

import StatusBadge from '../components/common/StatusBadge';
import Avatar from '../components/common/Avatar';
import SearchBar from '../components/common/SearchBar';
import RejectModal from '../components/modals/RejectModal';

export default function Resumes() {
  const { role } = useAuth();
  const navigate = useNavigate();

  const [resumes, setResumes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('Pending');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const [previewResumeId, setPreviewResumeId] = useState(null);

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);
  const [resumeToReject, setResumeToReject] = useState(null);

  useEffect(() => {
    if (role !== 'admin') {
      navigate('/');
      return;
    }
    fetchResumes();
  }, [role, navigate]);

  useEffect(() => setCurrentPage(1), [searchQuery, activeTab]);

  async function fetchResumes() {
    setIsLoading(true);
    const { data: resumesData } = await supabase.from('resumes').select('*').order('created_at', { ascending: false });
    const { data: profilesData } = await supabase.from('profiles').select('id, first_name, last_name, profile_pic');
    
    if (resumesData && profilesData) {
      const mapped = resumesData.map(r => {
        const p = profilesData.find(prof => prof.id === r.user_id) || {};
        return {
          ...r,
          user_name: p.first_name ? `${p.first_name} ${p.last_name}`.trim() : 'Unknown Candidate',
          user_pic: p.profile_pic || ''
        };
      });
      setResumes(mapped);
    }
    setIsLoading(false);
  }

  async function handleUpdateStatus(id, newStatus, reason = '') {
    if (newStatus === 'Rejected' && !reason) {
      setResumeToReject(id);
      setShowRejectModal(true);
      return;
    }

    setIsSubmittingReject(true);
    const { error } = await supabase.from('resumes').update({ status: newStatus }).eq('id', id);
    
    if (!error) {
      setResumes(resumes.map(r => r.id === id ? { ...r, status: newStatus } : r));
      
      if (newStatus === 'Rejected' && reason) {
        const resume = resumes.find(r => r.id === id);
        if (resume) {
          await supabase.from('notifications').insert([{
            user_id: resume.user_id,
            title: 'Resume Rejected',
            message: `Your resume "${resume.title}" was rejected. Reason: ${reason}`,
            type: 'user'
          }]);
        }
      }

      if (showRejectModal) {
        setShowRejectModal(false);
        setRejectReason('');
        setResumeToReject(null);
      }
    } else {
      alert('Failed to update resume status');
    }
    setIsSubmittingReject(false);
  }

  const processedResumes = resumes.filter(resume => {
    const matchesSearch = (resume.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (resume.user_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === 'All' ? true : (resume.status || 'Pending') === activeTab;
    return matchesSearch && matchesTab;
  });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentResumes = processedResumes.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(processedResumes.length / itemsPerPage);

  const previewResume = resumes.find(r => r.id === previewResumeId);

  return (
    <div className="page-container-wide">
      <div className="flex-between align-center mb-24">
        <h1 className="m-0">Manage Resumes</h1>
      </div>

      <div className="flex-row gap-8 mb-24" style={{ overflowX: 'auto', paddingBottom: '4px', borderBottom: '1px solid var(--border-color)' }}>
        {['All', 'Pending', 'Approved', 'Rejected'].map(tab => (
          <button
            key={tab} onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 20px', border: 'none', background: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--primary-color)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--primary-color)' : 'var(--secondary-text)',
              fontWeight: activeTab === tab ? '600' : '400', cursor: 'pointer', fontSize: '1rem',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="mb-24">
        <SearchBar value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by candidate name or resume title..." />
      </div>

      {isLoading ? (
        <p className="text-secondary text-center p-32">Loading resumes...</p>
      ) : currentResumes.length > 0 ? (
        <div className="flex-col gap-16">
          {currentResumes.map(resume => (
            <div key={resume.id} className="card p-24 flex-between-start" style={{ gap: '24px', flexWrap: 'wrap' }}>
              <div className="flex-row gap-16 align-start" style={{ flex: '1 1 300px' }}>
                <Avatar src={resume.user_pic} fallbackName={resume.user_name} size="md" type="user" />
                <div>
                  <h3 className="m-0 mb-4" style={{ fontSize: '1.15rem' }}>{resume.user_name}</h3>
                  <p className="text-secondary m-0">File: <strong style={{ color: 'var(--text-color)' }}>{resume.title}</strong></p>
                </div>
              </div>
              
              <div className="flex-col align-end gap-12" style={{ flexShrink: 0 }}>
                <div className="flex-col align-end gap-4">
                  <StatusBadge status={resume.status || 'Pending'} />
                  <span className="text-sm text-secondary">Uploaded: {new Date(resume.created_at).toLocaleDateString()}</span>
                </div>
                
                <div className="flex-row gap-8 mt-8" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {resume.file_url && (
                    <>
                      <button 
                        onClick={() => setPreviewResumeId(resume.id)} 
                        className="btn-outline btn-sm"
                      >
                        Preview
                      </button>
                      <a href={resume.file_url} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm inline-block" style={{ textDecoration: 'none' }}>
                        Open PDF
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center text-secondary p-48">
          <div className="text-3xl mb-16">📄</div>
          <h3 className="mb-8">No resumes found</h3>
          <p>No resumes match your current filter criteria.</p>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex-between align-center mt-32">
          <p className="text-sm text-secondary" style={{ margin: 0 }}>Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, processedResumes.length)} of {processedResumes.length} resumes</p>
          <div className="flex-row gap-8">
            <button className="btn-outline btn-sm" onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1}>&larr; Previous</button>
            <button className="btn-outline btn-sm" onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages}>Next &rarr;</button>
          </div>
        </div>
      )}

      {previewResume && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          
          <div className="card p-0" style={{ width: '100%', maxWidth: '800px', height: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div className="flex-row align-center gap-12">
                <h3 className="m-0" style={{ fontSize: '1.25rem' }}>Resume Preview</h3>
                <StatusBadge status={previewResume.status || 'Pending'} />
              </div>
              
              <div className="flex-row align-center gap-16">
                <div className="flex-row gap-8">
                  {(previewResume.status || 'Pending') !== 'Approved' && (
                    <button 
                      className="btn-sm" 
                      onClick={() => handleUpdateStatus(previewResume.id, 'Approved')} 
                      style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 16px', fontWeight: '500', cursor: 'pointer' }}
                    >
                      ✓ Approve
                    </button>
                  )}
                  {(previewResume.status || 'Pending') !== 'Rejected' && (
                    <button 
                      className="btn-sm" 
                      onClick={() => handleUpdateStatus(previewResume.id, 'Rejected')} 
                      style={{ background: 'var(--card-bg)', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', padding: '6px 16px', fontWeight: '500', cursor: 'pointer' }}
                    >
                      ✕ Reject
                    </button>
                  )}
                </div>
                
                <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-color)' }}></div>
                
                <button onClick={() => setPreviewResumeId(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-color)' }}>✕</button>
              </div>
            </div>
            
            <div style={{ flex: 1, backgroundColor: '#525659', width: '100%', height: '100%' }}>
              <iframe 
                src={`${previewResume.file_url}#view=FitH`} 
                title="Resume Preview" 
                width="100%" 
                height="100%" 
                style={{ border: 'none', display: 'block' }}
              />
            </div>
            
          </div>
        </div>
      )}

      <RejectModal 
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        onSubmit={(reason) => handleUpdateStatus(resumeToReject, 'Rejected', reason)}
        rejectReason={rejectReason}
        setRejectReason={setRejectReason}
        isSubmitting={isSubmittingReject}
        title="Reject Resume"
        placeholder="Provide a reason for rejecting this resume..."
      />
    </div>
  );
}