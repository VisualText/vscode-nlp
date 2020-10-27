import * as vscode from 'vscode';
import * as fs from 'fs';
import { LogFile } from './logfile';

export let nlpCommands: NLPCommands;
export class NLPCommands {
    _ctx: vscode.ExtensionContext;

    private constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.analyze', this.analyze));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.reformatRule', this.reformatRule));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.ruleFired', this.ruleFired));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.openSelTree', this.openSelTree));
    }

    static attach(ctx: vscode.ExtensionContext): NLPCommands {
        if (!nlpCommands) {
            nlpCommands = new NLPCommands(ctx);
        }
        return nlpCommands;
    }

    reformatRule() {
        if (vscode.window.activeTextEditor) {
            var logFile = new LogFile();
            logFile.reformatRule(vscode.window.activeTextEditor);
        }
    }

    ruleFired() {
        if (vscode.window.activeTextEditor) {
            var logFile = new LogFile();
            logFile.findRule(vscode.window.activeTextEditor);
        }
    }

    openSelTree() {
        if (vscode.window.activeTextEditor) {
            var logFile = new LogFile();
            logFile.findSelectedTree(vscode.window.activeTextEditor);
        }
    }

    analyze() {
        console.log('NLP Analyzing!!!');
    }
}
