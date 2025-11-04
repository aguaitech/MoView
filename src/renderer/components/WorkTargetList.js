import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
const emptyTarget = {
    name: '',
    macBundleId: '',
    macProcessName: '',
    winCommand: '',
    winProcessName: '',
    args: []
};
export function WorkTargetList({ targets, onCommit, onCaptureFromActive, onBrowseApplication }) {
    const [draftTargets, setDraftTargets] = useState(targets);
    const platform = useMemo(() => window.moView.system.platform, []);
    const [loadingState, setLoadingState] = useState(null);
    const extractProcessName = (command) => {
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
    const updateTarget = (index, patch) => {
        setDraftTargets((prev) => prev.map((target, idx) => {
            if (idx !== index) {
                return target;
            }
            return { ...target, ...patch };
        }));
    };
    const addTarget = () => {
        setDraftTargets((prev) => [...prev, { ...emptyTarget }]);
    };
    const removeTarget = (index) => {
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
    const handleCaptureFromActive = async (index) => {
        setLoadingState({ index, type: 'active' });
        try {
            const patch = await onCaptureFromActive(draftTargets[index]);
            if (patch) {
                updateTarget(index, patch);
            }
        }
        finally {
            setLoadingState((prev) => (prev?.index === index ? null : prev));
        }
    };
    const handleBrowseApplication = async (index) => {
        setLoadingState({ index, type: 'browse' });
        try {
            const patch = await onBrowseApplication(draftTargets[index]);
            if (patch) {
                updateTarget(index, patch);
            }
        }
        finally {
            setLoadingState((prev) => (prev?.index === index ? null : prev));
        }
    };
    return (_jsxs("div", { className: "list-editor", children: [_jsxs("div", { className: "section-header", children: [_jsx("h3", { children: "\u5DE5\u4F5C\u5E94\u7528\u5019\u9009" }), _jsxs("div", { children: [_jsx("button", { type: "button", onClick: addTarget, style: { marginRight: 8 }, children: "\u65B0\u589E" }), _jsx("button", { type: "button", onClick: handleCommit, children: "\u4FDD\u5B58" })] })] }), _jsxs("div", { className: "work-targets-grid", children: [draftTargets.length === 0 ? _jsx("p", { className: "helper-text", children: "\u5C1A\u672A\u6DFB\u52A0\u5DE5\u4F5C\u5E94\u7528\u3002" }) : null, draftTargets.map((target, index) => (_jsxs("div", { className: "panel", style: { padding: 16, marginBottom: 12 }, children: [_jsxs("div", { className: "section-header", style: { marginBottom: 12 }, children: [_jsx("strong", { children: target.name || '未命名应用' }), _jsx("button", { type: "button", onClick: () => removeTarget(index), style: { backgroundColor: 'rgba(248, 113, 113, 0.25)', color: '#f87171' }, children: "\u5220\u9664" })] }), _jsxs("div", { className: "quick-action-row", children: [_jsx("button", { type: "button", onClick: () => void handleCaptureFromActive(index), disabled: loadingState?.index === index, children: loadingState?.index === index && loadingState.type === 'active' ? '捕获中…' : '使用当前前台应用' }), _jsx("button", { type: "button", onClick: () => void handleBrowseApplication(index), disabled: loadingState?.index === index, children: loadingState?.index === index && loadingState.type === 'browse' ? '载入中…' : '浏览应用…' })] }), _jsxs("div", { className: "input-group", children: [_jsx("label", { children: "\u663E\u793A\u540D\u79F0" }), _jsx("input", { value: target.name, onChange: (event) => updateTarget(index, { name: event.target.value }), placeholder: "\u4F8B\u5982\uFF1AVisual Studio Code" })] }), platform === 'darwin' ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "input-group", children: [_jsx("label", { children: "macOS Bundle ID" }), _jsx("input", { value: target.macBundleId ?? '', onChange: (event) => updateTarget(index, { macBundleId: event.target.value }), placeholder: "com.example.App" })] }), _jsxs("div", { className: "input-group", children: [_jsx("label", { children: "macOS \u8FDB\u7A0B\u540D\u79F0 (\u53EF\u9009)" }), _jsx("input", { value: target.macProcessName ?? '', onChange: (event) => updateTarget(index, { macProcessName: event.target.value }), placeholder: "\u4E0E\u6D3B\u52A8\u76D1\u89C6\u5668\u4E2D\u7684\u8FDB\u7A0B\u540D\u79F0\u4E00\u81F4" })] })] })) : null, platform === 'win32' ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "input-group", children: [_jsx("label", { children: "Windows \u542F\u52A8\u547D\u4EE4 / \u8DEF\u5F84" }), _jsx("input", { value: target.winCommand ?? '', onChange: (event) => updateTarget(index, { winCommand: event.target.value }), placeholder: "C:\\\\Program Files\\\\App\\\\App.exe \u6216 AppUserModelID" })] }), _jsxs("div", { className: "input-group", children: [_jsx("label", { children: "Windows \u8FDB\u7A0B\u540D (\u53EF\u9009)" }), _jsx("input", { value: target.winProcessName ?? '', onChange: (event) => updateTarget(index, { winProcessName: event.target.value }), placeholder: "\u4EFB\u52A1\u7BA1\u7406\u5668\u4E2D\u7684\u8FDB\u7A0B\u540D\uFF0C\u4F8B\u5982 chrome" })] })] })) : null] }, index)))] })] }));
}
