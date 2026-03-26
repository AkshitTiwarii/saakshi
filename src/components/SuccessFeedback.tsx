import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle, MapPin, Clock, Zap, Info } from 'lucide-react';

interface SuccessFeedbackProps {
  classification: {
    time?: string;
    location?: string;
    sensory?: string[];
  };
  onClose: () => void;
}

export const SuccessFeedback = ({ classification, onClose }: SuccessFeedbackProps) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
    >
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl space-y-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-primary"></div>
        
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <CheckCircle size={40} fill="currentColor" className="text-white" />
            <CheckCircle size={40} className="absolute" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Fragment Captured</h2>
            <p className="text-on-surface-variant text-sm">SAAKSHI has analyzed your memory.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-start gap-4 p-4 bg-surface-container-low rounded-2xl">
            <Clock className="text-primary shrink-0" size={20} />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Detected Time</p>
                <div className="group relative">
                  <Info size={12} className="text-on-surface-variant/40 cursor-help" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-black text-white text-[10px] p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    AI extracted this time from your description to build a legal timeline.
                  </div>
                </div>
              </div>
              <p className="font-bold text-on-surface">{classification.time || 'Unknown'}</p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 bg-surface-container-low rounded-2xl">
            <MapPin className="text-secondary shrink-0" size={20} />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Detected Location</p>
                <div className="group relative">
                  <Info size={12} className="text-on-surface-variant/40 cursor-help" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-black text-white text-[10px] p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    Location clues help link your memory to physical evidence like CCTV or transit logs.
                  </div>
                </div>
              </div>
              <p className="font-bold text-on-surface">{classification.location || 'Unknown'}</p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 bg-surface-container-low rounded-2xl">
            <Zap className="text-tertiary shrink-0" size={20} />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-tertiary">Sensory Clues</p>
                <div className="group relative">
                  <Info size={12} className="text-on-surface-variant/40 cursor-help" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-black text-white text-[10px] p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    Sensory details (smell, sound, touch) are hard to fake and strengthen your testimony.
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                {classification.sensory?.map((s, i) => (
                  <span key={i} className="text-[10px] font-bold bg-tertiary/10 text-tertiary px-2 py-0.5 rounded-full uppercase">
                    {s}
                  </span>
                )) || <span className="text-on-surface-variant/40 italic text-xs">None detected</span>}
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={onClose}
          className="w-full bg-primary text-on-primary py-4 rounded-full font-bold shadow-lg active:scale-95 transition-all"
        >
          Continue to War Room
        </button>
      </div>
    </motion.div>
  );
};
