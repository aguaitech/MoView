import type {
  AppSettings,
  AutomationState,
  PresenceUpdatePayload,
  ActiveAppSnapshot,
  ApplicationPickerResult
} from '../shared/types';

declare global {
  interface Window {
    moView: {
      settings: {
        get: () => Promise<AppSettings>;
        update: (settings: AppSettings) => Promise<AppSettings>;
        onDidChange: (listener: (settings: AppSettings) => void) => () => void;
        browseApplication: () => Promise<ApplicationPickerResult | null>;
      };
      automation: {
        updatePresence: (payload: PresenceUpdatePayload) => void;
        requestImmediateSwitch: () => Promise<unknown>;
        onState: (listener: (state: AutomationState) => void) => () => void;
        onError: (listener: (payload: { message: string }) => void) => () => void;
        openExternal: (url: string) => void;
        getActiveApp: () => Promise<ActiveAppSnapshot | null>;
        focusSelf: () => Promise<void>;
      };
      system: {
        platform: NodeJS.Platform;
      };
    };
  }
}

export {};
