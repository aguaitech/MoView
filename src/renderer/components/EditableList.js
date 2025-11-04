import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
export function EditableList({ title, values, helper, onCommit, quickActions = [] }) {
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
    const handleQuickAction = async (action) => {
        const value = await action();
        if (!value) {
            return;
        }
        const lines = draft.length > 0 ? draft.split('\n') : [];
        lines.push(value);
        setDraft(lines.join('\n'));
    };
    return (_jsxs("div", { className: "list-editor", children: [_jsxs("div", { className: "section-header", children: [_jsx("h3", { children: title }), _jsxs("div", { className: "quick-action-row", children: [quickActions.map((action, index) => (_jsx("button", { type: "button", onClick: () => void handleQuickAction(action.getValue), children: action.label }, index))), _jsx("button", { type: "button", onClick: handleCommit, children: "\u4FDD\u5B58" })] })] }), _jsx("textarea", { value: draft, onChange: (event) => setDraft(event.target.value), placeholder: "\u9010\u884C\u8F93\u5165\u5339\u914D\u5173\u952E\u5B57" }), helper ? _jsx("p", { className: "helper-text", children: helper }) : null] }));
}
