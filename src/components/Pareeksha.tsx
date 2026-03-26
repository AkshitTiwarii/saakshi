import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Mic, 
  Gavel, 
  CheckCircle, 
  AlertCircle, 
  Lightbulb,
  RotateCcw,
  Save,
  Verified,
  Loader2,
  Play
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { generateCrossExamination } from '../services/geminiService.ts';

export const Pareeksha = () => {
  const navigate = useNavigate();
  const [fragments, setFragments] = useState<any[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'fragments'), where('uid', '==', auth.currentUser.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      setFragments(snapshot.docs.map(d => d.data()));
    });
    return () => unsub();
  }, []);

  const startSession = async () => {
    setIsLoading(true);
    try {
      const result = await generateCrossExamination(fragments);
      setCurrentQuestion(result);
    } catch (error) {
      console.error("Failed to generate question", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleMic = () => {
    if (isRecording) {
      setIsRecording(false);
      if (recognitionRef.current) recognitionRef.current.stop();
    } else {
      setIsRecording(true);
      setTranscript('');
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);
        };
        recognitionRef.current.start();
      }
    }
  };

  return (
    <div className="min-h-screen bg-surface pb-32">
      <header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md shadow-sm flex items-center justify-between px-6 h-16">
        <div className="flex items-center gap-3">
          <Gavel className="text-primary" size={24} />
          <span className="text-2xl font-black text-primary italic tracking-tight">SAAKSHI</span>
        </div>
        <button className="bg-error text-on-error px-6 py-2 rounded-full font-bold active:scale-95 duration-200">SOS</button>
      </header>

      <main className="pt-24 px-4 md:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-6">
            <div className="flex justify-between items-end mb-4">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-primary">Pareeksha</h1>
                <p className="text-on-surface-variant font-medium">Module 4: Cross-Examination Resilience</p>
              </div>
              <div className="flex gap-2">
                {!currentQuestion && (
                  <button 
                    onClick={startSession}
                    disabled={isLoading}
                    className="bg-primary text-on-primary px-6 py-2 rounded-full font-bold flex items-center gap-2 shadow-lg hover:opacity-90 transition-all"
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Play size={20} />}
                    Start Simulation
                  </button>
                )}
                <span className="px-4 py-1.5 bg-secondary-container/20 text-secondary font-bold rounded-full text-sm flex items-center gap-2">
                  <Shield size={16} fill="currentColor" />
                  Safe Space
                </span>
              </div>
            </div>

            <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-surface-container shadow-2xl group">
              <img 
                className="w-full h-full object-cover opacity-80 mix-blend-multiply" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuD43dg1ZrErfUEYz9720jlLOBIVdW5t-6xVZQMm9_B06tikkzbRLfGtcgdTfaOOscgKFwpbPDa0DNv9Kqe9x4kDQDUDRiE8shOs9bRDgtyZmRsiPekrgdZJ5iE6jJ-KAkSu3Nxurw-QorMePD0-u4KyYAh-giEXnfiXb1VerDSS0mVTsKUsjqtejmOP9eAyQkg49F1e9Zh9_26JV3FP0vq5FyX4V1PFe1sEXeS0-EhU-Pz9bXnWGORM0uqnybrD5BbLPfnKO24cyS_G" 
                alt="Courtroom"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-64 h-64 md:w-80 md:h-80">
                  <div className="absolute inset-0 rounded-full border-4 border-white/30 p-2 glass-card">
                    <img 
                      className="w-full h-full rounded-full object-cover" 
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuCs-wwD9FKkK-GwWU7KhFkvDaUoXZ45ggWnvuuIswyG9jVIAMJXvBXQil4IMup1sltQ_GoLpQ2AIKHafVWnbPMmO72N67tk9k8DSucFeD-nCYubd86VGCJNmWc-wapb-Ilro2_0j8vH_i-N0WsYHF9AqiOHuxT18jaw0b-wVG5Ltwq_UDfuHCBunNXumzcH9DkyO0qHTJJgNMMNBKXsCb_tYmFYvWF7rN_naSA_8opeJCDWJuP3DKQC4PW8Y7hNi6inz6Q_rz7B7ACY" 
                      alt="Defense Lawyer"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-white px-4 py-1 rounded-full shadow-md flex items-center gap-2 border border-outline-variant/30">
                    <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
                    <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Defense Counsel Speaking</span>
                  </div>
                </div>
              </div>
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[90%] glass-card rounded-xl p-6 border border-white/40 shadow-xl">
                <p className="text-on-surface text-lg md:text-xl font-medium italic leading-relaxed text-center">
                  {currentQuestion ? `"${currentQuestion.question}"` : "Click 'Start Simulation' to begin your practice session."}
                </p>
              </div>
            </div>

            <div className="bg-surface-container-low rounded-lg p-6 flex flex-col items-center gap-6">
              <div className="flex items-center gap-8 w-full justify-center">
                <div className="flex flex-col items-center gap-2">
                  <button 
                    onClick={handleToggleMic}
                    className={`w-20 h-20 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-90 transition-transform ${isRecording ? 'bg-error text-white' : 'bg-primary text-white'}`}
                  >
                    <Mic size={40} fill="currentColor" />
                  </button>
                  <span className="text-xs font-bold text-primary uppercase tracking-tighter">{isRecording ? 'Recording...' : 'Press to Speak'}</span>
                </div>
                <div className="flex-1 max-w-md h-12 flex items-center justify-center gap-1">
                  <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div className={`h-full bg-primary rounded-full opacity-60 transition-all ${isRecording ? 'w-full animate-pulse' : 'w-0'}`}></div>
                  </div>
                </div>
              </div>
              <div className="w-full bg-white rounded-xl p-4 border border-outline-variant/10 italic text-on-surface-variant/80 min-h-[80px]">
                {transcript ? `Transcription: "${transcript}"` : "Your response will appear here..."}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="bg-tertiary-container/30 rounded-lg p-6 shadow-sm border border-tertiary-container/30 relative overflow-hidden">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="text-tertiary" size={24} />
                <h3 className="font-bold text-on-tertiary-container text-lg">AI Coaching: RAKSHA Shield</h3>
              </div>
              <div className="space-y-4">
                <p className="text-on-tertiary-container text-sm font-medium leading-relaxed">
                  {currentQuestion ? `The defense is using a ${currentQuestion.threatType || 'Common Myth'} to discredit you.` : "Start the session to receive real-time coaching."}
                </p>
                <div className="bg-white/40 p-4 rounded-xl border border-white/20">
                  <h4 className="text-xs font-bold uppercase text-tertiary mb-2">Recommended Strategy</h4>
                  <p className="text-on-tertiary-container text-sm">
                    {currentQuestion ? currentQuestion.coaching : "I will analyze the defense's tactics and provide you with counter-strategies."}
                  </p>
                </div>
                <button 
                  onClick={startSession}
                  disabled={isLoading}
                  className="w-full py-3 bg-tertiary text-on-tertiary rounded-full font-bold text-sm shadow-md hover:opacity-90 transition-opacity"
                >
                  Next Question
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm space-y-8">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-bold text-on-surface-variant">Confidence Meter</span>
                  <span className="text-sm font-black text-primary">78%</span>
                </div>
                <div className="h-3 w-full bg-surface-container-high rounded-full overflow-hidden">
                  <div className="h-full bg-primary w-[78%] rounded-full"></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-bold text-on-surface-variant">Contextual Strength</span>
                  <span className="text-sm font-black text-secondary">Strong</span>
                </div>
                <div className="flex gap-1.5 h-3">
                  <div className="flex-1 bg-secondary rounded-full"></div>
                  <div className="flex-1 bg-secondary rounded-full"></div>
                  <div className="flex-1 bg-secondary rounded-full"></div>
                  <div className="flex-1 bg-surface-container-high rounded-full"></div>
                  <div className="flex-1 bg-surface-container-high rounded-full"></div>
                </div>
              </div>

              <div className="pt-4 border-t border-outline-variant/10">
                <h4 className="text-xs font-bold text-on-surface-variant uppercase mb-4">Tactical Awareness</h4>
                <ul className="space-y-4">
                  <li className="flex gap-3 items-start">
                    <CheckCircle className="text-primary" size={18} />
                    <p className="text-xs text-on-surface-variant leading-normal">Your voice pitch is steady. Maintain this tempo to project authority.</p>
                  </li>
                  <li className="flex gap-3 items-start">
                    <AlertCircle className="text-secondary" size={18} />
                    <p className="text-xs text-on-surface-variant leading-normal">Watch for "I think" or "Maybe". Use declarative statements like "I did not."</p>
                  </li>
                </ul>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button className="flex flex-col items-center justify-center p-4 bg-surface-container-low rounded-2xl border border-outline-variant/20 hover:bg-surface-container-high transition-colors">
                <RotateCcw size={20} className="text-on-surface-variant mb-1" />
                <span className="text-[10px] font-bold uppercase text-on-surface-variant">Restart Session</span>
              </button>
              <button className="flex flex-col items-center justify-center p-4 bg-surface-container-low rounded-2xl border border-outline-variant/20 hover:bg-surface-container-high transition-colors">
                <Save size={20} className="text-on-surface-variant mb-1" />
                <span className="text-[10px] font-bold uppercase text-on-surface-variant">Save Progress</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      <div className="fixed bottom-8 right-8 z-40">
        <div className="bg-tertiary-container text-on-tertiary-container px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 max-w-xs border border-white/30 backdrop-blur-md">
          <div className="w-10 h-10 rounded-full bg-white/40 flex items-center justify-center flex-shrink-0">
            <Lightbulb size={24} className="text-tertiary" />
          </div>
          <p className="text-sm font-semibold leading-tight">Take a deep breath. You are in control of your narrative.</p>
        </div>
      </div>
    </div>
  );
};
