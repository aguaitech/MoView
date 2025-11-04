import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, AutomationState, PresenceUpdatePayload } from '../shared/types';

type Listener<T> = (payload: T) => void;

function registerListener<T>(channel: string, listener: Listener<T>) {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    update: (next: AppSettings): Promise<AppSettings> => ipcRenderer.invoke('settings:update', next),
    onDidChange: (listener: Listener<AppSettings>) => registerListener<AppSettings>('settings:changed', listener),
    browseApplication: (): Promise<import('../shared/types').ApplicationPickerResult | null> =>
      ipcRenderer.invoke('settings:browse-application')
  },
  automation: {
    updatePresence: (payload: PresenceUpdatePayload) => ipcRenderer.send('automation:presence', payload),
    requestImmediateSwitch: () => ipcRenderer.invoke('automation:force-switch'),
    onState: (listener: Listener<AutomationState>) => registerListener<AutomationState>('automation:state', listener),
    onError: (listener: Listener<{ message: string }>) => registerListener<{ message: string }>('automation:error', listener),
    openExternal: (url: string) => ipcRenderer.invoke('automation:open-external', url),
    getActiveApp: (): Promise<import('../shared/types').ActiveAppSnapshot | null> =>
      ipcRenderer.invoke('automation:get-active-app'),
    focusSelf: (): Promise<void> => ipcRenderer.invoke('automation:focus-self')
  },
  system: {
    platform: process.platform
  }
};

contextBridge.exposeInMainWorld('moView', api);

declare global {
  interface Window {
    moView: typeof api;
  }
}
