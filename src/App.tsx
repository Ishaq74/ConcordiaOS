import React, { useState, useEffect } from 'react';
import {
  Settings,
  Palette,
  Database,
  Globe,
  FileText,
  Image as ImageIcon,
  Rocket,
  Briefcase,
  Key,
  Layers,
  LayoutGrid,
  Smartphone,
  Monitor,
  ArrowUpRight,
} from 'lucide-react';
import SettingsApp from './apps/SettingsApp';
import DesignApp from './apps/DesignApp';
import DataApp from './apps/DataApp';
import I18nApp from './apps/I18nApp';
import NotesApp from './apps/NotesApp';
import ImagesApp from './apps/ImagesApp';
import DeployApp from './apps/DeployApp';
import OfficeApp from './apps/OfficeApp';
import EnvApp from './apps/EnvApp';
import PgApp from './apps/PgApp';

interface AppDefinition {
  id: string;
  name: string;
  subtitle: string;
  icon: React.ReactNode;
  accentBg: string;
  component: React.ComponentType<{ onClose?: () => void }>;
}

const APPS: AppDefinition[] = [
  {
    id: 'office',
    name: 'Office CMS',
    subtitle: 'Seed content & i18n entries',
    icon: <Briefcase size={20} className="text-white" />,
    accentBg: 'bg-indigo-600',
    component: OfficeApp,
  },
  {
    id: 'deploy',
    name: 'Workspace',
    subtitle: 'Scripts, build & Astro preview',
    icon: <Rocket size={20} className="text-white" />,
    accentBg: 'bg-orange-600',
    component: DeployApp,
  },
  {
    id: 'pg',
    name: 'Postgres',
    subtitle: 'PGlite SQL runner & tables',
    icon: <Database size={20} className="text-white" />,
    accentBg: 'bg-slate-800',
    component: PgApp,
  },
  {
    id: 'data',
    name: 'Data',
    subtitle: 'Schemas, migrations & seeds',
    icon: <Layers size={20} className="text-white" />,
    accentBg: 'bg-blue-600',
    component: DataApp,
  },
  {
    id: 'i18n',
    name: 'i18n',
    subtitle: 'Locale dictionaries & usage',
    icon: <Globe size={20} className="text-white" />,
    accentBg: 'bg-emerald-600',
    component: I18nApp,
  },
  {
    id: 'design',
    name: 'Design',
    subtitle: 'Tokens, themes & components',
    icon: <Palette size={20} className="text-white" />,
    accentBg: 'bg-rose-600',
    component: DesignApp,
  },
  {
    id: 'images',
    name: 'Images',
    subtitle: 'Media library & uploads',
    icon: <ImageIcon size={20} className="text-white" />,
    accentBg: 'bg-violet-600',
    component: ImagesApp,
  },
  {
    id: 'notes',
    name: 'Notes',
    subtitle: 'Docs & Markdown specs',
    icon: <FileText size={20} className="text-white" />,
    accentBg: 'bg-amber-600',
    component: NotesApp,
  },
  {
    id: 'env',
    name: 'Secrets',
    subtitle: 'Environment & database URL',
    icon: <Key size={20} className="text-white" />,
    accentBg: 'bg-teal-600',
    component: EnvApp,
  },
  {
    id: 'settings',
    name: 'Settings',
    subtitle: 'Repo, Astro config & packages',
    icon: <Settings size={20} className="text-white" />,
    accentBg: 'bg-slate-600',
    component: SettingsApp,
  },
];

