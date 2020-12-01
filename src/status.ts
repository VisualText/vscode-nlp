import * as vscode from 'vscode';
import * as path from 'path';
import { visualText } from './visualText';
import { LogFile } from './logfile';
import { nlpFileType } from './textFile';

let nlpStatusBarRun: vscode.StatusBarItem;
let nlpStatusBarText: vscode.StatusBarItem;
let nlpStatusBarDev: vscode.StatusBarItem;
let nlpStatusBarFired: vscode.StatusBarItem;

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
        this.firedMode = FiredMode.BUILT;

        nlpStatusBarRun = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
        nlpStatusBarRun.text = `$(run)`;
        nlpStatusBarRun.tooltip = 'Analyze the text';
        nlpStatusBarRun.command = "textView.analyzeLast";
        nlpStatusBarRun.show();

        nlpStatusBarText = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 19);
        nlpStatusBarText.tooltip = 'Current text to analyze';
        nlpStatusBarText.command = "textView.openText";
        nlpStatusBarText.show();

        nlpStatusBarDev = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 18);
        nlpStatusBarDev.tooltip = 'Development settings';
        nlpStatusBarDev.command = "status.chooseDev";
        nlpStatusBarDev.show();
        
        nlpStatusBarFired = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 17);
        nlpStatusBarFired.tooltip = 'Fired settings';
        nlpStatusBarFired.command = "status.chooseFired";
        nlpStatusBarFired.show();

        this.update();

        vscode.commands.registerCommand('status.update', () => this.update());
        vscode.commands.registerCommand('status.chooseDev', () => this.chooseDev());
        vscode.commands.registerCommand('status.chooseFired', () => this.chooseFired());
    }

    static attach(ctx: vscode.ExtensionContext): NLPStatusBar {
        if (!nlpStatusBar) {
            nlpStatusBar = new NLPStatusBar(ctx);
        }
        return nlpStatusBar;
    }

    chooseDev() {
        let items: vscode.QuickPickItem[] = [];
        items.push({label: 'Log files', description: 'DO NOT generate log files when analyzing'});
        items.push({label: 'No log files', description: 'DO generate log files when analyzing'});
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
            nlpStatusBarDev.text = "Log Files On";
        } else {
            nlpStatusBarDev.text = "Log Files Off";
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
            nlpStatusBarFired.text = "Display Built Only";
        } else {
            nlpStatusBarFired.text = "Display All Fired";
        }
    }

    update() {
        if (visualText.analyzer.hasText()) {
            var filepath = visualText.analyzer.getTextPath().path;
            var namepath = path.basename(filepath);
            nlpStatusBarText.text = namepath;
            nlpStatusBarText.show();

            this.updateDevState();
            this.updateFiredState();
            nlpStatusBarDev.show();
        }
    }
}
