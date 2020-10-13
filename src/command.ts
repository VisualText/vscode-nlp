import * as vscode from 'vscode';
import * as fs from 'fs';
import { LogFile } from './logfile';

export let nlpCommands: NLPCommands;
export class NLPCommands {
    _ctx: vscode.ExtensionContext;


    private constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.analyze', this.analyze));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.ruleFired', this.ruleFired));
    }

    static attach(ctx: vscode.ExtensionContext): NLPCommands {
        if (!nlpCommands) {
            nlpCommands = new NLPCommands(ctx);
        }
        return nlpCommands;
    }

    ruleFired() {
        if (vscode.window.activeTextEditor) {
            var file = vscode.window.activeTextEditor.document.uri;
            var position = vscode.window.activeTextEditor.selection.active;
            var logFile = new LogFile();
            logFile.findRule(file,position);
        }
    }

    analyze() {
        console.log('NLP Analyzing!!!');
    }
}
