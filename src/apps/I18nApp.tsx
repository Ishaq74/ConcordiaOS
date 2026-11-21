import React, { useState, useEffect, useMemo } from 'react';
import { useFsScan, execCmd, fsWrite } from '../hooks/useFs';
import {
  Languages,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  RefreshCw,
  Search,
  ChevronRight,
  Save,
  ArrowLeft,
  AlertTriangle,
  Folder,
  Type,
  FileCode2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useUiFeedback } from '../components/UiFeedback';

function flattenObject(ob: any): Record<string, string> {
  const toReturn: Record<string, string> = {};
  for (const i in ob) {
    if (!Object.prototype.hasOwnProperty.call(ob, i)) continue;
    if (typeof ob[i] === 'object' && ob[i] !== null && !Array.isArray(ob[i])) {
      const flatObject = flattenObject(ob[i]);
      for (const x in flatObject) {
        if (!Object.prototype.hasOwnProperty.call(flatObject, x)) continue;
        toReturn[i + '.' + x] = flatObject[x];
      }
    } else {
      toReturn[i] = String(ob[i]);
    }
  }
  return toReturn;
}

function unflattenObject(data: Record<string, string>): any {
  const result: any = {};
  for (const key in data) {
    const parts = key.split('.');
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof current[parts[i]] !== 'object' || current[parts[i]] === null) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = data[key];
  }
  return result;
}

