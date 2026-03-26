import React from 'react';
import { 
  User, 
  Shield, 
  Bell, 
  Lock, 
  EyeOff, 
  Trash2, 
  LogOut, 
  ChevronRight,
  Smartphone,
  Fingerprint
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

export const SettingsScreen = () => {
  const navigate = useNavigate();
  const user = auth.currentUser;

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  const sections = [
    {
      title: 'Account',
      items: [
        { icon: User, label: 'Profile Information', value: user?.displayName || 'User' },
        { icon: Bell, label: 'Notifications', value: 'Enabled' },
      ]
    },
    {
      title: 'Security',
      items: [
        { icon: Lock, label: 'Encryption Keys', value: 'Active' },
        { icon: Fingerprint, label: 'Biometric Lock', value: 'Off' },
        { icon: EyeOff, label: 'Stealth Mode', value: 'Inactive' },
      ]
    },
    {
      title: 'App Settings',
      items: [
        { icon: Smartphone, label: 'Device Sync', value: '1 Device' },
        { icon: Shield, label: 'Emergency SOS', value: 'Configured' },
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-surface pb-32">
      <header className="p-8 flex flex-col items-center gap-6">
        <div className="relative">
          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-xl ring-8 ring-primary/5">
            <img 
              src={user?.photoURL || "https://picsum.photos/seed/user/200/200"} 
              alt="Profile" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-on-primary rounded-full flex items-center justify-center shadow-lg">
            <Shield size={16} />
          </div>
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-on-surface">{user?.displayName || 'Anonymous'}</h1>
          <p className="text-on-surface-variant font-medium text-sm">{user?.email}</p>
        </div>
      </header>

      <main className="px-6 space-y-8">
        {sections.map((section, i) => (
          <div key={i} className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 px-2">{section.title}</h3>
            <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/10 overflow-hidden">
              {section.items.map((item, j) => (
                <button 
                  key={j}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-surface-container-low transition-colors border-b border-outline-variant/5 last:border-0"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-on-surface-variant/60">
                      <item.icon size={20} />
                    </div>
                    <span className="font-bold text-on-surface">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-on-surface-variant">{item.value}</span>
                    <ChevronRight size={16} className="text-on-surface-variant/40" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="space-y-3 pt-4">
          <button className="w-full px-6 py-4 bg-error/5 text-error rounded-2xl border border-error/10 flex items-center gap-4 font-bold hover:bg-error/10 transition-colors">
            <Trash2 size={20} />
            Delete All Data
          </button>
          <button 
            onClick={handleLogout}
            className="w-full px-6 py-4 bg-surface-container-high text-on-surface rounded-2xl flex items-center gap-4 font-bold hover:bg-surface-container-highest transition-colors"
          >
            <LogOut size={20} />
            Log Out
          </button>
        </div>

        <div className="text-center pt-8">
          <p className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">SAAKSHI v1.0.4 - Build 2026.03.26</p>
        </div>
      </main>
    </div>
  );
};
