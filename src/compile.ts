import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { visualText } from './visualText';
import { logView, logLineType } from './logView';

export enum compileTarget { ANALYZER, KB }

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

    async compileKB(analyzerDir: vscode.Uri): Promise<void> {
        await this.runCompile(analyzerDir, compileTarget.KB);
    }

    // ---------------------------------------------------------------------------
    // Core compile flow
    // ---------------------------------------------------------------------------

    private async runCompile(analyzerDir: vscode.Uri, target: compileTarget): Promise<void> {
        const targetLabel = target === compileTarget.KB ? 'KB' : 'Analyzer';

        // 1. Check NLP engine executable
        const exe = visualText.exePath().fsPath;
        if (!exe.length || !fs.existsSync(exe)) {
            vscode.window.showErrorMessage('NLP Engine missing', 'Download Now').then(response => {
                visualText.startUpdater();
            });
            return;
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Compile ${targetLabel}`,
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 10, message: 'Generating C++ code...' });
            logView.addMessage(`Compiling ${targetLabel}: ${path.basename(analyzerDir.fsPath)}`, logLineType.ANALYER_OUTPUT, analyzerDir);
            vscode.commands.executeCommand('logView.refreshAll');

            // 2. Run nlp.exe -COMPILE to generate C++ code
            const engineDir = path.dirname(exe);
            const anapath = analyzerDir.fsPath;
            const compileResult = await this.runNlpCompile(exe, anapath, engineDir);
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

            progress.report({ increment: 30, message: 'Checking CMake and NLP-engine compile libraries...' });

            const compileSupport = await this.resolveCompileSupport(anapath);
            if (!compileSupport) {
                vscode.commands.executeCommand('logView.refreshAll');
                return;
            }

            progress.report({ increment: 20, message: 'Compiling C++ library...' });

            // 3. Compile generated C++ using CMake and NLP-engine static libraries.
            const success = await this.compileCppWithCMake(anapath, compileSupport);

            if (success) {
                const libName = this.sharedLibraryName(path.basename(anapath));
                logView.addMessage(`Compile ${targetLabel} succeeded: ${libName}`, logLineType.ANALYER_OUTPUT, analyzerDir);
                vscode.window.showInformationMessage(`Compile ${targetLabel} succeeded: ${libName}`);
            } else {
                logView.addMessage(`Compile ${targetLabel} failed. Check the output for details.`, logLineType.ANALYER_OUTPUT, analyzerDir);
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

    private runNlpCompile(exe: string, anapath: string, engineDir: string): Promise<NlpCompileResult> {
        const cp = require('child_process');
        const compileAnaPath = this.pathForNlpExe(anapath);
        const compileWorkPath = this.pathForNlpExe(engineDir);
        const args: string[] = ['-COMPILE', '-ANA', compileAnaPath, '-WORK', compileWorkPath];

        logView.addMessage(`Running: ${exe} ${args.join(' ')}`, logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));

        if (os.platform() === 'win32') {
            const vsDevCmd = this.findVsDevCmdScript();
            if (vsDevCmd) {
                return this.runNlpCompileWithVsDevCmd(vsDevCmd, exe, args, anapath);
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
                    logView.addMessage('nlp.exe -COMPILE error: ' + err.message, logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                    vscode.window.showErrorMessage('C++ code generation failed: ' + err.message);
                    resolve({ ok: false, stdout: out, stderr: errOut.length ? errOut : err.message });
                } else {
                    resolve({ ok: true, stdout: out, stderr: errOut });
                }
            });
        });
    }

    private runNlpCompileWithVsDevCmd(setupScript: string, exe: string, args: string[], anapath: string): Promise<NlpCompileResult> {
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
                    logView.addMessage('nlp.exe -COMPILE error: ' + err.message, logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
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

    private async compileCppWithCMake(anapath: string, support: EngineCompileSupport): Promise<boolean> {
        const cppFiles = this.findGeneratedCppFiles(anapath);

        if (cppFiles.length === 0) {
            vscode.window.showErrorMessage(`No generated C++ source files found under ${anapath}.`);
            return false;
        }

        const analyzerName = path.basename(anapath);
        const outputLib = path.join(anapath, this.sharedLibraryName(analyzerName));
        const cmakeRoot = path.join(anapath, '.nlp-compile');
        const sourceDir = path.join(cmakeRoot, 'src');
        const buildDir = path.join(cmakeRoot, 'build');
        const cmakeFile = path.join(sourceDir, 'CMakeLists.txt');

        fs.mkdirSync(sourceDir, { recursive: true });

        const cmakeContent = this.generateCompileCMakeLists(anapath, analyzerName, support);
        fs.writeFileSync(cmakeFile, cmakeContent, { encoding: 'utf8' });

        const outputChannel = vscode.window.createOutputChannel('NLP++ Compile');
        outputChannel.show(true);
        outputChannel.appendLine('Configuring CMake build for analyzer/KB library...');

        const configureResult = await this.execCommand('cmake', ['-S', sourceDir, '-B', buildDir], anapath);
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

        const buildResult = await this.execCommand('cmake', buildArgs, anapath);
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

    private generateCompileCMakeLists(anapath: string, analyzerName: string, support: EngineCompileSupport): string {
        const toCMakePath = (filePath: string) => filePath.replace(/\\/g, '/');
        const includeLines = support.includeDirs
            .map(dir => `    "${toCMakePath(dir)}"`)
            .join('\n');
        const libLines = support.libraryFiles
            .map(file => `    "${toCMakePath(file)}"`)
            .join('\n');
        const analyzerPath = toCMakePath(anapath);

        return `cmake_minimum_required(VERSION 3.16)
project(nlp_generated_library LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

set(ANALYZER_DIR "${analyzerPath}")
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY "${analyzerPath}")
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${analyzerPath}")

file(GLOB GENERATED_CPP "${analyzerPath}/cpp/*.cpp" "${analyzerPath}/kb/*.cpp")
if(NOT GENERATED_CPP)
    message(FATAL_ERROR "No generated C++ sources found in cpp/ or kb/.")
endif()

add_library(nlp_generated SHARED \${GENERATED_CPP})
set_target_properties(nlp_generated PROPERTIES OUTPUT_NAME "${analyzerName}")

target_include_directories(nlp_generated PRIVATE
    "${analyzerPath}"
    "${analyzerPath}/cpp"
    "${analyzerPath}/kb"
${includeLines}
)

set(NLP_ENGINE_LIBRARIES
${libLines}
)

target_link_libraries(nlp_generated PRIVATE \${NLP_ENGINE_LIBRARIES})

if(WIN32)
    target_compile_definitions(nlp_generated PRIVATE _CRT_SECURE_NO_WARNINGS)
else()
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

    private findGeneratedCppFiles(anapath: string): string[] {
        const candidateDirs = ['cpp', 'kb'];
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

    private findVsDevCmdScript(): string | undefined {
        if (os.platform() !== 'win32') {
            return undefined;
        }

        const cp = require('child_process');
        const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        const vswhere = path.join(programFilesX86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');

        try {
            if (fs.existsSync(vswhere)) {
                const installPath = cp.execFileSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], {
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
        const versions = ['2022', '2019', '18', '17', '16'];
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
        const platform = os.platform();
        if (platform === 'win32') {
            return analyzerName + '.dll';
        } else if (platform === 'darwin') {
            return analyzerName + '.dylib';
        } else {
            return analyzerName + '.so';
        }
    }
}
