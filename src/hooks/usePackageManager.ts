import { useState, useEffect, useCallback } from 'react';

export type PackageManager = 'bun' | 'pnpm' | 'npm';

export const PACKAGE_MANAGERS: readonly PackageManager[] = ['bun', 'pnpm', 'npm'] as const;

const PM_CHANGE_EVENT = 'concordia-pm-change';

export function getStoredPackageManager(): PackageManager {
  try {
    const saved = localStorage.getItem('packageManager');
    if (saved === 'bun' || saved === 'pnpm' || saved === 'npm') return saved;
  } catch {
    // ignore storage access issues
  }
  return 'bun';
}

export function setStoredPackageManager(pm: PackageManager) {
  try {
    localStorage.setItem('packageManager', pm);
    window.dispatchEvent(new CustomEvent(PM_CHANGE_EVENT, { detail: pm }));
  } catch {
    // ignore
  }
}

export function usePackageManager(): [PackageManager, (pm: PackageManager) => void] {
  const [pm, setPm] = useState<PackageManager>(() => getStoredPackageManager());

  useEffect(() => {
    const onCustom = (e: Event) => {
      const next = (e as CustomEvent<PackageManager>).detail;
      if (next === 'bun' || next === 'pnpm' || next === 'npm') setPm(next);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'packageManager') setPm(getStoredPackageManager());
    };
    window.addEventListener(PM_CHANGE_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PM_CHANGE_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const updatePm = useCallback((next: PackageManager) => {
    setPm(next);
    setStoredPackageManager(next);
  }, []);

  return [pm, updatePm];
}

export function buildPmRunCommand(pm: PackageManager, script: string, extraArgs: string[] = []) {
  if (pm === 'bun') {
    return {
      cmd: 'bun',
      args: ['run', script, ...(extraArgs.length ? ['--', ...extraArgs] : [])],
      display: `bun run ${script}${extraArgs.length ? ` -- ${extraArgs.join(' ')}` : ''}`,
    };
  }
  if (pm === 'pnpm') {
    return {
      cmd: 'npx',
      args: ['pnpm', 'run', script, ...(extraArgs.length ? ['--', ...extraArgs] : [])],
      display: `pnpm run ${script}${extraArgs.length ? ` -- ${extraArgs.join(' ')}` : ''}`,
    };
  }
  return {
    cmd: 'npm',
    args: ['run', script, ...(extraArgs.length ? ['--', ...extraArgs] : [])],
    display: `npm run ${script}${extraArgs.length ? ` -- ${extraArgs.join(' ')}` : ''}`,
  };
}

export function buildPmInstallCommand(pm: PackageManager) {
  if (pm === 'bun') {
    return { cmd: 'bun', args: ['install'], display: 'bun install' };
  }
  if (pm === 'pnpm') {
    return { cmd: 'npx', args: ['pnpm', 'install'], display: 'pnpm install' };
  }
  return { cmd: 'npm', args: ['install'], display: 'npm install' };
}

export function stripAnsi(text: string): string {
  // Strip CSI / ANSI escape sequences for clean terminal log display
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
}
