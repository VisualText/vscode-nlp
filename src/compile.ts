import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { visualText } from './visualText';
import { logView, logLineType } from './logView';

export enum compileTarget { ANALYZER, KB_ONLY, ANALYZER_ONLY }

interface NlpCompileResult {
    ok: boolean;
    stdout: string;
    stderr: string;
}

interface EngineCompileSupport {
    engineRoot: string;
    includeDirs: string[];
    libraryFiles: string[];
    headerFiles: string[];
    missingHeaders: string[];
    missingLibraries: string[];
}

interface CommandResult {
    ok: boolean;
    stdout: string;
    stderr: string;
    errorMessage?: string;
}

export let nlpCompile: NLPCompile;
export class NLPCompile {

    constructor() { }

    static attach(): NLPCompile {
        if (!nlpCompile) {
            nlpCompile = new NLPCompile();
        }
        return nlpCompile;
    }

    // ---------------------------------------------------------------------------
    // Top-level entry points
    // ---------------------------------------------------------------------------

    async compileAnalyzer(analyzerDir: vscode.Uri): Promise<void> {
        await this.runCompile(analyzerDir, compileTarget.ANALYZER);
    }

    async compileKBOnly(analyzerDir: vscode.Uri): Promise<void> {
        await this.runCompile(analyzerDir, compileTarget.KB_ONLY);
    }

    // Analyzer-only: regenerate the analyzer C++ (run/) via -COMPILEANA without
    // regenerating the KB, then rebuild the analyzer library reusing the
    // already-generated kb/*.cpp. Fast recompile when only NLP++ rules changed.
    async compileAnalyzerOnly(analyzerDir: vscode.Uri): Promise<void> {
        await this.runCompile(analyzerDir, compileTarget.ANALYZER_ONLY);
    }

