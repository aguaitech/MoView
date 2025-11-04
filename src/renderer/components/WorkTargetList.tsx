import { useEffect, useMemo, useState } from 'react';
import type { WorkTarget } from '@shared/types';

interface WorkTargetListProps {
  targets: WorkTarget[];
  onCommit: (targets: WorkTarget[]) => void;
  onCaptureFromActive: (current: WorkTarget) => Promise<Partial<WorkTarget> | null>;
  onBrowseApplication: (current: WorkTarget) => Promise<Partial<WorkTarget> | null>;
}

const emptyTarget: WorkTarget = {
  name: '',
  macBundleId: '',
  macProcessName: '',
  winCommand: '',
  winProcessName: '',
  args: []
};

export function WorkTargetList({ targets, onCommit, onCaptureFromActive, onBrowseApplication }: WorkTargetListProps) {
  const [draftTargets, setDraftTargets] = useState<WorkTarget[]>(targets);
  const platform = useMemo(() => window.moView.system.platform, []);
  const [loadingState, setLoadingState] = useState<{ index: number; type: 'active' | 'browse' } | null>(null);

  const extractProcessName = (command?: string) => {
    if (!command) {
      return undefined;
    }
    const withoutQuotes = command.replace(/"/g, '').trim();
    const parts = withoutQuotes.split(/[/\\]/);
    const last = parts[parts.length - 1];
    if (!last) {
      return undefined;
    }
    return last.replace(/\.exe$/i, '');
  };

  useEffect(() => {
    setDraftTargets(targets);
  }, [targets]);

  const updateTarget = (index: number, patch: Partial<WorkTarget>) => {
    setDraftTargets((prev) =>
      prev.map((target, idx) => {
        if (idx !== index) {
          return target;
        }
        return { ...target, ...patch };
      })
    );
  };

  const addTarget = () => {
    setDraftTargets((prev) => [...prev, { ...emptyTarget }]);
  };

  const removeTarget = (index: number) => {
    setDraftTargets((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleCommit = () => {
    const sanitized = draftTargets
      .map((target) => ({
        ...target,
        name: target.name.trim(),
        macBundleId: target.macBundleId?.trim() ?? undefined,
        macProcessName: target.macProcessName?.trim() || target.name.trim() || undefined,
        winCommand: target.winCommand?.trim() ?? undefined,
        winProcessName: target.winProcessName?.trim() || extractProcessName(target.winCommand) || undefined,
        args: target.args?.filter((item) => item.trim().length > 0) ?? []
      }))
      .filter((target) => target.name.length > 0 || target.macBundleId || target.winCommand);

    onCommit(sanitized);
  };

  const handleCaptureFromActive = async (index: number) => {
    setLoadingState({ index, type: 'active' });
    try {
      const patch = await onCaptureFromActive(draftTargets[index]);
      if (patch) {
        updateTarget(index, patch);
      }
    } finally {
      setLoadingState((prev) => (prev?.index === index ? null : prev));
    }
  };

  const handleBrowseApplication = async (index: number) => {
    setLoadingState({ index, type: 'browse' });
    try {
      const patch = await onBrowseApplication(draftTargets[index]);
      if (patch) {
        updateTarget(index, patch);
      }
    } finally {
      setLoadingState((prev) => (prev?.index === index ? null : prev));
    }
  };

  return (
    <div className="list-editor">
      <div className="section-header">
        <h3>工作应用候选</h3>
        <div>
          <button type="button" onClick={addTarget} style={{ marginRight: 8 }}>
            新增
          </button>
          <button type="button" onClick={handleCommit}>
            保存
          </button>
        </div>
      </div>
      <div className="work-targets-grid">
        {draftTargets.length === 0 ? <p className="helper-text">尚未添加工作应用。</p> : null}
        {draftTargets.map((target, index) => (
          <div className="panel" key={index} style={{ padding: 16, marginBottom: 12 }}>
            <div className="section-header" style={{ marginBottom: 12 }}>
              <strong>{target.name || '未命名应用'}</strong>
              <button type="button" onClick={() => removeTarget(index)} style={{ backgroundColor: 'rgba(248, 113, 113, 0.25)', color: '#f87171' }}>
                删除
              </button>
            </div>
            <div className="quick-action-row">
              <button
                type="button"
                onClick={() => void handleCaptureFromActive(index)}
                disabled={loadingState?.index === index}
              >
                {loadingState?.index === index && loadingState.type === 'active' ? '捕获中…' : '使用当前前台应用'}
              </button>
              <button
                type="button"
                onClick={() => void handleBrowseApplication(index)}
                disabled={loadingState?.index === index}
              >
                {loadingState?.index === index && loadingState.type === 'browse' ? '载入中…' : '浏览应用…'}
              </button>
            </div>
            <div className="input-group">
              <label>显示名称</label>
              <input value={target.name} onChange={(event) => updateTarget(index, { name: event.target.value })} placeholder="例如：Visual Studio Code" />
            </div>
            {platform === 'darwin' ? (
              <>
                <div className="input-group">
                  <label>macOS Bundle ID</label>
                  <input value={target.macBundleId ?? ''} onChange={(event) => updateTarget(index, { macBundleId: event.target.value })} placeholder="com.example.App" />
                </div>
                <div className="input-group">
                  <label>macOS 进程名称 (可选)</label>
                  <input
                    value={target.macProcessName ?? ''}
                    onChange={(event) => updateTarget(index, { macProcessName: event.target.value })}
                    placeholder="与活动监视器中的进程名称一致"
                  />
                </div>
              </>
            ) : null}
            {platform === 'win32' ? (
              <>
                <div className="input-group">
                  <label>Windows 启动命令 / 路径</label>
                  <input
                    value={target.winCommand ?? ''}
                    onChange={(event) => updateTarget(index, { winCommand: event.target.value })}
                    placeholder="C:\\Program Files\\App\\App.exe 或 AppUserModelID"
                  />
                </div>
                <div className="input-group">
                  <label>Windows 进程名 (可选)</label>
                  <input
                    value={target.winProcessName ?? ''}
                    onChange={(event) => updateTarget(index, { winProcessName: event.target.value })}
                    placeholder="任务管理器中的进程名，例如 chrome"
                  />
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
