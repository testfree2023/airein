/**
 * install-profile — P004 ~/.airein/install-profile.json 读写
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROFILE_SCHEMA = 'airein.install-profile.v1';
const PROFILE_FILENAME = 'install-profile.json';
const { DEFAULT_DELIVERY, normalizeDelivery } = require('./asset-delivery');

function profilePath(kernelRoot) {
  return path.join(path.resolve(kernelRoot), PROFILE_FILENAME);
}

function defaultProfile(kernelRoot, opts = {}) {
  return {
    schema: PROFILE_SCHEMA,
    kernelRoot: path.resolve(kernelRoot),
    delivery: normalizeDelivery(opts.delivery),
    installedVersion: null,
    installedAt: null,
    hosts: [],
  };
}

function readProfile(kernelRoot) {
  const fp = profilePath(kernelRoot);
  if (!fs.existsSync(fp)) return null;
  let raw;
  try {
    raw = fs.readFileSync(fp, 'utf8');
  } catch (err) {
    throw new Error(`install-profile: read failed ${fp}: ${err.message}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`install-profile: invalid JSON in ${fp}: ${err.message}`);
  }
  return data;
}

function writeProfile(kernelRoot, data) {
  const fp = profilePath(kernelRoot);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const out = {
    ...data,
    schema: PROFILE_SCHEMA,
    kernelRoot: path.resolve(kernelRoot),
    delivery: normalizeDelivery(data.delivery),
  };
  fs.writeFileSync(fp, `${JSON.stringify(out, null, 2)}\n`);
  return out;
}

/**
 * @param {object} profile
 * @param {{ id: string, platform?: string }} host
 */
function upsertHost(profile, host) {
  const now = new Date().toISOString();
  const idx = profile.hosts.findIndex((h) => h.id === host.id);
  const entry = {
    id: host.id,
    platform: host.platform || process.platform,
    registeredAt: now,
  };
  if (idx >= 0) {
    profile.hosts[idx] = { ...profile.hosts[idx], ...entry, registeredAt: profile.hosts[idx].registeredAt || now };
  } else {
    profile.hosts.push(entry);
  }
  return profile;
}

function readDelivery(profile) {
  return normalizeDelivery(profile && profile.delivery);
}

module.exports = {
  PROFILE_SCHEMA,
  PROFILE_FILENAME,
  profilePath,
  defaultProfile,
  readProfile,
  writeProfile,
  upsertHost,
  readDelivery,
  DEFAULT_DELIVERY,
};