export default function App() {
  const [activeApp, setActiveApp] = useState<string | null>(null);
  const [viewportMode, setViewportMode] = useState<'desktop' | 'phone'>('desktop');
  const [systemStatus, setSystemStatus] = useState<{
    hasNodeModules?: boolean;
    hasEnv?: boolean;
    devServerRunning?: boolean;
  }>({});
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    const pollStatus = () => {
      fetch('/api/system-status')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (mounted && data) setSystemStatus(data);
        })
        .catch(() => {});
    };
    pollStatus();
    const id = setInterval(pollStatus, 8000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const currentApp = APPS.find((app) => app.id === activeApp) || null;
  const ActiveComponent = currentApp?.component;

  if (viewportMode === 'phone') {
    return (
      <div className="min-h-[100dvh] bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => setViewportMode('desktop')}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Monitor size={14} />
            Workstation View
          </button>
        </div>

        <div className="relative w-full max-w-[400px] h-[780px] max-h-[calc(100dvh-5rem)] bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border-[8px] border-slate-800 flex flex-col">
          <div className="h-10 bg-slate-900 text-white px-6 flex items-center justify-between text-xs font-medium shrink-0">
            <span className="tabular-nums">{clock}</span>
            <span className="text-slate-300 truncate max-w-[160px]">
              {currentApp ? currentApp.name : 'Concordia OS'}
            </span>
            <span className="text-[11px] text-slate-400">
              {systemStatus.devServerRunning ? 'Astro On' : 'Idle'}
            </span>
          </div>

          <div className="flex-1 overflow-hidden relative bg-slate-50">
            {ActiveComponent ? (
              <ActiveComponent onClose={() => setActiveApp(null)} />
            ) : (
              <div className="h-full overflow-y-auto p-5 bg-slate-900 text-white">
                <div className="mb-5">
                  <h1 className="text-lg font-semibold tracking-tight">Concordia OS</h1>
                  <p className="text-xs text-slate-400 mt-0.5">Astro repository orchestrator</p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {APPS.map((app) => (
                    <button
                      key={app.id}
                      onClick={() => setActiveApp(app.id)}
                      className="flex flex-col items-center gap-2 p-2 rounded-2xl hover:bg-white/5 active:scale-95 transition-transform min-h-[44px]"
                    >
                      <div
                        className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-md ${app.accentBg}`}
                      >
                        {app.icon}
                      </div>
                      <span className="text-[11px] font-medium text-slate-200 text-center leading-tight">
                        {app.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="h-8 bg-slate-100 border-t border-slate-200 flex items-center justify-center shrink-0">
            <button
              onClick={() => setActiveApp(null)}
              className="w-28 h-1.5 rounded-full bg-slate-400 hover:bg-slate-600 transition-colors"
              aria-label="Go to launcher home"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      {/* Top Bar Contract (3 clean zones) */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-6 shrink-0 z-30">
        <button
          onClick={() => setActiveApp(null)}
          className="text-base font-bold tracking-tight text-slate-900 hover:text-indigo-600 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2.5"
        >
          <span className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
            C
          </span>
          Concordia OS
        </button>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 overflow-x-auto scrollbar-hide">
          {['office', 'deploy', 'pg', 'i18n', 'design'].map((id) => {
            const app = APPS.find((a) => a.id === id)!;
            const isActive = activeApp === id;
            return (
              <button
                key={id}
                onClick={() => setActiveApp(id)}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                  isActive
                    ? 'border-indigo-600 text-slate-900 font-semibold'
                    : 'border-transparent hover:text-slate-900'
                }`}
              >
                {app.name}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setViewportMode('phone')}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap shrink-0"
            title="Switch to mobile OS frame"
          >
            <Smartphone size={14} />
            Mobile View
          </button>
        </div>
      </header>

      {/* Main Responsive Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Dock Sidebar */}
        <aside className="hidden lg:flex w-64 bg-white border-r border-slate-200 flex-col justify-between p-3 shrink-0 overflow-y-auto">
          <div className="space-y-1">
            <button
              onClick={() => setActiveApp(null)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                activeApp === null
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <LayoutGrid size={18} />
              <span>Launcher</span>
            </button>

            <div className="pt-3 pb-1 px-3 text-xs font-medium text-slate-400">Applications</div>
            {APPS.map((app) => {
              const isActive = activeApp === app.id;
              return (
                <button
                  key={app.id}
                  onClick={() => setActiveApp(app.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${app.accentBg}`}
                  >
                    {React.cloneElement(app.icon as React.ReactElement<{ size?: number }>, { size: 15 })}
                  </span>
                  <span className="truncate">{app.name}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 px-2 space-y-2 text-xs text-slate-500">
            <div className="flex items-center justify-between">
              <span>Astro Server</span>
              <span className="font-medium text-slate-800">
                {systemStatus.devServerRunning ? 'Running' : 'Stopped'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Dependencies</span>
              <span className="font-medium text-slate-800">
                {systemStatus.hasNodeModules ? 'Installed' : 'Missing'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Local Time</span>
              <span className="font-mono tabular-nums text-slate-700">{clock}</span>
            </div>
          </div>
        </aside>

        {/* Active App Viewport or Launcher Home */}
        <main className="flex-1 overflow-hidden bg-slate-50">
          {ActiveComponent ? (
            <ActiveComponent onClose={() => setActiveApp(null)} />
          ) : (
            <div className="h-full overflow-y-auto p-4 sm:p-8">
              <div className="max-w-5xl mx-auto space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-6">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight text-balance">
                      Concordia Astro Workspace
                    </h1>
                    <p className="text-sm text-slate-600 mt-1.5 max-w-2xl">
                      Manage CMS seeds, PostgreSQL tables, i18n translations, design tokens, media assets, and live Astro previews from one place.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
                    <span>Repo: concordia_repo</span>
                    <span aria-hidden="true">·</span>
                    <span>Astro: {systemStatus.devServerRunning ? 'Active' : 'Idle'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {APPS.map((app) => (
                    <button
                      key={app.id}
                      onClick={() => setActiveApp(app.id)}
                      className="group bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl p-5 text-left transition-colors flex items-start gap-4 min-h-[88px]"
                    >
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${app.accentBg}`}
                      >
                        {app.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h2 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors">
                            {app.name}
                          </h2>
                          <ArrowUpRight
                            size={15}
                            className="text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0"
                          />
                        </div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{app.subtitle}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
