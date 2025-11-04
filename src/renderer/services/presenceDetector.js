import Human from '@vladmandic/human';
const resolveModelBasePath = () => {
    const { origin, protocol } = window.location;
    if (protocol === 'file:' || origin === 'null') {
        return './human-models/';
    }
    return `${origin}/human-models/`;
};
const detectorConfig = {
    cacheSensitivity: 0,
    modelBasePath: resolveModelBasePath(),
    debug: false,
    face: {
        enabled: true,
        detector: { rotation: true },
        mesh: { enabled: false },
        iris: { enabled: false },
        description: { enabled: true },
        emotion: { enabled: false }
    },
    body: { enabled: true },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: false },
    segmentation: { enabled: false }
};
function cosineSimilarity(a, b) {
    const length = Math.min(a.length, b.length);
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let index = 0; index < length; index += 1) {
        const valueA = a[index];
        const valueB = b[index];
        dot += valueA * valueB;
        magA += valueA * valueA;
        magB += valueB * valueB;
    }
    if (magA === 0 || magB === 0) {
        return 0;
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
function estimateMovement(previous, current) {
    if (!previous) {
        return { score: 0, data: current };
    }
    const length = Math.min(previous.length, current.length);
    let delta = 0;
    for (let index = 0; index < length; index += 4) {
        const rDiff = Math.abs(current[index] - previous[index]);
        const gDiff = Math.abs(current[index + 1] - previous[index + 1]);
        const bDiff = Math.abs(current[index + 2] - previous[index + 2]);
        delta += rDiff + gDiff + bDiff;
    }
    const maxDelta = (length / 4) * 3 * 255;
    const normalized = maxDelta === 0 ? 0 : delta / maxDelta;
    return { score: normalized, data: current };
}
function embeddingToArray(input) {
    if (!input) {
        return [];
    }
    if (Array.isArray(input)) {
        return input;
    }
    if (ArrayBuffer.isView(input)) {
        const view = input;
        const sliced = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
        return Array.from(new Float32Array(sliced));
    }
    return [];
}
export class PresenceDetector {
    constructor() {
        this.human = new Human(detectorConfig);
        this.initialized = false;
        this.previousFrame = null;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    async init() {
        if (this.initialized) {
            return;
        }
        await this.human.load();
        await this.human.warmup();
        this.initialized = true;
    }
    async detect(video, settings) {
        if (!this.initialized) {
            await this.init();
        }
        const result = await this.human.detect(video);
        const faces = (result.face ?? []).filter((face) => (face.score ?? 0) > 0.3);
        const bodies = (result.body ?? []);
        const faceConfidence = faces.reduce((max, face) => Math.max(max, face.score ?? 0), 0);
        const bodyConfidence = bodies.reduce((max, body) => Math.max(max, body.score ?? 0), 0);
        const confidence = Math.max(faceConfidence, bodyConfidence);
        const matchedSafe = this.matchSafeFaces(faces, settings.detection.safeFaces, settings.detection.faceRecognitionThreshold);
        const unknownFaceCount = Math.max(faces.length - matchedSafe.matchedCount, 0);
        const hasUnknownFaces = unknownFaceCount > 0;
        const onlyRecognizedSafeFaces = matchedSafe.recognized && !hasUnknownFaces && faces.length > 0;
        const movementScore = this.calculateMovement(video, settings);
        const movementTrigger = movementScore >= settings.detection.motionSensitivity;
        const faceOrBodyTrigger = confidence >= settings.detection.presenceThreshold;
        const extraBodiesPresent = bodies.length > Math.max(matchedSafe.matchedCount, faces.length);
        const movementSuggestsVisitor = movementTrigger;
        const faceOrBodySuggestVisitor = faceOrBodyTrigger && (hasUnknownFaces || extraBodiesPresent || !matchedSafe.recognized);
        const hasVisitor = movementSuggestsVisitor || faceOrBodySuggestVisitor;
        return {
            confidence,
            hasVisitor,
            recognizedSafe: matchedSafe.recognized,
            movementScore,
            matchedSafeIds: matchedSafe.matchedProfileIds
        };
    }
    async captureSafeFace(video, label) {
        if (!this.initialized) {
            await this.init();
        }
        const result = await this.human.detect(video);
        const faces = result.face ?? [];
        const bestFace = faces
            .map((face) => ({ ...face, embeddingArray: embeddingToArray(face.embedding) }))
            .filter((face) => (face.score ?? 0) > 0.6 && face.embeddingArray.length > 0)
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
        if (!bestFace || bestFace.embeddingArray.length === 0) {
            throw new Error('未检测到清晰的人脸，请确保面部对准摄像头并有足够光线。');
        }
        const descriptor = Array.from(bestFace.embeddingArray);
        return {
            id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
            label: label.trim() || '未命名',
            descriptor,
            createdAt: Date.now()
        };
    }
    calculateMovement(video, settings) {
        if (!this.ctx) {
            return 0;
        }
        const region = settings.detection.motionRegion;
        const regionEnabled = settings.detection.motionRegionEnabled;
        const sourceWidth = video.videoWidth || 640;
        const sourceHeight = video.videoHeight || 360;
        const sourceX = regionEnabled ? Math.round(region.x * sourceWidth) : 0;
        const sourceY = regionEnabled ? Math.round(region.y * sourceHeight) : 0;
        const sourceW = regionEnabled ? Math.round(region.width * sourceWidth) : sourceWidth;
        const sourceH = regionEnabled ? Math.round(region.height * sourceHeight) : sourceHeight;
        const targetWidth = 160;
        const ratio = sourceH > 0 ? sourceH / sourceW : 0.75;
        const targetHeight = Math.max(90, Math.round(targetWidth * ratio));
        if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
            this.canvas.width = targetWidth;
            this.canvas.height = targetHeight;
        }
        this.ctx.drawImage(video, sourceX, sourceY, Math.max(1, sourceW), Math.max(1, sourceH), 0, 0, targetWidth, targetHeight);
        const snapshot = this.ctx.getImageData(0, 0, targetWidth, targetHeight);
        const { score, data } = estimateMovement(this.previousFrame, snapshot.data);
        this.previousFrame = new Uint8ClampedArray(data);
        return score;
    }
    matchSafeFaces(faces, safeFaces, threshold) {
        if (!faces.length || !safeFaces.length) {
            return { recognized: false, matchedProfileIds: [], matchedCount: 0, onlyRecognizedSafe: false };
        }
        const matchedProfileIds = new Set();
        let recognized = false;
        let matchedCount = 0;
        for (const face of faces) {
            const embedding = embeddingToArray(face.embedding);
            if (embedding.length === 0) {
                continue;
            }
            let bestMatch = null;
            let bestScore = -1;
            for (const profile of safeFaces) {
                const score = cosineSimilarity(embedding, profile.descriptor);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = profile;
                }
            }
            if (bestMatch && bestScore >= threshold) {
                recognized = true;
                matchedCount += 1;
                matchedProfileIds.add(bestMatch.id);
            }
        }
        return {
            recognized,
            matchedProfileIds: Array.from(matchedProfileIds),
            matchedCount,
            onlyRecognizedSafe: recognized && matchedCount === faces.length
        };
    }
}
