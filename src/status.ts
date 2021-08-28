import * as vscode from 'vscode';
import * as path from 'path';
import { visualText } from './visualText';
import { LogFile } from './logfile';
import { nlpFileType } from './textFile';

let nlpStatusBarRun: vscode.StatusBarItem;
let nlpStatusBarText: vscode.StatusBarItem;
let nlpStatusBarDev: vscode.StatusBarItem;
let nlpStatusBarFired: vscode.StatusBarItem;
let nlpStatusBarVersion: vscode.StatusBarItem;
let nlpStatusBarVisualTextVersion: vscode.StatusBarItem;
let nlpStatusBarFilesVersion: vscode.StatusBarItem;

export enum DevMode { NORMAL, DEV }
export enum FiredMode { BUILT, FIRED }

export let nlpStatusBar: NLPStatusBar;
export class NLPStatusBar {

    _ctx: vscode.ExtensionContext;
    logFile = new LogFile();
    devMode: DevMode;
    firedMode: FiredMode;
    
    private constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;
        this.devMode = DevMode.DEV;
        this.firedMode = FiredMode.FIRED;

        nlpStatusBarRun = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
        nlpStatusBarRun.text = `$(run)`;
        nlpStatusBarRun.tooltip = 'Analyze the text';
        nlpStatusBarRun.command = 'textView.analyzeLast';
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

