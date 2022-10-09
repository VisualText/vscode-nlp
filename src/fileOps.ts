import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { visualText } from './visualText';
import { dirfuncs } from './dirfuncs';

export enum fileQueueStatus { UNKNOWN, RUNNING, DONE }
export enum fileOperation { UNKNOWN, COPY, DELETE, RENAME, DONE }
export enum fileOpStatus { UNKNOWN, RUNNING, FAILED, DONE }
export enum fileOpType { UNKNOWN, FILE, DIRECTORY }

interface fileOperations {
    uriFile1: vscode.Uri;
    uriFile2: vscode.Uri;
    operation: fileOperation;
    status: fileOpStatus;
    type: fileOpType;
    extension1: string;
    extension2: string;
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

    public startFileOps(mils: number=1000) {
        if (this.timerID == 0) {
            this.timerCounter = 0;
            visualText.debugMessage('Starting file operations...');
            this.timerID = +setInterval(this.fileTimer,mils);
        }
    }

    public addFileOperation(uri1: vscode.Uri, uri2: vscode.Uri, operation: fileOperation, extension1: string='', extension2: string='') {
        var type: fileOpType = fileOpType.UNKNOWN
        if (dirfuncs.isDir(uri1.fsPath))
            type = fileOpType.DIRECTORY;
        else if (fs.existsSync(uri1.fsPath))
            type = fileOpType.FILE;
        this.opsQueue.push({uriFile1: uri1, uriFile2: uri2, operation: operation, status: fileOpStatus.UNKNOWN, type: type, extension1: extension1, extension2: extension2})
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
        let len = visualText.fileOps.opsQueue.length;
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
                        if (op.status == fileOpStatus.UNKNOWN) {
                            if (op.type == fileOpType.DIRECTORY) {
                                visualText.debugMessage('Renameing extensions in directory: ' + op.uriFile1.fsPath);
                                let files = dirfuncs.getFiles(op.uriFile1);
                                let ext1 = '.' + op.extension1;
                                let ext2 = '.' + op.extension2;
                                for (let file of files) {
                                    if (!file.fsPath.endsWith(ext2) && (op.extension1.length == 0 || file.fsPath.endsWith(ext1))) {
                                        let newFile = file.fsPath.replace(/\.[^.]+$/, ext2);
                                        visualText.fileOps.addFileOperation(file,vscode.Uri.file(newFile),fileOperation.RENAME,'','');
                                    }
                                }
                                op.status = fileOpStatus.DONE;
                            }
                            else {
                                fs.renameSync(op.uriFile1.fsPath,op.uriFile2.fsPath);
                                op.status = fileOpStatus.DONE;
                                visualText.debugMessage('RENAMED: ' + op.uriFile1.fsPath + ' to ' + op.uriFile2.fsPath);
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
                vscode.commands.executeCommand('sequenceView.refreshAll');
                vscode.commands.executeCommand('kbView.refreshAll');
                break;
            }
        }
    }
}