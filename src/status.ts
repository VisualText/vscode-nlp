import * as vscode from 'vscode';
import * as path from 'path';
import { visualText,updateOp } from './visualText';
import { TreeFile } from './treeFile';
import { nlpFileType } from './textFile';
import * as os from 'os';
import * as fs from 'fs';

let nlpStatusBarRun: vscode.StatusBarItem;
let nlpStatusBarText: vscode.StatusBarItem;
let nlpStatusBarDev: vscode.StatusBarItem;
let nlpStatusBarFired: vscode.StatusBarItem;
let nlpStatusBarRunMode: vscode.StatusBarItem;
let nlpStatusBarEngineVersion: vscode.StatusBarItem;
let nlpStatusBarVisualTextVersion: vscode.StatusBarItem;
let nlpStatusBarFilesVersion: vscode.StatusBarItem;
let nlpStatusBarAnalyzersVersion: vscode.StatusBarItem;

export enum DevMode { NORMAL, DEV, SILENT }
export enum FiredMode { BUILT, FIRED }
export enum RunMode { INTERPRETED, COMPILED, COMPILED_KB }

export let nlpStatusBar: NLPStatusBar;
export class NLPStatusBar {

    _ctx: vscode.ExtensionContext;
    logFile = new TreeFile();
    devMode: DevMode;
    firedMode: FiredMode;
    runMode: RunMode;

    private constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;
        this.devMode = DevMode.DEV;
        this.firedMode = FiredMode.FIRED;
        this.runMode = this.readRunModeConfig();

        nlpStatusBarRun = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
        nlpStatusBarRun.text = `$(run)`;
        nlpStatusBarRun.tooltip = 'Analyze the text';
        nlpStatusBarRun.command = 'status.clickedAnalyzerButton';
        nlpStatusBarRun.show();

