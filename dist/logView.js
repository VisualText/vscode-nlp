"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogView = exports.logView = exports.OutputTreeDataProvider = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const visualText_1 = require("./visualText");
const textFile_1 = require("./textFile");
class OutputTreeDataProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh(logItem) {
        this._onDidChangeTreeData.fire(logItem);
    }
    getTreeItem(logItem) {
        return {
            label: logItem.label,
            resourceUri: logItem.uri,
            collapsibleState: void 0,
            command: {
                command: 'logView.openFile',
                arguments: [logItem],
                title: 'Open File with Error'
            },
            iconPath: {
                light: path.join(__filename, '..', '..', 'resources', 'dark', logItem.icon),
                dark: path.join(__filename, '..', '..', 'resources', 'dark', logItem.icon)
            }
        };
    }
    getChildren(element) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            return exports.logView.getLogs();
        }
        return [];
    }
}
exports.OutputTreeDataProvider = OutputTreeDataProvider;
class LogView {
    constructor(context) {
        this.logs = new Array();
        const logViewProvider = new OutputTreeDataProvider();
        this.logView = vscode.window.createTreeView('logView', { treeDataProvider: logViewProvider });
        vscode.commands.registerCommand('logView.refreshAll', (resource) => logViewProvider.refresh(resource));
        vscode.commands.registerCommand('logView.openFile', (resource) => this.openFile(resource));
        vscode.commands.registerCommand('logView.addMessage', (message, uri) => this.addMessage(message, uri));
        vscode.commands.registerCommand('logView.conceptualGrammar', () => this.loadCGLog());
        vscode.commands.registerCommand('logView.timing', () => this.loadTimingLog());
        vscode.commands.registerCommand('logView.makeAna', () => this.loadMakeAna());
        vscode.commands.registerCommand('logView.clear', () => this.clearLogs());
    }
    static attach(ctx) {
        if (!exports.logView) {
            exports.logView = new LogView(ctx);
        }
        return exports.logView;
    }
    loadTimingLog() {
        this.clearLogs();
        var cgFile = vscode.Uri.file(path.join(visualText_1.visualText.analyzer.getOutputDirectory().path, 'dbg.log'));
        this.addLogFile(cgFile);
    }
    loadCGLog() {
        this.clearLogs();
        this.addLogFile(visualText_1.visualText.analyzer.logFile('cgerr'));
    }
    loadMakeAna() {
        this.clearLogs();
        var errorLog = vscode.Uri.file(path.join(visualText_1.visualText.analyzer.getOutputDirectory().path, 'err.log'));
        this.addLogFile(errorLog);
        this.addLogFile(visualText_1.visualText.analyzer.logFile('make_ana'));
    }
    clearLogs() {
        this.logs = [];
        vscode.commands.executeCommand('logView.refreshAll');
    }
    addMessage(message, uri) {
        this.logs.push(this.messageLine(message, uri));
    }
    addLogFile(logFileName) {
        if (fs.existsSync(logFileName.path)) {
            const logFile = new textFile_1.TextFile(logFileName.path);
            for (let line of logFile.getLines()) {
                line = line.substr(0, line.length - 1);
                if (line.length) {
                    let log = this.parseLogLine(line);
                    this.logs.push(log);
                }
            }
        }
    }
    getLogs() {
        return this.logs;
    }
    messageLine(label, uri) {
        return ({ label: label, uri: uri, passNum: 0, line: 0, icon: 'arrow-small-right.svg' });
    }
    parseLogLine(line) {
        var uri = vscode.Uri.file('');
        var passNum = 0;
        var lineNum = -1;
        var icon = 'arrow-small-right.svg';
        if (line.length) {
            let tokens = line.split(/[\t\s]/, 2);
            if (tokens.length >= 2) {
                var seqFile = visualText_1.visualText.analyzer.seqFile;
                passNum = +tokens[0];
                if (passNum) {
                    uri = seqFile.getUriByPassNumber(passNum);
                    icon = 'gear.svg';
                }
                lineNum = +tokens[1];
            }
        }
        return ({ label: line, uri: uri, passNum: passNum, line: lineNum, icon: icon });
    }
    openFile(logItem) {
        if (logItem.passNum) {
            var seqFile = visualText_1.visualText.analyzer.seqFile;
            var passFile = seqFile.getUriByPassNumber(logItem.passNum);
            vscode.window.showTextDocument(logItem.uri).then(editor => {
                var pos = new vscode.Position(logItem.line - 1, 0);
                editor.selections = [new vscode.Selection(pos, pos)];
                var range = new vscode.Range(pos, pos);
                editor.revealRange(range);
            });
        }
        else if (logItem.uri.path.length) {
            vscode.window.showTextDocument(logItem.uri);
        }
    }
}
exports.LogView = LogView;
//# sourceMappingURL=logView.js.map