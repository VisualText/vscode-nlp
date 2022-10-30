import * as vscode from 'vscode';
import * as fs from 'fs';
import { visualText } from './visualText';
import { dirfuncs } from './dirfuncs';
import { logView } from './logView';

export enum fileQueueStatus { UNKNOWN, RUNNING, DONE }
export enum fileOperation { UNKNOWN, COPY, DELETE, RENAME, DONE }
export enum fileOpStatus { UNKNOWN, RUNNING, FAILED, DONE }
export enum fileOpType { UNKNOWN, FILE, DIRECTORY }
export enum fileOpRefresh { UNKNOWN, TEXT, ANALYZER, KB, OUTPUT, ANALYZERS }

interface fileOperations {
    uriFile1: vscode.Uri;
    uriFile2: vscode.Uri;
    operation: fileOperation;
    status: fileOpStatus;
    type: fileOpType;
    extension1: string;
    extension2: string;
    refreshes: fileOpRefresh[];
}

export let fileOps: FileOps;
export class FileOps {

    public stopAllFlag: boolean = false;

    public timerStatus: fileQueueStatus = fileQueueStatus.UNKNOWN;
    public opsQueue: fileOperations[] = new Array();
    public timerCounter: number = 0;
    public timerID: number = 0;
    public fileOpTypeStrs = [ 'UNKNOWN', 'FILE', 'DIRECTORY' ];

	constructor() {
    }

    public startFileOps(mils: number=500) {
        if (this.timerID == 0) {
            this.timerCounter = 0;
            visualText.debugMessage('Starting file operations...');
            this.timerID = +setInterval(this.fileTimer,mils);
        }
    }

    public stopAll() {
        this.stopAllFlag = true;
    }

    public addFileOperation(uri1: vscode.Uri, uri2: vscode.Uri, refreshes: fileOpRefresh[], operation: fileOperation, extension1: string='', extension2: string='') {
        var type: fileOpType = fileOpType.UNKNOWN
        if (dirfuncs.isDir(uri1.fsPath))
            type = fileOpType.DIRECTORY;
        else if (fs.existsSync(uri1.fsPath))
            type = fileOpType.FILE;

        if (type == fileOpType.DIRECTORY && operation == fileOperation.RENAME) {
            let files = dirfuncs.getFiles(uri1);
            for (let file of files) {
                if (!file.fsPath.endsWith(extension2) && (extension1.length == 0 || file.fsPath.endsWith(extension1))) {
                    let newFile = file.fsPath.replace(/\.[^.]+$/, '.' + extension2);
                    visualText.fileOps.addFileOperation(file,vscode.Uri.file(newFile),refreshes,fileOperation.RENAME,'','');
                }
            }
        }

        this.opsQueue.push({uriFile1: uri1, uriFile2: uri2, operation: operation, status: fileOpStatus.UNKNOWN, type: type, extension1: extension1, extension2: extension2, refreshes: refreshes})
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
                                        visualText.debugMessage('DIRECTORY COPY FAILED: ' + op.uriFile2.fsPath);
                                    }
                                    op.status = fileOpStatus.DONE;
                                    visualText.debugMessage('DIRECTORY COPIED TO: ' + op.uriFile2.fsPath);
                                });
                            }
                            else {
                                visualText.debugMessage('Copying file: ' + op.uriFile1.fsPath);
                                if (dirfuncs.copyFile(op.uriFile1.fsPath,op.uriFile2.fsPath)) {
                                    op.status = fileOpStatus.DONE;
                                    visualText.debugMessage('FILE COPIED TO: ' + op.uriFile2.fsPath);
                                }
                                else {
                                    op.status = fileOpStatus.FAILED;
                                    visualText.debugMessage('FILE COPY FAILED: ' + op.uriFile2.fsPath);
                                }
                            }
                        }
                    }
                    case fileOperation.DELETE: {
                        if (op.status == fileOpStatus.UNKNOWN) {
                            if (op.type == fileOpType.DIRECTORY) {
                                visualText.debugMessage('Deleting directory: ' + op.uriFile1.fsPath);
                                if (dirfuncs.delDir(op.uriFile1.fsPath)) {
                                    op.status = fileOpStatus.DONE;
                                    visualText.debugMessage('DIRECTORY DELETED: ' + op.uriFile1.fsPath);
                                }
                                else {
                                    op.status = fileOpStatus.FAILED;
                                    visualText.debugMessage('DIRECTORY DELETE FAILED: ' + op.uriFile2.fsPath);
                                }
                            }
                            else {
                                visualText.debugMessage('Deleting file: ' + op.uriFile1.fsPath);
                                if (dirfuncs.delFile(op.uriFile1.fsPath)) {
                                    op.status = fileOpStatus.DONE;
                                    visualText.debugMessage('FILE DELETED: ' + op.uriFile1.fsPath);
                                }
                                else {
                                    op.status = fileOpStatus.FAILED;
                                    visualText.debugMessage('FILE DELETE FAILED: ' + op.uriFile2.fsPath);
                                }
                            }
                        }
                    }
                    case fileOperation.RENAME: {
                        fs.renameSync(op.uriFile1.fsPath,op.uriFile2.fsPath);
                        op.status = fileOpStatus.DONE;
                        visualText.debugMessage('RENAMED: ' + op.uriFile1.fsPath + ' to ' + op.uriFile2.fsPath);
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