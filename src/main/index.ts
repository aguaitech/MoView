import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import logger from './logger';
import { settingsStore } from './settings';
import { appMonitor } from './appMonitor';
import { contextSwitchService } from './contextSwitch';
import type {
  ActiveAppSnapshot,
  AppSettings,
  ApplicationPickerResult,
  AutomationState,
  PresenceUpdatePayload
} from '../shared/types';

const execFileAsync = promisify(execFile);
const platform = os.platform();

let mainWindow: BrowserWindow | null = null;
let presenceState: PresenceUpdatePayload = {
  hasVisitor: false,
  confidence: 0,
  recognizedSafe: false,
  movementScore: 0,
  matchedSafeIds: [],
  timestamp: Date.now()
};
let activeAppState: ActiveAppSnapshot | undefined;
let visitorFrameStreak = 0;
let lastSwitchAt: number | undefined;

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 960,
    minHeight: 600,
    title: 'MoView',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    await mainWindow.loadURL(devServer);
    try {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    } catch (error) {
      logger.warn('[main] failed to open devtools', error);
    }
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.once('did-finish-load', () => {
    void broadcastAutomationState();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const broadcastAutomationState = async () => {
  const settings = await settingsStore.get();
  const cooldownMs = settings.detection.cooldownSeconds * 1000;
  const cooldownActive = Boolean(lastSwitchAt) && Date.now() - (lastSwitchAt ?? 0) < cooldownMs;

  const payload: AutomationState = {
    presence: {
      hasVisitor: presenceState.hasVisitor,
      confidence: presenceState.confidence,
      recognizedSafe: Boolean(presenceState.recognizedSafe),
      movementScore: presenceState.movementScore ?? 0,
      lastUpdated: presenceState.timestamp,
      matchedSafeIds: presenceState.matchedSafeIds ?? []
    },
    activeApp: activeAppState,
    lastSwitchAt,
    cooldownActive,
    errors: []
  };

  mainWindow?.webContents.send('automation:state', payload);
};

const maybeTriggerSwitch = async () => {
  const settings = await settingsStore.get();
  const { detection } = settings;
  const cooldownMs = detection.cooldownSeconds * 1000;
  const cooldownActive = lastSwitchAt && Date.now() - lastSwitchAt < cooldownMs;

  if (!detection.enableAutoSwitch) {
    return;
  }

  if (cooldownActive) {
    return;
  }

  if (!presenceState.hasVisitor || visitorFrameStreak < detection.framesBeforeTrigger) {
    return;
  }

  if (!activeAppState?.isGameActive) {
    return;
  }

  const result = await contextSwitchService.activateFirstAvailable(settings.apps.workTargets);
  if (result.success) {
    lastSwitchAt = Date.now();
    logger.info('[automation] switch triggered', result.target?.name);
  } else {
    logger.warn('[automation] no work target succeeded', result.error);
  }

  void broadcastAutomationState();
};

const setupIpc = async () => {
  ipcMain.handle('settings:get', async () => settingsStore.get());
  ipcMain.handle('settings:update', async (_event, settings: AppSettings) => {
    await settingsStore.set(settings);
    const next = await settingsStore.get();
    void broadcastAutomationState();
    return next;
  });
  ipcMain.handle('settings:browse-application', async () => browseForApplication());

  ipcMain.on('automation:presence', (_event, payload: PresenceUpdatePayload) => {
    presenceState = payload;
    visitorFrameStreak = payload.hasVisitor ? visitorFrameStreak + 1 : 0;
    void broadcastAutomationState();
    void maybeTriggerSwitch();
  });

  ipcMain.handle('automation:force-switch', async () => {
    const settings = await settingsStore.get();
    const result = await contextSwitchService.activateFirstAvailable(settings.apps.workTargets);
    if (result.success) {
      lastSwitchAt = Date.now();
      void broadcastAutomationState();
    }
    return result;
  });

  ipcMain.handle('automation:open-external', (_event, url: string) => {
    void shell.openExternal(url);
  });

  ipcMain.handle('automation:get-active-app', async () => activeAppState ?? null);
  ipcMain.handle('automation:focus-self', () => {
    if (!mainWindow) {
      return;
    }
    if (process.platform === 'darwin') {
      app.focus({ steal: true });
    }
    mainWindow.show();
    mainWindow.focus();
  });

  await settingsStore.onDidChange((settings) => {
    mainWindow?.webContents.send('settings:changed', settings);
  });

  appMonitor.on('update', (snapshot) => {
    activeAppState = snapshot;
    void broadcastAutomationState();
    void maybeTriggerSwitch();
  });

  appMonitor.on('error', (error) => {
    logger.error('[app-monitor] error', error);
    mainWindow?.webContents.send('automation:error', { message: error.message });
  });
};

app.on('ready', async () => {
  await createWindow();
  await setupIpc();
  appMonitor.start();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

process.on('uncaughtException', (error) => {
  logger.error('[main] uncaught exception', error);
  dialog.showErrorBox('MoView Error', error.message);
});

async function browseForApplication(): Promise<ApplicationPickerResult | null> {
  const window = mainWindow ?? BrowserWindow.getFocusedWindow();
  const options: Electron.OpenDialogOptions = {
    title: '选择应用程序',
    properties: platform === 'darwin' ? ['openDirectory'] : ['openFile']
  };

  if (platform === 'win32') {
    options.filters = [{ name: '可执行程序', extensions: ['exe', 'lnk', 'bat', 'cmd'] }];
  }

  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];

  if (platform === 'darwin') {
    const name = path.basename(selectedPath).replace(/\.app$/i, '') || path.basename(selectedPath);
    const bundleId = await resolveMacBundleId(selectedPath);
    return {
      name,
      path: selectedPath,
      macBundleId: bundleId,
      macProcessName: name || undefined
    };
  }

  if (platform === 'win32') {
    const parsed = path.parse(selectedPath);
    const name = parsed.name;
    return {
      name,
      path: selectedPath,
      winCommand: selectedPath,
      winProcessName: name
    };
  }

  return {
    name: path.basename(selectedPath),
    path: selectedPath
  };
}

async function resolveMacBundleId(appPath: string): Promise<string | undefined> {
  if (platform !== 'darwin') {
    return undefined;
  }

  try {
    const { stdout } = await execFileAsync('mdls', ['-name', 'kMDItemCFBundleIdentifier', '-raw', appPath]);
    const identifier = stdout.trim();
    if (!identifier || identifier === '(null)') {
      return undefined;
    }
    return identifier;
  } catch (error) {
    logger.warn('[settings] failed to resolve bundle id', error);
    return undefined;
  }
}
