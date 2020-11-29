import * as vscode from 'vscode';
import * as path from 'path';
import { visualText } from './visualText';

let nlpStatusBarRun: vscode.StatusBarItem;
let nlpStatusBarText: vscode.StatusBarItem;
let nlpStatusBarDev: vscode.StatusBarItem;

export enum DevMode { NORMAL, DEV }

export let nlpStatusBar: NLPStatusBar;
export class NLPStatusBar {

    _ctx: vscode.ExtensionContext;
    devMode: DevMode;
    
    private constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;
        this.devMode = DevMode.DEV;

        nlpStatusBarRun = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
        nlpStatusBarRun.text = `$(run)`;
        nlpStatusBarRun.tooltip = 'Analyze the text';
        nlpStatusBarRun.command = "textView.analyzeLast";
        nlpStatusBarRun.show();

        nlpStatusBarText = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 19);
        nlpStatusBarText.tooltip = 'Current text to analyze';
        nlpStatusBarText.command = "textView.openText";

        nlpStatusBarDev = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 18);
        nlpStatusBarDev.tooltip = 'Development settings';
        nlpStatusBarDev.command = "status.chooseDev";

        this.update();

        vscode.commands.registerCommand('status.update', () => this.update());
        vscode.commands.registerCommand('status.chooseDev', () => this.chooseDev());
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

    public getDevMode(): DevMode {
        return this.devMode;
    }

    setDevState(devMode: DevMode) {
        this.devMode = devMode;
        this.udpateDevState();
    }

    udpateDevState() {
        if (this.devMode == DevMode.DEV) {
            nlpStatusBarDev.text = "Log Files On";
        } else {
            nlpStatusBarDev.text = "Log Files Off";
        }
    }

    update() {
        if (visualText.analyzer.hasText()) {
            var filepath = visualText.analyzer.getTextPath().path;
            var namepath = path.basename(filepath);
            nlpStatusBarText.text = namepath;
            nlpStatusBarText.show();

            this.udpateDevState();
            nlpStatusBarDev.show();
        }
    }
}
