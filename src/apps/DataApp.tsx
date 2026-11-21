import React, { useState, useEffect } from 'react';
import { useFsScan, useFsRead, execCmd } from '../hooks/useFs';
import {
  PACKAGE_MANAGERS,
  buildPmRunCommand,
  stripAnsi,
  usePackageManager,
} from '../hooks/usePackageManager';
import { useUiFeedback } from '../components/UiFeedback';
import {
  Table,
  Play,
  FileJson,
  History,
  ChevronLeft,
  RefreshCw,
  ChevronRight,
  ArrowLeft,
  Search,
  Terminal,
  CheckCircle2,
  Copy,
  Sparkles,
  GitCompare,
} from 'lucide-react';

export default function DataApp({ onClose }: { onClose?: () => void }) {
  const [activeTab, setActiveTab] = useState<'schemas' | 'seeds' | 'migrations' | 'loaders'>('schemas');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cmdOutput, setCmdOutput] = useState<{ title: string; text: string; isError: boolean } | null>(null);
  const [activeDb, setActiveDb] = useState<string>('postgres');
  const { files, loading, error } = useFsScan();
  const [packageManager, setPackageManager] = usePackageManager();

  useEffect(() => {
    fetch('/api/pg-databases')
      .then((r) => r.json())
      .then((d) => {
        if (d.activeDb) setActiveDb(d.activeDb);
      })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <RefreshCw className="animate-spin text-slate-400" />
      </div>
    );
  }
  if (error) return <div className="p-4 text-red-600 text-sm">{error}</div>;

  const q = search.toLowerCase();
  const schemas = files
    .filter((f) => f.startsWith('src/database/schemas/') && f.endsWith('.schema.ts'))
    .map((f) => f.split('/').pop()!)
    .filter((f) => f.toLowerCase().includes(q));
  const seeds = files
    .filter((f) => f.startsWith('src/database/data/') && f.endsWith('.data.ts'))
    .map((f) => f.split('/').pop()!)
    .filter((f) => f.toLowerCase().includes(q));
  const migrations = files
    .filter((f) => f.startsWith('src/database/migrations/') && f.endsWith('.sql'))
    .map((f) => f.split('/').pop()!)
    .filter((f) => f.toLowerCase().includes(q));
  const loaders = files
    .filter((f) => f.startsWith('src/database/loaders/') && f.endsWith('.ts'))
    .map((f) => f.split('/').pop()!)
    .filter((f) => f.toLowerCase().includes(q));

  if (selectedFile) {
    return <FileViewer file={selectedFile} onBack={() => setSelectedFile(null)} />;
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <ChevronLeft size={22} />
              </button>
            )}
            <h1 className="text-xl font-semibold text-slate-900">Data Architecture</h1>
            <span className="hidden sm:inline text-xs font-mono text-slate-500 ml-1">
              · {activeDb}
            </span>
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

            <div className="relative w-40 sm:w-56">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter files..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto scrollbar-hide max-w-md">
          <TabButton
            active={activeTab === 'schemas'}
            onClick={() => setActiveTab('schemas')}
            icon={<Table size={14} />}
            label={`Schemas (${schemas.length})`}
          />
          <TabButton
            active={activeTab === 'seeds'}
            onClick={() => setActiveTab('seeds')}
            icon={<Play size={14} />}
            label={`Seeds (${seeds.length})`}
          />
          <TabButton
            active={activeTab === 'migrations'}
            onClick={() => setActiveTab('migrations')}
            icon={<History size={14} />}
            label={`Migrations (${migrations.length})`}
          />
          <TabButton
            active={activeTab === 'loaders'}
            onClick={() => setActiveTab('loaders')}
            icon={<FileJson size={14} />}
            label={`Loaders (${loaders.length})`}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {cmdOutput && (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-slate-300 flex items-center gap-2">
                  <Terminal size={14} />
                  {cmdOutput.title}
                </span>
                <button
                  onClick={() => setCmdOutput(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Clear
                </button>
              </div>
              <pre
                className={`text-xs font-mono whitespace-pre-wrap max-h-56 overflow-y-auto ${
                  cmdOutput.isError ? 'text-red-300' : 'text-emerald-300'
                }`}
              >
                {cmdOutput.text}
              </pre>
            </div>
          )}

          {activeTab === 'schemas' && (
            <FileListView
              items={schemas}
              folder="src/database/schemas"
              icon={<Table size={18} className="text-blue-600" />}
              iconBg="bg-blue-50"
              emptyText="No schemas found."
              onSelect={(f) => setSelectedFile(`src/database/schemas/${f}`)}
            />
          )}
          {activeTab === 'seeds' && (
            <SeedsView
              seeds={seeds}
              onSelect={(f) => setSelectedFile(`src/database/data/${f}`)}
              onOutput={setCmdOutput}
            />
          )}
          {activeTab === 'migrations' && (
            <MigrationsView
              migrations={migrations}
              onSelect={(f) => setSelectedFile(`src/database/migrations/${f}`)}
              onOutput={setCmdOutput}
            />
          )}
          {activeTab === 'loaders' && (
            <FileListView
              items={loaders}
              folder="src/database/loaders"
              icon={<FileJson size={18} className="text-violet-600" />}
              iconBg="bg-violet-50"
              emptyText="No loaders found."
              onSelect={(f) => setSelectedFile(`src/database/loaders/${f}`)}
            />
          )}
        </div>
      </div>
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
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors tabular-nums ${
        active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function FileListView({
  items,
  folder,
  icon,
  iconBg,
  emptyText,
  onSelect,
}: {
  items: string[];
  folder: string;
  icon: React.ReactNode;
  iconBg: string;
  emptyText: string;
  onSelect: (f: string) => void;
}) {
  if (items.length === 0) {
    return <div className="text-sm text-slate-500 text-center py-10">{emptyText}</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {items.map((item) => (
        <button
          key={item}
          onClick={() => onSelect(item)}
          className="bg-white rounded-xl p-4 border border-slate-200 flex items-center justify-between hover:border-indigo-300 transition-colors text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
              {icon}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900 truncate">{item}</div>
              <div className="text-xs text-slate-500 truncate">{folder}/</div>
            </div>
          </div>
          <ChevronRight size={16} className="text-slate-400 shrink-0" />
        </button>
      ))}
    </div>
  );
}

function SeedsView({
  seeds,
  onSelect,
  onOutput,
}: {
  seeds: string[];
  onSelect: (f: string) => void;
  onOutput: (out: { title: string; text: string; isError: boolean }) => void;
}) {
  const [running, setRunning] = useState(false);
  const { toast } = useUiFeedback();
  const [packageManager] = usePackageManager();

  const handleRunSeed = async () => {
    setRunning(true);
    const { cmd, args, display } = buildPmRunCommand(packageManager, 'db:seed');
    try {
      const res = await execCmd(cmd, args);
      onOutput({
        title: display,
        text: stripAnsi([res.stdout, res.stderr].filter(Boolean).join('\n') || 'Seeds applied.'),
        isError: false,
      });
      toast('Database seeded successfully', 'success');
    } catch (e: any) {
      onOutput({
        title: `${display} (failed)`,
        text: stripAnsi([e.message, e.stdout, e.stderr].filter(Boolean).join('\n')),
        isError: true,
      });
      toast('Failed to run db:seed', 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleRunSeed}
          disabled={running}
          className="px-4 py-2.5 bg-slate-900 text-white rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          {running ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
          Run db:seed ({packageManager})
        </button>
      </div>

      <FileListView
        items={seeds}
        folder="src/database/data"
        icon={<FileJson size={18} className="text-emerald-600" />}
        iconBg="bg-emerald-50"
        emptyText="No seeds found."
        onSelect={onSelect}
      />
    </div>
  );
}

function MigrationsView({
  migrations,
  onSelect,
  onOutput,
}: {
  migrations: string[];
  onSelect: (f: string) => void;
  onOutput: (out: { title: string; text: string; isError: boolean }) => void;
}) {
  const [running, setRunning] = useState<string | null>(null);
  const { toast } = useUiFeedback();
  const [packageManager] = usePackageManager();

  const runDbScript = async (script: 'db:migrate' | 'db:check' | 'db:generate' | 'db:compare') => {
    setRunning(script);
    const { cmd, args, display } = buildPmRunCommand(packageManager, script);
    try {
      const res = await execCmd(cmd, args);
      onOutput({
        title: display,
        text: stripAnsi([res.stdout, res.stderr].filter(Boolean).join('\n') || 'Completed.'),
        isError: false,
      });
      toast(`${script} completed`, 'success');
    } catch (e: any) {
      onOutput({
        title: `${display} (failed)`,
        text: stripAnsi([e.message, e.stdout, e.stderr].filter(Boolean).join('\n')),
        isError: true,
      });
      toast(`${script} failed`, 'error');
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => runDbScript('db:migrate')}
          disabled={!!running}
          className="px-4 py-2.5 bg-slate-900 text-white rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          {running === 'db:migrate' ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
          Run db:migrate
        </button>
        <button
          onClick={() => runDbScript('db:check')}
          disabled={!!running}
          className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {running === 'db:check' ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <CheckCircle2 size={16} />
          )}
          Run db:check
        </button>
        <button
          onClick={() => runDbScript('db:generate')}
          disabled={!!running}
          className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {running === 'db:generate' ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          Run db:generate
        </button>
        <button
          onClick={() => runDbScript('db:compare')}
          disabled={!!running}
          className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {running === 'db:compare' ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <GitCompare size={16} />
          )}
          Run db:compare
        </button>
      </div>

      <FileListView
        items={migrations}
        folder="src/database/migrations"
        icon={<History size={18} className="text-orange-600" />}
        iconBg="bg-orange-50"
        emptyText="No migrations found."
        onSelect={onSelect}
      />
    </div>
  );
}

function FileViewer({ file, onBack }: { file: string; onBack: () => void }) {
  const { data, loading, error } = useFsRead(file);
  const { toast } = useUiFeedback();

  const handleCopy = () => {
    if (!data?.content) return;
    navigator.clipboard.writeText(data.content).then(() => toast('Copied to clipboard', 'success'));
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-3 sticky top-0 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="p-2 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-900 truncate">{file.split('/').pop()}</h1>
            <p className="text-xs font-mono text-slate-500 truncate">{file}</p>
          </div>
        </div>
        <button
          onClick={handleCopy}
          disabled={!data?.content}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 shrink-0 disabled:opacity-50"
        >
          <Copy size={14} />
          Copy
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          {loading && (
            <div className="flex justify-center p-8">
              <RefreshCw className="animate-spin text-slate-400" />
            </div>
          )}
          {error && <div className="text-red-700 text-sm p-4 bg-red-50 rounded-xl border border-red-200">{error}</div>}

          {!loading && !error && data && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 overflow-hidden">
              <pre className="text-xs font-mono text-slate-800 whitespace-pre-wrap overflow-x-auto leading-relaxed">
                {data.content}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
