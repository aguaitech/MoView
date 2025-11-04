import type { AppSettings, SafeFaceProfile } from '../shared/types';
import {
  DEFAULT_SETTINGS,
  mergeAppSettings,
  mergeDetectionSettings,
  normalizeSafeFace,
  sanitizeSettings
} from './settingsUtils';

interface StoreInstance {
  get<Key extends keyof AppSettings>(key: Key): AppSettings[Key] | undefined;
  set<Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]): void;
  set(values: Partial<AppSettings>): void;
  onDidChange<Key extends keyof AppSettings>(key: Key, handler: (value: AppSettings[Key] | undefined) => void): () => void;
}

type StoreConstructor = new (options?: unknown) => StoreInstance;

type ChangeListener = (settings: AppSettings) => void;

export class SettingsStore {
  private storePromise?: Promise<StoreInstance>;
  private store?: StoreInstance;
  private cache: AppSettings = sanitizeSettings(DEFAULT_SETTINGS);
  private listeners = new Set<ChangeListener>();

  constructor() {
    void this.ensureInitialized();
  }

  private async loadModule(): Promise<StoreConstructor> {
    const dynamicImport = new Function('modulePath', 'return import(modulePath);') as (modulePath: string) => Promise<{ default?: StoreConstructor }>;
    const mod = await dynamicImport('electron-store');
    if (!mod.default) {
      throw new Error('Failed to load electron-store module');
    }
    return mod.default as unknown as StoreConstructor;
  }

  private async ensureInitialized(): Promise<StoreInstance> {
    if (this.store) {
      return this.store;
    }

    if (!this.storePromise) {
      this.storePromise = (async () => {
        const StoreCtor = await this.loadModule();
        const instance = new StoreCtor({
          name: 'moview-settings',
          defaults: DEFAULT_SETTINGS
        });

        this.store = instance;
        this.refreshCache();

        const updateCache = () => this.refreshCache();
        instance.onDidChange('detection', updateCache);
        instance.onDidChange('apps', updateCache);

        return instance;
      })();
    }

    return this.storePromise;
  }

  private refreshCache() {
    if (!this.store) {
      this.cache = sanitizeSettings(DEFAULT_SETTINGS);
    } else {
      const detection = this.store.get('detection') ?? DEFAULT_SETTINGS.detection;
      const apps = this.store.get('apps') ?? DEFAULT_SETTINGS.apps;
      this.cache = sanitizeSettings({ detection, apps });
    }
    this.listeners.forEach((listener) => listener(this.cache));
  }

  async get(): Promise<AppSettings> {
    await this.ensureInitialized();
    return this.cache;
  }

  getSync(): AppSettings {
    return this.cache;
  }

  async set(next: AppSettings): Promise<void> {
    const store = await this.ensureInitialized();
    const sanitized = sanitizeSettings(next);
    store.set('detection', sanitized.detection);
    store.set('apps', sanitized.apps);
    this.cache = sanitized;
    this.listeners.forEach((listener) => listener(this.cache));
  }

  async update(partial: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.get();
    const merged = sanitizeSettings({
      detection: mergeDetectionSettings(current.detection, partial.detection),
      apps: mergeAppSettings(current.apps, partial.apps)
    });
    const store = await this.ensureInitialized();
    store.set('detection', merged.detection);
    store.set('apps', merged.apps);
    this.cache = merged;
    this.listeners.forEach((listener) => listener(this.cache));
    return merged;
  }

  async replaceSafeFaces(nextFaces: SafeFaceProfile[]): Promise<AppSettings> {
    const current = await this.get();
    const merged = sanitizeSettings({
      detection: {
        ...current.detection,
        safeFaces: nextFaces.map(normalizeSafeFace)
      },
      apps: current.apps
    });

    const store = await this.ensureInitialized();
    store.set('detection', merged.detection);
    store.set('apps', merged.apps);
    this.cache = merged;
    this.listeners.forEach((listener) => listener(this.cache));
    return merged;
  }

  async onDidChange(listener: ChangeListener): Promise<() => void> {
    this.listeners.add(listener);
    listener(this.cache);
    await this.ensureInitialized();
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const settingsStore = new SettingsStore();
