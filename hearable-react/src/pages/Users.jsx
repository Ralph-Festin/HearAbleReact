import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient'; 

import { useUsers } from '../hooks/useUsers';
import { sortData } from '../utils/sortUtils';

import SearchBar from '../components/common/SearchBar';
import Avatar from '../components/common/Avatar';
import StatusBadge from '../components/common/StatusBadge';
import Modal from '../components/common/Modal';
import EmptyState from '../components/common/EmptyState';
import FilterSelect from '../components/common/FilterSelect'; 
import RejectModal from '../components/modals/RejectModal'; 

export default function Users({ role }) {
  const navigate = useNavigate();
  const location = useLocation(); 
  
  const { users, isLoading } = useUsers(role);

  const [searchQuery, setSearchQuery] = useState('');
  
  const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'All');
  
  const [sortBy, setSortBy] = useState('name_asc');
  const [filterDegree, setFilterDegree] = useState('All');
  const [filterBatch, setFilterBatch] = useState('All');

  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 6;

  const [resumeModal, setResumeModal] = useState({ isOpen: false, isLoading: false, userName: '', resumes: [] });

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);
  const [resumeToReject, setResumeToReject] = useState(null);

  useEffect(() => {
    if (role !== 'admin') navigate('/');
  }, [role, navigate]);

  useEffect(() => {
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab, sortBy, filterDegree, filterBatch]);

  useEffect(() => {
    setSortBy(activeTab === 'Pending' ? 'date_asc' : 'name_asc');
  }, [activeTab]);

  async function handleViewResumes(userId, userName) {
    setResumeModal({ isOpen: true, isLoading: true, userName, resumes: [] });
    const { data } = await supabase
      .from('resumes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
      
    setResumeModal({ isOpen: true, isLoading: false, userName, resumes: data || [] });
  }

  async function handleUpdateResumeStatus(resumeId, newStatus, reason = '') {
    if (newStatus === 'Rejected' && !reason) {
      setResumeToReject(resumeId);
      setShowRejectModal(true);
      return;
    }

    setIsSubmittingReject(true);
    const { error } = await supabase
      .from('resumes')
      .update({ status: newStatus })
      .eq('id', resumeId);

    if (!error) {
      setResumeModal(prev => ({
        ...prev,
        resumes: prev.resumes.map(r => r.id === resumeId ? { ...r, status: newStatus } : r)
      }));
      
      if (newStatus === 'Rejected' && reason) {
        const resume = resumeModal.resumes.find(r => r.id === resumeId);
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
      alert("Failed to update resume status.");
    }
    setIsSubmittingReject(false);
  }

  const uniqueDegrees = ['All', ...[...new Set(users.map(u => u.degreeText).filter(Boolean))].sort()];
  const uniqueBatches = ['All', ...[...new Set(users.map(u => u.batchText).filter(Boolean))].sort()];
  
  const processedUsers = users.filter(user => {
    const matchesSearch = (user.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.degreeText || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTab = activeTab === 'All' ? true : user.status === activeTab;
    const matchesDegree = filterDegree === 'All' || user.degreeText === filterDegree;
    const matchesBatch = filterBatch === 'All' || user.batchText === filterBatch;

    return matchesSearch && matchesTab && matchesDegree && matchesBatch;
  });

  const sortedUsers = sortData(processedUsers, sortBy, 'name', 'created_at');

  const indexOfLastUser = currentPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsers = sortedUsers.slice(indexOfFirstUser, indexOfLastUser);
  const totalPages = Math.ceil(sortedUsers.length / usersPerPage);

  return (
    <div className="page-container-wide">

      <div className="flex-between mb-24" style={{ flexWrap: 'wrap', gap: '16px' }}>
        <div className="flex-row align-center gap-16 flex-wrap">
          <h1 style={{ margin: 0 }}>Manage Users</h1>
          {role === 'admin' && (
            <div className="flex-row" style={{ background: 'var(--bg-color)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <button 
                onClick={() => navigate('/users')}
                style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', fontWeight: '500', cursor: 'pointer', background: 'var(--card-bg)', color: 'var(--text-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
              >
                Job Seekers
              </button>
              <button 
                onClick={() => navigate('/companies')}
                style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', fontWeight: '500', cursor: 'pointer', background: 'transparent', color: 'var(--secondary-text)', boxShadow: 'none' }}
              >
                Employers
              </button>
            </div>
          )}
        </div>
        
        <div className="flex-row gap-12">
          <button 
            className="btn-outline btn-sm" 
            onClick={() => navigate('/system-data')}
          >
            System Data
          </button>
        </div>
      </div>

      <div className="flex-row gap-8 mb-24" style={{ overflowX: 'auto', paddingBottom: '4px', borderBottom: '1px solid var(--border-color)' }}>
        {['All', 'Pending', 'Approved', 'Rejected', 'Archived'].map(tab => (
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

      <div className="mb-16">
        <SearchBar 
          value={searchQuery} 
          onChange={(e) => setSearchQuery(e.target.value)} 
          placeholder="Search by name, email, or degree..." 
        />
      </div>

      <div className="flex-row-wrap gap-16 mb-32">
        <FilterSelect 
          value={sortBy} 
          onChange={e => setSortBy(e.target.value)}
          options={[
            { value: 'name_asc', label: 'Sort by: Name (A-Z)' },
            { value: 'name_desc', label: 'Sort by: Name (Z-A)' },
            { value: 'date_asc', label: 'Sort by: Oldest First' },
            { value: 'date_desc', label: 'Sort by: Newest First' }
          ]}
        />
        <FilterSelect 
          value={filterDegree} 
          onChange={e => setFilterDegree(e.target.value)}
          options={uniqueDegrees.map(degree => ({ value: degree, label: degree === 'All' ? 'All Degrees' : degree }))}
        />
        <FilterSelect 
          value={filterBatch} 
          onChange={e => setFilterBatch(e.target.value)}
          options={uniqueBatches.map(batch => ({ value: batch, label: batch === 'All' ? 'All Batches' : `Batch ${batch}` }))}
        />
      </div>

      {isLoading ? (
        <p className="text-center text-secondary mt-32">Loading users...</p>
      ) : currentUsers.length > 0 ? (
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {currentUsers.map(user => (
            <div
              key={user.id}
              className="card p-24"
              style={{ display: 'flex', flexDirection: 'column', gap: '16px', opacity: user.status === 'Archived' ? 0.6 : 1 }}
            >
              <div className="flex-between-start" style={{ flexWrap: 'wrap', gap: '16px' }}>
                <div 
                  className="flex-row gap-16 align-start" 
                  style={{ flex: '1 1 300px', cursor: 'pointer' }}
                  onClick={() => navigate(`/user/${user.id}`)}
                >
                  <Avatar src={user.profile_pic} fallbackName={user.first_name} size="md" type="user" />
                  <div>
                    <h3 className="text-xl" style={{ margin: '0 0 8px 0' }}>
                      {user.name}
                    </h3>
                    <p className="text-sm text-secondary" style={{ margin: 0 }}>
                      {user.degreeText || 'Degree not provided'} 
                      {user.batchText ? ` • Batch ${user.batchText}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex-col align-end gap-8" style={{ flexShrink: 0 }}>
                  <StatusBadge status={user.status} />
                  <span className="text-sm text-secondary" style={{ fontSize: '0.8rem' }}>
                    Joined: {user.joinDate}
                  </span>
                </div>
              </div>

              <div className="flex-row align-center" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px', flexWrap: 'wrap', gap: '16px', justifyContent: 'flex-end' }}>
                <button 
                  className="btn-black btn-sm" 
                  style={{ backgroundColor: '#047857', borderColor: '#047857', color: '#ffffff' }}
                  onClick={() => navigate(`/user/${user.id}`)}
                >
                  View Profile
                </button>
                <button 
                  className="btn-outline btn-sm" 
                  onClick={() => handleViewResumes(user.id, user.name)}
                >
                  View Resumes
                </button>
              </div>

            </div>
          ))}
        </div>
      ) : (
        <EmptyState 
          icon="🔍"
          title="No users found"
          message="Try adjusting your search query or filters to find what you're looking for."
          className="mt-32"
        />
      )}

      {totalPages > 1 && (
        <div className="flex-between align-center mt-32">
          <p className="text-sm text-secondary" style={{ margin: 0 }}>
            Showing {indexOfFirstUser + 1} to {Math.min(indexOfLastUser, sortedUsers.length)} of {sortedUsers.length} users
          </p>
          <div className="flex-row gap-8">
            <button className="btn-outline btn-sm" onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1}>&larr; Previous</button>
            <button className="btn-outline btn-sm" onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages}>Next &rarr;</button>
          </div>
        </div>
      )}

      <Modal 
        isOpen={resumeModal.isOpen} 
        onClose={() => setResumeModal({ isOpen: false, isLoading: false, userName: '', resumes: [] })}
        title={`Resumes for ${resumeModal.userName}`}
        maxWidth="600px"
      >
        {resumeModal.isLoading ? (
          <p className="text-secondary text-center">Loading resumes...</p>
        ) : resumeModal.resumes.length > 0 ? (
          <div className="flex-col gap-12">
            {resumeModal.resumes.map(resume => (
              <div key={resume.id} className="flex-between align-center p-16" style={{ border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <div>
                  <strong className="block mb-8" style={{ fontSize: '1rem' }}>{resume.title}</strong>
                  <div className="flex-row gap-12 align-center">
                    <StatusBadge status={resume.status || 'Pending'} />
                    <span className="text-sm text-secondary">
                      Uploaded: {new Date(resume.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                
                <div className="flex-col gap-8 align-end">
                  {resume.file_url && (
                    <a href={resume.file_url} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm" style={{ textDecoration: 'none', width: '100%', textAlign: 'center' }}>
                      View PDF
                    </a>
                  )}
                  <div className="flex-row gap-8">
                    {role === 'admin' && resume.status !== 'Approved' && (
                      <button 
                        className="btn-sm" 
                        style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 12px', cursor: 'pointer' }} 
                        onClick={() => handleUpdateResumeStatus(resume.id, 'Approved')}
                      >
                        Approve
                      </button>
                    )}
                    {role === 'admin' && resume.status !== 'Rejected' && (
                      <button 
                        className="btn-sm" 
                        style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 12px', cursor: 'pointer' }} 
                        onClick={() => handleUpdateResumeStatus(resume.id, 'Rejected')}
                      >
                        Reject
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-secondary text-center m-0">No resumes uploaded.</p>
        )}
      </Modal>

      <RejectModal 
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        onSubmit={(reason) => handleUpdateResumeStatus(resumeToReject, 'Rejected', reason)}
        rejectReason={rejectReason}
        setRejectReason={setRejectReason}
        isSubmitting={isSubmittingReject}
        title="Reject Resume"
        placeholder="Provide a reason for rejecting this resume..."
      />

    </div>
  );
}