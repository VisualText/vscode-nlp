"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;
const visualText_1 = require("./visualText");
const analyzerView_1 = require("./analyzerView");
const command_1 = require("./command");
const sequenceView_1 = require("./sequenceView");
const textView_1 = require("./textView");
const outputView_1 = require("./outputView");
const findView_1 = require("./findView");
const helpView_1 = require("./helpView");
const logView_1 = require("./logView");
const status_1 = require("./status");
function activate(ctx) {
    visualText_1.VisualText.attach(ctx);
    analyzerView_1.AnalyzerView.attach(ctx);
    textView_1.TextView.attach(ctx);
    outputView_1.OutputView.attach(ctx);
    sequenceView_1.SequenceView.attach(ctx);
    findView_1.FindView.attach(ctx);
    logView_1.LogView.attach(ctx);
    helpView_1.HelpView.attach(ctx);
    command_1.NLPCommands.attach(ctx);
    status_1.NLPStatusBar.attach(ctx);
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map