import React, { useState, useMemo, useEffect } from 'react';
import { useFsScan, useFsRead, fsWrite } from '../hooks/useFs';
import {
  FileText,
  BookOpen,
  Bot,
  Image as ImageIcon,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  ArrowLeft,
  Search,
  Edit3,
  Save,
  Eye,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { useUiFeedback } from '../components/UiFeedback';

export default function NotesApp({ onClose }: { onClose?: () => void }) {
  const [activeTab, setActiveTab] = useState<'docs' | 'agents' | 'media'>('docs');
  const [search, setSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<{ path: string; type: 'md' | 'img' } | null>(null);
  const { files, loading, error } = useFsScan();

  const docs = useMemo(
    () =>
      files.filter(
        (f) =>
          (f.endsWith('.md') || f.endsWith('.mdx')) &&
          !f.startsWith('.github/')
      ),
    [files]
  );

  const agentsAndGuides = useMemo(
    () =>
      files.filter(
        (f) =>
          f.startsWith('.github/') &&
          (f.endsWith('.md') || f.endsWith('.mdx'))
      ),
    [files]
  );

  const mediaAssets = useMemo(
    () =>
      files.filter(
        (f) =>
          /\.(svg|png|jpg|jpeg|webp|gif)$/i.test(f) &&
          !f.startsWith('public/images/')
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
  if (error) return <div className="p-6 text-red-600 text-sm">{error}</div>;

  if (selectedFile) {
    return <FileViewer file={selectedFile} onBack={() => setSelectedFile(null)} />;
  }

  const filterList = (list: string[]) => {
    const q = search.trim().toLowerCase();
    return q ? list.filter((f) => f.toLowerCase().includes(q)) : list;
  };

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
          <h1 className="text-xl font-semibold text-slate-900">Docs & Specs</h1>
        </div>
        <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 scrollbar-hide">
          <TabButton
            active={activeTab === 'docs'}
            onClick={() => setActiveTab('docs')}
            icon={<BookOpen size={14} />}
            label={`Project Docs (${docs.length})`}
          />
          <TabButton
            active={activeTab === 'agents'}
            onClick={() => setActiveTab('agents')}
            icon={<Bot size={14} />}
            label={`Guides & Specs (${agentsAndGuides.length})`}
          />
          <TabButton
            active={activeTab === 'media'}
            onClick={() => setActiveTab('media')}
            icon={<ImageIcon size={14} />}
            label={`Icons & Diagrams (${mediaAssets.length})`}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter documents by filename or path..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {activeTab === 'docs' && (
            <FileListView
              files={filterList(docs)}
              emptyText="No Markdown docs found."
              icon={<FileText size={18} className="text-amber-600" />}
              iconBg="bg-amber-50"
              onSelect={(path) => setSelectedFile({ path, type: 'md' })}
            />
          )}

          {activeTab === 'agents' && (
            <FileListView
              files={filterList(agentsAndGuides)}
              emptyText="No .github markdown files found."
              icon={<Bot size={18} className="text-indigo-600" />}
              iconBg="bg-indigo-50"
              onSelect={(path) => setSelectedFile({ path, type: 'md' })}
            />
          )}

          {activeTab === 'media' && (
            <FileListView
              files={filterList(mediaAssets)}
              emptyText="No non-library SVG or diagram images found."
              icon={<ImageIcon size={18} className="text-blue-600" />}
              iconBg="bg-blue-50"
              onSelect={(path) => setSelectedFile({ path, type: 'img' })}
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
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
        active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function FileListView({
  files,
  emptyText,
  icon,
  iconBg,
  onSelect,
}: {
  files: string[];
  emptyText: string;
  icon: React.ReactNode;
  iconBg: string;
  onSelect: (path: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      {files.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-sm text-slate-500 text-center">
          {emptyText}
        </div>
      )}
      {files.map((filePath) => {
        const name = filePath.split('/').pop() || filePath;
        const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : 'Root directory';
        return (
          <button
            key={filePath}
            onClick={() => onSelect(filePath)}
            className="w-full bg-white rounded-2xl p-4 border border-slate-200 flex items-center justify-between hover:border-indigo-300 transition-colors text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                {icon}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">{name}</div>
                <div className="text-xs font-mono text-slate-500 truncate">{dir}</div>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-400 shrink-0" />
          </button>
        );
      })}
    </div>
  );
}

function FileViewer({ file, onBack }: { file: { path: string; type: 'md' | 'img' }; onBack: () => void }) {
  const { toast } = useUiFeedback();
  const { data, loading, error, refresh } = useFsRead(file.type === 'md' ? file.path : null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.content !== undefined) {
      setDraft(data.content);
    }
  }, [data?.content]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await fsWrite(file.path, draft, true);
      toast(`${file.path} saved`, 'success');
      setEditing(false);
      refresh();
    } catch (e: any) {
      toast('Failed to save: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-2 sticky top-0 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="p-2 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-900 truncate">{file.path.split('/').pop()}</h1>
            <div className="text-xs font-mono text-slate-500 truncate">{file.path}</div>
          </div>
        </div>

        {file.type === 'md' && !loading && !error && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setEditing(!editing)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg flex items-center gap-1.5"
            >
              {editing ? <Eye size={13} /> : <Edit3 size={13} />}
              {editing ? 'Preview' : 'Edit'}
            </button>
            {editing && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                Save
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          {file.type === 'md' && loading && (
            <div className="flex justify-center p-8">
              <RefreshCw className="animate-spin text-slate-400" />
            </div>
          )}
          {file.type === 'md' && error && (
            <div className="text-red-700 text-sm p-4 bg-red-50 border border-red-200 rounded-xl">{error}</div>
          )}

          {file.type === 'md' && !loading && !error && data && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              {editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-full min-h-[480px] p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-800 outline-none focus:border-indigo-500 leading-relaxed"
                  spellCheck={false}
                />
              ) : (
                <div className="prose prose-sm prose-slate max-w-none">
                  <Markdown>{draft}</Markdown>
                </div>
              )}
            </div>
          )}

          {file.type === 'img' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 flex justify-center">
              <img
                src={`/api/fs/raw?path=${encodeURIComponent(file.path)}`}
                alt={file.path}
                className="max-w-full rounded-lg"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
