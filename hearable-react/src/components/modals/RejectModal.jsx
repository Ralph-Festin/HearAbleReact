import React from 'react';

export default function RejectModal({
  isOpen,
  onClose,
  onSubmit,
  rejectReason,
  setRejectReason,
  isSubmitting,
  title = "Reject Item", // NEW PROP
  placeholder = "Provide a reason for rejection..." // NEW PROP
}) {
  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!rejectReason.trim()) return;
    onSubmit(rejectReason.trim());
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '20px' }}>
      <div className="card p-0" style={{ width: '100%', maxWidth: '500px', background: 'var(--card-bg)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="m-0" style={{ fontSize: '1.25rem' }}>{title}</h3> {/* UPDATED */}
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-color)', lineHeight: 1 }}>&times;</button>
        </div>
        <div style={{ padding: '24px' }}>
          <form onSubmit={handleSubmit} className="flex-col gap-16">
            <div>
              <label className="block mb-8 font-medium">Reason for Rejection</label>
              <textarea 
                className="search-input w-full" 
                rows="4" 
                style={{ resize: 'vertical' }}
                placeholder={placeholder} /* UPDATED */
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
              />
            </div>
            <div className="flex-row gap-12 mt-8" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-black" style={{ background: '#dc2626', color: 'white', border: 'none' }} disabled={isSubmitting}>
                {isSubmitting ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}