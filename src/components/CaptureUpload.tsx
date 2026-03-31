import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useUser } from '@clerk/clerk-react';
import { 
  Upload, 
  ArrowLeft, 
  Loader2, 
  File, 
  Image as ImageIcon, 
  Music, 
  X 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { classifyFragment } from '../services/geminiService';
import { resolveCanonicalVictimIdentity, saveVictimWebCapture } from '../services/canonicalCaseClient';
import { SuccessFeedback } from './SuccessFeedback';

export const CaptureUpload = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [classification, setClassification] = useState<any>(null);
  const [note, setNote] = useState('');
  const [locationData, setLocationData] = useState<{lat: number, lng: number} | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocationData({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.warn("Location access denied", err)
      );
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      if (selected.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => setPreview(reader.result as string);
        reader.readAsDataURL(selected);
      } else {
        setPreview(null);
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsAnalyzing(true);
    
    try {
      // In a real app, we'd upload to Firebase Storage. 
      // For this demo, we'll use the filename/type as "content" or a mock data URL.
      const result = await classifyFragment(`Uploaded file: ${file.name} (${file.type}) ${note ? `note: ${note}` : ''}`);

      const identity = resolveCanonicalVictimIdentity({
        clerkId: user?.id,
        email: user?.primaryEmailAddress?.emailAddress,
        displayName: user?.fullName,
      });

      const locationSummary = locationData
        ? `lat:${locationData.lat.toFixed(5)}, lng:${locationData.lng.toFixed(5)}`
        : 'location-unavailable';

      await saveVictimWebCapture({
        victimUniqueId: identity.victimUniqueId,
        email: identity.email,
        displayName: identity.displayName,
        incidentSummary: `Uploaded ${file.name}`,
        fragments: [
          `[UPLOAD] ${file.name} (${file.type || 'unknown/type'})`,
          ...(note.trim() ? [`[UPLOAD_NOTE] ${note.trim()}`] : []),
          `[UPLOAD_CLASSIFICATION] ${JSON.stringify(result)}`,
          `[UPLOAD_LOCATION] ${locationSummary}`,
        ],
        source: 'web-upload-capture',
      });

      setClassification(result);
      setIsAnalyzing(false);
      setShowSuccess(true);
    } catch (error) {
      console.error("Failed to upload fragment", error);
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <AnimatePresence>
        {showSuccess && (
          <SuccessFeedback 
            classification={classification} 
            onClose={() => navigate('/war-room')} 
          />
        )}
      </AnimatePresence>

      <header className="p-6 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="sa-btn-ghost h-11 w-11 !p-0 text-primary" aria-label="Go back">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-on-surface">Upload Evidence</h1>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center px-8 gap-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold text-on-surface">Existing Evidence</h2>
          <p className="text-on-surface-variant max-w-xs mx-auto">
            Upload photos, audio recordings, or documents. Add a note if context may help later.
          </p>
        </div>

        {!file ? (
          <label className="w-full max-w-md aspect-square rounded-3xl border-2 border-dashed border-primary/30 bg-surface-container-low flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-primary/10 transition-colors">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Upload size={40} />
            </div>
            <div className="text-center">
              <p className="font-bold text-primary">Click to upload</p>
              <p className="text-xs text-on-surface-variant">Images or Audio files</p>
            </div>
            <input type="file" className="hidden" accept="image/*,audio/*" onChange={handleFileChange} />
          </label>
        ) : (
          <div className="w-full max-w-md space-y-6">
            <div className="relative aspect-square rounded-3xl overflow-hidden bg-surface-container-low border border-[var(--color-outline)] flex items-center justify-center">
              {preview ? (
                <img src={preview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-4">
                  {file.type.startsWith('audio/') ? <Music size={64} className="text-primary" /> : <File size={64} className="text-primary" />}
                  <p className="font-bold text-sm truncate max-w-[200px]">{file.name}</p>
                </div>
              )}
              <button 
                onClick={() => { setFile(null); setPreview(null); }}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-md"
              >
                <X size={20} />
              </button>
            </div>

            <div className="sa-card p-4">
              <label className="sa-field-label">Optional context note</label>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="sa-input min-h-28 resize-y"
                placeholder="Example: CCTV camera faces this lane, captured after 9:15 PM."
              />
            </div>

            <button
              onClick={handleUpload}
              disabled={isAnalyzing}
              className="sa-btn-primary w-full py-5 text-lg flex items-center justify-center gap-3"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="animate-spin" size={24} />
                  Analyzing...
                </>
              ) : (
                <>
                  <Upload size={24} />
                  Process Fragment
                </>
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
