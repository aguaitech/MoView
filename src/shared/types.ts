export interface WorkTarget {
  name: string;
  /**
   * macOS bundle identifier，例如 com.microsoft.VSCode。
   */
  macBundleId?: string;
  /**
   * macOS 进程名称（用于 AppleScript 激活与最大化）。
   */
  macProcessName?: string;
  /**
   * Windows 启动命令，可以是绝对路径或 AppUserModelID。
   */
  winCommand?: string;
  /**
   * Windows 进程名（不含扩展名），用于前置既有窗口。
   */
  winProcessName?: string;
  /**
   * 可选的附加启动参数。
   */
  args?: string[];
}

export interface SafeFaceProfile {
  id: string;
  label: string;
  descriptor: number[];
  createdAt: number;
}

export interface DetectionSettings {
  enableAutoSwitch: boolean;
  previewEnabled: boolean;
  previewVisible: boolean;
  presenceThreshold: number;
  framesBeforeTrigger: number;
  cooldownSeconds: number;
  sampleIntervalMs: number;
  faceRecognitionThreshold: number;
  motionSensitivity: number;
  motionRegionEnabled: boolean;
  motionRegion: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  safeFaces: SafeFaceProfile[];
  cameraDeviceId?: string;
}

export type MatchStrategy = 'any' | 'title' | 'process' | 'bundle';

export type ListMode = 'blacklist' | 'whitelist';

export interface AppSettings {
  detection: DetectionSettings;
  apps: {
    gameBlacklist: string[];
    gameWhitelist: string[];
    workTargets: WorkTarget[];
    matchStrategy: MatchStrategy;
    listMode: ListMode;
  };
}

export interface PresenceSnapshot {
  hasVisitor: boolean;
  confidence: number;
  recognizedSafe: boolean;
  movementScore: number;
  lastUpdated: number;
  matchedSafeIds?: string[];
}

export interface ActiveAppSnapshot {
  name?: string;
  title?: string;
  bundleId?: string;
  processPath?: string;
  isBlacklisted: boolean;
  isWhitelisted: boolean;
  isGameActive: boolean;
  matchedRule?: string;
  lastUpdated: number;
}

export interface AutomationState {
  presence: PresenceSnapshot;
  activeApp?: ActiveAppSnapshot;
  lastSwitchAt?: number;
  cooldownActive: boolean;
  errors?: string[];
}

export interface PresenceUpdatePayload {
  hasVisitor: boolean;
  confidence: number;
  timestamp: number;
  recognizedSafe: boolean;
  movementScore: number;
  matchedSafeIds?: string[];
}

export interface ApplicationPickerResult {
  name: string;
  path: string;
  macBundleId?: string;
  macProcessName?: string;
  winCommand?: string;
  winProcessName?: string;
}
