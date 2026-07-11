'use strict';

const { isDeepStrictEqual } = require('node:util');

const FORMAT = 'cpx-personal-overlay.v1';
const SHARED_SETTING_KEYS = new Set(['comments', 'profiles', 'communityPosts']);
const COLLECTION_SETTING_KEYS = new Set([
  'tableStyles',
  'imageAssets',
  'flowAssets',
  'docMeta',
  'quizFieldOverrides',
]);

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeDocumentIds(...values) {
  const ids = [];
  const add = value => {
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    if (value == null) return;
    const id = String(value).trim();
    if (id && !ids.includes(id)) ids.push(id);
  };
  values.forEach(add);
  return ids;
}

function buildCollectionPatch(masterValue, incomingValue) {
  const master = object(masterValue);
  const incoming = object(incomingValue);
  const values = {};
  const deleted = [];
  const keys = new Set([...Object.keys(master), ...Object.keys(incoming)]);
  for (const key of keys) {
    if (!hasOwn(incoming, key)) {
      if (hasOwn(master, key)) deleted.push(key);
      continue;
    }
    if (!hasOwn(master, key) || !isDeepStrictEqual(master[key], incoming[key])) values[key] = incoming[key];
  }
  return { values, deleted };
}

function buildPersonalOverlay(masterState, incomingState, metadata = {}) {
  const master = object(masterState);
  const incoming = object(incomingState);
  const previousOverlay = object(metadata.previousOverlay);
  const previousCollections = object(object(previousOverlay.settings).collections);
  const masterDocs = object(master.docs);
  const incomingDocs = object(incoming.docs);
  const masterSettings = object(master.settings);
  const incomingSettings = object(incoming.settings);
  const docs = { ...object(previousOverlay.docs) };
  const allowedDocIds = normalizeDocumentIds(metadata.allowedDocIds);

  for (const docId of allowedDocIds) {
    if (!hasOwn(incomingDocs, docId)) continue;
    const text = String(incomingDocs[docId] ?? '');
    if (!hasOwn(masterDocs, docId) || text !== String(masterDocs[docId] ?? '')) docs[docId] = text;
    else delete docs[docId];
  }

  const settingValues = {};
  const deletedSettings = [];
  const collections = {};
  const settingKeys = new Set([...Object.keys(masterSettings), ...Object.keys(incomingSettings)]);
  for (const key of settingKeys) {
    if (SHARED_SETTING_KEYS.has(key)) continue;
    if (COLLECTION_SETTING_KEYS.has(key)) {
      if (!hasOwn(incomingSettings, key)) {
        if (hasOwn(previousCollections, key)) collections[key] = previousCollections[key];
        continue;
      }
      const patch = buildCollectionPatch(masterSettings[key], incomingSettings[key]);
      if (Object.keys(patch.values).length || patch.deleted.length) collections[key] = patch;
      continue;
    }
    if (!hasOwn(incomingSettings, key)) {
      if (hasOwn(masterSettings, key)) deletedSettings.push(key);
      continue;
    }
    if (!hasOwn(masterSettings, key) || !isDeepStrictEqual(masterSettings[key], incomingSettings[key])) settingValues[key] = incomingSettings[key];
  }

  return {
    format: FORMAT,
    docs,
    settings: {
      values: settingValues,
      deleted: deletedSettings,
      collections,
    },
    updatedAt: String(metadata.updatedAt || incoming.updatedAt || new Date().toISOString()),
    updatedBy: metadata.updatedBy == null ? (incoming.updatedBy || null) : metadata.updatedBy,
    saveEvent: metadata.saveEvent || incoming.saveEvent || null,
    clientBuild: metadata.clientBuild || incoming.clientBuild || null,
  };
}

function findForeignMasterDocumentCopy(masterState, overlayValue, docIds = []) {
  const masterDocs = object(object(masterState).docs);
  const overlayDocs = object(object(overlayValue).docs);
  const ids = normalizeDocumentIds(docIds);
  for (const docId of ids) {
    if (!hasOwn(overlayDocs, docId)) continue;
    const text = String(overlayDocs[docId] ?? '');
    if (text.length < 1024) continue;
    for (const [masterDocId, masterText] of Object.entries(masterDocs)) {
      if (String(masterDocId) !== String(docId) && text === String(masterText ?? '')) {
        return { docId: String(docId), masterDocId: String(masterDocId), length: text.length };
      }
    }
  }
  return null;
}

function applyPersonalOverlay(masterState, overlayValue) {
  const master = object(masterState);
  const overlay = object(overlayValue);
  const patchSettings = object(overlay.settings);
  const merged = {
    ...master,
    docs: { ...object(master.docs), ...object(overlay.docs) },
    settings: { ...object(master.settings) },
  };

  for (const key of Array.isArray(patchSettings.deleted) ? patchSettings.deleted : []) delete merged.settings[key];
  Object.assign(merged.settings, object(patchSettings.values));

  for (const [key, patchValue] of Object.entries(object(patchSettings.collections))) {
    const patch = object(patchValue);
    const collection = { ...object(merged.settings[key]) };
    for (const itemKey of Array.isArray(patch.deleted) ? patch.deleted : []) delete collection[itemKey];
    Object.assign(collection, object(patch.values));
    merged.settings[key] = collection;
  }

  const summary = overlaySummary(overlay);
  merged.personalized = summary.hasChanges;
  merged.personalOverlay = {
    format: overlay.format || FORMAT,
    updatedAt: overlay.updatedAt || null,
    docCount: summary.docCount,
    settingCount: summary.settingCount,
  };
  if (overlay.updatedAt && (!master.updatedAt || Date.parse(overlay.updatedAt) >= Date.parse(master.updatedAt))) {
    merged.updatedAt = overlay.updatedAt;
    merged.updatedBy = overlay.updatedBy || master.updatedBy || null;
    if (overlay.saveEvent) merged.saveEvent = overlay.saveEvent;
  }
  return merged;
}

function overlaySummary(overlayValue) {
  const overlay = object(overlayValue);
  const settings = object(overlay.settings);
  let settingCount = Object.keys(object(settings.values)).length + (Array.isArray(settings.deleted) ? settings.deleted.length : 0);
  for (const patchValue of Object.values(object(settings.collections))) {
    const patch = object(patchValue);
    settingCount += Object.keys(object(patch.values)).length + (Array.isArray(patch.deleted) ? patch.deleted.length : 0);
  }
  const docCount = Object.keys(object(overlay.docs)).length;
  return { docCount, settingCount, hasChanges: docCount > 0 || settingCount > 0 };
}

module.exports = {
  FORMAT,
  SHARED_SETTING_KEYS,
  COLLECTION_SETTING_KEYS,
  normalizeDocumentIds,
  applyPersonalOverlay,
  buildPersonalOverlay,
  findForeignMasterDocumentCopy,
  overlaySummary,
};
