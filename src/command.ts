import * as vscode from 'vscode';
import { LogFile } from './logfile';
import { NLPFile } from './nlp';
import { visualText } from './visualText';

export let nlpCommands: NLPCommands;
export class NLPCommands {
    _ctx: vscode.ExtensionContext;

    private constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.analyze', this.analyze));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.analyzeDir', this.analyzeDir));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.reformatRule', this.reformatRule));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.searchWord', this.searchWord));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.ruleFired', this.ruleFired));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.openSelTree', this.openSelTree));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.generateRule', this.generateRule));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.openLegacyHelp', this.openLegacyHelp));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.duplicateLine', this.duplicateLine));
        ctx.subscriptions.push(vscode.commands.registerCommand('log.foldAll', this.foldAll));
        ctx.subscriptions.push(vscode.commands.registerCommand('log.unfoldAll', this.unfoldAll));
        ctx.subscriptions.push(vscode.commands.registerCommand('log.highlightText', this.highlightText));
        ctx.subscriptions.push(vscode.commands.registerCommand('log.ruleFired', this.ruleFiredLog));
    }

    static attach(ctx: vscode.ExtensionContext): NLPCommands {
        if (!nlpCommands) {
            nlpCommands = new NLPCommands(ctx);
        }
        return nlpCommands;
    }
    
    duplicateLine() {
        if (vscode.window.activeTextEditor) {
            var nlpFile = new NLPFile();
            nlpFile.duplicateLine(vscode.window.activeTextEditor);
        }
    }

    openLegacyHelp() {
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('http://www.textanalysis.com/help/help.htm'));
    }

    searchWord() {
        if (vscode.window.activeTextEditor) {
            var nlpFile = new NLPFile();
            nlpFile.searchWord(vscode.window.activeTextEditor);
        }
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

    analyzeDir() {
        if (vscode.window.activeTextEditor) {
            var nlp = new NLPFile();
            var uri = vscode.window.activeTextEditor.document.uri;
            nlp.analyze(uri);
        }
    }

    foldAll() {
        if (vscode.window.activeTextEditor) {
            vscode.commands.executeCommand('editor.foldAll');
        }
    }
    
    unfoldAll() {
        if (vscode.window.activeTextEditor) {
            vscode.commands.executeCommand('editor.unfoldAll');
        }
    }
    
    highlightText() {
        if (vscode.window.activeTextEditor) {
            var logFile = new LogFile();
            logFile.hightlightText(vscode.window.activeTextEditor);
        }
    }
    
    ruleFiredLog() {
        if (vscode.window.activeTextEditor) {
            var logFile = new LogFile();
            logFile.ruleFired(vscode.window.activeTextEditor);
        }
    }
}
