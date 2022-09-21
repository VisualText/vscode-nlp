import * as vscode from 'vscode';
import * as path from 'path';
import { visualText } from './visualText';
import { TreeFile } from './treeFile';
import { nlpFileType } from './textFile';
import * as os from 'os';

let nlpStatusBarRun: vscode.StatusBarItem;
let nlpStatusBarText: vscode.StatusBarItem;
let nlpStatusBarDev: vscode.StatusBarItem;
let nlpStatusBarFired: vscode.StatusBarItem;
let nlpStatusBarEngineVersion: vscode.StatusBarItem;
let nlpStatusBarVisualTextVersion: vscode.StatusBarItem;
let nlpStatusBarFilesVersion: vscode.StatusBarItem;

export enum DevMode { NORMAL, DEV }
export enum FiredMode { BUILT, FIRED }

export let nlpStatusBar: NLPStatusBar;
export class NLPStatusBar {

    _ctx: vscode.ExtensionContext;
    logFile = new TreeFile();
    devMode: DevMode;
    firedMode: FiredMode;
    
    private constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;
        this.devMode = DevMode.DEV;
        this.firedMode = FiredMode.FIRED;

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

        nlpStatusBarEngineVersion = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE - 1);
        nlpStatusBarEngineVersion.tooltip = 'NLP Engine Version';
        nlpStatusBarEngineVersion.command = 'status.openEngineVersionSettings';
        nlpStatusBarEngineVersion.show();
                                
        nlpStatusBarVisualTextVersion = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE - 2);
        nlpStatusBarVisualTextVersion.tooltip = 'VisualText Version';
        nlpStatusBarVisualTextVersion.command = 'status.openVisualTextVersionSettings';
        nlpStatusBarVisualTextVersion.show(); 
                        
        nlpStatusBarFilesVersion = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE - 3);
        nlpStatusBarFilesVersion.tooltip = 'VisualText Files Version';
        nlpStatusBarFilesVersion.command = 'status.openFilesVersionSettings';
        nlpStatusBarFilesVersion.show();

        this.update();

        vscode.commands.registerCommand('status.update', () => this.update());
        vscode.commands.registerCommand('status.chooseDev', () => this.chooseDev());
        vscode.commands.registerCommand('status.chooseFired', () => this.chooseFired());
        vscode.commands.registerCommand('status.openEngineVersionSettings', () => this.openEngineVersionSettings());
        vscode.commands.registerCommand('status.openVisualTextVersionSettings', () => this.openVisualTextVersionSettings());
        vscode.commands.registerCommand('status.openFilesVersionSettings', () => this.openFilesVersionSettings());
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
            let exe = visualText.NLP_EXE;
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
                vscode.commands.executeCommand('textView.analyzeLast');	
        }
    }

    openVisualTextVersionSettings() {
        visualText.runUpdater();
    }

    openFilesVersionSettings() {
        visualText.checkVTFilesVersion()
        .then(newer => {
            if (newer) {
                nlpStatusBar.updateFilesVersion(visualText.vtFilesVersion);
                let items: vscode.QuickPickItem[] = [];
                items.push({label: 'Yes', description: 'Update VisualText files to version ' + visualText.repoVTFilesVersion});
                items.push({label: 'No', description: 'Cancel VisualText files update'});

                vscode.window.showQuickPick(items).then(selection => {
                    if (!selection || selection.label == 'No')
                        return;
                    visualText.updateVTFiles();     
                });
            }
            else {
                vscode.window.showWarningMessage('VisualText files verion ' + visualText.repoVTFilesVersion + ' is the latest');
            }   
        });
    }

    openEngineVersionSettings() {
        // Need to check the engine cmd version and repo version to compare

        var ext = visualText.getExtension();
        visualText.fetchExeVersion(ext.uri.fsPath)?.then(notUsed => {
            if (visualText.cmdEngineVersion.length) {
                visualText.checkEngineVersion().then(newVersion => {
                    if (visualText.versionCompare(visualText.repoEngineVersion,visualText.cmdEngineVersion)) {
                        nlpStatusBar.updateEngineVersion(visualText.engineVersion);
                        let items: vscode.QuickPickItem[] = [];
                        items.push({label: 'Yes', description: 'Update NLP Engine to version ' + visualText.cmdEngineVersion});
                        items.push({label: 'No', description: 'Cancel NLP Engine update'});

                        vscode.window.showQuickPick(items).then(selection => {
                            if (!selection || selection.label == 'No')
                                return;
                            visualText.updateEngine();
                        });                    
                    }
                    else {
                        vscode.window.showWarningMessage('NLP Engine verion ' + visualText.cmdEngineVersion + ' is the latest');
                    }  
                });
            }
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
        this.updateEngineVersion('');
        this.updateVisualTextVersion('');
        this.updateFilesVersion('');
    }

    updateEngineVersion(version: string) {
        var cmdVersion = visualText.cmdEngineVersion;
        if (version.length == 0) {
            const config = vscode.workspace.getConfiguration('engine');
            let currentVersion = config.get<string>('version');
            if (currentVersion != undefined) {
                version = currentVersion;
            }       
        }
        if (version != undefined && version.length) {
            if (visualText.versionCompare(cmdVersion,version) > 0)
                version = version + '*';
            nlpStatusBarEngineVersion.text = version;
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
        var repoVersion = visualText.repoVTFilesVersion;
        if (version.length == 0) {
            const config = vscode.workspace.getConfiguration('engine');
            let currentVersion = config.get<string>('visualtext');
            if (currentVersion != undefined) {
                version = currentVersion;
            }       
        }
        if (version != undefined && version.length) {
            if (visualText.versionCompare(repoVersion,version) > 0)
                version = version + '*';
            nlpStatusBarFilesVersion.text = version;
        } else {
            nlpStatusBarFilesVersion.text = '';
        }
    }
}
