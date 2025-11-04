import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
export function SafeFaceManager({ faces, recognizedIds, onCapture, onPersist }) {
    const [label, setLabel] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);
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
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
        }
        finally {
            setBusy(false);
        }
    };
    const handleRemove = async (id) => {
        const removed = faces.find((face) => face.id === id);
        const next = faces.filter((face) => face.id !== id);
        await onPersist(next);
        setMessage(`已移除安全面孔：${removed?.label ?? id}`);
    };
    return (_jsxs("div", { className: "safe-face-manager", children: [_jsxs("div", { className: "section-header", children: [_jsx("h3", { children: "\u5B89\u5168\u9762\u5B54" }), _jsx("div", { className: "recognized-pill", children: recognizedLabels.length > 0 ? `已识别：${recognizedLabels.join(' / ')}` : '尚未识别到安全面孔' })] }), _jsxs("div", { className: "safe-face-capture", children: [_jsx("input", { placeholder: "\u4E3A\u5F53\u524D\u4F7F\u7528\u8005\u8F93\u5165\u5907\u6CE8\u540D\uFF0C\u4F8B\u5982\uFF1A\u81EA\u5DF1 / Jack", value: label, onChange: (event) => setLabel(event.target.value), disabled: busy }), _jsx("button", { type: "button", onClick: () => void handleCapture(), disabled: busy, children: busy ? '捕获中…' : '捕获安全面孔' })] }), message ? _jsx("p", { className: "helper-text", children: message }) : null, _jsxs("ul", { className: "safe-face-list", children: [faces.length === 0 ? _jsx("li", { className: "helper-text", children: "\u5C1A\u672A\u6DFB\u52A0\u5B89\u5168\u9762\u5B54\uFF0C\u6355\u83B7\u540E\u7CFB\u7EDF\u624D\u80FD\u533A\u5206\u81EA\u5DF1\u4E0E\u8BBF\u5BA2\u3002" }) : null, faces.map((face) => (_jsxs("li", { className: recognizedIds.includes(face.id) ? 'recognized' : '', children: [_jsxs("div", { children: [_jsx("strong", { children: face.label }), _jsxs("span", { children: ["\u6355\u83B7\u65F6\u95F4\uFF1A", new Date(face.createdAt).toLocaleString()] })] }), _jsx("button", { type: "button", onClick: () => void handleRemove(face.id), children: "\u79FB\u9664" })] }, face.id)))] })] }));
}
