import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Analyzer } from './analyzer';
import { dirfuncs } from './dirfuncs';
import { JsonState } from './jsonState';
import { nlpStatusBar } from './status';
import { logView } from './logView';
import { FileOps,fileOperation,fileOpRefresh,fileOneOff } from './fileOps';
import { NLPFile } from './nlp';

export enum updateStatus { UNKNOWN, START, RUNNING, CANCEL, FAILED, DONE }
export enum updateOperation { UNKNOWN, CHECK_EXISTS, VERSION, DOWNLOAD, UNZIP, DELETE, FAILED, DONE }
export enum updateType { UNKNOWN, VERSION, DOWNLOAD, DELETE, UNZIP }
export enum updateComponent { UNKNOWN, ICU1, ICU2, NLP_EXE, ENGINE_FILES, ANALYZER_FILES, VT_FILES }
export enum updatePush { FRONT, BACK }

export interface updateOp {
    type: updateType;
    status: updateStatus;
    operation: updateOperation;
    component: updateComponent;
    remote: string;
    local: string;
    folders: Array<string>;
}

interface ExtensionItem {
    uri: vscode.Uri;
    version: string;
    latest: boolean;
}

export let visualText: VisualText;
export class VisualText {
    _ctx: vscode.ExtensionContext;
    public opsQueue: updateOp[] = new Array();
    public statusStrs = [ 'UNKNOWN', 'START', 'RUNNING', 'CANCEL', 'FAILED', 'DONE' ];
    public opStrs = ['UNKNOWN', 'CHECK_EXISTS', 'VERSION', 'DOWNLOAD', 'UNZIP', 'DELETE', 'FAILED', 'DONE' ];
    public compStrs = ['UNKNOWN', 'ICU1', 'ICU2', 'NLP_EXE', 'ENGINE_FILES', 'ANALYZER_FILES', 'VT_FILES' ];
    
    public readonly LOG_SUFFIX = '_log';
    public readonly EXTENSION_NAME = 'dehilster.nlp';
    public readonly NLP_EXE = 'nlp.exe';
    public readonly ICU1_WIN = 'icudt71.dll';
    public readonly ICU2_WIN = 'icuuc71.dll';
    public readonly ICU1_LINUX = 'libicutu.a';
    public readonly ICU2_LINUX = 'libicuuc.a';
    public readonly ICU1_MAC = 'libicutum.a';
    public readonly ICU2_MAC = 'libicuucm.a';
    public readonly NLPENGINE_FILES_ASSET = 'nlpengine.zip';
    public readonly NLPENGINE_REPO = 'nlp-engine';
    public readonly VISUALTEXT_FILES_REPO = 'visualtext-files';
    public readonly ANALYZERS_REPO = 'analyzers';
    public readonly VISUALTEXT_FILES_ASSET = 'visualtext.zip';
    public readonly ANALYZERS_ASSET = 'analyzers.zip';
    public readonly ANALYZER_SEQUENCE_FILE = 'analyzer.seq';
    public readonly GITHUB_REPOSITORY = 'https://github.com/VisualText/';
    public readonly GITHUB_RELEASE_LATEST = '/releases/latest/';
    public readonly GITHUB_RELEASE_LATEST_DOWNLOAD = '/releases/latest/download/';
    public readonly GITHUB_ENGINE_LATEST_RELEASE = this.GITHUB_REPOSITORY + this.NLPENGINE_REPO + this.GITHUB_RELEASE_LATEST_DOWNLOAD;
    public readonly GITHUB_ENGINE_LATEST_VERSION = this.GITHUB_REPOSITORY + this.NLPENGINE_REPO + this.GITHUB_RELEASE_LATEST;
    public readonly GITHUB_VISUALTEXT_FILES_LATEST_VERSION = this.GITHUB_REPOSITORY + this.VISUALTEXT_FILES_REPO + this.GITHUB_RELEASE_LATEST;
    public readonly GITHUB_ANALYZERS_LATEST_VERSION = this.GITHUB_REPOSITORY + this.ANALYZERS_REPO + this.GITHUB_RELEASE_LATEST;

    public analyzer = new Analyzer();
    public fileOps = new FileOps();
    public nlp = new NLPFile();
    public version: string = '';
    public engineVersion: string = '';
    public cmdEngineVersion: string = '';
    public repoEngineVersion: string = '';
    public vtFilesVersion: string = '';
    public repoVTFilesVersion: string = ''
    public analyzersVersion: string = '';;
    public repoAnalyzersVersion: string = '';
    public engineDir: vscode.Uri = vscode.Uri.file('');
    public askModify: boolean = false;
    public processID: number = 0;
    public stopAll: boolean = false;
    public debug: boolean = false;

    private platform: string = '';
    private homeDir: string = '';
    private username: string = '';
    private jsonState = new JsonState();
    private analyzers: vscode.Uri[] = new Array();
    private extensionDir: vscode.Uri = vscode.Uri.file('');

    private analyzerDir: vscode.Uri = vscode.Uri.file('');
    private currentAnalyzer: vscode.Uri = vscode.Uri.file('');
    private workspaceFold: vscode.Uri = vscode.Uri.file('');

    private extensionItems: ExtensionItem[] = new Array();
    private latestExtIndex: number = 0;
    private lastestEngineIndex: number = 0;
    private updaterID: number = 0;

	constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;
    }
    
    static attach(ctx: vscode.ExtensionContext): VisualText {
        if (!visualText) {
            visualText = new VisualText(ctx);
            if (vscode.workspace.workspaceFolders) {
                visualText.workspaceFold = vscode.workspace.workspaceFolders[0].uri;
            }

            visualText.platform = os.platform();
            visualText.homeDir = os.homedir();

            visualText.readConfig();
            visualText.readState();
            visualText.getExtensionDirs();
            visualText.initSettings();
        }
        return visualText;
    }

    startUpdater(preInfoFlag: boolean = true) {
        if (this.updaterID == 0) {
            this.platform = os.platform();
            let plat = this.platform == 'darwin' ? 'mac' : this.platform;
            this.homeDir = os.homedir();
            var rootPath = this.getLatestExtPath(this.extensionParentDirectory());
            if (rootPath) this.extensionDir = vscode.Uri.file(rootPath);
            this.version = vscode.extensions.getExtension(this.EXTENSION_NAME)?.packageJSON.version;

            if (preInfoFlag) {
                this.debugMessage('Platform: ' + plat);
                this.debugMessage('User profile path: ' + this.homeDir);
                this.debugMessage('VSCode NLP++ Extension path: ' + this.extensionDir.fsPath);
            }

            this.debugMessage('Checking for updates or repairs...');
            this.pushCheckVersions();
            this.updaterID = +setInterval(this.updaterTimer,1000);
        }
    }

    stopUpdater() {
        this.debugMessage('STOP requested by user');
        for (let o of visualText.opsQueue) {
            if (o.status != updateStatus.RUNNING) {
                o.status = updateStatus.DONE;
            }
        }
        visualText.stopAll = true;
    }

    pushCheckVersions() {
        visualText.pushCheckEngineFiles();
        visualText.addUpdateOperation(updatePush.BACK,updateType.VERSION,updateStatus.START,updateOperation.VERSION,updateComponent.NLP_EXE);
        visualText.pushCheckVTFiles();
        visualText.addUpdateOperation(updatePush.BACK,updateType.VERSION,updateStatus.START,updateOperation.VERSION,updateComponent.VT_FILES);
        visualText.pushCheckAnalyzerFiles();
        visualText.addUpdateOperation(updatePush.BACK,updateType.VERSION,updateStatus.START,updateOperation.VERSION,updateComponent.ANALYZER_FILES);
    }

    pushCheckVTFiles() {
        visualText.addUpdateOperation(updatePush.BACK,updateType.UNZIP,updateStatus.START,updateOperation.CHECK_EXISTS,updateComponent.VT_FILES);
    }

    pushCheckAnalyzerFiles() {
        visualText.addUpdateOperation(updatePush.BACK,updateType.UNZIP,updateStatus.START,updateOperation.CHECK_EXISTS,updateComponent.ANALYZER_FILES);
    }

    pushCheckEngineFiles() {
        visualText.addUpdateOperation(updatePush.BACK,updateType.DOWNLOAD,updateStatus.START,updateOperation.CHECK_EXISTS,updateComponent.ICU1);
        visualText.addUpdateOperation(updatePush.BACK,updateType.DOWNLOAD,updateStatus.START,updateOperation.CHECK_EXISTS,updateComponent.ICU2);
        visualText.addUpdateOperation(updatePush.BACK,updateType.DOWNLOAD,updateStatus.START,updateOperation.CHECK_EXISTS,updateComponent.NLP_EXE);
        visualText.addUpdateOperation(updatePush.BACK,updateType.UNZIP,updateStatus.START,updateOperation.CHECK_EXISTS,updateComponent.ENGINE_FILES);
    }

    pushDeleteEngineFiles(push: updatePush) {
        visualText.addUpdateOperation(push,updateType.DELETE,updateStatus.START,updateOperation.DELETE,updateComponent.ICU1);
        visualText.addUpdateOperation(push,updateType.DELETE,updateStatus.START,updateOperation.DELETE,updateComponent.ICU2);
        visualText.addUpdateOperation(push,updateType.DELETE,updateStatus.START,updateOperation.DELETE,updateComponent.NLP_EXE);
        visualText.addUpdateOperation(push,updateType.DELETE,updateStatus.START,updateOperation.DELETE,updateComponent.ENGINE_FILES);
    }
    
    pushDeleteVTFiles(push: updatePush) {
        visualText.addUpdateOperation(push,updateType.DELETE,updateStatus.START,updateOperation.DELETE,updateComponent.VT_FILES);
    }

    pushDeleteAnalyzers(push: updatePush) {
        visualText.addUpdateOperation(push,updateType.DELETE,updateStatus.START,updateOperation.DELETE,updateComponent.ANALYZER_FILES);
    }

    pushDownloadEngineFiles(push: updatePush) {
        visualText.addUpdateOperation(push,updateType.DOWNLOAD,updateStatus.START,updateOperation.DOWNLOAD,updateComponent.ICU1);
        visualText.addUpdateOperation(push,updateType.DOWNLOAD,updateStatus.START,updateOperation.DOWNLOAD,updateComponent.ICU2);
        visualText.addUpdateOperation(push,updateType.DOWNLOAD,updateStatus.START,updateOperation.DOWNLOAD,updateComponent.NLP_EXE);
        visualText.addUpdateOperation(push,updateType.DOWNLOAD,updateStatus.START,updateOperation.DOWNLOAD,updateComponent.ENGINE_FILES);
    }

    pushDownloadVTFiles(push: updatePush) {
        visualText.addUpdateOperation(push,updateType.DOWNLOAD,updateStatus.START,updateOperation.DOWNLOAD,updateComponent.VT_FILES);
    }

    pushDownloadAnalyzers(push: updatePush) {
        visualText.addUpdateOperation(push,updateType.DOWNLOAD,updateStatus.START,updateOperation.DOWNLOAD,updateComponent.ANALYZER_FILES);
    }

    addUpdateOperation(push: updatePush, type: updateType, status: updateStatus, operation: updateOperation, component: updateComponent) {
        var op = {type: type, status: status, operation: operation, component: component, remote: '', local: '', folders: []};

        switch (component) {
            case updateComponent.ICU1:
            case updateComponent.ICU2:
                visualText.libFilenames(op);
                break;
            case updateComponent.NLP_EXE:
                visualText.nlpExe(op);
                break;
            case updateComponent.ENGINE_FILES:
                visualText.zipFiles(op,visualText.NLPENGINE_REPO,'',visualText.NLPENGINE_FILES_ASSET,['data']);
                break;
            case updateComponent.VT_FILES:
                visualText.zipFiles(op,visualText.VISUALTEXT_FILES_REPO,'visualtext',visualText.VISUALTEXT_FILES_ASSET,['visualtext']);
                break;
            case updateComponent.ANALYZER_FILES:
                visualText.zipFiles(op,visualText.ANALYZERS_REPO,'analyzers',visualText.ANALYZERS_ASSET,['analyzers']);
                break;
        }

        if (push == updatePush.BACK)
            this.opsQueue.push(op);
        else
            this.opsQueue.unshift(op);
    }

    zipFiles(op: updateOp, repo: string, folder: string, download: string, folders: string[]) {
        op.remote = visualText.GITHUB_REPOSITORY + repo + visualText.GITHUB_RELEASE_LATEST_DOWNLOAD + download;
        const engDir = visualText.engineDirectory().fsPath;
        op.local = path.join(engDir,folder,download);
        op.folders = folders;
    }
    
    nlpExe(op: updateOp) {
        var exe = '';
        switch (visualText.platform) {
            case 'win32':
                exe = 'nlpw.exe';
                break;
            case 'darwin':
                exe = 'nlpm.exe';
                break;
            default:
                exe = 'nlpl.exe';
        }
        op.remote = visualText.GITHUB_ENGINE_LATEST_RELEASE + exe;
        const engDir = visualText.engineDirectory().fsPath;
        op.local = path.join(engDir,visualText.NLP_EXE);
    }

    libFilenames(op: updateOp) {
        var libRelease = '';
        var lib = '';
        var icu1 = op.component == updateComponent.ICU1 ? 1 : 0;
        switch (visualText.platform) {
            case 'win32':
                libRelease = icu1 ? visualText.ICU1_WIN : visualText.ICU2_WIN;
                lib = icu1 ? visualText.ICU1_WIN : visualText.ICU2_WIN;
                break;
            case 'darwin':
                libRelease = icu1 ? visualText.ICU1_MAC : visualText.ICU2_MAC;
                lib = icu1 ? visualText.ICU1_LINUX : visualText.ICU2_LINUX;
                break;
            default:
                libRelease = icu1 ? visualText.ICU1_LINUX : visualText.ICU2_LINUX;
                lib = icu1 ? visualText.ICU1_LINUX : visualText.ICU2_LINUX;
        }
        op.remote = visualText.GITHUB_ENGINE_LATEST_RELEASE + libRelease;
        var engDir = visualText.engineDirectory().fsPath;
        op.local = path.join(engDir,lib);
    }

    getLatestExtPath(dir: vscode.Uri): string {
        var files = dirfuncs.getFiles(dir);
        for (let file of files.reverse()) {
            let filename = path.basename(file.fsPath);
            if (filename.startsWith(this.EXTENSION_NAME)) {
                this.version = this.versionFromPath(file);
                return file.fsPath;
            }
        }
        return '';
    }

    updaterTimer() {
        let op = visualText.opsQueue[0];
        let q = visualText.opsQueue;
        let allDone = true;

        for (let o of visualText.opsQueue) {
            if (visualText.stopAll) {
                if (o.status == updateStatus.RUNNING)
                    allDone = false;
                else
                    o.status = updateStatus.DONE;
            }
            else {
                if (o.status == updateStatus.UNKNOWN || o.status == updateStatus.START || o.status == updateStatus.RUNNING) {
                    op = o;
                    allDone = false;
                    break;
                }
                else if (o.status != updateStatus.FAILED && o.status != updateStatus.CANCEL && o.status != updateStatus.DONE) {
                    allDone = false;
                }
            }
        }
        if (allDone) {
            vscode.commands.executeCommand('setContext', 'updating.running', false);
            visualText.opsQueue = [];
            clearInterval(visualText.updaterID);
            visualText.updaterID = 0;
            if (visualText.stopAll)
                visualText.debugMessage('UPDATE STOPPED BY USER');
            else
                visualText.debugMessage('UPDATE CHECK COMPLETE');
            visualText.stopAll = false;
            return;
        } else {
            vscode.commands.executeCommand('setContext', 'updating.running', true);
        }
        if (visualText.stopAll)
            return;

        if (visualText.debug)
            visualText.debugMessage(visualText.statusStrs[op.status] + ' ' + visualText.opStrs[op.operation] + ' ' + visualText.compStrs[op.component]);

        switch (op.status) {
            case updateStatus.START:
                switch (op.operation) {
                    case updateOperation.CHECK_EXISTS:
                        var endDir = path.join(visualText.getExtensionPath().fsPath,visualText.NLPENGINE_REPO);
                        if (op.folders.length && endDir) {
                            var missingOne = false;
                            for (let folder of op.folders) {
                                let f = path.join(endDir,folder);
                                if (!fs.existsSync(f)) {
                                    missingOne = true;
                                    break;
                                }
                            }
                            if (!missingOne) {
                                op.status = updateStatus.DONE;
                            } else {
                                op.operation = updateOperation.DOWNLOAD;
                            }
                        } else if (fs.existsSync(op.local)) {
                            op.status = updateStatus.DONE;
                        } else {
                            op.operation = updateOperation.DOWNLOAD;
                        }
                        break;

                    case updateOperation.DOWNLOAD:
                        if (fs.existsSync(op.local)) {
                            if (op.type == updateType.UNZIP) {
                                op.operation = updateOperation.UNZIP;
                            } else {
                                op.status = updateStatus.DONE;
                            }
                        }
                        else {
                            op.status = updateStatus.RUNNING;
                            visualText.download(op);
                        }
                        break;
                        
                    case updateOperation.DELETE:
                        if (fs.existsSync(op.local)) {
                            visualText.debugMessage('Deleting: ' + op.local);
                            fs.unlinkSync(op.local);
                        }
                        if (op.folders.length) {
                            for (let folder of op.folders) {
                                let f = path.join(path.dirname(op.local),folder);
                                if (fs.existsSync(f)) {
                                    dirfuncs.delDir(f);
                                }
                            }
                        }
                        op.status = updateStatus.DONE;
                        break;

                    case updateOperation.UNZIP:
                        op.status = updateStatus.RUNNING;
                        visualText.unzip(op);
                        break;

                    case updateOperation.VERSION:

                        switch(op.component) {
                            case updateComponent.NLP_EXE:
                                visualText.checkExeVersion(op);
                                break;
                            
                            case updateComponent.VT_FILES:
                                visualText.checkVTFilesVersion(op);
                                break;
                                                            
                            case updateComponent.ANALYZER_FILES:
                                if (visualText.debug) visualText.debugMessage('VERSION CHECK: Analyzers');
                                visualText.checkAnalyzersVersion(op);
                                break;
                        }
                    break;
                }
                break;
            
            case updateStatus.RUNNING:
                let donothing = 1;
                break;
        }
    }

    emptyOp(): updateOp {
        return {type: updateType.UNKNOWN, status: updateStatus.UNKNOWN, operation: updateOperation.UNKNOWN, component: updateComponent.UNKNOWN, remote: '', local: '', folders: []};
    }

    checkExeVersion(op: updateOp) {
        if (!fs.existsSync(op.local)) {
            visualText.pushDownloadEngineFiles(updatePush.FRONT);
        }
        visualText.fetchExeVersion(op.local)?.then(version => {
            visualText.checkEngineVersion(op)
            .then(newerVersion => {
                if (newerVersion) {
                    visualText.pushDownloadEngineFiles(updatePush.FRONT);
                    visualText.pushDeleteEngineFiles(updatePush.FRONT);
                }
                op.status = updateStatus.DONE;
            })
        })
        .catch(error => {
            op.status = updateStatus.FAILED;
        });
        op.status = updateStatus.RUNNING;
    }

    checkVTFilesVersion(op: updateOp): boolean {
        const https = require('follow-redirects').https;

        const request = https.get(this.GITHUB_VISUALTEXT_FILES_LATEST_VERSION, function (res) {
            res.on('data', function (chunk) {
                let newer = false;
                if (op.status != updateStatus.DONE) {
                    let url = res.responseUrl;
                    visualText.repoVTFilesVersion = url.substring(url.lastIndexOf('/') + 1);
                    let currentVersion = visualText.getVTFilesVersion();
                    if (visualText.debug) visualText.debugMessage('VisualText Files Versions: ' + currentVersion + ' == ' + visualText.repoVTFilesVersion);

                    if (currentVersion) {
                        visualText.vtFilesVersion = currentVersion;
                        if (visualText.versionCompare(visualText.repoVTFilesVersion,currentVersion) > 0) {
                            newer = true;
                        }                       
                    }
                    else {
                        newer = true;
                    }
                    if (newer) {
                        visualText.setVTFilesVersion(visualText.repoVTFilesVersion);  
                        visualText.pushDownloadVTFiles(updatePush.FRONT);
                        visualText.pushDeleteVTFiles(updatePush.FRONT);

                    }
                    op.status = updateStatus.DONE;
                }
                return newer;
            });
        }).on('error', function (err) {
            op.status = updateStatus.FAILED;
        });
        op.status = updateStatus.RUNNING;

        return false;
    }

    checkAnalyzersVersion(op: updateOp): boolean {
        const https = require('follow-redirects').https;

        const request = https.get(this.GITHUB_ANALYZERS_LATEST_VERSION, function (res) {
            res.on('data', function (chunk) {
                let newer = false;
                if (op.status != updateStatus.DONE) {
                    let url = res.responseUrl;
                    visualText.repoAnalyzersVersion = url.substring(url.lastIndexOf('/') + 1);
                    let currentVersion = visualText.getAnalyzersVersion();
                    if (visualText.debug) visualText.debugMessage('Analyzers Versions: ' + currentVersion + ' == ' + visualText.repoAnalyzersVersion);
                    if (currentVersion) {
                        visualText.analyzersVersion = currentVersion;
                        if (visualText.versionCompare(visualText.repoAnalyzersVersion,currentVersion) > 0) {
                            newer = true;
                        }                       
                    }
                    else {
                        newer = true;
                    }
                    if (newer) {
                        visualText.setAnalyzersVersion(visualText.repoAnalyzersVersion);  
                        visualText.pushDownloadAnalyzers(updatePush.FRONT);
                        visualText.pushDeleteAnalyzers(updatePush.FRONT);
                    }
                    op.status = updateStatus.DONE;                    
                }
                return newer;
            });
        }).on('error', function (err) {
            op.status = updateStatus.FAILED;
        });
        op.status = updateStatus.RUNNING;

        return false;
    }

    download(op: updateOp) {
        const Downloader = require('nodejs-file-downloader');

        (async () => {
            var dir = path.dirname(op.local);
            var filename = path.basename(op.local);
            var url = op.remote;

            const downloader = new Downloader({
                url: url,   
                directory: dir,
                filename: filename
            });
            let moose = 1;
            try {
                visualText.debugMessage('Downloading: ' + url);
                await downloader.download();
                visualText.debugMessage('DONE DOWNLOAD: ' + url);
                if (op.type == updateType.UNZIP && !visualText.stopAll) {
                    op.operation = updateOperation.UNZIP;
                    op.status = updateStatus.START;
                } else {
                    op.status = updateStatus.DONE;
                }
            }
            catch (error) {
                op.status = updateStatus.FAILED;
                visualText.debugMessage('FAILED download: ' + url + '\n' + error);
            }
        })();  
    }

    unzip(op: updateOp) {
        (async () => {
            const toPath = op.local;
            const vtFileDir = path.dirname(op.local);

            const extract = require('extract-zip')
            try {
                this.debugMessage('Unzipping: ' + toPath);
                await extract(toPath, { dir: vtFileDir });
                this.debugMessage('UNZIPPED: ' + toPath);
                op.status = updateStatus.DONE;
                dirfuncs.delFile(toPath);
            }
            catch (err) {
                this.debugMessage('Could not unzip file: ' + toPath + '\n' + err);
                op.status = updateStatus.FAILED;
            }
        })();
    }

    public debugMessage(msg: string) {
        logView.addMessage(msg,undefined);
        vscode.commands.executeCommand('logView.refreshAll');
    }

	readState(): boolean {
        if (vscode.workspace.workspaceFolders) {
            this.analyzerDir = this.workspaceFold;
            if (this.jsonState.jsonParse(this.analyzerDir,'state')) {
                var saveit = false;
                var parse = this.jsonState.json.visualText[0];
                var currAnalyzer = parse.currentAnalyzer;

                if (currAnalyzer.length > 0 && !fs.existsSync(currAnalyzer)) {
                    this.setCurrentAnalyzer(vscode.Uri.file(''));
                }
                else if (currAnalyzer.length == 0) {
                    var analyzers = dirfuncs.getDirectories(this.workspaceFold);
                    currAnalyzer = analyzers[0].fsPath;
                    saveit = true;
                }

                if (currAnalyzer) {
                    if (fs.existsSync(currAnalyzer))
                        this.currentAnalyzer = vscode.Uri.file(currAnalyzer);
                    else
                        this.currentAnalyzer = vscode.Uri.file(path.join(this.analyzerDir.fsPath,currAnalyzer));

                    if (saveit)
                        this.saveCurrentAnalyzer(this.analyzerDir);
                    this.loadAnalyzer(this.currentAnalyzer);
                    return true;
                }
            } else {
                this.saveCurrentAnalyzer(this.analyzerDir);
            }
        }
        return false;
    }

    initSettings(): boolean {
        var fromDir = path.join(visualText.getExtensionPath().fsPath,'.vscode');
        if (fs.existsSync(fromDir)) {
            var toDir = path.join(this.analyzerDir.fsPath,'.vscode');
            if (!fs.existsSync(toDir)) {
                if (!dirfuncs.copyDirectory(fromDir,toDir)) {
                    vscode.window.showWarningMessage('Copy settings file failed');
                    return false;
                }
                return true;           
            }
            this.ensureExists('settings.json',toDir,fromDir);
            this.ensureExists('state.json',toDir,fromDir);
        }
        return false;
    }

    ensureExists(fileName: string, toDir: string, fromDir: string) {
        var toFile = path.join(toDir,fileName);
        if (!fs.existsSync(toFile)) {
            var fromFile = path.join(fromDir,fileName);
           fs.copyFileSync(fromFile,toFile);
        }   
    }

    readConfig() {
        this.configFindUsername();
        this.configAnalzyerDirectory();
        this.getAnalyzers();
        this.configCurrentAnalzyer();
    }

    configCurrentAnalzyer() {
        if (vscode.workspace.workspaceFolders) {
            const config = vscode.workspace.getConfiguration('analyzer',this.workspaceFold);
            var current = config.get<string>('current');
            if (!current) {
                if (this.analyzers.length) {
                    this.currentAnalyzer = this.analyzers[0];
                    config.update('current',this.currentAnalyzer.fsPath,vscode.ConfigurationTarget.WorkspaceFolder);
                    this.debugMessage('Current analyzer: '+this.currentAnalyzer.fsPath);
                }
            } else {
                this.currentAnalyzer = vscode.Uri.file(current);
            }            
        }
    }

    configAnalzyerDirectory() {
        const config = vscode.workspace.getConfiguration('analyzer');

        if (vscode.workspace.workspaceFolders && dirfuncs.analyzerFolderCount(this.workspaceFold)) {
            directory = this.workspaceFold.fsPath;
        } else {
            var directory = config.get<string>('directory');
            if (!directory) {
                directory = path.join(this.engineDir.fsPath,'analyzers');
            }
        }

        this.analyzerDir = vscode.Uri.file(directory);    
        if (directory.length > 1)
            config.update('directory',directory,vscode.ConfigurationTarget.Global);
    }

    checkForEngineUpdate() {
        var op: updateOp = visualText.emptyOp();
        this.checkEngineVersion(op)
        .then(newerVersion => {
            if (newerVersion) {
                visualText.setUpdateEngine();
            } else {
                visualText.setEngineVersion(visualText.repoEngineVersion);
                visualText.debugMessage('NLP Engine version ' + visualText.repoEngineVersion);
            }
            if (nlpStatusBar !== undefined) {
                nlpStatusBar.updateEngineVersion(visualText.engineVersion);     
            }
        }).catch(err => {
            this.debugMessage(err);
        });
    }

    checkEngineVersion(op: updateOp) {
        return new Promise((resolve,reject) => {

            const https = require('follow-redirects').https;

            const request = https.get(this.GITHUB_ENGINE_LATEST_VERSION, function (res) {
                res.on('data', function (chunk) {
                    var newer = false;
                    if (op.status != updateStatus.DONE) {
                        let url = res.responseUrl;
                        visualText.repoEngineVersion = url.substring(url.lastIndexOf('/') + 1);
                        let cmdVersion = visualText.cmdEngineVersion;
                        let repoVersion = visualText.repoEngineVersion;
                        if (visualText.debug) visualText.debugMessage('NLP.EXE Versions: ' + cmdVersion + ' == ' + repoVersion);

                        if (cmdVersion && repoVersion) {
                            if (visualText.versionCompare(repoVersion,cmdVersion) > 0) {
                                newer = true;
                            }
                        } else {
                            newer = true;
                        }
                        op.status = updateStatus.DONE;           
                    }
                    resolve(newer);
                });
            }).on('error', function (err) {
                reject(err);
            });
            request.end();
        });
    }

    failedWarning() {
        vscode.window.showErrorMessage("Update failed", "Click here to see solutions").then(response => {
            logView.downloadHelp();
        });
    }

    getVersions() {
        let engVersion = visualText.getEngineVersion();
        if (engVersion?.startsWith('[command arg:'))
            engVersion = '';
        if (engVersion)
            visualText.engineVersion = engVersion;
        else
            visualText.engineVersion = '';

        let vtVersion = visualText.getVTFilesVersion();
        if (vtVersion)
            visualText.vtFilesVersion = vtVersion;
        else
            visualText.vtFilesVersion = '';
    }

    findExtensionIndex(engDir: string): number {
        var index = 0;
        for (let ext of this.extensionItems) {visualText.stopAll
            if (engDir.startsWith(ext.uri.fsPath))
                break;
            index++;
        }
        return index;
    }

    versionFromPath(extDir: vscode.Uri): string {
        var dir = extDir.fsPath;
        var version = dir.substring(dir.lastIndexOf(this.EXTENSION_NAME) + 1 + this.EXTENSION_NAME.length);
        return version;
    }

    versionCompare(version1: string, version2: string): number {
        if (!version1.length || !version2.length)
            return 0;

        var toks1 = version1.split('.');
        var toks2 = version2.split('.');
        var num = toks1.length > toks2.length ? toks1.length : toks2.length;
        for (let i = 0; i < num; i++) {
            let v1 = parseInt(visualText.trimV(toks1[i]));
            let v2 = parseInt(visualText.trimV(toks2[i]));
            if (v1 > v2) return 1;
            if (v2 > v1) return -1;
        }
        return 0;
    }

    trimV(version: string): string {
        var ret = version;
        if (version.substring(0,1) == 'v') {
            ret = version.substring(1,version.length);
        }
        return ret;
    }

    exePath() {
        return vscode.Uri.file(path.join(visualText.engineDirectory().fsPath,visualText.NLP_EXE));
    }

    engineDirectory() {
        return vscode.Uri.file(path.join(this.extensionDirectory().fsPath,this.NLPENGINE_REPO));
    }

    extensionDirectory() {
        return vscode.Uri.file(path.join(this.extensionParentDirectory().fsPath,this.EXTENSION_NAME+'-'+this.version));
    }

    extensionParentDirectory() {
        let extDir = '.vscode';
        if (this.platform == 'linux') {
            extDir = '.vscode-server';
        }
        return vscode.Uri.file(path.join(this.homeDir,extDir,'extensions'));
    }

    visualTextFilesDirectory() {
        return vscode.Uri.file(path.join(this.engineDirectory().fsPath,this.VISUALTEXT_FILES_REPO));
    }
  
    fetchExeVersion(nlpExePath: string = '', debug: boolean=false) {
        visualText.cmdEngineVersion = '';
		const cp = require('child_process');
        return new Promise((resolve,reject) => {
            const child = cp.spawn(nlpExePath, ['--version']);
            let stdOut = "";
            let stdErr = "";
            child.stdout.on("data", (data) => {
                let versionStr = data.toString();
                if (debug) visualText.debugMessage('version str: ' + versionStr);
                let tokens = versionStr.split('\r\n');
                if (tokens.length) {
                    if (tokens.length == 1)
                        visualText.cmdEngineVersion = versionStr;
                    else
                        visualText.cmdEngineVersion = tokens[tokens.length - 2];
                    if (debug) visualText.debugMessage('version found: ' + visualText.cmdEngineVersion);
                }
                resolve(visualText.cmdEngineVersion);
            });
        }).catch(err => {
            visualText.debugMessage(err);
        });
	}

    getExampleAnalyzersPath(): vscode.Uri {
       return vscode.Uri.file(path.join(visualText.getExtensionPath().fsPath,visualText.NLPENGINE_REPO,visualText.ANALYZERS_REPO));
    }

    getExtensionPath(): vscode.Uri {
        return this.extensionItems[this.latestExtIndex].uri;
    }

    getExtensionDirs() {
        var parentDir = this.extensionParentDirectory();
        var dirs: vscode.Uri[] = new Array();
        this.extensionItems = [];
        dirs = dirfuncs.getDirectories(parentDir);
        var latestVersion = '';
        this.latestExtIndex = -1;
        var counter = 0;

        for (let dir of dirs) {
            var name = path.basename(dir.fsPath);
            if (name.startsWith(this.EXTENSION_NAME)) {
                let version = this.versionFromPath(dir);
                if (latestVersion.length == 0 || this.versionCompare(version, latestVersion) > 0) {
                    latestVersion = version;
                    this.latestExtIndex = counter;
                }
                this.extensionItems.push({uri: dir, version: version, latest: false});
                counter++;
            }
        }

        if (this.latestExtIndex >= 0) {
            this.extensionItems[this.latestExtIndex].latest = true; 
        }
    }

    setEngineVersion(version: string) {
        this.engineVersion = version;
        const config = vscode.workspace.getConfiguration('engine');
        config.update('version',version,vscode.ConfigurationTarget.Global);
    }

    getEngineVersion(): string | undefined {
        const config = vscode.workspace.getConfiguration('engine');
        return config.get<string>('version');
    }
    
    setVTFilesVersion(version: string) {
        this.vtFilesVersion = version;
        const config = vscode.workspace.getConfiguration('engine');
        config.update('visualtext',version,vscode.ConfigurationTarget.Global);
    }

    getVTFilesVersion(): string | undefined {
        const config = vscode.workspace.getConfiguration('engine');
        var version = config.get<string>('visualtext');
        return config.get<string>('visualtext');
    }

    setAnalyzersVersion(version: string) {
        this.vtFilesVersion = version;
        const config = vscode.workspace.getConfiguration('engine');
        config.update('analyzers',version,vscode.ConfigurationTarget.Global);
    }

    getAnalyzersVersion(): string | undefined {
        const config = vscode.workspace.getConfiguration('engine');
        var version = config.get<string>('analyzers');
        return config.get<string>('analyzers');
    }

    configFindUsername() {
        const config = vscode.workspace.getConfiguration('user');
        const username = config.get<string>('name');
        if (!username) {
            vscode.window.showErrorMessage("No user name for comments.", "Enter user name").then(response => {
                vscode.window.showInputBox({ value: 'Your Name', prompt: 'Enter author name for comments' }).then(username => {
                    if (username) {
                        visualText.username = username;
                        config.update("name",username,vscode.ConfigurationTarget.Global);
                    }
                });
            });
        } else {
            this.username = username;
        }
    }

    saveCurrentAnalyzer(currentAnalyzer: vscode.Uri) {
        var stateJsonDefault: any = {
            "visualText": [
                {
                    "name": "Analyzer",
                    "type": "state",
                    "currentAnalyzer": currentAnalyzer.fsPath   
                }
            ]
        }
        this.jsonState.saveFile(this.analyzerDir.fsPath, 'state', stateJsonDefault);
        this.setCurrentAnalyzer(currentAnalyzer);       
    }

    loadAnalyzer(analyzerDirectory: vscode.Uri) {
        this.saveCurrentAnalyzer(analyzerDirectory);
        this.analyzer.load(analyzerDirectory);
        vscode.commands.executeCommand('textView.refreshAll');
        vscode.commands.executeCommand('sequenceView.refreshAll');
        vscode.commands.executeCommand('kbView.refreshAll');
        vscode.commands.executeCommand('outputView.refreshAll');
    }

    setCurrentAnalyzer(currentAnalyzer: vscode.Uri) {
        if (this.jsonState.json) {
            var parse = this.jsonState.json.visualText[0];
            parse.currentAnalyzer = currentAnalyzer.fsPath;
            this.jsonState.writeFile();
        }
    }

    getCurrentAnalyzer(): vscode.Uri {
        return this.currentAnalyzer;
    }
    
    getCurrentAnalyzerName(): string {
        return this.analyzer.getName();
    }

    getAnalyzer(): vscode.Uri {
        return this.currentAnalyzer;
    }

    hasAnalyzers(): boolean {
        return this.analyzers.length ? true : false;
    }

    getAnalyzerDir(): vscode.Uri {
        return this.analyzerDir;
    }

    getAnalyzers(): vscode.Uri[] {
        if (this.analyzerDir.fsPath.length) {
            var anas: vscode.Uri[] = [];
            anas = dirfuncs.getDirectories(this.analyzerDir);
            this.analyzers = [];
            for (let ana of anas) {
                if (visualText.isAnalyzerDirectory(ana))
                    this.analyzers.push(ana);
            }
        }
        return this.analyzers;
    }

	hasWorkspaceFolder(): boolean {
		return this.workspaceFold?.fsPath.length ? true : false;
	}

	getWorkspaceFolder(): vscode.Uri {
        if (this.workspaceFold) {
		    return this.workspaceFold;            
        }
        return vscode.Uri.file('');
    }

    visualTextDirectoryExists(): boolean {
        return fs.existsSync(this.getVisualTextDirectory());
    }

    getVisualTextDirectory(dirName: string=''): string {
        var vtDir = '';
        var engineDir = this.engineDirectory().fsPath;
        var vtDirName = 'visualtext';
        if (engineDir) {
            if (dirName.length)
                vtDir = path.join(engineDir,vtDirName,dirName);
            else
                vtDir = path.join(engineDir,vtDirName);
        }
        return vtDir;
    }

    isAnalyzerDirectory(dirPath: vscode.Uri): boolean {
        var dirs = dirfuncs.getDirectories(dirPath);
        var spec = false;
        var kb = false;
        var input = false;

        for (let dir of dirs) {
            if (path.basename(dir.fsPath).localeCompare('spec') == 0) {
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

    setUpdateEngine(): boolean {
        var uri = visualText.getExtensionPath();
        if (uri) {
            this.debugMessage('NLP Engine updating version');
            return true;   
        }
        return false;
    }
    
    updateEngine() {
        visualText.pushDownloadEngineFiles(updatePush.FRONT);
        visualText.pushDeleteEngineFiles(updatePush.FRONT);
        visualText.startUpdater();          
    }

    updateVTFiles() {
        visualText.pushDeleteVTFiles(updatePush.BACK);
        visualText.pushDownloadVTFiles(updatePush.BACK);
        this.startUpdater(); 
    }

    updateAnalyzersFiles() {
        visualText.pushDeleteAnalyzers(updatePush.BACK);
        visualText.pushDownloadAnalyzers(updatePush.BACK);
        this.startUpdater(); 
    }

	convertPatFiles(analyzerDir: vscode.Uri) {
        var spec = vscode.Uri.file(path.join(analyzerDir.fsPath,'spec'));
		var op = visualText.fileOps.addFileOperation(spec,spec,[fileOpRefresh.ANALYZER],fileOperation.RENAME,'pat','nlp');
        op.oneOff = fileOneOff.PAT_TO_NLP;
		visualText.fileOps.startFileOps();
	}

    stopFileOps() {
        visualText.fileOps.stopAll();
    }

	colorizeAnalyzer() {
		if (vscode.workspace.workspaceFolders) {
            let add = false;
            var toDir = vscode.workspace.workspaceFolders[0].uri;
			var toFile = path.join(toDir.fsPath,'.vscode','settings.json');
            var fromDir = visualText.extensionDirectory();
            var fromFile = path.join(fromDir.fsPath,'.vscode','settings.json');
			if (fs.existsSync(toFile)) {
                if (this.jsonState.jsonParse(toDir,'settings')) {
                    if (!this.jsonState.json.hasOwnProperty('editor.tokenColorCustomizations')) {
                        const settingsObj1 = this.jsonState.json;
                        this.jsonState.jsonParse(fromDir,'settings')
                        const settingsObj2 = this.jsonState.json;
                         
                        const mergedObj = {
                          ...settingsObj1,
                          ...settingsObj2
                        };
                        this.jsonState.saveFile(toDir.fsPath,"settings",mergedObj);
                    }             
                }
			} else
                add = true;

            if (add) {
				dirfuncs.copyFile(fromFile,toFile);
                this.debugMessage('Copying settings file with colorization: ' + fromFile + ' => ' + toFile); 
            }
		}
	}

	openFileManager(dir: string) {
		let platformCmd = '';
		if (os.platform() == 'win32') {
			platformCmd = 'explorer.exe';
		} else if (os.platform() == 'linux') {
			platformCmd = 'xdg-open';
		} else if (os.platform() == 'darwin') {
			platformCmd = 'open';
		}
		if (platformCmd != '') {
			let cmd = platformCmd + ' ' + dir;
			const cp = require('child_process');
			cp.exec(cmd, (err, stdout, stderr) => {
                console.log('stdout: ' + stdout);
                console.log('stderr: ' + stderr);
            });
        } else {
            vscode.window.showInformationMessage('Couldn\'t open nlp engine folder');
		}
	}

    createPanel(title: string): vscode.WebviewPanel {
        return vscode.window.createWebviewPanel(
            'logView',
            title,
            {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: false
            }
        );
    }

    displayHTMLFile(title:string, filename: string) {
        let htmlFile = path.join(visualText.extensionDirectory().fsPath,filename);
        if (fs.existsSync(htmlFile)) {
            this.displayHTML(title,fs.readFileSync(htmlFile, 'utf8'));
        }
	}

	displayHTML(title: string, html: string) {
		const panel = this.createPanel(title);
		if (panel) {
			panel.webview.html = html;
		}
	}
}
