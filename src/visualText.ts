import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Analyzer } from './analyzer';
import { dirfuncs } from './dirfuncs';
import { JsonState } from './jsonState';
import { nlpStatusBar } from './status';
import { logView, logLineType } from './logView';
import { FileOps, fileOperation, fileOpRefresh, fileOneOff } from './fileOps';
import { NLPFile } from './nlp';
import { ModFile } from './modFile';
import { SequenceFile } from './sequence';
import { TextFile } from './textFile';

export enum upStat { UNKNOWN, START, RUNNING, CANCEL, FAILED, DONE }
export enum upOp { UNKNOWN, CHECK_EXISTS, VERSION, DOWNLOAD, UNZIP, DELETE, FAILED, DONE }
export enum upType { UNKNOWN, VERSION, DOWNLOAD, DELETE, UNZIP }
export enum upComp { UNKNOWN, ICU1, ICU2, NLP_EXE, ENGINE_FILES, ANALYZER_FILES, VT_FILES }
export enum upPush { FRONT, BACK }

export interface updateOp {
    type: upType;
    status: upStat;
    operation: upOp;
    component: upComp;
    remote: string;
    local: string;
    folders: Array<string>;
    version: string;
}

interface ExtensionItem {
    uri: vscode.Uri;
    version: string;
    latest: boolean;
}

interface TestItem {
    fileCount: number;
    matchFiles: number;
    matchLines: number;
    misFiles: number;
    misLines: number;
}

// HOW TO CALL IT
//(async() => { await closeFileIfOpen(original); })();
export async function closeFileIfOpen(file: vscode.Uri): Promise<void> {
    const tabs: vscode.Tab[] = vscode.window.tabGroups.all.map(tg => tg.tabs).flat();
    const index = tabs.findIndex(tab => tab.input instanceof vscode.TabInputText && tab.input.uri.path === file.path);
    if (index !== -1) {
        await vscode.window.tabGroups.close(tabs[index]);
    }
}

export let visualText: VisualText;
export class VisualText {
    _ctx: vscode.ExtensionContext;
    public opsQueue: updateOp[] = new Array();
    public statusStrs = ['UNKNOWN', 'START', 'RUNNING', 'CANCEL', 'FAILED', 'DONE'];
    public opStrs = ['UNKNOWN', 'CHECK_EXISTS', 'VERSION', 'DOWNLOAD', 'UNZIP', 'DELETE', 'FAILED', 'DONE'];
    public compStrs = ['UNKNOWN', 'ICU1', 'ICU2', 'NLP_EXE', 'ENGINE_FILES', 'ANALYZER_FILES', 'VT_FILES'];

    public readonly LOG_SUFFIX = '_log';
    public readonly TEST_SUFFIX = '_test';
    public readonly EXTENSION_NAME = 'dehilster.nlp';
    public readonly NLP_EXE = 'nlp.exe';
    public readonly ICU1_WIN = 'icudt74.dll';
    public readonly ICU2_WIN = 'icuuc74.dll';
    public readonly NLPENGINE_FILES_ASSET = 'nlpengine.zip';
    public readonly NLPENGINE_REPO = 'nlp-engine';
    public readonly VISUALTEXT_FILES_REPO = 'visualtext-files';
    public readonly ANALYZERS_REPO = 'analyzers';
    public readonly VISUALTEXT_FILES_ASSET = 'visualtext.zip';
    public readonly ANALYZERS_ASSET = 'analyzers.zip';
    public readonly ANALYZER_SEQUENCE_FILE = 'analyzer.seq';
    public readonly ANALYZER_SEQUENCE_FOLDER = 'spec';
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
    public mod = new ModFile();
    public modFiles: vscode.Uri[] = new Array();
    public version: string = '';
    public engineVersion: string = '';
    public exeEngineVersion: string = '';
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
    public fastAnswered: boolean = false;

    private autoUpdateFlag: undefined | boolean = false;
    private platform: string = '';
    private homeDir: string = '';
    private username: string = '';
    private jsonState = new JsonState();
    private analyzers: vscode.Uri[] = new Array();
    private libraryFiles: string[] = new Array();
    private extensionDir: vscode.Uri = vscode.Uri.file('');

    private analyzerDir: vscode.Uri = vscode.Uri.file('');
    private currentAnalyzer: vscode.Uri = vscode.Uri.file('');
    private workspaceFold: vscode.Uri = vscode.Uri.file('');
    private modFile: vscode.Uri = vscode.Uri.file('');

    private extensionItems: ExtensionItem[] = new Array();
    private latestExtIndex: number = 0;
    private lastestEngineIndex: number = 0;
    private updaterID: number = 0;

    private testItem: TestItem = { fileCount: 0, matchFiles: 0, matchLines: 0, misFiles: 0, misLines: 0 };

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

    editTestFiles(uri: vscode.Uri, outputPathFlag: boolean = false) {
        if (visualText.getWorkspaceFolder()) {
            const testFolder = this.analyzer.testFolder(uri, outputPathFlag);
            const files = dirfuncs.getFiles(testFolder);
            if (files.length > 1) {
                const items: vscode.QuickPickItem[] = [];
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
            } else {
                vscode.window.showTextDocument(vscode.Uri.file(files[0].fsPath));
            }
        }
    }

