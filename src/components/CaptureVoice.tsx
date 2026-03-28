import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  useUser,
} from '@clerk/clerk-react';
import {
  Mic, 
  Square, 
  ArrowLeft, 
  Sparkles, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  Volume2,
  Shield
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { classifyFragment } from '../services/geminiService.ts';
import { resolveCanonicalVictimIdentity, saveVictimWebCapture } from '../services/canonicalCaseClient';
import { SuccessFeedback } from './SuccessFeedback';

export const CaptureVoice = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [classification, setClassification] = useState<any>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [locationData, setLocationData] = useState<{lat: number, lng: number} | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (isRecording) {
      // Get location when recording starts
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => setLocationData({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => console.warn("Location access denied", err)
        );
      }

      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      // Initialize Speech Recognition
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);
        };

        recognitionRef.current.start();
      }
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isRecording]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      // handleFinish will be called via useEffect or manually
      setTimeout(() => handleFinish(), 500);
    } else {
      setIsRecording(true);
      setDuration(0);
      setTranscript('');
    }
  };

  const handleFinish = async () => {
    if (duration < 1 && !transcript) {
      return;
    }

    setIsAnalyzing(true);
    
    try {
      const finalTranscript = transcript || "No audio captured";
      const result = await classifyFragment(finalTranscript);

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
        incidentSummary: finalTranscript,
        fragments: [
          `[VOICE] ${finalTranscript}`,
          `[VOICE_CLASSIFICATION] ${JSON.stringify(result)}`,
          `[VOICE_LOCATION] ${locationSummary}`,
        ],
        source: 'web-voice-capture',
      });

      setClassification(result);
      setIsAnalyzing(false);
      setShowSuccess(true);
    } catch (error) {
      console.error("Failed to process voice fragment", error);
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
        <h1 className="text-xl font-bold text-primary">Voice Capture</h1>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center px-8 gap-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold text-on-surface">Just speak.</h2>
          <p className="text-on-surface-variant max-w-xs mx-auto">
            Don't worry about order or logic. Just tell me what you remember.
          </p>
        </div>

        <div className="relative flex items-center justify-center">
          <AnimatePresence>
            {isRecording && (
              <>
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1.5, opacity: 0.1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute w-48 h-48 rounded-full bg-primary"
                />
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 2, opacity: 0.05 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 2, delay: 0.5 }}
                  className="absolute w-48 h-48 rounded-full bg-primary"
                />
              </>
            )}
          </AnimatePresence>

          <button 
            onClick={handleToggleRecording}
            disabled={isAnalyzing}
            className={`relative z-10 w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl ${
              isRecording ? 'bg-error text-white scale-110' : 'bg-primary text-white'
            } ${isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isRecording ? <Square size={40} fill="currentColor" /> : <Mic size={48} fill="currentColor" />}
          </button>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="text-4xl font-mono font-bold text-primary tabular-nums">
            {formatDuration(duration)}
          </div>
          {isRecording && (
            <div className="flex items-center gap-2 text-error font-bold animate-pulse">
              <div className="w-2 h-2 rounded-full bg-error"></div>
              Recording...
            </div>
          )}
        </div>

        <AnimatePresence>
          {isAnalyzing && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-8 rounded-2xl border border-primary/10 flex flex-col items-center gap-4 max-w-sm w-full"
            >
              <Loader2 className="animate-spin text-primary" size={32} />
              <div className="text-center">
                <h3 className="font-bold text-lg mb-1">Reconstructing Fragment</h3>
                <p className="text-sm text-on-surface-variant italic">"Extracting time, location, and sensory clues..."</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {transcript && !isAnalyzing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-md bg-surface-container-low p-6 rounded-xl italic text-on-surface-variant leading-relaxed"
          >
            "{transcript}"
          </motion.div>
        )}
      </main>

      <footer className="p-12 flex justify-center">
        <div className="flex items-center gap-3 text-on-surface-variant/60">
          <Shield size={16} />
          <span className="text-xs font-bold uppercase tracking-widest">End-to-End Encrypted</span>
        </div>
      </footer>
    </div>
  );
};
