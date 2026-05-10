"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NLPStatusBar = exports.nlpStatusBar = exports.FiredMode = exports.DevMode = void 0;
const vscode = require("vscode");
const path = require("path");
const visualText_1 = require("./visualText");
const logfile_1 = require("./logfile");
const textFile_1 = require("./textFile");
let nlpStatusBarRun;
let nlpStatusBarText;
let nlpStatusBarDev;
let nlpStatusBarFired;
var DevMode;
(function (DevMode) {
    DevMode[DevMode["NORMAL"] = 0] = "NORMAL";
    DevMode[DevMode["DEV"] = 1] = "DEV";
})(DevMode = exports.DevMode || (exports.DevMode = {}));
var FiredMode;
(function (FiredMode) {
    FiredMode[FiredMode["BUILT"] = 0] = "BUILT";
    FiredMode[FiredMode["FIRED"] = 1] = "FIRED";
})(FiredMode = exports.FiredMode || (exports.FiredMode = {}));
class NLPStatusBar {
    constructor(ctx) {
        this.logFile = new logfile_1.LogFile();
        this._ctx = ctx;
        this.devMode = DevMode.DEV;
        this.firedMode = FiredMode.FIRED;
        nlpStatusBarRun = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
        nlpStatusBarRun.text = `$(run)`;
        nlpStatusBarRun.tooltip = 'Analyze the text';
        nlpStatusBarRun.command = "textView.analyzeLast";
        nlpStatusBarRun.show();
        nlpStatusBarText = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 19);
        nlpStatusBarText.tooltip = 'Current text to analyze';
        nlpStatusBarText.command = "textView.openText";
        nlpStatusBarText.show();
        nlpStatusBarDev = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 18);
        nlpStatusBarDev.tooltip = 'Development settings';
        nlpStatusBarDev.command = "status.chooseDev";
        nlpStatusBarDev.show();
        nlpStatusBarFired = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 17);
        nlpStatusBarFired.tooltip = 'Fired settings';
        nlpStatusBarFired.command = "status.chooseFired";
        nlpStatusBarFired.show();
        this.update();
        vscode.commands.registerCommand('status.update', () => this.update());
        vscode.commands.registerCommand('status.chooseDev', () => this.chooseDev());
        vscode.commands.registerCommand('status.chooseFired', () => this.chooseFired());
    }
    static attach(ctx) {
        if (!exports.nlpStatusBar) {
            exports.nlpStatusBar = new NLPStatusBar(ctx);
        }
        return exports.nlpStatusBar;
    }
    chooseDev() {
        let items = [];
        items.push({ label: 'Log files', description: 'DO generate log files when analyzing' });
        items.push({ label: 'No log files', description: 'DO NOT generate log files when analyzing' });
        vscode.window.showQuickPick(items).then(selection => {
            if (!selection) {
                return;
            }
            var mode = selection.label === 'Log files' ? DevMode.DEV : DevMode.NORMAL;
            exports.nlpStatusBar.setDevState(mode);
        });
    }
    chooseFired() {
        let items = [];
        items.push({ label: 'Display Built Only', description: 'Display only built rules matched' });
        items.push({ label: 'Display All Matches', description: 'Display all fired rules matched' });
        vscode.window.showQuickPick(items).then(selection => {
            if (!selection) {
                return;
            }
            var mode = selection.label === 'Display Built Only' ? FiredMode.BUILT : FiredMode.FIRED;
            exports.nlpStatusBar.setFiredState(mode);
        });
    }
    getDevMode() {
        return this.devMode;
    }
    setDevState(devMode) {
        this.devMode = devMode;
        this.updateDevState();
    }
    updateDevState() {
        if (this.devMode == DevMode.DEV) {
            nlpStatusBarDev.text = "Log Files On";
        }
        else {
            nlpStatusBarDev.text = "Log Files Off";
        }
    }
    getFiredMode() {
        return this.firedMode;
    }
    setFiredState(firedMode) {
        var changed = this.firedMode == firedMode ? false : true;
        this.firedMode = firedMode;
        this.updateFiredState();
        this.logFile.updateTxxtFiles(textFile_1.nlpFileType.TXXT);
        vscode.commands.executeCommand('sequenceView.refreshAll');
    }
    updateFiredState() {
        if (this.firedMode == FiredMode.BUILT) {
            nlpStatusBarFired.text = "Display Built Only";
        }
        else {
            nlpStatusBarFired.text = "Display All Fired";
        }
    }
    update() {
        if (visualText_1.visualText.analyzer.hasText()) {
            var filepath = visualText_1.visualText.analyzer.getTextPath().path;
            var namepath = path.basename(filepath);
            nlpStatusBarText.text = namepath;
            nlpStatusBarText.show();
            this.updateDevState();
            this.updateFiredState();
            nlpStatusBarDev.show();
        }
    }
}
exports.NLPStatusBar = NLPStatusBar;
//# sourceMappingURL=status.js.map