export default function I18nApp({ onClose }: { onClose?: () => void }) {
  const [activeTab, setActiveTab] = useState<'translations' | 'usage'>('translations');
  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const { files, loading, error } = useFsScan();

  const langs = useMemo(
    () => files.filter((f) => f.startsWith('src/i18n/') && f.endsWith('.json')).map((f) => f.split('/').pop()!),
    [files]
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <RefreshCw className="animate-spin text-slate-400" />
      </div>
    );
  }
  if (error) return <div className="p-6 text-red-600 text-sm">{error}</div>;

  if (selectedLang) {
    return <TranslationEditor lang={selectedLang} langs={langs} onBack={() => setSelectedLang(null)} />;
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-10">
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
          <h1 className="text-xl font-semibold text-slate-900">i18n Dictionaries</h1>
        </div>
        <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 scrollbar-hide">
          <TabButton
            active={activeTab === 'translations'}
            onClick={() => setActiveTab('translations')}
            icon={<Languages size={14} />}
            label={`Locales (${langs.length})`}
          />
          <TabButton
            active={activeTab === 'usage'}
            onClick={() => setActiveTab('usage')}
            icon={<Search size={14} />}
            label="Key Usage"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          {activeTab === 'translations' && <TranslationsView langs={langs} onSelect={setSelectedLang} />}
          {activeTab === 'usage' && <UsageView />}
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
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
        active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function TranslationsView({ langs, onSelect }: { langs: string[]; onSelect: (lang: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {langs.length === 0 && (
        <div className="col-span-full text-sm text-slate-500 text-center py-8">No translation JSON files found.</div>
      )}
      {langs.map((lang) => (
        <button
          key={lang}
          onClick={() => onSelect(lang)}
          className="bg-white rounded-2xl p-4 border border-slate-200 flex items-center justify-between hover:border-indigo-300 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-700 font-bold uppercase text-sm">
              {lang.split('.')[0]}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">{lang}</div>
              <div className="text-xs font-mono text-slate-500">src/i18n/{lang}</div>
            </div>
          </div>
          <ChevronRight size={16} className="text-slate-400" />
        </button>
      ))}
    </div>
  );
}

function TranslationEditor({ lang, langs, onBack }: { lang: string; langs: string[]; onBack: () => void }) {
  const { toast, confirm } = useUiFeedback();
  const [data, setData] = useState<Record<string, string>>({});
  const [masterKeys, setMasterKeys] = useState<Set<string>>(new Set());
  const [sharedKeys, setSharedKeys] = useState<Set<string>>(new Set());
  const [referenceValues, setReferenceValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [translatingAi, setTranslatingAi] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'missing' | 'unshared'>('all');
  const [newKey, setNewKey] = useState('');
  const [showNewKey, setShowNewKey] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/fs/read?path=${encodeURIComponent(`src/i18n/${lang}`)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to read file');
        const parsed = JSON.parse(json.content || '{}');
        const flatData = flattenObject(parsed);
        setData(flatData);

        const allK = new Set<string>(Object.keys(flatData));
        const shared = new Set<string>();
        const refs: Record<string, string> = {};

        for (const l of langs) {
          if (l === lang) continue;
          const r = await fetch(`/api/fs/read?path=${encodeURIComponent(`src/i18n/${l}`)}`);
          if (r.ok) {
            const j = await r.json();
            const p = JSON.parse(j.content || '{}');
            const f = flattenObject(p);
            Object.keys(f).forEach((k) => {
              allK.add(k);
              shared.add(k);
              if (!refs[k] && f[k]) {
                refs[k] = f[k];
              }
            });
          }
        }
        setMasterKeys(allK);
        setSharedKeys(shared);
        setReferenceValues(refs);
        setDirty(false);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [lang, langs]);

  useEffect(() => {
    const errs: string[] = [];
    const keys = Object.keys(data);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const k1 = keys[i];
        const k2 = keys[j];
        if (k1.startsWith(k2 + '.') || k2.startsWith(k1 + '.')) {
          errs.push(`Conflict: "${k1}" and "${k2}" cannot coexist.`);
        }
      }
    }
    setConflicts([...new Set(errs)]);
  }, [data]);

  const handleBack = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Unsaved Changes',
        message: `You have unsaved changes in ${lang}. Leave without saving?`,
        confirmLabel: 'Discard Changes',
        danger: true,
      });
      if (!ok) return;
    }
    onBack();
  };

  const handleSave = async () => {
    if (conflicts.length > 0) {
      toast('Resolve key nesting conflicts before saving.', 'error');
      return;
    }
    try {
      setSaving(true);
      const unflattened = unflattenObject(data);
      await fsWrite(`src/i18n/${lang}`, JSON.stringify(unflattened, null, 2) + '\n', true);
      setDirty(false);
      toast(`${lang} saved successfully`, 'success');
    } catch (err: any) {
      toast('Failed to save: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateKey = (key: string, value: string) => {
    setData((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleAddKey = () => {
    const clean = newKey.trim();
    if (!clean || data[clean] !== undefined) return;
    setData((prev) => ({ [clean]: '', ...prev }));
    setMasterKeys((prev) => new Set(prev).add(clean));
    setDirty(true);
    const parts = clean.split('.');
    if (parts.length > 1) {
      setCurrentPath(parts.slice(0, -1));
    }
    setNewKey('');
    setShowNewKey(false);
    toast(`Added key "${clean}"`, 'success');
  };

  const handleDeleteKey = async (keyToDelete: string) => {
    const ok = await confirm({
      title: 'Delete Translation Key',
      message: `Remove "${keyToDelete}" from ${lang}?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;

    setData((prev) => {
      const next = { ...prev };
      delete next[keyToDelete];
      return next;
    });
    setMasterKeys((prev) => {
      const next = new Set(prev);
      next.delete(keyToDelete);
      return next;
    });
    setDirty(true);
  };

  const filteredKeys = Array.from(masterKeys).filter((k) => {
    const matchesSearch =
      k.toLowerCase().includes(search.toLowerCase()) ||
      (data[k] && data[k].toLowerCase().includes(search.toLowerCase()));
    if (!matchesSearch) return false;

    if (filter === 'missing') {
      return !data[k] || data[k].trim() === '';
    }
    if (filter === 'unshared') {
      return Boolean(data[k] && data[k].trim() !== '' && !sharedKeys.has(k) && langs.length > 1);
    }
    return true;
  });

  const currentPrefix = currentPath.length > 0 ? currentPath.join('.') + '.' : '';
  const itemsInCurrentPath = filteredKeys.filter((k) => k.startsWith(currentPrefix));

  const folders = new Set<string>();
  const files: string[] = [];

  itemsInCurrentPath.forEach((k) => {
    const remainingPath = k.slice(currentPrefix.length);
    if (remainingPath.includes('.')) {
      folders.add(remainingPath.split('.')[0]);
    } else {
      files.push(k);
    }
  });

  const sortedFolders = Array.from(folders).sort();
  const sortedFiles = files.sort();

  const allRootFolders = new Set<string>();
  Array.from(masterKeys).forEach((k) => {
    const parts = k.split('.');
    if (parts.length > 1) {
      allRootFolders.add(parts[0]);
    }
  });
  const sortedRootFolders = Array.from(allRootFolders).sort();

  const getMissingCount = (prefix: string) => {
    let count = 0;
    Array.from(masterKeys).forEach((k) => {
      if (k.startsWith(prefix) && (!data[k] || data[k].trim() === '')) {
        count++;
      }
    });
    return count;
  };

  const getExtraneousCount = (prefix: string) => {
    if (langs.length <= 1) return 0;
    let count = 0;
    Array.from(masterKeys).forEach((k) => {
      if (k.startsWith(prefix) && data[k] && data[k].trim() !== '' && !sharedKeys.has(k)) {
        count++;
      }
    });
    return count;
  };

  const copyReferenceForMissing = (prefix: string) => {
    let filled = 0;
    setData((prev) => {
      const next = { ...prev };
      Array.from(masterKeys).forEach((k) => {
        if (k.startsWith(prefix) && (!next[k] || next[k].trim() === '')) {
          next[k] = referenceValues[k] || k.split('.').pop() || '';
          filled++;
        }
      });
      return next;
    });
    if (filled > 0) {
      setDirty(true);
      toast(`Copied reference values for ${filled} key(s)`, 'info');
    }
  };

  const aiTranslateMissing = async (prefix: string) => {
    const missingPayload: Record<string, string> = {};
    Array.from(masterKeys).forEach((k) => {
      if (k.startsWith(prefix) && (!data[k] || data[k].trim() === '')) {
        missingPayload[k] = referenceValues[k] || k.split('.').pop() || '';
      }
    });
    const keysToTranslate = Object.keys(missingPayload);
    if (keysToTranslate.length === 0) return;

    setTranslatingAi(true);
    try {
      const targetLang = lang.split('.')[0];
      const res = await fetch('/api/gemini/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'i18n',
          sourceLang: 'reference',
          targetLang,
          payload: missingPayload,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'AI translation failed');

      const translated = json.translated || {};
      setData((prev) => {
        const next = { ...prev };
        for (const k of keysToTranslate) {
          if (typeof translated[k] === 'string' && translated[k].trim()) {
            next[k] = translated[k];
          }
        }
        return next;
      });
      setDirty(true);
      toast(`AI translated ${keysToTranslate.length} missing key(s) to ${targetLang.toUpperCase()}`, 'success');
    } catch (e: any) {
      toast(e.message || 'AI translation failed', 'error');
    } finally {
      setTranslatingAi(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <RefreshCw className="animate-spin text-slate-400" />
      </div>
    );
  }
  if (error) return <div className="p-6 text-red-600 text-sm">{error}</div>;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleBack}
            className="p-2 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
            aria-label="Back to locales"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-700 font-bold uppercase text-xs shrink-0">
              {lang.split('.')[0]}
            </div>
            <h1 className="text-lg font-semibold text-slate-900 truncate">{lang}</h1>
            {dirty && <span className="text-xs font-medium text-amber-700">Unsaved</span>}
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || conflicts.length > 0}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          Save
        </button>
      </div>

      <div className="p-4 border-b border-slate-200 bg-white space-y-3">
        {conflicts.length > 0 && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm flex flex-col gap-2">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle size={16} />
              Key Conflicts Detected
            </div>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              {conflicts.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search keys or values..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                filter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('missing')}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                filter === 'missing' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              Missing
            </button>
            {langs.length > 1 && (
              <button
                onClick={() => setFilter('unshared')}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  filter === 'unshared' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
                }`}
              >
                Unshared
              </button>
            )}
            <button
              onClick={() => setShowNewKey(!showNewKey)}
              className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-colors"
            >
              + Key
            </button>
          </div>
        </div>

        {showNewKey && (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="New key name (e.g. auth.login.title)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddKey();
              }}
              className="flex-1 px-3 py-2 bg-white border border-indigo-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
              autoFocus
            />
            <button
              onClick={handleAddKey}
              disabled={!newKey.trim() || data[newKey.trim()] !== undefined}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              Add Key
            </button>
          </div>
        )}

        {!search && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setCurrentPath([])}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                currentPath.length === 0 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Folder size={13} />
              Root
            </button>
            {sortedRootFolders.map((folder) => {
              const missingCount = getMissingCount(folder + '.');
              const extraneousCount = getExtraneousCount(folder + '.');
              return (
                <button
                  key={folder}
                  onClick={() => setCurrentPath([folder])}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    currentPath[0] === folder ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Folder size={13} />
                  <span>{folder}</span>
                  {missingCount > 0 && (
                    <span className="text-[10px] font-bold text-amber-500 tabular-nums">({missingCount})</span>
                  )}
                  {missingCount === 0 && extraneousCount > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50 flex flex-col">
        {!search && currentPath.length > 1 && (
          <div className="px-4 py-2.5 border-b border-slate-200 bg-white flex items-center gap-2 overflow-x-auto scrollbar-hide sticky top-0 z-10">
            <button onClick={() => setCurrentPath([currentPath[0]])} className="text-xs text-slate-500 hover:text-indigo-600">
              {currentPath[0]}
            </button>
            {currentPath.slice(1).map((folder, idx) => (
              <React.Fragment key={idx}>
                <ChevronRight size={13} className="text-slate-400 shrink-0" />
                <button
                  onClick={() => setCurrentPath(currentPath.slice(0, idx + 2))}
                  className={`text-xs hover:text-indigo-600 whitespace-nowrap ${
                    idx === currentPath.length - 2 ? 'text-indigo-600 font-semibold' : 'text-slate-500'
                  }`}
                >
                  {folder}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        <div className="p-4 space-y-3 max-w-4xl w-full mx-auto">
          {search ? (
            filteredKeys.length === 0 ? (
              <div className="text-center text-slate-500 text-sm py-8">No translations matching "{search}"</div>
            ) : (
              filteredKeys.sort().map((key) => {
                const isMissing = !data[key] || data[key].trim() === '';
                const isExtraneous = Boolean(data[key] && data[key].trim() !== '' && !sharedKeys.has(key) && langs.length > 1);
                return (
                  <TranslationKeyCard
                    key={key}
                    displayKey={key}
                    value={data[key] || ''}
                    reference={referenceValues[key]}
                    isMissing={isMissing}
                    isExtraneous={isExtraneous}
                    onChange={(v) => updateKey(key, v)}
                    onCopyRef={() => updateKey(key, referenceValues[key] || key.split('.').pop() || '')}
                    onDelete={() => handleDeleteKey(key)}
                  />
                );
              })
            )
          ) : (
            <>
              {sortedFolders.length === 0 && sortedFiles.length === 0 && (
                <div className="text-center text-slate-500 text-sm py-8">Empty namespace.</div>
              )}

              {currentPath.length > 0 && sortedFolders.length > 0 && (
                <div className="grid gap-2">
                  {sortedFolders.map((folder) => {
                    const folderPrefix = currentPrefix + folder + '.';
                    const missingCount = getMissingCount(folderPrefix);
                    const extraneousCount = getExtraneousCount(folderPrefix);
                    return (
                      <button
                        key={folder}
                        onClick={() => setCurrentPath([...currentPath, folder])}
                        className="w-full p-3 px-4 bg-white rounded-xl border border-slate-200 flex items-center justify-between hover:border-indigo-300 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              missingCount > 0
                                ? 'bg-amber-50 text-amber-600'
                                : extraneousCount > 0
                                ? 'bg-purple-50 text-purple-600'
                                : 'bg-indigo-50 text-indigo-600'
                            }`}
                          >
                            <Folder size={15} />
                          </div>
                          <span className="text-sm font-medium text-slate-800">{folder}</span>
                          {missingCount > 0 && (
                            <span className="text-xs font-medium text-amber-700 tabular-nums">
                              {missingCount} missing
                            </span>
                          )}
                          {extraneousCount > 0 && (
                            <span className="text-xs font-medium text-purple-700 tabular-nums">
                              {extraneousCount} unshared
                            </span>
                          )}
                          {missingCount === 0 && extraneousCount === 0 && (
                            <CheckCircle2 size={14} className="text-emerald-600" />
                          )}
                        </div>
                        <ChevronRight size={16} className="text-slate-400" />
                      </button>
                    );
                  })}
                </div>
              )}

              {sortedFiles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Keys ({sortedFiles.length})
                    </div>
                    {getMissingCount(currentPrefix) > 0 && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyReferenceForMissing(currentPrefix)}
                          className="text-xs text-slate-600 hover:text-slate-900 font-medium px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50"
                        >
                          Copy Reference
                        </button>
                        <button
                          onClick={() => aiTranslateMissing(currentPrefix)}
                          disabled={translatingAi}
                          className="text-xs text-indigo-700 hover:bg-indigo-100 font-medium flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 disabled:opacity-50"
                        >
                          {translatingAi ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                          AI Translate Missing
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3">
                    {sortedFiles.map((key) => {
                      const isMissing = !data[key] || data[key].trim() === '';
                      const isExtraneous = Boolean(
                        data[key] && data[key].trim() !== '' && !sharedKeys.has(key) && langs.length > 1
                      );
                      return (
                        <TranslationKeyCard
                          key={key}
                          displayKey={key.slice(currentPrefix.length)}
                          value={data[key] || ''}
                          reference={referenceValues[key]}
                          isMissing={isMissing}
                          isExtraneous={isExtraneous}
                          onChange={(v) => updateKey(key, v)}
                          onCopyRef={() => updateKey(key, referenceValues[key] || key.split('.').pop() || '')}
                          onDelete={() => handleDeleteKey(key)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TranslationKeyCard({
  displayKey,
  value,
  reference,
  isMissing,
  isExtraneous,
  onChange,
  onCopyRef,
  onDelete,
}: {
  displayKey: string;
  value: string;
  reference?: string;
  isMissing: boolean;
  isExtraneous: boolean;
  onChange: (v: string) => void;
  onCopyRef: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`bg-white p-3.5 rounded-xl border space-y-2 ${
        isMissing
          ? 'border-amber-300 bg-amber-50/20'
          : isExtraneous
          ? 'border-purple-300'
          : 'border-slate-200'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Type size={13} className={isMissing ? 'text-amber-500' : 'text-slate-400'} />
          <span className="text-xs font-mono font-semibold text-slate-800 break-all">{displayKey}</span>
          {isMissing && (
            <span className="text-[11px] font-medium text-amber-700 flex items-center gap-1">
              <AlertCircle size={11} />
              Missing
            </span>
          )}
          {isExtraneous && (
            <span className="text-[11px] font-medium text-purple-700">Unshared</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isMissing && (
            <button
              onClick={onCopyRef}
              className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 text-xs font-medium hover:bg-indigo-100"
            >
              Use Ref
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            aria-label="Delete key"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {reference && isMissing && (
        <div className="text-xs text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
          Ref: <span className="italic">{reference}</span>
        </div>
      )}

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isMissing ? 'Enter translation...' : ''}
        className={`w-full p-2.5 bg-slate-50 border rounded-lg text-sm focus:outline-none focus:border-indigo-500 resize-y min-h-[64px] ${
          isMissing ? 'border-amber-200 placeholder:text-amber-400' : 'border-slate-200'
        }`}
      />
    </div>
  );
}

function UsageView() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<{ file: string; line: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    async function searchUsage() {
      setLoading(true);
      setError(null);
      try {
        const query = search.trim() || 't(';
        // Use '--' before pattern so leading '-' characters cannot be treated as grep flags
        const res = await execCmd('grep', ['-rI', '--', query, 'src/'], '.');
        if (!active) return;
        const lines = (res.stdout || '').split('\n').filter(Boolean);
        const parsed = lines
          .map((line: string) => {
            const idx = line.indexOf(':');
            if (idx === -1) return null;
            return {
              file: line.substring(0, idx),
              line: line.substring(idx + 1).trim(),
            };
          })
          .filter(Boolean) as { file: string; line: string }[];
        setResults(parsed);
        setCurrentPath([]);
      } catch (err: any) {
        if (!active) return;
        setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    const timeout = setTimeout(searchUsage, 400);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [search]);

  const currentPrefix = currentPath.length > 0 ? currentPath.join('/') + '/' : '';
  const itemsInCurrentPath = results.filter((r) => r.file.startsWith(currentPrefix));

  const folders = new Set<string>();
  const files: { name: string; file: string; line: string }[] = [];

  itemsInCurrentPath.forEach((r) => {
    const remainingPath = r.file.slice(currentPrefix.length);
    if (remainingPath.includes('/')) {
      folders.add(remainingPath.split('/')[0]);
    } else {
      files.push({ name: remainingPath, file: r.file, line: r.line });
    }
  });

  const sortedFolders = Array.from(folders).sort();
  const sortedFiles = files.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search translation key usage in src/ (e.g. 't(' or 'welcome')..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-3 border-b border-slate-200 font-medium text-xs text-slate-700 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setCurrentPath([])}
              className={`hover:text-indigo-600 ${currentPath.length === 0 ? 'text-indigo-600 font-semibold' : 'text-slate-500'}`}
            >
              src
            </button>
            {currentPath.map((folder, idx) => (
              <React.Fragment key={idx}>
                <ChevronRight size={13} className="text-slate-400 shrink-0" />
                <button
                  onClick={() => setCurrentPath(currentPath.slice(0, idx + 1))}
                  className={`hover:text-indigo-600 whitespace-nowrap ${
                    idx === currentPath.length - 1 ? 'text-indigo-600 font-semibold' : 'text-slate-500'
                  }`}
                >
                  {folder}
                </button>
              </React.Fragment>
            ))}
          </div>
          <span className="text-slate-400 tabular-nums shrink-0 ml-2">{results.length} matches</span>
        </div>

        <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
          {loading ? (
            <div className="p-8 flex justify-center">
              <RefreshCw className="animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <div className="p-4 text-sm text-red-600 text-center">{error}</div>
          ) : results.length === 0 ? (
            <div className="p-6 text-sm text-slate-500 text-center">No usages found.</div>
          ) : (
            <>
              {sortedFolders.map((folder) => (
                <button
                  key={folder}
                  onClick={() => setCurrentPath([...currentPath, folder])}
                  className="w-full p-3 px-4 flex items-center justify-between hover:bg-slate-50 text-left transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500">
                      <Folder size={14} />
                    </div>
                    <span className="text-sm font-medium text-slate-800">{folder}</span>
                  </div>
                  <ChevronRight size={14} className="text-slate-400" />
                </button>
              ))}

              {sortedFiles.map((file, i) => (
                <div key={i} className="p-3 px-4 flex flex-col gap-1.5 hover:bg-slate-50">
                  <div className="flex items-center gap-2.5">
                    <FileCode2 size={14} className="text-slate-400 shrink-0" />
                    <span className="text-xs font-semibold text-slate-800">{file.name}</span>
                  </div>
                  <div className="text-xs font-mono text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-lg truncate">
                    {file.line}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
