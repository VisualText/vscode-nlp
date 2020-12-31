"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NLPCommands = exports.nlpCommands = void 0;
const vscode = require("vscode");
const logfile_1 = require("./logfile");
const nlp_1 = require("./nlp");
class NLPCommands {
    constructor(ctx) {
        this._ctx = ctx;
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.analyze', this.analyze));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.reformatRule', this.reformatRule));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.searchWord', this.searchWord));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.ruleFired', this.ruleFired));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.openSelTree', this.openSelTree));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.generateRule', this.generateRule));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.openLegacyHelp', this.openLegacyHelp));
        ctx.subscriptions.push(vscode.commands.registerCommand('log.foldAll', this.foldAll));
        ctx.subscriptions.push(vscode.commands.registerCommand('log.unfoldAll', this.unfoldAll));
        ctx.subscriptions.push(vscode.commands.registerCommand('log.highlightText', this.highlightText));
        ctx.subscriptions.push(vscode.commands.registerCommand('log.ruleFired', this.ruleFiredLog));
    }
    static attach(ctx) {
        if (!exports.nlpCommands) {
            exports.nlpCommands = new NLPCommands(ctx);
        }
        return exports.nlpCommands;
    }
    openLegacyHelp() {
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('http://www.textanalysis.com/help/help.htm'));
    }
    searchWord() {
        if (vscode.window.activeTextEditor) {
            var nlpFile = new nlp_1.NLPFile();
            nlpFile.searchWord(vscode.window.activeTextEditor);
        }
    }
    reformatRule() {
        if (vscode.window.activeTextEditor) {
            var nlpFile = new nlp_1.NLPFile();
            nlpFile.reformatRule(vscode.window.activeTextEditor);
        }
    }
    ruleFired() {
        if (vscode.window.activeTextEditor) {
            var logFile = new logfile_1.LogFile();
            logFile.findRule(vscode.window.activeTextEditor);
        }
    }
    openSelTree() {
        if (vscode.window.activeTextEditor) {
            var logFile = new logfile_1.LogFile();
            logFile.findSelectedTree(vscode.window.activeTextEditor);
        }
    }
    generateRule() {
        if (vscode.window.activeTextEditor) {
            var logFile = new logfile_1.LogFile();
            logFile.generateRule(vscode.window.activeTextEditor);
        }
    }
    analyze() {
        if (vscode.window.activeTextEditor) {
            var nlp = new nlp_1.NLPFile();
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
            var logFile = new logfile_1.LogFile();
            logFile.hightlightText(vscode.window.activeTextEditor);
        }
    }
    ruleFiredLog() {
        if (vscode.window.activeTextEditor) {
            var logFile = new logfile_1.LogFile();
            logFile.ruleFired(vscode.window.activeTextEditor);
        }
    }
}
exports.NLPCommands = NLPCommands;
//# sourceMappingURL=command.js.map