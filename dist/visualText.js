"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisualText = exports.visualText = exports.upPush = exports.upComp = exports.upType = exports.upOp = exports.upStat = void 0;
exports.closeFileIfOpen = closeFileIfOpen;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const path = tslib_1.__importStar(require("path"));
const fs = tslib_1.__importStar(require("fs"));
const os = tslib_1.__importStar(require("os"));
const analyzer_1 = require("./analyzer");
const dirfuncs_1 = require("./dirfuncs");
const jsonState_1 = require("./jsonState");
const status_1 = require("./status");
const logView_1 = require("./logView");
const fileOps_1 = require("./fileOps");
const nlp_1 = require("./nlp");
const modFile_1 = require("./modFile");
const sequence_1 = require("./sequence");
const textFile_1 = require("./textFile");
var upStat;
(function (upStat) {
    upStat[upStat["UNKNOWN"] = 0] = "UNKNOWN";
    upStat[upStat["START"] = 1] = "START";
    upStat[upStat["RUNNING"] = 2] = "RUNNING";
    upStat[upStat["CANCEL"] = 3] = "CANCEL";
    upStat[upStat["FAILED"] = 4] = "FAILED";
    upStat[upStat["DONE"] = 5] = "DONE";
})(upStat || (exports.upStat = upStat = {}));
var upOp;
(function (upOp) {
    upOp[upOp["UNKNOWN"] = 0] = "UNKNOWN";
    upOp[upOp["CHECK_EXISTS"] = 1] = "CHECK_EXISTS";
    upOp[upOp["VERSION"] = 2] = "VERSION";
    upOp[upOp["DOWNLOAD"] = 3] = "DOWNLOAD";
    upOp[upOp["UNZIP"] = 4] = "UNZIP";
    upOp[upOp["DELETE"] = 5] = "DELETE";
    upOp[upOp["FAILED"] = 6] = "FAILED";
    upOp[upOp["DONE"] = 7] = "DONE";
})(upOp || (exports.upOp = upOp = {}));
var upType;
(function (upType) {
    upType[upType["UNKNOWN"] = 0] = "UNKNOWN";
    upType[upType["VERSION"] = 1] = "VERSION";
    upType[upType["DOWNLOAD"] = 2] = "DOWNLOAD";
    upType[upType["DELETE"] = 3] = "DELETE";
    upType[upType["UNZIP"] = 4] = "UNZIP";
})(upType || (exports.upType = upType = {}));
var upComp;
(function (upComp) {
    upComp[upComp["UNKNOWN"] = 0] = "UNKNOWN";
    upComp[upComp["ICU1"] = 1] = "ICU1";
    upComp[upComp["ICU2"] = 2] = "ICU2";
    upComp[upComp["NLP_EXE"] = 3] = "NLP_EXE";
    upComp[upComp["ENGINE_FILES"] = 4] = "ENGINE_FILES";
    upComp[upComp["ANALYZER_FILES"] = 5] = "ANALYZER_FILES";
    upComp[upComp["VT_FILES"] = 6] = "VT_FILES";
})(upComp || (exports.upComp = upComp = {}));
var upPush;
(function (upPush) {
    upPush[upPush["FRONT"] = 0] = "FRONT";
    upPush[upPush["BACK"] = 1] = "BACK";
})(upPush || (exports.upPush = upPush = {}));
// HOW TO CALL IT
//(async() => { await closeFileIfOpen(original); })();
function closeFileIfOpen(file) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        const tabs = vscode.window.tabGroups.all.map(tg => tg.tabs).flat();
        const index = tabs.findIndex(tab => tab.input instanceof vscode.TabInputText && tab.input.uri.path === file.path);
        if (index !== -1) {
            yield vscode.window.tabGroups.close(tabs[index]);
        }
    });
}
class VisualText {
    ;
    constructor(ctx) {
        this.opsQueue = new Array();
        this.statusStrs = ['UNKNOWN', 'START', 'RUNNING', 'CANCEL', 'FAILED', 'DONE'];
        this.opStrs = ['UNKNOWN', 'CHECK_EXISTS', 'VERSION', 'DOWNLOAD', 'UNZIP', 'DELETE', 'FAILED', 'DONE'];
        this.compStrs = ['UNKNOWN', 'ICU1', 'ICU2', 'NLP_EXE', 'ENGINE_FILES', 'ANALYZER_FILES', 'VT_FILES'];
        this.LOG_SUFFIX = '_log';
        this.TEST_SUFFIX = '_test';
        this.EXTENSION_NAME = 'dehilster.nlp';
        this.NLP_EXE = 'nlp.exe';
        this.ICU1_WIN = 'icudt74.dll';
        this.ICU2_WIN = 'icuuc74.dll';
        this.NLPENGINE_FILES_ASSET = 'nlpengine.zip';
        this.NLPENGINE_REPO = 'nlp-engine';
        this.VISUALTEXT_FILES_REPO = 'visualtext-files';
        this.ANALYZERS_REPO = 'analyzers';
        this.VISUALTEXT_FILES_ASSET = 'visualtext.zip';
        this.ANALYZERS_ASSET = 'analyzers.zip';
        this.ANALYZER_SEQUENCE_FILE = 'analyzer.seq';
        this.ANALYZER_SEQUENCE_FOLDER = 'spec';
        this.GITHUB_REPOSITORY = 'https://github.com/VisualText/';
        this.GITHUB_RELEASE_LATEST = '/releases/latest/';
        this.GITHUB_RELEASE_LATEST_DOWNLOAD = '/releases/latest/download/';
        this.GITHUB_ENGINE_LATEST_RELEASE = this.GITHUB_REPOSITORY + this.NLPENGINE_REPO + this.GITHUB_RELEASE_LATEST_DOWNLOAD;
        this.GITHUB_ENGINE_LATEST_VERSION = this.GITHUB_REPOSITORY + this.NLPENGINE_REPO + this.GITHUB_RELEASE_LATEST;
        this.GITHUB_VISUALTEXT_FILES_LATEST_VERSION = this.GITHUB_REPOSITORY + this.VISUALTEXT_FILES_REPO + this.GITHUB_RELEASE_LATEST;
        this.GITHUB_ANALYZERS_LATEST_VERSION = this.GITHUB_REPOSITORY + this.ANALYZERS_REPO + this.GITHUB_RELEASE_LATEST;
        this.analyzer = new analyzer_1.Analyzer();
        this.fileOps = new fileOps_1.FileOps();
        this.nlp = new nlp_1.NLPFile();
        this.mod = new modFile_1.ModFile();
        this.modFiles = new Array();
        this.version = '';
        this.engineVersion = '';
        this.exeEngineVersion = '';
        this.repoEngineVersion = '';
        this.vtFilesVersion = '';
        this.repoVTFilesVersion = '';
        this.analyzersVersion = '';
        this.repoAnalyzersVersion = '';
        this.engineDir = vscode.Uri.file('');
        this.askModify = false;
        this.processID = 0;
        this.stopAll = false;
        this.debug = false;
        this.fastAnswered = false;
        this.autoUpdateFlag = false;
        this.platform = '';
        this.homeDir = '';
        this.username = '';
        this.jsonState = new jsonState_1.JsonState();
        this.analyzers = new Array();
        this.libraryFiles = new Array();
        this.extensionDir = vscode.Uri.file('');
        this.analyzerDir = vscode.Uri.file('');
        this.currentAnalyzer = vscode.Uri.file('');
        this.workspaceFold = vscode.Uri.file('');
        this.modFile = vscode.Uri.file('');
        this.extensionItems = new Array();
        this.latestExtIndex = 0;
        this.lastestEngineIndex = 0;
        this.updaterID = 0;
        this.testItem = { fileCount: 0, matchFiles: 0, matchLines: 0, misFiles: 0, misLines: 0 };
        this._ctx = ctx;
    }
    static attach(ctx) {
        if (!exports.visualText) {
            exports.visualText = new VisualText(ctx);
            if (vscode.workspace.workspaceFolders) {
                exports.visualText.workspaceFold = vscode.workspace.workspaceFolders[0].uri;
            }
            exports.visualText.platform = os.platform();
            exports.visualText.homeDir = os.homedir();
            exports.visualText.readConfig();
            exports.visualText.readState();
            exports.visualText.getExtensionDirs();
            exports.visualText.initSettings();
        }
        return exports.visualText;
    }
    editTestFiles(uri, outputPathFlag = false) {
        if (exports.visualText.getWorkspaceFolder()) {
            const testFolder = this.analyzer.testFolder(uri, outputPathFlag);
            const files = dirfuncs_1.dirfuncs.getFiles(testFolder);
            if (files.length > 1) {
                const items = [];
                for (const file of files) {
                    items.push({ label: path.basename(file.fsPath), description: file.fsPath });
                }
                const title = 'Edit Test Files';
                const placeHolder = 'Choose test file to edit';
                vscode.window.showQuickPick(items, { title, canPickMany: false, placeHolder: placeHolder }).then(selection => {
                    if (!selection || !selection.description)
                        return;
                    if (selection.description)
                        vscode.window.showTextDocument(vscode.Uri.file(selection.description));
                });
            }
            else {
                vscode.window.showTextDocument(vscode.Uri.file(files[0].fsPath));
            }
        }
    }
    regressionTestFile() {
        return path.join(exports.visualText.analyzer.getKBDirectory().fsPath, 'regression.test');
    }
    testInit() {
        this.testItem = { fileCount: 0, matchFiles: 0, matchLines: 0, misFiles: 0, misLines: 0 };
    }
    closeTest() {
        const regressFile = this.regressionTestFile();
        let content = fs.readFileSync(regressFile, 'utf8');
        let header = 'Files: ' + this.testItem.fileCount + '\n';
        header += 'File matches: ' + this.testItem.matchFiles + '\n';
        header += 'File mismatches: ' + this.testItem.misFiles + '\n';
        header += 'Total line matches: ' + this.testItem.matchLines + '\n';
        header += 'Total line mismatches: ' + this.testItem.misLines + '\n';
        header += '\n\n';
        content = header + content;
        fs.writeFileSync(regressFile, content, 'utf8');
    }
    runTest(textFile) {
        const inputDir = exports.visualText.analyzer.getInputDirectory().fsPath;
        const relPath = textFile.fsPath.substring(inputDir.length + 1, textFile.fsPath.length);
        const outputFolder = path.join(inputDir, relPath + exports.visualText.LOG_SUFFIX);
        const testFolder = path.join(inputDir, relPath + exports.visualText.TEST_SUFFIX);
        const files = dirfuncs_1.dirfuncs.getFiles(vscode.Uri.file(testFolder));
        for (const testFile of files) {
            const outputFile = path.join(outputFolder, path.basename(testFile.fsPath));
            if (fs.existsSync(outputFile)) {
                this.testDiff(path.basename(textFile.fsPath), outputFile, testFile.fsPath);
            }
        }
        // vscode.commands.executeCommand("vscode.diff", testFolder, uri);
    }
    testDiff(textFile, file, testFile) {
        const testResults = this.regressionTestFile();
        const fileText = new textFile_1.TextFile(file);
        const testText = new textFile_1.TextFile(testFile);
        const numLines = testText.getLines().length;
        let match = 0;
        let mismatch = 0;
        let report = '';
        let mismatches = '';
        for (let i = 0; i < numLines; i++) {
            const lineFile = fileText.getLines()[i];
            const lineTest = testText.getLines()[i];
            if (lineFile == lineTest) {
                match++;
            }
            else {
                mismatch++;
                mismatches += lineFile + '\n' + lineTest + '\n\n';
            }
        }
        report = textFile + ' Linesss: ' + numLines + ' ' + 'Matches: ' + match + ' ' + 'Mismatches: ' + mismatch + '\n';
        if (mismatches.length)
            report += mismatches + '\n';
        this.testItem.fileCount++;
        this.testItem.matchLines += match;
        this.testItem.misLines += mismatch;
        if (mismatch) {
            this.testItem.misFiles++;
        }
        else {
            this.testItem.matchFiles++;
        }
        fs.appendFileSync(testResults, report);
    }
    setModFile(filePath) {
        this.mod.setFile(filePath);
    }
    modExists() {
        return this.mod.fileExists();
    }
    startUpdater(preInfoFlag = true) {
        var _a;
        if (this.updaterID == 0) {
            logView_1.logView.clearLogs(false);
            this.platform = os.platform();
            const plat = this.platform == 'darwin' ? 'mac' : this.platform;
            this.homeDir = os.homedir();
            const rootPath = this.getLatestExtPath(this.extensionParentDirectory());
            if (rootPath)
                this.extensionDir = vscode.Uri.file(rootPath);
            this.version = (_a = vscode.extensions.getExtension(this.EXTENSION_NAME)) === null || _a === void 0 ? void 0 : _a.packageJSON.version;
            if (preInfoFlag) {
                this.debugMessage('Platform: ' + plat, logView_1.logLineType.UPDATER);
                this.debugMessage('User profile path: ' + this.homeDir, logView_1.logLineType.UPDATER);
                this.debugMessage('VSCode NLP++ Extension path: ' + this.extensionDir.fsPath, logView_1.logLineType.UPDATER);
            }
            this.debugMessage('Checking for updates or repairs...', logView_1.logLineType.UPDATER);
            this.pushCheckVersions();
            this.startTimer();
        }
    }
    startTimer() {
        if (this.updaterID == 0) {
            this.updaterID = +setInterval(this.updaterTimer, 1000);
        }
    }
    stopUpdater() {
        this.debugMessage('STOP requested by user', logView_1.logLineType.UPDATER);
        for (const o of exports.visualText.opsQueue) {
            if (o.status != upStat.RUNNING) {
                o.status = upStat.DONE;
            }
        }
        exports.visualText.stopAll = true;
    }
    pushCheckVersions() {
        exports.visualText.pushCheckEngineFiles();
        exports.visualText.pushCheckVTFiles();
        exports.visualText.pushCheckAnalyzerFiles();
    }
    pushCheckVTFiles() {
        const op = exports.visualText.emptyOp();
        exports.visualText.addUpdateOperation(op, upPush.BACK, upType.UNZIP, upStat.START, upOp.CHECK_EXISTS, upComp.VT_FILES);
    }
    pushCheckAnalyzerFiles() {
        const op = exports.visualText.emptyOp();
        exports.visualText.addUpdateOperation(op, upPush.BACK, upType.UNZIP, upStat.START, upOp.CHECK_EXISTS, upComp.ANALYZER_FILES);
    }
    pushCheckEngineFiles() {
        const op = exports.visualText.emptyOp();
        if (exports.visualText.platform == 'win32') {
            exports.visualText.addUpdateOperation(op, upPush.BACK, upType.DOWNLOAD, upStat.START, upOp.CHECK_EXISTS, upComp.ICU1);
            exports.visualText.addUpdateOperation(op, upPush.BACK, upType.DOWNLOAD, upStat.START, upOp.CHECK_EXISTS, upComp.ICU2);
        }
        exports.visualText.addUpdateOperation(op, upPush.BACK, upType.DOWNLOAD, upStat.START, upOp.CHECK_EXISTS, upComp.NLP_EXE);
        exports.visualText.addUpdateOperation(op, upPush.BACK, upType.UNZIP, upStat.START, upOp.CHECK_EXISTS, upComp.ENGINE_FILES);
    }
    pushDeleteEngineFiles(op, push) {
        if (exports.visualText.platform == 'win32') {
            exports.visualText.addUpdateOperation(op, push, upType.DELETE, upStat.START, upOp.DELETE, upComp.ICU1);
            exports.visualText.addUpdateOperation(op, push, upType.DELETE, upStat.START, upOp.DELETE, upComp.ICU2);
        }
        exports.visualText.addUpdateOperation(op, push, upType.DELETE, upStat.START, upOp.DELETE, upComp.NLP_EXE);
        exports.visualText.addUpdateOperation(op, push, upType.DELETE, upStat.START, upOp.DELETE, upComp.ENGINE_FILES);
    }
    pushDeleteVTFiles(op, push) {
        exports.visualText.addUpdateOperation(op, push, upType.DELETE, upStat.START, upOp.DELETE, upComp.VT_FILES);
    }
    pushDeleteAnalyzers(op, push) {
        exports.visualText.addUpdateOperation(op, push, upType.DELETE, upStat.START, upOp.DELETE, upComp.ANALYZER_FILES);
    }
    pushDownloadEngineFiles(op, push) {
        exports.visualText.addUpdateOperation(op, push, upType.UNZIP, upStat.START, upOp.DOWNLOAD, upComp.ENGINE_FILES);
        exports.visualText.addUpdateOperation(op, push, upType.DOWNLOAD, upStat.START, upOp.DOWNLOAD, upComp.NLP_EXE);
        if (exports.visualText.platform == 'win32') {
            exports.visualText.addUpdateOperation(op, push, upType.DOWNLOAD, upStat.START, upOp.DOWNLOAD, upComp.ICU2);
            exports.visualText.addUpdateOperation(op, push, upType.DOWNLOAD, upStat.START, upOp.DOWNLOAD, upComp.ICU1);
        }
    }
    pushDownloadVTFiles(op, push) {
        exports.visualText.addUpdateOperation(op, push, upType.UNZIP, upStat.START, upOp.DOWNLOAD, upComp.VT_FILES);
    }
    pushDownloadAnalyzers(op, push) {
        exports.visualText.addUpdateOperation(op, push, upType.UNZIP, upStat.START, upOp.DOWNLOAD, upComp.ANALYZER_FILES);
    }
    addUpdateOperation(opIn, push, type, status, operation, component) {
        const op = { type: type, status: status, operation: operation, component: component, remote: '', local: '', folders: [], version: opIn.version };
        switch (component) {
            case upComp.ICU1:
            case upComp.ICU2:
                exports.visualText.libFilenames(op);
                break;
            case upComp.NLP_EXE:
                exports.visualText.nlpExe(op);
                break;
            case upComp.ENGINE_FILES:
                exports.visualText.zipFiles(op, exports.visualText.NLPENGINE_REPO, '', exports.visualText.NLPENGINE_FILES_ASSET, ['data']);
                break;
            case upComp.VT_FILES:
                exports.visualText.zipFiles(op, exports.visualText.VISUALTEXT_FILES_REPO, 'visualText', exports.visualText.VISUALTEXT_FILES_ASSET, [exports.visualText.ANALYZER_SEQUENCE_FOLDER, 'Help', 'analyzers']);
                break;
            case upComp.ANALYZER_FILES:
                exports.visualText.zipFiles(op, exports.visualText.ANALYZERS_REPO, 'analyzers', exports.visualText.ANALYZERS_ASSET, ['']);
                break;
        }
        if (push == upPush.BACK)
            this.opsQueue.push(op);
        else
            this.opsQueue.unshift(op);
    }
    zipFiles(op, repo, folder, download, folders) {
        op.remote = exports.visualText.GITHUB_REPOSITORY + repo + exports.visualText.GITHUB_RELEASE_LATEST_DOWNLOAD + download;
        const engDir = exports.visualText.engineDirectory().fsPath;
        op.local = path.join(engDir, folder, download);
        op.folders = [];
        for (const f of folders) {
            op.folders.push(path.join(folder, f));
        }
    }
    nlpExe(op) {
        let exe = '';
        switch (exports.visualText.platform) {
            case 'win32':
                exe = 'nlpw.exe';
                break;
            case 'darwin':
                exe = 'nlpm.exe';
                break;
            default:
                exe = 'nlpl.exe';
        }
        op.remote = exports.visualText.GITHUB_ENGINE_LATEST_RELEASE + exe;
        const engDir = exports.visualText.engineDirectory().fsPath;
        op.local = path.join(engDir, exports.visualText.NLP_EXE);
    }
    libFilenames(op) {
        let libRelease = '';
        let lib = '';
        const icu1 = op.component == upComp.ICU1 ? 1 : 0;
        switch (exports.visualText.platform) {
            case 'win32':
                libRelease = icu1 ? exports.visualText.ICU1_WIN : exports.visualText.ICU2_WIN;
                lib = icu1 ? exports.visualText.ICU1_WIN : exports.visualText.ICU2_WIN;
                break;
        }
        op.remote = exports.visualText.GITHUB_ENGINE_LATEST_RELEASE + libRelease;
        const engDir = exports.visualText.engineDirectory().fsPath;
        op.local = path.join(engDir, lib);
    }
    getLatestExtPath(dir) {
        const files = dirfuncs_1.dirfuncs.getFiles(dir);
        for (const file of files.reverse()) {
            const filename = path.basename(file.fsPath);
            if (filename.startsWith(this.EXTENSION_NAME)) {
                this.version = this.versionFromPath(file);
                return file.fsPath;
            }
        }
        return '';
    }
    updaterTimer() {
        let op = exports.visualText.opsQueue[0];
        const q = exports.visualText.opsQueue;
        let allDone = true;
        for (const o of exports.visualText.opsQueue) {
            if (exports.visualText.stopAll) {
                if (o.status == upStat.RUNNING)
                    allDone = false;
                else
                    o.status = upStat.DONE;
            }
            else {
                if (o.status == upStat.UNKNOWN || o.status == upStat.START || o.status == upStat.RUNNING) {
                    op = o;
                    allDone = false;
                    break;
                }
                else if (o.status != upStat.FAILED && o.status != upStat.CANCEL && o.status != upStat.DONE) {
                    allDone = false;
                }
            }
        }
        if (allDone) {
            vscode.commands.executeCommand('setContext', 'updating.running', false);
            exports.visualText.opsQueue = [];
            clearInterval(exports.visualText.updaterID);
            exports.visualText.updaterID = 0;
            if (exports.visualText.stopAll)
                exports.visualText.debugMessage('UPDATE STOPPED BY USER', logView_1.logLineType.UPDATER);
            else
                exports.visualText.debugMessage('UPDATE CHECK COMPLETE', logView_1.logLineType.UPDATER);
            exports.visualText.stopAll = false;
            vscode.commands.executeCommand('status.update');
            return;
        }
        else {
            vscode.commands.executeCommand('setContext', 'updating.running', true);
        }
        if (exports.visualText.stopAll)
            return;
        if (exports.visualText.debug)
            exports.visualText.debugMessage(exports.visualText.statusStrs[op.status] + ' ' + exports.visualText.opStrs[op.operation] + ' ' + exports.visualText.compStrs[op.component], logView_1.logLineType.UPDATER);
        switch (op.status) {
            case upStat.START:
                switch (op.operation) {
                    case upOp.CHECK_EXISTS:
                        const endDir = path.join(exports.visualText.getExtensionPath().fsPath, exports.visualText.NLPENGINE_REPO);
                        if (op.folders.length && endDir) {
                            let missingOne = false;
                            for (const folder of op.folders) {
                                const f = path.join(endDir, folder);
                                if (!fs.existsSync(f)) {
                                    missingOne = true;
                                    break;
                                }
                            }
                            if (!missingOne) {
                                if (exports.visualText.isCompVersion(op))
                                    op.operation = upOp.VERSION;
                                else
                                    op.status = upStat.DONE;
                            }
                            else {
                                op.operation = upOp.DOWNLOAD;
                            }
                        }
                        else if (fs.existsSync(op.local)) {
                            if (exports.visualText.isCompVersion(op))
                                op.operation = upOp.VERSION;
                            else
                                op.status = upStat.DONE;
                        }
                        else {
                            op.operation = upOp.DOWNLOAD;
                        }
                        break;
                    case upOp.DOWNLOAD:
                        if (fs.existsSync(op.local)) {
                            if (op.type == upType.UNZIP) {
                                op.operation = upOp.UNZIP;
                            }
                            else {
                                op.status = upStat.DONE;
                            }
                        }
                        else {
                            op.status = upStat.RUNNING;
                            exports.visualText.download(op);
                        }
                        break;
                    case upOp.DELETE:
                        if (fs.existsSync(op.local)) {
                            exports.visualText.debugMessage('Deleting: ' + op.local, logView_1.logLineType.UPDATER);
                            fs.unlinkSync(op.local);
                        }
                        if (op.folders.length) {
                            for (const folder of op.folders) {
                                const f = path.join(path.dirname(op.local), folder);
                                if (fs.existsSync(f)) {
                                    dirfuncs_1.dirfuncs.delDir(f);
                                }
                            }
                        }
                        op.status = upStat.DONE;
                        break;
                    case upOp.UNZIP:
                        op.status = upStat.RUNNING;
                        exports.visualText.unzip(op);
                        break;
                    case upOp.VERSION:
                        if (op.version.length) {
                            exports.visualText.updateVersion(op);
                            op.status = upStat.DONE;
                        }
                        else {
                            switch (op.component) {
                                case upComp.NLP_EXE:
                                    exports.visualText.checkExeVersion(op);
                                    break;
                                case upComp.VT_FILES:
                                    exports.visualText.checkVTFilesVersion(op);
                                    break;
                                case upComp.ANALYZER_FILES:
                                    if (exports.visualText.debug)
                                        exports.visualText.debugMessage('VERSION CHECK: Analyzers', logView_1.logLineType.UPDATER);
                                    exports.visualText.checkAnalyzersVersion(op);
                                    break;
                            }
                        }
                        break;
                }
                break;
            case upStat.RUNNING:
                const donothing = 1;
                break;
        }
    }
    isCompVersion(op) {
        return op.component == upComp.NLP_EXE || op.component == upComp.VT_FILES || op.component == upComp.ANALYZER_FILES;
    }
    emptyOp() {
        return { type: upType.UNKNOWN, status: upStat.UNKNOWN, operation: upOp.UNKNOWN, component: upComp.UNKNOWN, remote: '', local: '', folders: [], version: '' };
    }
    updateVersion(op) {
        switch (op.component) {
            case upComp.NLP_EXE:
                status_1.nlpStatusBar.updateEngineVersion(op.version);
                break;
            case upComp.VT_FILES:
                status_1.nlpStatusBar.updateFilesVersion(op.version);
                exports.visualText.setVTFilesVersion(op.version);
                break;
            case upComp.ANALYZER_FILES:
                status_1.nlpStatusBar.updateAnalyzerssVersion(op.version);
                exports.visualText.setAnalyzersVersion(op.version);
                break;
        }
    }
    checkExeVersion(op) {
        var _a;
        (_a = exports.visualText.fetchExeVersion(op)) === null || _a === void 0 ? void 0 : _a.then(version => {
            exports.visualText.checkEngineVersionRepo(op)
                .then(newerVersion => {
                if (newerVersion) {
                    exports.visualText.pushDownloadEngineFiles(op, upPush.FRONT);
                    exports.visualText.pushDeleteEngineFiles(op, upPush.FRONT);
                }
                op.status = upStat.DONE;
                exports.visualText.updateVersion(op);
            });
        }).catch(error => {
            op.status = upStat.FAILED;
        });
        op.status = upStat.RUNNING;
    }
    checkEngineVersionRepo(op) {
        return new Promise((resolve, reject) => {
            const https = require('follow-redirects').https;
            const request = https.get(this.GITHUB_ENGINE_LATEST_VERSION, function (res) {
                res.on('data', function (chunk) {
                    let newer = false;
                    if (op.status != upStat.DONE) {
                        const url = res.responseUrl;
                        exports.visualText.repoEngineVersion = url.substring(url.lastIndexOf('/') + 1);
                        const exeVersion = exports.visualText.exeEngineVersion;
                        const repoVersion = exports.visualText.repoEngineVersion;
                        op.version = exports.visualText.repoEngineVersion;
                        if (exports.visualText.debug)
                            exports.visualText.debugMessage('NLP.EXE Versions: ' + exeVersion + ' == ' + repoVersion, logView_1.logLineType.UPDATER);
                        if (exeVersion && repoVersion) {
                            if (exports.visualText.versionCompare(repoVersion, exeVersion) > 0) {
                                newer = true;
                            }
                        }
                        else {
                            newer = true;
                        }
                        op.status = upStat.DONE;
                    }
                    resolve(newer);
                });
            }).on('error', function (err) {
                reject(err);
            });
            request.end();
        });
    }
    checkVTFilesVersion(op) {
        const statusFlag = op.status == upStat.UNKNOWN ? true : false;
        exports.visualText.checkVTFilesVersionRepo(op)
            .then(newerVersion => {
            if (newerVersion) {
                exports.visualText.pushDownloadVTFiles(op, upPush.FRONT);
                exports.visualText.pushDeleteVTFiles(op, upPush.FRONT);
                if (statusFlag) {
                    op.component = upComp.VT_FILES;
                    exports.visualText.startTimer();
                }
            }
            else if (statusFlag) {
                vscode.window.showInformationMessage('VisualText files verion ' + exports.visualText.repoVTFilesVersion + ' is the latest');
            }
            op.status = upStat.DONE;
            exports.visualText.updateVersion(op);
        });
    }
    checkVTFilesVersionRepo(op) {
        return new Promise((resolve, reject) => {
            const https = require('follow-redirects').https;
            const request = https.get(this.GITHUB_VISUALTEXT_FILES_LATEST_VERSION, function (res) {
                res.on('data', function (chunk) {
                    let newer = false;
                    if (op.status != upStat.DONE) {
                        const url = res.responseUrl;
                        exports.visualText.repoVTFilesVersion = url.substring(url.lastIndexOf('/') + 1);
                        op.version = exports.visualText.repoVTFilesVersion;
                        const currentVersion = exports.visualText.getVTFilesVersion();
                        if (exports.visualText.debug)
                            exports.visualText.debugMessage('VisualText Files Versions: ' + currentVersion + ' == ' + exports.visualText.repoVTFilesVersion, logView_1.logLineType.UPDATER);
                        if (currentVersion) {
                            exports.visualText.vtFilesVersion = currentVersion;
                            if (exports.visualText.versionCompare(exports.visualText.repoVTFilesVersion, currentVersion) > 0) {
                                newer = true;
                            }
                        }
                        else {
                            newer = true;
                        }
                        op.status = upStat.DONE;
                    }
                    resolve(newer);
                });
            }).on('error', function (err) {
                reject(err);
            });
            request.end();
        });
    }
    checkAnalyzersVersion(op) {
        const statusFlag = op.status == upStat.UNKNOWN ? true : false;
        exports.visualText.checkAnalyzersVersionRepo(op)
            .then(newerVersion => {
            if (newerVersion) {
                exports.visualText.setAnalyzersVersion(exports.visualText.repoAnalyzersVersion);
                exports.visualText.pushDownloadAnalyzers(op, upPush.FRONT);
                exports.visualText.pushDeleteAnalyzers(op, upPush.FRONT);
                op.status = upStat.DONE;
                exports.visualText.updateVersion(op);
            }
            else if (statusFlag) {
                vscode.window.showInformationMessage('Analyzers verion ' + exports.visualText.repoAnalyzersVersion + ' is the latest');
            }
            op.status = upStat.DONE;
            exports.visualText.updateVersion(op);
        });
    }
    checkAnalyzersVersionRepo(op) {
        return new Promise((resolve, reject) => {
            const https = require('follow-redirects').https;
            const request = https.get(this.GITHUB_ANALYZERS_LATEST_VERSION, function (res) {
                res.on('data', function (chunk) {
                    let newer = false;
                    if (op.status != upStat.DONE) {
                        const url = res.responseUrl;
                        exports.visualText.repoAnalyzersVersion = url.substring(url.lastIndexOf('/') + 1);
                        op.version = exports.visualText.repoAnalyzersVersion;
                        const currentVersion = exports.visualText.getAnalyzersVersion();
                        if (exports.visualText.debug)
                            exports.visualText.debugMessage('Analyzers Versions: ' + currentVersion + ' == ' + exports.visualText.repoAnalyzersVersion, logView_1.logLineType.UPDATER);
                        if (currentVersion) {
                            exports.visualText.analyzersVersion = currentVersion;
                            if (exports.visualText.versionCompare(exports.visualText.repoAnalyzersVersion, currentVersion) > 0) {
                                newer = true;
                            }
                        }
                        else {
                            newer = true;
                        }
                        op.status = upStat.DONE;
                    }
                    resolve(newer);
                });
            }).on('error', function (err) {
                reject(err);
            });
            request.end();
        });
    }
    download(op) {
        const Downloader = require('nodejs-file-downloader');
        (() => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const dir = path.dirname(op.local);
            const filename = path.basename(op.local);
            const url = op.remote;
            const downloader = new Downloader({
                url: url,
                directory: dir,
                filename: filename
            });
            try {
                exports.visualText.debugMessage('Downloading: ' + url, logView_1.logLineType.UPDATER);
                yield downloader.download();
                exports.visualText.debugMessage('DONE DOWNLOAD: ' + url, logView_1.logLineType.UPDATER);
                if (op.type == upType.UNZIP && !exports.visualText.stopAll) {
                    op.operation = upOp.UNZIP;
                    op.status = upStat.START;
                }
                else if (exports.visualText.isCompVersion(op)) {
                    op.operation = upOp.VERSION;
                    op.status = upStat.START;
                }
                else {
                    op.status = upStat.DONE;
                }
            }
            catch (error) {
                op.status = upStat.FAILED;
                exports.visualText.debugMessage('FAILED download: ' + url + '\n' + error, logView_1.logLineType.UPDATER);
            }
        }))();
    }
    unzip(op) {
        (() => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const toPath = op.local;
            const vtFileDir = path.dirname(op.local);
            const extract = require('extract-zip');
            try {
                this.debugMessage('Unzipping: ' + toPath, logView_1.logLineType.UPDATER);
                yield extract(toPath, { dir: vtFileDir });
                this.debugMessage('UNZIPPED: ' + toPath, logView_1.logLineType.UPDATER);
                op.status = upStat.DONE;
                dirfuncs_1.dirfuncs.delFile(toPath);
            }
            catch (err) {
                this.debugMessage('Could not unzip file: ' + toPath + '\n' + err, logView_1.logLineType.UPDATER);
                op.status = upStat.FAILED;
            }
        }))();
    }
    debugMessage(msg, type = logView_1.logLineType.INFO) {
        logView_1.logView.addMessage(msg, type, undefined);
        vscode.commands.executeCommand('logView.refreshAll');
    }
    readState() {
        if (vscode.workspace.workspaceFolders) {
            this.analyzerDir = this.workspaceFold;
            this.getAnalyzers(false);
            if (this.jsonState.jsonParse(this.analyzerDir, 'state')) {
                let saveit = false;
                const parse = this.jsonState.json.visualText[0];
                let currAnalyzer = parse.currentAnalyzer;
                if (currAnalyzer.length > 0 && !fs.existsSync(currAnalyzer)) {
                    this.setCurrentAnalyzer(vscode.Uri.file(''));
                }
                else if (currAnalyzer.length == 0) {
                    const analyzers = dirfuncs_1.dirfuncs.getDirectories(this.workspaceFold);
                    currAnalyzer = analyzers[0].fsPath;
                    saveit = true;
                }
                if (currAnalyzer) {
                    if (fs.existsSync(currAnalyzer))
                        this.currentAnalyzer = vscode.Uri.file(currAnalyzer);
                    else
                        this.currentAnalyzer = vscode.Uri.file(path.join(this.analyzerDir.fsPath, currAnalyzer));
                    if (saveit)
                        this.saveCurrentAnalyzer(this.analyzerDir);
                    this.loadAnalyzer(this.currentAnalyzer);
                    return true;
                }
            }
            else {
                this.saveCurrentAnalyzer(this.analyzerDir);
            }
        }
        return false;
    }
    initSettings() {
        const fromDir = path.join(exports.visualText.getExtensionPath().fsPath, '.vscode');
        if (fs.existsSync(fromDir)) {
            const toDir = path.join(this.analyzerDir.fsPath, '.vscode');
            if (!fs.existsSync(toDir)) {
                if (!dirfuncs_1.dirfuncs.copyDirectory(fromDir, toDir)) {
                    vscode.window.showWarningMessage('Copy settings file failed');
                    return false;
                }
                return true;
            }
            this.ensureExists('settings.json', toDir, fromDir);
            this.ensureExists('state.json', toDir, fromDir);
        }
        return false;
    }
    ensureExists(fileName, toDir, fromDir) {
        const toFile = path.join(toDir, fileName);
        if (!fs.existsSync(toFile)) {
            const fromFile = path.join(fromDir, fileName);
            fs.copyFileSync(fromFile, toFile);
        }
    }
    readConfig() {
        this.configAutoUpdate();
        this.configFindUsername();
        this.configAnalzyerDirectory();
        this.configCurrentAnalzyer();
    }
    configCurrentAnalzyer() {
        if (vscode.workspace.workspaceFolders) {
            const config = vscode.workspace.getConfiguration('analyzer', this.workspaceFold);
            const current = config.get('current');
            if (!current) {
                if (this.analyzers.length) {
                    this.currentAnalyzer = this.analyzers[0];
                    config.update('current', this.currentAnalyzer.fsPath, vscode.ConfigurationTarget.WorkspaceFolder);
                    this.debugMessage('Current analyzer: ' + this.currentAnalyzer.fsPath, logView_1.logLineType.UPDATER);
                }
            }
            else {
                this.currentAnalyzer = vscode.Uri.file(current);
            }
        }
    }
    configAnalzyerDirectory() {
        const config = vscode.workspace.getConfiguration('analyzer');
        let directory;
        if (vscode.workspace.workspaceFolders && dirfuncs_1.dirfuncs.analyzerFolderCount(this.workspaceFold)) {
            directory = this.workspaceFold.fsPath;
        }
        else {
            directory = config.get('directory') || '';
            if (!directory) {
                directory = path.join(this.engineDir.fsPath, 'analyzers');
            }
        }
        this.analyzerDir = vscode.Uri.file(directory);
        if (directory.length > 1)
            config.update('directory', directory, vscode.ConfigurationTarget.Global);
    }
    failedWarning() {
        vscode.window.showErrorMessage("Update failed", "Click here to see solutions").then(response => {
            logView_1.logView.downloadHelp();
        });
    }
    findExtensionIndex(engDir) {
        let index = 0;
        for (const ext of this.extensionItems) {
            exports.visualText.stopAll;
            if (engDir.startsWith(ext.uri.fsPath))
                break;
            index++;
        }
        return index;
    }
    versionFromPath(extDir) {
        const dir = extDir.fsPath;
        const version = dir.substring(dir.lastIndexOf(this.EXTENSION_NAME) + 1 + this.EXTENSION_NAME.length);
        return version;
    }
    versionCompare(version1, version2) {
        if (!version1.length || !version2.length)
            return 0;
        const toks1 = version1.split('.');
        const toks2 = version2.split('.');
        const num = toks1.length > toks2.length ? toks1.length : toks2.length;
        for (let i = 0; i < num; i++) {
            const v1 = parseInt(exports.visualText.trimV(toks1[i]));
            const v2 = parseInt(exports.visualText.trimV(toks2[i]));
            if (v1 > v2)
                return 1;
            if (v2 > v1)
                return -1;
        }
        return 0;
    }
    trimV(version) {
        let ret = version;
        if (version.substring(0, 1) == 'v') {
            ret = version.substring(1, version.length);
        }
        return ret;
    }
    exePath() {
        return vscode.Uri.file(path.join(exports.visualText.engineDirectory().fsPath, exports.visualText.NLP_EXE));
    }
    engineDirectory() {
        return vscode.Uri.file(path.join(this.extensionDirectory().fsPath, this.NLPENGINE_REPO));
    }
    extensionDirectory() {
        return vscode.Uri.file(path.join(this.extensionParentDirectory().fsPath, this.EXTENSION_NAME + '-' + this.version));
    }
    extensionParentDirectory() {
        let dir = path.join(this.homeDir, '.vscode', 'extensions');
        if (!fs.existsSync(dir)) {
            if (this.platform == 'linux') {
                dir = path.join(this.homeDir, '.vscode-server', 'extensions');
            }
        }
        return vscode.Uri.file(dir);
    }
    visualTextFilesDirectory() {
        return vscode.Uri.file(path.join(this.engineDirectory().fsPath, this.VISUALTEXT_FILES_REPO));
    }
    fetchExeVersion(op, debug = false) {
        dirfuncs_1.dirfuncs.changeMod(op.local, 755);
        exports.visualText.exeEngineVersion = '';
        const cp = require('child_process');
        return new Promise((resolve, reject) => {
            const child = cp.spawn(op.local, ['--version']);
            const stdOut = "";
            const stdErr = "";
            child.stdout.on("data", (data) => {
                const versionStr = data.toString();
                if (debug)
                    exports.visualText.debugMessage('version str: ' + versionStr, logView_1.logLineType.UPDATER);
                const tokens = versionStr.split('\r\n');
                if (tokens.length) {
                    if (tokens.length == 1)
                        exports.visualText.exeEngineVersion = versionStr;
                    else
                        exports.visualText.exeEngineVersion = tokens[tokens.length - 2];
                    if (debug)
                        exports.visualText.debugMessage('version found: ' + exports.visualText.exeEngineVersion, logView_1.logLineType.UPDATER);
                }
                resolve(exports.visualText.exeEngineVersion);
            });
        }).catch(err => {
            exports.visualText.debugMessage(err, logView_1.logLineType.UPDATER);
        });
    }
    getBlockAnalyzersPath() {
        return vscode.Uri.file(path.join(exports.visualText.getExtensionPath().fsPath, exports.visualText.NLPENGINE_REPO, exports.visualText.ANALYZERS_REPO));
    }
    getExtensionPath() {
        return this.extensionItems[this.latestExtIndex].uri;
    }
    getExtensionDirs() {
        const parentDir = this.extensionParentDirectory();
        let dirs = new Array();
        this.extensionItems = [];
        dirs = dirfuncs_1.dirfuncs.getDirectories(parentDir);
        let latestVersion = '';
        this.latestExtIndex = -1;
        let counter = 0;
        for (const dir of dirs) {
            const name = path.basename(dir.fsPath);
            if (name.startsWith(this.EXTENSION_NAME)) {
                const version = this.versionFromPath(dir);
                if (latestVersion.length == 0 || this.versionCompare(version, latestVersion) > 0) {
                    latestVersion = version;
                    this.latestExtIndex = counter;
                }
                this.extensionItems.push({ uri: dir, version: version, latest: false });
                counter++;
            }
        }
        if (this.latestExtIndex >= 0) {
            this.extensionItems[this.latestExtIndex].latest = true;
        }
    }
    setTextFastLoad(fastFlag) {
        this.autoUpdateFlag = fastFlag;
        const config = vscode.workspace.getConfiguration('textView');
        config.update('fast', fastFlag, vscode.ConfigurationTarget.Global);
        vscode.commands.executeCommand('setContext', 'textView.fastload', fastFlag);
    }
    getTextFastLoad() {
        const config = vscode.workspace.getConfiguration('textView');
        const version = config.get('visualText');
        return config.get('fast');
    }
    setAutoUpdate(autoUpdateFlag) {
        this.autoUpdateFlag = autoUpdateFlag;
        const config = vscode.workspace.getConfiguration('update');
        config.update('auto', autoUpdateFlag, vscode.ConfigurationTarget.Global);
    }
    getAutoUpdate() {
        const config = vscode.workspace.getConfiguration('update');
        const version = config.get('visualText');
        return config.get('auto');
    }
    configAutoUpdate() {
        this.autoUpdateFlag = this.getAutoUpdate();
    }
    setVTFilesVersion(version) {
        this.vtFilesVersion = version;
        const config = vscode.workspace.getConfiguration('engine');
        config.update('visualtext', version, vscode.ConfigurationTarget.Global);
    }
    getVTFilesVersion() {
        const config = vscode.workspace.getConfiguration('engine');
        const version = config.get('visualtext');
        return config.get('visualtext');
    }
    setAnalyzersVersion(version) {
        this.vtFilesVersion = version;
        const config = vscode.workspace.getConfiguration('engine');
        config.update('analyzers', version, vscode.ConfigurationTarget.Global);
    }
    getAnalyzersVersion() {
        const config = vscode.workspace.getConfiguration('engine');
        const version = config.get('analyzers');
        return config.get('analyzers');
    }
    configFindUsername() {
        const config = vscode.workspace.getConfiguration('user');
        const username = config.get('name');
        if (!username) {
            vscode.window.showErrorMessage("No user name for comments.", "Enter user name").then(response => {
                vscode.window.showInputBox({ value: 'Your Name', prompt: 'Enter author name for comments' }).then(username => {
                    if (username) {
                        exports.visualText.username = username;
                        config.update("name", username, vscode.ConfigurationTarget.Global);
                    }
                });
            });
        }
        else {
            this.username = username;
        }
    }
    saveCurrentAnalyzer(currentAnalyzer) {
        const stateJsonDefault = {
            "visualText": [
                {
                    "name": "Analyzer",
                    "type": "state",
                    "currentAnalyzer": currentAnalyzer.fsPath
                }
            ]
        };
        this.jsonState.saveFile(this.analyzerDir.fsPath, 'state', stateJsonDefault);
        this.setCurrentAnalyzer(currentAnalyzer);
    }
    loadAnalyzer(analyzerDirectory) {
        this.saveCurrentAnalyzer(analyzerDirectory);
        this.analyzer.load(analyzerDirectory);
        vscode.commands.executeCommand('textView.refreshAll');
        vscode.commands.executeCommand('sequenceView.refreshAll');
        vscode.commands.executeCommand('kbView.refreshAll');
        vscode.commands.executeCommand('outputView.refreshAll');
    }
    setCurrentAnalyzer(currentAnalyzer) {
        if (this.jsonState.json) {
            const parse = this.jsonState.json.visualText[0];
            parse.currentAnalyzer = currentAnalyzer.fsPath;
            this.jsonState.writeFile();
        }
    }
    getCurrentAnalyzer() {
        return this.currentAnalyzer;
    }
    getCurrentAnalyzerName() {
        return this.analyzer.getName();
    }
    hasAnalyzers() {
        return this.analyzers.length ? true : false;
    }
    getAnalyzerDir() {
        return this.analyzerDir;
    }
    getAnalyzers(testForLogs) {
        if (this.analyzerDir.fsPath.length) {
            this.analyzers = [];
            this.getAnalyzersRecursive(testForLogs, this.analyzerDir);
        }
        return this.analyzers;
    }
    getAnalyzersRecursive(testForLogs, dir) {
        if (dir.fsPath.length) {
            let anas = [];
            if (!fs.existsSync(dir.fsPath)) {
                dir = this.workspaceFold;
            }
            anas = dirfuncs_1.dirfuncs.getDirectories(dir);
            for (const ana of anas) {
                if (exports.visualText.isAnalyzerDirectory(ana)) {
                    if (!testForLogs || dirfuncs_1.dirfuncs.analyzerHasLogFiles(ana))
                        this.analyzers.push(ana);
                }
                else {
                    this.getAnalyzersRecursive(testForLogs, ana);
                }
            }
        }
    }
    hasWorkspaceFolder() {
        var _a;
        return ((_a = this.workspaceFold) === null || _a === void 0 ? void 0 : _a.fsPath.length) ? true : false;
    }
    getWorkspaceFolder() {
        if (this.workspaceFold) {
            return this.workspaceFold;
        }
        return vscode.Uri.file('');
    }
    visualTextDirectoryExists() {
        return fs.existsSync(this.getVisualTextDirectory());
    }
    getVisualTextDirectory(dirName = '') {
        let vtDir = '';
        const engineDir = this.engineDirectory().fsPath;
        const vtDirName = 'visualText';
        if (engineDir) {
            if (dirName.length)
                vtDir = path.join(engineDir, vtDirName, dirName);
            else
                vtDir = path.join(engineDir, vtDirName);
        }
        return vtDir;
    }
    isAnalyzerDirectory(dirPath) {
        const dirs = dirfuncs_1.dirfuncs.getDirectories(dirPath);
        let spec = false;
        let kb = false;
        let input = false;
        for (const dir of dirs) {
            if (path.basename(dir.fsPath).localeCompare(exports.visualText.ANALYZER_SEQUENCE_FOLDER) == 0) {
                spec = true;
            }
            else if (path.basename(dir.fsPath).localeCompare('kb') == 0) {
                kb = true;
            }
            else if (path.basename(dir.fsPath).localeCompare('input') == 0) {
                input = true;
            }
        }
        return spec && kb && input;
    }
    hasLogFiles(dirPath) {
        const dirs = dirfuncs_1.dirfuncs.getDirectories(dirPath);
        let spec = false;
        let kb = false;
        let input = false;
        let output = false;
        let logs = false;
        for (const dir of dirs) {
            const dirname = path.basename(dir.fsPath);
            if (dirname.localeCompare(exports.visualText.ANALYZER_SEQUENCE_FOLDER) == 0) {
                spec = true;
            }
            else if (dirname.localeCompare('kb') == 0) {
                kb = true;
            }
            else if (dirname.localeCompare('input') == 0) {
                input = true;
            }
            else if (dirname == 'output' && dirfuncs_1.dirfuncs.hasFiles(dir)) {
                output = true;
            }
            else if (dirname == 'logs' && dirfuncs_1.dirfuncs.hasFiles(dir)) {
                logs = true;
            }
        }
        return spec && kb && input && output && logs;
    }
    setUpdateEngine() {
        const uri = exports.visualText.getExtensionPath();
        if (uri) {
            this.debugMessage('NLP Engine updating version', logView_1.logLineType.UPDATER);
            return true;
        }
        return false;
    }
    updateEngine() {
        exports.visualText.pushDownloadEngineFiles(exports.visualText.emptyOp(), upPush.FRONT);
        exports.visualText.pushDeleteEngineFiles(exports.visualText.emptyOp(), upPush.FRONT);
        exports.visualText.startUpdater();
    }
    updateVTFiles() {
        exports.visualText.pushDeleteVTFiles(exports.visualText.emptyOp(), upPush.BACK);
        exports.visualText.pushDownloadVTFiles(exports.visualText.emptyOp(), upPush.BACK);
        this.startUpdater();
    }
    updateAnalyzersFiles() {
        exports.visualText.pushDeleteAnalyzers(exports.visualText.emptyOp(), upPush.BACK);
        exports.visualText.pushDownloadAnalyzers(exports.visualText.emptyOp(), upPush.BACK);
        this.startUpdater();
    }
    convertPatFiles(analyzerDir) {
        const spec = vscode.Uri.file(path.join(analyzerDir.fsPath, exports.visualText.ANALYZER_SEQUENCE_FOLDER));
        const op = exports.visualText.fileOps.addFileOperation(spec, spec, [fileOps_1.fileOpRefresh.ANALYZER], fileOps_1.fileOperation.RENAME, 'pat', 'nlp');
        op.oneOff = fileOps_1.fileOneOff.PAT_TO_NLP;
        exports.visualText.fileOps.startFileOps();
    }
    stopFileOps() {
        exports.visualText.fileOps.stopAll();
    }
    colorizeAnalyzer(overwrite = false) {
        if (vscode.workspace.workspaceFolders) {
            let add = false;
            const toDir = vscode.workspace.workspaceFolders[0].uri;
            const toFile = path.join(toDir.fsPath, '.vscode', 'settings.json');
            const fromDir = exports.visualText.extensionDirectory();
            const fromFile = path.join(fromDir.fsPath, '.vscode', 'settings.json');
            if (fs.existsSync(toFile)) {
                if (this.jsonState.jsonParse(toDir, 'settings')) {
                    if (!this.jsonState.json.hasOwnProperty('editor.tokenColorCustomizations')) {
                        const settingsObj1 = this.jsonState.json;
                        this.jsonState.jsonParse(fromDir, 'settings');
                        const settingsObj2 = this.jsonState.json;
                        const mergedObj = Object.assign(Object.assign({}, settingsObj1), settingsObj2);
                        this.jsonState.saveFile(toDir.fsPath, "settings", mergedObj);
                    }
                }
            }
            else
                add = true;
            if (add || overwrite) {
                dirfuncs_1.dirfuncs.copyFile(fromFile, toFile);
                this.debugMessage('Copying settings file with colorization: ' + fromFile + ' => ' + toFile, logView_1.logLineType.UPDATER);
            }
        }
    }
    openFileManager(dir) {
        let platformCmd = '';
        if (os.platform() == 'win32') {
            platformCmd = 'explorer.exe';
        }
        else if (os.platform() == 'linux') {
            platformCmd = 'xdg-open';
        }
        else if (os.platform() == 'darwin') {
            platformCmd = 'open';
        }
        if (platformCmd != '') {
            const cmd = platformCmd + ' ' + dir;
            const cp = require('child_process');
            cp.exec(cmd, (err, stdout, stderr) => {
                console.log('stdout: ' + stdout);
                console.log('stderr: ' + stderr);
            });
        }
        else {
            vscode.window.showInformationMessage('Couldn\'t open nlp engine folder');
        }
    }
    createPanel(title) {
        return vscode.window.createWebviewPanel('logView', title, {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: false
        });
    }
    displayHelpFile(title, filename) {
        const pathFile = path.join(exports.visualText.getVisualTextDirectory("Help"), "helps", filename);
        const mdFile = pathFile + ".md";
        const htmlFile = pathFile + ".htm";
        if (fs.existsSync(mdFile)) {
            vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(mdFile));
        }
        else if (fs.existsSync(htmlFile)) {
            this.displayHTML(title, fs.readFileSync(htmlFile, 'utf8'));
        }
    }
    displayHTML(title, html) {
        const panel = this.createPanel(title);
        if (panel) {
            panel.webview.html = html;
        }
    }
    fileIconFromExt(filepath) {
        const filename = path.basename(filepath);
        let icon = 'file.svg';
        if (filename.endsWith('.tree')) {
            icon = 'tree.svg';
        }
        else if (filename.endsWith('.log')) {
            icon = 'log.svg';
        }
        else if (filename.endsWith('.nlp') || filename.endsWith('.pat')) {
            icon = 'nlp.svg';
        }
        else if (filename.endsWith('.dict')) {
            icon = 'dict.svg';
        }
        else if (filename == 'main.kb') {
            icon = 'kb-main.svg';
        }
        else if (filename.endsWith('.kbb')) {
            icon = 'kbb.svg';
        }
        else if (filename.endsWith('.kb')) {
            icon = 'kb.svg';
        }
        else if (filename.endsWith('.txxt')) {
            icon = 'symbol-keyword.svg';
        }
        else if (filename.endsWith('.dict')) {
            icon = 'dict.svg';
        }
        else if (filename.endsWith('.nlm')) {
            icon = 'mod.svg';
        }
        else if (filename.endsWith('.test')) {
            icon = 'test.svg';
        }
        else if (filename.endsWith('.py')) {
            icon = 'python.svg';
        }
        else {
            icon = 'file.svg';
        }
        return icon;
    }
    analyzerList(subdir) {
        let dirs = [];
        if (subdir.length) {
            const pather = path.join(exports.visualText.getWorkspaceFolder().fsPath, subdir);
            dirs = dirfuncs_1.dirfuncs.getDirectories(vscode.Uri.file(pather));
        }
        else
            dirs = dirfuncs_1.dirfuncs.getDirectories(exports.visualText.getWorkspaceFolder());
        const items = [];
        for (const dir of dirs) {
            const filename = path.basename(dir.fsPath);
            items.push({ label: filename, description: dir.fsPath });
        }
        return items;
    }
    analyzerFolderList(specFlag = false) {
        const dirs = dirfuncs_1.dirfuncs.getDirectories(exports.visualText.getWorkspaceFolder());
        const items = [];
        return this.analyzerFolderListRecurse(exports.visualText.getWorkspaceFolder(), items, 0, specFlag);
    }
    analyzerFolderListRecurse(dir, items, level = 0, specFlag = false) {
        const dirs = dirfuncs_1.dirfuncs.getDirectories(dir);
        let indent = '';
        const spacer = '   ';
        for (let i = 0; i < level; i++) {
            indent = indent + spacer;
        }
        if (indent.length > 0)
            indent = '-' + indent;
        const seq = new sequence_1.SequenceFile;
        for (const dir of dirs) {
            const basename = path.basename(dir.fsPath);
            const baseUpper = basename.toUpperCase();
            if (exports.visualText.isAnalyzerDirectory(dir)) {
                if (specFlag) {
                    items.push({ label: indent + basename, description: '=======================' });
                    seq.choicePasses(path.join(dir.fsPath, exports.visualText.ANALYZER_SEQUENCE_FOLDER), items, '-' + indent + spacer, false);
                }
                else {
                    items.push({ label: indent + basename, description: dir.fsPath });
                }
            }
            else {
                items.push({ label: indent + '(FOLDER) ' + baseUpper, description: '(FOLDER - choose analyzer bloc(s) below)' });
                this.analyzerFolderListRecurse(dir, items, level + 1, specFlag);
            }
        }
        return items;
    }
    modFileList() {
        const items = [];
        for (const uri of this.modFiles) {
            const basename = path.basename(uri.fsPath);
            items.push({ label: basename, description: uri.fsPath });
        }
        return items;
    }
    findFilesWithExtension(extension) {
        const protectedFiles = [
            'C:\\DumpStack.log.tmp',
            'C:\\hiberfil.sys',
            'C:\\pagefile.sys',
            'C:\\swapfile.sys'
        ];
        function explore(dir) {
            try {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const filePath = path.join(dir, file);
                    if (protectedFiles.includes(filePath)) {
                        continue;
                    }
                    let stats;
                    try {
                        stats = fs.statSync(filePath);
                    }
                    catch (err) {
                        if (err.code === 'EPERM') {
                            // Skip protected system files
                            continue;
                        }
                        else {
                            throw err;
                        }
                    }
                    const startsWithNumber = /^\d+\_/.test(file);
                    if (stats.isDirectory()) {
                        explore(filePath);
                    }
                    else if (path.extname(file) === extension && !startsWithNumber) {
                        exports.visualText.libraryFiles.push(filePath);
                    }
                }
            }
            catch (err) {
                console.error('An error occurred while reading the directory:', err.message);
            }
        }
        if (exports.visualText.libraryFiles.length == 0) {
            const filepath = path.join(exports.visualText.getVisualTextDirectory(exports.visualText.ANALYZER_SEQUENCE_FOLDER));
            if (fs.existsSync(filepath)) {
                explore(filepath);
            }
        }
    }
    getLibraryFiles() {
        return this.libraryFiles;
    }
    chooseLibFiles(prompt, dirName, subDir, exts) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const fileDir = path.join(exports.visualText.getVisualTextDirectory(), dirName, subDir);
            const items = [];
            const dictFiles = dirfuncs_1.dirfuncs.getFiles(vscode.Uri.file(fileDir), exts);
            const textFile = new textFile_1.TextFile();
            for (const dictFile of dictFiles) {
                let descr = "";
                const firstLine = textFile.readFirstLine(dictFile.fsPath);
                if (firstLine[0] == '#') {
                    descr = firstLine.substring(1);
                }
                const icon = exports.visualText.fileIconFromExt(dictFile.fsPath);
                const label = path.basename(dictFile.fsPath);
                const light = vscode.Uri.file(path.join(exports.visualText.getExtensionPath().fsPath, "resources", "light", icon));
                const dark = vscode.Uri.file(path.join(exports.visualText.getExtensionPath().fsPath, "resources", "dark", icon));
                items.push({ label: label, description: descr });
            }
            if (items.length == 0) {
                vscode.window.showWarningMessage('Not created yet and you can help!');
                return [];
            }
            else {
                const selections = yield vscode.window.showQuickPick(items, { title: 'Choose ' + prompt, canPickMany: true, placeHolder: 'Choose ' + prompt + ' to insert' });
                if (selections) {
                    for (const item of selections) {
                        item.description = fileDir;
                    }
                }
                return selections || [];
            }
        });
    }
    convertUriToStr(uri) {
        let pathStr = uri.fsPath;
        if (os.platform() === 'win32') {
            pathStr = pathStr.replace(/\\/g, '\\\\');
        }
        else {
            pathStr = pathStr.replace(/\\/g, '/');
        }
        return pathStr;
    }
}
exports.VisualText = VisualText;
//# sourceMappingURL=visualText.js.map