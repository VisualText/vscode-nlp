// Native (TypeScript) golden-file regression runner for NLP++ analyzers.
//
// This is the in-extension equivalent of visualText/python/nlp_regress.py run
// in its --cli mode: for every input file it runs nlp.exe, reads the analyzer's
// <input>_log/output.json, normalizes it semantically (drop volatile `id`
// fields, sort extraction-record lists), and compares against a golden under
// <analyzer>/test/expected/. Output goes to the NLP++ log view instead of a
// terminal, and it needs no python on PATH.
//
// The normalization MUST stay byte-compatible with nlp_regress.py so goldens
// blessed by either path interchange. See canon()/diffRecords() below.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as cp from 'child_process';
import { visualText } from './visualText';
import { logView, logLineType } from './logView';

const LOG_DIR_SUFFIX = '_log';
const DEFAULT_EXCLUDE_NAMES = new Set(['sources.md', 'readme.md']);
const DEFAULT_EXCLUDE_SUFFIXES = new Set(['.json']);
const DEFAULT_IGNORE_FIELDS = ['id'];

interface RegressConfig {
    include: string[];
    exclude: string[];
    ignoreFields: string[];
}

export class RegressionRunner {

    // ----- public entry points -------------------------------------------------

    // scope (optional) limits the run to a folder under <analyzer>/input/; when
    // omitted the whole input/ tree is used.
    public async test(analyzerDir: vscode.Uri, scope?: vscode.Uri): Promise<void> {
        await this.run(analyzerDir, 'test', scope);
    }

    public async bless(analyzerDir: vscode.Uri, scope?: vscode.Uri): Promise<void> {
        await this.run(analyzerDir, 'bless', scope);
    }

    // True if any golden (.json under test/expected/) exists for the analyzer, or
    // for the given scope folder (mirrored under test/expected/).
    public goldensExist(analyzerDir: vscode.Uri, scope?: vscode.Uri): boolean {
        const expectedRoot = path.join(analyzerDir.fsPath, 'test', 'expected');
        const inputRoot = path.join(analyzerDir.fsPath, 'input');
        if (scope && this.isFile(scope.fsPath)) {
            const rel = path.relative(inputRoot, scope.fsPath);
            return fs.existsSync(path.join(expectedRoot, rel + '.json'));
        }
        const dir = scope ? path.join(expectedRoot, path.relative(inputRoot, scope.fsPath)) : expectedRoot;
        return this.dirHasJson(dir);
    }

    // ----- core loop -----------------------------------------------------------

    private async run(analyzerDir: vscode.Uri, command: 'test' | 'bless', scope?: vscode.Uri): Promise<void> {
        const anaPath = analyzerDir.fsPath;
        const name = path.basename(anaPath.replace(/[\\/]+$/, ''));

        const exe = this.enginePath();
        if (!exe || !fs.existsSync(exe)) {
            this.log(`Regression: NLP engine not found (${exe || 'nlp.exe'})`, analyzerDir);
            vscode.window.showErrorMessage('NLP engine not found. Download it first.');
            return;
        }
        const engineDir = visualText.engineDirectory().fsPath;

        const cfg = this.loadConfig(anaPath);
        const inputRoot = path.join(anaPath, 'input');
        // scope can be a single input file, a folder under input/, or nothing.
        let inputs: string[];
        let scopeLabel = '';
        if (scope && this.isFile(scope.fsPath)) {
            inputs = [scope.fsPath];
            scopeLabel = ` (file: ${path.relative(inputRoot, scope.fsPath)})`;
        } else {
            inputs = this.findInputs(anaPath, cfg, scope?.fsPath);
            scopeLabel = scope ? ` (folder: ${path.relative(inputRoot, scope.fsPath) || 'input'})` : '';
        }
        if (inputs.length === 0) {
            this.log(`${name}: no input files found under input/${scopeLabel}`, analyzerDir);
            vscode.window.showWarningMessage(`${name}: no input files found under input/${scopeLabel}`);
            return;
        }

        const ignore = new Set(cfg.ignoreFields);

        // Surface everything in the NLP++ log view (not the status bar): reveal
        // the panel, clear prior output, then refresh after each file so results
        // stream in live.
        vscode.commands.executeCommand('workbench.view.extension.vtOutput');
        vscode.commands.executeCommand('logView.focus');
        logView.clearLogs();

        this.log(`engine: ${exe}`, analyzerDir);
        this.log(`${name}: ${command === 'bless' ? 'blessing' : 'testing'} ${inputs.length} input file(s)${scopeLabel}`, analyzerDir);
        this.refresh();

        let passed = 0, failed = 0, missing = 0, blessed = 0;

        for (const inp of inputs) {
            const rel = path.relative(path.join(anaPath, 'input'), inp);
            const inputUri = vscode.Uri.file(inp);

            const out = await this.analyze(exe, engineDir, anaPath, inp);
            const actual = this.canon(out, ignore);
            const gp = this.goldenPath(anaPath, inp);

            if (command === 'bless') {
                fs.mkdirSync(path.dirname(gp), { recursive: true });
                fs.writeFileSync(gp, this.serialize(actual) + '\n', 'utf8');
                blessed++;
                this.log(`  blessed  ${rel}`, inputUri);
                this.refresh();
                continue;
            }

            if (!fs.existsSync(gp)) {
                missing++;
                this.log(`  MISSING  ${rel}  (no golden - run 'bless')`, inputUri);
                this.refresh();
                continue;
            }
            const expected = JSON.parse(fs.readFileSync(gp, 'utf8'));
            if (this.deepEqual(expected, actual)) {
                passed++;
                this.log(`  PASS     ${rel}`, inputUri);
                this.refresh();
                continue;
            }
            failed++;
            this.log(`  FAIL     ${rel}`, inputUri);
            const { removed, added } = this.diffRecords(expected, actual, ignore);
            for (const r of removed) this.log(`      - ${r}`, inputUri);
            for (const a of added) this.log(`      + ${a}`, inputUri);
            if (removed.length === 0 && added.length === 0)
                this.log('      (output structure changed; see test/expected/ vs run)', inputUri);
            this.refresh();
        }

        if (command === 'bless') {
            const msg = `${name}: blessed ${blessed} golden(s) under test/expected/`;
            this.log(msg, analyzerDir);
            vscode.window.showInformationMessage(msg);
        } else {
            const total = passed + failed + missing;
            const status = (failed === 0 && missing === 0) ? 'OK' : 'REGRESSION';
            const summary = `${name}: ${passed}/${total} passed`
                + (failed ? `, ${failed} failed` : '')
                + (missing ? `, ${missing} missing` : '')
                + `   [${status}]`;
            this.log(`  ${summary}`, analyzerDir);
            if (status === 'OK')
                vscode.window.showInformationMessage(summary);
            else
                vscode.window.showWarningMessage(summary);
        }
        vscode.commands.executeCommand('logView.refreshAll');
    }

