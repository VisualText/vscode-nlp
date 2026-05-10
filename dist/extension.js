"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const visualText_1 = require("./visualText");
const analyzerView_1 = require("./analyzerView");
const command_1 = require("./command");
const sequenceView_1 = require("./sequenceView");
const textView_1 = require("./textView");
const kbView_1 = require("./kbView");
const outputView_1 = require("./outputView");
const findView_1 = require("./findView");
const helpView_1 = require("./helpView");
const logView_1 = require("./logView");
const status_1 = require("./status");
const visualText_2 = require("./visualText");
function activate(ctx) {
    textView_1.TextView.attach(ctx);
    logView_1.LogView.attach(ctx);
    visualText_1.VisualText.attach(ctx);
    analyzerView_1.AnalyzerView.attach(ctx);
    outputView_1.OutputView.attach(ctx);
    sequenceView_1.SequenceView.attach(ctx);
    kbView_1.KBView.attach(ctx);
    findView_1.FindView.attach(ctx);
    helpView_1.HelpView.attach(ctx);
    command_1.NLPCommands.attach(ctx);
    status_1.NLPStatusBar.attach(ctx);
    vscode.commands.executeCommand('setContext', 'textView.fastload', visualText_2.visualText.getTextFastLoad());
    if (visualText_2.visualText.getAutoUpdate())
        visualText_2.visualText.startUpdater();
    else
        visualText_2.visualText.debugMessage("Auto update on reload is off");
}
//# sourceMappingURL=extension.js.map