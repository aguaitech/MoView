import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from './hooks/useSettings';
import { useAutomationState } from './hooks/useAutomationState';
import { usePresenceDetector } from './hooks/usePresenceDetector';
import { EditableList } from './components/EditableList';
import { WorkTargetList } from './components/WorkTargetList';
import { SafeFaceManager } from './components/SafeFaceManager';
import { SliderInput } from './components/SliderInput';
const formatTimestamp = (timestamp) => {
    if (!timestamp) {
        return '-';
    }
    const date = new Date(timestamp);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};
export default function App() {
    const { settings, loading, error, updateSettings } = useSettings();
    const { state: automationState, error: automationError } = useAutomationState();
    const { videoRef, status: detectorStatus, confidence, hasVisitor, recognizedSafe, movementScore, matchedSafeIds, error: detectorError, registerSafeFace } = usePresenceDetector(settings);
    const [forceLoading, setForceLoading] = useState(false);
    const [countdown, setCountdown] = useState(null);
    const countdownTimerRef = useRef();
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
            return [];
        }
        const map = new Map(settings.detection.safeFaces.map((face) => [face.id, face.label]));
        return matchedSafeIds.map((id) => map.get(id)).filter((value) => Boolean(value));
    }, [settings, matchedSafeIds]);
    const applySettings = async (transform) => {
        if (!settings) {
            return;
        }
        await updateSettings(transform(settings));
    };
    const handleToggle = async (enabled) => {
        await applySettings((current) => ({
            ...current,
            detection: {
                ...current.detection,
                enableAutoSwitch: enabled
            }
        }));
    };
    const handlePreviewToggle = async (enabled) => {
        await applySettings((current) => ({
            ...current,
            detection: {
                ...current.detection,
                previewEnabled: enabled
            }
        }));
    };
    const handlePreviewVisibilityToggle = async (visible) => {
        await applySettings((current) => ({
            ...current,
            detection: {
                ...current.detection,
                previewVisible: visible
            }
        }));
    };
    const handleBlacklistCommit = async (values) => {
        await applySettings((current) => ({
            ...current,
            apps: {
                ...current.apps,
                gameBlacklist: values
            }
        }));
    };
    const handleWhitelistCommit = async (values) => {
        await applySettings((current) => ({
            ...current,
            apps: {
                ...current.apps,
                gameWhitelist: values
            }
        }));
    };
    const handleWorkTargetsCommit = async (targets) => {
        await applySettings((current) => ({
            ...current,
            apps: {
                ...current.apps,
                workTargets: targets
            }
        }));
    };
    const handleDetectionConfigChange = async (patch) => {
        await applySettings((current) => ({
            ...current,
            detection: {
                ...current.detection,
                ...patch
            }
        }));
    };
    const handleSafeFacesPersist = async (faces) => {
        await applySettings((current) => ({
            ...current,
            detection: {
                ...current.detection,
                safeFaces: faces
            }
        }));
    };
    const handleMatchStrategyChange = async (strategy) => {
        await applySettings((current) => ({
            ...current,
            apps: {
                ...current.apps,
                matchStrategy: strategy
            }
        }));
    };
    const handleListModeChange = async (mode) => {
        await applySettings((current) => ({
            ...current,
            apps: {
                ...current.apps,
                listMode: mode
            }
        }));
    };
    const startCountdown = (message, duration = 3) => new Promise((resolve) => {
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
            }
            else {
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
        }
        finally {
            setForceLoading(false);
        }
    };
    const deriveRuleFromActive = (snapshot) => {
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
    const deriveRuleFromPicker = (selection) => {
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
    const extractProcessName = (command) => {
        const withoutQuotes = command.replace(/"/g, '').trim();
        const parts = withoutQuotes.split(/[/\\]/);
        const last = parts[parts.length - 1];
        if (!last) {
            return undefined;
        }
        return last.replace(/\.exe$/i, '');
    };
    const captureWorkTargetFromActive = async (current) => {
        const snapshot = await captureActiveAppWithCountdown();
        if (!snapshot) {
            return null;
        }
        const patch = {
            name: snapshot.name || snapshot.title || current.name
        };
        if (platform === 'darwin') {
            patch.macBundleId = snapshot.bundleId ?? current.macBundleId ?? '';
            patch.macProcessName = snapshot.name ?? snapshot.title ?? current.macProcessName ?? '';
        }
        else if (platform === 'win32') {
            const command = snapshot.processPath ?? current.winCommand ?? '';
            patch.winCommand = command;
            patch.winProcessName = snapshot.name ?? extractProcessName(command) ?? current.winProcessName ?? '';
        }
        return patch;
    };
    const browseWorkTargetApplication = async (current) => {
        const picked = await window.moView.settings.browseApplication();
        if (!picked) {
            return null;
        }
        await window.moView.automation.focusSelf();
        const patch = {
            name: picked.name || current.name
        };
        if (platform === 'darwin') {
            patch.macBundleId = picked.macBundleId ?? current.macBundleId ?? '';
            patch.macProcessName = picked.macProcessName ?? picked.name ?? current.macProcessName ?? '';
        }
        else if (platform === 'win32') {
            const command = picked.winCommand ?? picked.path ?? current.winCommand ?? '';
            patch.winCommand = command;
            patch.winProcessName = picked.winProcessName ?? extractProcessName(command) ?? current.winProcessName ?? '';
        }
        return patch;
    };
    const handleMotionRegionToggle = async (enabled) => {
        await handleDetectionConfigChange({ motionRegionEnabled: enabled });
    };
    const handleMotionRegionChange = async (patch) => {
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
    return (_jsxs("div", { className: "page", children: [countdown ? (_jsx("div", { className: "countdown-overlay", children: _jsxs("div", { className: "countdown-card", children: [_jsx("p", { children: countdown.message }), _jsx("span", { children: countdown.seconds })] }) })) : null, _jsxs("div", { className: "app-container", children: [_jsxs("section", { className: "panel", children: [_jsx("h2", { children: "\u5B9E\u65F6\u72B6\u6001" }), _jsxs("div", { className: "status-grid", children: [_jsxs("div", { className: "status-card", children: [_jsx("strong", { children: "\u81EA\u52A8\u5207\u6362" }), _jsx("span", { children: settings?.detection.enableAutoSwitch ? '已开启' : '已关闭' })] }), _jsxs("div", { className: "status-card", children: [_jsx("strong", { children: "\u6444\u50CF\u5934\u9884\u89C8" }), _jsx("span", { children: settings?.detection.previewEnabled ? '已开启' : '已关闭' })] }), _jsxs("div", { className: "status-card", children: [_jsx("strong", { children: "\u8BBF\u5BA2\u68C0\u6D4B" }), _jsx("span", { children: hasVisitor ? '检测到访客' : '无访客' })] }), _jsxs("div", { className: "status-card", children: [_jsx("strong", { children: "\u68C0\u6D4B\u7F6E\u4FE1\u5EA6" }), _jsx("span", { children: confidence.toFixed(2) })] }), _jsxs("div", { className: "status-card", children: [_jsx("strong", { children: "\u5B89\u5168\u9762\u5B54" }), _jsx("span", { children: recognizedSafe ? recognizedNames.join(' / ') || '已识别' : '未识别' })] }), _jsxs("div", { className: "status-card", children: [_jsx("strong", { children: "\u5F53\u524D\u7A0B\u5E8F" }), _jsx("span", { children: activeAppName })] }), _jsxs("div", { className: "status-card", children: [_jsx("strong", { children: "\u662F\u5426\u6E38\u620F" }), _jsx("span", { children: automationState?.activeApp?.isGameActive ? '是' : '否' })] }), _jsxs("div", { className: "status-card", children: [_jsx("strong", { children: "\u4E0A\u6B21\u5207\u6362" }), _jsx("span", { children: formatTimestamp(automationState?.lastSwitchAt) })] }), _jsxs("div", { className: "status-card", children: [_jsx("strong", { children: "\u8FD0\u52A8\u5F3A\u5EA6" }), _jsx("span", { children: movementScore.toFixed(2) })] })] }), _jsx("div", { style: { marginTop: 24 }, children: _jsxs("label", { className: "toggle", children: [_jsx("input", { type: "checkbox", checked: Boolean(settings?.detection.enableAutoSwitch), onChange: (event) => void handleToggle(event.target.checked) }), "\u8BBF\u5BA2\u6765\u8BBF\u65F6\u81EA\u52A8\u5207\u6362\u5230\u5DE5\u4F5C\u8F6F\u4EF6"] }) }), _jsx("div", { style: { marginTop: 12 }, children: _jsxs("div", { className: "toggle-group", children: [_jsxs("label", { className: "toggle", children: [_jsx("input", { type: "checkbox", checked: Boolean(settings?.detection.previewEnabled), onChange: (event) => void handlePreviewToggle(event.target.checked) }), "\u542F\u7528\u6444\u50CF\u5934\u9884\u89C8"] }), _jsxs("label", { className: "toggle", children: [_jsx("input", { type: "checkbox", checked: Boolean(settings?.detection.previewVisible), onChange: (event) => void handlePreviewVisibilityToggle(event.target.checked), disabled: !settings?.detection.previewEnabled }), "\u663E\u793A\u6444\u50CF\u5934\u753B\u9762"] })] }) }), _jsxs("div", { className: `video-wrapper ${settings?.detection.previewVisible ? '' : 'preview-hidden'}`, style: { marginTop: 24 }, children: [_jsx("video", { ref: videoRef, autoPlay: true, muted: true, playsInline: true }), !settings?.detection.previewVisible ? _jsx("div", { className: "preview-hidden-overlay", children: "\u6444\u50CF\u5934\u8FD0\u884C\u4E2D\uFF08\u753B\u9762\u5DF2\u9690\u85CF\uFF09" }) : null, settings?.detection.motionRegionEnabled ? (_jsx("div", { className: "motion-region-indicator", style: {
                                            left: `${settings.detection.motionRegion.x * 100}%`,
                                            top: `${settings.detection.motionRegion.y * 100}%`,
                                            width: `${settings.detection.motionRegion.width * 100}%`,
                                            height: `${settings.detection.motionRegion.height * 100}%`
                                        } })) : null] }), _jsxs("div", { className: "helper-text", style: { marginTop: 12 }, children: ["\u6444\u50CF\u5934\u72B6\u6001\uFF1A", detectorStatus === 'running' ? '运行中' : detectorStatus === 'initializing' ? '初始化...' : detectorStatus === 'error' ? '异常' : '待机'] }), detectorError ? _jsxs("p", { className: "helper-text", children: ["\u68C0\u6D4B\u5668\u9519\u8BEF\uFF1A", detectorError] }) : null, automationError ? _jsxs("p", { className: "helper-text", children: ["\u76D1\u63A7\u9519\u8BEF\uFF1A", automationError] }) : null, _jsxs("div", { className: "region-controls", children: [_jsxs("label", { className: "toggle", children: [_jsx("input", { type: "checkbox", checked: Boolean(settings?.detection.motionRegionEnabled), onChange: (event) => void handleMotionRegionToggle(event.target.checked) }), "\u542F\u7528\u8FD0\u52A8\u68C0\u6D4B\u533A\u57DF\uFF08\u4EC5\u76D1\u63A7\u6307\u5B9A\u533A\u57DF\u53D8\u5316\uFF09"] }), _jsx("span", { className: "helper-text", children: "\u4F8B\u5982\u53EA\u5173\u6CE8\u95E8\u6216\u80CC\u666F\u5C4F\u5E55\uFF0C\u51CF\u5C11\u8BEF\u5224\u3002" }), settings?.detection.motionRegionEnabled ? (_jsxs("div", { className: "slider-grid", style: { marginTop: 12 }, children: [_jsx(SliderInput, { label: "\u533A\u57DF\u5DE6\u4FA7 (%)", value: Math.round(settings.detection.motionRegion.x * 100), min: 0, max: 100, step: 1, onChange: (next) => void handleMotionRegionChange({ x: Math.min(Math.max(next / 100, 0), 1) }) }), _jsx(SliderInput, { label: "\u533A\u57DF\u9876\u90E8 (%)", value: Math.round(settings.detection.motionRegion.y * 100), min: 0, max: 100, step: 1, onChange: (next) => void handleMotionRegionChange({ y: Math.min(Math.max(next / 100, 0), 1) }) }), _jsx(SliderInput, { label: "\u533A\u57DF\u5BBD\u5EA6 (%)", value: Math.round(settings.detection.motionRegion.width * 100), min: 5, max: 100, step: 1, onChange: (next) => void handleMotionRegionChange({ width: Math.min(Math.max(next / 100, 0.05), 1) }) }), _jsx(SliderInput, { label: "\u533A\u57DF\u9AD8\u5EA6 (%)", value: Math.round(settings.detection.motionRegion.height * 100), min: 5, max: 100, step: 1, onChange: (next) => void handleMotionRegionChange({ height: Math.min(Math.max(next / 100, 0.05), 1) }) })] })) : null] })] }), _jsxs("section", { className: "panel", children: [_jsx("h2", { children: "\u8BBE\u7F6E" }), loading ? _jsx("p", { children: "\u6B63\u5728\u52A0\u8F7D\u8BBE\u7F6E..." }) : null, error ? _jsxs("p", { className: "helper-text", children: ["\u8BBE\u7F6E\u52A0\u8F7D\u5931\u8D25\uFF1A", error] }) : null, settings ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "slider-grid", children: [_jsx(SliderInput, { label: "\u68C0\u6D4B\u9608\u503C", value: settings.detection.presenceThreshold, min: 0, max: 1, step: 0.01, helper: "\u8D8A\u9AD8\u8D8A\u4E25\u683C\uFF0C\u5EFA\u8BAE 0.5~0.7\u3002", onChange: (next) => void handleDetectionConfigChange({ presenceThreshold: Number(next.toFixed(2)) }) }), _jsx(SliderInput, { label: "\u8FDE\u7EED\u5E27\u9608\u503C", value: settings.detection.framesBeforeTrigger, min: 1, max: 10, step: 1, helper: "\u9700\u8981\u6301\u7EED\u68C0\u6D4B\u5230\u8BBF\u5BA2\u7684\u5E27\u6570\u3002", onChange: (next) => void handleDetectionConfigChange({ framesBeforeTrigger: Math.max(1, Math.round(next)) }) }), _jsx(SliderInput, { label: "\u51B7\u5374\u65F6\u95F4 (\u79D2)", value: settings.detection.cooldownSeconds, min: 5, max: 120, step: 1, helper: "\u5207\u6362\u540E\u7B49\u5F85\u591A\u4E45\u624D\u5141\u8BB8\u518D\u6B21\u81EA\u52A8\u5207\u6362\u3002", onChange: (next) => void handleDetectionConfigChange({ cooldownSeconds: Math.max(1, Math.round(next)) }) }), _jsx(SliderInput, { label: "\u91C7\u6837\u95F4\u9694 (\u6BEB\u79D2)", value: settings.detection.sampleIntervalMs, min: 50, max: 1000, step: 10, helper: "\u8D8A\u4F4E\u8D8A\u7075\u654F\uFF0C\u540C\u65F6\u5360\u7528\u66F4\u591A\u8D44\u6E90\u3002", onChange: (next) => void handleDetectionConfigChange({ sampleIntervalMs: Math.max(50, Math.round(next)) }) }), _jsx(SliderInput, { label: "\u9762\u5B54\u5339\u914D\u9608\u503C", value: settings.detection.faceRecognitionThreshold, min: 0.1, max: 1, step: 0.01, helper: "\u8D8A\u9AD8\u8D8A\u4E25\u683C\uFF0C\u5EFA\u8BAE 0.4~0.6\u3002", onChange: (next) => void handleDetectionConfigChange({ faceRecognitionThreshold: Number(next.toFixed(2)) }) }), _jsx(SliderInput, { label: "\u8FD0\u52A8\u89E6\u53D1\u7075\u654F\u5EA6", value: settings.detection.motionSensitivity, min: 0.05, max: 1, step: 0.01, helper: "\u8D8A\u4F4E\u8D8A\u654F\u611F\uFF0C\u5EFA\u8BAE 0.15~0.3\u3002", onChange: (next) => void handleDetectionConfigChange({ motionSensitivity: Number(next.toFixed(2)) }) })] }), _jsxs("div", { className: "input-group", children: [_jsx("label", { children: "\u540D\u5355\u6A21\u5F0F" }), _jsxs("select", { value: settings.apps.listMode, onChange: (event) => void handleListModeChange(event.target.value), children: [_jsx("option", { value: "blacklist", children: "\u9ED1\u540D\u5355\u6A21\u5F0F\uFF1A\u5339\u914D\u5217\u8868\u65F6\u81EA\u52A8\u5207\u6362" }), _jsx("option", { value: "whitelist", children: "\u767D\u540D\u5355\u6A21\u5F0F\uFF1A\u672A\u5217\u51FA\u7684\u5E94\u7528\u89C6\u4E3A\u5A31\u4E50" })] }), _jsx("span", { className: "helper-text", children: "\u6839\u636E\u4F7F\u7528\u573A\u666F\u9009\u62E9\u9ED1\u540D\u5355\u6216\u767D\u540D\u5355\u6A21\u5F0F\u3002\u767D\u540D\u5355\u6A21\u5F0F\u4E0B\u4EC5\u5217\u8868\u5185\u5E94\u7528\u89C6\u4E3A\u201C\u5B89\u5168\u201D\uFF0C\u5176\u4ED6\u5747\u89E6\u53D1\u5207\u6362\u3002" })] }), settings.apps.listMode !== 'whitelist' ? (_jsx(EditableList, { title: "\u5F53\u8FD0\u884C\u4E0B\u5217\u5E94\u7528\u65F6\u542F\u52A8\u5207\u6362", values: settings.apps.gameBlacklist, helper: "\u5217\u51FA\u7684\u5E94\u7528\u547D\u4E2D\u540E\u4F1A\u89E6\u53D1\u5207\u6362\u3002", onCommit: (values) => void handleBlacklistCommit(values), quickActions: [
                                            {
                                                label: '添加当前前台',
                                                getValue: getRuleFromActive
                                            },
                                            {
                                                label: '浏览应用…',
                                                getValue: getRuleFromPicker
                                            }
                                        ] })) : null, settings.apps.listMode !== 'blacklist' ? (_jsx(EditableList, { title: "\u4EE5\u4E0B\u5E94\u7528\u88AB\u89C6\u4E3A\u5DE5\u4F5C/\u767D\u540D\u5355", values: settings.apps.gameWhitelist, helper: "\u767D\u540D\u5355\u6A21\u5F0F\u4E0B\uFF0C\u4EC5\u5217\u51FA\u7684\u5E94\u7528\u4F1A\u88AB\u89C6\u4E3A\u5DE5\u4F5C\u72B6\u6001\u3002", onCommit: (values) => void handleWhitelistCommit(values), quickActions: [
                                            {
                                                label: '添加当前前台',
                                                getValue: getRuleFromActive
                                            },
                                            {
                                                label: '浏览应用…',
                                                getValue: getRuleFromPicker
                                            }
                                        ] })) : null, _jsxs("div", { className: "input-group", children: [_jsx("label", { children: "\u5339\u914D\u7B56\u7565" }), _jsxs("select", { value: settings.apps.matchStrategy, onChange: (event) => void handleMatchStrategyChange(event.target.value), children: [_jsx("option", { value: "any", children: "\u667A\u80FD\u5339\u914D\uFF08\u7A97\u53E3\u6807\u9898 / \u8FDB\u7A0B / Bundle\uFF09" }), _jsx("option", { value: "title", children: "\u4EC5\u5339\u914D\u7A97\u53E3\u6807\u9898" }), _jsx("option", { value: "process", children: "\u4EC5\u5339\u914D\u8FDB\u7A0B\u8DEF\u5F84 / \u540D\u79F0" }), _jsx("option", { value: "bundle", children: "\u4EC5\u5339\u914D Bundle ID\uFF08macOS\uFF09" })] }), _jsx("span", { className: "helper-text", children: "\u6839\u636E\u9700\u8981\u8C03\u6574\u5339\u914D\u8303\u56F4\uFF0C\u51CF\u5C11\u8BEF\u5224\u3002" })] }), _jsx(SafeFaceManager, { faces: settings.detection.safeFaces, recognizedIds: matchedSafeIds, onCapture: (label) => registerSafeFace(label), onPersist: (faces) => handleSafeFacesPersist(faces) }), _jsx(WorkTargetList, { targets: settings.apps.workTargets, onCommit: (targets) => void handleWorkTargetsCommit(targets), onCaptureFromActive: captureWorkTargetFromActive, onBrowseApplication: browseWorkTargetApplication }), _jsx("div", { style: { marginTop: 24 }, children: _jsx("button", { type: "button", onClick: () => void handleForceSwitch(), disabled: forceLoading, className: "primary-button", children: forceLoading ? '切换中...' : '立即切换到工作应用' }) })] })) : null] })] }), _jsxs("footer", { className: "footer", children: ["MoView \u2022 \u5E73\u53F0\uFF1A", window.moView.system.platform, " \u2022 ", automationState?.cooldownActive ? '冷却中' : '待命'] })] }));
}
