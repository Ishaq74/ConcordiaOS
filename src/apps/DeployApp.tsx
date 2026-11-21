import React, { useState, useEffect } from 'react';
import {
  Rocket,
  Play,
  Terminal,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  Settings,
  Package,
  Code,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { execCmd, FsApiError } from '../hooks/useFs';
import {
  PackageManager,
  PACKAGE_MANAGERS,
  buildPmInstallCommand,
  buildPmRunCommand,
  stripAnsi,
  usePackageManager,
} from '../hooks/usePackageManager';
import { useUiFeedback } from '../components/UiFeedback';

const PM_DESCRIPTIONS: Record<PackageManager, string> = {
  bun: 'Ultra-fast runtime & runner (bun / bunx)',
  pnpm: 'Disk-efficient workspace runner (pnpm)',
  npm: 'Standard Node package runner (npm / npx)',
};

export default function DeployApp({ onClose }: { onClose?: () => void }) {
  const [activeTab, setActiveTab] = useState<'setup' | 'install' | 'scripts' | 'preview' | 'deploy'>('preview');
  const [packageManager, setPackageManager] = usePackageManager();

  const buildSpec = buildPmRunCommand(packageManager, 'build');

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
                aria-label="Back"
              >
                <ChevronLeft size={22} />
              </button>
            )}
            <h1 className="text-xl font-semibold text-slate-900">Workspace &amp; Preview</h1>
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

        <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 scrollbar-hide">
          <TabButton active={activeTab === 'preview'} onClick={() => setActiveTab('preview')} icon={<Play size={14} />} label="Preview" />
          <TabButton active={activeTab === 'install'} onClick={() => setActiveTab('install')} icon={<Package size={14} />} label="Install" />
          <TabButton active={activeTab === 'scripts'} onClick={() => setActiveTab('scripts')} icon={<Code size={14} />} label="Scripts" />
          <TabButton active={activeTab === 'deploy'} onClick={() => setActiveTab('deploy')} icon={<Rocket size={14} />} label="Build" />
          <TabButton active={activeTab === 'setup'} onClick={() => setActiveTab('setup')} icon={<Settings size={14} />} label="Setup" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col min-h-0">
        <div className="max-w-5xl w-full mx-auto flex-1 flex flex-col min-h-0">
          {activeTab === 'setup' && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200 max-w-md mx-auto w-full">
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4 text-slate-600">
                <Settings size={24} />
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-1 text-center">Package Manager</h3>
              <p className="text-xs text-slate-500 mb-5 text-center">
                Select which runtime executes install, scripts, build, and Astro preview inside concordia_repo.
              </p>

              <div className="flex flex-col gap-2.5">
                {PACKAGE_MANAGERS.map((pm) => (
                  <label
                    key={pm}
                    className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-colors ${
                      packageManager === pm
                        ? 'border-indigo-500 bg-indigo-50/50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                          packageManager === pm ? 'border-indigo-600' : 'border-slate-300'
                        }`}
                      >
                        {packageManager === pm && <div className="w-2 h-2 rounded-full bg-indigo-600" />}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-slate-900">{pm}</div>
                        <div className="text-xs text-slate-500">{PM_DESCRIPTIONS[pm]}</div>
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="pm"
                      value={pm}
                      checked={packageManager === pm}
                      onChange={() => setPackageManager(pm)}
                      className="hidden"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'install' && <InstallView packageManager={packageManager} />}
          {activeTab === 'scripts' && <ScriptsView packageManager={packageManager} />}
          {activeTab === 'preview' && <PreviewView packageManager={packageManager} />}
          {activeTab === 'deploy' && (
            <ActionView
              key={buildSpec.display}
              cmd={buildSpec.cmd}
              cmdArgs={buildSpec.args}
              displayCmd={buildSpec.display}
              description="Compile Astro SSR/static output into concordia_repo/dist/"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ScriptsView({ packageManager }: { packageManager: PackageManager }) {
  const [scripts, setScripts] = useState<Record<string, string>>({});
  const [selectedScript, setSelectedScript] = useState<string>('');
  const [extraArgs, setExtraArgs] = useState<string>('');

  useEffect(() => {
    fetch('/api/package-scripts')
      .then((res) => res.json())
      .then((data) => {
        if (data.scripts) {
          setScripts(data.scripts);
          const first = Object.keys(data.scripts)[0];
          if (first) setSelectedScript(first);
        }
      })
      .catch(() => {});
  }, []);

  const parsedExtra = extraArgs
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const spec = buildPmRunCommand(packageManager, selectedScript, parsedExtra);
  const scriptContent = scripts[selectedScript] || '';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Select Script</label>
          <select
            value={selectedScript}
            onChange={(e) => setSelectedScript(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm outline-none focus:border-indigo-500"
          >
            {Object.keys(scripts).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {scriptContent && (
          <div className="text-xs text-slate-600 font-mono bg-slate-100 px-3 py-2 rounded-lg break-all">
            {scriptContent}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Additional Flags (optional)</label>
          <input
            type="text"
            value={extraArgs}
            onChange={(e) => setExtraArgs(e.target.value)}
            placeholder="e.g. --verbose"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm outline-none focus:border-indigo-500 font-mono"
          />
        </div>
      </div>

      {selectedScript && (
        <ActionView
          key={spec.display}
          cmd={spec.cmd}
          cmdArgs={spec.args}
          displayCmd={spec.display}
          description={`Execute "${selectedScript}" inside concordia_repo`}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
        active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function InstallView({ packageManager }: { packageManager: PackageManager }) {
  const [hasNodeModules, setHasNodeModules] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/system-status')
      .then((res) => res.json())
      .then((data) => {
        if (data.hasNodeModules !== undefined) setHasNodeModules(data.hasNodeModules);
      })
      .catch(() => {});
  }, []);

  const spec = buildPmInstallCommand(packageManager);

  return (
    <div className="space-y-4">
      {hasNodeModules === true && (
        <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-200 flex items-start gap-3">
          <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={18} />
          <div>
            <h4 className="font-semibold text-sm text-emerald-900">Dependencies Present</h4>
            <p className="text-xs text-emerald-800 mt-0.5">
              concordia_repo/node_modules already exists. You can still re-run install to sync lockfile updates.
            </p>
          </div>
        </div>
      )}
      <ActionView
        key={spec.display}
        cmd={spec.cmd}
        cmdArgs={spec.args}
        displayCmd={spec.display}
        description="Install project dependencies in concordia_repo"
        onSuccess={() => setHasNodeModules(true)}
      />
    </div>
  );
}

function PreviewView({ packageManager }: { packageManager: PackageManager }) {
  const { toast } = useUiFeedback();
  const [status, setStatus] = useState<'stopped' | 'starting' | 'running' | 'error'>('stopped');
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [routePath, setRoutePath] = useState<string>('/fr/');
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    const syncLogs = () => {
      fetch('/api/dev-server/logs')
        .then((res) => res.json())
        .then((data) => {
          if (data.logs) setLogs(data.logs);
          setStatus((prev) => {
            if (prev === 'starting') return prev;
            return data.running ? 'running' : prev === 'error' ? 'error' : 'stopped';
          });
        })
        .catch(() => {});
    };

    syncLogs();
    const interval = setInterval(syncLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    setStatus('starting');
    setError(null);
    try {
      const res = await fetch('/api/dev-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', packageManager }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start server');
      setStatus('running');
      toast(`Astro dev server started with ${packageManager}`, 'success');
    } catch (err: any) {
      setError(err.message);
      setStatus('error');
      toast(err.message || 'Failed to start Astro', 'error');
    }
  };

  const handleStop = async () => {
    try {
      await fetch('/api/dev-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      setStatus('stopped');
      toast('Astro dev server stopped', 'info');
    } catch (err: any) {
      toast(err.message || 'Failed to stop server', 'error');
    }
  };

  const handleClearLogs = async () => {
    await fetch('/api/dev-server/logs/clear', { method: 'POST' }).catch(() => {});
    setLogs([]);
  };

  const normalizedRoute = routePath.startsWith('/') ? routePath : `/${routePath}`;
  const previewSrc = `/preview-site${normalizedRoute}`;
  const runnerCmd =
    packageManager === 'bun'
      ? 'bunx astro dev'
      : packageManager === 'pnpm'
      ? 'pnpm exec astro dev'
      : 'npx astro dev';

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Astro Live Preview</h3>
            <p className="text-xs text-slate-500 font-mono">
              {runnerCmd} &middot; 127.0.0.1:4321 &rarr; /preview-site
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <span
              className={`w-2 h-2 rounded-full ${
                status === 'running'
                  ? 'bg-emerald-500'
                  : status === 'starting'
                  ? 'bg-amber-500 animate-pulse'
                  : status === 'error'
                  ? 'bg-red-500'
                  : 'bg-slate-300'
              }`}
            />
            <span className="capitalize">{status}</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs flex items-start gap-2">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {status !== 'running' && status !== 'starting' && (
            <button
              onClick={handleStart}
              className="flex-1 bg-slate-900 text-white py-2.5 px-4 rounded-xl text-xs font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
            >
              <Play size={14} />
              Start Dev Server ({packageManager})
            </button>
          )}

          {status === 'starting' && (
            <button
              disabled
              className="flex-1 bg-slate-100 text-slate-500 py-2.5 px-4 rounded-xl text-xs font-medium flex items-center justify-center gap-2 cursor-not-allowed"
            >
              <RefreshCw size={14} className="animate-spin" />
              Starting Astro (:4321)...
            </button>
          )}

          {status === 'running' && (
            <button
              onClick={handleStop}
              className="flex-1 bg-red-50 text-red-700 border border-red-200 py-2.5 px-4 rounded-xl text-xs font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
            >
              Stop Server
            </button>
          )}
        </div>
      </div>

      {status === 'running' && (
        <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden min-h-[460px]">
          <div className="bg-slate-100 border-b border-slate-200 p-2 flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex gap-1.5">
              {['/fr/', '/en/', '/es/', '/ar/'].map((loc) => (
                <button
                  key={loc}
                  onClick={() => setRoutePath(loc)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    routePath === loc ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {loc.replace(/\//g, '').toUpperCase()}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={routePath}
              onChange={(e) => setRoutePath(e.target.value)}
              className="flex-1 min-w-[140px] bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-700 outline-none focus:border-indigo-500"
              aria-label="Preview path"
            />
            <button
              onClick={() => setRefreshNonce((n) => n + 1)}
              className="p-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg"
              title="Reload frame"
            >
              <RefreshCw size={13} />
            </button>
            <a
              href={previewSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg"
              title="Open preview route in new tab"
            >
              <ExternalLink size={13} />
            </a>
          </div>
          <iframe
            key={`${previewSrc}-${refreshNonce}`}
            src={previewSrc}
            className="flex-1 w-full min-h-[400px] border-0 bg-white"
            title="Live Astro Preview"
          />
        </div>
      )}

      {logs.length > 0 && (
        <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-slate-400" />
              <span className="text-xs font-mono text-slate-400">Astro Server Logs</span>
            </div>
            <button
              onClick={handleClearLogs}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              <Trash2 size={12} />
              Clear
            </button>
          </div>
          <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto space-y-0.5">
            {logs.slice(-40).map((log, i) => (
              <div
                key={i}
                className={
                  log.startsWith('[ERR]') ? 'text-red-400' : log.startsWith('[SYS]') ? 'text-indigo-300' : ''
                }
              >
                {stripAnsi(log)}
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}

function ActionView({
  cmd,
  cmdArgs,
  displayCmd,
  description,
  onSuccess,
}: {
  cmd: string;
  cmdArgs: string[];
  displayCmd: string;
  description: string;
  onSuccess?: () => void;
}) {
  const { toast } = useUiFeedback();
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExecute = async () => {
    setLoading(true);
    setError(null);
    setOutput(null);
    try {
      const res = await execCmd(cmd, cmdArgs, '.');
      setOutput(
        stripAnsi([res.stdout, res.stderr].filter(Boolean).join('\n') || 'Command executed cleanly.')
      );
      toast('Command finished cleanly', 'success');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(stripAnsi(err.message));
      if (err instanceof FsApiError) {
        setOutput(stripAnsi([err.stdout, err.stderr].filter(Boolean).join('\n')) || null);
      }
      toast('Command failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center">
        <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center mx-auto mb-3 text-orange-600">
          <Terminal size={24} />
        </div>
        <h3 className="text-sm font-semibold text-slate-900 font-mono mb-1">{displayCmd}</h3>
        <p className="text-xs text-slate-500 mb-5">{description}</p>

        <button
          onClick={handleExecute}
          disabled={loading}
          className="w-full max-w-xs mx-auto bg-slate-900 text-white rounded-xl py-2.5 px-4 font-medium text-xs hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
          {loading ? 'Executing...' : 'Run Command'}
        </button>
      </div>

      {(output || error) && (
        <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 overflow-hidden">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${error ? 'bg-red-500' : 'bg-emerald-500'}`} />
            <span className="text-xs font-mono text-slate-400">Terminal Output</span>
          </div>
          <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap overflow-x-auto max-h-72 overflow-y-auto">
            {error && <div className="text-red-400 mb-2">{error}</div>}
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