    // ----- engine invocation (CLI backend) -------------------------------------

    private enginePath(): string {
        const engineDir = visualText.engineDirectory().fsPath;
        if (!engineDir) return '';
        const exeName = os.platform() === 'win32' ? 'nlp.exe' : 'nlp';
        return path.join(engineDir, exeName);
    }

    // Run nlp.exe over one input and return the parsed <input>_log/output.json.
    // Mirrors CliBackend.analyze in nlp_regress.py: clear the log dir, run the
    // engine, read output.json, then remove the log dir.
    private analyze(exe: string, engineDir: string, anaPath: string, inputPath: string): Promise<any> {
        const logDir = inputPath + LOG_DIR_SUFFIX;
        this.rmrf(logDir);
        const args = ['-ANA', anaPath, '-WORK', engineDir, inputPath];
        return new Promise(resolve => {
            cp.execFile(exe, args, { maxBuffer: 1024 * 1024 * 64 }, () => {
                let data: any = {};
                try {
                    const outJson = path.join(logDir, 'output.json');
                    if (fs.existsSync(outJson))
                        data = JSON.parse(fs.readFileSync(outJson, 'utf8'));
                } catch {
                    data = {};
                }
                this.rmrf(logDir);
                resolve(data || {});
            });
        });
    }

    // ----- input discovery (find_inputs) ---------------------------------------

