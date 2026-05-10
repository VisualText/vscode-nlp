"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileOps = exports.fileOps = exports.fileOneOff = exports.fileOpRefresh = exports.fileOpType = exports.fileOpStatus = exports.fileOperation = exports.fileQueueStatus = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const fs = tslib_1.__importStar(require("fs"));
const path = tslib_1.__importStar(require("path"));
const visualText_1 = require("./visualText");
const dirfuncs_1 = require("./dirfuncs");
const logView_1 = require("./logView");
const analyzerView_1 = require("./analyzerView");
var fileQueueStatus;
(function (fileQueueStatus) {
    fileQueueStatus[fileQueueStatus["UNKNOWN"] = 0] = "UNKNOWN";
    fileQueueStatus[fileQueueStatus["RUNNING"] = 1] = "RUNNING";
    fileQueueStatus[fileQueueStatus["DONE"] = 2] = "DONE";
})(fileQueueStatus || (exports.fileQueueStatus = fileQueueStatus = {}));
var fileOperation;
(function (fileOperation) {
    fileOperation[fileOperation["UNKNOWN"] = 0] = "UNKNOWN";
    fileOperation[fileOperation["COPY"] = 1] = "COPY";
    fileOperation[fileOperation["DELETE"] = 2] = "DELETE";
    fileOperation[fileOperation["RENAME"] = 3] = "RENAME";
    fileOperation[fileOperation["BREAK"] = 4] = "BREAK";
    fileOperation[fileOperation["MKDIR"] = 5] = "MKDIR";
    fileOperation[fileOperation["NEWFILE"] = 6] = "NEWFILE";
    fileOperation[fileOperation["APPEND"] = 7] = "APPEND";
    fileOperation[fileOperation["ANASEL"] = 8] = "ANASEL";
    fileOperation[fileOperation["ANALOAD"] = 9] = "ANALOAD";
    fileOperation[fileOperation["ANAFOLDER"] = 10] = "ANAFOLDER";
    fileOperation[fileOperation["ANAFILE"] = 11] = "ANAFILE";
    fileOperation[fileOperation["DONE"] = 12] = "DONE";
})(fileOperation || (exports.fileOperation = fileOperation = {}));
var fileOpStatus;
(function (fileOpStatus) {
    fileOpStatus[fileOpStatus["UNKNOWN"] = 0] = "UNKNOWN";
    fileOpStatus[fileOpStatus["RUNNING"] = 1] = "RUNNING";
    fileOpStatus[fileOpStatus["FAILED"] = 2] = "FAILED";
    fileOpStatus[fileOpStatus["DONE"] = 3] = "DONE";
})(fileOpStatus || (exports.fileOpStatus = fileOpStatus = {}));
var fileOpType;
(function (fileOpType) {
    fileOpType[fileOpType["UNKNOWN"] = 0] = "UNKNOWN";
    fileOpType[fileOpType["FILE"] = 1] = "FILE";
    fileOpType[fileOpType["DIRECTORY"] = 2] = "DIRECTORY";
})(fileOpType || (exports.fileOpType = fileOpType = {}));
var fileOpRefresh;
(function (fileOpRefresh) {
    fileOpRefresh[fileOpRefresh["UNKNOWN"] = 0] = "UNKNOWN";
    fileOpRefresh[fileOpRefresh["TEXT"] = 1] = "TEXT";
    fileOpRefresh[fileOpRefresh["ANALYZER"] = 2] = "ANALYZER";
    fileOpRefresh[fileOpRefresh["KB"] = 3] = "KB";
    fileOpRefresh[fileOpRefresh["OUTPUT"] = 4] = "OUTPUT";
    fileOpRefresh[fileOpRefresh["ANALYZERS"] = 5] = "ANALYZERS";
})(fileOpRefresh || (exports.fileOpRefresh = fileOpRefresh = {}));
var fileOneOff;
(function (fileOneOff) {
    fileOneOff[fileOneOff["UNKNOWN"] = 0] = "UNKNOWN";
    fileOneOff[fileOneOff["PAT_TO_NLP"] = 1] = "PAT_TO_NLP";
})(fileOneOff || (exports.fileOneOff = fileOneOff = {}));
class FileOps {
    constructor() {
        this.stopAllFlag = false;
        this.queueStrs = ["UNKNOWN", "RUNNING", "DONE"];
        this.opStrs = ["UNKNOWN", "COPY", "DELETE", "RENAME", "BREAK", "MKDIR", "NEWFILE", "APPEND", "ANASEL", "ANALOAD", "ANAFOLDER", "ANAFILE", "DONE"];
        this.opStatusStrs = ["UNKNOWN", "RUNNING", "FAILED", "DONE"];
        this.timerStatus = fileQueueStatus.UNKNOWN;
        this.opsQueue = new Array();
        this.refreshQueue = new Array();
        this.timerCounter = 0;
        this.timerID = 0;
        this.fileOpTypeStrs = ['UNKNOWN', 'FILE', 'DIRECTORY'];
        // This is used for inserting block files into the analyzer
        this.seqRow = 0;
    }
    startFileOps(mils = 100) {
        if (this.timerID == 0) {
            logView_1.logView.clearLogs(false);
            this.timerCounter = 0;
            visualText_1.visualText.debugMessage('Starting file operations...', logView_1.logLineType.FILE_OP);
            this.timerID = +setInterval(this.fileTimer, mils);
        }
    }
    stopAll() {
        visualText_1.visualText.fileOps.stopAllFlag = true;
    }
    addFileOperation(uri1, uri2, refreshes, operation, extension1 = '', extension2 = '') {
        let type = fileOpType.UNKNOWN;
        if (dirfuncs_1.dirfuncs.isDir(uri1.fsPath))
            type = fileOpType.DIRECTORY;
        else if (fs.existsSync(uri1.fsPath))
            type = fileOpType.FILE;
        if (type == fileOpType.DIRECTORY && (operation == fileOperation.RENAME || operation == fileOperation.BREAK || operation == fileOperation.APPEND)) {
            const files = dirfuncs_1.dirfuncs.getFiles(uri1);
            if (operation == fileOperation.RENAME) {
                if (extension1.length && extension2.length) {
                    for (const file of files) {
                        if (extension1.length && extension2.length) {
                            if (!file.fsPath.endsWith(extension2) && file.fsPath.endsWith(extension1)) {
                                const u1 = vscode.Uri.file(path.join(uri1.fsPath, path.basename(file.fsPath)));
                                const u2 = vscode.Uri.file(path.join(uri2.fsPath, path.parse(file.fsPath).name + '.' + extension2));
                                this.opsQueue.push({ uriFile1: u1, uriFile2: u2, operation: fileOperation.RENAME, status: fileOpStatus.UNKNOWN, type: fileOpType.DIRECTORY, oneOff: fileOneOff.UNKNOWN, extension1: '', extension2: '', refreshes: refreshes, display: true });
                            }
                        }
                    }
                }
                else {
                    this.opsQueue.push({ uriFile1: uri1, uriFile2: uri2, operation: fileOperation.RENAME, status: fileOpStatus.UNKNOWN, type: fileOpType.DIRECTORY, oneOff: fileOneOff.UNKNOWN, extension1: '', extension2: '', refreshes: refreshes, display: true });
                }
            }
            else if (operation == fileOperation.BREAK) {
                const filesPerDir = +extension1;
                const numDirs = Math.ceil(files.length / filesPerDir);
                const zeroLength = numDirs.toString().length;
                const basename = path.basename(uri1.fsPath);
                let fileCount = 0;
                for (let i = 0; i < numDirs; i++) {
                    const newDir = path.join(uri1.fsPath, basename + "_" + this.zeroStr(i, zeroLength));
                    this.opsQueue.push({ uriFile1: vscode.Uri.file(newDir), uriFile2: uri2, operation: fileOperation.MKDIR, status: fileOpStatus.UNKNOWN, type: fileOpType.DIRECTORY, oneOff: fileOneOff.UNKNOWN, extension1: '', extension2: '', refreshes: refreshes, display: true });
                    for (let i = 0; i < filesPerDir; i++) {
                        if (fileCount >= files.length)
                            break;
                        const oldFile = files[fileCount++];
                        const baseFile = path.basename(oldFile.fsPath);
                        const newFile = path.join(newDir, baseFile);
                        this.opsQueue.push({ uriFile1: oldFile, uriFile2: vscode.Uri.file(newFile), operation: fileOperation.RENAME, status: fileOpStatus.UNKNOWN, type: fileOpType.FILE, oneOff: fileOneOff.UNKNOWN, extension1: '', extension2: '', refreshes: refreshes, display: false });
                    }
                }
            }
            else if (operation == fileOperation.APPEND) {
                const files = dirfuncs_1.dirfuncs.getFiles(uri1);
                for (const file of files) {
                    if (file.fsPath == uri2.fsPath) {
                        dirfuncs_1.dirfuncs.delDir(uri2.fsPath);
                    }
                    else if (file.fsPath.endsWith(extension1)) {
                        this.opsQueue.push({ uriFile1: file, uriFile2: uri2, operation: fileOperation.APPEND, status: fileOpStatus.UNKNOWN, type: fileOpType.FILE, oneOff: fileOneOff.UNKNOWN, extension1: extension1, extension2: extension2, refreshes: refreshes, display: true });
                    }
                }
            }
        }
        else {
            this.opsQueue.push({ uriFile1: uri1, uriFile2: uri2, operation: operation, status: fileOpStatus.UNKNOWN, type: type, oneOff: fileOneOff.UNKNOWN, extension1: extension1, extension2: extension2, refreshes: refreshes, display: true });
        }
        return this.opsQueue[this.opsQueue.length - 1];
    }
    zeroStr(num, charCount) {
        const numStr = num.toString();
        let retStr = numStr;
        const zeros = charCount - numStr.length;
        if (zeros > 0) {
            for (let i = 0; i < zeros; i++) {
                retStr = "0" + retStr;
            }
        }
        return retStr;
    }
    fileTimer() {
        // Cycle through operations and find the one to work on
        if (visualText_1.visualText.fileOps.opsQueue.length == 0) {
            visualText_1.visualText.fileOps.timerStatus = fileQueueStatus.DONE;
        }
        let op = visualText_1.visualText.fileOps.opsQueue[0];
        const len = visualText_1.visualText.fileOps.opsQueue.length;
        let alldone = true;
        let opNum = 0;
        for (const o of visualText_1.visualText.fileOps.opsQueue) {
            opNum++;
            // visualText.debugMessage("   " + visualText.fileOps.queueStrs[visualText.fileOps.timerStatus] + ' ' + visualText.fileOps.opStrs[o.operation] + ' ' + visualText.fileOps.opStatusStrs[o.status],logLineType.FILE_OP);
            if (o.status == fileOpStatus.UNKNOWN || o.status == fileOpStatus.RUNNING) {
                op = o;
                alldone = false;
                break;
            }
            else if (o.status != fileOpStatus.FAILED && o.status != fileOpStatus.DONE) {
                alldone = false;
            }
        }
        if (alldone || visualText_1.visualText.fileOps.stopAllFlag) {
            vscode.commands.executeCommand('setContext', 'fileOps.running', false);
            visualText_1.visualText.fileOps.stopAllFlag = false;
            visualText_1.visualText.fileOps.timerStatus = fileQueueStatus.DONE;
        }
        else {
            vscode.commands.executeCommand('setContext', 'fileOps.running', true);
            visualText_1.visualText.fileOps.timerStatus = fileQueueStatus.RUNNING;
        }
        logView_1.logView.updateTitle(opNum.toString() + ' of ' + len.toString());
        if (visualText_1.visualText.debug)
            visualText_1.visualText.debugMessage(visualText_1.visualText.fileOps.queueStrs[visualText_1.visualText.fileOps.timerStatus] + ' ' + visualText_1.visualText.fileOps.opStrs[op.operation] + ' ' + visualText_1.visualText.fileOps.opStatusStrs[op.status], logView_1.logLineType.FILE_OP);
        //SIMPLE STATE MACHINE
        switch (visualText_1.visualText.fileOps.timerStatus) {
            case fileQueueStatus.RUNNING: {
                switch (op.operation) {
                    case fileOperation.COPY: {
                        if (op.status == fileOpStatus.UNKNOWN) {
                            op.status = fileOpStatus.RUNNING;
                            if (!fs.existsSync(op.uriFile1.fsPath)) {
                                if (!dirfuncs_1.dirfuncs.makeDir(op.uriFile1.fsPath))
                                    visualText_1.visualText.fileOps.timerStatus = fileQueueStatus.DONE;
                            }
                            if (op.type == fileOpType.DIRECTORY) {
                                visualText_1.visualText.debugMessage('Copying directory: ' + op.uriFile1.fsPath, logView_1.logLineType.FILE_OP);
                                const copydir = require('copy-dir');
                                copydir(op.uriFile1.fsPath, op.uriFile2.fsPath, (err) => {
                                    if (err) {
                                        op.status = fileOpStatus.FAILED;
                                        if (op.display)
                                            visualText_1.visualText.debugMessage('DIRECTORY COPY FAILED: ' + op.uriFile2.fsPath, logView_1.logLineType.FILE_OP);
                                    }
                                    visualText_1.visualText.fileOps.doneRefresh(op);
                                    if (op.display)
                                        visualText_1.visualText.debugMessage('DIRECTORY COPIED TO: ' + op.uriFile2.fsPath, logView_1.logLineType.FILE_OP);
                                });
                            }
                            else {
                                if (dirfuncs_1.dirfuncs.copyFile(op.uriFile1.fsPath, op.uriFile2.fsPath)) {
                                    visualText_1.visualText.fileOps.doneRefresh(op);
                                    if (op.display)
                                        visualText_1.visualText.debugMessage('FILE COPIED TO: ' + op.uriFile2.fsPath, logView_1.logLineType.FILE_OP);
                                }
                                else {
                                    op.status = fileOpStatus.FAILED;
                                    if (op.display)
                                        visualText_1.visualText.debugMessage('FILE COPY FAILED: ' + op.uriFile2.fsPath, logView_1.logLineType.FILE_OP);
                                }
                            }
                        }
                        break;
                    }
                    case fileOperation.DELETE: {
                        if (op.status == fileOpStatus.UNKNOWN) {
                            if (op.type == fileOpType.DIRECTORY) {
                                if (dirfuncs_1.dirfuncs.delDir(op.uriFile1.fsPath)) {
                                    visualText_1.visualText.fileOps.doneRefresh(op);
                                    if (op.display)
                                        visualText_1.visualText.debugMessage('DIRECTORY DELETED: ' + op.uriFile1.fsPath, logView_1.logLineType.FILE_OP);
                                }
                                else {
                                    op.status = fileOpStatus.FAILED;
                                    if (op.display)
                                        visualText_1.visualText.debugMessage('DIRECTORY DELETE FAILED: ' + op.uriFile2.fsPath, logView_1.logLineType.FILE_OP);
                                }
                            }
                            else {
                                if (dirfuncs_1.dirfuncs.delFile(op.uriFile1.fsPath)) {
                                    visualText_1.visualText.fileOps.doneRefresh(op);
                                    if (op.display)
                                        visualText_1.visualText.debugMessage('FILE DELETED: ' + op.uriFile1.fsPath, logView_1.logLineType.FILE_OP);
                                }
                                else {
                                    op.status = fileOpStatus.FAILED;
                                    if (op.display)
                                        visualText_1.visualText.debugMessage('FILE DELETE FAILED: ' + op.uriFile2.fsPath, logView_1.logLineType.FILE_OP);
                                }
                            }
                        }
                        break;
                    }
                    case fileOperation.RENAME: {
                        fs.renameSync(op.uriFile1.fsPath, op.uriFile2.fsPath);
                        visualText_1.visualText.fileOps.doneRefresh(op);
                        if (op.display)
                            visualText_1.visualText.debugMessage('RENAMED: ' + op.uriFile1.fsPath + ' to ' + op.uriFile2.fsPath, logView_1.logLineType.FILE_OP);
                        break;
                    }
                    case fileOperation.MKDIR: {
                        fs.mkdirSync(op.uriFile1.fsPath);
                        visualText_1.visualText.fileOps.doneRefresh(op);
                        if (op.display)
                            visualText_1.visualText.debugMessage('NEW DIR: ' + op.uriFile1.fsPath, logView_1.logLineType.FILE_OP);
                        break;
                    }
                    case fileOperation.NEWFILE: {
                        fs.writeFileSync(op.uriFile1.fsPath, op.extension1);
                        visualText_1.visualText.fileOps.doneRefresh(op);
                        if (op.display)
                            visualText_1.visualText.debugMessage('NEW FILE: ' + op.uriFile1.fsPath, logView_1.logLineType.FILE_OP);
                        break;
                    }
                    case fileOperation.APPEND: {
                        const content = fs.readFileSync(op.uriFile1.fsPath, 'utf8');
                        fs.appendFileSync(op.uriFile2.fsPath, content);
                        visualText_1.visualText.fileOps.doneRefresh(op);
                        if (op.display)
                            visualText_1.visualText.debugMessage('APPEND: ' + op.uriFile1.fsPath + ' => ' + op.uriFile2.fsPath, logView_1.logLineType.FILE_OP);
                        break;
                    }
                    case fileOperation.ANASEL: {
                        visualText_1.visualText.analyzer.seqFile.getPassFiles(op.uriFile1.fsPath, true);
                        visualText_1.visualText.fileOps.seqRow = Number(op.extension1);
                        visualText_1.visualText.fileOps.doneRefresh(op);
                        break;
                    }
                    case fileOperation.ANALOAD: {
                        visualText_1.visualText.analyzer.setWorkingDir(op.uriFile2);
                        visualText_1.visualText.analyzer.seqFile.getPassFiles(op.uriFile2.fsPath, true);
                        visualText_1.visualText.fileOps.seqRow = visualText_1.visualText.analyzer.seqFile.getLastItem().row;
                        visualText_1.visualText.fileOps.doneRefresh(op);
                        break;
                    }
                    case fileOperation.ANAFILE: {
                        visualText_1.visualText.fileOps.seqRow = visualText_1.visualText.analyzer.seqFile.insertPass(visualText_1.visualText.fileOps.seqRow, op.uriFile2);
                        visualText_1.visualText.fileOps.doneRefresh(op);
                        break;
                    }
                    case fileOperation.ANAFOLDER: {
                        if (op.extension2 == "folder")
                            visualText_1.visualText.analyzer.seqFile.getPassFiles(op.uriFile2.fsPath, true);
                        else
                            visualText_1.visualText.analyzer.seqFile.renumberPasses();
                        const r = visualText_1.visualText.fileOps.seqRow;
                        visualText_1.visualText.fileOps.seqRow = visualText_1.visualText.analyzer.seqFile.insertNewFolderPass(visualText_1.visualText.fileOps.seqRow, op.extension1, op.extension2);
                        visualText_1.visualText.fileOps.doneRefresh(op);
                    }
                }
                break;
            }
            case fileQueueStatus.DONE: {
                clearInterval(visualText_1.visualText.fileOps.timerID);
                visualText_1.visualText.fileOps.timerID = 0;
                visualText_1.visualText.fileOps.opsQueue = [];
                logView_1.logView.updateTitle('');
                if (visualText_1.visualText.fileOps.stopAllFlag)
                    visualText_1.visualText.debugMessage('FILE PROCESSING CANCELED BY USER', logView_1.logLineType.FILE_OP);
                else
                    visualText_1.visualText.debugMessage('FILE PROCESSING COMPLETE', logView_1.logLineType.FILE_OP);
                for (const refresh of visualText_1.visualText.fileOps.refreshQueue) {
                    if (refresh == fileOpRefresh.TEXT)
                        vscode.commands.executeCommand('textView.refreshAll');
                    if (refresh == fileOpRefresh.ANALYZERS)
                        vscode.commands.executeCommand('analyzerView.refreshAll');
                    if (refresh == fileOpRefresh.ANALYZER)
                        vscode.commands.executeCommand('sequenceView.refreshAll');
                    if (refresh == fileOpRefresh.KB)
                        vscode.commands.executeCommand('kbView.refreshAll');
                    if (refresh == fileOpRefresh.OUTPUT)
                        vscode.commands.executeCommand('outputView.refreshAll');
                }
                switch (op.oneOff) {
                    case fileOneOff.PAT_TO_NLP:
                        analyzerView_1.analyzerView.converting = false;
                        break;
                }
                break;
            }
        }
    }
    doneRefresh(op) {
        op.status = fileOpStatus.DONE;
        for (const refresh of op.refreshes) {
            if (!this.refreshQueue.includes(refresh))
                this.refreshQueue.push(refresh);
        }
    }
}
exports.FileOps = FileOps;
//# sourceMappingURL=fileOps.js.map