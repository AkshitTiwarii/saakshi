import React, { useState, useEffect } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  useNavigate, 
  useLocation 
} from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Mic, 
  Keyboard, 
  Edit, 
  ArrowLeft, 
  ChevronRight, 
  Camera, 
  History, 
  Gavel, 
  CheckCircle, 
  AlertTriangle, 
  Home, 
  FileText, 
  Settings, 
  Search,
  CloudRain,
  Car,
  MapPin,
  Verified,
  Sparkles,
  RefreshCw,
  Upload,
  LogOut,
  Clock,
  Info,
  PenTool
} from 'lucide-react';
import { 
  auth, 
  db 
} from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  Timestamp, 
  doc, 
  setDoc, 
  getDoc 
} from 'firebase/firestore';
import { EMOTIONS, CAPTURE_METHODS } from './constants';
import { Fragment, Evidence, Case, UserProfile } from './types';
import { classifyFragment, generateAdversarialAnalysis } from './services/geminiService';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { KhojakSeeker } from './components/KhojakSeeker';
import { Pareeksha } from './components/Pareeksha';
import { CaptureVoice } from './components/CaptureVoice';
import { CaptureDraw } from './components/CaptureDraw';
import { CaptureUpload } from './components/CaptureUpload';
import { DocsScreen } from './components/DocsScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { SuccessFeedback } from './components/SuccessFeedback';

// --- Components ---

