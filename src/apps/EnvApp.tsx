import React, { useState, useEffect, useCallback } from 'react';
import {
  Key,
  Shield,
  ChevronLeft,
  Save,
  Plus,
  Trash2,
  Check,
  RefreshCw,
  Database,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { fsRead, fsWrite } from '../hooks/useFs';
import { usePackageManager } from '../hooks/usePackageManager';
import { useUiFeedback } from '../components/UiFeedback';

interface EnvVar {
  id: string;
  key: string;
  value: string;
  isNew?: boolean;
}

const PG_ROUTING_KEYS = [
  'DATABASE_URL',
  'DATABASE_URL_LOCAL',
  'DATABASE_URL_TEST',
  'USE_DB_TEST',
  'USE_PROD_DB',
];

function isLikelySecret(key: string) {
  const upper = key.toUpperCase();
  return (
    upper.includes('SECRET') ||
    upper.includes('KEY') ||
    upper.includes('PASS') ||
    upper.includes('TOKEN') ||
    upper.includes('URL')
  );
}

function extractLocalDbFromDsn(dsn?: string): string {
  if (!dsn) return '';
  if (['username', 'password', 'localhost:port', 'namedb'].some((p) => dsn.includes(p))) {
    return '';
  }
  try {
    const parsed = new URL(dsn);
    const db = parsed.pathname.replace(/^\/+/, '').split('/')[0];
    return /^[a-zA-Z0-9_-]{1,63}$/.test(db) ? db : '';
  } catch {
    return '';
  }
}

export default function EnvApp({ onClose }: { onClose?: () => void }) {
  const { toast } = useUiFeedback();
  const [packageManager] = usePackageManager();
  const [activeTab, setActiveTab] = useState<'ui' | 'raw'>('ui');
  const [envRaw, setEnvRaw] = useState<string>('');
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live PGlite database registry state
  const [activeDb, setActiveDb] = useState('postgres');
  const [databases, setDatabases] = useState<string[]>(['postgres']);
  const [hasPlaceholders, setHasPlaceholders] = useState(false);
  const [localDb, setLocalDb] = useState('postgres');
  const [testDb, setTestDb] = useState('concordia_test');
  const [useDbTest, setUseDbTest] = useState(false);
  const [useProdDb, setUseProdDb] = useState(false);
  const [newDbInput, setNewDbInput] = useState('');
  const [syncingDb, setSyncingDb] = useState(false);

  const parseEnv = useCallback((content: string) => {
    const lines = content.split('\n');
    const vars: EnvVar[] = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const separatorIdx = trimmed.indexOf('=');
        if (separatorIdx > 0) {
          const key = trimmed.substring(0, separatorIdx).trim();
          let value = trimmed.substring(separatorIdx + 1).trim();

          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.substring(1, value.length - 1);
          }

          vars.push({ id: `var_${index}_${key}`, key, value });
        }
      }
    });

    setEnvVars(vars);
  }, []);

  const fetchPgState = useCallback(async () => {
    try {
      const res = await fetch('/api/pg-databases');
      if (!res.ok) return;
      const data = await res.json();
      setActiveDb(data.activeDb || 'postgres');
      setDatabases(Array.isArray(data.databases) ? data.databases : ['postgres']);
      if (data.env) {
        setHasPlaceholders(Boolean(data.env.hasPlaceholders));
        setUseDbTest(Boolean(data.env.useDbTest));
        setUseProdDb(Boolean(data.env.useProdDb));
        setLocalDb(extractLocalDbFromDsn(data.env.databaseUrlLocal) || 'postgres');
        setTestDb(extractLocalDbFromDsn(data.env.databaseUrlTest) || 'concordia_test');
      }
    } catch {
      // ignore
    }
  }, []);

  const loadEnv = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const content = await fsRead('.env');
      setEnvRaw(content);
      parseEnv(content);
      setDirty(false);
    } catch (err: any) {
      if (err.status === 404 || err.message === 'File not found') {
        try {
          const example = await fsRead('.env.example');
          setEnvRaw(example);
          parseEnv(example);
          setDirty(true);
          toast('Loaded defaults from .env.example (save to create .env)', 'info');
        } catch {
          setEnvRaw('');
          setEnvVars([]);
        }
      } else {
        setError('Failed to load .env: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [parseEnv, toast]);

  useEffect(() => {
    loadEnv();
    fetchPgState();
  }, [loadEnv, fetchPgState]);

  const generateRawFromVars = (vars: EnvVar[]) => {
    return vars
      .filter((v) => v.key.trim() !== '')
      .map((v) => {
        const needsQuotes = /[\s#]/.test(v.value) && !v.value.startsWith('"');
        return `${v.key}=${needsQuotes ? `"${v.value}"` : v.value}`;
      })
      .join('\n');
  };

  const duplicateKeys = (() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const v of envVars) {
      const k = v.key.trim();
      if (!k) continue;
      if (seen.has(k)) dupes.add(k);
      seen.add(k);
    }
    return Array.from(dupes);
  })();

  const handleSave = async () => {
    if (activeTab === 'ui' && duplicateKeys.length > 0) {
      toast(`Duplicate key(s): ${duplicateKeys.join(', ')}`, 'error');
      return;
    }
    try {
      setSaving(true);
      setError(null);

      const contentToSave = activeTab === 'raw' ? envRaw : generateRawFromVars(envVars);
      await fsWrite('.env', contentToSave, true);

      if (activeTab === 'raw') {
        parseEnv(envRaw);
      } else {
        setEnvRaw(contentToSave);
      }

      await fetchPgState();
      setDirty(false);
      setSavedNotice(true);
      toast('.env saved cleanly', 'success');
      setTimeout(() => setSavedNotice(false), 2500);
    } catch (err: any) {
      setError('Failed to save .env: ' + err.message);
      toast('Failed to save .env', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncPostgresEnv = async (override?: {
    localDb?: string;
    testDb?: string;
    useDbTest?: boolean;
    useProdDb?: boolean;
  }) => {
    const targetLocal = (override?.localDb ?? localDb).trim() || 'postgres';
    const targetTest = (override?.testDb ?? testDb).trim() || 'concordia_test';
    const targetUseTest = override?.useDbTest ?? useDbTest;
    const targetUseProd = override?.useProdDb ?? useProdDb;

    setSyncingDb(true);
    try {
      const res = await fetch('/api/pg-databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync-env',
          localDb: targetLocal,
          testDb: targetTest,
          useDbTest: targetUseTest,
          useProdDb: targetUseProd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sync Postgres .env');
      await loadEnv();
      await fetchPgState();
      toast(`.env updated (comments preserved) · Active DB: ${data.activeDb}`, 'success');
    } catch (e: any) {
      toast(e.message || 'Postgres .env sync failed', 'error');
    } finally {
      setSyncingDb(false);
    }
  };

  const handleCreateDbInline = async () => {
    const clean = newDbInput.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!clean) {
      toast('Enter a valid DB name (letters, numbers, _, -)', 'error');
      return;
    }
    setSyncingDb(true);
    try {
      const res = await fetch('/api/pg-databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: clean,
          switchActive: true,
          bindEnvKeys: useDbTest
            ? ['DATABASE_URL', 'DATABASE_URL_TEST']
            : ['DATABASE_URL', 'DATABASE_URL_LOCAL'],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      setNewDbInput('');
      await loadEnv();
      await fetchPgState();
      toast(`Created "${clean}" & bound in .env`, 'success');
    } catch (e: any) {
      toast(e.message || 'Failed to create DB', 'error');
    } finally {
      setSyncingDb(false);
    }
  };

  const addVar = () => {
    const id = `new_${Date.now()}`;
    setEnvVars((prev) => [...prev, { id, key: '', value: '', isNew: true }]);
    setRevealedIds((prev) => new Set(prev).add(id));
    setDirty(true);
  };

  const removeVar = (id: string) => {
    setEnvVars((prev) => prev.filter((v) => v.id !== id));
    setDirty(true);
  };

  const updateVar = (id: string, field: 'key' | 'value', value: string) => {
    setEnvVars((prev) => prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)));
    setDirty(true);
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRestart = async () => {
    try {
      setRestarting(true);
      await fetch('/api/dev-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      await new Promise((r) => setTimeout(r, 800));
      const res = await fetch('/api/dev-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', packageManager }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to restart');
      toast(`Astro dev server restarted (${packageManager})`, 'success');
    } catch (e: any) {
      toast(e.message || 'Restart failed (check Workspace -> Install)', 'error');
    } finally {
      setRestarting(false);
    }
  };

  const regularVars = envVars.filter((v) => !PG_ROUTING_KEYS.includes(v.key));

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 py-3 flex items-center justify-between border-b border-slate-200 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Secrets &amp; .env</h1>
          </div>
          {dirty && <span className="text-xs font-medium text-amber-700 ml-2">Unsaved</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestart}
            disabled={saving || restarting || loading}
            title={`Restart Astro Dev Server (${packageManager})`}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 min-h-[38px]"
          >
            <RefreshCw size={14} className={restarting ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Restart Astro</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 min-h-[38px]"
          >
            {savedNotice ? <Check size={15} /> : <Save size={15} />}
            <span>{savedNotice ? 'Saved' : saving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>

      <div className="px-4 py-2.5 bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto flex gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => {
              if (activeTab === 'raw') parseEnv(envRaw);
              setActiveTab('ui');
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'ui' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Structured Editor
          </button>
          <button
            onClick={() => {
              if (activeTab === 'ui') setEnvRaw(generateRawFromVars(envVars));
              setActiveTab('raw');
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'raw' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Raw .env
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-3xl mx-auto">
          {error && (
            <div className="p-3 mb-4 text-sm text-red-700 bg-red-50 rounded-xl border border-red-200 break-words">
              {error}
            </div>
          )}

          {duplicateKeys.length > 0 && activeTab === 'ui' && (
            <div className="p-3 mb-4 text-xs text-amber-800 bg-amber-50 rounded-xl border border-amber-200 flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0" />
              Duplicate variable keys detected: <strong className="font-mono">{duplicateKeys.join(', ')}</strong>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="animate-spin text-slate-400" />
            </div>
          ) : activeTab === 'ui' ? (
            <div className="space-y-6 pb-12">
              {/* PostgreSQL Database Routing & On-the-Fly Creation */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-slate-900">
                    <Database size={18} className="text-indigo-600" />
                    <h3 className="font-semibold text-sm">PostgreSQL Routing (.env &harr; PGlite)</h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-600">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Active DB: {activeDb}
                  </div>
                </div>

                {hasPlaceholders && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-amber-900">
                      Placeholder URLs detected in <code className="font-mono">.env</code>. Bind local PGlite now so{' '}
                      <code className="font-mono">db:check</code> &amp; Drizzle work immediately.
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleSyncPostgresEnv({
                          localDb: localDb || 'postgres',
                          testDb: testDb || 'concordia_test',
                          useDbTest,
                          useProdDb: false,
                        })
                      }
                      disabled={syncingDb}
                      className="px-3 py-1.5 bg-amber-900 text-white text-xs font-medium rounded-lg hover:bg-amber-800 disabled:opacity-50"
                    >
                      Fix Placeholders
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      DATABASE_URL_LOCAL
                    </label>
                    <select
                      value={databases.includes(localDb) ? localDb : '__custom'}
                      onChange={(e) => {
                        if (e.target.value !== '__custom') setLocalDb(e.target.value);
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-mono text-slate-800 outline-none focus:border-indigo-500 mb-1.5"
                    >
                      {databases.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                      {!databases.includes(localDb) && <option value="__custom">{localDb} (new)</option>}
                    </select>
                    <input
                      type="text"
                      value={localDb}
                      onChange={(e) => setLocalDb(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                      placeholder="postgres"
                      className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-mono text-slate-600 outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      DATABASE_URL_TEST
                    </label>
                    <select
                      value={databases.includes(testDb) ? testDb : '__custom'}
                      onChange={(e) => {
                        if (e.target.value !== '__custom') setTestDb(e.target.value);
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-mono text-slate-800 outline-none focus:border-indigo-500 mb-1.5"
                    >
                      {databases.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                      {!databases.includes(testDb) && <option value="__custom">{testDb} (new)</option>}
                    </select>
                    <input
                      type="text"
                      value={testDb}
                      onChange={(e) => setTestDb(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                      placeholder="concordia_test"
                      className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-mono text-slate-600 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Flags + Apply */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setUseDbTest((v) => !v)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        useDbTest
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      USE_DB_TEST={useDbTest ? 'true' : 'false'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseProdDb((v) => !v)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        useProdDb
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      USE_PROD_DB={useProdDb ? 'true' : 'false'}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSyncPostgresEnv()}
                    disabled={syncingDb}
                    className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {syncingDb ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    Sync .env &amp; Activate DB
                  </button>
                </div>

                {/* Inline quick-create DB */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newDbInput}
                    onChange={(e) => setNewDbInput(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                    placeholder="Create new DB on the fly (e.g. staging_db)..."
                    className="flex-1 min-w-[200px] bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleCreateDbInline}
                    disabled={syncingDb || !newDbInput.trim()}
                    className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                  >
                    <Plus size={13} />
                    Create &amp; Bind DB
                  </button>
                </div>

                {/* Live readout of resolved keys */}
                <div className="space-y-1.5 pt-1">
                  {PG_ROUTING_KEYS.map((key) => {
                    const found = envVars.find((ev) => ev.key === key);
                    if (!found) return null;
                    return (
                      <div
                        key={key}
                        className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                      >
                        <span className="font-mono text-xs font-semibold text-slate-700">{found.key}</span>
                        <span className="text-xs font-mono text-slate-500 truncate">{found.value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Application Environment Variables */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-slate-900">
                    Environment Variables ({regularVars.length})
                  </h3>
                  <button
                    onClick={addVar}
                    className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Plus size={14} />
                    Add Variable
                  </button>
                </div>

                {regularVars.length === 0 ? (
                  <div className="text-center py-10 px-4 border border-dashed border-slate-300 rounded-2xl bg-white">
                    <Shield className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                    <p className="text-sm text-slate-500">No custom environment variables defined.</p>
                  </div>
                ) : (
                  regularVars.map((v) => {
                    const secret = isLikelySecret(v.key);
                    const revealed = !secret || revealedIds.has(v.id);
                    return (
                      <div
                        key={v.id}
                        className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col gap-2.5"
                      >
                        <div className="flex justify-between items-center gap-2">
                          <input
                            type="text"
                            value={v.key}
                            onChange={(e) =>
                              updateVar(v.id, 'key', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))
                            }
                            placeholder="VARIABLE_NAME"
                            autoFocus={v.isNew}
                            className="font-mono text-xs font-semibold text-slate-900 bg-transparent outline-none w-full placeholder:text-slate-400"
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            {secret && (
                              <button
                                type="button"
                                onClick={() => toggleReveal(v.id)}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                                aria-label={revealed ? 'Hide value' : 'Reveal value'}
                              >
                                {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeVar(v.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                              aria-label="Delete variable"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                        <div className="relative">
                          <Key size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type={revealed ? 'text' : 'password'}
                            value={v.value}
                            onChange={(e) => updateVar(v.id, 'value', e.target.value)}
                            placeholder="Value..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-8 pr-3 text-sm font-mono text-slate-800 outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                Comments and blank lines are preserved in Raw mode (and when using Sync .env above), but stripped if you save from Structured Editor.
              </div>
              <textarea
                value={envRaw}
                onChange={(e) => {
                  setEnvRaw(e.target.value);
                  setDirty(true);
                }}
                className="w-full bg-slate-900 text-slate-200 font-mono text-xs p-4 rounded-xl outline-none focus:ring-2 ring-indigo-500 min-h-[420px] leading-relaxed"
                spellCheck="false"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
