import { useMemo, useState } from 'react';
import type { SafeFaceProfile } from '@shared/types';

interface SafeFaceManagerProps {
  faces: SafeFaceProfile[];
  recognizedIds: string[];
  onCapture: (label: string) => Promise<SafeFaceProfile>;
  onPersist: (faces: SafeFaceProfile[]) => Promise<void>;
}

export function SafeFaceManager({ faces, recognizedIds, onCapture, onPersist }: SafeFaceManagerProps) {
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const recognizedLabels = useMemo(() => {
    const map = new Map(faces.map((face) => [face.id, face.label]));
    return recognizedIds.map((id) => map.get(id)).filter(Boolean);
  }, [faces, recognizedIds]);

  const handleCapture = async () => {
    if (busy) {
      return;
    }
    try {
      setBusy(true);
      setMessage('正在捕获，请保持面部在画面中…');
      const profile = await onCapture(label);
      await onPersist([...faces, profile]);
      setLabel('');
      setMessage(`已添加安全面孔：${profile.label}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    const removed = faces.find((face) => face.id === id);
    const next = faces.filter((face) => face.id !== id);
    await onPersist(next);
    setMessage(`已移除安全面孔：${removed?.label ?? id}`);
  };

  return (
    <div className="safe-face-manager">
      <div className="section-header">
        <h3>安全面孔</h3>
        <div className="recognized-pill">{recognizedLabels.length > 0 ? `已识别：${recognizedLabels.join(' / ')}` : '尚未识别到安全面孔'}</div>
      </div>

      <div className="safe-face-capture">
        <input
          placeholder="为当前使用者输入备注名，例如：自己 / Jack"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          disabled={busy}
        />
        <button type="button" onClick={() => void handleCapture()} disabled={busy}>
          {busy ? '捕获中…' : '捕获安全面孔'}
        </button>
      </div>
      {message ? <p className="helper-text">{message}</p> : null}

      <ul className="safe-face-list">
        {faces.length === 0 ? <li className="helper-text">尚未添加安全面孔，捕获后系统才能区分自己与访客。</li> : null}
        {faces.map((face) => (
          <li key={face.id} className={recognizedIds.includes(face.id) ? 'recognized' : ''}>
            <div>
              <strong>{face.label}</strong>
              <span>捕获时间：{new Date(face.createdAt).toLocaleString()}</span>
            </div>
            <button type="button" onClick={() => void handleRemove(face.id)}>
              移除
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