        nlpStatusBarVersion = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE - 1);
        nlpStatusBarVersion.tooltip = 'NLP Engine Version';
        nlpStatusBarVersion.command = 'status.openVersionSettings';
        nlpStatusBarVersion.show();
                                
        nlpStatusBarVisualTextVersion = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE - 2);
        nlpStatusBarVisualTextVersion.tooltip = 'VisualText Version';
        nlpStatusBarVisualTextVersion.command = 'status.openVisualVersionSettings';
        nlpStatusBarVisualTextVersion.show(); 
                        
        nlpStatusBarFilesVersion = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE - 3);
        nlpStatusBarFilesVersion.tooltip = 'VisualText Files Version';
        nlpStatusBarFilesVersion.command = 'status.openFilesVersionSettings';
        nlpStatusBarFilesVersion.show();

        this.update();

        vscode.commands.registerCommand('status.update', () => this.update());
        vscode.commands.registerCommand('status.chooseDev', () => this.chooseDev());
        vscode.commands.registerCommand('status.chooseFired', () => this.chooseFired());
        vscode.commands.registerCommand('status.openVersionSettings', () => this.openVersionSettings());
        vscode.commands.registerCommand('status.openVisualTextVersionSettings', () => this.openVisualTextVersionSettings());
        vscode.commands.registerCommand('status.openFilesVersionSettings', () => this.openFilesVersionSettings());
    }

    static attach(ctx: vscode.ExtensionContext): NLPStatusBar {
        if (!nlpStatusBar) {
            nlpStatusBar = new NLPStatusBar(ctx);
        }
        return nlpStatusBar;
    }
    
    openVisualTextVersionSettings() {
        vscode.commands.executeCommand('workbench.action.openSettings');
    }

    openFilesVersionSettings() {
        visualText.checkVisualTextFilesVersion()
        .then(value => {
            if (visualText.existsNewerFileVersion()) {
                let items: vscode.QuickPickItem[] = [];
                items.push({label: 'Yes', description: 'Update VisualText files to version ' + visualText.filesVersion});
                items.push({label: 'No', description: 'Cancel VisualText files update'});
    
                vscode.window.showQuickPick(items).then(selection => {
                    if (!selection || selection.label == 'No')
                        return;
                    const toPath = path.join(visualText.engineDir.fsPath,visualText.VISUALTEXT_FILES_DIR);
                    visualText.downloadVisualTextFiles(toPath);
                    const config = vscode.workspace.getConfiguration('engine');
                    config.update('visualtext',visualText.filesVersion,vscode.ConfigurationTarget.Global);
                    visualText.debugMessage('VisualText files updated to version ' + visualText.filesVersion);
                    nlpStatusBar.updateFilesVersion(visualText.filesVersion);  
                });
            } else {
                vscode.commands.executeCommand('workbench.action.openSettings');
            }
        }).catch(err => {
            visualText.debugMessage(err);
        });
    }

    openVersionSettings() {
        visualText.checkEngineVersion()
        .then(value => {
            if (visualText.existsNewerVersion()) {
                let items: vscode.QuickPickItem[] = [];
                items.push({label: 'Yes', description: 'Update NLP Engine to version ' + visualText.engineVersion});
                items.push({label: 'No', description: 'Cancel NLP Engine update'});
    
                vscode.window.showQuickPick(items).then(selection => {
                    if (!selection || selection.label == 'No')
                        return;
                    const toPath = path.join(visualText.engineDir.fsPath,visualText.NLP_EXE);
                    const config = vscode.workspace.getConfiguration('engine');
                    config.update('version',visualText.engineVersion,vscode.ConfigurationTarget.Global);
                    config.update('path',visualText.extensionDirectory(),vscode.ConfigurationTarget.Global);
                    visualText.downloadExecutable(toPath);
                    visualText.debugMessage('NLP Engine updated to version ' + visualText.engineVersion);
                    nlpStatusBar.updateVersion(visualText.engineVersion);  
                });
            } else {
                vscode.commands.executeCommand('workbench.action.openSettings');
            }
        }).catch(err => {
            visualText.debugMessage(err);
        });
    }

    chooseDev() {
        let items: vscode.QuickPickItem[] = [];
        items.push({label: 'Log files', description: 'DO generate log files when analyzing'});
        items.push({label: 'No log files', description: 'DO NOT generate log files when analyzing'});
        vscode.window.showQuickPick(items).then(selection => {
            if (!selection) {
                return;
            }
            var mode: DevMode = selection.label === 'Log files' ? DevMode.DEV : DevMode.NORMAL;
            nlpStatusBar.setDevState(mode);
        });	
    }
    
    chooseFired() {
        let items: vscode.QuickPickItem[] = [];
        items.push({label: 'Display Built Only', description: 'Display only built rules matched'});
        items.push({label: 'Display All Matches', description: 'Display all fired rules matched'});
        vscode.window.showQuickPick(items).then(selection => {
            if (!selection) {
                return;
            }
            var mode: FiredMode = selection.label === 'Display Built Only' ? FiredMode.BUILT : FiredMode.FIRED;
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
            nlpStatusBarDev.text = 'Log Files On';
        } else {
            nlpStatusBarDev.text = 'Log Files Off';
        }
    }

    public getFiredMode(): FiredMode {
        return this.firedMode;
    }

    setFiredState(firedMode: FiredMode) {
        var changed = this.firedMode == firedMode ? false : true;
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

    update() {
        if (visualText.analyzer.hasText()) {
            var filepath = visualText.analyzer.getTextPath().fsPath;
            var namepath = path.basename(filepath);
            nlpStatusBarText.text = namepath;
            nlpStatusBarText.show();

            this.updateDevState();
            this.updateFiredState();
            nlpStatusBarDev.show();
        }
        this.updateVersion('');
        this.updateVisualTextVersion('');
        this.updateFilesVersion('');
    }

    updateVersion(version: string) {
        if (version.length == 0) {
            const config = vscode.workspace.getConfiguration('engine');
            let currentVersion = config.get<string>('version');
            if (currentVersion != undefined) {
                version = currentVersion;
            }       
        }
        if (version != undefined && version.length) {
            nlpStatusBarVersion.text = version;
        } else {
            nlpStatusBarVersion.text = '';
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
        if (version.length == 0) {
            const config = vscode.workspace.getConfiguration('engine');
            let currentVersion = config.get<string>('visualtext');
            if (currentVersion != undefined) {
                version = currentVersion;
            }       
        }
        if (version != undefined && version.length) {
            nlpStatusBarFilesVersion.text = version;
        } else {
            nlpStatusBarFilesVersion.text = '';
        }
    }
}
