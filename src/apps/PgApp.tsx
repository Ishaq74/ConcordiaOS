import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Play,
  ChevronLeft,
  RefreshCw,
  Terminal,
  Download,
  Trash2,
  Table as TableIcon,
  Columns,
  Hash,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Eraser,
  RotateCcw,
} from 'lucide-react';
import { execCmd, FsApiError } from '../hooks/useFs';
import {
  PACKAGE_MANAGERS,
  buildPmRunCommand,
  stripAnsi,
  usePackageManager,
} from '../hooks/usePackageManager';
import { useUiFeedback } from '../components/UiFeedback';

interface PgEnvInfo {
  useDbTest: boolean;
  useProdDb: boolean;
  databaseUrl: string;
  databaseUrlLocal: string;
  databaseUrlTest: string;
  databaseUrlProd: string;
  hasPlaceholders: boolean;
}

const SCRIPT_ORDER = [
  'db:check',
  'db:migrate',
  'db:seed',
  'db:generate',
  'db:compare',
  'syncdb:dev-to-prod',
  'syncdb:prod-to-dev',
];

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

export default function PgApp({ onClose }: { onClose?: () => void }) {
  const { toast, confirm } = useUiFeedback();
  const [packageManager, setPackageManager] = usePackageManager();

  const [query, setQuery] = useState(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
  );
  const [resultRows, setResultRows] = useState<Record<string, any>[] | null>(null);
  const [resultFields, setResultFields] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-database & .env sync state
  const [activeDb, setActiveDb] = useState<string>('postgres');
  const [databases, setDatabases] = useState<string[]>(['postgres']);
  const [envInfo, setEnvInfo] = useState<PgEnvInfo | null>(null);
  const [newDbName, setNewDbName] = useState('');
  const [bindNewDbToEnv, setBindNewDbToEnv] = useState(true);
  const [dbActionBusy, setDbActionBusy] = useState(false);

  // Inline .env routing form state
  const [envLocalDb, setEnvLocalDb] = useState('postgres');
  const [envTestDb, setEnvTestDb] = useState('concordia_test');
  const [envUseDbTest, setEnvUseDbTest] = useState(false);
  const [envUseProdDb, setEnvUseProdDb] = useState(false);

  const [tables, setTables] = useState<string[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);

  const [dbScripts, setDbScripts] = useState<{ name: string; command: string }[]>([]);
  const [scriptLogs, setScriptLogs] = useState<string[]>([]);
  const [runningScript, setRunningScript] = useState<string | null>(null);
  const [queryMode, setQueryMode] = useState<'sql' | 'build'>('sql');
  const [bAction, setBAction] = useState('SELECT *');
  const [bTable, setBTable] = useState('');
  const [bLimit, setBLimit] = useState('25');

  const generateBuilderQuery = useCallback(() => {
    if (!bTable) return '';
    const safeTable = bTable.replace(/"/g, '""');
    if (bAction === 'SELECT *') {
      const limitNum = parseInt(bLimit, 10);
      return `SELECT * FROM "${safeTable}"${Number.isFinite(limitNum) && limitNum > 0 ? ` LIMIT ${limitNum}` : ''};`;
    }
    if (bAction === 'COUNT') return `SELECT count(*) AS total FROM "${safeTable}";`;
    if (bAction === 'COLUMNS') {
      return `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${bTable.replace(/'/g, "''")}' ORDER BY ordinal_position;`;
    }
    if (bAction === 'TRUNCATE') return `TRUNCATE TABLE "${safeTable}" RESTART IDENTITY CASCADE;`;
    if (bAction === 'DROP') return `DROP TABLE IF EXISTS "${safeTable}" CASCADE;`;
    return '';
  }, [bAction, bTable, bLimit]);

  useEffect(() => {
    if (queryMode === 'build') {
      const q = generateBuilderQuery();
      if (q) setQuery(q);
    }
  }, [queryMode, generateBuilderQuery]);

  const fetchDatabases = useCallback(async () => {
    try {
      const res = await fetch('/api/pg-databases');
      if (!res.ok) return;
      const data = await res.json();
      setActiveDb(data.activeDb || 'postgres');
      setDatabases(Array.isArray(data.databases) ? data.databases : ['postgres']);
      if (data.env) {
        const e: PgEnvInfo = data.env;
        setEnvInfo(e);
        setEnvUseDbTest(e.useDbTest);
        setEnvUseProdDb(e.useProdDb);
        setEnvLocalDb(extractLocalDbFromDsn(e.databaseUrlLocal) || 'postgres');
        setEnvTestDb(extractLocalDbFromDsn(e.databaseUrlTest) || 'concordia_test');
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchSchema = useCallback(async () => {
    setSchemaLoading(true);
    try {
      const resT = await fetch('/api/pg-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query:
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;",
          rowMode: 'object',
        }),
      });
      if (resT.ok) {
        const dataT = await resT.json();
        const list = (dataT.result || []).map((r: any) => r.table_name).filter(Boolean);
        setTables(list);
        setBTable((prev) => (prev && list.includes(prev) ? prev : list[0] || ''));
      } else {
        setTables([]);
      }
    } catch (e) {
      console.error('Failed to fetch schema', e);
    } finally {
      setSchemaLoading(false);
    }
  }, []);

  const loadScripts = useCallback(async () => {
    try {
      const res = await fetch('/api/package-scripts');
      if (res.ok) {
        const data = await res.json();
        if (data.scripts) {
          const dbs = Object.entries(data.scripts)
            .filter(([key]) => key.startsWith('db:') || key.startsWith('syncdb:'))
            .map(([key, value]) => ({ name: key, command: String(value) }))
            .sort((a, b) => {
              const ia = SCRIPT_ORDER.indexOf(a.name);
              const ib = SCRIPT_ORDER.indexOf(b.name);
              if (ia >= 0 && ib >= 0) return ia - ib;
              if (ia >= 0) return -1;
              if (ib >= 0) return 1;
              return a.name.localeCompare(b.name);
            });
          setDbScripts(dbs);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchDatabases();
    loadScripts();
    fetchSchema();
  }, [fetchDatabases, loadScripts, fetchSchema]);

  const handleCreateDb = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newDbName.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!clean) {
      toast('Enter a valid database name (letters, numbers, _, -)', 'error');
      return;
    }
    setDbActionBusy(true);
    try {
      const bindEnvKeys = bindNewDbToEnv
        ? envUseDbTest
          ? ['DATABASE_URL', 'DATABASE_URL_TEST']
          : ['DATABASE_URL', 'DATABASE_URL_LOCAL']
        : [];
      const res = await fetch('/api/pg-databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: clean,
          switchActive: true,
          bindEnvKeys,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create database');
      setNewDbName('');
      setResultRows(null);
      setError(null);
      await fetchDatabases();
      await fetchSchema();
      toast(
        bindNewDbToEnv
          ? `Database "${clean}" created, active & bound in .env`
          : `Database "${clean}" created and active`,
        'success'
      );
    } catch (err: any) {
      toast(err.message || 'Database creation failed', 'error');
    } finally {
      setDbActionBusy(false);
    }
  };

  const handleSwitchDb = async (name: string) => {
    if (name === activeDb || dbActionBusy) return;
    setDbActionBusy(true);
    try {
      const res = await fetch('/api/pg-databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'switch', name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to switch database');
      setResultRows(null);
      setResultFields([]);
      setError(null);
      await fetchDatabases();
      await fetchSchema();
      toast(`Switched active database to "${name}"`, 'success');
    } catch (err: any) {
      toast(err.message || 'Switch failed', 'error');
    } finally {
      setDbActionBusy(false);
    }
  };

  const handleDeleteDb = async (name: string) => {
    if (name === 'postgres') return;
    const ok = await confirm({
      title: `Drop database "${name}"?`,
      message: `All tables and data inside "${name}" will be permanently deleted from concordia_repo/pg-databases.`,
      confirmLabel: 'Drop Database',
      danger: true,
    });
    if (!ok) return;

    setDbActionBusy(true);
    try {
      const res = await fetch('/api/pg-databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete database');
      setResultRows(null);
      await fetchDatabases();
      await fetchSchema();
      toast(`Database "${name}" dropped`, 'info');
    } catch (err: any) {
      toast(err.message || 'Drop failed', 'error');
    } finally {
      setDbActionBusy(false);
    }
  };

  const handleSyncEnv = async (opts?: {
    localDb?: string;
    testDb?: string;
    useDbTest?: boolean;
    useProdDb?: boolean;
  }) => {
    const localDb = (opts?.localDb ?? envLocalDb).trim() || 'postgres';
    const testDb = (opts?.testDb ?? envTestDb).trim() || 'concordia_test';
    const useDbTest = opts?.useDbTest ?? envUseDbTest;
    const useProdDb = opts?.useProdDb ?? envUseProdDb;

    setDbActionBusy(true);
    try {
      const res = await fetch('/api/pg-databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync-env',
          localDb,
          testDb,
          useDbTest,
          useProdDb,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sync .env');
      await fetchDatabases();
      await fetchSchema();
      toast(`.env synchronized · Active DB: ${data.activeDb}`, 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to update .env', 'error');
    } finally {
      setDbActionBusy(false);
    }
  };

  const handleRunQuery = async (overrideQuery?: string, autoCreateDb = false) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;

    const upper = q.toUpperCase();
    if (!autoCreateDb && /\b(DROP|TRUNCATE)\b/.test(upper)) {
      const ok = await confirm({
        title: 'Confirm Destructive SQL',
        message: `Execute on "${activeDb}": ${q.slice(0, 120)}`,
        confirmLabel: 'Execute',
        danger: true,
      });
      if (!ok) return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/pg-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, rowMode: 'object', autoCreateDb }),
      });
      const data = await res.json();

      if (res.status === 404 && data.needsCreation && data.dbName && !autoCreateDb) {
        setLoading(false);
        const createIt = await confirm({
          title: `Create database "${data.dbName}"?`,
          message: `Database "${data.dbName}" does not exist yet. Create it on PGlite and run your query?`,
          confirmLabel: 'Create & Run',
        });
        if (createIt) {
          await handleRunQuery(q, true);
          await fetchDatabases();
        }
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Failed to execute query');

      const rows: Record<string, any>[] = Array.isArray(data.result) ? data.result : [];
      const fields: string[] =
        Array.isArray(data.fields) && data.fields.length > 0
          ? data.fields
          : rows.length > 0
          ? Object.keys(rows[0])
          : [];

      setResultRows(rows);
      setResultFields(fields);
      setRowCount(data.rowCount ?? rows.length);

      if (data.databaseCreated || data.databaseDropped) {
        await fetchDatabases();
        await fetchSchema();
        toast(
          data.databaseCreated
            ? `Database "${data.databaseCreated}" created`
            : `Database "${data.databaseDropped}" dropped`,
          'success'
        );
      } else if (/\b(CREATE|ALTER|DROP|TRUNCATE)\b/.test(upper)) {
        await fetchSchema();
      }
    } catch (e: any) {
      setError(e.message || 'Query execution failed');
      setResultRows(null);
      setResultFields([]);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPublicSchema = async () => {
    const ok = await confirm({
      title: `Reset public schema on "${activeDb}"?`,
      message: `Drops and recreates schema "public" in "${activeDb}" so you can run db:migrate and db:seed cleanly.`,
      confirmLabel: 'Reset Schema',
      danger: true,
    });
    if (!ok) return;
    await handleRunQuery('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    toast(`Public schema reset on "${activeDb}"`, 'success');
  };

  const runScript = async (scriptName: string) => {
    if (runningScript) return;
    if (scriptName === 'syncdb:dev-to-prod') {
      const ok = await confirm({
        title: 'Run syncdb:dev-to-prod?',
        message: 'This script compares and prompts to sync data against DATABASE_URL_PROD. Ensure your .env PROD URL is valid.',
        confirmLabel: 'Run Script',
        danger: true,
      });
      if (!ok) return;
    }

    setRunningScript(scriptName);
    const { cmd, args, display } = buildPmRunCommand(packageManager, scriptName);
    setScriptLogs((prev) => [...prev, `> ${display} (db: ${activeDb})`]);

    try {
      const res = await execCmd(cmd, args);
      if (res.stdout) setScriptLogs((prev) => [...prev, stripAnsi(res.stdout).trimEnd()]);
      if (res.stderr) setScriptLogs((prev) => [...prev, stripAnsi(res.stderr).trimEnd()]);
      setScriptLogs((prev) => [...prev, `[DONE] ${scriptName} completed (exit 0)`]);
      toast(`${scriptName} finished cleanly`, 'success');
      fetchSchema();
    } catch (e: any) {
      if (e instanceof FsApiError) {
        if (e.stdout) setScriptLogs((prev) => [...prev, stripAnsi(e.stdout!).trimEnd()]);
        if (e.stderr) setScriptLogs((prev) => [...prev, stripAnsi(e.stderr!).trimEnd()]);
      }
      setScriptLogs((prev) => [...prev, `[ERR] ${stripAnsi(e.message)}`]);
      toast(`${scriptName} failed — inspect Terminal Output`, 'error');
    } finally {
      setRunningScript(null);
    }
  };

  const exportCsv = () => {
    if (!resultRows || resultRows.length === 0 || resultFields.length === 0) return;
    const escapeCell = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };
    const csv = [
      resultFields.map(escapeCell).join(','),
      ...resultRows.map((row) => resultFields.map((f) => escapeCell(row[f])).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDb}-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported CSV', 'success');
  };

  const formatCellValue = (val: any) => {
    if (val === null || val === undefined) {
      return <span className="text-slate-400 italic">null</span>;
    }
    if (typeof val === 'boolean') {
      return <span className="font-mono text-xs text-indigo-700">{val ? 'true' : 'false'}</span>;
    }
    if (typeof val === 'object') {
      return <span className="font-mono text-xs text-slate-700">{JSON.stringify(val)}</span>;
    }
    return String(val);
  };

  const boundLocalDb = extractLocalDbFromDsn(envInfo?.databaseUrlLocal);
  const boundTestDb = extractLocalDbFromDsn(envInfo?.databaseUrlTest);
  const activeDsn = `postgresql://postgres:postgres@127.0.0.1:5432/${activeDb}`;

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {/* Top Bar */}
      <div className="bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
              aria-label="Back"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900 truncate">Postgres Engine</h1>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden md:flex items-center gap-2 text-xs font-medium text-slate-700 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>
              {activeDb} · 127.0.0.1:5432
            </span>
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

          <button
            onClick={() => {
              fetchDatabases();
              loadScripts();
              fetchSchema();
              toast('PostgreSQL state refreshed', 'info');
            }}
            title="Refresh databases, .env and schema"
            className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <RefreshCw size={15} className={schemaLoading || dbActionBusy ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* Direct .env & Target DB Sync Bar */}
        <div
          className={`rounded-2xl border p-3.5 transition-colors ${
            envInfo?.hasPlaceholders
              ? 'bg-amber-50 border-amber-300'
              : 'bg-white border-slate-200'
          }`}
        >
          {envInfo?.hasPlaceholders && (
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-amber-200">
              <div className="flex items-center gap-2 text-xs text-amber-900">
                <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                <span>
                  <strong>concordia_repo/.env</strong> contains placeholder URLs (
                  <code className="font-mono">username:password@localhost:port/namedb</code>).{' '}
                  <code className="font-mono">db:check</code> and direct PG connections require local PGlite URLs.
                </span>
              </div>
              <button
                onClick={() =>
                  handleSyncEnv({
                    localDb: envLocalDb || 'postgres',
                    testDb: envTestDb || 'concordia_test',
                    useDbTest: envUseDbTest,
                    useProdDb: false,
                  })
                }
                disabled={dbActionBusy}
                className="px-3 py-1.5 bg-amber-900 text-white text-xs font-medium rounded-lg hover:bg-amber-800 transition-colors disabled:opacity-50 shrink-0"
              >
                Fix .env & Bind PGlite
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[150px] flex-1">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                DATABASE_URL_LOCAL
              </label>
              <input
                type="text"
                value={envLocalDb}
                onChange={(e) => setEnvLocalDb(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                list="pg-db-options"
                placeholder="postgres"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
              />
            </div>

            <div className="min-w-[150px] flex-1">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                DATABASE_URL_TEST
              </label>
              <input
                type="text"
                value={envTestDb}
                onChange={(e) => setEnvTestDb(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                list="pg-db-options"
                placeholder="concordia_test"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
              />
            </div>

            <datalist id="pg-db-options">
              {databases.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEnvUseDbTest((v) => !v)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  envUseDbTest
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                USE_DB_TEST={envUseDbTest ? 'true' : 'false'}
              </button>
              <button
                type="button"
                onClick={() => setEnvUseProdDb((v) => !v)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  envUseProdDb
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                USE_PROD_DB={envUseProdDb ? 'true' : 'false'}
              </button>
            </div>

            <button
              onClick={() => handleSyncEnv()}
              disabled={dbActionBusy}
              className="px-3.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <CheckCircle2 size={13} />
              Apply .env & Switch
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
          {/* Left Sidebar: Databases + Public Tables */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            {/* On-the-fly Databases Manager */}
            <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-col">
              <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Database size={15} className="text-indigo-600" />
                  <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Databases ({databases.length})
                  </h2>
                </div>
              </div>

              <form onSubmit={handleCreateDb} className="space-y-2 mb-3">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newDbName}
                    onChange={(e) => setNewDbName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                    placeholder="new_db_name"
                    className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={dbActionBusy || !newDbName.trim()}
                    className="px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1 shrink-0"
                  >
                    <Plus size={13} />
                    Create
                  </button>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={bindNewDbToEnv}
                    onChange={(e) => setBindNewDbToEnv(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Switch active & update .env ({envUseDbTest ? 'TEST' : 'LOCAL'})
                </label>
              </form>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                {databases.map((db) => {
                  const isActive = db === activeDb;
                  const tags: string[] = [];
                  if (boundLocalDb === db) tags.push('LOCAL');
                  if (boundTestDb === db) tags.push('TEST');

                  return (
                    <div
                      key={db}
                      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border transition-colors ${
                        isActive
                          ? 'border-indigo-500 bg-indigo-50/60'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSwitchDb(db)}
                        disabled={dbActionBusy}
                        className="flex-1 min-w-0 flex items-center gap-2 text-left"
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isActive ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        />
                        <span className="text-xs font-mono font-semibold text-slate-800 truncate">
                          {db}
                        </span>
                        {tags.length > 0 && (
                          <span className="text-[10px] font-mono text-indigo-700 shrink-0">
                            {tags.join('/')}
                          </span>
                        )}
                      </button>

                      {db !== 'postgres' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteDb(db)}
                          disabled={dbActionBusy}
                          title={`Drop ${db}`}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors shrink-0"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Public Tables */}
            <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-col flex-1 min-h-[220px]">
              <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <TableIcon size={15} className="text-indigo-600" />
                  <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Tables ({tables.length})
                  </h2>
                </div>
                <div className="flex items-center gap-1">
                  {tables.length > 0 && (
                    <button
                      onClick={handleResetPublicSchema}
                      className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                      title="Reset public schema"
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                  <button
                    onClick={fetchSchema}
                    className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                    title="Reload tables"
                  >
                    <RefreshCw size={13} className={schemaLoading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 max-h-[380px]">
                {tables.length === 0 ? (
                  <div className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-xl text-center">
                    No tables in "{activeDb}". Run <span className="font-mono">db:migrate</span>.
                  </div>
                ) : (
                  tables.map((t) => (
                    <div key={t} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                      <div className="px-2.5 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-800 font-mono truncate">{t}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => {
                              const q = `TRUNCATE TABLE "${t.replace(/"/g, '""')}" RESTART IDENTITY CASCADE;`;
                              setQuery(q);
                              handleRunQuery(q);
                            }}
                            title={`Truncate ${t}`}
                            className="p-1 text-slate-400 hover:text-amber-600 rounded transition-colors"
                          >
                            <Eraser size={11} />
                          </button>
                          <button
                            onClick={() => {
                              const q = `DROP TABLE IF EXISTS "${t.replace(/"/g, '""')}" CASCADE;`;
                              setQuery(q);
                              handleRunQuery(q);
                            }}
                            title={`Drop ${t}`}
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 divide-x divide-slate-100 text-[11px] font-medium">
                        <button
                          onClick={() => {
                            setQueryMode('sql');
                            const q = `SELECT * FROM "${t.replace(/"/g, '""')}" LIMIT 25;`;
                            setQuery(q);
                            handleRunQuery(q);
                          }}
                          className="py-1.5 text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1"
                        >
                          Data
                        </button>
                        <button
                          onClick={() => {
                            setQueryMode('sql');
                            const q = `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${t.replace(/'/g, "''")}' ORDER BY ordinal_position;`;
                            setQuery(q);
                            handleRunQuery(q);
                          }}
                          className="py-1.5 text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1"
                        >
                          <Columns size={11} />
                          Cols
                        </button>
                        <button
                          onClick={() => {
                            setQueryMode('sql');
                            const q = `SELECT count(*) AS total_rows FROM "${t.replace(/"/g, '""')}";`;
                            setQuery(q);
                            handleRunQuery(q);
                          }}
                          className="py-1.5 text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1"
                        >
                          <Hash size={11} />
                          Count
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Center Col: Query + Results */}
          <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-4 flex flex-col min-h-[420px]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Database size={16} className="text-indigo-600" />
                SQL Runner — <span className="font-mono text-indigo-700">{activeDb}</span>
              </h2>
              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  onClick={() => setQueryMode('sql')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    queryMode === 'sql' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Raw SQL
                </button>
                <button
                  onClick={() => setQueryMode('build')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    queryMode === 'build' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Query Builder
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-600 mb-3 font-mono bg-slate-50 px-2.5 py-1.5 rounded-lg truncate border border-slate-200">
              {activeDsn}
            </div>

            {queryMode === 'build' ? (
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Action</label>
                    <select
                      value={bAction}
                      onChange={(e) => setBAction(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs outline-none focus:border-indigo-500 bg-white"
                    >
                      <option value="SELECT *">SELECT *</option>
                      <option value="COUNT">COUNT (*)</option>
                      <option value="COLUMNS">INSPECT COLUMNS</option>
                      <option value="TRUNCATE">TRUNCATE CASCADE</option>
                      <option value="DROP">DROP TABLE CASCADE</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Table</label>
                    <select
                      value={bTable}
                      onChange={(e) => setBTable(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs outline-none focus:border-indigo-500 bg-white"
                    >
                      <option value="">-- Select Table --</option>
                      {tables.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  {bAction === 'SELECT *' && (
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">Limit</label>
                      <input
                        type="number"
                        value={bLimit}
                        onChange={(e) => setBLimit(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs outline-none focus:border-indigo-500 bg-white tabular-nums"
                        min={1}
                        max={500}
                      />
                    </div>
                  )}
                </div>
                <div className="font-mono text-xs text-indigo-700 bg-indigo-50 p-2.5 rounded-lg break-all border border-indigo-100">
                  {generateBuilderQuery() || 'Select a table to generate SQL.'}
                </div>
              </div>
            ) : (
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleRunQuery();
                  }
                }}
                className="w-full h-32 bg-slate-900 text-emerald-400 font-mono text-xs p-3 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 resize-y leading-relaxed"
                placeholder="CREATE DATABASE analytics;  -- or SELECT * FROM users LIMIT 10;"
                spellCheck={false}
              />
            )}

            <div className="flex items-center justify-between mt-3 gap-2">
              <span className="text-[11px] text-slate-400">
                Supports CREATE/DROP DATABASE &amp; Ctrl/Cmd+Enter
              </span>
              <button
                onClick={() => handleRunQuery(queryMode === 'build' ? generateBuilderQuery() : undefined)}
                disabled={loading || (queryMode === 'build' && !bTable)}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {loading ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                Run Query
              </button>
            </div>

            <div className="mt-4 flex-1 min-h-0 flex flex-col border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider tabular-nums">
                  Results {resultRows ? `(${rowCount} rows)` : ''}
                </h3>
                {resultRows && resultRows.length > 0 && (
                  <button
                    onClick={exportCsv}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                  >
                    <Download size={13} />
                    Export CSV
                  </button>
                )}
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 font-mono whitespace-pre-wrap">
                  {error}
                </div>
              )}

              {!error && resultRows && (
                <div className="flex-1 min-h-[180px] max-h-[380px] overflow-auto bg-white rounded-xl border border-slate-200">
                  {resultRows.length === 0 ? (
                    <div className="p-6 text-xs text-slate-500 text-center">
                      Query executed cleanly (0 rows returned).
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                        <tr>
                          {resultFields.map((col) => (
                            <th key={col} className="px-3 py-2 font-semibold text-slate-700 font-mono">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {resultRows.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            {resultFields.map((col) => (
                              <td key={col} className="px-3 py-2 text-slate-700 max-w-[260px] truncate">
                                {formatCellValue(row[col])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {!error && !resultRows && (
                <div className="flex-1 flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl p-6">
                  Select a table, switch a database, or execute SQL to inspect rows.
                </div>
              )}
            </div>
          </div>

          {/* Right Col: DB Scripts & Logs */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Terminal size={14} className="text-indigo-600" />
                Database Scripts ({packageManager})
              </h2>

              {dbScripts.length === 0 ? (
                <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-xl">
                  No db:* scripts found in package.json.
                </p>
              ) : (
                <div className="space-y-2">
                  {dbScripts.map((script) => (
                    <div
                      key={script.name}
                      className="flex flex-col gap-1.5 p-2.5 border border-slate-200 rounded-xl bg-slate-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-800 truncate">
                          {script.name}
                        </span>
                        <button
                          onClick={() => runScript(script.name)}
                          disabled={!!runningScript}
                          className="px-2.5 py-1 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 disabled:opacity-50 transition-colors flex items-center gap-1 shrink-0"
                        >
                          {runningScript === script.name ? (
                            <RefreshCw size={11} className="animate-spin" />
                          ) : (
                            <Play size={11} />
                          )}
                          Run
                        </button>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono truncate" title={script.command}>
                        {script.command}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 flex-1 flex flex-col min-h-[220px]">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Terminal Output
                </h2>
                {scriptLogs.length > 0 && (
                  <button
                    onClick={() => setScriptLogs([])}
                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                    Clear
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-auto font-mono text-[11px] text-slate-300 space-y-1 max-h-[300px]">
                {scriptLogs.length === 0 ? (
                  <div className="text-slate-500 italic">No scripts executed yet.</div>
                ) : (
                  scriptLogs.map((log, i) => (
                    <div
                      key={i}
                      className={`whitespace-pre-wrap break-words ${
                        log.startsWith('[ERR]')
                          ? 'text-red-400'
                          : log.startsWith('[DONE]')
                          ? 'text-emerald-400'
                          : ''
                      }`}
                    >
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
