#!/usr/bin/env node
//
// Guard for the telemetry worker's dependency pin.
//
// telemetry-worker/package.json carries an overrides block forcing undici to
// ^7.29.0. It is there because miniflare depends on *exactly* undici 7.28.0,
// which is the top of the vulnerable range shared by twelve advisories
// (7.0.0 - 7.28.0). npm cannot resolve past an exact transitive pin and
// Dependabot cannot rewrite one, so without the override the directory carries
// all twelve.
//
// The failure mode this catches is quiet: someone drops the override while
// bumping wrangler, npm resolves undici back to 7.28.0, and nothing complains
// until the next person runs `npm audit` in a directory no CI job builds.
//
// Deliberately not a blanket `npm audit`. That would fail unrelated pull
// requests whenever a new advisory lands anywhere in wrangler's tree, which
// trains people to ignore a red build. This asserts one invariant that only
// changes when someone changes it.
//
'use strict';

const fs = require('fs');
const path = require('path');

const MIN_UNDICI = '7.29.0';

const root = path.resolve(__dirname, '..', 'telemetry-worker');
const errors = [];

function cmpVersion(a, b) {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d !== 0) return d;
    }
    return 0;
}

function readJson(rel) {
    try {
        return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
    } catch (e) {
        errors.push(`cannot read telemetry-worker/${rel}: ${e.message}`);
        return null;
    }
}

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');

if (pkg) {
    const override = pkg.overrides && pkg.overrides.undici;
    if (!override) {
        errors.push(
            'package.json has no overrides.undici. miniflare pins undici to exactly ' +
            '7.28.0, which carries twelve advisories; the override is what forces a ' +
            `patched ${MIN_UNDICI}+.`
        );
    }

    // The worker's toolchain requires it, and a CI job on Node 20 would fail in a
    // way that looks like a wrangler bug rather than a version mismatch.
    const engines = pkg.engines && pkg.engines.node;
    if (!engines) errors.push('package.json does not declare engines.node (wrangler needs >= 22)');
}

if (lock) {
    const entries = Object.entries(lock.packages || {}).filter(
        ([k]) => k.split('node_modules/').pop() === 'undici'
    );

    if (entries.length === 0) {
        // undici is a transitive dependency of miniflare; if it vanished entirely
        // the tree changed shape and this guard needs rethinking, not silence.
        errors.push('no undici entry in package-lock.json - has the dependency tree changed?');
    }

    for (const [where, meta] of entries) {
        if (cmpVersion(meta.version, MIN_UNDICI) < 0) {
            errors.push(
                `${where} resolves undici ${meta.version}, below the patched ${MIN_UNDICI}. ` +
                'Run `npm install` in telemetry-worker/ with the override in place.'
            );
        }
    }
}

if (errors.length) {
    console.error('\n  Telemetry worker dependency check FAILED:\n');
    for (const e of errors) console.error(`    - ${e}`);
    console.error('');
    process.exit(1);
}

const undiciVersions = Object.entries(lock.packages || {})
    .filter(([k]) => k.split('node_modules/').pop() === 'undici')
    .map(([, m]) => m.version);

console.log(`  Telemetry worker check passed (undici ${undiciVersions.join(', ')}).`);
