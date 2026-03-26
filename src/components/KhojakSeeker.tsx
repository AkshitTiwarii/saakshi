import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  CloudRain, 
  Car, 
  MapPin, 
  Database, 
  ReceiptText, 
  Search,
  ChevronRight,
  Mic,
  Sparkles,
  Loader2,
  CheckCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, Timestamp } from 'firebase/firestore';
import { searchEvidence } from '../services/geminiService';

export const KhojakSeeker = () => {
  const navigate = useNavigate();
  const [fragments, setFragments] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const qFragments = query(collection(db, 'fragments'), where('uid', '==', auth.currentUser.uid));
    const unsubFragments = onSnapshot(qFragments, (snapshot) => {
      setFragments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const qEvidence = query(collection(db, 'evidence'), where('uid', '==', auth.currentUser.uid));
    const unsubEvidence = onSnapshot(qEvidence, (snapshot) => {
      setEvidence(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubFragments();
      unsubEvidence();
    };
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResult(null);
    try {
      const result = await searchEvidence(searchQuery);
      setSearchResult(result);
      
      // Save to Firestore
      await addDoc(collection(db, 'evidence'), {
        uid: auth.currentUser?.uid,
        source: 'Khojak AI Search',
        details: result,
        status: 'FOUND',
        query: searchQuery,
        timestamp: Timestamp.now()
      });
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      setIsSearching(false);
    }
  };

  const defaultEvidence = [
    {
      id: 'mock-1',
      type: 'Weather',
      title: 'Weather Fragment',
      description: 'Confirming rainfall on Nov 1st',
      status: 'FOUND',
      icon: CloudRain,
      iconBg: 'bg-blue-100/50',
      iconColor: 'text-blue-600',
      footerIcon: Database,
      footerText: 'IMD Data Verified'
    },
    {
      id: 'mock-2',
      type: 'Transit',
      title: 'Transit Fragment',
      description: 'Tracking Ola Ride #4521',
      status: 'VERIFIED',
      icon: Car,
      iconBg: 'bg-indigo-100/50',
      iconColor: 'text-indigo-600',
      footerIcon: ReceiptText,
      footerText: 'Digital Receipt Match'
    }
  ];

  const displayEvidence = evidence.length > 0 ? evidence.map(e => ({
    id: e.id,
    type: e.source,
    title: `${e.source} Evidence`,
    description: e.details.substring(0, 100) + '...',
    status: e.status,
    icon: e.source.includes('Weather') ? CloudRain : e.source.includes('Transit') ? Car : Search,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    footerIcon: Database,
    footerText: 'AI Verified'
  })) : defaultEvidence;

  return (
    <div className="min-h-screen bg-surface pb-32">
      <header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl flex items-center justify-between px-6 h-16 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-primary hover:opacity-80 transition-opacity">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-lg font-semibold text-primary">Khojak Evidence Seeker</h1>
        </div>
        <div className="text-xl font-bold text-primary italic">Khojak</div>
      </header>

      <main className="pt-24 px-6 max-w-2xl mx-auto space-y-12">
        <section className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-container/30 text-primary font-medium text-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Active Search Initialized
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-on-surface">
            Gathering your <span className="text-primary">Timeline</span>
          </h2>
          
          <div className="mt-8 relative max-w-md mx-auto">
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for evidence (e.g. weather in Delhi on Oct 20)"
              className="w-full pl-12 pr-24 py-4 bg-white rounded-full shadow-sm border border-outline-variant/20 focus:ring-2 focus:ring-primary/20 outline-none"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60" size={20} />
            <button 
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-on-primary px-4 py-2 rounded-full text-sm font-bold disabled:opacity-50"
            >
              {isSearching ? <Loader2 className="animate-spin" size={16} /> : 'Search'}
            </button>
          </div>
        </section>

        <AnimatePresence>
          {searchResult && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-primary/5 border border-primary/10 p-6 rounded-2xl space-y-3"
            >
              <div className="flex items-center gap-2 text-primary font-bold">
                <CheckCircle size={20} />
                <span>Evidence Found</span>
              </div>
              <p className="text-on-surface-variant leading-relaxed">{searchResult}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {displayEvidence.map((item) => (
            <motion.div 
              key={item.id}
              whileHover={{ y: -4 }}
              className="group relative p-8 rounded-lg bg-surface-container-low transition-all duration-300 hover:bg-surface-container-lowest"
            >
              <div className="flex flex-col h-full space-y-6">
                <div className="flex justify-between items-start">
                  <div className={`p-3 rounded-full ${item.iconBg} ${item.iconColor}`}>
                    <item.icon size={32} />
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase ${
                    item.status === 'FOUND' ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {item.status}
                  </span>
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                  <p className="text-on-surface-variant font-medium">{item.description}</p>
                </div>
                <div className="mt-auto pt-4 flex items-center gap-2 text-sm font-semibold text-primary">
                  <item.footerIcon size={16} />
                  {item.footerText}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <section className="glass-card p-8 rounded-lg border border-outline-variant/15 flex gap-6 items-center">
          <div className="hidden sm:block">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles size={40} className="text-primary opacity-60" />
            </div>
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-lg text-primary-dim mb-1 italic">Khojak's Intuition</h4>
            <p className="text-on-surface-variant leading-relaxed">
              {fragments.length > 0 
                ? `Based on your fragment "${fragments[0].content.substring(0, 30)}...", I'm looking for corroborating data from that time.`
                : "I'm ready to cross-reference your fragments. Add more details to help me search better."}
            </p>
          </div>
        </section>
      </main>

      <button 
        onClick={() => navigate('/capture-method')}
        className="fixed bottom-32 right-8 flex items-center gap-3 px-8 py-5 rounded-full bg-primary text-on-primary shadow-xl hover:scale-105 active:scale-95 transition-all z-50 group"
      >
        <Mic size={24} className="group-hover:rotate-12 transition-transform" />
        <span className="font-semibold tracking-tight">I remember more...</span>
      </button>
    </div>
  );
};