    regressionTestFile(): string {
        return path.join(visualText.analyzer.getKBDirectory().fsPath, 'regression.test');
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

    runTest(textFile: vscode.Uri) {
        const inputDir = visualText.analyzer.getInputDirectory().fsPath;
        const relPath = textFile.fsPath.substring(inputDir.length + 1, textFile.fsPath.length);
        const outputFolder = path.join(inputDir, relPath + visualText.LOG_SUFFIX);
        const testFolder = path.join(inputDir, relPath + visualText.TEST_SUFFIX);
        const files = dirfuncs.getFiles(vscode.Uri.file(testFolder));
        for (const testFile of files) {
            const outputFile = path.join(outputFolder, path.basename(testFile.fsPath));
            if (fs.existsSync(outputFile)) {
                this.testDiff(path.basename(textFile.fsPath), outputFile, testFile.fsPath);
            }
        }
        // vscode.commands.executeCommand("vscode.diff", testFolder, uri);
    }

    testDiff(textFile: string, file: string, testFile: string) {
        const testResults = this.regressionTestFile();
        const fileText = new TextFile(file);
        const testText = new TextFile(testFile);
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
            } else {
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
        } else {
            this.testItem.matchFiles++;
        }
        fs.appendFileSync(testResults, report);
    }

    setModFile(filePath: vscode.Uri) {
        this.mod.setFile(filePath);
    }

    modExists() {
        return this.mod.fileExists();
    }

