"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NLPCommands = exports.nlpCommands = void 0;
const vscode = require("vscode");
const logfile_1 = require("./logfile");
class NLPCommands {
    constructor(ctx) {
        this._ctx = ctx;
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.analyze', this.analyze));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.ruleFired', this.ruleFired));
    }
    static attach(ctx) {
        if (!exports.nlpCommands) {
            exports.nlpCommands = new NLPCommands(ctx);
        }
        return exports.nlpCommands;
    }
    ruleFired() {
        if (vscode.window.activeTextEditor) {
            var file = vscode.window.activeTextEditor.document.uri;
            var position = vscode.window.activeTextEditor.selection.active;
            var logFile = new logfile_1.LogFile();
            logFile.findRule(file, position);
        }
    }
    analyze() {
        console.log('NLP Analyzing!!!');
    }
}
exports.NLPCommands = NLPCommands;
//# sourceMappingURL=command.js.map