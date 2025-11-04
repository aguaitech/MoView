import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, ActiveAppSnapshot, ApplicationPickerResult, WorkTarget } from '@shared/types';
import { useSettings } from './hooks/useSettings';
import { useAutomationState } from './hooks/useAutomationState';
import { usePresenceDetector } from './hooks/usePresenceDetector';
import { EditableList } from './components/EditableList';
import { WorkTargetList } from './components/WorkTargetList';
import { SafeFaceManager } from './components/SafeFaceManager';
import { SliderInput } from './components/SliderInput';

const formatTimestamp = (timestamp?: number) => {
  if (!timestamp) {
    return '-';
  }
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

export default function App() {
  const { settings, loading, error, updateSettings } = useSettings();
  const { state: automationState, error: automationError } = useAutomationState();
  const {
    videoRef,
    status: detectorStatus,
    confidence,
    hasVisitor,
    recognizedSafe,
    movementScore,
    matchedSafeIds,
    error: detectorError,
    registerSafeFace
  } = usePresenceDetector(settings);
  const [forceLoading, setForceLoading] = useState(false);
  const [countdown, setCountdown] = useState<{ message: string; seconds: number } | null>(null);
  const countdownTimerRef = useRef<number>();
  const platform = window.moView.system.platform;

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        window.clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  const activeAppName = useMemo(() => {
    if (!automationState?.activeApp) {
      return '未知';
    }
    const { name, title } = automationState.activeApp;
    return name || title || '未知';
  }, [automationState]);

  const recognizedNames = useMemo(() => {
    if (!settings || matchedSafeIds.length === 0) {
      return [] as string[];
    }
    const map = new Map(settings.detection.safeFaces.map((face) => [face.id, face.label] as const));
    return matchedSafeIds.map((id) => map.get(id)).filter((value): value is string => Boolean(value));
  }, [settings, matchedSafeIds]);

  const applySettings = async (transform: (current: AppSettings) => AppSettings) => {
    if (!settings) {
      return;
    }
    await updateSettings(transform(settings));
  };

  const handleToggle = async (enabled: boolean) => {
    await applySettings((current) => ({
      ...current,
      detection: {
        ...current.detection,
        enableAutoSwitch: enabled
      }
    }));
  };

  const handlePreviewToggle = async (enabled: boolean) => {
    await applySettings((current) => ({
      ...current,
      detection: {
        ...current.detection,
        previewEnabled: enabled
      }
    }));
  };

  const handlePreviewVisibilityToggle = async (visible: boolean) => {
    await applySettings((current) => ({
      ...current,
      detection: {
        ...current.detection,
        previewVisible: visible
      }
    }));
  };

  const handleBlacklistCommit = async (values: string[]) => {
    await applySettings((current) => ({
      ...current,
      apps: {
        ...current.apps,
        gameBlacklist: values
      }
    }));
  };

  const handleWhitelistCommit = async (values: string[]) => {
    await applySettings((current) => ({
      ...current,
      apps: {
        ...current.apps,
        gameWhitelist: values
      }
    }));
  };

  const handleWorkTargetsCommit = async (targets: AppSettings['apps']['workTargets']) => {
    await applySettings((current) => ({
      ...current,
      apps: {
        ...current.apps,
        workTargets: targets
      }
    }));
  };

  const handleDetectionConfigChange = async (patch: Partial<AppSettings['detection']>) => {
    await applySettings((current) => ({
      ...current,
      detection: {
        ...current.detection,
        ...patch
      }
    }));
  };

  const handleSafeFacesPersist = async (faces: AppSettings['detection']['safeFaces']) => {
    await applySettings((current) => ({
      ...current,
      detection: {
        ...current.detection,
        safeFaces: faces
      }
    }));
  };

  const handleMatchStrategyChange = async (strategy: AppSettings['apps']['matchStrategy']) => {
    await applySettings((current) => ({
      ...current,
      apps: {
        ...current.apps,
        matchStrategy: strategy
      }
    }));
  };

  const handleListModeChange = async (mode: AppSettings['apps']['listMode']) => {
    await applySettings((current) => ({
      ...current,
      apps: {
        ...current.apps,
        listMode: mode
      }
    }));
  };

  const startCountdown = (message: string, duration = 3) =>
    new Promise<void>((resolve) => {
      if (countdownTimerRef.current) {
        window.clearInterval(countdownTimerRef.current);
      }
      let remaining = duration;
      setCountdown({ message, seconds: remaining });
      countdownTimerRef.current = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          if (countdownTimerRef.current) {
            window.clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = undefined;
          }
          setCountdown(null);
          resolve();
        } else {
          setCountdown({ message, seconds: remaining });
        }
      }, 1000);
    });

  const captureActiveAppWithCountdown = async () => {
    await startCountdown('请在 3 秒内切换到需要捕获的应用窗口', 3);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const snapshot = await window.moView.automation.getActiveApp();
    await window.moView.automation.focusSelf();
    return snapshot;
  };

  const handleForceSwitch = async () => {
    setForceLoading(true);
    try {
      await window.moView.automation.requestImmediateSwitch();
    } finally {
      setForceLoading(false);
    }
  };

  const deriveRuleFromActive = (snapshot?: ActiveAppSnapshot | null): string | null => {
    if (!snapshot) {
      return null;
    }
    const candidates = [snapshot.bundleId, snapshot.processPath, snapshot.name, snapshot.title];
    for (const candidate of candidates) {
      if (candidate && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
    return null;
  };

  const deriveRuleFromPicker = (selection?: ApplicationPickerResult | null): string | null => {
    if (!selection) {
      return null;
    }
    if (platform === 'darwin') {
      return selection.macBundleId || selection.name || selection.path;
    }
    if (platform === 'win32') {
      return selection.winCommand || selection.name || selection.path;
    }
    return selection.name || selection.path;
  };

  const getRuleFromActive = async () => {
    const snapshot = await captureActiveAppWithCountdown();
    return deriveRuleFromActive(snapshot);
  };
  const getRuleFromPicker = async () => {
    const picked = await window.moView.settings.browseApplication();
    if (picked) {
      await window.moView.automation.focusSelf();
    }
    return deriveRuleFromPicker(picked);
  };

  const extractProcessName = (command: string) => {
    const withoutQuotes = command.replace(/"/g, '').trim();
    const parts = withoutQuotes.split(/[/\\]/);
    const last = parts[parts.length - 1];
    if (!last) {
      return undefined;
    }
    return last.replace(/\.exe$/i, '');
  };

  const captureWorkTargetFromActive = async (current: WorkTarget): Promise<Partial<WorkTarget> | null> => {
    const snapshot = await captureActiveAppWithCountdown();
    if (!snapshot) {
      return null;
    }

    const patch: Partial<WorkTarget> = {
      name: snapshot.name || snapshot.title || current.name
    };

    if (platform === 'darwin') {
      patch.macBundleId = snapshot.bundleId ?? current.macBundleId ?? '';
      patch.macProcessName = snapshot.name ?? snapshot.title ?? current.macProcessName ?? '';
    } else if (platform === 'win32') {
      const command = snapshot.processPath ?? current.winCommand ?? '';
      patch.winCommand = command;
      patch.winProcessName = snapshot.name ?? extractProcessName(command) ?? current.winProcessName ?? '';
    }

    return patch;
  };

  const browseWorkTargetApplication = async (current: WorkTarget): Promise<Partial<WorkTarget> | null> => {
    const picked = await window.moView.settings.browseApplication();
    if (!picked) {
      return null;
    }
    await window.moView.automation.focusSelf();

    const patch: Partial<WorkTarget> = {
      name: picked.name || current.name
    };

    if (platform === 'darwin') {
      patch.macBundleId = picked.macBundleId ?? current.macBundleId ?? '';
      patch.macProcessName = picked.macProcessName ?? picked.name ?? current.macProcessName ?? '';
    } else if (platform === 'win32') {
      const command = picked.winCommand ?? picked.path ?? current.winCommand ?? '';
      patch.winCommand = command;
      patch.winProcessName = picked.winProcessName ?? extractProcessName(command) ?? current.winProcessName ?? '';
    }

    return patch;
  };

  const handleMotionRegionToggle = async (enabled: boolean) => {
    await handleDetectionConfigChange({ motionRegionEnabled: enabled });
  };

  const handleMotionRegionChange = async (patch: Partial<AppSettings['detection']['motionRegion']>) => {
    if (!settings) {
      return;
    }
    await handleDetectionConfigChange({
      motionRegion: {
        ...settings.detection.motionRegion,
        ...patch
      }
    });
  };

  return (
    <div className="page">
      {countdown ? (
        <div className="countdown-overlay">
          <div className="countdown-card">
            <p>{countdown.message}</p>
            <span>{countdown.seconds}</span>
          </div>
        </div>
      ) : null}
      <div className="app-container">
        <section className="panel">
          <h2>实时状态</h2>
          <div className="status-grid">
            <div className="status-card">
              <strong>自动切换</strong>
              <span>{settings?.detection.enableAutoSwitch ? '已开启' : '已关闭'}</span>
            </div>
            <div className="status-card">
              <strong>摄像头预览</strong>
              <span>{settings?.detection.previewEnabled ? '已开启' : '已关闭'}</span>
            </div>
            <div className="status-card">
              <strong>访客检测</strong>
              <span>{hasVisitor ? '检测到访客' : '无访客'}</span>
            </div>
            <div className="status-card">
              <strong>检测置信度</strong>
              <span>{confidence.toFixed(2)}</span>
            </div>
            <div className="status-card">
              <strong>安全面孔</strong>
              <span>{recognizedSafe ? recognizedNames.join(' / ') || '已识别' : '未识别'}</span>
            </div>
            <div className="status-card">
              <strong>当前程序</strong>
              <span>{activeAppName}</span>
            </div>
            <div className="status-card">
              <strong>是否游戏</strong>
              <span>{automationState?.activeApp?.isGameActive ? '是' : '否'}</span>
            </div>
            <div className="status-card">
              <strong>上次切换</strong>
              <span>{formatTimestamp(automationState?.lastSwitchAt)}</span>
            </div>
            <div className="status-card">
              <strong>运动强度</strong>
              <span>{movementScore.toFixed(2)}</span>
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <label className="toggle">
              <input type="checkbox" checked={Boolean(settings?.detection.enableAutoSwitch)} onChange={(event) => void handleToggle(event.target.checked)} />
              访客来访时自动切换到工作软件
            </label>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="toggle-group">
              <label className="toggle">
                <input type="checkbox" checked={Boolean(settings?.detection.previewEnabled)} onChange={(event) => void handlePreviewToggle(event.target.checked)} />
                启用摄像头预览
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.detection.previewVisible)}
                  onChange={(event) => void handlePreviewVisibilityToggle(event.target.checked)}
                  disabled={!settings?.detection.previewEnabled}
                />
                显示摄像头画面
              </label>
            </div>
          </div>

          <div className={`video-wrapper ${settings?.detection.previewVisible ? '' : 'preview-hidden'}`} style={{ marginTop: 24 }}>
            <video ref={videoRef} autoPlay muted playsInline />
            {!settings?.detection.previewVisible ? <div className="preview-hidden-overlay">摄像头运行中（画面已隐藏）</div> : null}
            {settings?.detection.motionRegionEnabled ? (
              <div
                className="motion-region-indicator"
                style={{
                  left: `${settings.detection.motionRegion.x * 100}%`,
                  top: `${settings.detection.motionRegion.y * 100}%`,
                  width: `${settings.detection.motionRegion.width * 100}%`,
                  height: `${settings.detection.motionRegion.height * 100}%`
                }}
              />
            ) : null}
          </div>

          <div className="helper-text" style={{ marginTop: 12 }}>
            摄像头状态：{detectorStatus === 'running' ? '运行中' : detectorStatus === 'initializing' ? '初始化...' : detectorStatus === 'error' ? '异常' : '待机'}
          </div>
          {detectorError ? <p className="helper-text">检测器错误：{detectorError}</p> : null}
          {automationError ? <p className="helper-text">监控错误：{automationError}</p> : null}

          <div className="region-controls">
            <label className="toggle">
              <input
                type="checkbox"
                checked={Boolean(settings?.detection.motionRegionEnabled)}
                onChange={(event) => void handleMotionRegionToggle(event.target.checked)}
              />
              启用运动检测区域（仅监控指定区域变化）
            </label>
            <span className="helper-text">例如只关注门或背景屏幕，减少误判。</span>

            {settings?.detection.motionRegionEnabled ? (
              <div className="slider-grid" style={{ marginTop: 12 }}>
                <SliderInput
                  label="区域左侧 (%)"
                  value={Math.round(settings.detection.motionRegion.x * 100)}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(next) => void handleMotionRegionChange({ x: Math.min(Math.max(next / 100, 0), 1) })}
                />
                <SliderInput
                  label="区域顶部 (%)"
                  value={Math.round(settings.detection.motionRegion.y * 100)}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(next) => void handleMotionRegionChange({ y: Math.min(Math.max(next / 100, 0), 1) })}
                />
                <SliderInput
                  label="区域宽度 (%)"
                  value={Math.round(settings.detection.motionRegion.width * 100)}
                  min={5}
                  max={100}
                  step={1}
                  onChange={(next) => void handleMotionRegionChange({ width: Math.min(Math.max(next / 100, 0.05), 1) })}
                />
                <SliderInput
                  label="区域高度 (%)"
                  value={Math.round(settings.detection.motionRegion.height * 100)}
                  min={5}
                  max={100}
                  step={1}
                  onChange={(next) => void handleMotionRegionChange({ height: Math.min(Math.max(next / 100, 0.05), 1) })}
                />
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <h2>设置</h2>
          {loading ? <p>正在加载设置...</p> : null}
          {error ? <p className="helper-text">设置加载失败：{error}</p> : null}

          {settings ? (
            <>
              <div className="slider-grid">
                <SliderInput
                  label="检测阈值"
                  value={settings.detection.presenceThreshold}
                  min={0}
                  max={1}
                  step={0.01}
                  helper="越高越严格，建议 0.5~0.7。"
                  onChange={(next) => void handleDetectionConfigChange({ presenceThreshold: Number(next.toFixed(2)) })}
                />
                <SliderInput
                  label="连续帧阈值"
                  value={settings.detection.framesBeforeTrigger}
                  min={1}
                  max={10}
                  step={1}
                  helper="需要持续检测到访客的帧数。"
                  onChange={(next) => void handleDetectionConfigChange({ framesBeforeTrigger: Math.max(1, Math.round(next)) })}
                />
                <SliderInput
                  label="冷却时间 (秒)"
                  value={settings.detection.cooldownSeconds}
                  min={5}
                  max={120}
                  step={1}
                  helper="切换后等待多久才允许再次自动切换。"
                  onChange={(next) => void handleDetectionConfigChange({ cooldownSeconds: Math.max(1, Math.round(next)) })}
                />
                <SliderInput
                  label="采样间隔 (毫秒)"
                  value={settings.detection.sampleIntervalMs}
                  min={50}
                  max={1000}
                  step={10}
                  helper="越低越灵敏，同时占用更多资源。"
                  onChange={(next) => void handleDetectionConfigChange({ sampleIntervalMs: Math.max(50, Math.round(next)) })}
                />
                <SliderInput
                  label="面孔匹配阈值"
                  value={settings.detection.faceRecognitionThreshold}
                  min={0.1}
                  max={1}
                  step={0.01}
                  helper="越高越严格，建议 0.4~0.6。"
                  onChange={(next) => void handleDetectionConfigChange({ faceRecognitionThreshold: Number(next.toFixed(2)) })}
                />
                <SliderInput
                  label="运动触发灵敏度"
                  value={settings.detection.motionSensitivity}
                  min={0.05}
                  max={1}
                  step={0.01}
                  helper="越低越敏感，建议 0.15~0.3。"
                  onChange={(next) => void handleDetectionConfigChange({ motionSensitivity: Number(next.toFixed(2)) })}
                />
            </div>

            <div className="input-group">
              <label>名单模式</label>
              <select value={settings.apps.listMode} onChange={(event) => void handleListModeChange(event.target.value as AppSettings['apps']['listMode'])}>
                <option value="blacklist">黑名单模式：匹配列表时自动切换</option>
                <option value="whitelist">白名单模式：未列出的应用视为娱乐</option>
              </select>
              <span className="helper-text">
                根据使用场景选择黑名单或白名单模式。白名单模式下仅列表内应用视为“安全”，其他均触发切换。
              </span>
            </div>

            {settings.apps.listMode !== 'whitelist' ? (
              <EditableList
                title="当运行下列应用时启动切换"
                values={settings.apps.gameBlacklist}
                helper="列出的应用命中后会触发切换。"
                onCommit={(values) => void handleBlacklistCommit(values)}
                quickActions={[
                  {
                    label: '添加当前前台',
                    getValue: getRuleFromActive
                  },
                  {
                    label: '浏览应用…',
                    getValue: getRuleFromPicker
                  }
                ]}
              />
            ) : null}

            {settings.apps.listMode !== 'blacklist' ? (
              <EditableList
                title="以下应用被视为工作/白名单"
                values={settings.apps.gameWhitelist}
                helper="白名单模式下，仅列出的应用会被视为工作状态。"
                onCommit={(values) => void handleWhitelistCommit(values)}
                quickActions={[
                  {
                    label: '添加当前前台',
                    getValue: getRuleFromActive
                  },
                  {
                    label: '浏览应用…',
                    getValue: getRuleFromPicker
                  }
                ]}
              />
            ) : null}

            <div className="input-group">
              <label>匹配策略</label>
              <select value={settings.apps.matchStrategy} onChange={(event) => void handleMatchStrategyChange(event.target.value as AppSettings['apps']['matchStrategy'])}>
                <option value="any">智能匹配（窗口标题 / 进程 / Bundle）</option>
                <option value="title">仅匹配窗口标题</option>
                <option value="process">仅匹配进程路径 / 名称</option>
                <option value="bundle">仅匹配 Bundle ID（macOS）</option>
              </select>
              <span className="helper-text">根据需要调整匹配范围，减少误判。</span>
            </div>

            <SafeFaceManager
              faces={settings.detection.safeFaces}
              recognizedIds={matchedSafeIds}
              onCapture={(label) => registerSafeFace(label)}
              onPersist={(faces) => handleSafeFacesPersist(faces)}
            />

            <WorkTargetList
              targets={settings.apps.workTargets}
              onCommit={(targets) => void handleWorkTargetsCommit(targets)}
              onCaptureFromActive={captureWorkTargetFromActive}
              onBrowseApplication={browseWorkTargetApplication}
            />

            <div style={{ marginTop: 24 }}>
              <button type="button" onClick={() => void handleForceSwitch()} disabled={forceLoading} className="primary-button">
                {forceLoading ? '切换中...' : '立即切换到工作应用'}
              </button>
            </div>
            </>
          ) : null}
        </section>
      </div>

      <footer className="footer">MoView • 平台：{window.moView.system.platform} • {automationState?.cooldownActive ? '冷却中' : '待命'}</footer>
    </div>
  );
}
