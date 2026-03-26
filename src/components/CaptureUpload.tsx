import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
import { auth, db } from '../firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { classifyFragment } from '../services/geminiService';
import { SuccessFeedback } from './SuccessFeedback';

export const CaptureUpload = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [classification, setClassification] = useState<any>(null);
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
      const result = await classifyFragment(`Uploaded file: ${file.name} (${file.type})`);
      
      await addDoc(collection(db, 'fragments'), {
        uid: auth.currentUser?.uid,
        content: preview || file.name,
        type: 'upload',
        fileType: file.type,
        fileName: file.name,
        classification: result,
        geoTag: locationData,
        timestamp: Timestamp.now()
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
        <button onClick={() => navigate(-1)} className="text-primary">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-primary">Upload Fragment</h1>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center px-8 gap-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold text-on-surface">Existing Memories.</h2>
          <p className="text-on-surface-variant max-w-xs mx-auto">
            Upload photos, audio recordings, or documents that hold a piece of the truth.
          </p>
        </div>

        {!file ? (
          <label className="w-full max-w-md aspect-square rounded-3xl border-2 border-dashed border-primary/20 bg-primary/5 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-primary/10 transition-colors">
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
            <div className="relative aspect-square rounded-3xl overflow-hidden bg-surface-container-low border border-outline-variant/10 flex items-center justify-center">
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

            <button 
              onClick={handleUpload}
              disabled={isAnalyzing}
              className="w-full bg-primary text-on-primary py-6 rounded-full text-xl font-bold shadow-lg active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
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
