import React, { useState, useMemo, useEffect } from 'react';
import { useFsRead, useFsScan, fsWrite } from '../hooks/useFs';
import {
  Palette,
  Layers,
  Box,
  Type,
  Search,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Component,
  Folder,
  FileCode2,
  Copy,
  Save,
} from 'lucide-react';
import { useUiFeedback } from '../components/UiFeedback';

interface CssToken {
  name: string;
  value: string;
}

function parseCssVariables(cssContent: string): CssToken[] {
  const tokens: CssToken[] = [];
  const regex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(cssContent)) !== null) {
    tokens.push({ name: match[1].trim(), value: match[2].trim() });
  }
  return tokens;
}

function isColorValue(val: string): boolean {
  const v = val.trim().toLowerCase();
  return (
    /^#[0-9a-f]{3,8}$/i.test(v) ||
    v.startsWith('rgb(') ||
    v.startsWith('rgba(') ||
    v.startsWith('hsl(') ||
    v.startsWith('hsla(') ||
    v.startsWith('oklch(') ||
    v.startsWith('oklab(')
  );
}

export default function DesignApp({ onClose }: { onClose?: () => void }) {
  const [activeTab, setActiveTab] = useState<'tokens' | 'themes' | 'components' | 'fonts'>('tokens');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const { files, loading, error } = useFsScan();

  const themes = useMemo(
    () =>
      files
        .filter((f) => f.startsWith('src/styles/components/') && f.endsWith('.css'))
        .map((f) => f.split('/').pop()!),
    [files]
  );

  const components = useMemo(
    () =>
      files.filter(
        (f) => f.startsWith('src/components/') && (f.endsWith('.astro') || f.endsWith('.tsx') || f.endsWith('.ts'))
      ),
    [files]
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <RefreshCw className="animate-spin text-slate-400" />
      </div>
    );
  }
  if (error) {
    return <div className="p-6 text-red-600 text-sm">{error}</div>;
  }

  if (selectedFile) {
    return <FileCodeEditorView filePath={selectedFile} onBack={() => setSelectedFile(null)} />;
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
          <h1 className="text-xl font-semibold text-slate-900">Design System</h1>
        </div>
        <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 scrollbar-hide">
          <TabButton active={activeTab === 'tokens'} onClick={() => setActiveTab('tokens')} icon={<Palette size={14} />} label="Tokens" />
          <TabButton active={activeTab === 'themes'} onClick={() => setActiveTab('themes')} icon={<Layers size={14} />} label={`Themes (${themes.length})`} />
          <TabButton active={activeTab === 'components'} onClick={() => setActiveTab('components')} icon={<Box size={14} />} label={`Components (${components.length})`} />
          <TabButton active={activeTab === 'fonts'} onClick={() => setActiveTab('fonts')} icon={<Type size={14} />} label="Typography" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-5xl mx-auto">
          {activeTab === 'tokens' && <TokensView />}
          {activeTab === 'themes' && <ThemesView themes={themes} onSelect={(f) => setSelectedFile(`src/styles/components/${f}`)} />}
          {activeTab === 'components' && <ComponentsView components={components} onSelect={setSelectedFile} />}
          {activeTab === 'fonts' && <FontsView />}
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

function TokensView() {
  const { toast } = useUiFeedback();
  const [tokenFile, setTokenFile] = useState<'colors.css' | 'spacing.css' | 'components.css' | 'typography.css'>('colors.css');
  const [search, setSearch] = useState('');
  const [viewRaw, setViewRaw] = useState(false);

  const filePath = `src/styles/tokens/${tokenFile}`;
  const { data, loading, error, refresh } = useFsRead(filePath);

  const tokens = useMemo(() => parseCssVariables(data?.content || ''), [data?.content]);
  const filteredTokens = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter((t) => t.name.toLowerCase().includes(q) || t.value.toLowerCase().includes(q));
  }, [tokens, search]);

  const copyToken = (text: string) => {
    navigator.clipboard?.writeText(text);
    toast(`Copied ${text}`, 'info');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Filter CSS variables by name or value..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {(['colors.css', 'spacing.css', 'components.css', 'typography.css'] as const).map((file) => (
            <button
              key={file}
              onClick={() => setTokenFile(file)}
              className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap border transition-colors ${
                tokenFile === file
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {file.replace('.css', '')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <RefreshCw className="animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="text-sm font-semibold text-slate-900 tabular-nums">
              {tokenFile} ({filteredTokens.length} of {tokens.length} vars)
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewRaw(!viewRaw)}
                className="px-2.5 py-1 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-700"
              >
                {viewRaw ? 'Visual Grid' : 'Raw CSS'}
              </button>
              <button
                onClick={refresh}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200"
                aria-label="Refresh tokens"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          {viewRaw ? (
            <pre className="p-4 text-xs font-mono text-slate-700 bg-slate-50 whitespace-pre-wrap overflow-x-auto max-h-[540px]">
              {data?.content || 'No tokens found.'}
            </pre>
          ) : filteredTokens.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No CSS variables matching "{search}".
            </div>
          ) : (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredTokens.map((token, idx) => {
                const isColor = isColorValue(token.value);
                return (
                  <button
                    key={`${token.name}-${idx}`}
                    onClick={() => copyToken(`var(${token.name})`)}
                    className="text-left p-3 rounded-xl border border-slate-200 hover:border-indigo-300 bg-white transition-colors flex items-center gap-3 group"
                    title="Click to copy CSS var()"
                  >
                    {isColor ? (
                      <div
                        className="w-10 h-10 rounded-lg border border-slate-200 shrink-0 shadow-xs"
                        style={{ backgroundColor: token.value }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-mono text-slate-500 shrink-0">
                        CSS
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-mono font-semibold text-slate-800 truncate flex items-center justify-between gap-1">
                        <span className="truncate">{token.name}</span>
                        <Copy size={12} className="text-slate-300 group-hover:text-indigo-500 shrink-0" />
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 truncate mt-0.5">{token.value}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ThemesView({ themes, onSelect }: { themes: string[]; onSelect: (f: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {themes.length === 0 && (
        <div className="col-span-full text-sm text-slate-500 text-center py-8">No theme stylesheets found.</div>
      )}
      {themes.map((theme) => (
        <button
          key={theme}
          onClick={() => onSelect(theme)}
          className="w-full bg-white rounded-2xl p-4 border border-slate-200 flex items-center justify-between hover:border-indigo-300 transition-colors text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                theme === 'modern.css' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <Palette size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">{theme}</div>
              <div className="text-xs text-slate-500 font-mono truncate">src/styles/components/{theme}</div>
            </div>
          </div>
          <ChevronRight size={16} className="text-slate-400 shrink-0" />
        </button>
      ))}
    </div>
  );
}

function ComponentsView({ components, onSelect }: { components: string[]; onSelect: (f: string) => void }) {
  const [search, setSearch] = useState('');
  const [currentPath, setCurrentPath] = useState<string[]>([]);

  const normalizedComponents = useMemo(
    () =>
      components.map((c) => ({
        fullPath: c,
        relPath: c.replace(/^src\/components\//, ''),
      })),
    [components]
  );

  const filtered = normalizedComponents.filter((c) => c.relPath.toLowerCase().includes(search.toLowerCase()));
  const currentPrefix = currentPath.length > 0 ? currentPath.join('/') + '/' : '';
  const itemsInCurrentPath = normalizedComponents.filter((c) => c.relPath.startsWith(currentPrefix));

  const folders = new Set<string>();
  const files: { name: string; fullPath: string }[] = [];

  itemsInCurrentPath.forEach((c) => {
    const remainingPath = c.relPath.slice(currentPrefix.length);
    if (remainingPath.includes('/')) {
      folders.add(remainingPath.split('/')[0]);
    } else {
      files.push({ name: remainingPath, fullPath: c.fullPath });
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
          placeholder="Search components..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-3 border-b border-slate-200 font-medium text-sm text-slate-900 flex items-center gap-2 bg-slate-50 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setCurrentPath([])}
            className={`hover:text-indigo-600 transition-colors ${currentPath.length === 0 ? 'text-indigo-600 font-semibold' : 'text-slate-500'}`}
          >
            components
          </button>
          {currentPath.map((folder, idx) => (
            <React.Fragment key={idx}>
              <ChevronRight size={14} className="text-slate-400 shrink-0" />
              <button
                onClick={() => setCurrentPath(currentPath.slice(0, idx + 1))}
                className={`hover:text-indigo-600 transition-colors whitespace-nowrap ${idx === currentPath.length - 1 ? 'text-indigo-600 font-semibold' : 'text-slate-500'}`}
              >
                {folder}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
          {search ? (
            filtered.length === 0 ? (
              <div className="p-6 text-sm text-slate-500 text-center">No components matching "{search}".</div>
            ) : (
              filtered.map((comp) => (
                <button
                  key={comp.fullPath}
                  onClick={() => onSelect(comp.fullPath)}
                  className="w-full p-3 px-4 flex items-center justify-between hover:bg-slate-50 text-left group transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                      <Component size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{comp.relPath.split('/').pop()}</div>
                      <div className="text-xs text-slate-400 font-mono truncate">{comp.relPath}</div>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-300 shrink-0" />
                </button>
              ))
            )
          ) : (
            <>
              {sortedFolders.length === 0 && sortedFiles.length === 0 && (
                <div className="p-6 text-sm text-slate-500 text-center">Empty directory.</div>
              )}

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

              {sortedFiles.map((file) => (
                <button
                  key={file.fullPath}
                  onClick={() => onSelect(file.fullPath)}
                  className="w-full p-3 px-4 flex items-center justify-between hover:bg-slate-50 text-left transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                      <FileCode2 size={14} />
                    </div>
                    <span className="text-sm font-medium text-slate-700">{file.name}</span>
                  </div>
                  <ChevronRight size={14} className="text-slate-400" />
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FileCodeEditorView({ filePath, onBack }: { filePath: string; onBack: () => void }) {
  const { toast } = useUiFeedback();
  const { data, loading, error } = useFsRead(filePath);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.content !== undefined) {
      setDraft(data.content);
    }
  }, [data?.content]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await fsWrite(filePath, draft, true);
      toast('Stylesheet / component saved', 'success');
      setEditing(false);
    } catch (e: any) {
      toast('Save failed: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="p-2 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
            aria-label="Back"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">{filePath.split('/').pop()}</div>
            <div className="text-xs font-mono text-slate-500 truncate">{filePath}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg"
            >
              Edit Source
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setDraft(data?.content || '');
                  setEditing(false);
                }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                Save
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-6 overflow-hidden">
        <div className="max-w-5xl mx-auto h-full bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <RefreshCw className="animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <div className="p-6 text-red-600 text-sm">{error}</div>
          ) : editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 w-full p-4 font-mono text-xs text-slate-800 bg-slate-50 outline-none resize-none leading-relaxed"
              spellCheck={false}
            />
          ) : (
            <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">
              {draft || 'Empty file'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function FontsView() {
  const { data, loading, error } = useFsRead('src/styles/tokens/typography.css');
  const tokens = useMemo(() => parseCssVariables(data?.content || ''), [data?.content]);

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <RefreshCw className="animate-spin text-slate-400" />
      </div>
    );
  }
  if (error) {
    return <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>;
  }

  const fontFamilies = tokens.filter((t) => t.name.includes('font'));

  return (
    <div className="space-y-4">
      {fontFamilies.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Font Stacks ({fontFamilies.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {fontFamilies.map((f) => (
              <div key={f.name} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs font-mono font-semibold text-indigo-700">{f.name}</div>
                <div className="text-sm text-slate-900 mt-1" style={{ fontFamily: f.value }}>
                  Concordia Astro Workspace — 0123456789
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-1 truncate">{f.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 font-semibold text-sm text-slate-900 flex items-center gap-2 bg-slate-50">
          <Type size={16} className="text-rose-500" />
          Typography Tokens ({tokens.length} vars)
        </div>
        <pre className="p-4 text-xs font-mono text-slate-700 bg-slate-50 whitespace-pre-wrap overflow-x-auto max-h-[480px]">
          {data?.content || 'No typography tokens found.'}
        </pre>
      </div>
    </div>
  );
}
