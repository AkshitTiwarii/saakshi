import React from 'react';
import { motion } from 'motion/react';
import { 
  FileText, 
  Download, 
  Share2, 
  History, 
  ChevronRight, 
  AlertCircle,
  ShieldCheck,
  Scale
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const DocsScreen = () => {
  const navigate = useNavigate();

  const documents = [
    {
      id: 1,
      title: 'Preliminary FIR Draft',
      type: 'LEGAL',
      status: 'READY',
      date: 'Mar 24, 2026',
      description: 'Structured narrative based on 12 fragments.'
    },
    {
      id: 2,
      title: 'Evidence Timeline',
      type: 'EVIDENCE',
      status: 'UPDATING',
      date: 'Mar 25, 2026',
      description: 'Chronological mapping of digital & sensory clues.'
    },
    {
      id: 3,
      title: 'Witness Impact Statement',
      type: 'PERSONAL',
      status: 'DRAFT',
      date: 'Mar 25, 2026',
      description: 'Emotional context and psychological impact summary.'
    }
  ];

  return (
    <div className="min-h-screen bg-surface pb-32">
      <header className="p-8 space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-primary">Auto Documents</h1>
        <p className="text-on-surface-variant font-medium">Legally defensible reality, generated in real-time.</p>
      </header>

      <main className="px-6 space-y-8">
        <section className="bg-primary-container/20 rounded-2xl p-6 border border-primary-container/30 flex items-center gap-6">
          <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-on-primary shrink-0 shadow-lg">
            <ShieldCheck size={32} />
          </div>
          <div>
            <h2 className="font-bold text-lg text-primary">Legal Readiness: 84%</h2>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Your case has enough structural integrity for a preliminary filing. 3 more fragments needed for "High Confidence" status.
            </p>
          </div>
        </section>

        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 px-2">Generated Files</h3>
          {documents.map((doc) => (
            <motion.div 
              key={doc.id}
              whileHover={{ x: 4 }}
              className="bg-white p-6 rounded-xl shadow-sm border border-outline-variant/10 flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-5">
                <div className={`p-3 rounded-lg ${
                  doc.type === 'LEGAL' ? 'bg-indigo-50 text-indigo-600' : 
                  doc.type === 'EVIDENCE' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'
                }`}>
                  <FileText size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-on-surface">{doc.title}</h4>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${
                      doc.status === 'READY' ? 'bg-green-100 text-green-700' : 'bg-surface-container-high text-on-surface-variant'
                    }`}>
                      {doc.status}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant">{doc.description}</p>
                  <p className="text-[10px] font-bold text-on-surface-variant/40 mt-2 uppercase">{doc.date}</p>
                </div>
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-2 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant">
                  <Download size={20} />
                </button>
                <button className="p-2 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant">
                  <Share2 size={20} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        <section className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 px-2">Legal Resources</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/10 space-y-3">
              <Scale size={24} className="text-primary" />
              <h4 className="font-bold text-sm">IPC Section Guide</h4>
              <p className="text-[10px] text-on-surface-variant leading-normal">Relevant laws mapped to your case fragments.</p>
            </div>
            <div className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/10 space-y-3">
              <History size={24} className="text-secondary" />
              <h4 className="font-bold text-sm">Precedent Search</h4>
              <p className="text-[10px] text-on-surface-variant leading-normal">Similar cases and their legal outcomes.</p>
            </div>
          </div>
        </section>

        <div className="bg-error/5 border border-error/10 p-6 rounded-2xl flex gap-4 items-start">
          <AlertCircle className="text-error shrink-0" size={20} />
          <div>
            <h4 className="font-bold text-error text-sm mb-1">Privacy Warning</h4>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Downloading these documents creates local copies. Ensure your device is secure or use the "Auto-Destruct" feature in settings.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
