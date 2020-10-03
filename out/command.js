"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NLPCommands = exports.nlpCommands = void 0;
const vscode = require("vscode");
class NLPCommands {
    constructor(ctx) {
        this._ctx = ctx;
        ctx.subscriptions.push(vscode.commands.registerCommand("nlp.analyze", this.analyze));
    }
    static attach(ctx) {
        if (!exports.nlpCommands) {
            exports.nlpCommands = new NLPCommands(ctx);
        }
        return exports.nlpCommands;
    }
    analyze() {
        console.log(`NLP Analyzing!!!`);
        const testFolder = "${workspaceFolder}";
        const fs = require('fs');
        fs.readdir(testFolder, (err, files) => {
            files.forEach(file => {
                console.log(file);
            });
        });
    }
}
exports.NLPCommands = NLPCommands;
//# sourceMappingURL=command.js.map