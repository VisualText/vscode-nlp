import * as vscode from "vscode";
import * as fs from "fs";

export let nlpCommands: NLPCommands;
export class NLPCommands {
    _ctx: vscode.ExtensionContext;

    private constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;
        ctx.subscriptions.push(vscode.commands.registerCommand("nlp.analyze", this.analyze));
    }

    static attach(ctx: vscode.ExtensionContext): NLPCommands {
        if (!nlpCommands) {
            nlpCommands = new NLPCommands(ctx);
        }
        return nlpCommands;
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
