import * as vscode from 'vscode';
import * as fs from 'fs';
import { visualText } from './visualText';
import { dirfuncs } from './dirfuncs';

export enum fileQueueStatus { UNKNOWN, RUNNING, DONE }
export enum fileOperation { UNKNOWN, COPY, DELETE, DONE }
export enum fileOpStatus { UNKNOWN, RUNNING, FAILED, DONE }
export enum fileOpType { UNKNOWN, FILE, DIRECTORY }

interface fileOperations {
    uriFile1: vscode.Uri;
    uriFile2: vscode.Uri;
    operation: fileOperation;
    status: fileOpStatus;
    type: fileOpType;
}

export let fileOps: FileOps;
export class FileOps {

    public timerStatus: fileQueueStatus = fileQueueStatus.UNKNOWN;
    public opsQueue: fileOperations[] = new Array();
    public timerCounter: number = 0;
    public timerID: number = 0;
    public fileOpTypeStrs = [ 'UNKNOWN', 'FILE', 'DIRECTORY' ];

	constructor() {
    }

    public startFileOps() {
        if (this.timerID == 0) {
            this.timerCounter = 0;
            visualText.debugMessage('Starting file operations...');
            this.timerID = +setInterval(this.fileTimer,1000);
        }
    }

    public addFileOperation(uri1: vscode.Uri, uri2: vscode.Uri, operation: fileOperation) {
        var type: fileOpType = fileOpType.UNKNOWN
        if (dirfuncs.isDir(uri1.fsPath))
            type = fileOpType.DIRECTORY;
        else if (fs.existsSync(uri1.fsPath))
            type = fileOpType.FILE;
        this.opsQueue.push({uriFile1: uri1, uriFile2: uri2, operation: operation, status: fileOpStatus.UNKNOWN, type: type})
    }

    fileTimer() {
        let debug = false;

        if (visualText.fileOps.timerCounter++ >= 45) {
            visualText.debugMessage('File processing timed out');
            visualText.fileOps.timerStatus = fileQueueStatus.DONE;
        }

        // Cycle through operations and find the one to work on
        if (visualText.fileOps.opsQueue.length == 0) {
            visualText.fileOps.timerStatus = fileQueueStatus.DONE;
        }
        let op = visualText.fileOps.opsQueue[0];
        let alldone = true;
        for (let o of visualText.fileOps.opsQueue) {
            if (o.status == fileOpStatus.UNKNOWN || o.status == fileOpStatus.RUNNING) {
                op = o;
                alldone = false;
                break;
            }
            else if (o.status != fileOpStatus.FAILED && o.status != fileOpStatus.DONE) {
                alldone = false;
            }
        }
        if (alldone)
            visualText.fileOps.timerStatus = fileQueueStatus.DONE;
        else
            visualText.fileOps.timerStatus = fileQueueStatus.RUNNING;

        //SIMPLE STATE MACHINE
        switch (visualText.fileOps.timerStatus) {
            case fileQueueStatus.RUNNING: {

                switch (op.operation) {
                    case fileOperation.COPY: {
                        if (op.status == fileOpStatus.UNKNOWN) {
                            if (!fs.existsSync(op.uriFile1.fsPath)) {
                                if (!dirfuncs.makeDir(op.uriFile1.fsPath))
                                    visualText.fileOps.timerStatus = fileQueueStatus.DONE;
                            }
                            if (op.type == fileOpType.DIRECTORY) {
                                visualText.debugMessage('Copying directory: ' + op.uriFile1.fsPath);
                                var copydir = require('copy-dir');
                                copydir(op.uriFile1.fsPath,op.uriFile2.fsPath, function(err) {
                                    if (err) {
                                        visualText.debugMessage('Directory copy failed: ' + op.uriFile2.fsPath);
                                        op.status = fileOpStatus.FAILED;
                                    }
                                    visualText.debugMessage('DIRECTORY COPIED TO: ' + op.uriFile2.fsPath);
                                    op.status = fileOpStatus.DONE;
                                });
                            }
                            else {
                                visualText.debugMessage('Copying file: ' + op.uriFile1.fsPath);
                                if (dirfuncs.copyFile(op.uriFile1.fsPath,op.uriFile2.fsPath)) {
                                    visualText.debugMessage('FILE COPIED TO: ' + op.uriFile2.fsPath);
                                }
                                else {
                                    visualText.debugMessage('Filec copy failed: ' + op.uriFile2.fsPath);
                                }
                            }
                            op.status = fileOpStatus.RUNNING;
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
                }
                break;
            }
            case fileQueueStatus.DONE: {
                clearInterval(visualText.fileOps.timerID);
                visualText.fileOps.timerID = 0;
                visualText.fileOps.opsQueue = [];
                visualText.debugMessage('FILE PROCESSING COMPLETE');
                vscode.commands.executeCommand('textView.refreshAll');
                vscode.commands.executeCommand('analyzerView.refreshAll');
                break;
            }
        }
    }
}