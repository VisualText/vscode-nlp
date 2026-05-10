"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogView = exports.logView = exports.OutputTreeDataProvider = exports.logLineType = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const fs = tslib_1.__importStar(require("fs"));
const path = tslib_1.__importStar(require("path"));
const visualText_1 = require("./visualText");
const textFile_1 = require("./textFile");
const dirfuncs_1 = require("./dirfuncs");
var logLineType;
(function (logLineType) {
    logLineType[logLineType["UNKNOWN"] = 0] = "UNKNOWN";
    logLineType[logLineType["INFO"] = 1] = "INFO";
    logLineType[logLineType["UPDATER"] = 2] = "UPDATER";
    logLineType[logLineType["FILE_OP"] = 3] = "FILE_OP";
    logLineType[logLineType["ANALYER_OUTPUT"] = 4] = "ANALYER_OUTPUT";
    logLineType[logLineType["LOGFILE"] = 5] = "LOGFILE";
    logLineType[logLineType["SEQUENCE"] = 6] = "SEQUENCE";
    logLineType[logLineType["SYNTAX_ERROR"] = 7] = "SYNTAX_ERROR";
    logLineType[logLineType["DOWNLOAD_ERROR"] = 8] = "DOWNLOAD_ERROR";
    logLineType[logLineType["OPEN_PATH"] = 9] = "OPEN_PATH";
    logLineType[logLineType["UPDATER_TIMEOUT"] = 10] = "UPDATER_TIMEOUT";
    logLineType[logLineType["JSON_ERROR"] = 11] = "JSON_ERROR";
    logLineType[logLineType["WARNING"] = 12] = "WARNING";
    logLineType[logLineType["FAILURE"] = 13] = "FAILURE";
})(logLineType || (exports.logLineType = logLineType = {}));
class OutputTreeDataProvider {
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
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
                light: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'dark', logItem.icon)),
                dark: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'dark', logItem.icon))
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
        vscode.commands.registerCommand('logView.refreshAll', () => logViewProvider.refresh());
        vscode.commands.registerCommand('logView.openFile', (resource) => this.openFile(resource));
        vscode.commands.registerCommand('logView.addMessage', (message, type, uri) => this.addMessage(message, type, uri));
        vscode.commands.registerCommand('logView.conceptualGrammar', () => this.loadCGLog());
        vscode.commands.registerCommand('logView.timing', () => this.loadTimingLog());
        vscode.commands.registerCommand('logView.makeAna', () => this.makeAna());
        vscode.commands.registerCommand('logView.clear', () => this.clearLogs());
        vscode.commands.registerCommand('logView.stopFileOps', () => this.stopFileOps());
        vscode.commands.registerCommand('logView.stopUpdater', () => this.stopUpdater());
        vscode.commands.registerCommand('logView.exploreEngineDir', () => this.exploreEngineDir());
        vscode.commands.registerCommand('logView.downloadHelp', () => this.downloadHelp());
        vscode.commands.registerCommand('logView.updaterHelp', () => this.updaterHelp());
        vscode.commands.registerCommand('logView.checkUpdates', () => this.checkUpdates());
        vscode.commands.registerCommand('logView.updateDebug', () => this.updateDebug());
        vscode.commands.registerCommand('logView.analyzerOuts', () => this.loadAnalyzerOuts());
        vscode.commands.registerCommand('logView.enginePath', () => this.enginePath());
        this.exists = false;
        this.ctx = context;
        this.panel = undefined;
    }
    static attach(ctx) {
        if (!exports.logView) {
            exports.logView = new LogView(ctx);
        }
        return exports.logView;
    }
    enginePath() {
        const dir = visualText_1.visualText.engineDirectory();
        vscode.env.clipboard.writeText(dir.fsPath);
    }
    updateDebug() {
        const items = [];
        const arfirm = 'Turn ON update debugging';
        items.push({ label: arfirm, description: 'display extra details of updating for debugging purposes' });
        items.push({ label: 'Turn OFF update debugging', description: 'do not display debugging info for updating' });
        vscode.window.showQuickPick(items, { title: 'Debugging Output', canPickMany: false, placeHolder: 'Choose ON or Off' }).then(selection => {
            if (!selection) {
                return;
            }
            visualText_1.visualText.debug = selection.label === arfirm ? true : false;
        });
    }
    stopUpdater() {
        visualText_1.visualText.stopUpdater();
    }
    checkUpdates() {
        visualText_1.visualText.startUpdater(false);
    }
    downloadHelp() {
        visualText_1.visualText.displayHelpFile('Download Help', 'DOWNLOADHELP.html');
    }
    updaterHelp() {
        visualText_1.visualText.displayHelpFile('Updater Help', 'UPDATERHELP.html');
    }
    loadAnalyzerOuts() {
        this.clearLogs();
        const outputDir = path.join(visualText_1.visualText.getCurrentAnalyzer().fsPath, "output");
        const outFile = vscode.Uri.file(path.join(outputDir, 'stdout.log'));
        const errFile = vscode.Uri.file(path.join(outputDir, 'stderr.log'));
        this.addMessage('STD OUT FILE: ' + errFile.fsPath, logLineType.ANALYER_OUTPUT, errFile);
        this.addLogFile(outFile, logLineType.ANALYER_OUTPUT, '   ');
        this.addMessage('ERROR FILE: ' + errFile.fsPath, logLineType.ANALYER_OUTPUT, errFile);
        this.addLogFile(errFile, logLineType.ANALYER_OUTPUT, '   ');
    }
    loadTimingLog() {
        this.clearLogs();
        const cgFile = visualText_1.visualText.analyzer.getOutputDirectory('dbg.log');
        this.addLogFile(cgFile, logLineType.LOGFILE);
    }
    loadCGLog() {
        this.clearLogs();
        this.addLogFile(visualText_1.visualText.analyzer.treeFile('cgerr'), logLineType.LOGFILE);
    }
    makeAna() {
        this.clearLogs();
        let errFlag = false;
        if (exports.logView.syntaxErrorsLog('cgerr'))
            errFlag = exports.logView.addLogFile(visualText_1.visualText.analyzer.treeFile('cgerr'), logLineType.LOGFILE, '', true);
        return errFlag || this.loadMakeAna();
    }
    loadMakeAna() {
        const errorLog = visualText_1.visualText.analyzer.getOutputDirectory('err.log');
        const errFlag = this.addLogFile(errorLog, logLineType.LOGFILE);
        const makeFlag = this.addLogFile(visualText_1.visualText.analyzer.treeFile('make_ana'), logLineType.LOGFILE, '', true, true);
        return errFlag || makeFlag;
    }
    syntaxErrorsOutput(filename) {
        const errorLog = visualText_1.visualText.analyzer.getOutputDirectory(filename);
        return this.syntaxErrors(errorLog);
    }
    syntaxErrorsLog(filename) {
        const errorLog = visualText_1.visualText.analyzer.treeFile(filename);
        return this.syntaxErrors(errorLog);
    }
    syntaxErrors(filepath) {
        const logFile = new textFile_1.TextFile(filepath.fsPath);
        for (const line of logFile.getLines()) {
            const parse = this.parseLogLine(line, logLineType.INFO, undefined);
            if (parse.type == logLineType.SYNTAX_ERROR)
                return true;
        }
        return false;
    }
    clearLogs(force = true) {
        const config = vscode.workspace.getConfiguration('logs');
        const clear = config.get('clear');
        if (force || clear) {
            this.logs = [];
            vscode.commands.executeCommand('logView.refreshAll');
        }
    }
    addMessage(message, type = logLineType.INFO, uri) {
        this.logs.push(this.parseLogLine(message, type, uri));
    }
    addLogFile(logFileName, type, spaces = '', onlySyntax = false, noClear = false) {
        if (fs.existsSync(logFileName.fsPath)) {
            if (!noClear)
                this.clearLogs(false);
            const logFile = new textFile_1.TextFile(logFileName.fsPath);
            for (let line of logFile.getLines()) {
                line = line.substring(0, line.length);
                if (line.length) {
                    const logItem = this.parseLogLine(spaces + line, type, undefined);
                    if (!onlySyntax || logItem.type == logLineType.SYNTAX_ERROR)
                        this.logs.push(logItem);
                }
            }
            return true;
        }
        return false;
    }
    getLogs() {
        return this.logs;
    }
    parseLogLine(line, type = logLineType.UNKNOWN, uri) {
        let passNum = 0;
        let lineNum = -1;
        let icon = this.typeIcon(type);
        let firstTwoNumbers = false;
        if (uri && type == logLineType.UNKNOWN)
            type = logLineType.OPEN_PATH;
        const lineTrimmed = line.trim();
        if (lineTrimmed.startsWith('[') && lineTrimmed.endsWith(']')) {
            line = line.replace('[', '');
            line = line.replace(']', '');
        }
        let tokens = lineTrimmed.split(/[\t\s]/, 5);
        if (tokens.length >= 2) {
            passNum = +tokens[0];
            lineNum = +tokens[1];
            if (!isNaN(passNum) && lineNum != 0 && passNum >= 0) {
                firstTwoNumbers = true;
            }
        }
        if (line.length) {
            if (firstTwoNumbers) {
                if (lineTrimmed.endsWith('.dict]')) {
                    tokens = line.split(/[\t\s\]]/);
                    const filename = tokens[tokens.length - 2];
                    const filePath = path.join(visualText_1.visualText.analyzer.getKBDirectory().fsPath, filename);
                    uri = vscode.Uri.file(filePath);
                    type = logLineType.SYNTAX_ERROR;
                    icon = this.typeIcon(logLineType.SYNTAX_ERROR);
                }
                else if (visualText_1.visualText.analyzer.isLoaded()) {
                    const seqFile = visualText_1.visualText.analyzer.seqFile;
                    uri = seqFile.getUriByPassNumber(passNum);
                    if (lineTrimmed.toLocaleLowerCase().indexOf("ignor") >= 0) {
                        type = logLineType.WARNING;
                        icon = this.typeIcon(logLineType.WARNING);
                    }
                    else {
                        type = logLineType.SYNTAX_ERROR;
                        icon = this.typeIcon(logLineType.SYNTAX_ERROR);
                    }
                }
            }
            else if (line.startsWith('FAILED download')) {
                type = logLineType.DOWNLOAD_ERROR;
            }
            else if (line.startsWith('Jason file error:')) {
                type = logLineType.JSON_ERROR;
            }
            else if (line.startsWith('Updater timed out')) {
                type = logLineType.UPDATER_TIMEOUT;
            }
            else if (line.indexOf("Unhandled") >= 0) {
                type = logLineType.SYNTAX_ERROR;
            }
        }
        if (!uri) {
            const i = line.lastIndexOf(' ');
            if (i >= 0) {
                const pather = line.substring(i + 1, line.length);
                if (fs.existsSync(pather)) {
                    type = logLineType.OPEN_PATH;
                    uri = vscode.Uri.file(pather);
                }
            }
        }
        if (line.indexOf("Warning") >= 0 || line.indexOf("Unhandled") >= 0 || type == logLineType.WARNING) {
            icon = 'yield.svg';
        }
        return ({ label: line, uri: uri, passNum: passNum, line: lineNum, icon: icon, type: type });
    }
    // INFO, UPDATER, FILE_OP, ANALYER_OUTPUT, LOGFILE, SEQUENCE, SYNTAX_ERROR, DOWNLOAD_ERROR, OPEN_PATH, UPDATER_TIMEOUT, JSON_ERROR
    typeIcon(type) {
        let icon = 'dot.svg';
        switch (type) {
            case logLineType.UPDATER:
                icon = 'update.svg';
                break;
            case logLineType.ANALYER_OUTPUT:
                icon = 'gear.svg';
                break;
            case logLineType.SEQUENCE:
                icon = 'dna.svg';
                break;
            case logLineType.LOGFILE:
                icon = 'log.svg';
                break;
            case logLineType.FILE_OP:
                icon = 'file.svg';
                break;
            case logLineType.JSON_ERROR:
            case logLineType.SYNTAX_ERROR:
            case logLineType.DOWNLOAD_ERROR:
                icon = 'error.svg';
                break;
        }
        return icon;
    }
    openFile(logItem) {
        const line = logItem.label;
        visualText_1.visualText.colorizeAnalyzer();
        switch (logItem.type) {
            case logLineType.SYNTAX_ERROR:
                const seqFile = visualText_1.visualText.analyzer.seqFile;
                if (logItem.uri) {
                    vscode.window.showTextDocument(logItem.uri).then(editor => {
                        const pos = new vscode.Position(logItem.line - 1, 0);
                        editor.selections = [new vscode.Selection(pos, pos)];
                        const range = new vscode.Range(pos, pos);
                        editor.revealRange(range);
                    });
                }
                break;
            case logLineType.UPDATER_TIMEOUT:
                this.updaterHelp();
                break;
            case logLineType.DOWNLOAD_ERROR:
                this.downloadHelp();
                break;
            case logLineType.OPEN_PATH:
                if (logItem.uri) {
                    if (dirfuncs_1.dirfuncs.isDir(logItem.uri.fsPath)) {
                        visualText_1.visualText.openFileManager(logItem.uri.fsPath);
                    }
                    else if (fs.existsSync(logItem.uri.fsPath)) {
                        vscode.window.showTextDocument(logItem.uri);
                    }
                }
                break;
            case logLineType.JSON_ERROR:
                const pos = line.indexOf('.json');
                const filepath = line.substring(18, pos + 5);
                const msg = 'Json error(s) in file: ' + filepath;
                vscode.window.showErrorMessage(msg, "Click to fix file").then(response => {
                    vscode.window.showTextDocument(vscode.Uri.file(filepath));
                });
                break;
            default:
                if (logItem.uri) {
                    vscode.window.showTextDocument(logItem.uri);
                }
        }
    }
    updateTitle(message) {
        if (message.length)
            this.logView.title = `LOGGING (${message})`;
        else
            this.logView.title = 'LOGGING';
    }
    stopFileOps() {
        visualText_1.visualText.stopFileOps();
    }
    exploreEngineDir() {
        const dir = visualText_1.visualText.engineDirectory();
        visualText_1.visualText.openFileManager(dir.fsPath);
    }
}
exports.LogView = LogView;
//# sourceMappingURL=logView.js.map