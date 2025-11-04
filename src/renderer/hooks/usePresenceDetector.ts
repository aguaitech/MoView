import { useEffect, useRef, useState } from 'react';
import type { AppSettings } from '@shared/types';
import { PresenceDetector } from '../services/presenceDetector';

type DetectorStatus = 'idle' | 'initializing' | 'running' | 'error';

const detector = new PresenceDetector();

export function usePresenceDetector(settings: AppSettings | null) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<DetectorStatus>('idle');
  const [confidence, setConfidence] = useState(0);
  const [hasVisitor, setHasVisitor] = useState(false);
  const [recognizedSafe, setRecognizedSafe] = useState(false);
  const [movementScore, setMovementScore] = useState(0);
  const [matchedSafeIds, setMatchedSafeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sendPresence = (hasVisitorFlag: boolean, confidenceScore: number, safeFlag: boolean, movement: number, matches: string[]) => {
    window.moView.automation.updatePresence({
      hasVisitor: hasVisitorFlag,
      confidence: confidenceScore,
      recognizedSafe: safeFlag,
      movementScore: movement,
      matchedSafeIds: matches,
      timestamp: Date.now()
    });
  };

  useEffect(() => {
    const shouldRun = Boolean(settings?.detection.enableAutoSwitch || settings?.detection.previewEnabled);

    if (!shouldRun) {
      setStatus('idle');
      setHasVisitor(false);
      setConfidence(0);
      setRecognizedSafe(false);
      setMovementScore(0);
      setMatchedSafeIds([]);
      sendPresence(false, 0, false, 0, []);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | undefined;
    let loopTimer: number | undefined;

    const openStream = async () => {
      if (!settings) {
        return;
      }

      try {
        setStatus('initializing');
        setError(null);

        await detector.init();

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: settings.detection.cameraDeviceId ? { exact: settings.detection.cameraDeviceId } : undefined,
            width: { ideal: 640 },
            height: { ideal: 360 },
            frameRate: { ideal: 30 }
          },
          audio: false
        });

        const videoElement = videoRef.current;
        if (!videoElement) {
          return;
        }

        videoElement.srcObject = stream;
        await videoElement.play();

        setStatus('running');
        runLoop();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus('error');
        setError(message);
        sendPresence(false, 0, false, 0, []);
      }
    };

    const cleanup = () => {
      if (loopTimer) {
        window.clearTimeout(loopTimer);
        loopTimer = undefined;
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = undefined;
      }
    };

    const runLoop = async () => {
      if (cancelled || !settings) {
        return;
      }

      const videoElement = videoRef.current;
      if (!videoElement || videoElement.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
        loopTimer = window.setTimeout(runLoop, settings.detection.sampleIntervalMs);
        return;
      }

      try {
        const result = await detector.detect(videoElement, settings);
        setConfidence(result.confidence);
        setHasVisitor(result.hasVisitor);
        setRecognizedSafe(result.recognizedSafe);
        setMovementScore(result.movementScore);
        setMatchedSafeIds(result.matchedSafeIds);
        sendPresence(result.hasVisitor, result.confidence, result.recognizedSafe, result.movementScore, result.matchedSafeIds);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus('error');
        setError(message);
        sendPresence(false, 0, false, 0, []);
        cleanup();
        return;
      }

      loopTimer = window.setTimeout(runLoop, settings.detection.sampleIntervalMs);
    };

    void openStream();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [settings]);

  const registerSafeFace = async (label: string) => {
    const previewActive = Boolean(settings?.detection.previewEnabled);
    const detectionActive = Boolean(settings?.detection.enableAutoSwitch);
    if (!previewActive && !detectionActive) {
      throw new Error('请先开启摄像头预览或自动检测后再尝试捕获安全面孔。');
    }
    if (status !== 'running') {
      throw new Error('摄像头初始化中，请稍候再试。');
    }
    const videoElement = videoRef.current;
    if (!videoElement) {
      throw new Error('摄像头尚未准备就绪，请稍候再试。');
    }
    return detector.captureSafeFace(videoElement, label);
  };

  return {
    videoRef,
    status,
    confidence,
    hasVisitor,
    recognizedSafe,
    movementScore,
    matchedSafeIds,
    error,
    registerSafeFace
  };
}
