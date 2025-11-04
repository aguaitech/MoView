import { useEffect, useState } from 'react';

interface EditableListProps {
  title: string;
  values: string[];
  helper?: string;
  onCommit: (values: string[]) => void;
  quickActions?: Array<{
    label: string;
    getValue: () => Promise<string | null>;
  }>;
}

export function EditableList({ title, values, helper, onCommit, quickActions = [] }: EditableListProps) {
  const [draft, setDraft] = useState(values.join('\n'));

  useEffect(() => {
    setDraft(values.join('\n'));
  }, [values]);

  const handleCommit = () => {
    const next = draft
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    onCommit(next);
  };

  const handleQuickAction = async (action: () => Promise<string | null>) => {
    const value = await action();
    if (!value) {
      return;
    }
    const lines = draft.length > 0 ? draft.split('\n') : [];
    lines.push(value);
    setDraft(lines.join('\n'));
  };

  return (
    <div className="list-editor">
      <div className="section-header">
        <h3>{title}</h3>
        <div className="quick-action-row">
          {quickActions.map((action, index) => (
            <button key={index} type="button" onClick={() => void handleQuickAction(action.getValue)}>
              {action.label}
            </button>
          ))}
          <button type="button" onClick={handleCommit}>
            保存
          </button>
        </div>
      </div>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="逐行输入匹配关键字" />
      {helper ? <p className="helper-text">{helper}</p> : null}
    </div>
  );
}
