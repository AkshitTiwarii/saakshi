import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  ArrowLeft, 
  Eraser, 
  Undo, 
  Check, 
  Sparkles,
  Palette,
  Type,
  Image as ImageIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

import { analyzeImage } from '../services/geminiService.ts';
import { SuccessFeedback } from './SuccessFeedback';
import { AnimatePresence } from 'motion/react';

export const CaptureDraw = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#2D333B');
  const [brushSize, setBrushSize] = useState(4);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [classification, setClassification] = useState<any>(null);
  const [locationData, setLocationData] = useState<{lat: number, lng: number} | null>(null);

  useEffect(() => {
    // Get location on mount
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocationData({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.warn("Location access denied", err)
      );
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.beginPath();
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    let x, y;

    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.lineWidth = brushSize;
    ctx.strokeStyle = color;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    
    try {
      const analysis = await analyzeImage(dataUrl);
      const result = {
        emotion: analysis.emotion || 'Expressive',
        time: analysis.time || 'Unknown',
        location: analysis.location || 'Visual Context',
        sensory: analysis.sensory || ['Visual representation'],
        description: analysis.description
      };
      
      await addDoc(collection(db, 'fragments'), {
        uid: auth.currentUser?.uid,
        content: dataUrl,
        type: 'drawing',
        timestamp: Timestamp.now(),
        classification: result,
        geoTag: locationData
      });

      setClassification(result);
      setIsSaving(false);
      setShowSuccess(true);
    } catch (error) {
      console.error("Failed to save drawing", error);
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col overflow-hidden">
      <AnimatePresence>
        {showSuccess && (
          <SuccessFeedback 
            classification={classification} 
            onClose={() => navigate('/war-room')} 
          />
        )}
      </AnimatePresence>
      <header className="p-6 flex items-center justify-between bg-white/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-primary">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold text-primary">Visual Memory</h1>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="bg-primary text-on-primary px-6 py-2 rounded-full font-bold flex items-center gap-2 shadow-md active:scale-95 transition-all disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : (
            <>
              <Check size={20} />
              Done
            </>
          )}
        </button>
      </header>

      <main className="flex-grow relative bg-white">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-full touch-none cursor-crosshair"
        />
        
        <div className="absolute top-6 left-1/2 -translate-x-1/2 glass-card px-6 py-3 rounded-full border border-outline-variant/20 flex items-center gap-4 pointer-events-none">
          <Sparkles size={16} className="text-primary" />
          <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Sketch the scene, layout, or symbols</span>
        </div>
      </main>

      <footer className="p-6 bg-surface-container-low border-t border-outline-variant/10 flex items-center justify-between">
        <div className="flex gap-4">
          <button onClick={clearCanvas} className="p-3 rounded-full bg-white shadow-sm text-on-surface-variant hover:bg-surface-container-high transition-colors">
            <Eraser size={24} />
          </button>
          <button className="p-3 rounded-full bg-white shadow-sm text-on-surface-variant hover:bg-surface-container-high transition-colors">
            <Undo size={24} />
          </button>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex gap-2">
            {['#2D333B', '#E53935', '#1E88E5', '#43A047'].map(c => (
              <button 
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 transition-transform ${color === c ? 'scale-125 border-primary' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="h-8 w-[1px] bg-outline-variant/20"></div>
          <div className="flex items-center gap-3">
            <button className="text-on-surface-variant opacity-40"><Type size={24} /></button>
            <button className="text-on-surface-variant opacity-40"><ImageIcon size={24} /></button>
          </div>
        </div>
      </footer>
    </div>
  );
};