        nlpStatusBarText = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 19);
        nlpStatusBarText.tooltip = 'Current text to analyze';
        nlpStatusBarText.command = 'textView.openText';
        nlpStatusBarText.show();

        nlpStatusBarDev = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 18);
        nlpStatusBarDev.tooltip = 'Development settings';
        nlpStatusBarDev.command = 'status.chooseDev';
        nlpStatusBarDev.show();
        
        nlpStatusBarFired = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 17);
        nlpStatusBarFired.tooltip = 'Fired settings';
        nlpStatusBarFired.command = 'status.chooseFired';
        nlpStatusBarFired.show();

        nlpStatusBarRunMode = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 16);
        nlpStatusBarRunMode.tooltip = 'Toggle interpreted vs compiled analyzer run';
        nlpStatusBarRunMode.command = 'status.toggleRunMode';
        nlpStatusBarRunMode.show();

        nlpStatusBarEngineVersion = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE - 1);
        nlpStatusBarEngineVersion.tooltip = 'NLP Engine Version';
        nlpStatusBarEngineVersion.command = 'status.openEngineVersionSettings';
        nlpStatusBarEngineVersion.show();
                                
        nlpStatusBarVisualTextVersion = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE - 2);
        nlpStatusBarVisualTextVersion.tooltip = 'VisualText Version';
        nlpStatusBarVisualTextVersion.command = 'status.openVisualTextVersionSettings';
        nlpStatusBarVisualTextVersion.show();
                                
        nlpStatusBarAnalyzersVersion = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE - 3);
        nlpStatusBarAnalyzersVersion.tooltip = 'Analyzers Version';
        nlpStatusBarAnalyzersVersion.command = 'status.openAnalyzerVersionSettings';
        nlpStatusBarAnalyzersVersion.show();
                        
        nlpStatusBarFilesVersion = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE - 4);
        nlpStatusBarFilesVersion.tooltip = 'VisualText Files Version';
        nlpStatusBarFilesVersion.command = 'status.openFilesVersionSettings';
        nlpStatusBarFilesVersion.show();

        this.update();

        vscode.commands.registerCommand('status.update', () => this.update());
        vscode.commands.registerCommand('status.chooseDev', () => this.chooseDev());
        vscode.commands.registerCommand('status.chooseFired', () => this.chooseFired());
        vscode.commands.registerCommand('status.toggleRunMode', () => this.toggleRunMode());
        vscode.commands.registerCommand('status.openEngineVersionSettings', () => this.openEngineVersionSettings());
        vscode.commands.registerCommand('status.openVisualTextVersionSettings', () => this.openVisualTextVersionSettings());
        vscode.commands.registerCommand('status.openFilesVersionSettings', () => this.openFilesVersionSettings());
        vscode.commands.registerCommand('status.openAnalyzerVersionSettings', () => this.openAnalyzersVersionSettings());        
        vscode.commands.registerCommand('status.clickedAnalyzerButton', () => this.clickedAnalyzerButton());
    }

    static attach(ctx: vscode.ExtensionContext): NLPStatusBar {
        if (!nlpStatusBar) {
            nlpStatusBar = new NLPStatusBar(ctx);
        }
        return nlpStatusBar;
    }

    public clickedAnalyzerButton() {
        this.analyzerButton(true);
    }

    public resetAnalyzerButton() {
        nlpStatusBarRun.text = `$(run)`;
        nlpStatusBarRun.tooltip = 'Analyze the text';
        visualText.processID = 0;
    }

    public analyzerButton(statusBarClick: boolean=true) {
        if (visualText.processID) {
            let taskKill = "";
            const exe = visualText.NLP_EXE;
            switch (os.platform()) {
                case 'win32':
                    taskKill = `taskkill /IM "${exe}" /F`;
                    break;
                default:
                    taskKill = `pkill -f "${exe}"`;
            }
            const cp = require('child_process');
            cp.exec(taskKill);
            this.resetAnalyzerButton();
        } else {
            nlpStatusBarRun.text = `$(chrome-close)`;
            nlpStatusBarRun.tooltip = 'Stop analyzer';
            if (statusBarClick)
                vscode.commands.executeCommand('textView.analyzerCurrent');	
        }
    }

    openVisualTextVersionSettings() {
        const filepath = path.join(visualText.extensionDirectory().fsPath,'CHANGELOG.md');
        if (fs.existsSync(filepath)) {
            vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(filepath));
        } else {
            const url = 'https://github.com/VisualText/vscode-nlp/blob/master/CHANGELOG.md';
            vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
        }
    }

    openFilesVersionSettings() {
        const url = 'https://github.com/VisualText/visualtext-files/pulls?q=is%3Apr+is%3Aclosed';
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
        visualText.checkVTFilesVersion(visualText.emptyOp())
    }

    openAnalyzersVersionSettings() {
        const url = 'https://github.com/VisualText/analyzers/pulls?q=is%3Apr+is%3Aclosed';
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
        visualText.checkAnalyzersVersion(visualText.emptyOp());
    }

    openEngineVersionSettings() {
        const url = 'https://github.com/VisualText/nlp-engine/pulls?q=is%3Apr+is%3Aclosed';
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
        visualText.startUpdater();
    }

    chooseDev() {
        const items: vscode.QuickPickItem[] = [];
        items.push({label: 'All logging on', description: 'generate all log files when analyzing'});
        items.push({label: 'Final logs only', description: 'generate the final log files when analyzing'});
        items.push({label: 'All logging off', description: 'do not generate any log files when analyzing'});
        vscode.window.showQuickPick(items, {title: 'Log Files Mode', canPickMany: false, placeHolder: 'Choose a mode'}).then(selection => {
            if (!selection) {
                return;
            }
            let mode: DevMode = DevMode.NORMAL;
            if (selection.label === 'All logging on')
                mode = DevMode.DEV
            else if (selection.label === 'Final logs only')
                mode = DevMode.NORMAL;
            else
                mode = DevMode.SILENT;
            nlpStatusBar.setDevState(mode);
        });	
    }
    
    chooseFired() {
        const items: vscode.QuickPickItem[] = [];
        items.push({label: 'Display Built Only', description: 'Display only built rules matched'});
        items.push({label: 'Display All Matches', description: 'Display all fired rules matched'});
        vscode.window.showQuickPick(items, {title: 'Display Type', canPickMany: false, placeHolder: 'Choose Yes or No'}).then(selection => {
            if (!selection) {
                return;
            }
            const mode: FiredMode = selection.label === 'Display Built Only' ? FiredMode.BUILT : FiredMode.FIRED;
            nlpStatusBar.setFiredState(mode);
        });	
    }

    public getDevMode(): DevMode {
        return this.devMode;
    }

    setDevState(devMode: DevMode) {
        this.devMode = devMode;
        this.updateDevState();
    }

    updateDevState() {
        if (this.devMode == DevMode.DEV) {
            nlpStatusBarDev.text = 'Logs All On';
        } else if (this.devMode == DevMode.SILENT) {
            nlpStatusBarDev.text = 'Logs All Off';
        } else {
            nlpStatusBarDev.text = 'Logs Final Only';
        }
    }

    public getFiredMode(): FiredMode {
        return this.firedMode;
    }

    setFiredState(firedMode: FiredMode) {
        const changed = this.firedMode == firedMode ? false : true;
        this.firedMode = firedMode;
        this.updateFiredState();
        this.logFile.updateTxxtFiles(nlpFileType.TXXT);
        vscode.commands.executeCommand('sequenceView.refreshAll');
    }

    updateFiredState() {
        if (this.firedMode == FiredMode.BUILT) {
            nlpStatusBarFired.text = 'Display Built Only';
        } else {
            nlpStatusBarFired.text = 'Display All Fired';
        }
    }

    public getRunMode(): RunMode {
        return this.runMode;
    }

    setRunMode(mode: RunMode) {
        this.runMode = mode;
        this.writeRunModeConfig(mode);
        this.updateRunModeState();
    }

    toggleRunMode() {
        const next = this.nextRunMode(this.runMode);
        if ((next === RunMode.COMPILED || next === RunMode.COMPILED_KB) && !this.hasCompiledLib(next)) {
            const name = this.currentAnalyzerName() || 'this analyzer';
            const compileCmd = next === RunMode.COMPILED_KB ? 'kbView.compileKB' : 'analyzerView.compileAnalyzer';
            const compileLabel = next === RunMode.COMPILED_KB ? 'Compile KB' : 'Compile Analyzer and KB';
            const modeLabel = next === RunMode.COMPILED_KB ? 'Compiled KB' : 'Compiled';
            vscode.window
                .showWarningMessage(
                    `${name} hasn't been compiled yet. Compile it before switching to ${modeLabel} run mode.`,
                    compileLabel
                )
                .then(choice => {
                    if (choice === compileLabel) {
                        vscode.commands.executeCommand(compileCmd);
                    }
                });
            return;
        }
        this.setRunMode(next);
    }

    private nextRunMode(mode: RunMode): RunMode {
        switch (mode) {
            case RunMode.INTERPRETED: return RunMode.COMPILED;
            case RunMode.COMPILED:    return RunMode.COMPILED_KB;
            default:                  return RunMode.INTERPRETED;
        }
    }

    private currentAnalyzerName(): string | undefined {
        const ana = visualText.getCurrentAnalyzer();
        if (!ana || !ana.fsPath.length) return undefined;
        return path.basename(ana.fsPath.replace(/[\\/]+$/, ''));
    }

    private compiledLibPath(mode: RunMode = RunMode.COMPILED): string | undefined {
        const ana = visualText.getCurrentAnalyzer();
        if (!ana || !ana.fsPath.length) return undefined;
        const ext = os.platform() === 'win32' ? '.dll' : os.platform() === 'darwin' ? '.dylib' : '.so';
        if (mode === RunMode.COMPILED_KB) {
            return path.join(ana.fsPath, 'kb' + ext);
        }
        const name = this.currentAnalyzerName();
        if (!name) return undefined;
        return path.join(ana.fsPath, name + ext);
    }

    public hasCompiledLib(mode: RunMode = RunMode.COMPILED): boolean {
        const p = this.compiledLibPath(mode);
        return !!p && fs.existsSync(p);
    }

    updateRunModeState() {
        if (this.runMode === RunMode.COMPILED) {
            nlpStatusBarRunMode.text = '$(symbol-method) Run: Compiled';
        } else if (this.runMode === RunMode.COMPILED_KB) {
            nlpStatusBarRunMode.text = '$(symbol-namespace) Run: Compiled KB';
        } else {
            nlpStatusBarRunMode.text = '$(symbol-keyword) Run: Interpreted';
        }
    }

    private readRunModeConfig(): RunMode {
        try {
            const folder = visualText.getWorkspaceFolder();
            const config = folder.fsPath.length
                ? vscode.workspace.getConfiguration('analyzer', folder)
                : vscode.workspace.getConfiguration('analyzer');
            const value = config.get<string>('runMode');
            if (value === 'compiled') return RunMode.COMPILED;
            if (value === 'compiled-kb') return RunMode.COMPILED_KB;
            return RunMode.INTERPRETED;
        } catch {
            return RunMode.INTERPRETED;
        }
    }

    private writeRunModeConfig(mode: RunMode) {
        try {
            const folder = visualText.getWorkspaceFolder();
            const value = mode === RunMode.COMPILED ? 'compiled'
                        : mode === RunMode.COMPILED_KB ? 'compiled-kb'
                        : 'interpreted';
            if (folder.fsPath.length) {
                vscode.workspace
                    .getConfiguration('analyzer', folder)
                    .update('runMode', value, vscode.ConfigurationTarget.WorkspaceFolder);
            } else {
                vscode.workspace
                    .getConfiguration('analyzer')
                    .update('runMode', value, vscode.ConfigurationTarget.Global);
            }
        } catch {
            // ignore persistence failures; state still lives in memory
        }
    }

    update() {
        if (visualText.analyzer.hasText()) {
            const filepath = visualText.analyzer.getTextPath().fsPath;
            const namepath = path.basename(filepath);
            nlpStatusBarText.text = namepath;
            nlpStatusBarText.show();

            this.updateDevState();
            this.updateFiredState();
            this.updateRunModeState();
            nlpStatusBarDev.show();
            nlpStatusBarRunMode.show();
        }
        this.updateEngineVersion('');
        this.updateVisualTextVersion('');
        this.updateFilesVersion('');
        this.updateAnalyzerssVersion('');
    }

    updateEngineVersion(version: string) {
         if (version != undefined && version.length) {
            nlpStatusBarEngineVersion.text = version;
        } else if (visualText.exeEngineVersion.length) {
            nlpStatusBarEngineVersion.text = visualText.exeEngineVersion;
        } else {
            nlpStatusBarEngineVersion.text = '';
        }
    }

    updateVisualTextVersion(version: string) {
        if (version != undefined && version.length) {
            nlpStatusBarVisualTextVersion.text = version;
        } else if (visualText.version.length) {
            nlpStatusBarVisualTextVersion.text = visualText.version;
        } else {
            nlpStatusBarVisualTextVersion.text = '';
        }
    }

    updateFilesVersion(version: string) {
        if (version != undefined && version.length) {
            nlpStatusBarFilesVersion.text = version;
        } else if (visualText.repoVTFilesVersion.length) {
            nlpStatusBarFilesVersion.text = visualText.repoVTFilesVersion;
        } else {
            nlpStatusBarFilesVersion.text = '';
        }
    }

    updateAnalyzerssVersion(version: string) {
        if (version != undefined && version.length) {
            nlpStatusBarAnalyzersVersion.text = version;
        } else if (visualText.repoAnalyzersVersion.length) {
            nlpStatusBarAnalyzersVersion.text = visualText.repoAnalyzersVersion;
        } else {
            nlpStatusBarAnalyzersVersion.text = '';
        }
    }
}