const Layout = ({ children, showNav = true }: { children: React.ReactNode, showNav?: boolean }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { id: 'home', label: 'Home', icon: Home, path: '/dashboard' },
    { id: 'khojak', label: 'Khojak', icon: Search, path: '/khojak' },
    { id: 'war-room', label: 'War Room', icon: Shield, path: '/war-room' },
    { id: 'virodhi', label: 'Virodhi', icon: AlertTriangle, path: '/war-room#virodhi' },
    { id: 'practice', label: 'Practice', icon: Gavel, path: '/practice' },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-surface overflow-x-hidden">
      <main className="flex-grow pb-24">
        {children}
      </main>
      
      {showNav && (
        <nav className="fixed bottom-0 left-0 w-full flex justify-around items-center px-4 pb-8 pt-4 bg-white/80 backdrop-blur-2xl rounded-t-[40px] z-50 shadow-[0_-8px_32px_rgba(45,51,59,0.06)]">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center justify-center w-14 h-14 transition-all duration-300 ${
                  isActive ? 'bg-primary/10 text-primary rounded-full' : 'text-on-surface-variant/60'
                }`}
              >
                <Icon size={24} fill={isActive ? 'currentColor' : 'none'} />
                <span className="text-[10px] font-bold uppercase mt-1">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
};

// --- Screens ---

const SplashScreen = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 ethereal-gradient relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-secondary-container/20 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary-container/30 blur-[100px] pointer-events-none"></div>
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-12"
      >
        <div className="relative w-32 h-32 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-primary/10 scale-150 opacity-40"></div>
          <div className="bg-white w-24 h-24 rounded-full flex items-center justify-center shadow-2xl">
            <Shield size={48} className="text-primary" fill="currentColor" />
          </div>
          <div className="absolute -bottom-16">
            <span className="text-3xl font-extrabold tracking-tighter text-primary uppercase">SAAKSHI</span>
          </div>
        </div>
        
        <div className="mt-20">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-on-surface opacity-90">
            You’re safe here.
          </h1>
        </div>
      </motion.div>
      
      <div className="absolute bottom-12 w-full px-10 max-w-lg">
        <button 
          onClick={() => navigate('/onboarding')}
          className="w-full bg-primary text-on-primary py-6 rounded-full text-xl font-bold tracking-wide shadow-lg hover:opacity-90 active:scale-95 transition-all"
        >
          Start
        </button>
      </div>
    </div>
  );
};

const OnboardingScreen = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Check if user exists in Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: 'user',
          createdAt: Timestamp.now()
        });
      }
      navigate('/feeling-checkin');
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 md:px-24 ethereal-gradient">
      <div className="w-full max-w-4xl text-center flex flex-col items-center gap-12">
        <div className="relative mb-8">
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden border-2 border-white shadow-sm ring-8 ring-primary/5">
            <img 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDONknP1oGFnaOvDLLVyB8FBM4d_LUOnZJGBTV2O-TuoclbBfXWYR_aZCT6463dLxDTRZq3rdjNF4iG4NQOSSLtC7_34XW2P9X7aGD72oohzpHV6Mgp20REQDaEh-u6Q-YVxSbHEIV5IoevDPSN4YRqSkMN4cosgqC0W8tE48n7utq-yh6yXEIhBXzAmosesstXhvnz2DEydy_sc66J6wwBPSCeztbKTMOawbgi-WuYRoo8uCG2rm3QHzcIJ9zC26lkVYAbbMgb_--m" 
              alt="Saakshi"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md text-primary">
            <Sparkles size={16} />
          </div>
        </div>
        
        <div className="space-y-6">
          <h1 className="text-[2.5rem] md:text-[3.5rem] leading-[1.1] font-bold tracking-tight text-on-surface">
            I’m Saakshi. <br className="hidden md:block"/>
            I’ll help you record what <br className="hidden md:block"/>
            you <span className="text-primary italic font-medium">remember.</span>
          </h1>
          <p className="text-on-surface-variant text-lg md:text-xl font-light max-w-xl mx-auto leading-relaxed">
            Think of me as a safe harbor for your stories. No rush, just the truth of your experience.
          </p>
        </div>
        
        <div className="mt-8">
          <button 
            onClick={handleLogin}
            className="bg-primary text-on-primary px-12 py-5 rounded-full text-lg font-semibold tracking-wide hover:opacity-90 transition-all active:scale-95 shadow-lg"
          >
            {user ? 'Continue' : 'Connect with Google'}
          </button>
        </div>
      </div>
    </div>
  );
};

const FeelingCheckIn = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 pt-24 pb-12 max-w-lg mx-auto w-full relative">
      <div className="text-center mb-16 space-y-4">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-on-surface">
          How are you feeling right now?
        </h1>
        <p className="text-on-surface-variant text-lg">
          Your feelings are valid. Take a moment to name what's present.
        </p>
      </div>
      
      <div className="w-full space-y-6">
        {EMOTIONS.map((emotion) => (
          <button 
            key={emotion.id}
            onClick={() => navigate('/capture-method')}
            className="w-full group flex items-center p-6 glass-card rounded-lg transition-all hover:translate-y-[-2px] active:scale-[0.98]"
          >
            <div className="w-14 h-14 rounded-full bg-surface-container-high flex items-center justify-center text-3xl mr-6">
              {emotion.emoji}
            </div>
            <div className="text-left flex-grow">
              <span className="block text-2xl font-bold text-on-surface leading-tight capitalize">{emotion.label}</span>
            </div>
            <ChevronRight className="text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>
      
      <div className="mt-16 text-center">
        <p className="text-on-surface-variant/60 text-sm font-medium tracking-wide uppercase">
          Safe Space Environment
        </p>
      </div>
    </div>
  );
};

const CaptureMethod = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 pt-24 pb-12 max-w-2xl mx-auto w-full relative">
      <div className="mb-16 space-y-4 w-full">
        <h1 className="text-on-surface text-[2.75rem] md:text-[3.5rem] font-extrabold leading-tight tracking-tight">
          You don’t have to <br/>
          <span className="text-primary italic">explain everything.</span>
        </h1>
        <p className="text-on-surface-variant text-lg md:text-xl font-medium max-w-md">
          How would you like to start?
        </p>
      </div>
      
      <div className="grid grid-cols-1 gap-6 w-full">
        {CAPTURE_METHODS.map((method) => {
          const Icon = method.id === 'speak' ? Mic : 
                      method.id === 'write' ? Keyboard : 
                      method.id === 'draw' ? Edit : Upload;
          return (
            <button 
              key={method.id}
              onClick={() => navigate(`/capture/${method.id}`)}
              className="group flex items-center justify-between p-8 bg-white rounded-lg shadow-sm border border-white/20 transition-all hover:translate-y-[-4px] active:scale-[0.98]"
            >
              <div className="flex items-center gap-6">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 ${
                  method.id === 'speak' ? 'bg-primary/10 text-primary' : 
                  method.id === 'write' ? 'bg-secondary/10 text-secondary' : 
                  method.id === 'draw' ? 'bg-tertiary/10 text-tertiary' :
                  'bg-primary/10 text-primary'
                }`}>
                  <Icon size={32} />
                </div>
                <div className="text-left">
                  <span className="block text-xl font-bold text-on-surface">{method.label}</span>
                  <span className="block text-sm text-on-surface-variant/70 font-medium">{method.sublabel}</span>
                </div>
              </div>
              <ChevronRight className="text-outline-variant opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

const CaptureText = () => {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
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

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const result = await classifyFragment(text);
      await addDoc(collection(db, 'fragments'), {
        uid: auth.currentUser?.uid,
        type: 'text',
        content: text,
        emotion: result.emotion,
        timestamp: Timestamp.now(),
        classification: {
          time: result.time,
          location: result.location,
          sensory: result.sensory
        },
        geoTag: locationData
      });
      setClassification(result);
      setLoading(false);
      setShowSuccess(true);
    } catch (error) {
      console.error("Failed to save fragment", error);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col p-8 pt-24 max-w-2xl mx-auto w-full">
      <AnimatePresence>
        {showSuccess && (
          <SuccessFeedback 
            classification={classification} 
            onClose={() => navigate('/war-room')} 
          />
        )}
      </AnimatePresence>
      <button onClick={() => navigate(-1)} className="mb-8 w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm">
        <ArrowLeft size={20} className="text-primary" />
      </button>
      
      <h1 className="text-3xl font-bold mb-8">Drop your fragments...</h1>
      
      <textarea 
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="It was after Diwali... there was loud music..."
        className="flex-grow p-8 bg-white rounded-3xl border-none shadow-inner text-xl resize-none focus:ring-2 focus:ring-primary/20"
      />
      
      <div className="mt-8">
        <button 
          onClick={handleSubmit}
          disabled={loading || !text.trim()}
          className="w-full bg-primary text-on-primary py-6 rounded-full text-xl font-bold shadow-lg disabled:opacity-50 transition-all"
        >
          {loading ? 'Processing...' : 'Secure Fragment'}
        </button>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [caseData, setCaseData] = useState<Case | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const qF = query(collection(db, 'fragments'), where('uid', '==', auth.currentUser.uid));
    const unsubF = onSnapshot(qF, (snapshot) => {
      setFragments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Fragment)));
    });
    const qC = query(collection(db, 'cases'), where('uid', '==', auth.currentUser.uid));
    const unsubC = onSnapshot(qC, (snapshot) => {
      if (!snapshot.empty) setCaseData({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Case);
    });
    return () => { unsubF(); unsubC(); };
  }, []);

  const features = [
    { id: 'capture', title: 'Capture', desc: 'Record new fragments', icon: Mic, path: '/capture-method', color: 'bg-primary' },
    { id: 'khojak', title: 'Khojak', desc: 'Find digital evidence', icon: Search, path: '/khojak', color: 'bg-secondary' },
    { id: 'war-room', title: 'War Room', desc: 'Analyze case strength', icon: Shield, path: '/war-room', color: 'bg-error' },
    { id: 'virodhi', title: 'Virodhi', desc: 'Simulate legal attacks', icon: AlertTriangle, path: '/war-room#virodhi', color: 'bg-error-dim' },
    { id: 'practice', title: 'Pareeksha', desc: 'Simulate cross-exam', icon: Gavel, path: '/practice', color: 'bg-tertiary' },
  ];

  return (
    <Layout>
      <div className="pt-24 px-6 max-w-4xl mx-auto space-y-12 pb-32">
        <header className="space-y-2">
          <h1 className="text-4xl font-black tracking-tight text-primary italic">SAAKSHI</h1>
          <p className="text-on-surface-variant text-lg">Welcome back. Your narrative is safe here.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((f) => (
            <button 
              key={f.id}
              onClick={() => navigate(f.path)}
              className="group relative overflow-hidden p-8 rounded-3xl bg-white shadow-sm border border-outline-variant/10 text-left transition-all hover:shadow-xl hover:-translate-y-1"
            >
              <div className={`w-14 h-14 rounded-2xl ${f.color} flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform`}>
                <f.icon size={28} />
              </div>
              <h3 className="text-2xl font-bold mb-2">{f.title}</h3>
              <p className="text-on-surface-variant">{f.desc}</p>
              <ChevronRight className="absolute bottom-8 right-8 text-primary opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-2" />
            </button>
          ))}
        </div>

        <section className="bg-surface-container-low p-8 rounded-3xl border border-outline-variant/10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Recent Activity</h2>
            <span className="text-xs font-bold text-primary uppercase tracking-widest">{fragments.length} Fragments</span>
          </div>
          <div className="space-y-4">
            {fragments.slice(0, 3).map((f) => (
              <div key={f.id} className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-xs">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  {f.type === 'voice' ? <Mic size={18} /> : f.type === 'drawing' ? <PenTool size={18} /> : <FileText size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">{f.content.substring(0, 40)}...</p>
                  <p className="text-[10px] text-on-surface-variant uppercase font-bold">{new Date(f.timestamp.seconds * 1000).toLocaleDateString()}</p>
                </div>
                <ChevronRight size={16} className="text-on-surface-variant/40" />
              </div>
            ))}
            {fragments.length === 0 && (
              <p className="text-center py-8 text-on-surface-variant italic">No fragments recorded yet.</p>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
};

const WarRoom = () => {
  const navigate = useNavigate();
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    const qFragments = query(collection(db, 'fragments'), where('uid', '==', auth.currentUser.uid));
    const unsubFragments = onSnapshot(qFragments, (snapshot) => {
      setFragments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Fragment)));
    });

    const qEvidence = query(collection(db, 'evidence'), where('uid', '==', auth.currentUser.uid));
    const unsubEvidence = onSnapshot(qEvidence, (snapshot) => {
      setEvidence(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Evidence)));
    });

    const qCase = query(collection(db, 'cases'), where('uid', '==', auth.currentUser.uid));
    const unsubCase = onSnapshot(qCase, (snapshot) => {
      if (!snapshot.empty) {
        setCaseData({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Case);
      }
    });

    return () => {
      unsubFragments();
      unsubEvidence();
      unsubCase();
    };
  }, []);

  const handleRecalculate = async () => {
    if (fragments.length === 0) return;
    setIsAnalyzing(true);
    try {
      const analysis = await generateAdversarialAnalysis(fragments, evidence);
      
      const caseRef = caseData?.id 
        ? doc(db, 'cases', caseData.id) 
        : doc(collection(db, 'cases'));
        
      await setDoc(caseRef, {
        uid: auth.currentUser?.uid,
        adversarialAnalysis: {
          virodhi: analysis.virodhi,
          raksha: analysis.raksha
        },
        strengthScore: analysis.strengthScore,
        updatedAt: Timestamp.now()
      }, { merge: true });
      
    } catch (error) {
      console.error("Analysis failed", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const strengthScore = caseData?.strengthScore || 72; // Mock score if empty

  const mockEvidence = [
    { id: '1', source: 'Weather', status: 'VERIFIED', details: 'Rainfall confirmed on Nov 1st via IMD.' },
    { id: '2', source: 'Transit', status: 'FOUND', details: 'Ola ride #4521 matched your timeline.' }
  ];

  const mockVirodhi = [
    { title: 'Timeline Discrepancy', threatLevel: 'HIGH', description: 'Defense may argue the 8 PM timing is inconsistent with traffic data.', predictableDefense: 'Cross-reference with Google Maps timeline.' }
  ];

  const mockRaksha = [
    { type: 'LEGAL SHIELD', title: 'Sensory Consistency', description: 'Your mention of "loud music" matches local event permits for that night.' }
  ];

  const displayEvidence = evidence.length > 0 ? evidence : mockEvidence;
  const displayVirodhi = caseData?.adversarialAnalysis?.virodhi || mockVirodhi;
  const displayRaksha = caseData?.adversarialAnalysis?.raksha || mockRaksha;

  return (
    <Layout>
      <header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl flex items-center justify-between px-6 h-16 shadow-sm">
        <div className="flex items-center gap-2">
          <Shield className="text-primary" fill="currentColor" size={20} />
          <h1 className="text-lg font-bold text-primary">War Room</h1>
        </div>
        <button className="bg-error text-on-error px-4 py-1.5 rounded-full text-sm font-bold">SOS</button>
      </header>

      <div className="pt-20 px-6 max-w-2xl mx-auto space-y-10">
        {/* KAAL CHAKRA */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">KAAL CHAKRA <span className="text-on-surface-variant font-medium text-sm ml-2">Timeline Risks</span></h2>
            <History size={20} className="text-tertiary" />
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
            <div className="flex-shrink-0 bg-error/5 p-5 rounded-2xl border border-error/10 flex items-center gap-4 min-w-[240px]">
              <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center shrink-0">
                <Camera size={24} className="text-error" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-error">CCTV Expiry</p>
                  <div className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></div>
                </div>
                <p className="text-xl font-extrabold">4 Days Left</p>
                <p className="text-[10px] text-on-surface-variant font-medium">Local shop CCTV overwrites soon.</p>
              </div>
            </div>
            
            <div className="flex-shrink-0 bg-tertiary/5 p-5 rounded-2xl border border-tertiary/10 flex items-center gap-4 min-w-[240px]">
              <div className="w-12 h-12 rounded-full bg-tertiary/10 flex items-center justify-center shrink-0">
                <Car size={24} className="text-tertiary" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-tertiary">Transit Logs</p>
                <p className="text-xl font-extrabold">48 Hours</p>
                <p className="text-[10px] text-on-surface-variant font-medium">Ola/Uber logs window closing.</p>
              </div>
            </div>

            <div className="flex-shrink-0 bg-surface-container-low p-5 rounded-2xl border border-outline-variant/10 flex items-center gap-4 min-w-[240px]">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <CloudRain size={24} className="text-primary" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Weather Data</p>
                <p className="text-xl font-extrabold">Permanent</p>
                <p className="text-[10px] text-on-surface-variant font-medium">IMD records are archived.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Strength Score */}
        <section className="flex flex-col items-center justify-center py-8">
          <div className="relative w-64 h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { value: strengthScore },
                    { value: 100 - strengthScore }
                  ]}
                  innerRadius={80}
                  outerRadius={100}
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                >
                  <Cell fill="url(#grad)" stroke="none" />
                  <Cell fill="var(--color-surface-container-high)" stroke="none" />
                </Pie>
                <defs>
                  <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="var(--color-primary)" />
                    <stop offset="100%" stopColor="var(--color-primary-container)" />
                  </linearGradient>
                </defs>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute text-center">
              <span className="text-5xl font-extrabold tracking-tighter">{strengthScore}%</span>
              <p className="text-sm font-medium text-on-surface-variant">Strength Score</p>
            </div>
          </div>
          <div className="mt-6 flex flex-col items-center gap-4">
            <div className="bg-primary/10 text-primary px-6 py-2 rounded-full border border-primary/20">
              <span className="text-sm font-bold tracking-widest uppercase">Ironclad Status</span>
            </div>
            <button 
              onClick={handleRecalculate}
              disabled={isAnalyzing || fragments.length === 0}
              className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-widest hover:opacity-80 disabled:opacity-50"
            >
              <RefreshCw size={14} className={isAnalyzing ? 'animate-spin' : ''} />
              {isAnalyzing ? 'Analyzing...' : 'Recalculate Strength'}
            </button>
          </div>
        </section>

        {/* Tactical Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* FRAGMENTS */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">FRAGMENTS <span className="text-on-surface-variant font-medium text-sm ml-2">Your Memories</span></h2>
              <button onClick={() => navigate('/capture-method')} className="text-primary text-xs font-bold uppercase tracking-widest hover:underline">Add New</button>
            </div>
            <div className="space-y-3">
              {fragments.map((f) => (
                <div key={f.id} className="bg-white p-4 rounded-2xl shadow-sm border border-outline-variant/10 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        {f.type === 'voice' ? <Mic size={14} /> : f.type === 'drawing' ? <PenTool size={14} /> : <FileText size={14} />}
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        {new Date(f.timestamp.seconds * 1000).toLocaleDateString()}
                      </span>
                    </div>
                    {f.geoTag && (
                      <div className="flex items-center gap-1 text-secondary">
                        <MapPin size={12} />
                        <span className="text-[10px] font-bold uppercase">Tagged</span>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-on-surface leading-relaxed line-clamp-2 italic">"{f.content}"</p>
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-outline-variant/5">
                    {f.classification?.time && (
                      <div className="flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded-full">
                        <Clock size={10} className="text-primary" />
                        <span className="text-[9px] font-bold text-on-surface-variant">{f.classification.time}</span>
                        <div className="group relative">
                          <Info size={10} className="text-on-surface-variant/40 cursor-help" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-black text-white text-[8px] p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            AI extracted time clue
                          </div>
                        </div>
                      </div>
                    )}
                    {f.classification?.location && (
                      <div className="flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded-full">
                        <MapPin size={10} className="text-secondary" />
                        <span className="text-[9px] font-bold text-on-surface-variant">{f.classification.location}</span>
                        <div className="group relative">
                          <Info size={10} className="text-on-surface-variant/40 cursor-help" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-black text-white text-[8px] p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            AI extracted location clue
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {fragments.length === 0 && (
                <div className="text-center py-12 bg-surface-container-low rounded-2xl border border-dashed border-outline-variant/30">
                  <p className="text-sm text-on-surface-variant italic">No fragments recorded yet.</p>
                </div>
              )}
            </div>
          </section>

          {/* KHOJAK */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">KHOJAK <span className="text-on-surface-variant font-medium text-sm ml-2">Evidence</span></h2>
              <button onClick={() => navigate('/khojak')} className="text-primary text-xs font-bold uppercase tracking-widest hover:underline">View Details</button>
            </div>
            <div className="space-y-3">
              {displayEvidence.map((item) => (
                <div key={item.id} className="bg-white p-4 rounded-lg shadow-sm border border-white/20">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold">{item.source} Data</h3>
                    <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">{item.status}</span>
                  </div>
                  <p className="text-sm text-on-surface-variant">{item.details}</p>
                </div>
              ))}
            </div>
          </section>

          {/* VIRODHI */}
          <section id="virodhi" className="space-y-4 scroll-mt-24">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">VIRODHI <span className="text-on-surface-variant font-medium text-sm ml-2">Attack</span></h2>
              <AlertTriangle size={20} className="text-error" />
            </div>
            {displayVirodhi.map((attack, i) => (
              <div key={i} className="bg-error/5 border border-error/10 p-5 rounded-lg space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-error text-white text-[10px] font-bold px-2 py-1 rounded">{attack.threatLevel} THREAT</div>
                  <span className="text-sm font-bold text-error">{attack.title}</span>
                </div>
                <p className="text-sm text-on-surface-variant italic">"{attack.description}"</p>
                <div className="pt-2 border-t border-error/10">
                  <p className="text-[10px] font-bold uppercase text-error-dim mb-1">Predictable Defense</p>
                  <p className="text-xs text-on-surface">{attack.predictableDefense}</p>
                </div>
              </div>
            ))}
          </section>
        </div>

        {/* Map Visualization */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">SENSORY MAP <span className="text-on-surface-variant font-medium text-sm ml-2">Spatial Context</span></h2>
            <MapPin size={20} className="text-secondary" />
          </div>
          <div className="relative aspect-video w-full rounded-3xl overflow-hidden bg-surface-container-high border border-outline-variant/10 shadow-inner group">
            {/* Simple SVG Map Placeholder */}
            <svg viewBox="0 0 800 450" className="w-full h-full opacity-40">
              <path d="M100,100 Q400,50 700,100 T700,350 Q400,400 100,350 Z" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-primary/30" />
              <circle cx="200" cy="150" r="100" fill="currentColor" className="text-primary/5" />
              <circle cx="500" cy="300" r="150" fill="currentColor" className="text-secondary/5" />
            </svg>
            
            <div className="absolute inset-0 p-6 pointer-events-none">
              {fragments.filter(f => f.geoTag).map((f, i) => (
                <motion.div 
                  key={f.id}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="absolute pointer-events-auto"
                  style={{ 
                    left: `${(f.geoTag!.lng % 1) * 1000 % 80 + 10}%`, 
                    top: `${(f.geoTag!.lat % 1) * 1000 % 80 + 10}%` 
                  }}
                >
                  <div className="relative group/pin">
                    <MapPin size={24} className="text-primary drop-shadow-md" fill="currentColor" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-white p-2 rounded-lg shadow-xl border border-outline-variant/10 opacity-0 group-hover/pin:opacity-100 transition-opacity pointer-events-none z-10">
                      <p className="text-[10px] font-bold truncate">{f.content}</p>
                      <p className="text-[8px] text-on-surface-variant uppercase font-bold">{f.classification?.location || 'Unknown'}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="absolute bottom-4 right-4 bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/40 shadow-sm">
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest">
                {fragments.filter(f => f.geoTag).length} Locations Tagged
              </p>
            </div>
          </div>
        </section>

        {/* RAKSHA */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">RAKSHA <span className="text-on-surface-variant font-medium text-sm ml-2">The Shield</span></h2>
            <Gavel size={20} className="text-secondary" />
          </div>
          {displayRaksha.map((shield, i) => (
            <div key={i} className="bg-gradient-to-br from-primary to-primary-container p-[1px] rounded-lg">
              <div className="bg-white p-6 rounded-[calc(1rem-1px)] flex items-center gap-6">
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">{shield.type}</p>
                  <h3 className="text-xl font-extrabold mb-2">{shield.title}</h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed">{shield.description}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Verified size={24} className="text-primary" fill="currentColor" />
                </div>
              </div>
            </div>
          ))}
        </section>

        <div className="flex justify-center pt-8">
          <div className="glass-card px-6 py-3 rounded-full flex items-center gap-4">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
            <span className="text-xs font-bold">Sentinel active: Monitoring all legal threads</span>
          </div>
        </div>
      </div>
    </Layout>
  );
};

// --- Main App ---

export default function App() {
  return (
    <Router>
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<SplashScreen />} />
          <Route path="/onboarding" element={<OnboardingScreen />} />
          <Route path="/feeling-checkin" element={<FeelingCheckIn />} />
          <Route path="/capture-method" element={<CaptureMethod />} />
          <Route path="/capture/write" element={<CaptureText />} />
          <Route path="/capture/speak" element={<CaptureVoice />} />
          <Route path="/capture/draw" element={<CaptureDraw />} />
          <Route path="/capture/upload" element={<CaptureUpload />} />
          <Route path="/war-room" element={<WarRoom />} />
          <Route path="/khojak" element={<KhojakSeeker />} />
          <Route path="/practice" element={<Pareeksha />} />
          <Route path="/docs" element={<DocsScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<SplashScreen />} />
        </Routes>
      </AnimatePresence>
    </Router>
  );
}
