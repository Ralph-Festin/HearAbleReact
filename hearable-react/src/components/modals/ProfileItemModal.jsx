import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';

export default function ProfileItemModal({ 
  isOpen, 
  onClose, 
  userId, 
  onSuccess, 
  initialData, 
  itemType, // 'experience', 'certificate', or 'award'
  allowFileUpload // boolean
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [currentFileUrl, setCurrentFileUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [allSkills, setAllSkills] = useState([]);
  const [selectedSkills, setSelectedSkills] = useState([]); 
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Configuration mapping based on the itemType prop
  const config = useMemo(() => {
    const map = {
      experience: {
        label: 'Experience',
        table: 'work_experiences',
        junctionTable: 'work_experience_skills',
        foreignKey: 'work_experience_id',
        skillsDataKey: 'work_experience_skills'
      },
      certificate: {
        label: 'Certificate',
        table: 'certificates',
        junctionTable: 'certificate_skills',
        foreignKey: 'certificate_id',
        skillsDataKey: 'certificate_skills'
      },
      award: {
        label: 'Award',
        table: 'awards',
        junctionTable: 'award_skills',
        foreignKey: 'award_id',
        skillsDataKey: 'award_skills'
      }
    };
    return map[itemType];
  }, [itemType]);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTitle(initialData.title || '');
        setDescription(initialData.description || '');
        setCurrentFileUrl(initialData.file_url || '');
        
        // Load existing skills dynamically
        if (initialData[config.skillsDataKey]) {
          const loadedSkills = initialData[config.skillsDataKey].map(ws => ws.skills);
          setSelectedSkills(loadedSkills);
        } else {
          setSelectedSkills([]);
        }
      } else {
        setTitle(''); setDescription(''); setCurrentFileUrl(''); setSelectedSkills([]);
      }
      setFile(null);
      setSearchTerm('');
      fetchAllSkills();
    }
  }, [isOpen, initialData, config]);

  async function fetchAllSkills() {
    const { data } = await supabase.from('skills').select('id, name').order('name');
    if (data) setAllSkills(data);
  }

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    // 🚨 UPDATED: Increased limit to 1MB (1048576 bytes)
    if (selectedFile.size > 1048576) { 
      alert("File size exceeds 1MB.");
      e.target.value = ''; setFile(null); return;
    }
    if (selectedFile.type !== 'application/pdf') {
      alert("Only PDF files are allowed.");
      e.target.value = ''; setFile(null); return;
    }
    setFile(selectedFile);
  };

  const handleSelectSkill = (skillObj) => {
    setSelectedSkills(prev => [...prev, skillObj]);
    setSearchTerm(''); setIsDropdownOpen(false);     
  };

  const availableSkills = useMemo(() => allSkills.filter(skill => !selectedSkills.find(s => s.id === skill.id)), [allSkills, selectedSkills]);
  const displayedSkills = useMemo(() => !searchTerm.trim() ? availableSkills : availableSkills.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())), [searchTerm, availableSkills]);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      let finalFileUrl = currentFileUrl;

      // Handle PDF Upload if applicable
      if (allowFileUpload && file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}-${Date.now()}.${fileExt}`;
        const filePath = `${config.table}/${fileName}`;

        await supabase.storage.from('user_documents').upload(filePath, file);
        const { data } = supabase.storage.from('user_documents').getPublicUrl(filePath);
        finalFileUrl = data.publicUrl;

        // Cleanup old file if replacing
        if (initialData?.file_url && initialData.file_url.includes('/user_documents/')) {
           const oldFilePath = initialData.file_url.split('/user_documents/')[1];
           await supabase.storage.from('user_documents').remove([oldFilePath]);
        }
      }

      let itemId = initialData?.id;
      const payload = { profile_id: userId, title, description };
      if (allowFileUpload) payload.file_url = finalFileUrl;

      if (itemId) {
        // Edit mode
        await supabase.from(config.table).update(payload).eq('id', itemId);
        await supabase.from(config.junctionTable).delete().eq(config.foreignKey, itemId);
      } else {
        // Add mode
        const { data: itemData, error: dbError } = await supabase
          .from(config.table)
          .insert([payload])
          .select()
          .single();
        if (dbError) throw dbError;
        itemId = itemData.id;
      }

      // Handle Skill Linking
      if (selectedSkills.length > 0) {
        // 1. Link to the specific item (experience/certificate/award)
        const skillInserts = selectedSkills.map(skill => ({
          [config.foreignKey]: itemId,
          skill_id: skill.id
        }));
        await supabase.from(config.junctionTable).insert(skillInserts);

        // 2. Automatically sync these skills to the user's main profile skills
        const profileSkillsToSync = selectedSkills.map(skill => ({
          profile_id: userId,
          skill_id: skill.id
        }));
        
        // upsert with ignoreDuplicates ensures we don't throw an error if the user already has this skill
        await supabase
          .from('profile_skills')
          .upsert(profileSkillsToSync, { onConflict: 'profile_id, skill_id', ignoreDuplicates: true });
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      alert(`Failed to save ${config.label.toLowerCase()}.`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div className="card p-32" style={{ width: '100%', maxWidth: '600px', overflow: 'visible' }}>
        <h2 className="m-0 mb-24 text-2xl">{initialData ? 'Edit' : 'Add'} {config.label}</h2>
        
        <form onSubmit={handleSave} className="flex-col gap-16">
          <div>
            <label className="font-bold text-sm block mb-8">{config.label} Title *</label>
            <input required type="text" className="search-input w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="font-bold text-sm block mb-8">Description</label>
            <textarea className="search-input w-full" value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: '80px', resize: 'vertical' }} />
          </div>

          {allowFileUpload && (
            <div>
              {/* 🚨 UPDATED: Label text updated to reflect 1MB limit */}
              <label className="font-bold text-sm block mb-8">Attach PDF (Max 1MB)</label>
              {currentFileUrl && <p className="text-sm text-secondary mt-0 mb-8">Current file exists. Uploading a new one will replace it.</p>}
              <input type="file" accept="application/pdf" onChange={handleFileChange} className="search-input w-full" style={{ padding: '8px' }} />
            </div>
          )}

          <div>
            <label className="font-bold text-sm block mb-8 mt-8">Tag Skills Acquired (Optional)</label>
            {selectedSkills.length > 0 && (
              <div className="flex-row-wrap gap-8 mb-12">
                {selectedSkills.map(skill => (
                  <span key={skill.id} className="badge badge-neutral flex-row align-center gap-8">
                    {skill.name}
                    <button type="button" onClick={() => setSelectedSkills(prev => prev.filter(s => s.id !== skill.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 4px', fontWeight: 'bold' }}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <input 
                type="text" 
                value={searchTerm} 
                onChange={(e) => { setSearchTerm(e.target.value); setIsDropdownOpen(true); }} 
                onFocus={() => setIsDropdownOpen(true)} 
                onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                placeholder="Search and link a skill..." 
                className="search-input w-full" 
                autoComplete="off" 
              />
              {isDropdownOpen && displayedSkills.length > 0 && (
                <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: '160px', overflowY: 'auto', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', marginTop: '4px', padding: 0, listStyle: 'none', zIndex: 1010 }}>
                  {displayedSkills.map((skill) => (
                    <li key={skill.id} onMouseDown={(e) => { e.preventDefault(); handleSelectSkill(skill); }} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }} onMouseEnter={(e) => e.target.style.backgroundColor = '#f9fafb'} onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}>{skill.name}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex-row gap-12 mt-16" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn-outline" onClick={onClose} disabled={isSaving}>Cancel</button>
            <button type="submit" className="btn-black" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}