    private findInputs(anaPath: string, cfg: RegressConfig, walkDir?: string): string[] {
        const root = path.join(anaPath, 'input');
        // Discover from walkDir (a folder under input/) when scoped; rel paths,
        // golden paths and include/exclude globs stay anchored at input/.
        const start = walkDir ?? root;
        if (!this.isDir(start)) return [];
        const inputs: string[] = [];
        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) { walk(full); continue; }
                if (!entry.isFile()) continue;
                const rel = path.relative(root, full);
                // skip anything inside an engine "<file>_log" output directory
                if (rel.split(/[\\/]/).some(p => p.endsWith(LOG_DIR_SUFFIX))) continue;
                if (DEFAULT_EXCLUDE_NAMES.has(entry.name.toLowerCase())) continue;
                if (DEFAULT_EXCLUDE_SUFFIXES.has(path.extname(entry.name).toLowerCase())) continue;
                const relPosix = rel.split(path.sep).join('/');
                if (cfg.include.length && !cfg.include.some(g => this.globMatch(relPosix, g))) continue;
                if (cfg.exclude.some(g => this.globMatch(relPosix, g))) continue;
                inputs.push(full);
            }
        };
        walk(start);
        inputs.sort();
        return inputs;
    }

    private dirHasJson(dir: string): boolean {
        if (!this.isDir(dir)) return false;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (this.dirHasJson(full)) return true;
            } else if (entry.name.endsWith('.json')) {
                return true;
            }
        }
        return false;
    }

    private loadConfig(anaPath: string): RegressConfig {
        const cfg: RegressConfig = { include: [], exclude: [], ignoreFields: [...DEFAULT_IGNORE_FIELDS] };
        const cfgPath = path.join(anaPath, 'test', 'regress.json');
        if (fs.existsSync(cfgPath)) {
            try {
                const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
                if (Array.isArray(raw.include)) cfg.include = raw.include;
                if (Array.isArray(raw.exclude)) cfg.exclude = raw.exclude;
                if (Array.isArray(raw.ignore_fields)) cfg.ignoreFields = raw.ignore_fields;
            } catch (e: any) {
                this.log(`Regression: could not read ${cfgPath}: ${e?.message ?? e}`, vscode.Uri.file(cfgPath));
            }
        }
        return cfg;
    }

    private goldenPath(anaPath: string, inputPath: string): string {
        const rel = path.relative(path.join(anaPath, 'input'), inputPath);
        return path.join(anaPath, 'test', 'expected', rel + '.json');
    }

    // ----- normalization & diff (must match nlp_regress.py) --------------------

    // Drop ignore fields recursively; sort lists whose items are all objects/arrays
    // so a renumber/reorder is not flagged as a regression.
    private canon(obj: any, ignore: Set<string>): any {
        if (Array.isArray(obj)) {
            const items = obj.map(v => this.canon(v, ignore));
            if (items.length && items.every(v => v !== null && typeof v === 'object')) {
                items.sort((a, b) => {
                    const ka = this.stable(a), kb = this.stable(b);
                    return ka < kb ? -1 : ka > kb ? 1 : 0;
                });
            }
            return items;
        }
        if (obj !== null && typeof obj === 'object') {
            const out: any = {};
            for (const k of Object.keys(obj))
                if (!ignore.has(k)) out[k] = this.canon(obj[k], ignore);
            return out;
        }
        return obj;
    }

    // Flatten the extraction records (leaf list-of-dicts) for a readable diff.
    private records(obj: any): any[] {
        const out: any[] = [];
        if (Array.isArray(obj)) {
            if (obj.length && obj.every(v => v !== null && typeof v === 'object' && !Array.isArray(v)))
                out.push(...obj);
            else
                for (const v of obj) out.push(...this.records(v));
        } else if (obj !== null && typeof obj === 'object') {
            for (const v of Object.values(obj)) out.push(...this.records(v));
        }
        return out;
    }

    private diffRecords(expected: any, actual: any, ignore: Set<string>): { removed: string[]; added: string[] } {
        const bag = (o: any): Map<string, number> => {
            const b = new Map<string, number>();
            for (const r of this.records(o)) {
                const stripped: any = {};
                for (const k of Object.keys(r)) if (!ignore.has(k)) stripped[k] = r[k];
                const key = this.stable(stripped);
                b.set(key, (b.get(key) ?? 0) + 1);
            }
            return b;
        };
        const eb = bag(expected), ab = bag(actual);
        const removed: string[] = [], added: string[] = [];
        for (const [k, n] of eb) for (let i = 0; i < Math.max(0, n - (ab.get(k) ?? 0)); i++) removed.push(k);
        for (const [k, n] of ab) for (let i = 0; i < Math.max(0, n - (eb.get(k) ?? 0)); i++) added.push(k);
        return { removed, added };
    }

    // ----- json helpers --------------------------------------------------------

    // Stable stringify with recursively sorted object keys (matches python
    // json.dumps(..., sort_keys=True)). Arrays keep their order.
    private stable(obj: any): string {
        return JSON.stringify(this.sortKeys(obj));
    }

    // Pretty (indent=2) sorted-key serialization for golden files, matching
    // json.dumps(canon, indent=2, ensure_ascii=False, sort_keys=True).
    private serialize(obj: any): string {
        return JSON.stringify(this.sortKeys(obj), null, 2);
    }

    private sortKeys(obj: any): any {
        if (Array.isArray(obj)) return obj.map(v => this.sortKeys(v));
        if (obj !== null && typeof obj === 'object') {
            const out: any = {};
            for (const k of Object.keys(obj).sort()) out[k] = this.sortKeys(obj[k]);
            return out;
        }
        return obj;
    }

    private deepEqual(a: any, b: any): boolean {
        return this.stable(a) === this.stable(b);
    }

    // ----- misc ----------------------------------------------------------------

    // Minimal glob matcher for test/regress.json include/exclude (supports ** / * / ?).
    private globMatch(relPosix: string, glob: string): boolean {
        const re = '^' + glob
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*/g, ' ')
            .replace(/\*/g, '[^/]*')
            .replace(/ /g, '.*')
            .replace(/\?/g, '.') + '$';
        return new RegExp(re).test(relPosix);
    }

    private isDir(p: string): boolean {
        try { return fs.statSync(p).isDirectory(); } catch { return false; }
    }

    private isFile(p: string): boolean {
        try { return fs.statSync(p).isFile(); } catch { return false; }
    }

    private rmrf(p: string): void {
        try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    private log(message: string, uri: vscode.Uri): void {
        logView.addMessage(message, logLineType.ANALYER_OUTPUT, uri);
    }

    private refresh(): void {
        vscode.commands.executeCommand('logView.refreshAll');
    }
}

export const regressionRunner = new RegressionRunner();
