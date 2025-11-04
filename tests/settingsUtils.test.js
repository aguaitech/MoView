const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const fs = require('node:fs');
const path = require('node:path');

const distRoot = path.resolve(__dirname, '../dist/main');
const modulePath = fs.existsSync(path.join(distRoot, 'settingsUtils.js'))
  ? path.join(distRoot, 'settingsUtils.js')
  : path.join(distRoot, 'main/settingsUtils.js');

const {
  DEFAULT_SETTINGS,
  sanitizeList,
  sanitizeSettings,
  mergeDetectionSettings,
  mergeAppSettings
} = require(modulePath);

function withMockedUUID(run) {
  const original = crypto.randomUUID;
  let counter = 0;
  crypto.randomUUID = () => {
    counter += 1;
    return `uuid-${counter}`;
  };
  try {
    run();
  } finally {
    crypto.randomUUID = original;
  }
}

test('sanitizeList trims and deduplicates entries', () => {
  const result = sanitizeList(['  Foo ', 'bar', '', 'foo', 'BAR']);
  assert.deepStrictEqual(result, ['Foo', 'bar', 'foo', 'BAR']);
});

test('sanitizeSettings clamps thresholds and normalizes safe faces', () => {
  withMockedUUID(() => {
    const dirty = {
      detection: {
        ...DEFAULT_SETTINGS.detection,
        presenceThreshold: 2,
        framesBeforeTrigger: 0,
        cooldownSeconds: 0,
        sampleIntervalMs: 20,
        faceRecognitionThreshold: -1,
        motionSensitivity: 0,
        safeFaces: [
          {
            id: '',
            label: '  Myself  ',
            descriptor: [0.1, 0.2],
            createdAt: 0
          }
        ]
      },
      apps: {
        gameBlacklist: ['  League  ', ''],
        gameWhitelist: ['OBS  '],
        workTargets: [
          {
            name: '  Visual Studio Code  ',
            macBundleId: ' com.microsoft.VSCode ',
            macProcessName: ' ',
            winCommand: ' Code ',
            winProcessName: '  ',
            args: [' --flag ', '']
          }
        ]
      }
    };

    const sanitized = sanitizeSettings(dirty);

    assert.equal(sanitized.detection.presenceThreshold, 1);
    assert.equal(sanitized.detection.framesBeforeTrigger, 1);
    assert.equal(sanitized.detection.cooldownSeconds, 1);
    assert.equal(sanitized.detection.sampleIntervalMs, 50);
    assert.equal(sanitized.detection.faceRecognitionThreshold, 0);
    assert.equal(sanitized.detection.motionSensitivity, 0.01);
    assert.equal(sanitized.detection.safeFaces.length, 1);
    assert.equal(sanitized.detection.safeFaces[0].id, 'uuid-1');
    assert.equal(sanitized.detection.safeFaces[0].label, 'Myself');
    assert.deepStrictEqual(sanitized.apps.gameBlacklist, ['League']);
    assert.equal(sanitized.apps.workTargets[0].macProcessName, 'Visual Studio Code');
    assert.equal(sanitized.apps.workTargets[0].winProcessName, 'Code');
    assert.deepStrictEqual(sanitized.apps.workTargets[0].args, ['--flag']);
  });
});

test('mergeDetectionSettings keeps safe faces normalized', () => {
  withMockedUUID(() => {
    const merged = mergeDetectionSettings(DEFAULT_SETTINGS.detection, {
      presenceThreshold: 0.8,
      safeFaces: [
        {
          id: '',
          label: ' user ',
          descriptor: [1, 0],
          createdAt: 0
        }
      ]
    });

    assert.equal(merged.presenceThreshold, 0.8);
    assert.equal(merged.safeFaces[0].id, 'uuid-1');
    assert.equal(merged.safeFaces[0].label, 'user');
  });
});

test('mergeAppSettings sanitizes application lists', () => {
  const merged = mergeAppSettings(DEFAULT_SETTINGS.apps, {
    gameBlacklist: [' game ', 'GAME'],
    gameWhitelist: [' tool ']
  });

  assert.deepStrictEqual(merged.gameBlacklist, ['game', 'GAME']);
  assert.deepStrictEqual(merged.gameWhitelist, ['tool']);
});
