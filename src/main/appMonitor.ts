import EventEmitter from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AppSettings, ActiveAppSnapshot } from '../shared/types';
import logger from './logger';
import { settingsStore } from './settings';

const execFileAsync = promisify(execFile);
const platform = os.platform();

interface RawWindowInfo {
  name?: string;
  title?: string;
  bundleId?: string;
  processPath?: string;
}

interface AppMonitorEvents {
  update: (snapshot: ActiveAppSnapshot) => void;
  error: (error: Error) => void;
}

type EventKeys = keyof AppMonitorEvents;

export class AppMonitor extends EventEmitter {
  private pollTimer?: NodeJS.Timeout;
  private readonly pollIntervalMs: number;

  constructor(pollIntervalMs = 2000) {
    super();
    this.pollIntervalMs = pollIntervalMs;
  }

  on<T extends EventKeys>(event: T, listener: AppMonitorEvents[T]): this {
    return super.on(event, listener);
  }

  override emit<T extends EventKeys>(event: T, ...args: Parameters<AppMonitorEvents[T]>): boolean {
    return super.emit(event, ...args);
  }

  start(): void {
    if (this.pollTimer) {
      return;
    }
    void this.poll();
    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
    logger.info('[app-monitor] started');
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
      logger.info('[app-monitor] stopped');
    }
  }

  private async poll(): Promise<void> {
    try {
      const windowInfo = await this.fetchActiveWindow();
      const settings = await settingsStore.get();
      const snapshot = this.evaluate(windowInfo ?? null, settings);
      this.emit('update', snapshot);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', err);
    }
  }

  private evaluate(windowInfo: RawWindowInfo | null, settings: AppSettings): ActiveAppSnapshot {
    const now = Date.now();

    if (!windowInfo) {
      return {
        isBlacklisted: false,
        isWhitelisted: false,
        isGameActive: false,
        lastUpdated: now
      };
    }

    const normalized = (value?: string | null) => value?.toLowerCase().trim() ?? '';

    const baseProcessName = windowInfo.processPath ? path.basename(windowInfo.processPath) : undefined;
    const ownerName = windowInfo.name ?? baseProcessName ?? '';
    const title = windowInfo.title ?? '';
    const bundleId = windowInfo.bundleId;
    const processPath = windowInfo.processPath;

    const candidatesByField: Record<'name' | 'title' | 'bundle' | 'process', string[]> = {
      name: [normalized(ownerName)].filter(Boolean),
      title: [normalized(title)].filter(Boolean),
      bundle: [normalized(bundleId)].filter(Boolean),
      process: [normalized(processPath), normalized(ownerName)].filter(Boolean)
    };

    const collectCandidates = () => {
      switch (settings.apps.matchStrategy) {
        case 'title':
          return candidatesByField.title;
        case 'process':
          return candidatesByField.process;
        case 'bundle':
          return candidatesByField.bundle;
        case 'any':
        default:
          return [...candidatesByField.title, ...candidatesByField.process, ...candidatesByField.bundle];
      }
    };

    const selectedCandidates = collectCandidates();

    const matches = (rules: string[]) => {
      return rules.find((rule) => {
        const target = normalized(rule);
        if (!target) {
          return false;
        }
        return selectedCandidates.some((candidate) => candidate.includes(target));
      });
    };

    const matchedWhitelist = matches(settings.apps.gameWhitelist);
    const matchedBlacklist = matches(settings.apps.gameBlacklist);

    let isBlacklisted = false;
    let isWhitelisted = false;
    if (settings.apps.listMode === 'whitelist') {
      isWhitelisted = Boolean(matchedWhitelist);
      isBlacklisted = !isWhitelisted;
    } else {
      isWhitelisted = Boolean(matchedWhitelist);
      isBlacklisted = Boolean(matchedBlacklist);
    }
    const isGameActive = settings.apps.listMode === 'whitelist' ? !isWhitelisted : isBlacklisted && !isWhitelisted;

    return {
      name: ownerName,
      title,
      bundleId: bundleId ?? undefined,
      processPath: processPath ?? undefined,
      isBlacklisted,
      isWhitelisted,
      isGameActive,
      matchedRule: matchedBlacklist ?? matchedWhitelist ?? undefined,
      lastUpdated: now
    };
  }

  private async fetchActiveWindow(): Promise<RawWindowInfo | null> {
    if (platform === 'darwin') {
      return this.fetchActiveWindowMac();
    }
    if (platform === 'win32') {
      return this.fetchActiveWindowWindows();
    }
    return null;
  }

  private async fetchActiveWindowMac(): Promise<RawWindowInfo | null> {
    const script = `
      set appName to ""
      set windowTitle to ""
      set bundleId to ""
      set appPath to ""
      tell application "System Events"
        set frontProcess to first process whose frontmost is true
        set appName to name of frontProcess
        try
          tell frontProcess
            set windowTitle to name of window 1
          end tell
        end try
        try
          set bundleId to bundle identifier of frontProcess
        end try
        try
          set appPath to POSIX path of (file of frontProcess as alias)
        end try
      end tell
      return appName & "\n" & windowTitle & "\n" & bundleId & "\n" & appPath
    `;

    try {
      const { stdout } = await execFileAsync('osascript', ['-e', script]);
      const lines = stdout.split(/\r?\n/);
      const [name, title, rawBundleId, rawProcessPath] = [lines[0], lines[1], lines[2], lines[3]];
      const processPath = rawProcessPath?.trim() || undefined;
      let bundleId = rawBundleId?.trim() || undefined;

      const needsResolution = (!bundleId || bundleId.startsWith('com.todesktop')) && Boolean(processPath);
      if (needsResolution && processPath) {
        const appBundlePath = extractAppBundlePath(processPath);
        if (appBundlePath) {
          const resolved = await resolveMacBundleId(appBundlePath);
          if (resolved) {
            bundleId = resolved;
          }
        }
      }

      return {
        name: name?.trim() || undefined,
        title: title?.trim() || undefined,
        bundleId,
        processPath
      };
    } catch (error) {
      logger.warn('[app-monitor] failed to fetch mac active window', error);
      return null;
    }
  }

  private async fetchActiveWindowWindows(): Promise<RawWindowInfo | null> {
    const script = `
      Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public class User32 {
        [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();
        [DllImport(\"user32.dll\")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
        [DllImport(\"user32.dll\")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int processId);
      }
"@
      $hwnd = [User32]::GetForegroundWindow()
      if ($hwnd -eq [IntPtr]::Zero) { return }
      $buffer = New-Object System.Text.StringBuilder 512
      [User32]::GetWindowText($hwnd, $buffer, $buffer.Capacity) | Out-Null
      $title = $buffer.ToString()
      $pid = 0
      [User32]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
      if ($pid -eq 0) { return }
      $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
      if (-not $process) { return }
      $path = $process.Path
      $name = $process.ProcessName
      [pscustomobject]@{
        name = $name
        title = $title
        processPath = $path
      } | ConvertTo-Json -Compress
    `;

    try {
      const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', script]);
      const trimmed = stdout.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = JSON.parse(trimmed) as { name?: string; title?: string; processPath?: string };
      return {
        name: parsed.name,
        title: parsed.title,
        processPath: parsed.processPath
      };
    } catch (error) {
      logger.warn('[app-monitor] failed to fetch windows active window', error);
      return null;
    }
  }
}

export const appMonitor = new AppMonitor();

function extractAppBundlePath(filePath: string): string | undefined {
  if (!filePath) {
    return undefined;
  }

  if (filePath.endsWith('.app')) {
    return filePath;
  }

  const marker = '.app/';
  const index = filePath.indexOf(marker);
  if (index !== -1) {
    return filePath.slice(0, index + 4);
  }

  const altIndex = filePath.indexOf('.app');
  if (altIndex !== -1) {
    return `${filePath.slice(0, altIndex + 4)}`;
  }

  return undefined;
}

async function resolveMacBundleId(appPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('mdls', ['-name', 'kMDItemCFBundleIdentifier', '-raw', appPath]);
    const identifier = stdout.trim();
    if (!identifier || identifier === '(null)') {
      return undefined;
    }
    return identifier;
  } catch (error) {
    logger.warn('[app-monitor] mdls bundle resolution failed', { appPath, error });
    return undefined;
  }
}
