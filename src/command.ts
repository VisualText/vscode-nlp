import * as vscode from 'vscode';
import { LogFile } from './logfile';
import { NLPFile } from './nlp';

export let nlpCommands: NLPCommands;
export class NLPCommands {
    _ctx: vscode.ExtensionContext;

    private constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.analyze', this.analyze));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.reformatRule', this.reformatRule));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.ruleFired', this.ruleFired));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.openSelTree', this.openSelTree));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.generateRule', this.generateRule));
    }

    static attach(ctx: vscode.ExtensionContext): NLPCommands {
        if (!nlpCommands) {
            nlpCommands = new NLPCommands(ctx);
        }
        return nlpCommands;
    }

    reformatRule() {
        if (vscode.window.activeTextEditor) {
            var nlpFile = new NLPFile();
            nlpFile.reformatRule(vscode.window.activeTextEditor);
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
        
    generateRule() {
        if (vscode.window.activeTextEditor) {
            var logFile = new LogFile();
            logFile.generateRule(vscode.window.activeTextEditor);
        }
    }

    analyze() {
        if (vscode.window.activeTextEditor) {
            var nlp = new NLPFile();
            var uri = vscode.window.activeTextEditor.document.uri;
            nlp.analyze(uri);
        }
    }
}
