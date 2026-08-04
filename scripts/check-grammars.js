#!/usr/bin/env node
//
// Packaging guard for the grammar submodule.
//
// The TextMate grammars live in the VisualText/nlpplus-tmbundle repository and are
// pulled in as the `grammars/` submodule, so that Linguist, Shiki, bat and friends
// vendor the same files we ship.
//
// vsce does NOT validate the paths in contributes.grammars: if the submodule has not
// been initialized it packages a vsix with the grammars silently missing, exits 0, and
// the published extension loads without colorizing anything. This script closes that
// hole. It runs before every package/publish.
//
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const contributes = pkg.contributes || {};
const errors = [];

function checkJsonFile(relPath, label, validate) {
    const abs = path.join(root, relPath);
    if (!fs.existsSync(abs)) {
        errors.push(`${label}: file not found — ${relPath}`);
        return;
    }
    const raw = fs.readFileSync(abs, 'utf8');
    if (!raw.trim()) {
        errors.push(`${label}: file is empty — ${relPath}`);
        return;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        errors.push(`${label}: not valid JSON — ${relPath} (${e.message})`);
        return;
    }
    if (validate) {
        const problem = validate(parsed);
        if (problem) errors.push(`${label}: ${problem} — ${relPath}`);
    }
}

for (const g of contributes.grammars || []) {
    checkJsonFile(g.path, `grammar "${g.scopeName}"`, (grammar) => {
        if (grammar.scopeName !== g.scopeName) {
            return `scopeName is "${grammar.scopeName}" but package.json declares "${g.scopeName}"`;
        }
        if (!Array.isArray(grammar.patterns) || grammar.patterns.length === 0) {
            return 'grammar has no patterns';
        }
        return null;
    });
}

for (const l of contributes.languages || []) {
    if (l.configuration) checkJsonFile(l.configuration, `language "${l.id}" configuration`);
}

// The language configurations exist twice: the copies at the repo root are what VSCode
// loads, and identical copies live in the grammar submodule, which is what Linguist,
// Shiki and friends vendor. Nothing links them, so an edit to one silently drifts from
// the other -- exactly how the submodule's nlp-configuration.json came to be missing
// blockComment and the indentation rules for two releases. Require the pairs to match.
const SUBMODULE_CONFIG_DIR = 'grammars/language-configuration';
for (const l of contributes.languages || []) {
    if (!l.configuration) continue;
    const rootAbs = path.join(root, l.configuration);
    const twinRel = path.posix.join(SUBMODULE_CONFIG_DIR, path.basename(l.configuration));
    const twinAbs = path.join(root, twinRel);
    if (!fs.existsSync(rootAbs)) continue;   // already reported above
    if (!fs.existsSync(twinAbs)) {
        errors.push(`language "${l.id}" configuration: no submodule copy — expected ${twinRel}`);
        continue;
    }
    // Line endings are whatever core.autocrlf handed each checkout, so compare content.
    const norm = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    if (norm(rootAbs) !== norm(twinAbs)) {
        errors.push(
            `language "${l.id}" configuration: ${l.configuration} and ${twinRel} have drifted ` +
            `— copy one over the other so the vendored grammars match what we ship`
        );
    }
}

if (errors.length) {
    console.error('\n  Grammar check FAILED:\n');
    for (const e of errors) console.error(`    - ${e}`);
    if (errors.some((e) => e.includes('grammars/'))) {
        console.error('\n  The grammars/ submodule looks uninitialized. Run:\n');
        console.error('      git submodule update --init --recursive\n');
    }
    process.exit(1);
}

const count = (contributes.grammars || []).length;
console.log(`  Grammar check passed (${count} grammar${count === 1 ? '' : 's'}).`);
