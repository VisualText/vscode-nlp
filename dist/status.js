"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NLPStatusBar = exports.nlpStatusBar = exports.FiredMode = exports.DevMode = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const path = tslib_1.__importStar(require("path"));
const visualText_1 = require("./visualText");
const treeFile_1 = require("./treeFile");
const textFile_1 = require("./textFile");
const os = tslib_1.__importStar(require("os"));
const fs = tslib_1.__importStar(require("fs"));
let nlpStatusBarRun;
let nlpStatusBarText;
let nlpStatusBarDev;
let nlpStatusBarFired;
let nlpStatusBarEngineVersion;
let nlpStatusBarVisualTextVersion;
let nlpStatusBarFilesVersion;
let nlpStatusBarAnalyzersVersion;
var DevMode;
(function (DevMode) {
    DevMode[DevMode["NORMAL"] = 0] = "NORMAL";
    DevMode[DevMode["DEV"] = 1] = "DEV";
    DevMode[DevMode["SILENT"] = 2] = "SILENT";
})(DevMode || (exports.DevMode = DevMode = {}));
var FiredMode;
(function (FiredMode) {
    FiredMode[FiredMode["BUILT"] = 0] = "BUILT";
    FiredMode[FiredMode["FIRED"] = 1] = "FIRED";
})(FiredMode || (exports.FiredMode = FiredMode = {}));
class NLPStatusBar {
    constructor(ctx) {
        this.logFile = new treeFile_1.TreeFile();
        this._ctx = ctx;
        this.devMode = DevMode.DEV;
        this.firedMode = FiredMode.FIRED;
        nlpStatusBarRun = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
        nlpStatusBarRun.text = `$(run)`;
        nlpStatusBarRun.tooltip = 'Analyze the text';
        nlpStatusBarRun.command = 'status.clickedAnalyzerButton';
        nlpStatusBarRun.show();
        nlpStatusBarText = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 19);
        nlpStatusBarText.tooltip = 'Current text to analyze';
        nlpStatusBarText.command = 'textView.openText';
        nlpStatusBarText.show();
        nlpStatusBarDev = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 18);
        nlpStatusBarDev.tooltip = 'Development settings';
        nlpStatusBarDev.command = 'status.chooseDev';
        nlpStatusBarDev.show();
        nlpStatusBarFired = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 17);
        nlpStatusBarFired.tooltip = 'Fired settings';
        nlpStatusBarFired.command = 'status.chooseFired';
        nlpStatusBarFired.show();
        nlpStatusBarEngineVersion = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE - 1);
        nlpStatusBarEngineVersion.tooltip = 'NLP Engine Version';
        nlpStatusBarEngineVersion.command = 'status.openEngineVersionSettings';
        nlpStatusBarEngineVersion.show();
        nlpStatusBarVisualTextVersion = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE - 2);
        nlpStatusBarVisualTextVersion.tooltip = 'VisualText Version';
        nlpStatusBarVisualTextVersion.command = 'status.openVisualTextVersionSettings';
        nlpStatusBarVisualTextVersion.show();
        nlpStatusBarAnalyzersVersion = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE - 3);
        nlpStatusBarAnalyzersVersion.tooltip = 'Analyzers Version';
        nlpStatusBarAnalyzersVersion.command = 'status.openAnalyzerVersionSettings';
        nlpStatusBarAnalyzersVersion.show();
        nlpStatusBarFilesVersion = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE - 4);
        nlpStatusBarFilesVersion.tooltip = 'VisualText Files Version';
        nlpStatusBarFilesVersion.command = 'status.openFilesVersionSettings';
        nlpStatusBarFilesVersion.show();
        this.update();
        vscode.commands.registerCommand('status.update', () => this.update());
        vscode.commands.registerCommand('status.chooseDev', () => this.chooseDev());
        vscode.commands.registerCommand('status.chooseFired', () => this.chooseFired());
        vscode.commands.registerCommand('status.openEngineVersionSettings', () => this.openEngineVersionSettings());
        vscode.commands.registerCommand('status.openVisualTextVersionSettings', () => this.openVisualTextVersionSettings());
        vscode.commands.registerCommand('status.openFilesVersionSettings', () => this.openFilesVersionSettings());
        vscode.commands.registerCommand('status.openAnalyzerVersionSettings', () => this.openAnalyzersVersionSettings());
        vscode.commands.registerCommand('status.clickedAnalyzerButton', () => this.clickedAnalyzerButton());
    }
    static attach(ctx) {
        if (!exports.nlpStatusBar) {
            exports.nlpStatusBar = new NLPStatusBar(ctx);
        }
        return exports.nlpStatusBar;
    }
    clickedAnalyzerButton() {
        this.analyzerButton(true);
    }
    resetAnalyzerButton() {
        nlpStatusBarRun.text = `$(run)`;
        nlpStatusBarRun.tooltip = 'Analyze the text';
        visualText_1.visualText.processID = 0;
    }
    analyzerButton(statusBarClick = true) {
        if (visualText_1.visualText.processID) {
            let taskKill = "";
            const exe = visualText_1.visualText.NLP_EXE;
            switch (os.platform()) {
                case 'win32':
                    taskKill = `taskkill /IM "${exe}" /F`;
                    break;
                default:
                    taskKill = `pkill -f "${exe}"`;
            }
            const cp = require('child_process');
            cp.exec(taskKill);
            this.resetAnalyzerButton();
        }
        else {
            nlpStatusBarRun.text = `$(chrome-close)`;
            nlpStatusBarRun.tooltip = 'Stop analyzer';
            if (statusBarClick)
                vscode.commands.executeCommand('textView.analyzerCurrent');
        }
    }
    openVisualTextVersionSettings() {
        const filepath = path.join(visualText_1.visualText.extensionDirectory().fsPath, 'CHANGELOG.md');
        if (fs.existsSync(filepath)) {
            vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(filepath));
        }
        else {
            const url = 'https://github.com/VisualText/vscode-nlp/blob/master/CHANGELOG.md';
            vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
        }
    }
    openFilesVersionSettings() {
        const url = 'https://github.com/VisualText/visualtext-files/pulls?q=is%3Apr+is%3Aclosed';
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
        visualText_1.visualText.checkVTFilesVersion(visualText_1.visualText.emptyOp());
    }
    openAnalyzersVersionSettings() {
        const url = 'https://github.com/VisualText/analyzers/pulls?q=is%3Apr+is%3Aclosed';
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
        visualText_1.visualText.checkAnalyzersVersion(visualText_1.visualText.emptyOp());
    }
    openEngineVersionSettings() {
        const url = 'https://github.com/VisualText/nlp-engine/pulls?q=is%3Apr+is%3Aclosed';
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
        visualText_1.visualText.startUpdater();
    }
    chooseDev() {
        const items = [];
        items.push({ label: 'All logging on', description: 'generate all log files when analyzing' });
        items.push({ label: 'Final logs only', description: 'generate the final log files when analyzing' });
        items.push({ label: 'All logging off', description: 'do not generate any log files when analyzing' });
        vscode.window.showQuickPick(items, { title: 'Log Files Mode', canPickMany: false, placeHolder: 'Choose a mode' }).then(selection => {
            if (!selection) {
                return;
            }
            let mode = DevMode.NORMAL;
            if (selection.label === 'All logging on')
                mode = DevMode.DEV;
            else if (selection.label === 'Final logs only')
                mode = DevMode.NORMAL;
            else
                mode = DevMode.SILENT;
            exports.nlpStatusBar.setDevState(mode);
        });
    }
    chooseFired() {
        const items = [];
        items.push({ label: 'Display Built Only', description: 'Display only built rules matched' });
        items.push({ label: 'Display All Matches', description: 'Display all fired rules matched' });
        vscode.window.showQuickPick(items, { title: 'Display Type', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
            if (!selection) {
                return;
            }
            const mode = selection.label === 'Display Built Only' ? FiredMode.BUILT : FiredMode.FIRED;
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
            nlpStatusBarDev.text = 'Logs All On';
        }
        else if (this.devMode == DevMode.SILENT) {
            nlpStatusBarDev.text = 'Logs All Off';
        }
        else {
            nlpStatusBarDev.text = 'Logs Final Only';
        }
    }
    getFiredMode() {
        return this.firedMode;
    }
    setFiredState(firedMode) {
        const changed = this.firedMode == firedMode ? false : true;
        this.firedMode = firedMode;
        this.updateFiredState();
        this.logFile.updateTxxtFiles(textFile_1.nlpFileType.TXXT);
        vscode.commands.executeCommand('sequenceView.refreshAll');
    }
    updateFiredState() {
        if (this.firedMode == FiredMode.BUILT) {
            nlpStatusBarFired.text = 'Display Built Only';
        }
        else {
            nlpStatusBarFired.text = 'Display All Fired';
        }
    }
    update() {
        if (visualText_1.visualText.analyzer.hasText()) {
            const filepath = visualText_1.visualText.analyzer.getTextPath().fsPath;
            const namepath = path.basename(filepath);
            nlpStatusBarText.text = namepath;
            nlpStatusBarText.show();
            this.updateDevState();
            this.updateFiredState();
            nlpStatusBarDev.show();
        }
        this.updateEngineVersion('');
        this.updateVisualTextVersion('');
        this.updateFilesVersion('');
        this.updateAnalyzerssVersion('');
    }
    updateEngineVersion(version) {
        if (version != undefined && version.length) {
            nlpStatusBarEngineVersion.text = version;
        }
        else if (visualText_1.visualText.exeEngineVersion.length) {
            nlpStatusBarEngineVersion.text = visualText_1.visualText.exeEngineVersion;
        }
        else {
            nlpStatusBarEngineVersion.text = '';
        }
    }
    updateVisualTextVersion(version) {
        if (version != undefined && version.length) {
            nlpStatusBarVisualTextVersion.text = version;
        }
        else if (visualText_1.visualText.version.length) {
            nlpStatusBarVisualTextVersion.text = visualText_1.visualText.version;
        }
        else {
            nlpStatusBarVisualTextVersion.text = '';
        }
    }
    updateFilesVersion(version) {
        if (version != undefined && version.length) {
            nlpStatusBarFilesVersion.text = version;
        }
        else if (visualText_1.visualText.repoVTFilesVersion.length) {
            nlpStatusBarFilesVersion.text = visualText_1.visualText.repoVTFilesVersion;
        }
        else {
            nlpStatusBarFilesVersion.text = '';
        }
    }
    updateAnalyzerssVersion(version) {
        if (version != undefined && version.length) {
            nlpStatusBarAnalyzersVersion.text = version;
        }
        else if (visualText_1.visualText.repoAnalyzersVersion.length) {
            nlpStatusBarAnalyzersVersion.text = visualText_1.visualText.repoAnalyzersVersion;
        }
        else {
            nlpStatusBarAnalyzersVersion.text = '';
        }
    }
}
exports.NLPStatusBar = NLPStatusBar;
//# sourceMappingURL=status.js.map