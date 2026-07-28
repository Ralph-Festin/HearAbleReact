import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

import EditProfileModal from '../components/modals/EditProfileModal';
import AddSkillModal from '../components/modals/AddSkillModal';
import ProfileItemModal from '../components/modals/ProfileItemModal';
import RejectModal from '../components/modals/RejectModal';

import StatusBadge from '../components/common/StatusBadge'; 
import BackButton from '../components/common/BackButton'; 
import ProfileBanner from '../components/profile/ProfileBanner'; 
import { formatFullName, formatLocation } from '../utils/formatUtils';
import JobPreferencesWidget from '../components/profile/JobPreferencesWidget';

export default function UserProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser, role } = useAuth(); 
  
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddSkillPopup, setShowAddSkillPopup] = useState(false);
  
  const [showExperienceModal, setShowExperienceModal] = useState(false);
  const [showCertificatesModal, setShowCertificatesModal] = useState(false);
  const [showAwardsModal, setShowAwardsModal] = useState(false);
  
  const [editExperienceData, setEditExperienceData] = useState(null);
  const [editCertificateData, setEditCertificateData] = useState(null);
  const [editAwardData, setEditAwardData] = useState(null);

  const [isUpdatingSkills, setIsUpdatingSkills] = useState(false);

  // Reject Modal States
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);

  useEffect(() => {
    fetchUser();
  }, [id]);

  useEffect(() => {
    if (location.state?.openAddSkill && currentUser?.id === id) {
      setShowAddSkillPopup(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, currentUser, id]);

  async function fetchUser() {
    setIsLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select(`
        *, 
        degrees ( name, abbreviation ), 
        batches ( batch_number ), 
        profile_skills ( skills ( name ) ), 
        locations ( city, country ),
        work_experiences ( id, title, description, work_experience_skills(skills(id, name)) ),
        certificates ( id, title, description, file_url, certificate_skills(skills(id, name)) ),
        awards ( id, title, description, file_url, award_skills(skills(id, name)) )
      `)
      .eq('id', id)
      .maybeSingle();
    
    if (data) {
      const formattedUser = {
        ...data,
        skills: data.profile_skills ? data.profile_skills.map(ps => ps.skills.name) : []
      };
      setUser(formattedUser);
    }
    setIsLoading(false);
  }

  async function handleUpdateStatus(newStatus, reason = '') {
    if (role !== 'admin') return;
    
    if (newStatus === 'Rejected' && !reason) {
      setShowRejectModal(true);
      return;
    }

    setIsSubmittingReject(true);
    const updatePayload = { status: newStatus, ...(newStatus === 'Approved' ? { approved_at: new Date().toISOString() } : {}) };
    const { error } = await supabase.from('profiles').update(updatePayload).eq('id', user.id);
    
    if (!error) {
      setUser({ ...user, status: newStatus });
      
      if (newStatus === 'Approved') {
        await supabase.from('notifications').insert([{ user_id: user.id, title: 'Account Approved!', message: 'An administrator has approved your account.', link: '/jobs', type: 'user' }]);
      }
      
      if (newStatus === 'Rejected' && reason) {
        await supabase.from('notifications').insert([{ 
          user_id: user.id, 
          title: 'Account Rejected', 
          message: `Your account approval was rejected. Reason: ${reason}`, 
          type: 'user' 
        }]);
      }
      
      if (showRejectModal) {
        setShowRejectModal(false);
        setRejectReason('');
      }
    } else {
      alert("Failed to update user status.");
    }
    setIsSubmittingReject(false);
  }

  async function handleArchiveUser() {
    if (role !== 'admin') return;
    if (!window.confirm(`Are you sure you want to archive ${formatFullName(user.first_name, user.last_name)}?`)) return;
    const { error } = await supabase.from('profiles').update({ status: 'Archived' }).eq('id', user.id);
    if (!error) setUser({ ...user, status: 'Archived' });
  }

  async function handleUnarchiveUser() {
    if (role !== 'admin') return;
    if (!window.confirm(`Are you sure you want to unarchive ${formatFullName(user.first_name, user.last_name)}?`)) return;
    const { error } = await supabase.from('profiles').update({ status: 'Pending' }).eq('id', user.id);
    if (!error) setUser({ ...user, status: 'Pending' });
  }

  async function handleAddSkill(skillObj) {
    if (!skillObj || !user || !currentUser) return;
    setIsUpdatingSkills(true);
    try {
      const { error: linkError } = await supabase.from('profile_skills').insert([{ profile_id: currentUser.id, skill_id: skillObj.id }]);
      if (linkError && linkError.code !== '23505') throw linkError;
      if (!user.skills.includes(skillObj.name)) setUser({ ...user, skills: [...user.skills, skillObj.name] });
      setShowAddSkillPopup(false); 
    } catch (error) {
      alert("Failed to add skill. Please try again.");
    } finally { setIsUpdatingSkills(false); }
  }

  async function handleRemoveSkill(skillToRemove) {
    if (!user || !currentUser) return;
    setIsUpdatingSkills(true);
    try {
      const { data: skillData } = await supabase.from('skills').select('id').eq('name', skillToRemove).single();
      if (skillData) await supabase.from('profile_skills').delete().match({ profile_id: currentUser.id, skill_id: skillData.id });
      setUser({ ...user, skills: user.skills.filter(skill => skill !== skillToRemove) });
    } catch (error) { console.error(error); } 
    finally { setIsUpdatingSkills(false); }
  }

  const handleDeleteExperience = async (id) => {
    if (!window.confirm('Are you sure you want to delete this experience?')) return;
    const { error } = await supabase.from('work_experiences').delete().eq('id', id);
    if (!error) fetchUser();
    else alert('Failed to delete experience.');
  };

  const handleDeleteCertificate = async (id, fileUrl) => {
    if (!window.confirm('Are you sure you want to delete this certificate?')) return;
    if (fileUrl && fileUrl.includes('/user_documents/')) {
      const filePath = fileUrl.split('/user_documents/')[1];
      await supabase.storage.from('user_documents').remove([filePath]);
    }
    const { error } = await supabase.from('certificates').delete().eq('id', id);
    if (!error) fetchUser();
    else alert('Failed to delete certificate.');
  };

  const handleDeleteAward = async (id, fileUrl) => {
    if (!window.confirm('Are you sure you want to delete this award?')) return;
    if (fileUrl && fileUrl.includes('/user_documents/')) {
      const filePath = fileUrl.split('/user_documents/')[1];
      await supabase.storage.from('user_documents').remove([filePath]);
    }
    const { error } = await supabase.from('awards').delete().eq('id', id);
    if (!error) fetchUser();
    else alert('Failed to delete award.');
  };

  const openEditExperience = (exp) => { setEditExperienceData(exp); setShowExperienceModal(true); };
  const openEditCertificate = (cert) => { setEditCertificateData(cert); setShowCertificatesModal(true); };
  const openEditAward = (award) => { setEditAwardData(award); setShowAwardsModal(true); };

  if (isLoading) return <div className="page-container-wide text-center mt-32"><p className="text-secondary">Loading profile...</p></div>;
  if (!user) return <div className="page-container-wide text-center mt-32"><h2>Profile Not Found</h2><button className="btn-outline mt-16" onClick={() => navigate('/')}>Go Home</button></div>;

  const isOwnProfile = currentUser?.id === user.id;
  const isAdmin = role === 'admin';
  const locationText = formatLocation(user.locations?.city, user.locations?.country, '');
  const fullName = formatFullName(user.first_name, user.last_name);

  return (
    <div className="page-container-wide">
      <BackButton />

      <EditProfileModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} userId={user.id} onSuccess={fetchUser} />
      <AddSkillModal isOpen={showAddSkillPopup} onClose={() => setShowAddSkillPopup(false)} onAddSkill={handleAddSkill} existingSkills={user.skills} isUpdating={isUpdatingSkills} />
      
      <ProfileItemModal 
        isOpen={showExperienceModal} 
        onClose={() => { setShowExperienceModal(false); setEditExperienceData(null); }} 
        userId={user.id} 
        onSuccess={fetchUser} 
        initialData={editExperienceData} 
        itemType="experience" 
        allowFileUpload={false} 
      />
      <ProfileItemModal 
        isOpen={showCertificatesModal} 
        onClose={() => { setShowCertificatesModal(false); setEditCertificateData(null); }} 
        userId={user.id} 
        onSuccess={fetchUser} 
        initialData={editCertificateData} 
        itemType="certificate" 
        allowFileUpload={true} 
      />
      <ProfileItemModal 
        isOpen={showAwardsModal} 
        onClose={() => { setShowAwardsModal(false); setEditAwardData(null); }} 
        userId={user.id} 
        onSuccess={fetchUser} 
        initialData={editAwardData} 
        itemType="award" 
        allowFileUpload={true} 
      />

      <ProfileBanner 
        avatarSrc={user.profile_pic}
        fallbackName={user.first_name}
        avatarType="user"
        title={fullName}
        subtitle={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="text-primary" style={{ fontWeight: '600' }}>{user.headline || 'Talent Profile'}</span>
            {locationText && <span className="text-secondary text-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>📍 {locationText}</span>}
          </div>
        }
        actionButton={isOwnProfile ? <button className="btn-outline" onClick={() => setShowEditModal(true)}>Edit Profile</button> : null}
      />

      {isAdmin && (
        <div className="card p-24 mb-32 flex-col gap-16" style={{ border: '1px solid var(--primary-color)', background: 'var(--card-bg)' }}>
          <div className="flex-between align-center flex-wrap gap-16">
            <div className="flex-row gap-12 align-center">
              <strong style={{ color: 'var(--primary-color)' }}>Admin Controls:</strong>
              <StatusBadge status={user.status} />
            </div>
            <div className="flex-row gap-8 flex-wrap">
              {user.status !== 'Approved' && (
                <button className="btn-outline btn-sm" onClick={() => handleUpdateStatus('Approved')} style={{ borderColor: '#86efac', color: '#166534', background: '#ecfdf5' }}>
                  Approve User
                </button>
              )}
              {user.status !== 'Rejected' && (
                <button className="btn-outline btn-sm" onClick={() => handleUpdateStatus('Rejected')} style={{ borderColor: '#fca5a5', color: '#991b1b', background: '#fef2f2' }}>
                  Reject User
                </button>
              )}
              {user.status !== 'Archived' ? (
                <button className="btn-outline btn-sm" onClick={handleArchiveUser} style={{ borderColor: '#d1d5db', color: '#374151', background: '#f9fafb' }}>
                  Archive
                </button>
              ) : (
                <button className="btn-outline btn-sm" onClick={handleUnarchiveUser} style={{ borderColor: '#d1d5db', color: '#374151', background: '#f9fafb' }}>
                  Unarchive
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-layout">
        <div className="flex-col gap-32">

          {/* About Section */}
          <div className="card p-24">
            <div className="flex-between align-center mb-16 gap-16 flex-wrap">
              <h3 className="m-0">About</h3>
              {isOwnProfile && (
                <button className="btn-outline btn-sm" onClick={() => setShowEditModal(true)}>
                  Edit
                </button>
              )}
            </div>
            <p className="text-secondary" style={{ lineHeight: '1.7', whiteSpace: 'pre-wrap', margin: 0 }}>
              {/* 🚨 CHANGED: Reads directly from user.bio */}
              {user.bio || "This user hasn't added an about section yet."}
            </p>
          </div>
          
          <div className="card p-24">
            <div className="flex-between align-center mb-16 gap-16 flex-wrap">
              <h3 className="m-0">Skills</h3>
              {isOwnProfile && <button className="btn-outline btn-sm" onClick={() => setShowAddSkillPopup(true)}>+ Add Skill</button>}
            </div>
            <div className="flex-row-wrap gap-12">
              {user.skills && user.skills.length > 0 ? (
                user.skills.map((skill, index) => (
                  <span key={index} className="badge badge-neutral flex-row align-center gap-8" style={{ padding: '6px 12px', fontSize: '0.95rem' }}>
                    {skill}
                    {isOwnProfile && (
                      <button onClick={() => handleRemoveSkill(skill)} disabled={isUpdatingSkills} style={{ background: 'none', border: 'none', color: 'var(--secondary-text)', cursor: 'pointer', padding: '0 0 0 4px', fontSize: '1.1rem', fontWeight: 'bold' }}>×</button>
                    )}
                  </span>
                ))
              ) : <p className="text-secondary m-0">No skills added yet.</p>}
            </div>
          </div>

          <div className="card p-24">
            <div className="flex-between align-center mb-16 gap-16 flex-wrap">
              <h3 className="m-0">Work Experience</h3>
              {isOwnProfile && <button className="btn-outline btn-sm" onClick={() => { setEditExperienceData(null); setShowExperienceModal(true); }}>+ Add Experience</button>}
            </div>
            {user.work_experiences && user.work_experiences.length > 0 ? (
              <div className="flex-col gap-24">
                {user.work_experiences.map(exp => (
                  <div key={exp.id} style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                    <div className="flex-between-start mb-8">
                      <h4 className="m-0 text-lg">{exp.title}</h4>
                      {isOwnProfile && (
                        <div className="flex-row gap-8">
                          <button onClick={() => openEditExperience(exp)} className="btn-outline btn-sm" style={{ padding: '4px 8px' }}>Edit</button>
                          <button onClick={() => handleDeleteExperience(exp.id)} className="btn-outline btn-sm" style={{ padding: '4px 8px', color: '#dc2626', borderColor: '#fca5a5' }}>Delete</button>
                        </div>
                      )}
                    </div>
                    <p className="m-0 mb-12 text-secondary" style={{ whiteSpace: 'pre-wrap' }}>{exp.description}</p>
                    {exp.work_experience_skills && exp.work_experience_skills.length > 0 && (
                      <div className="flex-row-wrap gap-8">
                        {exp.work_experience_skills.map(ws => (
                          <span key={ws.skills.id} className="badge badge-neutral text-xs">{ws.skills.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : <p className="text-secondary m-0">No experience added yet.</p>}
          </div>

          <div className="card p-24">
            <div className="flex-between align-center mb-16 gap-16 flex-wrap">
              <h3 className="m-0">Certificates</h3>
              {isOwnProfile && <button className="btn-outline btn-sm" onClick={() => { setEditCertificateData(null); setShowCertificatesModal(true); }}>+ Add Certificate</button>}
            </div>
            {user.certificates && user.certificates.length > 0 ? (
              <div className="flex-col gap-24">
                {user.certificates.map(cert => (
                  <div key={cert.id} style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                    <div className="flex-between-start mb-8">
                      <h4 className="m-0 text-lg">
                        {cert.title}
                        {cert.file_url && <a href={cert.file_url} target="_blank" rel="noopener noreferrer" className="ml-12 text-sm" style={{ color: 'var(--primary-color)' }}>(View PDF)</a>}
                      </h4>
                      {isOwnProfile && (
                        <div className="flex-row gap-8">
                          <button onClick={() => openEditCertificate(cert)} className="btn-outline btn-sm" style={{ padding: '4px 8px' }}>Edit</button>
                          <button onClick={() => handleDeleteCertificate(cert.id, cert.file_url)} className="btn-outline btn-sm" style={{ padding: '4px 8px', color: '#dc2626', borderColor: '#fca5a5' }}>Delete</button>
                        </div>
                      )}
                    </div>
                    <p className="m-0 mb-12 text-secondary" style={{ whiteSpace: 'pre-wrap' }}>{cert.description}</p>
                    {cert.certificate_skills && cert.certificate_skills.length > 0 && (
                      <div className="flex-row-wrap gap-8">
                        {cert.certificate_skills.map(cs => (
                          <span key={cs.skills.id} className="badge badge-neutral text-xs">{cs.skills.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : <p className="text-secondary m-0">No certificates added yet.</p>}
          </div>

          <div className="card p-24">
            <div className="flex-between align-center mb-16 gap-16 flex-wrap">
              <h3 className="m-0">Awards</h3>
              {isOwnProfile && <button className="btn-outline btn-sm" onClick={() => { setEditAwardData(null); setShowAwardsModal(true); }}>+ Add Award</button>}
            </div>
            {user.awards && user.awards.length > 0 ? (
              <div className="flex-col gap-24">
                {user.awards.map(award => (
                  <div key={award.id} style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                    <div className="flex-between-start mb-8">
                      <h4 className="m-0 text-lg">
                        {award.title}
                        {award.file_url && <a href={award.file_url} target="_blank" rel="noopener noreferrer" className="ml-12 text-sm" style={{ color: 'var(--primary-color)' }}>(View PDF)</a>}
                      </h4>
                      {isOwnProfile && (
                        <div className="flex-row gap-8">
                          <button onClick={() => openEditAward(award)} className="btn-outline btn-sm" style={{ padding: '4px 8px' }}>Edit</button>
                          <button onClick={() => handleDeleteAward(award.id, award.file_url)} className="btn-outline btn-sm" style={{ padding: '4px 8px', color: '#dc2626', borderColor: '#fca5a5' }}>Delete</button>
                        </div>
                      )}
                    </div>
                    <p className="m-0 mb-12 text-secondary" style={{ whiteSpace: 'pre-wrap' }}>{award.description}</p>
                    {award.award_skills && award.award_skills.length > 0 && (
                      <div className="flex-row-wrap gap-8">
                        {award.award_skills.map(aws => (
                          <span key={aws.skills.id} className="badge badge-neutral text-xs">{aws.skills.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : <p className="text-secondary m-0">No awards added yet.</p>}
          </div>

        </div>

        <div style={{ position: 'sticky', top: '90px' }}>
          <div className="card p-24 mb-24">
            <h3 className="mb-16 m-0">Contact Details</h3>
            
            <div className="flex-col gap-16">
              <div style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                <span className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>Email Address</span>
                <strong style={{ fontSize: '1rem', display: 'block', wordBreak: 'break-all' }}>{user.email || 'Not specified'}</strong>
              </div>

              <div style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                <span className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>Contact Number</span>
                <strong style={{ fontSize: '1rem', display: 'block' }}>{user.contact_number || 'Not specified'}</strong>
              </div>
              {user.portfolio_url && (
                <div style={{ paddingTop: '12px' }}>
                  <span className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>Portfolio</span>
                  <a href={user.portfolio_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '1rem', display: 'block', wordBreak: 'break-all', color: 'var(--primary-color)' }}>
                    {user.portfolio_url}
                  </a>
                </div>
              )}
            </div>
          </div>
          <JobPreferencesWidget user={user} isOwnProfile={isOwnProfile} onUpdate={fetchUser} />
        </div>
      </div>

      <RejectModal 
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        onSubmit={(reason) => handleUpdateStatus('Rejected', reason)}
        rejectReason={rejectReason}
        setRejectReason={setRejectReason}
        isSubmitting={isSubmittingReject}
        title="Reject User Account"
        placeholder="Provide a reason for rejecting this user (this will be sent to their email)..."
      />
    </div>
  );
}