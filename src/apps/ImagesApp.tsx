import React, { useState, useMemo } from 'react';
import { useFsScan, fsDelete } from '../hooks/useFs';
import {
  Image as ImageIcon,
  Upload,
  Folder,
  Grid,
  List,
  ChevronLeft,
  RefreshCw,
  Search,
  Copy,
  Trash2,
  Sparkles,
  X,
} from 'lucide-react';
import { useUiFeedback } from '../components/UiFeedback';

export default function ImagesApp({ onClose }: { onClose?: () => void }) {
  const [activeTab, setActiveTab] = useState<'library' | 'upload'>('library');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { files, loading, error, refresh } = useFsScan();

  const images = useMemo(
    () =>
      files
        .filter(
          (f) =>
            f.startsWith('public/images/') &&
            /\.(jpg|jpeg|png|webp|svg|gif|avif)$/i.test(f)
        )
        .map((f) => f.replace('public/images/', '')),
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
          <h1 className="text-xl font-semibold text-slate-900">Media Library</h1>
        </div>
        <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 scrollbar-hide">
          <TabButton
            active={activeTab === 'library'}
            onClick={() => setActiveTab('library')}
            icon={<Folder size={14} />}
            label={`Library (${images.length})`}
          />
          <TabButton
            active={activeTab === 'upload'}
            onClick={() => setActiveTab('upload')}
            icon={<Upload size={14} />}
            label="Upload"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-5xl mx-auto">
          {activeTab === 'library' && (
            <LibraryView
              images={images}
              viewMode={viewMode}
              setViewMode={setViewMode}
              onRefresh={refresh}
            />
          )}
          {activeTab === 'upload' && (
            <UploadView
              onUploadSuccess={async () => {
                await refresh();
                setActiveTab('library');
              }}
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

function LibraryView({
  images,
  viewMode,
  setViewMode,
  onRefresh,
}: {
  images: string[];
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;
  onRefresh: () => void;
}) {
  const { toast, confirm } = useUiFeedback();
  const [search, setSearch] = useState('');
  const [selectedImg, setSelectedImg] = useState<string | null>(null);
  const [altResult, setAltResult] = useState<Record<string, string> | null>(null);
  const [generatingAlt, setGeneratingAlt] = useState(false);

  const filtered = images.filter((img) => img.toLowerCase().includes(search.toLowerCase()));

  const copyPath = (img: string) => {
    const publicPath = `/images/${img}`;
    navigator.clipboard?.writeText(publicPath);
    toast(`Copied ${publicPath}`, 'info');
  };

  const handleDelete = async (img: string) => {
    const ok = await confirm({
      title: 'Delete Media Asset',
      message: `Permanently delete public/images/${img}?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;

    try {
      await fsDelete(`public/images/${img}`);
      toast(`Deleted ${img}`, 'success');
      if (selectedImg === img) setSelectedImg(null);
      onRefresh();
    } catch (e: any) {
      toast('Delete failed: ' + e.message, 'error');
    }
  };

  const generateAlt = async (img: string) => {
    setGeneratingAlt(true);
    setAltResult(null);
    try {
      const res = await fetch('/api/gemini/alt-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: `/images/${img}`, bilingual: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to generate alt text');
      setAltResult(json.alt || {});
    } catch (e: any) {
      toast(e.message || 'AI alt text failed', 'error');
    } finally {
      setGeneratingAlt(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search images..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg border ${
              viewMode === 'grid' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'
            }`}
            aria-label="Grid view"
          >
            <Grid size={15} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg border ${
              viewMode === 'list' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'
            }`}
            aria-label="List view"
          >
            <List size={15} />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
          No images found in public/images/.
        </div>
      ) : (
        <div className={viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4' : 'flex flex-col gap-2.5'}>
          {filtered.map((img) => (
            <div
              key={img}
              onClick={() => {
                setSelectedImg(img);
                setAltResult(null);
              }}
              className={`bg-white rounded-2xl p-3 border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer group ${
                viewMode === 'grid' ? 'flex flex-col gap-2.5' : 'flex items-center justify-between gap-3'
              }`}
            >
              <div className={`flex items-center gap-3 min-w-0 ${viewMode === 'grid' ? 'flex-col items-stretch' : 'flex-1'}`}>
                <div
                  className={`${
                    viewMode === 'grid' ? 'aspect-square w-full' : 'w-12 h-12 shrink-0'
                  } bg-slate-100 rounded-xl flex items-center justify-center text-slate-300 overflow-hidden relative`}
                >
                  <ImageWithFallback src={`/api/fs/raw?path=${encodeURIComponent('public/images/' + img)}`} alt={img} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-900 truncate" title={img}>
                    {img.split('/').pop()}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 truncate">/images/{img}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inspection Modal */}
      {selectedImg && (
        <div
          className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedImg(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <span className="text-sm font-semibold text-slate-900 truncate">/images/{selectedImg}</span>
              <button
                onClick={() => setSelectedImg(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center max-h-[280px]">
                <img
                  src={`/api/fs/raw?path=${encodeURIComponent('public/images/' + selectedImg)}`}
                  alt={selectedImg}
                  className="max-h-[280px] object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => copyPath(selectedImg)}
                  className="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5"
                >
                  <Copy size={14} />
                  Copy Path
                </button>
                <button
                  onClick={() => generateAlt(selectedImg)}
                  disabled={generatingAlt}
                  className="flex-1 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {generatingAlt ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  AI Alt Text
                </button>
                <button
                  onClick={() => handleDelete(selectedImg)}
                  className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>

              {altResult && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-xs">
                  <div className="font-semibold text-slate-700">Suggested Multilingual Alt Text</div>
                  {Object.entries(altResult).map(([lang, text]) => (
                    <div key={lang} className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold uppercase text-indigo-700 mr-2">{lang}:</span>
                        <span className="text-slate-700">{text}</span>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(text);
                          toast(`Copied ${lang.toUpperCase()} alt text`, 'info');
                        }}
                        className="text-slate-400 hover:text-slate-700 shrink-0"
                        title="Copy"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageWithFallback({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-400">
        <ImageIcon size={24} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function UploadView({ onUploadSuccess }: { onUploadSuccess?: () => void }) {
  const { toast } = useUiFeedback();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    for (let i = 0; i < e.target.files.length; i++) {
      formData.append('files', e.target.files[i]);
    }

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Upload failed');
      }

      toast(`Uploaded ${json.files?.length || 1} image(s)`, 'success');
      if (onUploadSuccess) await onUploadSuccess();
    } catch (err: any) {
      setError(err.message);
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 flex flex-col items-center justify-center text-center max-w-lg mx-auto">
      <div
        className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 border-2 border-dashed transition-colors ${
          error ? 'bg-red-50 text-red-500 border-red-200' : 'bg-indigo-50 text-indigo-600 border-indigo-200'
        }`}
      >
        {uploading ? <RefreshCw size={28} className="animate-spin" /> : <Upload size={28} />}
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-1">
        {error ? 'Upload Failed' : 'Upload Images'}
      </h3>
      <p className="text-xs text-slate-500 mb-6">
        {error ? error : 'Supported: .jpg, .png, .webp, .gif, .avif, .svg (max 10 MB per file).'}
      </p>

      <label
        className={`w-full max-w-xs text-white rounded-xl py-2.5 px-4 font-medium text-xs transition-colors cursor-pointer flex items-center justify-center ${
          uploading ? 'bg-slate-400' : 'bg-slate-900 hover:bg-slate-800'
        }`}
      >
        {uploading ? 'Uploading...' : 'Select Image Files'}
        <input
          type="file"
          className="hidden"
          multiple
          accept="image/*"
          onChange={handleUpload}
          disabled={uploading}
        />
      </label>
    </div>
  );
}
