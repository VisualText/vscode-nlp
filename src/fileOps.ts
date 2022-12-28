import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { visualText } from './visualText';
import { dirfuncs } from './dirfuncs';
import { logView } from './logView';

export enum fileQueueStatus { UNKNOWN, RUNNING, DONE }
export enum fileOperation { UNKNOWN, COPY, DELETE, RENAME, BREAK, MKDIR, NEWFILE, APPEND, DONE }
export enum fileOpStatus { UNKNOWN, RUNNING, FAILED, DONE }
export enum fileOpType { UNKNOWN, FILE, DIRECTORY }
export enum fileOpRefresh { UNKNOWN, TEXT, ANALYZER, KB, OUTPUT, ANALYZERS }

interface fileOp {
    uriFile1: vscode.Uri;
    uriFile2: vscode.Uri;
    operation: fileOperation;
    status: fileOpStatus;
    type: fileOpType;
    extension1: string;
    extension2: string;
    refreshes: fileOpRefresh[];
    display: boolean;
}

export let fileOps: FileOps;
export class FileOps {

    public stopAllFlag: boolean = false;

    public timerStatus: fileQueueStatus = fileQueueStatus.UNKNOWN;
    public opsQueue: fileOp[] = new Array();
    public timerCounter: number = 0;
    public timerID: number = 0;
    public fileOpTypeStrs = [ 'UNKNOWN', 'FILE', 'DIRECTORY' ];

	constructor() {
    }

    public startFileOps(mils: number=100) {
        if (this.timerID == 0) {
            this.timerCounter = 0;
            visualText.debugMessage('Starting file operations...');
            this.timerID = +setInterval(this.fileTimer,mils);
        }
    }

    public stopAll() {
        visualText.fileOps.stopAllFlag = true;
    }

    public addFileOperation(uri1: vscode.Uri, uri2: vscode.Uri, refreshes: fileOpRefresh[], operation: fileOperation, extension1: string='', extension2: string='') {
        var type: fileOpType = fileOpType.UNKNOWN
        if (dirfuncs.isDir(uri1.fsPath))
            type = fileOpType.DIRECTORY;
        else if (fs.existsSync(uri1.fsPath))
            type = fileOpType.FILE;

        if (type == fileOpType.DIRECTORY && (operation == fileOperation.RENAME || operation == fileOperation.BREAK || operation == fileOperation.APPEND)) {
            let files = dirfuncs.getFiles(uri1);
            if (operation == fileOperation.RENAME) {
                for (let file of files) {
                    if (extension1.length && extension2.length) {
                        if (!file.fsPath.endsWith(extension2) && file.fsPath.endsWith(extension1)) {
                            let u1 = vscode.Uri.file(path.join(uri1.fsPath,path.basename(file.fsPath)));
                            let u2 = vscode.Uri.file(path.join(uri2.fsPath,path.parse(file.fsPath).name+'.'+extension2));
                            this.opsQueue.push({uriFile1: u1, uriFile2: u2, operation: fileOperation.RENAME, status: fileOpStatus.UNKNOWN, type: fileOpType.DIRECTORY, extension1: '', extension2: '', refreshes: refreshes, display: true})
                        }
                    } else {
                        this.opsQueue.push({uriFile1: uri1, uriFile2: uri2, operation: fileOperation.RENAME, status: fileOpStatus.UNKNOWN, type: fileOpType.DIRECTORY, extension1: '', extension2: '', refreshes: refreshes, display: true})
                    }
                }
            } else if (operation == fileOperation.BREAK) {
                let filesPerDir: number = +extension1;
                let numDirs = Math.ceil(files.length / filesPerDir);
                let zeroLength: number = numDirs.toString().length;
                let basename = path.basename(uri1.fsPath);
                let fileCount = 0;

                for (let i = 0; i < numDirs; i++) {
                    let newDir = path.join(uri1.fsPath,basename + "_" + this.zeroStr(i,zeroLength));
                    this.opsQueue.push({uriFile1: vscode.Uri.file(newDir), uriFile2: uri2, operation: fileOperation.MKDIR, status: fileOpStatus.UNKNOWN, type: fileOpType.DIRECTORY, extension1: '', extension2: '', refreshes: refreshes, display: true})

                    for (let i = 0; i < filesPerDir; i++) {
                        if (fileCount >= files.length)
                            break;
                        let oldFile = files[fileCount++];
                        let baseFile = path.basename(oldFile.fsPath);
                        let newFile = path.join(newDir,baseFile);
                        this.opsQueue.push({uriFile1: oldFile, uriFile2: vscode.Uri.file(newFile), operation: fileOperation.RENAME, status: fileOpStatus.UNKNOWN, type: fileOpType.FILE, extension1: '', extension2: '', refreshes: refreshes, display: false})
                    }
                }
            } else if (operation == fileOperation.APPEND) {
                let files = dirfuncs.getFiles(uri1);
                for (let file of files) {
                    if (file.fsPath == uri2.fsPath) {
                        dirfuncs.delDir(uri2.fsPath);
                    }
                    else if (file.fsPath.endsWith(extension1)) {
                        this.opsQueue.push({uriFile1: file, uriFile2: uri2, operation: fileOperation.APPEND, status: fileOpStatus.UNKNOWN, type: fileOpType.FILE, extension1: extension1, extension2: extension2, refreshes: refreshes, display: true})
                    }
                }
            }
        }
        else {
            this.opsQueue.push({uriFile1: uri1, uriFile2: uri2, operation: operation, status: fileOpStatus.UNKNOWN, type: type, extension1: extension1, extension2: extension2, refreshes: refreshes, display: true})
        }
     }

