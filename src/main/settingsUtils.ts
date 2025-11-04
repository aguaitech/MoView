import crypto from 'node:crypto';
import type { AppSettings, SafeFaceProfile } from '../shared/types';

export const DEFAULT_SETTINGS: AppSettings = {
  detection: {
    enableAutoSwitch: false,
    previewEnabled: true,
    previewVisible: true,
    presenceThreshold: 0.6,
    framesBeforeTrigger: 2,
    cooldownSeconds: 15,
    sampleIntervalMs: 100,
    faceRecognitionThreshold: 0.42,
    motionSensitivity: 0.05,
    motionRegionEnabled: false,
    motionRegion: {
      x: 0,
      y: 0,
      width: 1,
      height: 1
    },
    safeFaces: [],
    cameraDeviceId: undefined
  },
  apps: {
    gameBlacklist: [],
    gameWhitelist: [],
    workTargets: [],
    matchStrategy: 'any',
    listMode: 'blacklist'
  }
};

export function sanitizeList(list: string[]) {
  return Array.from(
    new Set(
      list
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );
}

function extractWinProcessName(command?: string, fallback?: string) {
  if (!command) {
    return fallback;
  }

  const withoutQuotes = command.replace(/"/g, '').trim();
  if (!withoutQuotes) {
    return fallback;
  }

  const segments = withoutQuotes.split(/[/\\]/);
  const last = segments[segments.length - 1];
  if (!last) {
    return fallback;
  }

  const cleaned = last.replace(/\.exe$/i, '');
  return cleaned || fallback;
}

export function normalizeSafeFace(profile: SafeFaceProfile): SafeFaceProfile {
  return {
    ...profile,
    id: profile.id || crypto.randomUUID(),
    label: profile.label?.trim() || '未命名',
    descriptor: profile.descriptor.map((value) => Number(value)),
    createdAt: profile.createdAt ?? Date.now()
  };
}

function sanitizeMatchStrategy(strategy: unknown): 'any' | 'title' | 'process' | 'bundle' {
  if (strategy === 'title' || strategy === 'process' || strategy === 'bundle') {
    return strategy;
  }
  return 'any';
}

function sanitizeRegion(region: AppSettings['detection']['motionRegion']): AppSettings['detection']['motionRegion'] {
  const clamp = (value: number) => Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 1);
  const width = clamp(region.width);
  const height = clamp(region.height);
  return {
    x: clamp(region.x),
    y: clamp(region.y),
    width: width <= 0 ? 1 : width,
    height: height <= 0 ? 1 : height
  };
}

export function sanitizeSettings(input: AppSettings): AppSettings {
  const detectionInput = {
    ...DEFAULT_SETTINGS.detection,
    ...input.detection,
    motionRegion: {
      ...DEFAULT_SETTINGS.detection.motionRegion,
      ...(input.detection.motionRegion ?? {})
    }
  };

  return {
    detection: {
      ...detectionInput,
      previewEnabled: Boolean(detectionInput.previewEnabled),
      previewVisible: Boolean(detectionInput.previewVisible),
      presenceThreshold: Math.min(Math.max(detectionInput.presenceThreshold, 0), 1),
      framesBeforeTrigger: Math.max(1, Math.round(detectionInput.framesBeforeTrigger)),
      cooldownSeconds: Math.max(1, Math.round(detectionInput.cooldownSeconds)),
      sampleIntervalMs: Math.max(50, Math.round(detectionInput.sampleIntervalMs)),
      faceRecognitionThreshold: Math.min(Math.max(detectionInput.faceRecognitionThreshold, 0), 1),
      motionSensitivity: Math.min(Math.max(detectionInput.motionSensitivity, 0.01), 1),
      motionRegionEnabled: Boolean(detectionInput.motionRegionEnabled),
      motionRegion: sanitizeRegion(detectionInput.motionRegion),
      safeFaces: detectionInput.safeFaces.map(normalizeSafeFace)
    },
    apps: {
      gameBlacklist: sanitizeList(input.apps.gameBlacklist ?? DEFAULT_SETTINGS.apps.gameBlacklist),
      gameWhitelist: sanitizeList(input.apps.gameWhitelist ?? DEFAULT_SETTINGS.apps.gameWhitelist),
      workTargets: (input.apps.workTargets ?? DEFAULT_SETTINGS.apps.workTargets).map((target) => {
        const name = target.name.trim();
        const macBundleId = target.macBundleId?.trim();
        const macProcessName = target.macProcessName?.trim();
        const winCommandRaw = target.winCommand?.trim();
        const winProcess = target.winProcessName?.trim();

        return {
          ...target,
          name,
          macBundleId: macBundleId || undefined,
          macProcessName: macProcessName || name || undefined,
          winCommand: winCommandRaw ? winCommandRaw : undefined,
          winProcessName: winProcess || extractWinProcessName(winCommandRaw, undefined),
          args: target.args?.map((value) => value.trim()).filter((value) => value.length > 0) ?? []
        };
      }),
      matchStrategy: sanitizeMatchStrategy(input.apps.matchStrategy),
      listMode: input.apps.listMode === 'whitelist' ? 'whitelist' : 'blacklist'
    }
  };
}

export function mergeDetectionSettings(current: AppSettings['detection'], next?: Partial<AppSettings['detection']>) {
  if (!next) {
    return current;
  }
  return sanitizeSettings({
    detection: {
      ...current,
      ...next,
      previewVisible: next.previewVisible ?? current.previewVisible,
      motionRegion: sanitizeRegion(next.motionRegion ?? current.motionRegion),
      safeFaces: (next.safeFaces ?? current.safeFaces).map(normalizeSafeFace)
    },
    apps: DEFAULT_SETTINGS.apps
  }).detection;
}

export function mergeAppSettings(current: AppSettings['apps'], next?: Partial<AppSettings['apps']>) {
  if (!next) {
    return current;
  }
  return sanitizeSettings({
    detection: DEFAULT_SETTINGS.detection,
    apps: {
      gameBlacklist: next.gameBlacklist ?? current.gameBlacklist,
      gameWhitelist: next.gameWhitelist ?? current.gameWhitelist,
      workTargets: next.workTargets ?? current.workTargets,
      matchStrategy: next.matchStrategy ?? current.matchStrategy,
      listMode: next.listMode ?? current.listMode
    }
  }).apps;
}