    startUpdater(preInfoFlag: boolean = true) {
        if (this.updaterID == 0) {
            logView.clearLogs(false);
            this.platform = os.platform();
            const plat = this.platform == 'darwin' ? 'mac' : this.platform;
            this.homeDir = os.homedir();
            const rootPath = this.getLatestExtPath(this.extensionParentDirectory());
            if (rootPath) this.extensionDir = vscode.Uri.file(rootPath);
            this.version = vscode.extensions.getExtension(this.EXTENSION_NAME)?.packageJSON.version;

            if (preInfoFlag) {
                this.debugMessage('Platform: ' + plat, logLineType.UPDATER);
                this.debugMessage('User profile path: ' + this.homeDir, logLineType.UPDATER);
                this.debugMessage('VSCode NLP++ Extension path: ' + this.extensionDir.fsPath, logLineType.UPDATER);
            }

            this.debugMessage('Checking for updates or repairs...', logLineType.UPDATER);
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
        this.debugMessage('STOP requested by user', logLineType.UPDATER);
        for (const o of visualText.opsQueue) {
            if (o.status != upStat.RUNNING) {
                o.status = upStat.DONE;
            }
        }
        visualText.stopAll = true;
    }

    pushCheckVersions() {
        visualText.pushCheckEngineFiles();
        visualText.pushCheckVTFiles();
        visualText.pushCheckAnalyzerFiles();
    }

    pushCheckVTFiles() {
        const op = visualText.emptyOp();
        visualText.addUpdateOperation(op, upPush.BACK, upType.UNZIP, upStat.START, upOp.CHECK_EXISTS, upComp.VT_FILES);
    }

    pushCheckAnalyzerFiles() {
        const op = visualText.emptyOp();
        visualText.addUpdateOperation(op, upPush.BACK, upType.UNZIP, upStat.START, upOp.CHECK_EXISTS, upComp.ANALYZER_FILES);
    }

    pushCheckEngineFiles() {
        const op = visualText.emptyOp();
        if (visualText.platform == 'win32') {
            visualText.addUpdateOperation(op, upPush.BACK, upType.DOWNLOAD, upStat.START, upOp.CHECK_EXISTS, upComp.ICU1);
            visualText.addUpdateOperation(op, upPush.BACK, upType.DOWNLOAD, upStat.START, upOp.CHECK_EXISTS, upComp.ICU2);
        }
        visualText.addUpdateOperation(op, upPush.BACK, upType.DOWNLOAD, upStat.START, upOp.CHECK_EXISTS, upComp.NLP_EXE);
        visualText.addUpdateOperation(op, upPush.BACK, upType.UNZIP, upStat.START, upOp.CHECK_EXISTS, upComp.ENGINE_FILES);
    }

    pushDeleteEngineFiles(op: updateOp, push: upPush) {
        if (visualText.platform == 'win32') {
            visualText.addUpdateOperation(op, push, upType.DELETE, upStat.START, upOp.DELETE, upComp.ICU1);
            visualText.addUpdateOperation(op, push, upType.DELETE, upStat.START, upOp.DELETE, upComp.ICU2);
        }
        visualText.addUpdateOperation(op, push, upType.DELETE, upStat.START, upOp.DELETE, upComp.NLP_EXE);
        visualText.addUpdateOperation(op, push, upType.DELETE, upStat.START, upOp.DELETE, upComp.ENGINE_FILES);
    }

    pushDeleteVTFiles(op: updateOp, push: upPush) {
        visualText.addUpdateOperation(op, push, upType.DELETE, upStat.START, upOp.DELETE, upComp.VT_FILES);
    }

    pushDeleteAnalyzers(op: updateOp, push: upPush) {
        visualText.addUpdateOperation(op, push, upType.DELETE, upStat.START, upOp.DELETE, upComp.ANALYZER_FILES);
    }

    pushDownloadEngineFiles(op: updateOp, push: upPush) {
        visualText.addUpdateOperation(op, push, upType.UNZIP, upStat.START, upOp.DOWNLOAD, upComp.ENGINE_FILES);
        visualText.addUpdateOperation(op, push, upType.DOWNLOAD, upStat.START, upOp.DOWNLOAD, upComp.NLP_EXE);
        if (visualText.platform == 'win32') {
            visualText.addUpdateOperation(op, push, upType.DOWNLOAD, upStat.START, upOp.DOWNLOAD, upComp.ICU2);
            visualText.addUpdateOperation(op, push, upType.DOWNLOAD, upStat.START, upOp.DOWNLOAD, upComp.ICU1);
        }
    }

    pushDownloadVTFiles(op: updateOp, push: upPush) {
        visualText.addUpdateOperation(op, push, upType.UNZIP, upStat.START, upOp.DOWNLOAD, upComp.VT_FILES);
    }

    pushDownloadAnalyzers(op: updateOp, push: upPush) {
        visualText.addUpdateOperation(op, push, upType.UNZIP, upStat.START, upOp.DOWNLOAD, upComp.ANALYZER_FILES);
    }

    addUpdateOperation(opIn: updateOp, push: upPush, type: upType, status: upStat, operation: upOp, component: upComp) {
        const op = { type: type, status: status, operation: operation, component: component, remote: '', local: '', folders: [], version: opIn.version };

        switch (component) {
            case upComp.ICU1:
            case upComp.ICU2:
                visualText.libFilenames(op);
                break;
            case upComp.NLP_EXE:
                visualText.nlpExe(op);
                break;
            case upComp.ENGINE_FILES:
                visualText.zipFiles(op, visualText.NLPENGINE_REPO, '', visualText.NLPENGINE_FILES_ASSET, ['data']);
                break;
            case upComp.VT_FILES:
                visualText.zipFiles(op, visualText.VISUALTEXT_FILES_REPO, 'visualText', visualText.VISUALTEXT_FILES_ASSET, [visualText.ANALYZER_SEQUENCE_FOLDER, 'Help', 'analyzers']);
                break;
            case upComp.ANALYZER_FILES:
                visualText.zipFiles(op, visualText.ANALYZERS_REPO, 'analyzers', visualText.ANALYZERS_ASSET, ['']);
                break;
        }

        if (push == upPush.BACK)
            this.opsQueue.push(op);
        else
            this.opsQueue.unshift(op);
    }

    zipFiles(op: updateOp, repo: string, folder: string, download: string, folders: string[]) {
        op.remote = visualText.GITHUB_REPOSITORY + repo + visualText.GITHUB_RELEASE_LATEST_DOWNLOAD + download;
        const engDir = visualText.engineDirectory().fsPath;
        op.local = path.join(engDir, folder, download);
        op.folders = [];
        for (const f of folders) {
            op.folders.push(path.join(folder, f));
        }
    }

    nlpExe(op: updateOp) {
        let exe = '';
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
        op.local = path.join(engDir, visualText.NLP_EXE);
    }

    libFilenames(op: updateOp) {
        let libRelease = '';
        let lib = '';
        const icu1 = op.component == upComp.ICU1 ? 1 : 0;
        switch (visualText.platform) {
            case 'win32':
                libRelease = icu1 ? visualText.ICU1_WIN : visualText.ICU2_WIN;
                lib = icu1 ? visualText.ICU1_WIN : visualText.ICU2_WIN;
                break;
        }
        op.remote = visualText.GITHUB_ENGINE_LATEST_RELEASE + libRelease;
        const engDir = visualText.engineDirectory().fsPath;
        op.local = path.join(engDir, lib);
    }

    getLatestExtPath(dir: vscode.Uri): string {
        const files = dirfuncs.getFiles(dir);
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
        let op = visualText.opsQueue[0];
        const q = visualText.opsQueue;
        let allDone = true;

        for (const o of visualText.opsQueue) {
            if (visualText.stopAll) {
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
            visualText.opsQueue = [];
            clearInterval(visualText.updaterID);
            visualText.updaterID = 0;
            if (visualText.stopAll)
                visualText.debugMessage('UPDATE STOPPED BY USER', logLineType.UPDATER);
            else
                visualText.debugMessage('UPDATE CHECK COMPLETE', logLineType.UPDATER);
            visualText.stopAll = false;
            vscode.commands.executeCommand('status.update');
            return;
        } else {
            vscode.commands.executeCommand('setContext', 'updating.running', true);
        }
        if (visualText.stopAll)
            return;

        if (visualText.debug)
            visualText.debugMessage(visualText.statusStrs[op.status] + ' ' + visualText.opStrs[op.operation] + ' ' + visualText.compStrs[op.component], logLineType.UPDATER);

        switch (op.status) {
            case upStat.START:
                switch (op.operation) {
                    case upOp.CHECK_EXISTS:
                        const endDir = path.join(visualText.getExtensionPath().fsPath, visualText.NLPENGINE_REPO);
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
                                if (visualText.isCompVersion(op))
                                    op.operation = upOp.VERSION;
                                else
                                    op.status = upStat.DONE;
                            } else {
                                op.operation = upOp.DOWNLOAD;
                            }
                        } else if (fs.existsSync(op.local)) {
                            if (visualText.isCompVersion(op))
                                op.operation = upOp.VERSION;
                            else
                                op.status = upStat.DONE;
                        } else {
                            op.operation = upOp.DOWNLOAD;
                        }
                        break;

                    case upOp.DOWNLOAD:
                        if (fs.existsSync(op.local)) {
                            if (op.type == upType.UNZIP) {
                                op.operation = upOp.UNZIP;
                            } else {
                                op.status = upStat.DONE;
                            }
                        }
                        else {
                            op.status = upStat.RUNNING;
                            visualText.download(op);
                        }
                        break;

                    case upOp.DELETE:
                        if (fs.existsSync(op.local)) {
                            visualText.debugMessage('Deleting: ' + op.local, logLineType.UPDATER);
                            fs.unlinkSync(op.local);
                        }
                        if (op.folders.length) {
                            for (const folder of op.folders) {
                                const f = path.join(path.dirname(op.local), folder);
                                if (fs.existsSync(f)) {
                                    dirfuncs.delDir(f);
                                }
                            }
                        }
                        op.status = upStat.DONE;
                        break;

                    case upOp.UNZIP:
                        op.status = upStat.RUNNING;
                        visualText.unzip(op);
                        break;

                    case upOp.VERSION:
                        if (op.version.length) {
                            visualText.updateVersion(op);
                            op.status = upStat.DONE;
                        } else {
                            switch (op.component) {
                                case upComp.NLP_EXE:
                                    visualText.checkExeVersion(op);
                                    break;

                                case upComp.VT_FILES:
                                    visualText.checkVTFilesVersion(op);
                                    break;

                                case upComp.ANALYZER_FILES:
                                    if (visualText.debug) visualText.debugMessage('VERSION CHECK: Analyzers', logLineType.UPDATER);
                                    visualText.checkAnalyzersVersion(op);
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

    isCompVersion(op: updateOp): boolean {
        return op.component == upComp.NLP_EXE || op.component == upComp.VT_FILES || op.component == upComp.ANALYZER_FILES;
    }

    emptyOp(): updateOp {
        return { type: upType.UNKNOWN, status: upStat.UNKNOWN, operation: upOp.UNKNOWN, component: upComp.UNKNOWN, remote: '', local: '', folders: [], version: '' };
    }

    updateVersion(op: updateOp) {
        switch (op.component) {
            case upComp.NLP_EXE:
                nlpStatusBar.updateEngineVersion(op.version);
                break;
            case upComp.VT_FILES:
                nlpStatusBar.updateFilesVersion(op.version);
                visualText.setVTFilesVersion(op.version);
                break;
            case upComp.ANALYZER_FILES:
                nlpStatusBar.updateAnalyzerssVersion(op.version);
                visualText.setAnalyzersVersion(op.version);
                break;
        }
    }

    checkExeVersion(op: updateOp) {
        visualText.fetchExeVersion(op)?.then(version => {
            visualText.checkEngineVersionRepo(op)
                .then(newerVersion => {
                    if (newerVersion) {
                        visualText.pushDownloadEngineFiles(op, upPush.FRONT);
                        visualText.pushDeleteEngineFiles(op, upPush.FRONT);
                    }
                    op.status = upStat.DONE;
                    visualText.updateVersion(op);
                })
        })
            .catch(error => {
                op.status = upStat.FAILED;
            });
        op.status = upStat.RUNNING;
    }

    checkEngineVersionRepo(op: updateOp) {
        return new Promise((resolve, reject) => {

            const https = require('follow-redirects').https;

            const request = https.get(this.GITHUB_ENGINE_LATEST_VERSION, function (res) {
                res.on('data', function (chunk) {
                    let newer = false;
                    if (op.status != upStat.DONE) {
                        const url = res.responseUrl;
                        visualText.repoEngineVersion = url.substring(url.lastIndexOf('/') + 1);
                        const exeVersion = visualText.exeEngineVersion;
                        const repoVersion = visualText.repoEngineVersion;
                        op.version = visualText.repoEngineVersion;
                        if (visualText.debug) visualText.debugMessage('NLP.EXE Versions: ' + exeVersion + ' == ' + repoVersion, logLineType.UPDATER);

                        if (exeVersion && repoVersion) {
                            if (visualText.versionCompare(repoVersion, exeVersion) > 0) {
                                newer = true;
                            }
                        } else {
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

    checkVTFilesVersion(op: updateOp) {
        const statusFlag = op.status == upStat.UNKNOWN ? true : false;
        visualText.checkVTFilesVersionRepo(op)
            .then(newerVersion => {
                if (newerVersion) {
                    visualText.pushDownloadVTFiles(op, upPush.FRONT);
                    visualText.pushDeleteVTFiles(op, upPush.FRONT);
                    if (statusFlag) {
                        op.component = upComp.VT_FILES;
                        visualText.startTimer();
                    }
                } else if (statusFlag) {
                    vscode.window.showInformationMessage('VisualText files verion ' + visualText.repoVTFilesVersion + ' is the latest');
                }
                op.status = upStat.DONE;
                visualText.updateVersion(op);
            })
    }

    checkVTFilesVersionRepo(op: updateOp) {
        return new Promise((resolve, reject) => {

            const https = require('follow-redirects').https;

            const request = https.get(this.GITHUB_VISUALTEXT_FILES_LATEST_VERSION, function (res) {
                res.on('data', function (chunk) {
                    let newer = false;
                    if (op.status != upStat.DONE) {
                        const url = res.responseUrl;
                        visualText.repoVTFilesVersion = url.substring(url.lastIndexOf('/') + 1);
                        op.version = visualText.repoVTFilesVersion;
                        const currentVersion = visualText.getVTFilesVersion();
                        if (visualText.debug)
                            visualText.debugMessage('VisualText Files Versions: ' + currentVersion + ' == ' + visualText.repoVTFilesVersion, logLineType.UPDATER);

                        if (currentVersion) {
                            visualText.vtFilesVersion = currentVersion;
                            if (visualText.versionCompare(visualText.repoVTFilesVersion, currentVersion) > 0) {
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

    checkAnalyzersVersion(op: updateOp) {
        const statusFlag = op.status == upStat.UNKNOWN ? true : false;
        visualText.checkAnalyzersVersionRepo(op)
            .then(newerVersion => {
                if (newerVersion) {
                    visualText.setAnalyzersVersion(visualText.repoAnalyzersVersion);
                    visualText.pushDownloadAnalyzers(op, upPush.FRONT);
                    visualText.pushDeleteAnalyzers(op, upPush.FRONT);
                    op.status = upStat.DONE;
                    visualText.updateVersion(op);
                } else if (statusFlag) {
                    vscode.window.showInformationMessage('Analyzers verion ' + visualText.repoAnalyzersVersion + ' is the latest');
                }
                op.status = upStat.DONE;
                visualText.updateVersion(op);
            })
    }

    checkAnalyzersVersionRepo(op: updateOp) {
        return new Promise((resolve, reject) => {
            const https = require('follow-redirects').https;

            const request = https.get(this.GITHUB_ANALYZERS_LATEST_VERSION, function (res) {
                res.on('data', function (chunk) {
                    let newer = false;
                    if (op.status != upStat.DONE) {
                        const url = res.responseUrl;
                        visualText.repoAnalyzersVersion = url.substring(url.lastIndexOf('/') + 1);
                        op.version = visualText.repoAnalyzersVersion;
                        const currentVersion = visualText.getAnalyzersVersion();
                        if (visualText.debug)
                            visualText.debugMessage('Analyzers Versions: ' + currentVersion + ' == ' + visualText.repoAnalyzersVersion, logLineType.UPDATER);
                        if (currentVersion) {
                            visualText.analyzersVersion = currentVersion;
                            if (visualText.versionCompare(visualText.repoAnalyzersVersion, currentVersion) > 0) {
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

    download(op: updateOp) {
        const Downloader = require('nodejs-file-downloader');

        (async () => {
            const dir = path.dirname(op.local);
            const filename = path.basename(op.local);
            const url = op.remote;

            const downloader = new Downloader({
                url: url,
                directory: dir,
                filename: filename
            });
            try {
                visualText.debugMessage('Downloading: ' + url, logLineType.UPDATER);
                await downloader.download();
                visualText.debugMessage('DONE DOWNLOAD: ' + url, logLineType.UPDATER);
                if (op.type == upType.UNZIP && !visualText.stopAll) {
                    op.operation = upOp.UNZIP;
                    op.status = upStat.START;
                } else if (visualText.isCompVersion(op)) {
                    op.operation = upOp.VERSION;
                    op.status = upStat.START;
                } else {
                    op.status = upStat.DONE;
                }
            }
            catch (error) {
                op.status = upStat.FAILED;
                visualText.debugMessage('FAILED download: ' + url + '\n' + error, logLineType.UPDATER);
            }
        })();
    }

    unzip(op: updateOp) {
        (async () => {
            const toPath = op.local;
            const vtFileDir = path.dirname(op.local);

            const extract = require('extract-zip')
            try {
                this.debugMessage('Unzipping: ' + toPath, logLineType.UPDATER);
                await extract(toPath, { dir: vtFileDir });
                this.debugMessage('UNZIPPED: ' + toPath, logLineType.UPDATER);
                op.status = upStat.DONE;
                dirfuncs.delFile(toPath);
            }
            catch (err) {
                this.debugMessage('Could not unzip file: ' + toPath + '\n' + err, logLineType.UPDATER);
                op.status = upStat.FAILED;
            }
        })();
    }

    public debugMessage(msg: string, type: logLineType = logLineType.INFO) {
        logView.addMessage(msg, type, undefined);
        vscode.commands.executeCommand('logView.refreshAll');
    }

    readState(): boolean {
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
                    const analyzers = dirfuncs.getDirectories(this.workspaceFold);
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
            } else {
                this.saveCurrentAnalyzer(this.analyzerDir);
            }
        }
        return false;
    }

    initSettings(): boolean {
        const fromDir = path.join(visualText.getExtensionPath().fsPath, '.vscode');
        if (fs.existsSync(fromDir)) {
            const toDir = path.join(this.analyzerDir.fsPath, '.vscode');
            if (!fs.existsSync(toDir)) {
                if (!dirfuncs.copyDirectory(fromDir, toDir)) {
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

    ensureExists(fileName: string, toDir: string, fromDir: string) {
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
            const current = config.get<string>('current');
            if (!current) {
                if (this.analyzers.length) {
                    this.currentAnalyzer = this.analyzers[0];
                    config.update('current', this.currentAnalyzer.fsPath, vscode.ConfigurationTarget.WorkspaceFolder);
                    this.debugMessage('Current analyzer: ' + this.currentAnalyzer.fsPath, logLineType.UPDATER);
                }
            } else {
                this.currentAnalyzer = vscode.Uri.file(current);
            }
        }
    }

    configAnalzyerDirectory() {
        const config = vscode.workspace.getConfiguration('analyzer');
        let directory: string;

        if (vscode.workspace.workspaceFolders && dirfuncs.analyzerFolderCount(this.workspaceFold)) {
            directory = this.workspaceFold.fsPath;
        } else {
            directory = config.get<string>('directory') || '';
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
            logView.downloadHelp();
        });
    }

    findExtensionIndex(engDir: string): number {
        let index = 0;
        for (const ext of this.extensionItems) {
            visualText.stopAll
            if (engDir.startsWith(ext.uri.fsPath))
                break;
            index++;
        }
        return index;
    }

    versionFromPath(extDir: vscode.Uri): string {
        const dir = extDir.fsPath;
        const version = dir.substring(dir.lastIndexOf(this.EXTENSION_NAME) + 1 + this.EXTENSION_NAME.length);
        return version;
    }

    versionCompare(version1: string, version2: string): number {
        if (!version1.length || !version2.length)
            return 0;

        const toks1 = version1.split('.');
        const toks2 = version2.split('.');
        const num = toks1.length > toks2.length ? toks1.length : toks2.length;
        for (let i = 0; i < num; i++) {
            const v1 = parseInt(visualText.trimV(toks1[i]));
            const v2 = parseInt(visualText.trimV(toks2[i]));
            if (v1 > v2) return 1;
            if (v2 > v1) return -1;
        }
        return 0;
    }

    trimV(version: string): string {
        let ret = version;
        if (version.substring(0, 1) == 'v') {
            ret = version.substring(1, version.length);
        }
        return ret;
    }

    exePath() {
        return vscode.Uri.file(path.join(visualText.engineDirectory().fsPath, visualText.NLP_EXE));
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

    fetchExeVersion(op: updateOp, debug: boolean = false) {
        dirfuncs.changeMod(op.local, 755);
        visualText.exeEngineVersion = '';
        const cp = require('child_process');
        return new Promise((resolve, reject) => {
            const child = cp.spawn(op.local, ['--version']);
            const stdOut = "";
            const stdErr = "";
            child.stdout.on("data", (data) => {
                const versionStr = data.toString();
                if (debug) visualText.debugMessage('version str: ' + versionStr, logLineType.UPDATER);
                const tokens = versionStr.split('\r\n');
                if (tokens.length) {
                    if (tokens.length == 1)
                        visualText.exeEngineVersion = versionStr;
                    else
                        visualText.exeEngineVersion = tokens[tokens.length - 2];
                    if (debug) visualText.debugMessage('version found: ' + visualText.exeEngineVersion, logLineType.UPDATER);
                }
                resolve(visualText.exeEngineVersion);
            });
        }).catch(err => {
            visualText.debugMessage(err, logLineType.UPDATER);
        });
    }

    getBlockAnalyzersPath(): vscode.Uri {
        return vscode.Uri.file(path.join(visualText.getExtensionPath().fsPath, visualText.NLPENGINE_REPO, visualText.ANALYZERS_REPO));
    }

    getExtensionPath(): vscode.Uri {
        return this.extensionItems[this.latestExtIndex].uri;
    }

    getExtensionDirs() {
        const parentDir = this.extensionParentDirectory();
        let dirs: vscode.Uri[] = new Array();
        this.extensionItems = [];
        dirs = dirfuncs.getDirectories(parentDir);
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

    setTextFastLoad(fastFlag: boolean) {
        this.autoUpdateFlag = fastFlag;
        const config = vscode.workspace.getConfiguration('textView');
        config.update('fast', fastFlag, vscode.ConfigurationTarget.Global);
        vscode.commands.executeCommand('setContext', 'textView.fastload', fastFlag);
    }

    getTextFastLoad(): boolean | undefined {
        const config = vscode.workspace.getConfiguration('textView');
        const version = config.get<string>('visualText');
        return config.get<boolean>('fast');
    }

    setAutoUpdate(autoUpdateFlag: boolean) {
        this.autoUpdateFlag = autoUpdateFlag;
        const config = vscode.workspace.getConfiguration('update');
        config.update('auto', autoUpdateFlag, vscode.ConfigurationTarget.Global);
    }

    getAutoUpdate(): boolean | undefined {
        const config = vscode.workspace.getConfiguration('update');
        const version = config.get<string>('visualText');
        return config.get<boolean>('auto');
    }

    configAutoUpdate() {
        this.autoUpdateFlag = this.getAutoUpdate();
    }

    setVTFilesVersion(version: string) {
        this.vtFilesVersion = version;
        const config = vscode.workspace.getConfiguration('engine');
        config.update('visualtext', version, vscode.ConfigurationTarget.Global);
    }

    getVTFilesVersion(): string | undefined {
        const config = vscode.workspace.getConfiguration('engine');
        const version = config.get<string>('visualtext');
        return config.get<string>('visualtext');
    }

    setAnalyzersVersion(version: string) {
        this.vtFilesVersion = version;
        const config = vscode.workspace.getConfiguration('engine');
        config.update('analyzers', version, vscode.ConfigurationTarget.Global);
    }

    getAnalyzersVersion(): string | undefined {
        const config = vscode.workspace.getConfiguration('engine');
        const version = config.get<string>('analyzers');
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
                        config.update("name", username, vscode.ConfigurationTarget.Global);
                    }
                });
            });
        } else {
            this.username = username;
        }
    }

    saveCurrentAnalyzer(currentAnalyzer: vscode.Uri) {
        const stateJsonDefault: any = {
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
            const parse = this.jsonState.json.visualText[0];
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

    hasAnalyzers(): boolean {
        return this.analyzers.length ? true : false;
    }

    getAnalyzerDir(): vscode.Uri {
        return this.analyzerDir;
    }

    getAnalyzers(testForLogs: boolean): vscode.Uri[] {
        if (this.analyzerDir.fsPath.length) {
            this.analyzers = [];
            this.getAnalyzersRecursive(testForLogs, this.analyzerDir);
        }
        return this.analyzers;
    }

    getAnalyzersRecursive(testForLogs: boolean, dir: vscode.Uri) {
        if (dir.fsPath.length) {
            let anas: vscode.Uri[] = [];
            if (!fs.existsSync(dir.fsPath)) {
                dir = this.workspaceFold;
            }
            anas = dirfuncs.getDirectories(dir);
            for (const ana of anas) {
                if (visualText.isAnalyzerDirectory(ana)) {
                    if (!testForLogs || dirfuncs.analyzerHasLogFiles(ana))
                        this.analyzers.push(ana);
                } else {
                    this.getAnalyzersRecursive(testForLogs, ana);
                }
            }
        }
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

    getVisualTextDirectory(dirName: string = ''): string {
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

    isAnalyzerDirectory(dirPath: vscode.Uri): boolean {
        const dirs = dirfuncs.getDirectories(dirPath);
        let spec = false;
        let kb = false;
        let input = false;

        for (const dir of dirs) {
            if (path.basename(dir.fsPath).localeCompare(visualText.ANALYZER_SEQUENCE_FOLDER) == 0) {
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

    hasLogFiles(dirPath: vscode.Uri): boolean {
        const dirs = dirfuncs.getDirectories(dirPath);
        let spec = false;
        let kb = false;
        let input = false;
        let output = false;
        let logs = false;

        for (const dir of dirs) {
            const dirname = path.basename(dir.fsPath);
            if (dirname.localeCompare(visualText.ANALYZER_SEQUENCE_FOLDER) == 0) {
                spec = true;
            }
            else if (dirname.localeCompare('kb') == 0) {
                kb = true;
            }
            else if (dirname.localeCompare('input') == 0) {
                input = true;
            }
            else if (dirname == 'output' && dirfuncs.hasFiles(dir)) {
                output = true;
            }
            else if (dirname == 'logs' && dirfuncs.hasFiles(dir)) {
                logs = true;
            }
        }

        return spec && kb && input && output && logs;
    }

    setUpdateEngine(): boolean {
        const uri = visualText.getExtensionPath();
        if (uri) {
            this.debugMessage('NLP Engine updating version', logLineType.UPDATER);
            return true;
        }
        return false;
    }

    updateEngine() {
        visualText.pushDownloadEngineFiles(visualText.emptyOp(), upPush.FRONT);
        visualText.pushDeleteEngineFiles(visualText.emptyOp(), upPush.FRONT);
        visualText.startUpdater();
    }

    updateVTFiles() {
        visualText.pushDeleteVTFiles(visualText.emptyOp(), upPush.BACK);
        visualText.pushDownloadVTFiles(visualText.emptyOp(), upPush.BACK);
        this.startUpdater();
    }

    updateAnalyzersFiles() {
        visualText.pushDeleteAnalyzers(visualText.emptyOp(), upPush.BACK);
        visualText.pushDownloadAnalyzers(visualText.emptyOp(), upPush.BACK);
        this.startUpdater();
    }

    convertPatFiles(analyzerDir: vscode.Uri) {
        const spec = vscode.Uri.file(path.join(analyzerDir.fsPath, visualText.ANALYZER_SEQUENCE_FOLDER));
        const op = visualText.fileOps.addFileOperation(spec, spec, [fileOpRefresh.ANALYZER], fileOperation.RENAME, 'pat', 'nlp');
        op.oneOff = fileOneOff.PAT_TO_NLP;
        visualText.fileOps.startFileOps();
    }

    stopFileOps() {
        visualText.fileOps.stopAll();
    }

    colorizeAnalyzer(overwrite: boolean = false) {
        if (vscode.workspace.workspaceFolders) {
            let add = false;
            const toDir = vscode.workspace.workspaceFolders[0].uri;
            const toFile = path.join(toDir.fsPath, '.vscode', 'settings.json');
            const fromDir = visualText.extensionDirectory();
            const fromFile = path.join(fromDir.fsPath, '.vscode', 'settings.json');
            if (fs.existsSync(toFile)) {
                if (this.jsonState.jsonParse(toDir, 'settings')) {
                    if (!this.jsonState.json.hasOwnProperty('editor.tokenColorCustomizations')) {
                        const settingsObj1 = this.jsonState.json;
                        this.jsonState.jsonParse(fromDir, 'settings')
                        const settingsObj2 = this.jsonState.json;

                        const mergedObj = {
                            ...settingsObj1,
                            ...settingsObj2
                        };
                        this.jsonState.saveFile(toDir.fsPath, "settings", mergedObj);
                    }
                }
            } else
                add = true;

            if (add || overwrite) {
                dirfuncs.copyFile(fromFile, toFile);
                this.debugMessage('Copying settings file with colorization: ' + fromFile + ' => ' + toFile, logLineType.UPDATER);
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
            const cmd = platformCmd + ' ' + dir;
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

    displayHelpFile(title: string, filename: string) {
        const pathFile = path.join(visualText.getVisualTextDirectory("Help"), "helps", filename);
        const mdFile = pathFile + ".md";
        const htmlFile = pathFile + ".htm";
        if (fs.existsSync(mdFile)) {
            vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(mdFile));
        }
        else if (fs.existsSync(htmlFile)) {
            this.displayHTML(title, fs.readFileSync(htmlFile, 'utf8'));
        }
    }

    displayHTML(title: string, html: string) {
        const panel = this.createPanel(title);
        if (panel) {
            panel.webview.html = html;
        }
    }

    fileIconFromExt(filepath: string): string {
        const filename = path.basename(filepath);

        let icon = 'file.svg';
        if (filename.endsWith('.tree')) {
            icon = 'tree.svg';
        } else if (filename.endsWith('.log')) {
            icon = 'log.svg';
        } else if (filename.endsWith('.nlp') || filename.endsWith('.pat')) {
            icon = 'nlp.svg';
        } else if (filename.endsWith('.dict')) {
            icon = 'dict.svg';
        } else if (filename == 'main.kb') {
            icon = 'kb-main.svg';
        } else if (filename.endsWith('.kbb')) {
            icon = 'kbb.svg';
        } else if (filename.endsWith('.kb')) {
            icon = 'kb.svg';
        } else if (filename.endsWith('.txxt')) {
            icon = 'symbol-keyword.svg';
        } else if (filename.endsWith('.dict')) {
            icon = 'dict.svg';
        } else if (filename.endsWith('.nlm')) {
            icon = 'mod.svg';
        } else if (filename.endsWith('.test')) {
            icon = 'test.svg';
        } else if (filename.endsWith('.py')) {
            icon = 'python.svg';
        } else {
            icon = 'file.svg';
        }

        return icon;
    }

    analyzerList(subdir: string): vscode.QuickPickItem[] {
        let dirs: vscode.Uri[] = [];
        if (subdir.length) {
            const pather = path.join(visualText.getWorkspaceFolder().fsPath, subdir);
            dirs = dirfuncs.getDirectories(vscode.Uri.file(pather));
        } else
            dirs = dirfuncs.getDirectories(visualText.getWorkspaceFolder());
        const items: vscode.QuickPickItem[] = [];
        for (const dir of dirs) {
            const filename = path.basename(dir.fsPath);
            items.push({ label: filename, description: dir.fsPath });
        }
        return items;
    }

    analyzerFolderList(specFlag: boolean = false): vscode.QuickPickItem[] {
        const dirs = dirfuncs.getDirectories(visualText.getWorkspaceFolder());
        const items: vscode.QuickPickItem[] = [];
        return this.analyzerFolderListRecurse(visualText.getWorkspaceFolder(), items, 0, specFlag);
    }

    analyzerFolderListRecurse(dir: vscode.Uri, items: vscode.QuickPickItem[], level: number = 0, specFlag: boolean = false): vscode.QuickPickItem[] {
        const dirs = dirfuncs.getDirectories(dir);
        let indent = '';
        const spacer = '   ';
        for (let i = 0; i < level; i++) {
            indent = indent + spacer;
        }
        if (indent.length > 0) indent = '-' + indent;
        const seq = new SequenceFile;
        for (const dir of dirs) {
            const basename = path.basename(dir.fsPath);
            const baseUpper = basename.toUpperCase();
            if (visualText.isAnalyzerDirectory(dir)) {
                if (specFlag) {
                    items.push({ label: indent + basename, description: '=======================' });
                    seq.choicePasses(path.join(dir.fsPath, visualText.ANALYZER_SEQUENCE_FOLDER), items, '-' + indent + spacer, false);
                } else {
                    items.push({ label: indent + basename, description: dir.fsPath });
                }
            } else {
                items.push({ label: indent + '(FOLDER) ' + baseUpper, description: '(FOLDER - choose analyzer bloc(s) below)' });
                this.analyzerFolderListRecurse(dir, items, level + 1, specFlag);
            }
        }
        return items;
    }

    modFileList(): vscode.QuickPickItem[] {
        const items: vscode.QuickPickItem[] = [];
        for (const uri of this.modFiles) {
            const basename = path.basename(uri.fsPath);
            items.push({ label: basename, description: uri.fsPath });
        }
        return items;
    }

    findFilesWithExtension(extension: string) {
        function explore(dir: string) {
            try {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const filePath = path.join(dir, file);
                    const stats = fs.statSync(filePath);
                    const startsWithNumber = /^\d+\_/.test(file);
                    if (stats.isDirectory()) {
                        explore(filePath);
                    } else if (path.extname(file) === extension && !startsWithNumber) {
                        visualText.libraryFiles.push(filePath);
                    }
                }
                const stophere = 1;
            } catch (err) {
                console.error('An error occurred while reading the directory:', (err as Error).message);
            }
        }

        if (visualText.libraryFiles.length == 0) {
            const filepath = path.join(visualText.getVisualTextDirectory(visualText.ANALYZER_SEQUENCE_FOLDER));
            if (fs.existsSync(filepath)) {
                explore(filepath)
            }
        }
    }

    getLibraryFiles(): string[] {
        return this.libraryFiles;
    }

    public async chooseLibFiles(prompt: string, dirName: string, subDir: string, exts: string[]): Promise<vscode.QuickPickItem[]> {
        const fileDir = path.join(visualText.getVisualTextDirectory(), dirName, subDir);
        const items: vscode.QuickPickItem[] = [];

        const dictFiles = dirfuncs.getFiles(vscode.Uri.file(fileDir), exts);
        const textFile = new TextFile();
        for (const dictFile of dictFiles) {
            let descr = "";

            const firstLine = textFile.readFirstLine(dictFile.fsPath);
            if (firstLine[0] == '#') {
                descr = firstLine.substring(1);
            }
            const icon = visualText.fileIconFromExt(dictFile.fsPath);
            const label = path.basename(dictFile.fsPath);
            const light = vscode.Uri.file(path.join(visualText.getExtensionPath().fsPath, "resources", "light", icon));
            const dark = vscode.Uri.file(path.join(visualText.getExtensionPath().fsPath, "resources", "dark", icon));
            items.push({ label: label, description: descr });
        }

        if (items.length == 0) {
            vscode.window.showWarningMessage('Not created yet and you can help!');
            return [];
        } else {
            const selections = await vscode.window.showQuickPick(items, { title: 'Choose ' + prompt, canPickMany: true, placeHolder: 'Choose ' + prompt + ' to insert' });
            if (selections) {
                for (const item of selections) {
                    item.description = fileDir;
                }
            }
            return selections || [];
        }
    }

    convertUriToStr(uri: vscode.Uri): string {
        let pathStr = uri.fsPath;
        if (os.platform() === 'win32') {
            pathStr = pathStr.replace(/\\/g, '\\\\');
        } else {
            pathStr = pathStr.replace(/\\/g, '/');
        }
        return pathStr;
    }
}