    zeroStr(num: number, charCount: number): string {
        let numStr: string = num.toString();
        let retStr = numStr;
        let zeros: number = charCount - numStr.length;
        if (zeros > 0) {
            for (let i = 0; i < zeros; i++) {
                retStr = "0" + retStr;
            }
        }
        return retStr;
    }

    fileTimer() {
        let debug = false;

        // Cycle through operations and find the one to work on
        if (visualText.fileOps.opsQueue.length == 0) {
            visualText.fileOps.timerStatus = fileQueueStatus.DONE;
        }
        let op = visualText.fileOps.opsQueue[0];
        let len = visualText.fileOps.opsQueue.length;
        let alldone = true;
        let opNum = 0;
        for (let o of visualText.fileOps.opsQueue) {
            opNum++;
            if (o.status == fileOpStatus.UNKNOWN || o.status == fileOpStatus.RUNNING) {
                op = o;
                alldone = false;
                break;
            }
            else if (o.status != fileOpStatus.FAILED && o.status != fileOpStatus.DONE) {
                alldone = false;
            }
        }
        if (alldone || visualText.fileOps.stopAllFlag) {
            vscode.commands.executeCommand('setContext', 'fileOps.running', false);
            visualText.fileOps.stopAllFlag = false;
            visualText.fileOps.timerStatus = fileQueueStatus.DONE;
        } else {
            vscode.commands.executeCommand('setContext', 'fileOps.running', true);
            visualText.fileOps.timerStatus = fileQueueStatus.RUNNING;
        }

        logView.updateTitle(opNum.toString() + ' of ' + len.toString());

        //SIMPLE STATE MACHINE
        switch (visualText.fileOps.timerStatus) {
            case fileQueueStatus.RUNNING: {

                switch (op.operation) {
                    case fileOperation.COPY: {
                        if (op.status == fileOpStatus.UNKNOWN) {
                            op.status = fileOpStatus.RUNNING;
                            if (!fs.existsSync(op.uriFile1.fsPath)) {
                                if (!dirfuncs.makeDir(op.uriFile1.fsPath))
                                    visualText.fileOps.timerStatus = fileQueueStatus.DONE;
                            }
                            if (op.type == fileOpType.DIRECTORY) {
                                visualText.debugMessage('Copying directory: ' + op.uriFile1.fsPath);
                                var copydir = require('copy-dir');
                                copydir(op.uriFile1.fsPath,op.uriFile2.fsPath, function(err) {
                                    if (err) {
                                        op.status = fileOpStatus.FAILED;
                                        if (op.display) visualText.debugMessage('DIRECTORY COPY FAILED: ' + op.uriFile2.fsPath);
                                    }
                                    op.status = fileOpStatus.DONE;
                                    if (op.display) visualText.debugMessage('DIRECTORY COPIED TO: ' + op.uriFile2.fsPath);
                                });
                            }
                            else {
                                if (dirfuncs.copyFile(op.uriFile1.fsPath,op.uriFile2.fsPath)) {
                                    op.status = fileOpStatus.DONE;
                                    if (op.display) visualText.debugMessage('FILE COPIED TO: ' + op.uriFile2.fsPath);
                                }
                                else {
                                    op.status = fileOpStatus.FAILED;
                                    if (op.display) visualText.debugMessage('FILE COPY FAILED: ' + op.uriFile2.fsPath);
                                }
                            }
                        }
                        break;
                    }
                    case fileOperation.DELETE: {
                        if (op.status == fileOpStatus.UNKNOWN) {
                            if (op.type == fileOpType.DIRECTORY) {
                                if (dirfuncs.delDir(op.uriFile1.fsPath)) {
                                    op.status = fileOpStatus.DONE;
                                    if (op.display) visualText.debugMessage('DIRECTORY DELETED: ' + op.uriFile1.fsPath);
                                }
                                else {
                                    op.status = fileOpStatus.FAILED;
                                    if (op.display) visualText.debugMessage('DIRECTORY DELETE FAILED: ' + op.uriFile2.fsPath);
                                }
                            }
                            else {
                                if (dirfuncs.delFile(op.uriFile1.fsPath)) {
                                    op.status = fileOpStatus.DONE;
                                    if (op.display) visualText.debugMessage('FILE DELETED: ' + op.uriFile1.fsPath);
                                }
                                else {
                                    op.status = fileOpStatus.FAILED;
                                    if (op.display) visualText.debugMessage('FILE DELETE FAILED: ' + op.uriFile2.fsPath);
                                }
                            }
                        }
                        break;
                    }
                    case fileOperation.RENAME: {
                        fs.renameSync(op.uriFile1.fsPath,op.uriFile2.fsPath);
                        op.status = fileOpStatus.DONE;
                        if (op.display) visualText.debugMessage('RENAMED: ' + op.uriFile1.fsPath + ' to ' + op.uriFile2.fsPath);
                        break;
                    }
                    case fileOperation.MKDIR: {
                        fs.mkdirSync(op.uriFile1.fsPath);
                        op.status = fileOpStatus.DONE;
                        if (op.display) visualText.debugMessage('NEW DIR: ' + op.uriFile1.fsPath);
                        break;
                    }
                    case fileOperation.NEWFILE: {
                        fs.writeFileSync(op.uriFile1.fsPath,op.extension1);
                        op.status = fileOpStatus.DONE;
                        if (op.display) visualText.debugMessage('NEW FILE: ' + op.uriFile1.fsPath);
                        break;
                    }
                    case fileOperation.APPEND: {
                        let content = fs.readFileSync(op.uriFile1.fsPath,'utf8');
                        fs.appendFileSync(op.uriFile2.fsPath,content);
                        op.status = fileOpStatus.DONE;
                        if (op.display) visualText.debugMessage('APPEND: ' + op.uriFile1.fsPath + ' => ' + op.uriFile2.fsPath);
                        break;
                    }
                }
                break;
            }
            case fileQueueStatus.DONE: {
                clearInterval(visualText.fileOps.timerID);
                visualText.fileOps.timerID = 0;
                visualText.fileOps.opsQueue = [];
                logView.updateTitle('');
                if (visualText.fileOps.stopAllFlag)
                    visualText.debugMessage('FILE PROCESSING CANCELED BY USER');
                else
                    visualText.debugMessage('FILE PROCESSING COMPLETE');
                if (op.refreshes.includes(fileOpRefresh.TEXT))
                    vscode.commands.executeCommand('textView.refreshAll');
                if (op.refreshes.includes(fileOpRefresh.ANALYZERS))
                    vscode.commands.executeCommand('analyzerView.refreshAll');
                if (op.refreshes.includes(fileOpRefresh.ANALYZER))
                    vscode.commands.executeCommand('sequenceView.refreshAll');
                if (op.refreshes.includes(fileOpRefresh.KB))
                    vscode.commands.executeCommand('kbView.refreshAll');
                if (op.refreshes.includes(fileOpRefresh.OUTPUT))
                    vscode.commands.executeCommand('outputView.refreshAll');
                break;
            }
        }
    }
}