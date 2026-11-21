import React, { useState, useEffect } from 'react';
import { useFsRead, useFsScan, execCmd } from '../hooks/useFs';
import {
  PACKAGE_MANAGERS,
  buildPmRunCommand,
  stripAnsi,
  usePackageManager,
} from '../hooks/usePackageManager';
import { useUiFeedback } from '../components/UiFeedback';
import {
  ChevronRight,
  RefreshCw,
  Server,
  Code,
  Globe,
  ChevronLeft,
  GitBranch,
  Clock,
  Hash,
  Package,
  ArrowLeft,
  Play,
  Search,
  Terminal,
} from 'lucide-react';

export default function SettingsApp({ onClose }: { onClose?: () => void }) {
  const { data: pkgData, loading: pkgLoading, error: pkgError } = useFsRead('package.json');
  const { data: astroData, loading: astroLoading, error: astroError } = useFsRead('astro.config.mjs');
  const { files } = useFsScan();
  const { toast } = useUiFeedback();

  const [view, setView] = useState<'main' | 'dependencies' | 'scripts' | 'astro' | 'i18n'>('main');
  const [depSearch, setDepSearch] = useState('');
  const [gitInfo, setGitInfo] = useState<{ branch: string; hash: string; date: string } | null>(null);
  const [gitError, setGitError] = useState<string | null>(null);
  const [gitLoading, setGitLoading] = useState(false);

  const [runningScript, setRunningScript] = useState<string | null>(null);
  const [scriptResult, setScriptResult] = useState<{
    script: string;
    output: string;
    isError: boolean;
  } | null>(null);

  const [packageManager, setPackageManager] = usePackageManager();

  const fetchGitInfo = async () => {
    setGitLoading(true);
    setGitError(null);
    try {
      const branchRes = await execCmd('git', ['branch', '--show-current']);
      const logRes = await execCmd('git', ['log', '-1', '--format=%h|%cd', '--date=short']);

      const branch = branchRes.stdout.trim() || 'detached';
      const [hash, date] = (logRes.stdout || '').trim().split('|');
      setGitInfo({
        branch,
        hash: hash || 'N/A',
        date: date || 'N/A',
      });
    } catch (e: any) {
      setGitError(e.message || 'Git info unavailable');
    } finally {
      setGitLoading(false);
    }
  };

  useEffect(() => {
    fetchGitInfo();
  }, []);

  const handleRunScript = async (script: string) => {
    if (runningScript) return;
    setRunningScript(script);
    setScriptResult(null);
    const { cmd, args, display } = buildPmRunCommand(packageManager, script);
    try {
      const res = await execCmd(cmd, args);
      const output = stripAnsi(
        [res.stdout, res.stderr].filter(Boolean).join('\n') || 'Completed with exit code 0.'
      );
      setScriptResult({ script: display, output, isError: false });
      toast(`Script "${script}" completed`, 'success');
    } catch (e: any) {
      const output = stripAnsi([e.message, e.stdout, e.stderr].filter(Boolean).join('\n'));
      setScriptResult({ script: display, output, isError: true });
      toast(`Script "${script}" failed`, 'error');
    } finally {
      setRunningScript(null);
    }
  };

  if (pkgLoading || astroLoading) {
    return (
      <div className="p-8 flex justify-center">
        <RefreshCw className="animate-spin text-slate-400" />
      </div>
    );
  }
  if (pkgError) return <div className="p-4 text-red-600 text-sm">{pkgError}</div>;

  let pkg: any = {};
  try {
    pkg = JSON.parse(pkgData?.content || '{}');
  } catch {
    pkg = {};
  }

  const scripts = Object.keys(pkg.scripts || {});
  const dependencies = Object.entries(pkg.dependencies || {});
  const devDependencies = Object.entries(pkg.devDependencies || {});
  const i18nFiles = files.filter((f) => f.startsWith('src/i18n/') && f.endsWith('.json'));

  let locales: string[] = ['fr', 'en', 'es', 'ar'];
  let astroSite = 'Not set';
  let astroOutput = 'server';
  try {
    const astroContent = astroData?.content || '';
    const localesMatch = astroContent.match(/locales:\s*\[(.*?)\]/);
    if (localesMatch && localesMatch[1]) {
      locales = localesMatch[1]
        .split(',')
        .map((l: string) => l.replace(/['"]/g, '').trim())
        .filter(Boolean);
    }
    const outputMatch = astroContent.match(/output:\s*['"](.*?)['"]/);
    if (outputMatch) astroOutput = outputMatch[1];
    const siteMatch = astroContent.match(/site:\s*(.*?)(?:,|\n)/);
    if (siteMatch) astroSite = siteMatch[1].trim();
  } catch {
    // ignore parse fallback
  }

  if (view === 'astro') {
    return (
      <div className="h-full flex flex-col bg-slate-50">
        <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center gap-3 sticky top-0 z-10">
          <button
            onClick={() => setView('main')}
            className="p-2 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Server size={18} className="text-blue-600" />
            Astro Configuration
          </h1>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Output Mode</div>
                <div className="text-sm font-semibold text-slate-900 mt-1">{astroOutput}</div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Configured Locales</div>
                <div className="text-sm font-semibold text-slate-900 mt-1">{locales.join(', ')}</div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Site Expression</div>
                <div className="text-sm font-mono text-slate-900 mt-1 truncate">{astroSite}</div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-mono text-slate-600">
                astro.config.mjs
              </div>
              {astroError ? (
                <div className="p-4 text-sm text-red-600">{astroError}</div>
              ) : (
                <pre className="p-4 text-xs font-mono text-slate-800 whitespace-pre-wrap overflow-x-auto leading-relaxed">
                  {astroData?.content || 'Empty configuration'}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'i18n') {
    return (
      <div className="h-full flex flex-col bg-slate-50">
        <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center gap-3 sticky top-0 z-10">
          <button
            onClick={() => setView('main')}
            className="p-2 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Globe size={18} className="text-emerald-600" />
            Languages (i18n)
          </h1>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">Astro Configured Locales</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {locales.map((loc, idx) => (
                  <div key={loc} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-base font-bold text-slate-900 uppercase">{loc}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {idx === 0 ? 'Default locale' : 'Secondary'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                Translation Dictionary Files ({i18nFiles.length})
              </div>
              <div className="divide-y divide-slate-100">
                {i18nFiles.map((f) => (
                  <div key={f} className="px-4 py-3 flex items-center justify-between text-sm">
                    <span className="font-mono text-slate-800">{f}</span>
                    <span className="text-xs text-slate-500">JSON</span>
                  </div>
                ))}
                {i18nFiles.length === 0 && (
                  <div className="p-4 text-sm text-slate-500 text-center">No i18n JSON files found.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'dependencies') {
    const q = depSearch.toLowerCase();
    const filteredDeps = dependencies.filter(([n]) => n.toLowerCase().includes(q));
    const filteredDevDeps = devDependencies.filter(([n]) => n.toLowerCase().includes(q));

    return (
      <div className="h-full flex flex-col bg-slate-50">
        <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center gap-3 sticky top-0 z-10">
          <button
            onClick={() => setView('main')}
            className="p-2 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Package size={18} className="text-slate-600" />
            Dependencies
          </h1>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-3xl mx-auto space-y-5">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={depSearch}
                onChange={(e) => setDepSearch(e.target.value)}
                placeholder="Filter packages..."
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 tabular-nums">
                Runtime Dependencies ({filteredDeps.length})
              </div>
              <div className="divide-y divide-slate-100">
                {filteredDeps.map(([name, version]) => (
                  <div key={name} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                    <span className="text-sm font-medium text-slate-800">{name}</span>
                    <span className="text-xs font-mono tabular-nums text-slate-600">{String(version)}</span>
                  </div>
                ))}
                {filteredDeps.length === 0 && (
                  <div className="p-4 text-sm text-slate-500 text-center">No matching dependencies</div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 tabular-nums">
                Dev Dependencies ({filteredDevDeps.length})
              </div>
              <div className="divide-y divide-slate-100">
                {filteredDevDeps.map(([name, version]) => (
                  <div key={name} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                    <span className="text-sm font-medium text-slate-800">{name}</span>
                    <span className="text-xs font-mono tabular-nums text-slate-600">{String(version)}</span>
                  </div>
                ))}
                {filteredDevDeps.length === 0 && (
                  <div className="p-4 text-sm text-slate-500 text-center">No matching dev dependencies</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'scripts') {
    return (
      <div className="h-full flex flex-col bg-slate-50">
        <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-3 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('main')}
              className="p-2 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Code size={18} className="text-orange-600" />
              Package Scripts ({packageManager})
            </h1>
          </div>

          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            {PACKAGE_MANAGERS.map((pm) => (
              <button
                key={pm}
                onClick={() => setPackageManager(pm)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  packageManager === pm ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {pm}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {scriptResult && (
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-slate-300 flex items-center gap-2">
                    <Terminal size={14} />
                    {scriptResult.script} — {scriptResult.isError ? 'Failed' : 'Success'}
                  </span>
                  <button
                    onClick={() => setScriptResult(null)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Dismiss
                  </button>
                </div>
                <pre
                  className={`text-xs font-mono whitespace-pre-wrap max-h-56 overflow-y-auto ${
                    scriptResult.isError ? 'text-red-300' : 'text-emerald-300'
                  }`}
                >
                  {scriptResult.output}
                </pre>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="divide-y divide-slate-100">
                {scripts.map((script) => (
                  <div key={script} className="p-4 flex flex-col gap-2 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-900">{script}</span>
                      <button
                        onClick={() => handleRunScript(script)}
                        disabled={!!runningScript}
                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 min-h-[36px]"
                      >
                        {runningScript === script ? (
                          <RefreshCw size={13} className="animate-spin" />
                        ) : (
                          <Play size={13} />
                        )}
                        Run
                      </button>
                    </div>
                    <div className="text-xs font-mono text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 break-all">
                      {pkg.scripts[script]}
                    </div>
                  </div>
                ))}
                {scripts.length === 0 && (
                  <div className="p-6 text-sm text-slate-500 text-center">No scripts found</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            {PACKAGE_MANAGERS.map((pm) => (
              <button
                key={pm}
                onClick={() => setPackageManager(pm)}
                className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                  packageManager === pm ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {pm}
              </button>
            ))}
          </div>
          <button
            onClick={fetchGitInfo}
            disabled={gitLoading}
            className="px-3 py-2 bg-slate-100 rounded-lg text-slate-700 hover:bg-slate-200 disabled:opacity-50 text-xs font-medium flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={gitLoading ? 'animate-spin' : ''} />
            Refresh Git
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Repo Identity */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-white font-bold text-xl shrink-0">
              {pkg.name ? pkg.name.charAt(0).toUpperCase() : 'C'}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-slate-900 truncate">{pkg.name || 'Concordia Astro'}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Version {pkg.version || '0.0.1'} · concordia_repo · runner: {packageManager}
              </p>
            </div>
          </div>

          {/* Git Status */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <GitBranch size={16} className="text-slate-500" />
                Repository Status
              </h3>
            </div>

            {gitError ? (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                {gitError}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <GitBranch size={12} /> Branch
                  </div>
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {gitInfo?.branch || 'Loading...'}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <Hash size={12} /> Commit
                  </div>
                  <div className="text-sm font-mono text-slate-900 truncate">
                    {gitInfo?.hash || 'Loading...'}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <Clock size={12} /> Last Commit
                  </div>
                  <div className="text-sm font-medium tabular-nums text-slate-900">
                    {gitInfo?.date || 'Loading...'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Navigation Rows */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <SettingRow
              icon={<Server size={18} className="text-blue-600" />}
              title="Astro Config"
              subtitle={`output: ${astroOutput} · astro.config.mjs`}
              onClick={() => setView('astro')}
            />
            <SettingRow
              icon={<Globe size={18} className="text-emerald-600" />}
              title="Languages (i18n)"
              subtitle={`${locales.join(', ')} (${i18nFiles.length} JSON files)`}
              onClick={() => setView('i18n')}
            />
            <SettingRow
              icon={<Package size={18} className="text-slate-600" />}
              title="Dependencies"
              subtitle={`${dependencies.length} runtime · ${devDependencies.length} dev`}
              onClick={() => setView('dependencies')}
              border={false}
            />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 font-semibold text-sm text-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code size={18} className="text-orange-600" />
                Package Scripts ({scripts.length})
              </div>
              <button
                onClick={() => setView('scripts')}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
              >
                View &amp; Run All
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {scripts.slice(0, 4).map((script) => (
                <button
                  key={script}
                  className="w-full p-3.5 px-4 flex items-center justify-between hover:bg-slate-50 text-left transition-colors"
                  onClick={() => setView('scripts')}
                >
                  <span className="text-sm font-medium text-slate-800">{script}</span>
                  <span className="text-xs font-mono text-slate-500 truncate max-w-[200px]">
                    {pkg.scripts[script]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingRow({
  icon,
  title,
  subtitle,
  border = true,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  border?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors min-h-[56px] ${
        border ? 'border-b border-slate-100' : ''
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="text-left min-w-0">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="text-xs text-slate-500 truncate">{subtitle}</div>
        </div>
      </div>
      <ChevronRight size={16} className="text-slate-400 shrink-0" />
    </button>
  );
}
