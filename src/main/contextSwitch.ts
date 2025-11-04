import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import logger from './logger';
import type { WorkTarget } from '../shared/types';

const execFileAsync = promisify(execFile);

const platform = os.platform();

function escapeAppleScript(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function extractProcessName(command?: string) {
  if (!command) {
    return undefined;
  }

  const normalized = command.replace(/"/g, '').trim();
  if (normalized.endsWith('.exe')) {
    return path.basename(normalized, '.exe');
  }
  const base = path.basename(normalized);
  return base ? base : undefined;
}

function composeArgs(args?: string[]): string {
  if (!args || args.length === 0) {
    return '';
  }
  const escaped = args.map((arg) => `'${arg.replace(/'/g, "''")}'`).join(', ');
  return ` -ArgumentList ${escaped}`;
}

export class ContextSwitchService {
  async activateFirstAvailable(targets: WorkTarget[]): Promise<{ success: boolean; target?: WorkTarget; error?: string }> {
    for (const target of targets) {
      try {
        if (platform === 'darwin') {
          await this.focusOnMac(target);
        } else if (platform === 'win32') {
          await this.focusOnWindows(target);
        } else {
          logger.warn('[context-switch] Unsupported platform. No action taken.');
          return { success: false, error: 'unsupported-platform' };
        }
        logger.info('[context-switch] Activation succeeded for', target.name);
        return { success: true, target };
      } catch (error) {
        logger.error('[context-switch] Activation failed', target, error);
      }
    }

    return { success: false, error: 'all-targets-failed' };
  }

  private async focusOnMac(target: WorkTarget): Promise<void> {
    const bundleId = target.macBundleId;
    const processName = target.macProcessName ?? target.name;
    const escapedProcess = escapeAppleScript(processName || target.name);
    const appReference = bundleId ? `application id "${escapeAppleScript(bundleId)}"` : `application "${escapeAppleScript(target.name)}"`;

    const script = `
if application "System Events" is not running then
  tell application "System Events" to launch
end if
tell ${appReference}
  activate
  reopen
end tell
delay 0.1
tell application "System Events"
  if not (exists process "${escapedProcess}") then return
  tell process "${escapedProcess}"
    set frontmost to true
    try
      repeat with w in windows
        if exists attribute "AXFullScreen" of w then
          set value of attribute "AXFullScreen" of w to true
        else
          tell w to perform action "AXZoom"
        end if
        exit repeat
      end repeat
    end try
  end tell
end tell
`;

    await execFileAsync('osascript', ['-e', script]);
  }

  private async focusOnWindows(target: WorkTarget): Promise<void> {
    const candidates = [target.winProcessName, extractProcessName(target.winCommand), extractProcessName(target.name)]
      .filter((value, index, arr) => value && arr.indexOf(value) === index) as string[];

    const script = `
$names = @(${candidates.map((name) => `'${name.replace(/'/g, "''")}'`).join(', ')})
$process = $null
foreach ($name in $names) {
  $process = Get-Process -Name $name -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Select-Object -First 1
  if ($process) { break }
}
if ($process) {
  $sig = @"
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
  Add-Type $sig -ErrorAction SilentlyContinue | Out-Null
  [Win32]::ShowWindowAsync($process.MainWindowHandle, 3) | Out-Null
  [Win32]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
} else {
  ${this.composeStartProcess(target)}
}
`;

    await execFileAsync('powershell', ['-NoProfile', '-Command', script]);
  }

  private composeStartProcess(target: WorkTarget): string {
    const command = target.winCommand ?? target.name;
    const escaped = command.replace(/'/g, "''");
    return `Start-Process -FilePath '${escaped}'${composeArgs(target.args)}`;
  }
}

export const contextSwitchService = new ContextSwitchService();
