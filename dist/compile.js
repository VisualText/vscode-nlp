"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NLPCompile = exports.nlpCompile = exports.compileTarget = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const path = tslib_1.__importStar(require("path"));
const fs = tslib_1.__importStar(require("fs"));
const os = tslib_1.__importStar(require("os"));
const visualText_1 = require("./visualText");
const logView_1 = require("./logView");
var compileTarget;
(function (compileTarget) {
    compileTarget[compileTarget["ANALYZER"] = 0] = "ANALYZER";
    compileTarget[compileTarget["KB"] = 1] = "KB";
})(compileTarget || (exports.compileTarget = compileTarget = {}));
class NLPCompile {
    constructor() { }
    static attach() {
        if (!exports.nlpCompile) {
            exports.nlpCompile = new NLPCompile();
        }
        return exports.nlpCompile;
    }
    // ---------------------------------------------------------------------------
    // Top-level entry points
    // ---------------------------------------------------------------------------
    compileAnalyzer(analyzerDir) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield this.runCompile(analyzerDir, compileTarget.ANALYZER);
        });
    }
    compileKB(analyzerDir) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield this.runCompile(analyzerDir, compileTarget.KB);
        });
    }
    // ---------------------------------------------------------------------------
    // Core compile flow
    // ---------------------------------------------------------------------------
    runCompile(analyzerDir, target) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const targetLabel = target === compileTarget.KB ? 'KB' : 'Analyzer';
            // 1. Check NLP engine executable
            const exe = visualText_1.visualText.exePath().fsPath;
            if (!exe.length || !fs.existsSync(exe)) {
                vscode.window.showErrorMessage('NLP Engine missing', 'Download Now').then(response => {
                    visualText_1.visualText.startUpdater();
                });
                return;
            }
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Compile ${targetLabel}`,
                cancellable: false
            }, (progress) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                progress.report({ increment: 10, message: 'Generating C++ code...' });
                logView_1.logView.addMessage(`Compiling ${targetLabel}: ${path.basename(analyzerDir.fsPath)}`, logView_1.logLineType.ANALYER_OUTPUT, analyzerDir);
                vscode.commands.executeCommand('logView.refreshAll');
                // 2. Run nlp.exe -COMPILE to generate C++ code
                const engineDir = path.dirname(exe);
                const anapath = analyzerDir.fsPath;
                const cppGenerated = yield this.runNlpCompile(exe, anapath, engineDir);
                if (!cppGenerated) {
                    progress.report({ increment: 100, message: 'C++ generation failed.' });
                    return;
                }
                progress.report({ increment: 30, message: 'Detecting C++ compiler...' });
                // 3. Detect C++ compiler
                const compiler = yield this.detectCppCompiler();
                if (!compiler) {
                    const installed = yield this.promptAndInstallCompiler();
                    if (!installed) {
                        logView_1.logView.addMessage(`Compile ${targetLabel} failed: no C++ compiler available.`, logView_1.logLineType.ANALYER_OUTPUT, analyzerDir);
                        vscode.commands.executeCommand('logView.refreshAll');
                        return;
                    }
                    // Try detecting again after install
                    const compilerAfterInstall = yield this.detectCppCompiler();
                    if (!compilerAfterInstall) {
                        vscode.window.showErrorMessage('C++ compiler still not found after install attempt. Please restart VS Code and try again.');
                        return;
                    }
                }
                progress.report({ increment: 20, message: 'Compiling C++ library...' });
                // 4. Compile the generated C++ into a shared library
                const compilerPath = compiler !== null && compiler !== void 0 ? compiler : (yield this.detectCppCompiler());
                const success = yield this.compileCpp(anapath, compilerPath);
                if (success) {
                    const libName = this.sharedLibraryName(path.basename(anapath));
                    logView_1.logView.addMessage(`Compile ${targetLabel} succeeded: ${libName}`, logView_1.logLineType.ANALYER_OUTPUT, analyzerDir);
                    vscode.window.showInformationMessage(`Compile ${targetLabel} succeeded: ${libName}`);
                }
                else {
                    logView_1.logView.addMessage(`Compile ${targetLabel} failed. Check the output for details.`, logView_1.logLineType.ANALYER_OUTPUT, analyzerDir);
                }
                vscode.commands.executeCommand('logView.refreshAll');
                vscode.commands.executeCommand('analyzerView.refreshAll');
                vscode.commands.executeCommand('kbView.refreshAll');
                progress.report({ increment: 40, message: success ? 'Done.' : 'Failed.' });
            }));
        });
    }
    // ---------------------------------------------------------------------------
    // Step 1: Run nlp.exe -COMPILE
    // ---------------------------------------------------------------------------
    runNlpCompile(exe, anapath, engineDir) {
        const cp = require('child_process');
        const args = ['-COMPILE', '-ANA', anapath, '-WORK', engineDir];
        logView_1.logView.addMessage(`Running: ${exe} ${args.join(' ')}`, logView_1.logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
        return new Promise(resolve => {
            cp.execFile(exe, args, (err, stdout, stderr) => {
                if (stdout) {
                    logView_1.logView.addMessage('nlp.exe stdout: ' + stdout.trim(), logView_1.logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                }
                if (stderr) {
                    logView_1.logView.addMessage('nlp.exe stderr: ' + stderr.trim(), logView_1.logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                }
                if (err) {
                    logView_1.logView.addMessage('nlp.exe -COMPILE error: ' + err.message, logView_1.logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                    vscode.window.showErrorMessage('C++ code generation failed: ' + err.message);
                    resolve(false);
                }
                else {
                    resolve(true);
                }
            });
        });
    }
    // ---------------------------------------------------------------------------
    // Step 2: Detect C++ compiler
    // ---------------------------------------------------------------------------
    detectCppCompiler() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const platform = os.platform();
            if (platform === 'win32') {
                return this.detectWindowsCompiler();
            }
            else if (platform === 'darwin') {
                return this.detectUnixCompiler(['clang++', 'g++']);
            }
            else {
                return this.detectUnixCompiler(['g++', 'clang++']);
            }
        });
    }
    detectWindowsCompiler() {
        return new Promise(resolve => {
            // Try cl.exe (MSVC) first
            const cp = require('child_process');
            cp.exec('cl.exe /?', { timeout: 5000 }, (err) => {
                if (!err) {
                    resolve('cl.exe');
                    return;
                }
                // Try g++.exe (MinGW/MSYS2)
                cp.exec('g++ --version', { timeout: 5000 }, (err2) => {
                    if (!err2) {
                        resolve('g++');
                        return;
                    }
                    resolve(undefined);
                });
            });
        });
    }
    detectUnixCompiler(candidates) {
        const cp = require('child_process');
        const tryNext = (index) => {
            if (index >= candidates.length) {
                return Promise.resolve(undefined);
            }
            return new Promise(resolve => {
                cp.exec(`${candidates[index]} --version`, { timeout: 5000 }, (err) => {
                    if (!err) {
                        resolve(candidates[index]);
                    }
                    else {
                        tryNext(index + 1).then(resolve);
                    }
                });
            });
        };
        return tryNext(0);
    }
    // ---------------------------------------------------------------------------
    // Step 3: Prompt user to install compiler
    // ---------------------------------------------------------------------------
    promptAndInstallCompiler() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const platform = os.platform();
            let message = '';
            let installLabel = '';
            if (platform === 'win32') {
                message = 'No C++ compiler found. Install Visual Studio Build Tools (MSVC) or MinGW-w64 to compile NLP++ analyzers.';
                installLabel = 'Download Visual Studio Build Tools';
            }
            else if (platform === 'darwin') {
                message = 'No C++ compiler found. Install Xcode Command Line Tools to compile NLP++ analyzers.';
                installLabel = 'Install Xcode Command Line Tools';
            }
            else {
                message = 'No C++ compiler found. Install g++ (GCC) to compile NLP++ analyzers.';
                installLabel = 'Show Install Instructions';
            }
            const response = yield vscode.window.showInformationMessage(message, installLabel, 'Cancel');
            if (!response || response === 'Cancel') {
                return false;
            }
            if (platform === 'win32') {
                vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://visualstudio.microsoft.com/visual-cpp-build-tools/'));
                vscode.window.showInformationMessage('After installing Visual Studio Build Tools, open a "Developer Command Prompt" and restart VS Code.');
                return false;
            }
            else if (platform === 'darwin') {
                return this.installXcodeCommandLineTools();
            }
            else {
                return this.showLinuxInstallInstructions();
            }
        });
    }
    installXcodeCommandLineTools() {
        const cp = require('child_process');
        return new Promise(resolve => {
            const outputChannel = vscode.window.createOutputChannel('NLP++ Compiler Install');
            outputChannel.show(true);
            outputChannel.appendLine('Running: xcode-select --install');
            outputChannel.appendLine('A system dialog will appear asking you to install the Command Line Tools.');
            outputChannel.appendLine('After installation completes, retry the compile action.');
            cp.exec('xcode-select --install', (err, stdout, stderr) => {
                if (stdout)
                    outputChannel.appendLine(stdout);
                if (stderr)
                    outputChannel.appendLine(stderr);
                // xcode-select --install exits with error if already installed or if GUI dialog was shown
                // Either way, guide the user to retry
                vscode.window.showInformationMessage('Xcode Command Line Tools install initiated. After installation completes, retry the compile action.');
                resolve(false); // User must retry after install
            });
        });
    }
    showLinuxInstallInstructions() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const outputChannel = vscode.window.createOutputChannel('NLP++ Compiler Install');
            outputChannel.show(true);
            outputChannel.appendLine('To install g++ on Linux, run one of the following commands in a terminal:');
            outputChannel.appendLine('');
            outputChannel.appendLine('  Debian/Ubuntu:   sudo apt-get install g++');
            outputChannel.appendLine('  Fedora/RHEL:     sudo dnf install gcc-c++');
            outputChannel.appendLine('  Arch Linux:      sudo pacman -S gcc');
            outputChannel.appendLine('');
            outputChannel.appendLine('After installation, restart VS Code and retry the compile action.');
            vscode.window.showInformationMessage('See the "NLP++ Compiler Install" output panel for installation instructions.');
            return false;
        });
    }
    // ---------------------------------------------------------------------------
    // Step 4: Compile C++ into a shared library
    // ---------------------------------------------------------------------------
    compileCpp(anapath, compiler) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const cppDir = path.join(anapath, 'cpp');
            if (!fs.existsSync(cppDir)) {
                vscode.window.showErrorMessage(`Generated C++ directory not found: ${cppDir}. Ensure nlp.exe -COMPILE ran successfully.`);
                return false;
            }
            // Gather all .cpp files in the cpp directory
            const cppFiles = fs.readdirSync(cppDir)
                .filter(f => f.endsWith('.cpp'))
                .map(f => path.join(cppDir, f));
            if (cppFiles.length === 0) {
                vscode.window.showErrorMessage(`No C++ source files found in ${cppDir}.`);
                return false;
            }
            const analyzerName = path.basename(anapath);
            const libName = this.sharedLibraryName(analyzerName);
            const outputLib = path.join(anapath, libName);
            const platform = os.platform();
            let args;
            if (platform === 'win32' && (compiler === 'cl.exe' || compiler.endsWith('cl.exe'))) {
                args = this.buildMsvcArgs(cppFiles, outputLib, analyzerName);
            }
            else {
                args = this.buildGccClangArgs(cppFiles, outputLib, platform);
            }
            logView_1.logView.addMessage(`Compiling: ${compiler} ${args.join(' ')}`, logView_1.logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
            return this.runCompiler(compiler, args, anapath);
        });
    }
    buildMsvcArgs(cppFiles, outputLib, analyzerName) {
        // cl.exe /LD /Fe:<output>.dll <cpp_files>
        return ['/LD', `/Fe${outputLib}`, ...cppFiles];
    }
    buildGccClangArgs(cppFiles, outputLib, platform) {
        if (platform === 'darwin') {
            return ['-dynamiclib', '-o', outputLib, ...cppFiles];
        }
        else {
            // Linux and other Unix-like
            return ['-shared', '-fPIC', '-o', outputLib, ...cppFiles];
        }
    }
    runCompiler(compiler, args, anapath) {
        const cp = require('child_process');
        const outputChannel = vscode.window.createOutputChannel('NLP++ Compile');
        outputChannel.show(true);
        outputChannel.appendLine(`Compiling: ${compiler} ${args.join(' ')}`);
        return new Promise(resolve => {
            cp.execFile(compiler, args, { cwd: path.join(anapath, 'cpp') }, (err, stdout, stderr) => {
                if (stdout) {
                    outputChannel.appendLine(stdout);
                    logView_1.logView.addMessage('Compiler stdout: ' + stdout.trim(), logView_1.logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                }
                if (stderr) {
                    outputChannel.appendLine(stderr);
                    logView_1.logView.addMessage('Compiler stderr: ' + stderr.trim(), logView_1.logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                }
                if (err) {
                    outputChannel.appendLine('Compile error: ' + err.message);
                    logView_1.logView.addMessage('Compile error: ' + err.message, logView_1.logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                    vscode.window.showErrorMessage('C++ compile failed. See "NLP++ Compile" output panel for details.');
                    resolve(false);
                }
                else {
                    outputChannel.appendLine('Compile succeeded.');
                    resolve(true);
                }
            });
        });
    }
    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------
    sharedLibraryName(analyzerName) {
        const platform = os.platform();
        if (platform === 'win32') {
            return analyzerName + '.dll';
        }
        else if (platform === 'darwin') {
            return analyzerName + '.dylib';
        }
        else {
            return analyzerName + '.so';
        }
    }
}
exports.NLPCompile = NLPCompile;
//# sourceMappingURL=compile.js.map