    // Export a stand-alone, runnable compiled analyzer into a separate folder.
    // The result contains the compiled library (staged under bin/ as the run/kb
    // entry points the engine loads), the lazy "*full.dict"/"*full.kbb" files
    // (which cannot be compiled and must remain on disk for stream lookup), and
    // any "spec/*.py" python-pass scripts (a compiled python pass still shells out
    // to spec/<script>.py at runtime, so the script must ship). The NLP++ rule
    // source (spec/*.nlp), input/, and the non-full .kb/.dict sources (now baked
    // into the library) are deliberately left out, so the shipped folder keeps the
    // rule source hidden while exposing only the data the runtime genuinely needs.
    async deployCompiledAnalyzer(analyzerDir: vscode.Uri): Promise<void> {
        const anapath = analyzerDir.fsPath;
        const analyzerName = path.basename(anapath.replace(/[\\/]+$/, ''));
        const ext = this.sharedLibraryExt();

        // The "Compile Analyzer and KB" target produces <analyzerName><ext>, a single
        // library exporting both run_analyzer and kb_setup. That combined lib is what a
        // fully-compiled (analyzer + KB) deployment needs, so require it here.
        const compiledLib = path.join(anapath, `${analyzerName}${ext}`);
        if (!fs.existsSync(compiledLib)) {
            const choice = await vscode.window.showErrorMessage(
                `No compiled library found (${analyzerName}${ext}). Run "Compile Analyzer and KB to C++ Library" first, then deploy.`,
                'Compile Analyzer and KB'
            );
            if (choice === 'Compile Analyzer and KB') {
                await this.compileAnalyzer(analyzerDir);
            }
            return;
        }

        // The lazy files are the only data that must ship alongside the library.
        const kbUserDir = path.join(anapath, 'kb', 'user');
        const fullFiles = this.findFullKBFiles(kbUserDir);

        // Ask where to write the deployment. Pick a parent directory; the analyzer
        // folder is created (or replaced) inside it.
        const picked = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: 'Select deployment location',
            title: `Deploy compiled analyzer "${analyzerName}" into…`
        });
        if (!picked || picked.length === 0) {
            return;
        }
        const destParent = picked[0].fsPath;
        const destDir = path.join(destParent, analyzerName);

        if (path.resolve(destDir) === path.resolve(anapath)) {
            vscode.window.showErrorMessage('Deployment target cannot be the analyzer folder itself. Choose a different location.');
            return;
        }

        if (fs.existsSync(destDir)) {
            const overwrite = await vscode.window.showWarningMessage(
                `"${destDir}" already exists. Replace it?`,
                { modal: true },
                'Replace'
            );
            if (overwrite !== 'Replace') {
                return;
            }
            try {
                fs.rmSync(destDir, { recursive: true, force: true });
            } catch (err: any) {
                vscode.window.showErrorMessage(`Could not remove existing folder: ${err?.message ?? err}`);
                return;
            }
        }

        try {
            // Top-level <analyzerName><ext> — the compile output as it sits in a normal
            // analyzer folder. Ship it so (a) the folder opens as an analyzer in the
            // extension and "Run (Compiled)" finds it (stageCompiledAnalyzer looks for
            // <name><ext> at the root and stages it into bin/), and (b) it's the
            // recognizable artifact users expect to see in the folder.
            fs.copyFileSync(compiledLib, path.join(destDir, `${analyzerName}${ext}`));

            // bin/ — the engine loads <appdir>/bin/run<ext> (analyzer body, via -COMPILED)
            // and <appdir>/bin/kb<ext> (compiled KB, auto-detected). The combined library
            // exports both entry points, so it is copied to every name the engine may look
            // up. Pre-staging bin/ means the folder also runs directly via
            // `nlp.exe -ANA <folder> -COMPILED` with no extension step. Mirrors
            // nlp.ts stageCompiledAnalyzer() for RunMode.COMPILED.
            const binDir = path.join(destDir, 'bin');
            fs.mkdirSync(binDir, { recursive: true });
            for (const name of ['run', 'runu', 'kb', 'kbu']) {
                fs.copyFileSync(compiledLib, path.join(binDir, `${name}${ext}`));
            }

            // kb/user/ — only the lazy full files. openFullFiles() in the engine scans
            // this directory when the compiled KB is loaded and stream-searches them.
            const destKbUser = path.join(destDir, 'kb', 'user');
            fs.mkdirSync(destKbUser, { recursive: true });
            for (const f of fullFiles) {
                fs.copyFileSync(f, path.join(destKbUser, path.basename(f)));
            }

            // spec/*.py — python-pass scripts. A compiled `python` pass generates a
            // python<N>() that shells out to <appdir>/spec/<script>.py at runtime, so
            // the script (and any sibling .py helpers) must ship. The .nlp rule files
            // are NOT copied, keeping the rule source hidden. An analyzer-level python/
            // package folder, if present, is copied whole for imported modules.
            const pyFiles = this.findSpecPyFiles(anapath);
            if (pyFiles.length) {
                const destSpec = path.join(destDir, 'spec');
                fs.mkdirSync(destSpec, { recursive: true });
                for (const f of pyFiles) {
                    fs.copyFileSync(f, path.join(destSpec, path.basename(f)));
                }
            }
            const analyzerPyDir = path.join(anapath, 'python');
            const pyDirStaged = fs.existsSync(analyzerPyDir) && fs.statSync(analyzerPyDir).isDirectory();
            if (pyDirStaged) {
                fs.cpSync(analyzerPyDir, path.join(destDir, 'python'), { recursive: true });
            }

            // Runtime working directories the engine writes into.
            for (const d of ['input', 'output', 'logs', 'tmp']) {
                fs.mkdirSync(path.join(destDir, d), { recursive: true });
            }

            const fullMsg = fullFiles.length
                ? `${fullFiles.length} lazy file(s): ${fullFiles.map(f => path.basename(f)).join(', ')}`
                : 'no *full.dict/*full.kbb files found (KB is fully compiled into the library)';
            const pyMsg = pyFiles.length
                ? `; ${pyFiles.length} python script(s): ${pyFiles.map(f => path.basename(f)).join(', ')}${pyDirStaged ? ' + python/' : ''}`
                : '';
            logView.addMessage(
                `Deployed compiled analyzer to ${destDir} (${analyzerName}${ext} + bin/${['run', 'runu', 'kb', 'kbu'].map(n => n + ext).join(', ')}; ${fullMsg}${pyMsg}).`,
                logLineType.ANALYER_OUTPUT,
                analyzerDir
            );
            vscode.window.showInformationMessage(
                `Deployed compiled analyzer "${analyzerName}". Run it with: nlp.exe -ANA "${destDir}" -WORK "<engine>" -COMPILED "<input>". Requires an installed NLP engine (nlp.exe + its data/rfb) of the same architecture as the compiled library.`,
                'Reveal in Explorer'
            ).then(choice => {
                if (choice === 'Reveal in Explorer') {
                    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(destDir));
                }
            });
        } catch (err: any) {
            const detail = err?.message ?? String(err);
            logView.addMessage(`Deploy failed: ${detail}`, logLineType.ANALYER_OUTPUT, analyzerDir);
            vscode.window.showErrorMessage(`Deploy compiled analyzer failed: ${detail}`);
        }
    }

    // ---------------------------------------------------------------------------
    // Core compile flow
    // ---------------------------------------------------------------------------

    private async runCompile(analyzerDir: vscode.Uri, target: compileTarget): Promise<void> {
        const targetLabel =
            target === compileTarget.KB_ONLY ? 'KB' :
            target === compileTarget.ANALYZER_ONLY ? 'Analyzer' :
            'Analyzer and KB';
        const compileFlag =
            target === compileTarget.KB_ONLY ? '-COMPILEKB' :
            target === compileTarget.ANALYZER_ONLY ? '-COMPILEANA' :
            '-COMPILE';

        // 1. Check NLP engine executable
        const exe = visualText.exePath().fsPath;
        if (!exe.length || !fs.existsSync(exe)) {
            vscode.window.showErrorMessage('NLP Engine missing', 'Download Now').then(response => {
                visualText.startUpdater();
            });
            return;
        }

        // KB-only compile needs at least one .kbb or .dict source under <analyzer>/kb/.
        // The engine would otherwise produce no kb cpp files and the build would fail late.
        if (target === compileTarget.KB_ONLY) {
            const kbSources = this.findKBSourceFiles(analyzerDir.fsPath);
            if (kbSources.length === 0) {
                const analyzerName = path.basename(analyzerDir.fsPath.replace(/[\\/]+$/, ''));
                const message = `No .kbb or .dict files found under ${analyzerName}/kb/user. Add KB sources before compiling the KB.`;
                logView.addMessage(message, logLineType.ANALYER_OUTPUT, analyzerDir);
                vscode.window.showWarningMessage(message);
                return;
            }
        }

        // Analyzer-only compile regenerates run/ C++ but NOT the KB. The analyzer
        // library still links kb/*.cpp, so those must already exist from a prior
        // "Compile Analyzer and KB" / "Compile KB".
        if (target === compileTarget.ANALYZER_ONLY) {
            const kbCpp = this.findGeneratedCppFiles(analyzerDir.fsPath, true); // kb only
            if (kbCpp.length === 0) {
                const analyzerName = path.basename(analyzerDir.fsPath.replace(/[\\/]+$/, ''));
                const message = `No generated KB C++ found under ${analyzerName}/kb/. Run "Compile Analyzer and KB" (or "Compile KB") once before "Compile Analyzer Only".`;
                logView.addMessage(message, logLineType.ANALYER_OUTPUT, analyzerDir);
                vscode.window.showWarningMessage(message);
                return;
            }
        }

        vscode.window.withProgress({
            // Status-bar progress instead of a sticky bottom-right popup —
            // the cloud-compile path can wait several minutes for a GHA
            // runner to dequeue, and a long-lived popup is intrusive.
            // The completion notification below still appears as a popup.
            location: vscode.ProgressLocation.Window,
            title: `Compile ${targetLabel}`,
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 10, message: 'Generating C++ code...' });
            logView.addMessage(`Compiling ${targetLabel}: ${path.basename(analyzerDir.fsPath)}`, logLineType.ANALYER_OUTPUT, analyzerDir);
            vscode.commands.executeCommand('logView.refreshAll');

            // 2. Run nlp.exe -COMPILE to generate C++ code
            const engineDir = path.dirname(exe);
            const anapath = analyzerDir.fsPath;
            // The engine writes the analyzer body to <ana>/run/ via std::ofstream and
            // will not create the parent directory itself; pre-create it.
            const runDir = path.join(anapath, 'run');
            if (!fs.existsSync(runDir)) {
                fs.mkdirSync(runDir, { recursive: true });
            }
            const compileResult = await this.runNlpCompile(exe, anapath, engineDir, compileFlag);
            const cppFiles = this.findGeneratedCppFiles(anapath);

            if (cppFiles.length === 0) {
                const detail = compileResult.stderr?.trim() || compileResult.stdout?.trim() || 'No diagnostics returned by nlp.exe.';
                const message = `C++ generation failed for ${targetLabel}: ${detail}`;
                logView.addMessage(message, logLineType.ANALYER_OUTPUT, analyzerDir);
                vscode.window.showErrorMessage(message);
                progress.report({ increment: 100, message: 'C++ generation failed.' });
                return;
            }

            if (!compileResult.ok) {
                logView.addMessage(
                    `nlp.exe reported post-generation build errors, but generated C++ files were found. Continuing with extension compiler step.`,
                    logLineType.ANALYER_OUTPUT,
                    analyzerDir
                );
            }

            const kbOnly = target === compileTarget.KB_ONLY;
            // Library naming mirrors the run modes in status.ts:
            //   KB_ONLY       -> kb.<ext>              (KB compiled, analyzer interpreted)
            //   ANALYZER_ONLY -> analyzer.<ext>        (analyzer compiled, KB interpreted)
            //   ANALYZER      -> <analyzerName>.<ext>  (analyzer + KB compiled together)
            const libBaseName =
                target === compileTarget.KB_ONLY ? 'kb' :
                target === compileTarget.ANALYZER_ONLY ? 'analyzer' :
                path.basename(anapath);

            const compileMode = (vscode.workspace.getConfiguration('compile').get<string>('mode') || 'local').toLowerCase();
            let success = false;

            if (compileMode === 'cloud') {
                progress.report({ increment: 30, message: 'Submitting to compile service...' });
                success = await this.compileCppOnCloud(anapath, libBaseName, kbOnly, progress);
            } else {
                progress.report({ increment: 30, message: 'Checking CMake and NLP-engine compile libraries...' });

                // On Windows, the engine release ships ICU as DLLs only. Generate matching .lib
                // import libraries from those DLLs (using dumpbin + lib) so the link step can
                // resolve icu_78::* references from prim.lib.
                if (os.platform() === 'win32') {
                    await this.ensureIcuImportLibs(engineDir, anapath);
                }

                const compileSupport = await this.resolveCompileSupport(anapath);
                if (!compileSupport) {
                    vscode.commands.executeCommand('logView.refreshAll');
                    return;
                }

                progress.report({ increment: 20, message: 'Compiling C++ library...' });
                success = await this.compileCppWithCMake(anapath, compileSupport, libBaseName, kbOnly);
            }

            if (success) {
                const libName = this.sharedLibraryName(libBaseName);
                const libPath = path.join(analyzerDir.fsPath, libName);
                logView.addMessage(`Compile ${targetLabel} succeeded: ${libName}`, logLineType.ANALYER_OUTPUT, analyzerDir);
                // Action-button notification stays visible until dismissed (a
                // plain showInformationMessage auto-fades after a few seconds,
                // easy to miss after a long cloud-compile wait).
                vscode.window.showInformationMessage(
                    `Compile ${targetLabel} succeeded: ${libName}`,
                    'Reveal in Explorer'
                ).then(choice => {
                    if (choice === 'Reveal in Explorer') {
                        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(libPath));
                    }
                });
            } else {
                logView.addMessage(`Compile ${targetLabel} failed. Check the output for details.`, logLineType.ANALYER_OUTPUT, analyzerDir);
                // Same persistence rationale as the success notification.
                vscode.window.showErrorMessage(
                    `Compile ${targetLabel} failed. See the NLP output panel for details.`,
                    'Open Output'
                ).then(choice => {
                    if (choice === 'Open Output') {
                        // logView lives inside the `vtOutput` panel container
                        // (see package.json viewsContainers). Just calling
                        // `logView.focus` on a hidden container is a no-op,
                        // so reveal the container first.
                        vscode.commands.executeCommand('workbench.view.extension.vtOutput');
                        vscode.commands.executeCommand('logView.focus');
                    }
                });
            }

            vscode.commands.executeCommand('logView.refreshAll');
            vscode.commands.executeCommand('analyzerView.refreshAll');
            vscode.commands.executeCommand('kbView.refreshAll');

            progress.report({ increment: 40, message: success ? 'Done.' : 'Failed.' });
        });
    }

    // ---------------------------------------------------------------------------
    // Step 1: Run nlp.exe -COMPILE
    // ---------------------------------------------------------------------------

    private runNlpCompile(exe: string, anapath: string, engineDir: string, compileFlag: string = '-COMPILE'): Promise<NlpCompileResult> {
        const cp = require('child_process');
        const compileAnaPath = this.pathForNlpExe(anapath);
        const compileWorkPath = this.pathForNlpExe(engineDir);
        const args: string[] = [compileFlag, '-ANA', compileAnaPath, '-WORK', compileWorkPath];

        logView.addMessage(`Running: ${exe} ${args.join(' ')}`, logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));

        if (os.platform() === 'win32') {
            const vsDevCmd = this.findVsDevCmdScript();
            if (vsDevCmd) {
                return this.runNlpCompileWithVsDevCmd(vsDevCmd, exe, args, anapath, compileFlag);
            }
        }

        return new Promise(resolve => {
            cp.execFile(exe, args, (err: any, stdout: string, stderr: string) => {
                const out = stdout ? stdout.trim() : '';
                const errOut = stderr ? stderr.trim() : '';

                if (stdout) {
                    logView.addMessage('nlp.exe stdout: ' + out, logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                }
                if (stderr) {
                    logView.addMessage('nlp.exe stderr: ' + errOut, logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                }
                if (err) {
                    logView.addMessage(`nlp.exe ${compileFlag} error: ` + err.message, logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                    vscode.window.showErrorMessage('C++ code generation failed: ' + err.message);
                    resolve({ ok: false, stdout: out, stderr: errOut.length ? errOut : err.message });
                } else {
                    resolve({ ok: true, stdout: out, stderr: errOut });
                }
            });
        });
    }

    private runNlpCompileWithVsDevCmd(setupScript: string, exe: string, args: string[], anapath: string, compileFlag: string = '-COMPILE'): Promise<NlpCompileResult> {
        const cp = require('child_process');
        const exeArg = this.formatCmdArg(args.length ? exe : exe);
        const commandArgs = args.map(arg => this.formatCmdArg(arg)).join(' ');
        const command = `call "${setupScript}" -arch=x64 -host_arch=x64 >nul && ${exeArg} ${commandArgs}`;

        return new Promise(resolve => {
            cp.exec(command, { shell: 'cmd.exe' }, (err: any, stdout: string, stderr: string) => {
                const out = stdout ? stdout.trim() : '';
                const errOut = stderr ? stderr.trim() : '';

                if (stdout) {
                    logView.addMessage('nlp.exe stdout: ' + out, logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                }
                if (stderr) {
                    logView.addMessage('nlp.exe stderr: ' + errOut, logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                }
                if (err) {
                    logView.addMessage(`nlp.exe ${compileFlag} error: ` + err.message, logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                    resolve({ ok: false, stdout: out, stderr: errOut.length ? errOut : err.message });
                } else {
                    resolve({ ok: true, stdout: out, stderr: errOut });
                }
            });
        });
    }

    // ---------------------------------------------------------------------------
    // Step 2: Resolve CMake + compile library support
    // ---------------------------------------------------------------------------

    private async resolveCompileSupport(anapath: string): Promise<EngineCompileSupport | undefined> {
        const hasCMake = await this.hasCMake();
        if (!hasCMake) {
            const choice = await vscode.window.showErrorMessage(
                'CMake is required to compile analyzers/KB. Install CMake and retry.',
                'Open CMake Download'
            );
            if (choice) {
                vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://cmake.org/download/'));
            }
            logView.addMessage('Compile failed: CMake not found in PATH.', logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
            return undefined;
        }

        const support = this.locateEngineCompileSupport();
        if (!support || support.missingLibraries.length > 0 || support.missingHeaders.length > 0 || support.includeDirs.length === 0) {
            const detailParts: string[] = [];
            if (support?.missingLibraries.length) {
                detailParts.push(`libs: ${support.missingLibraries.join(', ')}`);
            }
            if (support?.missingHeaders.length) {
                detailParts.push(`headers: ${support.missingHeaders.join(', ')}`);
            }
            if (support && support.includeDirs.length === 0) {
                detailParts.push('include roots: none found');
            }
            const detail = detailParts.length ? ` Missing ${detailParts.join('; ')}.` : '';
            const message =
                `NLP-engine compile asset is incomplete.${detail} Expected headers under include/Api/{prim,kbm,consh} and compile libraries under lib/. Run updater after publishing those assets from nlp-engine.`;
            const action = await vscode.window.showErrorMessage(message, 'Run Updater');
            if (action) {
                visualText.startUpdater(false);
            }
            logView.addMessage(message, logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
            return undefined;
        }

        return support;
    }

    private async hasCMake(): Promise<boolean> {
        const result = await this.execCommand('cmake', ['--version']);
        return result.ok;
    }

    private locateEngineCompileSupport(): EngineCompileSupport | undefined {
        const engineRoot = visualText.engineDirectory().fsPath;
        if (!engineRoot.length || !fs.existsSync(engineRoot)) {
            return undefined;
        }

        const requiredLibs = ['prim', 'kbm', 'consh', 'words', 'lite'];
        // ICU import libs are optional: the engine release ships ICU as DLLs next to nlp.exe.
        // lite.lib references icuin78 (Collator::createInstance) via find_str_nocase, so
        // icuin78.dll is required for analyzer-DLL linking; the other two are needed for ICU
        // common+data symbols. If a DLL is absent, ensureIcuImportLibs skips it and the linker
        // surfaces a clear unresolved-symbols error for whichever symbol is actually needed.
        const optionalLibs = os.platform() === 'win32'
            ? ['icuuc78', 'icudt78', 'icuin78']
            : [];
        const requiredHeaders = [
            'prim/libprim.h',
            'prim/prim.h',
            'prim/str.h',
            'kbm/libkbm.h',
            'kbm/con_.h',
            'kbm/con_s.h',
            'kbm/ptr.h',
            'kbm/ptr_s.h',
            'kbm/st.h',
            'kbm/sym.h',
            'kbm/sym_s.h',
            'consh/libconsh.h',
            'consh/cg.h'
        ];

        const includeRootsFromHeaders = new Set<string>();
        const headerFiles: string[] = [];
        const missingHeaders: string[] = [];

        for (const header of requiredHeaders) {
            const hit = this.findEngineHeader(engineRoot, header);
            if (hit) {
                headerFiles.push(hit);
                includeRootsFromHeaders.add(path.dirname(path.dirname(hit)));
            } else {
                missingHeaders.push(header);
            }
        }

        const includeDirs = this.collectIncludeDirectories(engineRoot, [...includeRootsFromHeaders]);
        const libraryFiles: string[] = [];
        const missingLibraries: string[] = [];

        for (const libName of requiredLibs) {
            const libFile = this.findEngineLibrary(engineRoot, libName);
            if (libFile) {
                libraryFiles.push(libFile);
            } else {
                missingLibraries.push(libName);
            }
        }

        for (const libName of optionalLibs) {
            const libFile = this.findEngineLibrary(engineRoot, libName);
            if (libFile) {
                libraryFiles.push(libFile);
            }
        }

        return {
            engineRoot,
            includeDirs,
            libraryFiles,
            headerFiles,
            missingHeaders,
            missingLibraries
        };
    }

    private collectIncludeDirectories(engineRoot: string, headerRoots: string[] = []): string[] {
        const candidates = [
            path.join(engineRoot, 'include'),
            path.join(engineRoot, 'include', 'Api'),
            path.join(engineRoot, 'include', 'include'),
            path.join(engineRoot, 'include', 'include', 'Api'),
            path.join(engineRoot, 'include', 'cs-include'),
            path.join(engineRoot, 'include', 'Api', 'lite'),
            path.join(engineRoot, 'cs', 'include'),
            path.join(engineRoot, 'compile', 'include'),
            path.join(engineRoot, 'lite')
        ];

        const existing = [...candidates, ...headerRoots]
            .filter(dir => fs.existsSync(dir) && fs.statSync(dir).isDirectory());
        return [...new Set(existing)];
    }

    private findEngineHeader(engineRoot: string, headerRelativePath: string): string | undefined {
        const normalizedRelative = headerRelativePath.split('/').join(path.sep);
        const candidateRoots = [
            path.join(engineRoot, 'include'),
            path.join(engineRoot, 'include', 'Api'),
            path.join(engineRoot, 'include', 'include'),
            path.join(engineRoot, 'include', 'include', 'Api'),
            path.join(engineRoot, 'include', 'cs-include'),
            path.join(engineRoot, 'cs', 'include'),
            path.join(engineRoot, 'compile', 'include')
        ];

        for (const root of candidateRoots) {
            const fullPath = path.join(root, normalizedRelative);
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                return fullPath;
            }
        }

        return undefined;
    }

    private findEngineLibrary(engineRoot: string, baseName: string): string | undefined {
        const platform = os.platform();
        const expectedNames = this.expectedLibraryNames(baseName, platform);
        const candidateDirs = [
            path.join(engineRoot, 'lib'),
            path.join(engineRoot, 'build', 'lib'),
            path.join(engineRoot, 'build', 'Release'),
            path.join(engineRoot, 'build', 'Debug'),
            path.join(engineRoot, 'compile', 'lib')
        ];

        for (const dir of candidateDirs) {
            const hit = this.findFileByName(dir, expectedNames, 4);
            if (hit) {
                return hit;
            }
        }

        return this.findFileByName(engineRoot, expectedNames, 5);
    }

    private expectedLibraryNames(baseName: string, platform: string): string[] {
        if (platform === 'win32') {
            return [`${baseName}.lib`];
        }
        if (platform === 'darwin') {
            return [`lib${baseName}.a`, `${baseName}.a`, `lib${baseName}.dylib`, `${baseName}.dylib`];
        }
        return [`lib${baseName}.a`, `${baseName}.a`, `lib${baseName}.so`, `${baseName}.so`];
    }

    private findFileByName(root: string, expectedNames: string[], maxDepth: number): string | undefined {
        if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
            return undefined;
        }

        const expected = new Set(expectedNames.map(name => name.toLowerCase()));
        const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];

        while (queue.length) {
            const current = queue.shift();
            if (!current) {
                continue;
            }
            if (current.depth > maxDepth) {
                continue;
            }

            let entries: fs.Dirent[] = [];
            try {
                entries = fs.readdirSync(current.dir, { withFileTypes: true });
            } catch {
                continue;
            }

            for (const entry of entries) {
                const fullPath = path.join(current.dir, entry.name);
                if (entry.isFile()) {
                    if (expected.has(entry.name.toLowerCase())) {
                        return fullPath;
                    }
                } else if (entry.isDirectory()) {
                    queue.push({ dir: fullPath, depth: current.depth + 1 });
                }
            }
        }

        return undefined;
    }

    // ---------------------------------------------------------------------------
    // Step 3: Compile C++ into a shared library with CMake
    // ---------------------------------------------------------------------------

    private async compileCppWithCMake(anapath: string, support: EngineCompileSupport, libBaseName?: string, kbOnly: boolean = false): Promise<boolean> {
        const cppFiles = this.findGeneratedCppFiles(anapath, kbOnly);

        if (cppFiles.length === 0) {
            const where = kbOnly ? `${anapath}\\kb` : anapath;
            vscode.window.showErrorMessage(`No generated C++ source files found under ${where}.`);
            return false;
        }

        const analyzerName = libBaseName && libBaseName.length ? libBaseName : path.basename(anapath);
        const outputLib = path.join(anapath, this.sharedLibraryName(analyzerName));
        const cmakeRoot = path.join(anapath, '.nlp-compile');
        const sourceDir = path.join(cmakeRoot, 'src');
        const buildDir = path.join(cmakeRoot, 'build');
        const cmakeFile = path.join(sourceDir, 'CMakeLists.txt');

        fs.mkdirSync(sourceDir, { recursive: true });

        // Wipe any stale CMakeCache.txt so the next configure re-detects the toolchain.
        // Without this, switching MSVC versions (e.g. VS 2022 Preview → VS 18) is ignored:
        // CMake keeps the originally-cached compiler path and the link uses the old MSVC's libs.
        const cmakeCacheFile = path.join(buildDir, 'CMakeCache.txt');
        if (fs.existsSync(cmakeCacheFile)) {
            try {
                fs.rmSync(buildDir, { recursive: true, force: true });
            } catch { /* tolerate */ }
        }

        const stdAfxStub = path.join(sourceDir, 'StdAfx.h');
        const stdAfxContent =
            '// Auto-generated stub. Engine-generated .cpp files include "StdAfx.h" by convention.\n' +
            '#pragma once\n' +
            '#ifdef _WIN32\n' +
            '// Reduce <windows.h> footprint before pulling it in. consh/cg.h references HINSTANCE\n' +
            '// (and other Windows types) without including <windows.h> itself.\n' +
            '#ifndef WIN32_LEAN_AND_MEAN\n' +
            '#define WIN32_LEAN_AND_MEAN\n' +
            '#endif\n' +
            '#ifndef NOMINMAX\n' +
            '#define NOMINMAX\n' +
            '#endif\n' +
            '#include <windows.h>\n' +
            '// <tchar.h> defines _TCHAR (mapped to char or wchar_t based on _UNICODE). The engine\n' +
            '// header prim/str.h uses _TCHAR but does not include <tchar.h> itself.\n' +
            '#include <tchar.h>\n' +
            '#endif\n' +
            '// Pull in my_tchar.h for the engine\'s _t_* stream/cstring aliases.\n' +
            '#include "my_tchar.h"\n';
        fs.writeFileSync(stdAfxStub, stdAfxContent, { encoding: 'utf8' });

        const cmakeContent = this.generateCompileCMakeLists(anapath, analyzerName, support, sourceDir, kbOnly);
        fs.writeFileSync(cmakeFile, cmakeContent, { encoding: 'utf8' });

        const outputChannel = vscode.window.createOutputChannel('NLP++ Compile');
        outputChannel.show(true);
        outputChannel.appendLine('Configuring CMake build for analyzer/KB library...');

        // On Windows, run CMake configure+build inside the VsDevCmd environment so it picks
        // up the same MSVC toolchain that built the engine libs we're linking against. Without
        // this, CMake auto-detects whichever Visual Studio it finds first (often an older one
        // missing recent stdlib intrinsics like __std_find_last_of_trivial_pos_1).
        const winVsDevCmd = os.platform() === 'win32' ? this.findVsDevCmdScript() : undefined;
        const configureArgs = ['-S', sourceDir, '-B', buildDir];
        const configureResult = winVsDevCmd
            ? await this.execCmakeWithVsDevCmd(winVsDevCmd, configureArgs, anapath)
            : await this.execCommand('cmake', configureArgs, anapath);
        this.appendCommandOutput(outputChannel, 'cmake configure', configureResult);
        if (!configureResult.ok) {
            logView.addMessage('CMake configure failed.', logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
            vscode.window.showErrorMessage('CMake configure failed. See "NLP++ Compile" output panel for details.');
            return false;
        }

        const buildArgs = ['--build', buildDir];
        if (os.platform() === 'win32') {
            buildArgs.push('--config', 'Release');
        }

        const buildResult = winVsDevCmd
            ? await this.execCmakeWithVsDevCmd(winVsDevCmd, buildArgs, anapath)
            : await this.execCommand('cmake', buildArgs, anapath);
        this.appendCommandOutput(outputChannel, 'cmake build', buildResult);

        if (!buildResult.ok && !fs.existsSync(outputLib)) {
            logView.addMessage('CMake build failed.', logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
            vscode.window.showErrorMessage('CMake build failed. See "NLP++ Compile" output panel for details.');
            return false;
        }

        if (!fs.existsSync(outputLib)) {
            const missingMessage = `CMake build finished but expected output library was not found: ${outputLib}`;
            outputChannel.appendLine(missingMessage);
            logView.addMessage(missingMessage, logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
            vscode.window.showErrorMessage(missingMessage);
            return false;
        }

        outputChannel.appendLine(`Compile output: ${outputLib}`);
        return true;
    }

    private generateCompileCMakeLists(anapath: string, analyzerName: string, support: EngineCompileSupport, stubDir: string, kbOnly: boolean = false): string {
        const toCMakePath = (filePath: string) => filePath.replace(/\\/g, '/');
        const stubDirCMake = toCMakePath(stubDir);
        const includeLines = support.includeDirs
            .map(dir => `    "${toCMakePath(dir)}"`)
            .join('\n');
        const libLines = support.libraryFiles
            .map(file => `    "${toCMakePath(file)}"`)
            .join('\n');
        const analyzerPath = toCMakePath(anapath);
        // KB-only builds must not glob run/*.cpp: those files (e.g. run/analyzer.cpp) include
        // optional user-extension headers like ..\user\user.h that may not exist, and call into
        // Arun overloads that produce ambiguity errors. Restrict to kb/*.cpp for KB-only.
        const sourceGlob = kbOnly
            ? `"${analyzerPath}/kb/*.cpp"`
            : `"${analyzerPath}/run/*.cpp" "${analyzerPath}/kb/*.cpp"`;
        const sourceErrorScope = kbOnly ? 'kb/' : 'run/ or kb/';

        return `cmake_minimum_required(VERSION 3.16)
project(nlp_generated_library LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

set(ANALYZER_DIR "${analyzerPath}")
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY "${analyzerPath}")
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${analyzerPath}")
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY "${analyzerPath}")
foreach(OUTPUTCONFIG \${CMAKE_CONFIGURATION_TYPES})
    string(TOUPPER \${OUTPUTCONFIG} OUTPUTCONFIG_UPPER)
    set(CMAKE_LIBRARY_OUTPUT_DIRECTORY_\${OUTPUTCONFIG_UPPER} "${analyzerPath}")
    set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_\${OUTPUTCONFIG_UPPER} "${analyzerPath}")
    set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY_\${OUTPUTCONFIG_UPPER} "${analyzerPath}")
endforeach()

file(GLOB GENERATED_CPP ${sourceGlob})
if(NOT GENERATED_CPP)
    message(FATAL_ERROR "No generated C++ sources found in ${sourceErrorScope}.")
endif()

add_library(nlp_generated SHARED \${GENERATED_CPP})
set_target_properties(nlp_generated PROPERTIES OUTPUT_NAME "${analyzerName}")

target_include_directories(nlp_generated PRIVATE
    "${stubDirCMake}"
    "${analyzerPath}"
    "${analyzerPath}/run"
    "${analyzerPath}/kb"
${includeLines}
)

set(NLP_ENGINE_LIBRARIES
${libLines}
)

target_link_libraries(nlp_generated PRIVATE \${NLP_ENGINE_LIBRARIES})

if(WIN32)
    target_compile_definitions(nlp_generated PRIVATE _CRT_SECURE_NO_WARNINGS)
    if(MSVC)
        target_compile_options(nlp_generated PRIVATE /wd4005 /FI"StdAfx.h")
    endif()
else()
    target_compile_options(nlp_generated PRIVATE -include StdAfx.h)
    find_library(DL_LIBRARY dl)
    if(DL_LIBRARY)
        target_link_libraries(nlp_generated PRIVATE \${DL_LIBRARY})
    endif()
endif()
`;
    }

    private appendCommandOutput(outputChannel: vscode.OutputChannel, label: string, result: CommandResult): void {
        outputChannel.appendLine(`--- ${label} ---`);
        if (result.stdout.trim().length) {
            outputChannel.appendLine(result.stdout.trim());
        }
        if (result.stderr.trim().length) {
            outputChannel.appendLine(result.stderr.trim());
        }
        if (result.errorMessage) {
            outputChannel.appendLine(result.errorMessage);
        }
    }

    private execCommand(command: string, args: string[], cwd?: string): Promise<CommandResult> {
        const cp = require('child_process');
        return new Promise(resolve => {
            cp.execFile(command, args, { cwd: cwd, maxBuffer: 40 * 1024 * 1024 }, (err: any, stdout: string, stderr: string) => {
                if (err) {
                    resolve({
                        ok: false,
                        stdout: stdout ? stdout.toString() : '',
                        stderr: stderr ? stderr.toString() : '',
                        errorMessage: err.message
                    });
                    return;
                }
                resolve({
                    ok: true,
                    stdout: stdout ? stdout.toString() : '',
                    stderr: stderr ? stderr.toString() : ''
                });
            });
        });
    }

    private formatCmdArg(arg: string): string {
        if (arg.includes(' ') || arg.includes('"')) {
            return `"${arg.replace(/"/g, '""')}"`;
        }
        return arg;
    }

    private pathForNlpExe(targetPath: string): string {
        if (os.platform() !== 'win32') {
            return targetPath;
        }

        if (!targetPath.includes(' ')) {
            return targetPath;
        }

        const shortPath = this.getWindowsShortPath(targetPath);
        return shortPath || targetPath;
    }

    private getWindowsShortPath(targetPath: string): string | undefined {
        const cp = require('child_process');
        const escaped = targetPath.replace(/"/g, '""');
        const shortPathCmd = `for %I in ("${escaped}") do @echo %~sI`;

        try {
            const shortPathOutput = cp.execSync(`cmd.exe /d /c "${shortPathCmd}"`, {
                encoding: 'utf8'
            }).trim();

            const shortPath = shortPathOutput
                .split(/\r?\n/)
                .map((line: string) => line.trim())
                .find((line: string) => line.length > 0)
                ?.replace(/^"(.*)"$/, '$1');

            if (!shortPath || !shortPath.length) {
                return undefined;
            }

            if (shortPath.includes('"')) {
                return undefined;
            }

            return shortPath;
        } catch {
            return undefined;
        }
    }

    private findGeneratedCppFiles(anapath: string, kbOnly: boolean = false): string[] {
        const candidateDirs = kbOnly ? ['kb'] : ['run', 'kb'];
        const cppFiles: string[] = [];

        for (const dirName of candidateDirs) {
            const dirPath = path.join(anapath, dirName);
            if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
                continue;
            }

            const files = fs.readdirSync(dirPath)
                .filter(file => file.toLowerCase().endsWith('.cpp'))
                .map(file => path.join(dirPath, file));
            cppFiles.push(...files);
        }

        return cppFiles;
    }

    private findKBSourceFiles(anapath: string): string[] {
        // KB sources live under <analyzer>/kb/user/ — matches anaSubDirPath(anaSubDir.KB).
        const kbDir = path.join(anapath, 'kb', 'user');
        if (!fs.existsSync(kbDir) || !fs.statSync(kbDir).isDirectory()) {
            return [];
        }
        return fs.readdirSync(kbDir)
            .filter(file => {
                const lower = file.toLowerCase();
                return lower.endsWith('.kbb') || lower.endsWith('.dict');
            })
            .map(file => path.join(kbDir, file));
    }

    private async ensureIcuImportLibs(engineRoot: string, anapath: string): Promise<void> {
        // Generate import libs for every ICU DLL the engine bundle ships. A missing DLL is
        // skipped here (logged) and surfaces as a link-time unresolved-symbol error only if
        // the engine static libs actually reference it.
        const targets = ['icuuc78', 'icudt78', 'icuin78'];
        const libDir = path.join(engineRoot, 'lib');
        if (!fs.existsSync(libDir)) {
            try { fs.mkdirSync(libDir, { recursive: true }); } catch { return; }
        }

        const missing = targets.filter(name => !fs.existsSync(path.join(libDir, `${name}.lib`)));
        if (missing.length === 0) {
            return;
        }

        const vsDevCmd = this.findVsDevCmdScript();
        if (!vsDevCmd) {
            logView.addMessage(
                'Cannot generate ICU import libraries: VsDevCmd.bat not found. Install Visual Studio Build Tools (Desktop C++).',
                logLineType.ANALYER_OUTPUT,
                vscode.Uri.file(anapath)
            );
            return;
        }

        const machine = process.arch === 'arm64' ? 'ARM64' : 'X64';

        for (const name of missing) {
            const dll = path.join(engineRoot, `${name}.dll`);
            if (!fs.existsSync(dll)) {
                logView.addMessage(
                    `Cannot generate ${name}.lib: ${dll} not found.`,
                    logLineType.ANALYER_OUTPUT,
                    vscode.Uri.file(anapath)
                );
                continue;
            }

            const outLib = path.join(libDir, `${name}.lib`);
            const defFile = path.join(libDir, `${name}.def`);

            logView.addMessage(
                `Generating ${name}.lib from ${name}.dll (one-time per install)...`,
                logLineType.ANALYER_OUTPUT,
                vscode.Uri.file(anapath)
            );

            const exports = await this.runDumpbinExports(vsDevCmd, dll);
            if (exports.length === 0) {
                logView.addMessage(
                    `Failed to enumerate exports of ${name}.dll via dumpbin.`,
                    logLineType.ANALYER_OUTPUT,
                    vscode.Uri.file(anapath)
                );
                continue;
            }

            const defContent = `LIBRARY ${name}\nEXPORTS\n` + exports.map(s => `    ${s}`).join('\n') + '\n';
            try {
                fs.writeFileSync(defFile, defContent, { encoding: 'utf8' });
            } catch (err: any) {
                logView.addMessage(
                    `Failed to write ${defFile}: ${err && err.message ? err.message : String(err)}`,
                    logLineType.ANALYER_OUTPUT,
                    vscode.Uri.file(anapath)
                );
                continue;
            }

            const ok = await this.runLibFromDef(vsDevCmd, defFile, outLib, machine);
            if (!ok) {
                logView.addMessage(
                    `lib.exe failed to produce ${outLib}.`,
                    logLineType.ANALYER_OUTPUT,
                    vscode.Uri.file(anapath)
                );
            } else {
                logView.addMessage(
                    `Generated ${outLib}`,
                    logLineType.ANALYER_OUTPUT,
                    vscode.Uri.file(anapath)
                );
            }
        }
    }

    private runDumpbinExports(vsDevCmd: string, dll: string): Promise<string[]> {
        const cp = require('child_process');
        const dllArg = this.formatCmdArg(dll);
        const command = `call "${vsDevCmd}" -arch=x64 -host_arch=x64 >nul && dumpbin /exports ${dllArg}`;

        return new Promise(resolve => {
            cp.exec(command, { shell: 'cmd.exe', maxBuffer: 40 * 1024 * 1024 }, (err: any, stdout: string) => {
                if (err) {
                    resolve([]);
                    return;
                }
                resolve(this.parseDumpbinExports(stdout || ''));
            });
        });
    }

    private parseDumpbinExports(stdout: string): string[] {
        const lines = stdout.split(/\r?\n/);
        const names: string[] = [];
        let inExports = false;

        for (const raw of lines) {
            const line = raw.replace(/\s+$/g, '');
            if (!line.length) {
                if (inExports && names.length > 0) {
                    break;
                }
                continue;
            }
            if (!inExports) {
                if (/^\s+ordinal\b/i.test(line) && /\bname\b/i.test(line)) {
                    inExports = true;
                }
                continue;
            }
            // Entry format: "       1    0 00071FA0 u_UCharDirection_swap_78 [(forwarded to ...)]"
            // C++ mangled names can start with '?' (MSVC), so accept any non-whitespace token
            // after the ordinal/hint/RVA columns.
            const m = line.match(/^\s*\d+\s+[0-9A-Fa-f]+\s+[0-9A-Fa-f]+\s+(\S+)/);
            if (m) {
                names.push(m[1]);
            } else {
                break;
            }
        }
        return names;
    }

    private execCmakeWithVsDevCmd(vsDevCmd: string, args: string[], cwd: string): Promise<CommandResult> {
        const cp = require('child_process');
        const formatted = args.map(a => this.formatCmdArg(a)).join(' ');
        const command = `call "${vsDevCmd}" -arch=x64 -host_arch=x64 >nul && cmake ${formatted}`;
        return new Promise(resolve => {
            cp.exec(command, { cwd: cwd, shell: 'cmd.exe', maxBuffer: 40 * 1024 * 1024 }, (err: any, stdout: string, stderr: string) => {
                const out = stdout ? stdout.toString() : '';
                const errOut = stderr ? stderr.toString() : '';
                if (err) {
                    resolve({ ok: false, stdout: out, stderr: errOut, errorMessage: err.message });
                } else {
                    resolve({ ok: true, stdout: out, stderr: errOut });
                }
            });
        });
    }

    private runLibFromDef(vsDevCmd: string, defFile: string, outLib: string, machine: string): Promise<boolean> {
        const cp = require('child_process');
        const args = [`/def:${defFile}`, `/machine:${machine}`, `/out:${outLib}`]
            .map(a => this.formatCmdArg(a))
            .join(' ');
        const command = `call "${vsDevCmd}" -arch=x64 -host_arch=x64 >nul && lib ${args}`;

        return new Promise(resolve => {
            cp.exec(command, { shell: 'cmd.exe', maxBuffer: 40 * 1024 * 1024 }, (err: any) => {
                resolve(!err && fs.existsSync(outLib));
            });
        });
    }

    private findVsDevCmdScript(): string | undefined {
        if (os.platform() !== 'win32') {
            return undefined;
        }

        const cp = require('child_process');
        const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        const vswhere = path.join(programFilesX86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');

        try {
            if (fs.existsSync(vswhere)) {
                // -prerelease so vswhere also considers Insiders/next-major VS (e.g. VS 18)
                // alongside stable releases. -latest then picks the highest installationVersion
                // among all candidates, which is what we want since the engine libs are built
                // with the newest MSVC on GitHub Actions and reference recent stdlib intrinsics
                // (e.g. __std_find_last_of_trivial_pos_1, added in MSVC 14.42+).
                const installPath = cp.execFileSync(vswhere, ['-latest', '-prerelease', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], {
                    encoding: 'utf8'
                }).trim();

                if (installPath.length) {
                    const scriptPath = path.join(installPath, 'Common7', 'Tools', 'VsDevCmd.bat');
                    if (fs.existsSync(scriptPath)) {
                        return scriptPath;
                    }
                }
            }
        } catch {
            // Fall through to heuristic paths.
        }

        const editions = ['BuildTools', 'Community', 'Professional', 'Enterprise'];
        // VS 18 (current insiders/next major) first — its MSVC matches the symbols the engine
        // libs reference (e.g. __std_find_last_of_trivial_pos_1 was added in MSVC 14.42+).
        // Falling back to 2022 still works for engines built with that toolset.
        const versions = ['18', '2022', '2019', '17', '16'];
        const baseRoots = [
            path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Microsoft Visual Studio'),
            path.join(programFilesX86, 'Microsoft Visual Studio')
        ];

        for (const root of baseRoots) {
            for (const version of versions) {
                for (const edition of editions) {
                    const scriptPath = path.join(root, version, edition, 'Common7', 'Tools', 'VsDevCmd.bat');
                    if (fs.existsSync(scriptPath)) {
                        return scriptPath;
                    }
                }
            }
        }

        return undefined;
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    sharedLibraryName(analyzerName: string): string {
        return analyzerName + this.sharedLibraryExt();
    }

    private sharedLibraryExt(): string {
        const platform = os.platform();
        if (platform === 'win32') return '.dll';
        if (platform === 'darwin') return '.dylib';
        return '.so';
    }

    // Lazy "*full.dict"/"*full.kbb" files under kb/user — the only KB data that
    // survives compilation and must ship with a deployed compiled analyzer. Mirrors
    // the engine's CG::stemEndsWithFull ("-full"/"_full" boundary, case-insensitive).
    private findFullKBFiles(kbUserDir: string): string[] {
        if (!fs.existsSync(kbUserDir) || !fs.statSync(kbUserDir).isDirectory()) {
            return [];
        }
        return fs.readdirSync(kbUserDir)
            .filter(file => {
                const lower = file.toLowerCase();
                if (!lower.endsWith('.dict') && !lower.endsWith('.kbb')) return false;
                const stem = file.substring(0, file.lastIndexOf('.'));
                return this.stemEndsWithFull(stem);
            })
            .map(file => path.join(kbUserDir, file));
    }

    // Python-pass scripts under spec/. A compiled `python` pass shells out to
    // spec/<script>.py at runtime, so these must ship with a deployed analyzer
    // (the .nlp rule files, by contrast, are compiled into the library and stay
    // hidden). Returns every *.py directly under spec/.
    private findSpecPyFiles(anapath: string): string[] {
        const specDir = path.join(anapath, 'spec');
        if (!fs.existsSync(specDir) || !fs.statSync(specDir).isDirectory()) {
            return [];
        }
        return fs.readdirSync(specDir)
            .filter(file => file.toLowerCase().endsWith('.py'))
            .map(file => path.join(specDir, file));
    }

    private stemEndsWithFull(stem: string): boolean {
        const lower = stem.toLowerCase();
        if (!lower.endsWith('full')) return false;
        if (lower.length === 4) return true; // exactly "full"
        const before = lower.charAt(lower.length - 5);
        return before === '-' || before === '_';
    }

    // ---------------------------------------------------------------------------
    // Cloud compile (compile.mode === 'cloud')
    // ---------------------------------------------------------------------------

    private async compileCppOnCloud(
        anapath: string,
        analyzerName: string,
        kbOnly: boolean,
        progress: vscode.Progress<{ message?: string; increment?: number }>
    ): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('compile');
        const dispatcherUrl = (config.get<string>('dispatcherUrl') || '').replace(/\/$/, '');
        if (!dispatcherUrl) {
            vscode.window.showErrorMessage(
                'compile.dispatcherUrl is not set. Configure the compile service URL or switch compile.mode to "local".'
            );
            return false;
        }

        const rawEngineVersion = (visualText.exeEngineVersion || visualText.repoEngineVersion || '').trim();
        if (!rawEngineVersion) {
            vscode.window.showErrorMessage(
                'Unable to determine engine version. Run the updater to refresh nlp.exe before using cloud compile.'
            );
            return false;
        }
        // nlp.exe --version prints "3.1.14"; GH release tags are "v3.1.14".
        // Normalize so the runner workflow can `gh release download` reliably.
        const engineVersion = rawEngineVersion.startsWith('v') ? rawEngineVersion : `v${rawEngineVersion}`;

        const platformKey = this.cloudPlatformKey();
        if (!platformKey) {
            vscode.window.showErrorMessage(`Cloud compile not supported on platform: ${os.platform()}/${process.arch}.`);
            return false;
        }

        // Verify the engine release the user is running actually exists on GitHub.
        // The runner workflow fetches `nlpengine-compile-libs-<platform>.zip` from
        // this release tag — if the user's nlp.exe is from a tag that isn't
        // published (e.g., a local dev build, or a tag deleted from the repo),
        // generated .cpp will fail to link against whatever the runner pulls.
        progress.report({ message: `Verifying engine release ${engineVersion}...` });
        const releaseExists = await this.verifyEngineReleaseExists(engineVersion);
        if (!releaseExists) {
            vscode.window.showErrorMessage(
                `Engine release ${engineVersion} not found on GitHub (VisualText/nlp-engine). ` +
                `The cloud compile service can only build against published engine releases. ` +
                `Update your installed nlp.exe to a published release, or switch compile.mode to "local".`
            );
            return false;
        }

        const logUri = vscode.Uri.file(anapath);
        const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-cloud-compile-'));

        try {
            // 1. Stage payload: run/, kb/, StdAfx.h (mirrors what emit-cmake.sh expects).
            this.stageCloudPayload(anapath, stageDir, kbOnly);

            // 2. Pack and hash.
            progress.report({ message: 'Packaging sources...' });
            const tarPath = path.join(stageDir, '_payload.tar.gz');
            await this.tarGzDirectory(stageDir, tarPath);
            const sourcesHash = await this.sha256File(tarPath);

            const manifest = {
                schemaVersion: 1,
                engineVersion,
                platform: platformKey,
                analyzerName,
                kbOnly,
                sourcesHash: `sha256:${sourcesHash}`,
                extensionVersion: visualText.version,
            };

            // 3. POST /build.
            progress.report({ message: 'Uploading to compile service...' });
            const form = new FormData();
            form.append('manifest', JSON.stringify(manifest));
            const tarBytes = fs.readFileSync(tarPath);
            form.append('payload', new Blob([tarBytes], { type: 'application/gzip' }), 'payload.tar.gz');

            const buildRes = await fetch(`${dispatcherUrl}/build`, { method: 'POST', body: form });
            if (!buildRes.ok) {
                const body = await buildRes.text();
                vscode.window.showErrorMessage(`Compile service rejected request: ${buildRes.status} ${body}`);
                return false;
            }
            const submitted = await buildRes.json() as {
                jobId: string;
                cached?: boolean;
                artifactUrl?: string;
            };

            // 4. Cache hit short-circuits the poll.
            let artifactUrl = submitted.artifactUrl;
            if (!submitted.cached) {
                // Live elapsed-time tick on the status-bar progress message so
                // the user can see the wait progressing rather than guessing
                // whether the extension is hung. Refreshed every second.
                const baseMsg = `Building on ${platformKey}...`;
                const tickStart = Date.now();
                progress.report({ message: baseMsg });
                const tick = setInterval(() => {
                    const sec = Math.floor((Date.now() - tickStart) / 1000);
                    const m = Math.floor(sec / 60);
                    const s = sec % 60;
                    progress.report({ message: `${baseMsg} ${m}:${s.toString().padStart(2, '0')}` });
                }, 1000);
                try {
                    const polled = await this.pollCloudJob(dispatcherUrl, submitted.jobId, anapath);
                    if (polled.status !== 'done' || !polled.artifactUrl) {
                        return false;
                    }
                    artifactUrl = polled.artifactUrl;
                } finally {
                    clearInterval(tick);
                }
            }

            // 5. Download artifact next to the analyzer.
            progress.report({ message: 'Downloading library...' });
            const libName = this.sharedLibraryName(analyzerName);
            const dest = path.join(anapath, libName);
            await this.downloadToFile(artifactUrl!, dest);
            logView.addMessage(`Cloud compile output: ${dest}`, logLineType.ANALYER_OUTPUT, logUri);
            return true;

        } catch (err: any) {
            logView.addMessage(`Cloud compile failed: ${err?.message ?? err}`, logLineType.ANALYER_OUTPUT, logUri);
            vscode.window.showErrorMessage(`Cloud compile failed: ${err?.message ?? err}`);
            return false;
        } finally {
            try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch { /* tolerate */ }
        }
    }

    private async verifyEngineReleaseExists(releaseTag: string): Promise<boolean> {
        // Returns true if the GH release for releaseTag exists, false on 404.
        // Network or non-404 errors propagate up so the outer try/catch in
        // compileCppOnCloud surfaces them as "Cloud compile failed: ...".
        const url = `https://api.github.com/repos/VisualText/nlp-engine/releases/tags/${encodeURIComponent(releaseTag)}`;
        const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } });
        if (res.status === 404) return false;
        if (!res.ok) throw new Error(`GitHub release lookup returned ${res.status}`);
        return true;
    }

    private cloudPlatformKey(): string | undefined {
        switch (os.platform()) {
            case 'win32':  return 'windows';
            case 'darwin': return process.arch === 'arm64' ? 'macos-arm64' : 'macos-x86_64';
            case 'linux':  return this.linuxCloudPlatformKey();
            default:       return undefined;
        }
    }

    private linuxCloudPlatformKey(): string {
        try {
            const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
            const m = osRelease.match(/^VERSION_ID="?([^"\n]+)"?/m);
            if (m) {
                if (m[1] === '20.04') return 'linux-20.04';
                if (m[1] === '22.04') return 'linux-22.04';
            }
        } catch { /* fall through */ }
        return 'linux-latest';
    }

    private stageCloudPayload(anapath: string, stageDir: string, kbOnly: boolean): void {
        const dirs = kbOnly ? ['kb'] : ['run', 'kb'];
        for (const d of dirs) {
            const src = path.join(anapath, d);
            if (!fs.existsSync(src)) continue;
            const dst = path.join(stageDir, d);
            fs.mkdirSync(dst, { recursive: true });
            for (const f of fs.readdirSync(src)) {
                // The engine's -COMPILE emits both .cpp and .h files in run/ and kb/.
                // The .cpp files include the .h files (analyzer.h, passN.h, etc.) so
                // both must be shipped to the runner.
                const lower = f.toLowerCase();
                if (!lower.endsWith('.cpp') && !lower.endsWith('.h')) continue;
                fs.copyFileSync(path.join(src, f), path.join(dst, f));
            }
        }
        // Same StdAfx.h stub the local compileCppWithCMake writes.
        fs.writeFileSync(
            path.join(stageDir, 'StdAfx.h'),
            '#pragma once\n' +
            '#ifdef _WIN32\n' +
            '#ifndef WIN32_LEAN_AND_MEAN\n#define WIN32_LEAN_AND_MEAN\n#endif\n' +
            '#ifndef NOMINMAX\n#define NOMINMAX\n#endif\n' +
            '#include <windows.h>\n#include <tchar.h>\n#endif\n' +
            '#include "my_tchar.h"\n',
            { encoding: 'utf8' }
        );
    }

    private tarGzDirectory(srcDir: string, outPath: string): Promise<void> {
        const cp = require('child_process');
        return new Promise((resolve, reject) => {
            // System tar is bundled on Windows 10+, macOS, and Linux.
            const child = cp.spawn('tar', ['-czf', outPath, '-C', srcDir, '.'], { stdio: 'inherit' });
            child.on('error', reject);
            child.on('exit', (code: number) => code === 0 ? resolve() : reject(new Error(`tar exited ${code}`)));
        });
    }

    private sha256File(filePath: string): Promise<string> {
        const crypto = require('crypto');
        return new Promise((resolve, reject) => {
            const h = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            stream.on('data', (chunk: string | Buffer) => h.update(chunk));
            stream.on('end', () => resolve(h.digest('hex')));
            stream.on('error', reject);
        });
    }

    private async pollCloudJob(
        dispatcherUrl: string,
        jobId: string,
        anapath: string
    ): Promise<{ status: string; artifactUrl?: string }> {
        const logUri = vscode.Uri.file(anapath);
        // 30 min ceiling. GHA's free-tier Windows runner pool can spend
        // 5-10+ min in the queue before a runner picks up, plus actual build
        // time. 10 min was too tight; 30 min covers worst observed cases
        // while still bounding the wait to something the user would notice.
        const deadline = Date.now() + 30 * 60 * 1000;
        let delay = 2000;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, delay));
            delay = Math.min(delay + 1000, 8000);

            const res = await fetch(`${dispatcherUrl}/jobs/${encodeURIComponent(jobId)}`);
            if (!res.ok) continue;
            const job = await res.json() as {
                status: string;
                artifactUrl?: string;
                buildLogUrl?: string;
                errors?: Array<{
                    file: string; line: number; column?: number;
                    severity: string; message: string;
                    nlpSourceFile?: string; nlpSourceLine?: number;
                }>;
            };
            if (job.status === 'done' || job.status === 'failed') {
                if (job.status === 'failed') {
                    if (job.errors?.length) {
                        for (const e of job.errors) {
                            const where = e.nlpSourceFile
                                ? `${e.nlpSourceFile}:${e.nlpSourceLine}`
                                : `${e.file}:${e.line}${e.column ? ':' + e.column : ''}`;
                            logView.addMessage(`${e.severity} ${where}: ${e.message}`, logLineType.ANALYER_OUTPUT, logUri);
                        }
                    }
                    if (job.buildLogUrl) {
                        logView.addMessage(`Build log: ${job.buildLogUrl}`, logLineType.ANALYER_OUTPUT, logUri);
                    }
                    vscode.window.showErrorMessage(
                        job.errors?.length
                            ? `Cloud compile failed with ${job.errors.length} error(s). See output.`
                            : 'Cloud compile failed. See output for build log link.'
                    );
                }
                return job;
            }
        }
        vscode.window.showErrorMessage('Cloud compile timed out.');
        return { status: 'timeout' };
    }

    private async downloadToFile(url: string, dest: string): Promise<void> {
        const res = await fetch(url);
        if (!res.ok || !res.body) {
            throw new Error(`download ${url} -> ${res.status}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
    }
}
