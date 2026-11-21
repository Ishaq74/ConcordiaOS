import { useState, useEffect, useCallback } from 'react';

export class FsApiError extends Error {
  status: number;
  stdout?: string;
  stderr?: string;
  exitCode?: number | string;

  constructor(
    message: string,
    status: number,
    extra?: { stdout?: string; stderr?: string; exitCode?: number | string }
  ) {
    super(message);
    this.name = 'FsApiError';
    this.status = status;
    this.stdout = extra?.stdout;
    this.stderr = extra?.stderr;
    this.exitCode = extra?.exitCode;
  }
}

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new FsApiError(
      `Invalid response from server (Status ${res.status}): ${text.substring(0, 120)}`,
      res.status
    );
  }
}

export function useFsRead<T = { type: string; content?: string; children?: string[] }>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);

  const fetchFile = useCallback(async () => {
    if (!path) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/fs/read?path=${encodeURIComponent(path)}`);
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new FsApiError(json.error || 'Failed to read file', res.status);
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    fetchFile();
  }, [fetchFile]);

  return { data, loading, error, refresh: fetchFile };
}

export function useFsScan() {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scanFiles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/fs/scan`);
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new FsApiError(json.error || 'Failed to scan files', res.status);
      setFiles(json.files || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    scanFiles();
  }, [scanFiles]);

  return { files, loading, error, refresh: scanFiles };
}

export async function fsRead(path: string): Promise<string> {
  const res = await fetch(`/api/fs/read?path=${encodeURIComponent(path)}`);
  const json = await parseJsonSafe(res);
  if (!res.ok) throw new FsApiError(json.error || 'Failed to read file', res.status);
  if (json.type !== 'file') throw new FsApiError('Not a file', 400);
  return json.content ?? '';
}

export async function fsWrite(path: string, content: string, createBackup = false) {
  const res = await fetch('/api/fs/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content, createBackup }),
  });
  const json = await parseJsonSafe(res);
  if (!res.ok) throw new FsApiError(json.error || 'Failed to write file', res.status);
  return json;
}

export async function fsDelete(path: string) {
  const res = await fetch('/api/fs/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  const json = await parseJsonSafe(res);
  if (!res.ok) throw new FsApiError(json.error || 'Failed to delete file', res.status);
  return json;
}

export async function execCmd(command: string, args: string[] = [], cwd?: string) {
  const res = await fetch('/api/script-runner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, args, cwd }),
  });

  const json = await parseJsonSafe(res);

  if (!res.ok) {
    throw new FsApiError(json.error || 'Failed to execute command', res.status, {
      stdout: json.stdout,
      stderr: json.stderr,
      exitCode: json.exitCode,
    });
  }
  return json;
}
