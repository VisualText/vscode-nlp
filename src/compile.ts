import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { visualText } from './visualText';
import { logView, logLineType } from './logView';
import { dirfuncs } from './dirfuncs';

export enum compileTarget { ANALYZER, KB }

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
            const cppGenerated = await this.runNlpCompile(exe, anapath, engineDir);

            if (!cppGenerated) {
                progress.report({ increment: 100, message: 'C++ generation failed.' });
                return;
            }

            progress.report({ increment: 30, message: 'Detecting C++ compiler...' });

            // 3. Detect C++ compiler
            const compiler = await this.detectCppCompiler();
            if (!compiler) {
                const installed = await this.promptAndInstallCompiler();
                if (!installed) {
                    logView.addMessage(`Compile ${targetLabel} failed: no C++ compiler available.`, logLineType.ANALYER_OUTPUT, analyzerDir);
                    vscode.commands.executeCommand('logView.refreshAll');
                    return;
                }
                // Try detecting again after install
                const compilerAfterInstall = await this.detectCppCompiler();
                if (!compilerAfterInstall) {
                    vscode.window.showErrorMessage('C++ compiler still not found after install attempt. Please restart VS Code and try again.');
                    return;
                }
            }

            progress.report({ increment: 20, message: 'Compiling C++ library...' });

            // 4. Compile the generated C++ into a shared library
            const compilerPath = compiler ?? (await this.detectCppCompiler())!;
            const success = await this.compileCpp(anapath, compilerPath);

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

    private runNlpCompile(exe: string, anapath: string, engineDir: string): Promise<boolean> {
        const cp = require('child_process');
        const args: string[] = ['-COMPILE', '-ANA', anapath, '-WORK', engineDir];

        logView.addMessage(`Running: ${exe} ${args.join(' ')}`, logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));

        return new Promise(resolve => {
            cp.execFile(exe, args, (err: any, stdout: string, stderr: string) => {
                if (stdout) {
                    logView.addMessage('nlp.exe stdout: ' + stdout.trim(), logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                }
                if (stderr) {
                    logView.addMessage('nlp.exe stderr: ' + stderr.trim(), logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                }
                if (err) {
                    logView.addMessage('nlp.exe -COMPILE error: ' + err.message, logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                    vscode.window.showErrorMessage('C++ code generation failed: ' + err.message);
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }

    // ---------------------------------------------------------------------------
    // Step 2: Detect C++ compiler
    // ---------------------------------------------------------------------------

    async detectCppCompiler(): Promise<string | undefined> {
        const platform = os.platform();

        if (platform === 'win32') {
            return this.detectWindowsCompiler();
        } else if (platform === 'darwin') {
            return this.detectUnixCompiler(['clang++', 'g++']);
        } else {
            return this.detectUnixCompiler(['g++', 'clang++']);
        }
    }

    private detectWindowsCompiler(): Promise<string | undefined> {
        return new Promise(resolve => {
            // Try cl.exe (MSVC) first
            const cp = require('child_process');
            cp.exec('cl.exe /?', { timeout: 5000 }, (err: any) => {
                if (!err) {
                    resolve('cl.exe');
                    return;
                }
                // Try g++.exe (MinGW/MSYS2)
                cp.exec('g++ --version', { timeout: 5000 }, (err2: any) => {
                    if (!err2) {
                        resolve('g++');
                        return;
                    }
                    resolve(undefined);
                });
            });
        });
    }

    private detectUnixCompiler(candidates: string[]): Promise<string | undefined> {
        const cp = require('child_process');
        const tryNext = (index: number): Promise<string | undefined> => {
            if (index >= candidates.length) {
                return Promise.resolve(undefined);
            }
            return new Promise(resolve => {
                cp.exec(`${candidates[index]} --version`, { timeout: 5000 }, (err: any) => {
                    if (!err) {
                        resolve(candidates[index]);
                    } else {
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

    private async promptAndInstallCompiler(): Promise<boolean> {
        const platform = os.platform();
        let message = '';
        let installLabel = '';

        if (platform === 'win32') {
            message = 'No C++ compiler found. Install Visual Studio Build Tools (MSVC) or MinGW-w64 to compile NLP++ analyzers.';
            installLabel = 'Download Visual Studio Build Tools';
        } else if (platform === 'darwin') {
            message = 'No C++ compiler found. Install Xcode Command Line Tools to compile NLP++ analyzers.';
            installLabel = 'Install Xcode Command Line Tools';
        } else {
            message = 'No C++ compiler found. Install g++ (GCC) to compile NLP++ analyzers.';
            installLabel = 'Show Install Instructions';
        }

        const response = await vscode.window.showInformationMessage(message, installLabel, 'Cancel');
        if (!response || response === 'Cancel') {
            return false;
        }

        if (platform === 'win32') {
            vscode.commands.executeCommand('vscode.open',
                vscode.Uri.parse('https://visualstudio.microsoft.com/visual-cpp-build-tools/'));
            vscode.window.showInformationMessage(
                'After installing Visual Studio Build Tools, open a "Developer Command Prompt" and restart VS Code.');
            return false;
        } else if (platform === 'darwin') {
            return this.installXcodeCommandLineTools();
        } else {
            return this.showLinuxInstallInstructions();
        }
    }

    private installXcodeCommandLineTools(): Promise<boolean> {
        const cp = require('child_process');
        return new Promise(resolve => {
            const outputChannel = vscode.window.createOutputChannel('NLP++ Compiler Install');
            outputChannel.show(true);
            outputChannel.appendLine('Running: xcode-select --install');
            outputChannel.appendLine('A system dialog will appear asking you to install the Command Line Tools.');
            outputChannel.appendLine('After installation completes, retry the compile action.');

            cp.exec('xcode-select --install', (err: any, stdout: string, stderr: string) => {
                if (stdout) outputChannel.appendLine(stdout);
                if (stderr) outputChannel.appendLine(stderr);
                // xcode-select --install exits with error if already installed or if GUI dialog was shown
                // Either way, guide the user to retry
                vscode.window.showInformationMessage(
                    'Xcode Command Line Tools install initiated. After installation completes, retry the compile action.');
                resolve(false); // User must retry after install
            });
        });
    }

    private async showLinuxInstallInstructions(): Promise<boolean> {
        const outputChannel = vscode.window.createOutputChannel('NLP++ Compiler Install');
        outputChannel.show(true);
        outputChannel.appendLine('To install g++ on Linux, run one of the following commands in a terminal:');
        outputChannel.appendLine('');
        outputChannel.appendLine('  Debian/Ubuntu:   sudo apt-get install g++');
        outputChannel.appendLine('  Fedora/RHEL:     sudo dnf install gcc-c++');
        outputChannel.appendLine('  Arch Linux:      sudo pacman -S gcc');
        outputChannel.appendLine('');
        outputChannel.appendLine('After installation, restart VS Code and retry the compile action.');
        vscode.window.showInformationMessage(
            'See the "NLP++ Compiler Install" output panel for installation instructions.');
        return false;
    }

    // ---------------------------------------------------------------------------
    // Step 4: Compile C++ into a shared library
    // ---------------------------------------------------------------------------

    private async compileCpp(anapath: string, compiler: string): Promise<boolean> {
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

        let args: string[];
        if (platform === 'win32' && (compiler === 'cl.exe' || compiler.endsWith('cl.exe'))) {
            args = this.buildMsvcArgs(cppFiles, outputLib, analyzerName);
        } else {
            args = this.buildGccClangArgs(cppFiles, outputLib, platform);
        }

        logView.addMessage(`Compiling: ${compiler} ${args.join(' ')}`, logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));

        return this.runCompiler(compiler, args, anapath);
    }

    private buildMsvcArgs(cppFiles: string[], outputLib: string, analyzerName: string): string[] {
        // cl.exe /LD /Fe:<output>.dll <cpp_files>
        return ['/LD', `/Fe${outputLib}`, ...cppFiles];
    }

    private buildGccClangArgs(cppFiles: string[], outputLib: string, platform: string): string[] {
        if (platform === 'darwin') {
            return ['-dynamiclib', '-o', outputLib, ...cppFiles];
        } else {
            // Linux and other Unix-like
            return ['-shared', '-fPIC', '-o', outputLib, ...cppFiles];
        }
    }

    private runCompiler(compiler: string, args: string[], anapath: string): Promise<boolean> {
        const cp = require('child_process');
        const outputChannel = vscode.window.createOutputChannel('NLP++ Compile');
        outputChannel.show(true);
        outputChannel.appendLine(`Compiling: ${compiler} ${args.join(' ')}`);

        return new Promise(resolve => {
            cp.execFile(compiler, args, { cwd: path.join(anapath, 'cpp') }, (err: any, stdout: string, stderr: string) => {
                if (stdout) {
                    outputChannel.appendLine(stdout);
                    logView.addMessage('Compiler stdout: ' + stdout.trim(), logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                }
                if (stderr) {
                    outputChannel.appendLine(stderr);
                    logView.addMessage('Compiler stderr: ' + stderr.trim(), logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                }
                if (err) {
                    outputChannel.appendLine('Compile error: ' + err.message);
                    logView.addMessage('Compile error: ' + err.message, logLineType.ANALYER_OUTPUT, vscode.Uri.file(anapath));
                    vscode.window.showErrorMessage('C++ compile failed. See "NLP++ Compile" output panel for details.');
                    resolve(false);
                } else {
                    outputChannel.appendLine('Compile succeeded.');
                    resolve(true);
                }
            });
        });
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
