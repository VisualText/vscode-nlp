import * as vscode from 'vscode';
import * as path from 'path';
import { visualText } from './visualText';

let nlpStatusBarRun: vscode.StatusBarItem;
let nlpStatusBarText: vscode.StatusBarItem;

export let nlpStatusBar: NLPStatusBar;
export class NLPStatusBar {

    _ctx: vscode.ExtensionContext;
    
    private constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;

        nlpStatusBarRun = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
        nlpStatusBarRun.text = `$(run)`;
        nlpStatusBarRun.tooltip = 'Analyze the text';
        nlpStatusBarRun.command = "textView.analyze";
        nlpStatusBarRun.show();

        nlpStatusBarText = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
        nlpStatusBarText.command = "textView.openText";
        this.update();

        vscode.commands.registerCommand('status.update', () => this.update());
    }

    static attach(ctx: vscode.ExtensionContext): NLPStatusBar {
        if (!nlpStatusBar) {
            nlpStatusBar = new NLPStatusBar(ctx);
        }
        return nlpStatusBar;
    }

    update() {
        if (visualText.analyzer.hasText()) {
            var filepath = visualText.analyzer.getTextPath();
            var namepath = path.basename(filepath);
            nlpStatusBarText.text = namepath; 
            nlpStatusBarText.show();
        }
    }
}
