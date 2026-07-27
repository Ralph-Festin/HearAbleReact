import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

import { formatStandardDate } from '../utils/dateUtils';

export default function Notifications() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');
  
  const [pendingDeletes, setPendingDeletes] = useState({});
  const pendingDeletesRef = useRef(pendingDeletes);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  
  const [broadcastRole, setBroadcastRole] = useState('everyone'); 
  const [broadcastAudience, setBroadcastAudience] = useState('all'); 
  
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastHistory, setBroadcastHistory] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  useEffect(() => {
    pendingDeletesRef.current = pendingDeletes;
  }, [pendingDeletes]);

  useEffect(() => {
    if (user) {
      fetchNotifications();
    }
  }, [user]);

  useEffect(() => {
    if (role === 'admin' && activeTab === 'Announcements') {
      fetchBroadcastHistory();
    }
  }, [role, activeTab]);

  useEffect(() => {
    return () => {
      Object.entries(pendingDeletesRef.current).forEach(([id, timeoutId]) => {
        clearTimeout(timeoutId);
        supabase.from('notifications').delete().eq('id', id).then();
      });
    };
  }, []);

  let tabs = [];
  if (role === 'admin') {
    tabs = ['All', 'Reports', 'Feedbacks', 'Users', 'Companies', 'Announcements'];
  } else if (role === 'company') {
    tabs = ['All', 'My Post', 'Announcements'];
  } else {
    tabs = ['All', 'Jobs', 'Announcements'];
  }

  async function fetchNotifications() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setNotifications(data);
    }
    setIsLoading(false);
  }

  async function fetchBroadcastHistory() {
    setIsHistoryLoading(true);
    const { data } = await supabase
      .from('system_announcements')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) setBroadcastHistory(data);
    setIsHistoryLoading(false);
  }

  async function handleDeleteAnnouncement(id) {
    if (!window.confirm("Are you sure you want to permanently delete this broadcast announcement?")) return;

    const { error } = await supabase.from('system_announcements').delete().eq('id', id);

    if (!error) {
      setBroadcastHistory(prev => prev.filter(item => item.id !== id));
    } else {
      console.error(error);
      alert("Failed to delete announcement.");
    }
  }

  async function handleMarkAsRead(id, link) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
    if (link) navigate(link);
  }

  const commitDelete = async (id) => {
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    
    if (error) {
      console.error("Error deleting notification:", error.message);
      alert("Failed to delete notification: " + error.message);
      
      setPendingDeletes(prev => {
        const newDeletes = { ...prev };
        delete newDeletes[id];
        return newDeletes;
      });
    } else {
      setNotifications(prev => prev.filter(n => n.id !== id));
      setPendingDeletes(prev => {
        const newDeletes = { ...prev };
        delete newDeletes[id];
        return newDeletes;
      });
    }
  };

  const handleDelete = (id) => {
    const timeoutId = setTimeout(() => {
      commitDelete(id);
    }, 5000);
    setPendingDeletes(prev => ({ ...prev, [id]: timeoutId }));
  };

  const handleUndo = (id) => {
    clearTimeout(pendingDeletes[id]);
    setPendingDeletes(prev => {
      const newDeletes = { ...prev };
      delete newDeletes[id];
      return newDeletes;
    });
  };

  async function handleSendBroadcast(e) {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) return;
    if (!window.confirm(`Are you sure you want to broadcast this announcement?`)) return;

    setIsBroadcasting(true);

    const { error } = await supabase.rpc('create_broadcast_announcement', {
      p_title: broadcastTitle.trim(),
      p_message: broadcastMessage.trim(),
      p_audience: broadcastAudience,
      p_target_role: broadcastRole
    });

    if (error) {
      alert("Error broadcasting announcement: " + error.message);
      console.error(error);
    } else {
      setBroadcastTitle('');
      setBroadcastMessage('');
      setBroadcastAudience('all');
      setBroadcastRole('everyone');
      setIsModalOpen(false);
      fetchBroadcastHistory();
      fetchNotifications();
    }
    setIsBroadcasting(false);
  }

  const filteredNotifications = notifications.filter(n => {
    if (activeTab === 'All') return true;
    
    const nType = n.type || 'announcement'; 
    
    if (activeTab === 'Jobs' || activeTab === 'My Post') {
      return ['job', 'interview', 'application'].includes(nType);
    }
    if (activeTab === 'Reports') return nType === 'report';
    if (activeTab === 'Feedbacks') return nType === 'feedback';
    if (activeTab === 'Users') return nType === 'user';
    if (activeTab === 'Companies') return nType === 'company';
    if (activeTab === 'Announcements') return nType === 'announcement';
    
    return true;
  });

  return (
    <div className="page-container-wide">
      
      <div className="flex-between align-center mb-24">
        <h1 className="m-0">Notifications</h1>
        {role === 'admin' && activeTab === 'Announcements' && (
          <button className="btn-black btn-sm" onClick={() => setIsModalOpen(true)}>
            + Create Announcement
          </button>
        )}
      </div>

      <div className="flex-row gap-8 mb-32" style={{ overflowX: 'auto', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 24px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--primary-color)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--primary-color)' : 'var(--secondary-text)',
              fontWeight: activeTab === tab ? '600' : '400',
              cursor: 'pointer',
              fontSize: '1rem',
              whiteSpace: 'nowrap'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {role === 'admin' && activeTab === 'Announcements' && (
        <div className="mb-32">
          
          {isModalOpen && (
            <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
                <div className="modal-header">
                  <h3 className="m-0">New Broadcast Announcement</h3>
                  <button className="close-btn" onClick={() => setIsModalOpen(false)}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
                <div className="modal-body">
                  <form onSubmit={handleSendBroadcast} className="flex-col gap-16">
                    <div>
                      <label className="block mb-8 text-sm font-bold">Announcement Title *</label>
                      <input type="text" className="search-input" placeholder="e.g., Scheduled Platform Maintenance" value={broadcastTitle} onChange={(e) => setBroadcastTitle(e.target.value)} required />
                    </div>
                    
                    <div className="flex-row gap-16" style={{ flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <label className="block mb-8 text-sm font-bold">Target Audience *</label>
                        <select className="search-input" value={broadcastRole} onChange={(e) => setBroadcastRole(e.target.value)}>
                          <option value="everyone">All Roles</option>
                          <option value="users">Standard Users Only</option>
                          <option value="admins">Admins Only</option>
                          <option value="companies">Companies Only</option>
                        </select>
                      </div>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <label className="block mb-8 text-sm font-bold">Account Status *</label>
                        <select className="search-input" value={broadcastAudience} onChange={(e) => setBroadcastAudience(e.target.value)}>
                          <option value="all">All Accounts (Current & New)</option>
                          <option value="existing">Existing Accounts Only</option>
                          <option value="new">New Accounts Only</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block mb-8 text-sm font-bold">Message Content *</label>
                      <textarea className="search-input" rows="5" placeholder="Write the full announcement details here..." value={broadcastMessage} onChange={(e) => setBroadcastMessage(e.target.value)} required />
                    </div>

                    <div className="flex-row gap-12 mt-8" style={{ justifyContent: 'flex-end' }}>
                      <button type="button" className="btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
                      <button type="submit" className="btn-black" disabled={isBroadcasting}>
                        {isBroadcasting ? 'Broadcasting...' : 'Send Announcement'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          <div className="card p-0" style={{ overflow: 'hidden' }}>
            <div className="p-20" style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-color)' }}>
              <h3 className="m-0">Broadcast History</h3>
            </div>
            {isHistoryLoading ? (
              <p className="text-secondary text-center p-32 m-0">Loading history...</p>
            ) : broadcastHistory.length > 0 ? (
              <div className="flex-col">
                {broadcastHistory.map((item, index) => (
                  <div key={item.id} className="p-20" style={{ borderBottom: index !== broadcastHistory.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                    <div className="flex-between-start mb-8">
                      <h4 className="text-lg m-0">{item.title}</h4>
                      <div className="flex-row gap-8">
                        <span className="badge badge-neutral text-sm" style={{ textTransform: 'capitalize' }}>Audience: {item.target_role === 'everyone' ? 'All Roles' : item.target_role}</span>
                        <span className="badge badge-info text-sm" style={{ textTransform: 'capitalize' }}>Status: {item.audience} Accounts</span>
                      </div>
                    </div>
                    <p className="text-secondary m-0 mb-12 text-sm">{item.message}</p>
                    
                    <div className="flex-between align-center">
                      <span className="text-sm text-secondary" style={{ fontSize: '0.75rem' }}>
                        Sent: {new Date(item.created_at).toLocaleString()}
                      </span>
                      <button 
                        onClick={() => handleDeleteAnnouncement(item.id)}
                        style={{ background: 'transparent', color: '#dc2626', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-secondary text-center p-32 m-0">No announcements have been sent yet.</p>
            )}
          </div>
          
          <div className="divider"></div>
          <h2 className="m-0 mb-16">My Inbox</h2>
        </div>
      )}

      {isLoading ? (
        <p className="text-secondary text-center p-32">Loading notifications...</p>
      ) : filteredNotifications.length > 0 ? (
        <div className="flex-col gap-16">
          {filteredNotifications.map(notification => {
            
            const isPendingDelete = pendingDeletes.hasOwnProperty(notification.id);

            if (isPendingDelete) {
              return (
                <div key={notification.id} className="card flex-between align-center p-16" style={{ background: 'var(--bg-color)', borderStyle: 'dashed' }}>
                  <span className="text-secondary font-bold">Notification deleted</span>
                  <button 
                    onClick={() => handleUndo(notification.id)}
                    style={{ background: 'transparent', color: 'var(--primary-color)', border: 'none', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Undo
                  </button>
                </div>
              );
            }

            return (
              <div key={notification.id} className={`card p-20 ${!notification.is_read ? 'selected-card' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="flex-between-start">
                  
                  <div onClick={() => handleMarkAsRead(notification.id, notification.link)} style={{ cursor: notification.link ? 'pointer' : 'default', flex: 1 }}>
                    <div className="flex-row align-center gap-8 mb-8">
                      {!notification.is_read && <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary-color)' }}></span>}
                      <h3 className="m-0 text-lg" style={{ color: !notification.is_read ? 'var(--text-color)' : 'var(--secondary-text)' }}>
                        {notification.title}
                      </h3>
                    </div>
                    <p className="m-0 text-secondary" style={{ lineHeight: '1.5' }}>{notification.message}</p>
                    
                    <span className="text-sm text-secondary mt-12 block">
                      {formatStandardDate(notification.created_at)} at {new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <button onClick={() => handleDelete(notification.id)} className="nav-icon-btn" title="Delete Notification" style={{ flexShrink: 0, marginLeft: '16px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>

                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card text-center text-secondary p-32">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginBottom: '16px' }}>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <h3 className="m-0 mb-8">No notifications</h3>
          <p className="m-0">You are all caught up in this category.</p>
        </div>
      )}
    </div>
  );
}