import React, { useState, useEffect } from 'react';
import { useFsScan } from '../hooks/useFs';
import {
  Database,
  Plus,
  ChevronLeft,
  Save,
  Trash2,
  Sparkles,
  RefreshCw,
  Languages,
  Search,
  Edit3,
  Check,
  ChevronsUpDown,
  Globe,
  Filter,
  Image as ImageIcon,
  UploadCloud,
  AlertCircle,
  X,
} from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import { useUiFeedback } from '../components/UiFeedback';

export default function OfficeApp({ onClose }: { onClose?: () => void }) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const { files, loading, error } = useFsScan();
  const [allSeeds, setAllSeeds] = useState<Record<string, { exportKey: string; items: any[] }>>({});

  useEffect(() => {
    fetch('/api/seeds-all')
      .then((res) => res.text().then((text) => ({ status: res.status, text })))
      .then(({ status, text }) => {
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          throw new Error(`Invalid response from server (Status ${status})`);
        }
      })
      .then((res) => {
        if (res.success && res.data) setAllSeeds(res.data);
      })
      .catch((err) => console.error('Failed to load all seeds:', err));
  }, []);

  const seedFiles = files
    .filter((f) => f.startsWith('src/database/data/') && f.endsWith('.data.ts'))
    .map((f) => f.split('/').pop()!);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <RefreshCw className="animate-spin text-slate-400" />
      </div>
    );
  }
  if (error) return <div className="p-6 text-red-600 text-sm">{error}</div>;

  if (selectedFile) {
    return (
      <SeedEditor
        file={selectedFile}
        allSeeds={allSeeds}
        onBack={() => setSelectedFile(null)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-10 flex justify-between items-center gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
              aria-label="Back"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          <h1 className="text-xl font-semibold text-slate-900 truncate">Office CMS</h1>
        </div>
        <PublishButton />
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          {seedFiles.length === 0 ? (
            <div className="text-center mt-12 text-slate-500 flex flex-col items-center gap-3">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
                <Database size={28} />
              </div>
              <p className="text-sm">No seed files found in src/database/data/.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {seedFiles.map((file) => {
                const count = allSeeds[file]?.items?.length;
                return (
                  <button
                    key={file}
                    onClick={() => setSelectedFile(file)}
                    className="bg-white rounded-2xl p-4 border border-slate-200 flex items-center justify-between hover:border-indigo-300 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                        <Database size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{file}</div>
                        <div className="text-xs text-slate-500 tabular-nums">
                          {count !== undefined ? `${count} entries` : 'Manage seed entries'}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function copyItemForLanguage(baseItem: any, targetLang: string, baseLang = 'fr') {
  const newItem = JSON.parse(JSON.stringify(baseItem));

  if (typeof newItem.id === 'string') {
    const replaced = newItem.id.replace(new RegExp(`-${baseLang}$`), `-${targetLang}`);
    newItem.id = replaced === newItem.id ? `${newItem.id}-${targetLang}` : replaced;
  }

  if (newItem.inLanguage) newItem.inLanguage = targetLang;

  const replaceLangKeys = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(replaceLangKeys);
      return;
    }
    if (baseLang in obj) {
      obj[targetLang] = obj[baseLang];
      delete obj[baseLang];
    }
    Object.values(obj).forEach(replaceLangKeys);
  };

  replaceLangKeys(newItem);
  return newItem;
}

const clearValues = (obj: any): any => {
  if (Array.isArray(obj)) return [];
  if (typeof obj === 'object' && obj !== null) {
    const newObj: any = {};
    for (const k in obj) {
      newObj[k] = clearValues(obj[k]);
    }
    return newObj;
  }
  if (typeof obj === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(obj)) return new Date().toISOString();
    return '';
  }
  if (typeof obj === 'number') return 0;
  if (typeof obj === 'boolean') return false;
  return obj;
};

const isDateString = (val: any) =>
  typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(val);

function toLocalDateTimeValue(isoStr: string): string {
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const isImageUrl = (key: string, val: any) => {
  if (typeof val !== 'string') return false;
  const k = key.toLowerCase();
  if (
    k === 'url' ||
    k.includes('image') ||
    k.includes('avatar') ||
    k.includes('logo') ||
    k.includes('cover') ||
    k.includes('thumbnail') ||
    k === 'contenturl' ||
    k === 'src'
  ) {
    return val === '' || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/');
  }
  return false;
};

function isValidImageInput(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return !trimmed.startsWith('//');
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function SeedEditor({ file, allSeeds, onBack }: { file: string; allSeeds: any; onBack: () => void }) {
  const { toast, confirm } = useUiFeedback();
  const [data, setData] = useState<any[]>([]);
  const [exportKey, setExportKey] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/seeds/${encodeURIComponent(file)}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) {
          setData(res.data || []);
          setExportKey(res.exportKey || '');
          setDirty(false);
        } else {
          toast('Error loading seed: ' + (res.error || 'Unknown error'), 'error');
        }
      })
      .catch((err) => toast('Error loading seed: ' + err.message, 'error'))
      .finally(() => setLoading(false));
  }, [file, toast]);

  const handleSave = async (overrideData?: any[]) => {
    setSaving(true);
    try {
      const payloadData = overrideData || data;
      const res = await fetch(`/api/seeds/${encodeURIComponent(file)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: payloadData, exportKey }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save');
      setDirty(false);
      toast(`${file} saved successfully`, 'success');
    } catch (e: any) {
      toast('Failed to save: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateItem = (index: number, newItem: any) => {
    setData((prev) => {
      const next = [...prev];
      next[index] = newItem;
      return next;
    });
    setDirty(true);
  };

  const handleAddItem = () => {
    const newItem = data.length > 0 ? clearValues(data[0]) : { id: 'new-item' };
    newItem.id = `new-item-${Date.now()}`;
    setData([newItem, ...data]);
    setDirty(true);
    setSelectedItemIndex(0);
  };

  const handleDeleteItem = async (index: number) => {
    const ok = await confirm({
      title: 'Delete Entry',
      message: `Remove entry "${data[index]?.id || index}" from ${file}?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;

    const newData = [...data];
    newData.splice(index, 1);
    setData(newData);
    setDirty(true);
    setSelectedItemIndex(null);
    toast('Entry removed (click Save to persist)', 'info');
  };

  const handleBack = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Unsaved Seed Changes',
        message: `You have unsaved edits in ${file}. Discard them?`,
        confirmLabel: 'Discard',
        danger: true,
      });
      if (!ok) return;
    }
    onBack();
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <RefreshCw className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (selectedItemIndex !== null && data[selectedItemIndex]) {
    return (
      <ItemEditor
        key={selectedItemIndex}
        item={data[selectedItemIndex]}
        allSeeds={allSeeds}
        saving={saving}
        onUpdate={(newItem) => handleUpdateItem(selectedItemIndex, newItem)}
        onBack={(flushedDraft) => {
          handleUpdateItem(selectedItemIndex, flushedDraft);
          setSelectedItemIndex(null);
        }}
        onDelete={() => handleDeleteItem(selectedItemIndex)}
        onSave={(draftItem) => {
          const newData = [...data];
          newData[selectedItemIndex] = draftItem;
          setData(newData);
          handleSave(newData);
        }}
      />
    );
  }

  const isTranslationFile = file.includes('translation');
  const parentKey = data.length > 0 ? Object.keys(data[0]).find((k) => k.endsWith('Id') && k !== 'id') : null;

  const filteredData = data
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => {
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return (
        (typeof item.id === 'string' && item.id.toLowerCase().includes(s)) ||
        (typeof item.slug === 'string' && item.slug.toLowerCase().includes(s)) ||
        (typeof item.name === 'string' && item.name.toLowerCase().includes(s)) ||
        (typeof item.email === 'string' && item.email.toLowerCase().includes(s)) ||
        (typeof item.title === 'string' && item.title.toLowerCase().includes(s)) ||
        (typeof item.headline === 'string' && item.headline.toLowerCase().includes(s))
      );
    });

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="px-4 py-3 bg-white border-b border-slate-200 flex flex-col gap-3 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              onClick={handleBack}
              className="p-2 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 shrink-0"
              aria-label="Back"
            >
              <ChevronLeft size={22} />
            </button>
            <h1 className="text-lg font-semibold text-slate-900 truncate">{file}</h1>
            {dirty && <span className="text-xs font-medium text-amber-700 shrink-0">Unsaved</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleAddItem}
              className="px-3 py-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-xs font-semibold flex items-center gap-1"
            >
              <Plus size={15} />
              Add Entry
            </button>
            <button
              onClick={() => handleSave()}
              disabled={saving}
              className="px-3.5 py-1.5 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </button>
          </div>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search entries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto space-y-2.5">
          {isTranslationFile && parentKey ? (
            <TranslationGroupView
              data={data}
              parentKey={parentKey}
              search={search}
              onSelectItem={setSelectedItemIndex}
              onAddTranslation={(newItem) => {
                const newData = [...data, newItem];
                setData(newData);
                setDirty(true);
                setSelectedItemIndex(newData.length - 1);
              }}
            />
          ) : filteredData.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
              No entries found.
            </div>
          ) : (
            filteredData.map(({ item, idx }) => (
              <div
                key={`${item.id || idx}-${idx}`}
                onClick={() => setSelectedItemIndex(idx)}
                className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between hover:border-indigo-300 cursor-pointer transition-colors"
              >
                <div className="truncate flex-1 min-w-0 pr-3">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {item.id || item.slug || item.name || item.title || `Item ${idx}`}
                  </div>
                  <div className="text-xs text-slate-500 truncate mt-0.5">
                    {Object.keys(item).slice(0, 4).join(', ')}
                  </div>
                </div>
                <Edit3 size={15} className="text-slate-400 shrink-0" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TranslationGroupView({
  data,
  parentKey,
  search,
  onSelectItem,
  onAddTranslation,
}: {
  data: any[];
  parentKey: string;
  search: string;
  onSelectItem: (idx: number) => void;
  onAddTranslation: (item: any) => void;
}) {
  const { toast } = useUiFeedback();
  const [sortBy, setSortBy] = useState<'default' | 'least_translated'>('default');
  const [translatingKey, setTranslatingKey] = useState<string | null>(null);
  const [openMenuForId, setOpenMenuForId] = useState<string | null>(null);

  const groups: Record<string, { item: any; idx: number }[]> = {};
  data.forEach((item, idx) => {
    const pId = item[parentKey] || 'unknown';
    if (!groups[pId]) groups[pId] = [];
    groups[pId].push({ item, idx });
  });

  const AVAILABLE_LANGS = ['fr', 'en', 'es', 'de', 'it', 'ar'];

  let groupEntries = Object.entries(groups);

  if (search) {
    const s = search.toLowerCase();
    groupEntries = groupEntries.filter(([pId, items]) => {
      if (pId.toLowerCase().includes(s)) return true;
      return items.some(({ item }) => {
        const title = item.headline || item.title || item.name || '';
        const titleStr = typeof title === 'string' ? title : Object.values(title).join(' ');
        return titleStr.toLowerCase().includes(s);
      });
    });
  }

  if (sortBy === 'least_translated') {
    groupEntries.sort((a, b) => a[1].length - b[1].length);
  }

  const handleAddLanguage = async (pId: string, baseItem: any, lang: string) => {
    setOpenMenuForId(null);
    setTranslatingKey(`${pId}:${lang}`);
    const newItem = copyItemForLanguage(baseItem, lang, baseItem.inLanguage || 'fr');
    try {
      const res = await fetch('/api/gemini/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'cms',
          sourceLang: baseItem.inLanguage || 'fr',
          targetLang: lang,
          payload: newItem,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'AI translation failed');
      onAddTranslation({ ...newItem, ...(json.translated || {}), inLanguage: lang });
      toast(`Created ${lang.toUpperCase()} translation with AI`, 'success');
    } catch (e: any) {
      toast(`AI translation unavailable (${e.message}); added copied draft.`, 'info');
      onAddTranslation(newItem);
    } finally {
      setTranslatingKey(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end mb-2">
        <div className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
          <Filter size={13} />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-transparent border-none focus:outline-none text-xs cursor-pointer"
          >
            <option value="default">Default Order</option>
            <option value="least_translated">Least Translated First</option>
          </select>
        </div>
      </div>

      {groupEntries.map(([pId, items]) => {
        const existingLangs = items.map((i) => i.item.inLanguage);
        const missingLangs = AVAILABLE_LANGS.filter((l) => !existingLangs.includes(l));
        const baseItem = items.find((i) => i.item.inLanguage === 'fr')?.item || items[0].item;

        let title = 'Translation Group';
        if (baseItem.headline) {
          title = typeof baseItem.headline === 'string' ? baseItem.headline : String(Object.values(baseItem.headline)[0] || '');
        } else if (baseItem.title) {
          title = typeof baseItem.title === 'string' ? baseItem.title : String(Object.values(baseItem.title)[0] || '');
        }

        const isMenuOpen = openMenuForId === pId;

        return (
          <div key={pId} className="bg-white p-4 rounded-2xl border border-slate-200 relative">
            <div className="font-semibold text-sm text-slate-900 mb-0.5">{pId}</div>
            <div className="text-xs text-slate-500 mb-3 truncate">{title}</div>
            <div className="flex flex-wrap items-center gap-2">
              {items.map(({ item, idx }) => (
                <button
                  key={`${item.inLanguage}-${idx}`}
                  onClick={() => onSelectItem(idx)}
                  className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100 flex items-center gap-1.5"
                >
                  <Globe size={13} />
                  {String(item.inLanguage || 'N/A').toUpperCase()}
                </button>
              ))}

              {missingLangs.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setOpenMenuForId(isMenuOpen ? null : pId)}
                    disabled={translatingKey !== null}
                    className="px-3 py-1.5 border border-dashed border-slate-300 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 hover:border-slate-400 flex items-center gap-1 disabled:opacity-50"
                  >
                    {translatingKey?.startsWith(`${pId}:`) ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <Plus size={13} />
                    )}
                    Add Locale
                  </button>
                  {isMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenuForId(null)} />
                      <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 min-w-[120px]">
                        {missingLangs.map((lang) => (
                          <button
                            key={lang}
                            onClick={() => handleAddLanguage(pId, baseItem, lang)}
                            className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-100 rounded-lg flex items-center justify-between"
                          >
                            <span>{lang.toUpperCase()}</span>
                            <Sparkles size={12} className="text-indigo-500" />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReferenceCombobox({
  value,
  onChange,
  fieldKey,
  allSeeds,
}: {
  value: string;
  onChange: (v: string) => void;
  fieldKey: string;
  allSeeds: any;
}) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  let targetFiles = Object.keys(allSeeds);
  const lowerKey = fieldKey.toLowerCase();
  if (lowerKey.includes('author')) targetFiles = targetFiles.filter((f) => f.includes('author'));
  else if (lowerKey.includes('category')) targetFiles = targetFiles.filter((f) => f.includes('categor'));
  else if (lowerKey.includes('post')) targetFiles = targetFiles.filter((f) => f.includes('post') && !f.includes('translation'));
  else if (lowerKey.includes('organization')) targetFiles = targetFiles.filter((f) => f.includes('organization'));
  else if (lowerKey.includes('service')) targetFiles = targetFiles.filter((f) => f.includes('service') && !f.includes('translation'));
  else targetFiles = targetFiles.filter((f) => !f.includes('translation'));

  const options = targetFiles.flatMap((f) => allSeeds[f]?.items || []).filter((item) => item && item.id);

  const filtered = options
    .filter(
      (o) =>
        o.id.toLowerCase().includes(search.toLowerCase()) ||
        (o.name && typeof o.name === 'string' && o.name.toLowerCase().includes(search.toLowerCase())) ||
        (o.title && typeof o.title === 'string' && o.title.toLowerCase().includes(search.toLowerCase())) ||
        (o.slug && typeof o.slug === 'string' && o.slug.toLowerCase().includes(search.toLowerCase()))
    )
    .slice(0, 50);

  const selectedOption = options.find((o) => o.id === value);
  const displayValue = selectedOption
    ? selectedOption.name || selectedOption.title || selectedOption.slug || selectedOption.id
    : value;

  return (
    <div className="relative">
      <div
        className="w-full text-sm border border-slate-200 rounded-xl p-2.5 bg-white flex justify-between items-center cursor-pointer hover:border-slate-300"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="truncate">{displayValue || 'Select...'}</span>
        <ChevronsUpDown size={15} className="text-slate-400 shrink-0" />
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 flex flex-col">
            <div className="p-2 border-b border-slate-100 sticky top-0 bg-white">
              <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-2">
                <Search size={14} className="text-slate-400" />
                <input
                  type="text"
                  className="w-full bg-transparent border-none text-sm focus:outline-none p-1.5"
                  placeholder="Search reference..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              </div>
            </div>
            <div className="overflow-y-auto p-1">
              {filtered.length === 0 && (
                <div className="p-3 text-xs text-slate-500 text-center">No results found</div>
              )}
              {filtered.map((opt) => (
                <div
                  key={opt.id}
                  className={`p-2 text-xs rounded-lg cursor-pointer flex justify-between items-center ${
                    opt.id === value ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50'
                  }`}
                  onClick={() => {
                    onChange(opt.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                >
                  <div className="truncate">
                    <div className="font-medium">{opt.name || opt.title || opt.slug || opt.id}</div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">{opt.id}</div>
                  </div>
                  {opt.id === value && <Check size={14} />}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ItemEditor({
  item,
  allSeeds,
  onUpdate,
  onBack,
  onDelete,
  onSave,
  saving,
}: {
  item: any;
  allSeeds: any;
  onUpdate: (i: any) => void;
  onBack: (flushed: any) => void;
  onDelete: () => void;
  onSave: (i: any) => void;
  saving: boolean;
}) {
  const { toast, prompt } = useUiFeedback();
  const [draft, setDraft] = useState(item);
  const [editingField, setEditingField] = useState<{ key: string; lang?: string } | null>(null);
  const [showAi, setShowAi] = useState(false);
  const [pickingImageFor, setPickingImageFor] = useState<string | null>(null);
  const [generatingAltFor, setGeneratingAltFor] = useState<string | null>(null);

  const handleChange = (key: string, value: any, lang?: string) => {
    setDraft((prev: any) => {
      const next = { ...prev };
      if (lang) {
        next[key] = { ...(next[key] || {}), [lang]: value };
      } else {
        next[key] = value;
      }
      onUpdate(next);
      return next;
    });
  };

  const handleSaveClick = () => {
    onUpdate(draft);
    onSave(draft);
  };

  const handleGenerateAlt = async (key: string, currentValue: any, bilingual: boolean) => {
    const imgUrl = draft.url || draft.contentUrl || draft.image || draft.coverImage;
    if (!imgUrl) {
      toast('Set an image URL on this entry before generating alt text.', 'error');
      return;
    }
    setGeneratingAltFor(key);
    try {
      const res = await fetch('/api/gemini/alt-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: imgUrl, bilingual }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to generate alt text');
      if (bilingual) {
        handleChange(key, { ...(typeof currentValue === 'object' ? currentValue : {}), ...(json.alt || {}) });
      } else {
        handleChange(key, typeof json.alt === 'string' ? json.alt : '');
      }
      toast('Generated accessible alt text', 'success');
    } catch (e: any) {
      toast('Failed to generate alt text: ' + e.message, 'error');
    } finally {
      setGeneratingAltFor(null);
    }
  };

  const renderField = (key: string, value: any) => {
    if (key.endsWith('Id') && key !== 'id') {
      return (
        <div key={key} className="space-y-1">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{key}</div>
          <ReferenceCombobox value={value} onChange={(val) => handleChange(key, val)} fieldKey={key} allSeeds={allSeeds} />
        </div>
      );
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      return (
        <div key={key} className="space-y-2.5 border-l-2 border-indigo-200 pl-3.5 ml-1">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex justify-between items-center gap-2">
            <span>{key} (i18n)</span>
            <div className="flex items-center gap-3">
              {(key === 'alt' || key === 'altText') && (draft.url || draft.contentUrl || draft.image) && (
                <button
                  onClick={() => handleGenerateAlt(key, value, true)}
                  disabled={generatingAltFor === key}
                  className="text-indigo-600 hover:underline flex items-center gap-1 disabled:opacity-50"
                >
                  {generatingAltFor === key ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  AI Alt
                </button>
              )}
              <button
                onClick={async () => {
                  const lang = await prompt({
                    title: 'Add Locale to Field',
                    message: `Add a translation entry under "${key}"`,
                    placeholder: 'en, es, de, ar...',
                    confirmLabel: 'Add Locale',
                  });
                  if (lang) {
                    const cleanLang = lang.trim().toLowerCase();
                    if (cleanLang && !value[cleanLang]) {
                      handleChange(key, '', cleanLang);
                    }
                  }
                }}
                className="text-indigo-600 hover:underline"
              >
                + Add Language
              </button>
            </div>
          </div>
          {Object.entries(value).map(([lang, val]) => (
            <div key={lang} className="space-y-1">
              <div className="text-xs text-slate-500 flex justify-between">
                <span className="font-mono uppercase">{lang}</span>
                <button
                  onClick={() => setEditingField({ key, lang })}
                  className="text-indigo-600 hover:underline"
                >
                  Edit Markdown
                </button>
              </div>
              <textarea
                value={typeof val === 'string' ? val : JSON.stringify(val)}
                onChange={(e) => handleChange(key, e.target.value, lang)}
                className="w-full text-sm bg-white border border-slate-200 rounded-xl p-2.5 min-h-[64px] focus:outline-none focus:border-indigo-500"
              />
            </div>
          ))}
        </div>
      );
    }

    return (
      <div key={key} className="space-y-1.5">
        <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex justify-between items-center">
          <span>{key}</span>
          <div className="flex items-center gap-3">
            {(key === 'alt' || key === 'altText') &&
              (draft.url || draft.contentUrl || draft.image) &&
              typeof value === 'string' && (
                <button
                  onClick={() => handleGenerateAlt(key, value, false)}
                  disabled={generatingAltFor === key}
                  className="text-indigo-600 hover:underline flex items-center gap-1 disabled:opacity-50"
                >
                  {generatingAltFor === key ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  AI Alt
                </button>
              )}
            {typeof value === 'string' &&
              (value.length > 50 || key.toLowerCase().includes('body') || key.toLowerCase().includes('content')) && (
                <button onClick={() => setEditingField({ key })} className="text-indigo-600 hover:underline">
                  Edit Markdown
                </button>
              )}
          </div>
        </div>

        {isImageUrl(key, value) && (
          <div className="mb-2">
            {value ? (
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex flex-col items-center p-2 gap-2">
                <img
                  src={value.startsWith('/images/') ? `/api/fs/raw?path=${encodeURIComponent('public' + value)}` : value}
                  alt="Preview"
                  className="max-h-48 object-contain rounded-lg"
                  referrerPolicy="no-referrer"
                />
                <button
                  onClick={() => setPickingImageFor(key)}
                  className="bg-white border border-slate-200 text-slate-800 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-slate-50"
                >
                  <ImageIcon size={14} /> Change Image
                </button>
              </div>
            ) : (
              <button
                onClick={() => setPickingImageFor(key)}
                className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:bg-white hover:border-indigo-400 flex flex-col items-center justify-center gap-1.5 transition-colors"
              >
                <ImageIcon size={22} className="text-slate-400" />
                <span className="text-xs font-medium">Select or Upload Image</span>
              </button>
            )}
          </div>
        )}

        {typeof value === 'boolean' ? (
          <select
            value={value ? 'true' : 'false'}
            onChange={(e) => handleChange(key, e.target.value === 'true')}
            className="w-full text-sm border border-slate-200 rounded-xl p-2.5 bg-white focus:outline-none focus:border-indigo-500"
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        ) : isDateString(value) ? (
          <input
            type="datetime-local"
            value={toLocalDateTimeValue(value)}
            onChange={(e) => {
              const d = new Date(e.target.value);
              if (!isNaN(d.getTime())) handleChange(key, d.toISOString());
            }}
            className="w-full text-sm bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:border-indigo-500"
          />
        ) : typeof value === 'string' &&
          (value.length > 50 || key.toLowerCase().includes('body') || key.toLowerCase().includes('content')) ? (
          <textarea
            value={value}
            onChange={(e) => handleChange(key, e.target.value)}
            className="w-full text-sm bg-white border border-slate-200 rounded-xl p-2.5 min-h-[100px] focus:outline-none focus:border-indigo-500"
          />
        ) : Array.isArray(value) ? (
          <textarea
            value={JSON.stringify(value, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                if (Array.isArray(parsed)) handleChange(key, parsed);
              } catch {
                // ignore invalid JSON while typing
              }
            }}
            className="w-full text-xs font-mono bg-white border border-slate-200 rounded-xl p-2.5 min-h-[80px] focus:outline-none focus:border-indigo-500"
          />
        ) : (
          <input
            type="text"
            value={value ?? ''}
            onChange={(e) => handleChange(key, e.target.value)}
            className="w-full text-sm bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:border-indigo-500"
          />
        )}
      </div>
    );
  };

  if (editingField) {
    const val = editingField.lang ? draft[editingField.key]?.[editingField.lang] || '' : draft[editingField.key] || '';

    return (
      <div className="h-full flex flex-col bg-white">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10 bg-white">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditingField(null)}
              className="p-2 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
              aria-label="Back to fields"
            >
              <ChevronLeft size={20} />
            </button>
            <h1 className="text-sm font-semibold text-slate-900">
              Editing {editingField.key} {editingField.lang ? `(${editingField.lang})` : ''}
            </h1>
          </div>
          <button
            onClick={() => setShowAi(!showAi)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
              showAi ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Sparkles size={14} />
            AI Assistant
          </button>
        </div>

        {showAi && (
          <AiPanel
            content={val}
            setContent={(c) => handleChange(editingField.key, c, editingField.lang)}
          />
        )}

        <div className="flex-1 overflow-hidden" data-color-mode="light">
          <MDEditor
            value={val}
            onChange={(c) => handleChange(editingField.key, c || '', editingField.lang)}
            height="100%"
            preview="edit"
            className="border-none !shadow-none"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            onClick={() => onBack(draft)}
            className="p-2 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
            aria-label="Back"
          >
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-lg font-semibold text-slate-900 truncate">
            {draft.id || 'Edit Entry'}
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onDelete}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            aria-label="Delete entry"
          >
            <Trash2 size={18} />
          </button>
          <button
            onClick={handleSaveClick}
            disabled={saving}
            className="px-3.5 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            Save
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-4 pb-8">
          {Object.entries(draft).map(([key, value]) => renderField(key, value))}
        </div>
      </div>

      {pickingImageFor && (
        <ImagePickerModal
          onClose={() => setPickingImageFor(null)}
          onSelect={(url) => {
            handleChange(pickingImageFor, url);
            setPickingImageFor(null);
          }}
        />
      )}
    </div>
  );
}

function AiPanel({ content, setContent }: { content: string; setContent: (c: string) => void }) {
  const { toast } = useUiFeedback();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [mode, setMode] = useState<'write' | 'seo' | 'translate'>('write');

  const handleGenerate = async () => {
    if (!prompt.trim() && mode === 'write') return;
    setIsGenerating(true);

    try {
      const res = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, prompt, content }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'AI request failed');

      const generatedText = json.text || '';
      if (mode === 'write') {
        setContent(content ? `${content}\n\n${generatedText}` : generatedText);
      } else if (mode === 'seo') {
        setContent(`${generatedText}\n\n${content}`);
      } else {
        setContent(generatedText);
      }
      setPrompt('');
      toast('AI content updated', 'success');
    } catch (e: any) {
      toast('AI Generation failed: ' + e.message, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-indigo-50 border-b border-indigo-100 p-3 flex flex-col gap-2.5">
      <div className="flex gap-2">
        <button
          onClick={() => setMode('write')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 ${
            mode === 'write' ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 border border-indigo-200'
          }`}
        >
          <Sparkles size={13} /> Write
        </button>
        <button
          onClick={() => setMode('seo')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 ${
            mode === 'seo' ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 border border-indigo-200'
          }`}
        >
          <Search size={13} /> SEO
        </button>
        <button
          onClick={() => setMode('translate')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 ${
            mode === 'translate' ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 border border-indigo-200'
          }`}
        >
          <Languages size={13} /> Translate
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            mode === 'write'
              ? 'Describe the section to draft...'
              : mode === 'translate'
              ? 'Target language (e.g. English, Spanish)'
              : 'Generates YAML SEO metadata from current text'
          }
          disabled={mode === 'seo'}
          className="flex-1 text-xs rounded-lg border border-indigo-200 bg-white px-3 py-2 focus:outline-none focus:border-indigo-500 disabled:bg-indigo-100 disabled:text-indigo-400"
        />
        <button
          onClick={handleGenerate}
          disabled={isGenerating || (mode === 'write' && !prompt.trim())}
          className="bg-indigo-600 text-white px-3.5 py-2 rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
        >
          {isGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Run
        </button>
      </div>
    </div>
  );
}

function ImagePickerModal({ onClose, onSelect }: { onClose: () => void; onSelect: (url: string) => void }) {
  const { toast } = useUiFeedback();
  const [activeTab, setActiveTab] = useState<'library' | 'upload' | 'url'>('library');
  const { files, loading, error, refresh } = useFsScan();
  const [uploading, setUploading] = useState(false);
  const [customUrl, setCustomUrl] = useState('');

  const images = files
    .filter((f) => f.startsWith('public/images/') && /\.(jpg|jpeg|png|webp|svg|gif|avif)$/i.test(f))
    .map((f) => f.replace('public/images/', ''));

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    const formData = new FormData();
    for (let i = 0; i < e.target.files.length; i++) {
      formData.append('files', e.target.files[i]);
    }
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      if (json.files && json.files.length > 0) {
        await refresh();
        const uploadedPath = json.files[0].path || `/images/${json.files[0].filename}`;
        onSelect(uploadedPath);
        toast('Image uploaded and selected', 'success');
      }
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleUseUrl = () => {
    if (!isValidImageInput(customUrl)) {
      toast('Enter a valid https://, http://, or /images/... URL', 'error');
      return;
    }
    onSelect(customUrl.trim());
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden shadow-xl border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h2 className="font-semibold text-sm text-slate-900">Select Image</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2 p-2 border-b border-slate-100 bg-white">
          {(['library', 'upload', 'url'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg capitalize ${
                activeTab === tab ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'library' &&
            (loading ? (
              <div className="flex justify-center p-4">
                <RefreshCw className="animate-spin text-slate-400" />
              </div>
            ) : error ? (
              <div className="text-red-600 text-xs">{error}</div>
            ) : images.length === 0 ? (
              <div className="text-slate-500 text-center text-xs py-8">No images in library</div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {images.map((img) => (
                  <button
                    key={img}
                    onClick={() => onSelect(`/images/${img}`)}
                    className="aspect-square bg-slate-100 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all"
                  >
                    <img
                      src={`/api/fs/raw?path=${encodeURIComponent('public/images/' + img)}`}
                      alt={img}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                ))}
              </div>
            ))}

          {activeTab === 'upload' && (
            <div className="h-full flex flex-col items-center justify-center py-8">
              <label
                className={`w-full max-w-[200px] text-center text-white rounded-xl py-2.5 px-4 font-medium text-xs transition-colors cursor-pointer ${
                  uploading ? 'bg-slate-400' : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {uploading ? 'Uploading...' : 'Select File'}
                <input type="file" className="hidden" accept="image/*" onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
          )}

          {activeTab === 'url' && (
            <div className="space-y-3 py-4">
              <input
                type="text"
                placeholder="https://example.com/image.jpg or /images/photo.jpg"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleUseUrl}
                disabled={!customUrl.trim()}
                className="w-full bg-slate-900 text-white rounded-xl py-2.5 text-xs font-medium disabled:opacity-50"
              >
                Use URL
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PublishButton() {
  const { toast, confirm } = useUiFeedback();
  const [status, setStatus] = useState<'idle' | 'publishing' | 'success' | 'error'>('idle');

  const handlePublish = async () => {
    if (status === 'publishing') return;
    const ok = await confirm({
      title: 'Run Tests & Publish',
      message: 'This will run `npm run test:all`, commit changes in concordia_repo, rebase onto origin/main, and push.',
      confirmLabel: 'Publish',
    });
    if (!ok) return;

    setStatus('publishing');
    try {
      const res = await fetch('/api/git/push', { method: 'POST' });
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Invalid server response (${res.status})`);
      }

      if (!res.ok) throw new Error(data.error || 'Failed to publish');
      setStatus('success');
      toast(data.message || 'Published changes cleanly', 'success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err: any) {
      setStatus('error');
      toast(err.message || 'Publish failed', 'error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  return (
    <button
      onClick={handlePublish}
      disabled={status === 'publishing'}
      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors shrink-0 ${
        status === 'publishing'
          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
          : status === 'error'
          ? 'bg-red-50 text-red-700 border border-red-200'
          : status === 'success'
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'bg-indigo-600 text-white hover:bg-indigo-700'
      }`}
    >
      {status === 'publishing' ? (
        <RefreshCw size={14} className="animate-spin" />
      ) : status === 'error' ? (
        <AlertCircle size={14} />
      ) : status === 'success' ? (
        <Check size={14} />
      ) : (
        <UploadCloud size={14} />
      )}
      {status === 'publishing' ? 'Publishing...' : 'Publish'}
    </button>
  );
}
