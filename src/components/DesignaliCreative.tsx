import React from 'react';
import {
  Bell,
  BookOpen,
  Briefcase,
  CircleUserRound,
  Cloud,
  FolderOpen,
  Grid3X3,
  Home,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  Video,
  WandSparkles,
} from 'lucide-react';

const appCards = [
  {
    title: 'CaseVision',
    subtitle: 'Evidence indexing and timeline synthesis',
    icon: WandSparkles,
    color: 'text-indigo-600',
  },
  {
    title: 'VectorBrief',
    subtitle: 'Legal argument drafting and revision',
    icon: Briefcase,
    color: 'text-orange-600',
  },
  {
    title: 'VoiceDepose',
    subtitle: 'Interview transcripts and statement playback',
    icon: Video,
    color: 'text-pink-600',
  },
];

export function DesignaliCreative() {
  const sidebarItems: Array<{ label: string; Icon: React.ComponentType<{ size?: number }> }> = [
    { label: 'Home', Icon: Home },
    { label: 'Apps', Icon: Grid3X3 },
    { label: 'Files', Icon: FolderOpen },
    { label: 'Projects', Icon: Briefcase },
    { label: 'Learn', Icon: BookOpen },
    { label: 'Community', Icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-[#f2f4f8] text-slate-900 p-3 md:p-5">
      <div className="mx-auto max-w-[1320px] rounded-3xl border border-slate-300 bg-white shadow-[0_20px_80px_rgba(15,23,42,0.08)] overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr]">
          <aside className="bg-[#f7f7fa] border-r border-slate-200 p-4 md:p-5">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center">
                <Sparkles size={20} />
              </div>
              <div>
                <p className="font-black text-lg leading-none">Saakshi Creative</p>
                <p className="text-xs text-slate-500 mt-1">Officer Suite</p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-white px-3 py-2 flex items-center gap-2 text-slate-500">
              <Search size={16} />
              <span className="text-sm">Search...</span>
            </div>

            <nav className="mt-5 space-y-1">
              {sidebarItems.map(({ label, Icon }) => (
                <button
                  key={label}
                  className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-colors ${
                    label === 'Home' ? 'bg-slate-200 font-semibold' : 'hover:bg-slate-100'
                  }`}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>

            <div className="mt-8 rounded-xl border border-slate-200 bg-white p-3 space-y-2">
              <div className="w-full rounded-lg bg-slate-900 text-white py-2 text-sm font-bold text-center">
                Officer Dashboard Active
              </div>
            </div>

            <button className="mt-8 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 flex items-center gap-3 hover:bg-slate-50">
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </aside>

          <main className="p-4 md:p-6">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">Designali Creative</h1>
              <div className="flex items-center gap-2">
                <button className="h-10 px-4 rounded-full border border-slate-300 bg-white font-semibold">Install App</button>
                <button className="h-10 px-4 rounded-full bg-slate-900 text-white font-semibold flex items-center gap-2">
                  <Plus size={16} /> New Project
                </button>
                <button className="h-10 w-10 rounded-full border border-slate-300 bg-white relative">
                  <Bell size={16} className="mx-auto" />
                  <span className="absolute -top-1 -right-1 rounded-full bg-rose-500 text-white text-[10px] h-5 w-5 flex items-center justify-center">5</span>
                </button>
                <button className="h-10 w-10 rounded-full border border-slate-300 bg-white flex items-center justify-center">
                  <CircleUserRound size={18} />
                </button>
              </div>
            </header>

            <div className="mt-4 rounded-full bg-slate-100 p-1.5 flex flex-wrap gap-1 text-sm">
              {['Home', 'Apps', 'Files', 'Projects', 'Learn'].map((tab, index) => (
                <button
                  key={tab}
                  className={`px-6 py-2 rounded-full ${index === 0 ? 'bg-white font-semibold shadow-sm' : 'text-slate-600'}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <section className="mt-5 rounded-3xl p-6 md:p-8 text-white bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 relative overflow-hidden">
              <div className="absolute right-8 top-1/2 -translate-y-1/2 h-36 w-36 rounded-full border border-white/20 bg-white/10" />
              <div className="absolute right-14 top-1/2 -translate-y-1/2 h-24 w-24 rounded-full border border-white/25 bg-white/10" />
              <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">Premium</span>
              <h2 className="mt-3 text-3xl md:text-4xl font-black max-w-3xl">Welcome to DesignAli Creative Suite</h2>
              <p className="mt-2 text-white/85 max-w-2xl">Unified workspace for victim-safe evidence workflows, officer review, and courtroom-ready AI assistance.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="rounded-full bg-white text-indigo-700 px-5 py-2.5 font-semibold">Explore Plans</button>
                <button className="rounded-full border border-white/60 px-5 py-2.5 font-semibold">Take a Tour</button>
              </div>
            </section>

            <section className="mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-3xl font-black tracking-tight">Recent Apps</h3>
                <button className="text-sm font-semibold text-slate-600">View All</button>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                {appCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <article key={card.title} className="rounded-2xl border border-slate-200 p-5 bg-white">
                      <div className="flex items-center justify-between">
                        <div className={`h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center ${card.color}`}>
                          <Icon size={20} />
                        </div>
                        <Star size={16} className="text-slate-400" />
                      </div>
                      <h4 className="mt-4 text-2xl font-black">{card.title}</h4>
                      <p className="mt-1 text-sm text-slate-600 min-h-10">{card.subtitle}</p>
                      <button className="mt-4 w-full rounded-xl bg-slate-100 py-2.5 font-semibold">Open</button>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-200 p-5 bg-white md:col-span-2">
                <h4 className="text-xl font-black">Active Projects</h4>
                <p className="text-sm text-slate-600 mt-1">Case intelligence boards currently in progress.</p>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
                    <p className="font-semibold">Case Integrity Monitor</p>
                    <p className="text-xs text-slate-600 mt-1">Blockchain hash anomaly checks</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
                    <p className="font-semibold">Emotion-Aware Deposition</p>
                    <p className="text-xs text-slate-600 mt-1">Pause-aware testimony assistant</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-5 bg-white">
                <h4 className="text-xl font-black">System Pulse</h4>
                <div className="mt-3 space-y-2 text-sm">
                  <p className="rounded-lg bg-emerald-50 text-emerald-700 px-3 py-2 border border-emerald-200">Officer access policies synced</p>
                  <p className="rounded-lg bg-blue-50 text-blue-700 px-3 py-2 border border-blue-200">Case hash anchor healthy</p>
                  <p className="rounded-lg bg-violet-50 text-violet-700 px-3 py-2 border border-violet-200 flex items-center gap-2">
                    <Cloud size={14} /> Live cloud backups active
                  </p>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
