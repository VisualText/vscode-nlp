import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Analyzer } from './analyzer';
import { dirfuncs } from './dirfuncs';
import { JsonState } from './jsonState';
import { nlpStatusBar } from './status';
import { logView } from './logView';
import { FileOps,fileOperation,fileOpRefresh } from './fileOps';

export enum updaterStatus { UNKNOWN, GATHER_EXTENSIONS, VERSION_ENGINES, CHOOSE_LATEST, REPAIR, CHECK_ENGINE, CHECKING_ENGINE, CHECK_FILES, CHECKING_FILES, VERSION_FILES, DONE, FAILED }
export enum versionStatus { UNKNOWN, VERSIONING, DONE, FAILED }
export enum downloadStatus { UNKNOWN, UPDATE, DELETE, DOWNLOADING, DONE, FAILED }
export enum zippingStatus { UNKNOWN, UNZIPPING, DONE, FAILED }

interface ExtensionItem {
    uri: vscode.Uri;
    hasEngine: boolean;
    hasICU1File: boolean;
    hasICU2File: boolean;
    hasEngineFiles: boolean;
    hasVTFiles: boolean;
    vtVersion: string;
    isLatest: boolean;
    isLatestEngine: boolean;
    engineVersion: string;
    timerCount: number;
    engineDownloadStatus: downloadStatus;
    engineDownloadICU1Status: downloadStatus;
    engineDownloadICU2Status: downloadStatus;
    engineVersionStatus: versionStatus;
    engineFilesDownloadStatus: downloadStatus;
    engineFilesZipStatus: zippingStatus;
    vtFilesVersion: string;
    vtFilesDownloadStatus: downloadStatus;
    vtFilesZipStatus: zippingStatus;
    vtFilesVersionStatus: versionStatus;
}

export let visualText: VisualText;
export class VisualText {
    _ctx: vscode.ExtensionContext;
    
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
    public readonly NLPENGINE_FOLDER = 'nlp-engine';
    public readonly VISUALTEXT_FILES_FOLDER = 'visualtext';
    public readonly VISUALTEXT_FILES_ASSET = 'visualtext.zip';
    public readonly ANALYZER_SEQUENCE_FILE = 'analyzer.seq';
    public readonly GITHUB_ENGINE_LATEST_RELEASE = 'https://github.com/VisualText/' + this.NLPENGINE_FOLDER + '/releases/latest/download/';
    public readonly GITHUB_ENGINE_LATEST_VERSION = 'https://github.com/VisualText/' + this.NLPENGINE_FOLDER + '/releases/latest/';
    public readonly GITHUB_VISUALTEXT_FILES_LATEST_RELEASE = 'https://github.com/VisualText/visualtext-files/releases/latest/download/';
    public readonly GITHUB_VISUALTEXT_FILES_LATEST_VERSION = 'https://github.com/VisualText/visualtext-files/releases/latest/';

    public updaterStatusStrs = [ 'UNKNOWN', 'GATHER_EXTENSIONS', 'VERSION_ENGINES', 'CHOOSE_LATEST', 'REPAIR', 'CHECK_ENGINE', 'CHECKING_ENGINE', 'CHECK_FILES', 'CHECKING_FILES', 'VERSION_FILES', 'DONE' ];
    public versionStatusStrs = [ 'UNKNOWN', 'VERSIONING', 'DONE' ];
    public downloadStatusStrs = [ 'UNKNOWN', 'UPDATE', 'DELETE', 'DOWNLOADING', 'DONE' ];
    public zippingStatusStrs = [ 'UNKNOWN', 'UNZIPPING', 'DONE' ];

    public analyzer = new Analyzer();
    public fileOps = new FileOps();
    public version: string = '';
    public engineVersion: string = '';
    public cmdEngineVersion: string = '';
    public repoEngineVersion: string = '';
    public vtFilesVersion: string = '';
    public repoVTFilesVersion: string = '';
    public engineDir: vscode.Uri = vscode.Uri.file('');
    public askModify: boolean = false;
    public processID: number = 0;

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
    private lastestEngineIndex: number = 0;
    private updaterID: number = 0;
    private updaterCounter: number = 0;
    public updaterGlobalStatus: updaterStatus = updaterStatus.GATHER_EXTENSIONS;

	constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;

        this.platform = os.platform();
        let plat = this.platform == 'darwin' ? 'mac' : this.platform;
        this.debugMessage('Platform: ' + plat);

        this.homeDir = os.homedir();
        this.debugMessage('User profile path: ' + this.homeDir);

        var rootPath = vscode.extensions.getExtension(this.EXTENSION_NAME)?.extensionPath;
        if (rootPath) this.extensionDir = vscode.Uri.file(rootPath);

        this.debugMessage('VSCode NLP++ Extension path: ' + this.extensionDir.fsPath);
        this.version = vscode.extensions.getExtension(this.EXTENSION_NAME)?.packageJSON.version;
        this.debugMessage('VSCode NLP++ Extension version: ' + this.version);

        this.startUpdater();
    }
    
    static attach(ctx: vscode.ExtensionContext): VisualText {
        if (!visualText) {
            visualText = new VisualText(ctx);
            if (vscode.workspace.workspaceFolders) {
                visualText.workspaceFold = vscode.workspace.workspaceFolders[0].uri;
            }
            visualText.readConfig();
            visualText.readState();
            visualText.initSettings();
        }
        return visualText;
    }

    startUpdater() {
        if (this.updaterID == 0) {
            this.updaterCounter = 0;
            this.debugMessage('Checking for updates or repairs...');
            this.updaterID = +setInterval(this.updaterTimer,1000);
        }
    }

    public debugMessage(msg: string) {
        logView.addMessage(msg,undefined);
        vscode.commands.executeCommand('logView.refreshAll');
    }

	readState(): boolean {
        if (vscode.workspace.workspaceFolders) {
            this.analyzerDir = this.workspaceFold;
            if (this.jsonState.jsonParse(this.analyzerDir,'state','visualText')) {
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
        var fromDir = this.getVisualTextDirectory('.vscode');
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

    checkForVisualTextFilesUpdate() {
        if (vscode.workspace.workspaceFolders && visualText.updaterGlobalStatus == updaterStatus.CHECK_FILES) {
            visualText.updaterGlobalStatus = updaterStatus.CHECKING_FILES;
            this.checkVTFilesVersion()
            .then(newVersion => {
                if (newVersion) {
                    visualText.setUpdateVTFiles();      
                }
                else {
                    visualText.debugMessage('VisualText files version ' + visualText.repoVTFilesVersion);
                    visualText.updaterGlobalStatus = updaterStatus.DONE;
                }
            }).catch(err => {
                this.debugMessage(err);
            });
        }
    }

    checkVTFilesVersion(updateVersionFlag: boolean = false) {
        return new Promise((resolve,reject) => {
            const https = require('follow-redirects').https;

            const request = https.get(this.GITHUB_VISUALTEXT_FILES_LATEST_VERSION, function (res) {
                res.on('data', function (chunk) {
                    let url = res.responseUrl;
                    visualText.repoVTFilesVersion = url.substring(url.lastIndexOf('/') + 1);
                    let currentVersion = visualText.getVTFilesVersion();
                    let newer = false;
                    if (currentVersion) {
                        visualText.vtFilesVersion = currentVersion;
                        if (visualText.versionCompare(visualText.repoVTFilesVersion,currentVersion) > 0) {
                            newer = true;
                        }                       
                    }
                    else {
                        newer = true;
                    }
                    if (updateVersionFlag) {
                        visualText.setLatestVTVersionStatus(versionStatus.DONE);
                        visualText.setVTFilesVersion(visualText.repoVTFilesVersion);
                        visualText.updaterGlobalStatus = updaterStatus.DONE;                        
                    }
                    resolve(newer);
                });
            }).on('error', function (err) {
                reject(err);
            });
            request.end();
        });
    }

    checkForEngineUpdate() {
        if (vscode.workspace.workspaceFolders && visualText.updaterGlobalStatus == updaterStatus.CHECK_ENGINE) {
            this.updaterGlobalStatus = updaterStatus.CHECKING_ENGINE;
            this.checkEngineVersion()
            .then(newerVersion => {
                if (newerVersion) {
                    visualText.setUpdateEngine();
                } else {
                    visualText.setEngineVersion(visualText.repoEngineVersion);
                    visualText.debugMessage('NLP Engine version ' + visualText.repoEngineVersion);
                    visualText.updaterGlobalStatus = updaterStatus.CHECK_FILES;
                }
                if (nlpStatusBar !== undefined) {
                    nlpStatusBar.updateEngineVersion(visualText.engineVersion);     
                }
            }).catch(err => {
                this.debugMessage(err);
            });
        }
    }

    checkEngineVersion() {
        return new Promise((resolve,reject) => {

            const https = require('follow-redirects').https;

            const request = https.get(this.GITHUB_ENGINE_LATEST_VERSION, function (res) {
                res.on('data', function (chunk) {
                    let url = res.responseUrl;
                    visualText.repoEngineVersion = url.substring(url.lastIndexOf('/') + 1);
                    let currentVersion = visualText.engineVersion;
                    var newer = false;
                    if (currentVersion) {
                        visualText.engineVersion = currentVersion;
                        if (visualText.versionCompare(visualText.repoEngineVersion,currentVersion) > 0) {
                            newer = true;
                        }
                    } else {
                        newer = true;
                    }            
                    resolve(newer);
                });
            }).on('error', function (err) {
                reject(err);
            });
            request.end();
        });
    }

    downloadVisualTextFiles(extension: ExtensionItem) {
        const url = this.GITHUB_VISUALTEXT_FILES_LATEST_RELEASE + this.VISUALTEXT_FILES_ASSET;
        const engineDir = path.join(extension.uri.fsPath,this.NLPENGINE_FOLDER,this.VISUALTEXT_FILES_FOLDER);

        const Downloader = require('nodejs-file-downloader');

        (async () => {
        
            const downloader = new Downloader({
                url: url,   
                directory: engineDir        
            })
            try {
                var zipFile = path.join(engineDir,this.VISUALTEXT_FILES_ASSET);
                if (fs.existsSync(zipFile))
                    dirfuncs.delFile(zipFile);
                this.debugMessage('Downloading: ' + url);
                await downloader.download();
                this.debugMessage('DONE DOWNLOAD: ' + url);
                visualText.setLatestVTFilesDownload(downloadStatus.DONE);

            } catch (error) {
                console.log('Download failed',error);
            }
        })();
    }

    unzipVTFiles(extension: ExtensionItem) {
        const url = this.GITHUB_ENGINE_LATEST_RELEASE + this.VISUALTEXT_FILES_ASSET;
        const vtFileDir = path.join(extension.uri.fsPath,this.NLPENGINE_FOLDER,this.VISUALTEXT_FILES_FOLDER);

        (async () => {
            const toPath = path.join(vtFileDir,this.VISUALTEXT_FILES_ASSET);

            const extract = require('extract-zip')
            try {
                this.debugMessage('Unzipping: ' + vtFileDir);
                await extract(toPath, { dir: vtFileDir });
                this.debugMessage('UNZIPPED: ' + toPath);
                visualText.finalizeVTFilesVersion(zippingStatus.DONE);
                dirfuncs.delFile(toPath);
            }
            catch (err) {
                this.debugMessage('Could not unzip file: ' + toPath + '\n' + err);
                extension.vtFilesZipStatus = zippingStatus.FAILED;
            }
        })();
    }

    downloadEngineFiles(extension: ExtensionItem) {
        const url = this.GITHUB_ENGINE_LATEST_RELEASE + this.NLPENGINE_FILES_ASSET;
        const engineDir = path.join(extension.uri.fsPath,this.NLPENGINE_FOLDER);

        const Downloader = require('nodejs-file-downloader');

        (async () => {
        
            const downloader = new Downloader({
                url: url,   
                directory: engineDir     
            })
            try {
                var zipFile = path.join(engineDir,this.NLPENGINE_FILES_ASSET);
                if (fs.existsSync(zipFile))
                    dirfuncs.delFile(zipFile);
                this.debugMessage('Downloading: ' + url);
                await downloader.download();
                this.debugMessage('DONE DOWNLOAD: ' + url);
                visualText.setLatestEngineFilesDownload(downloadStatus.DONE);
            }
            catch (error) {
                console.log('Download failed',error);
            }
        })();
    }

    unzipEngineFiles(extension: ExtensionItem) {
        const url = this.GITHUB_ENGINE_LATEST_RELEASE + this.NLPENGINE_FILES_ASSET;
        const engineDir = path.join(extension.uri.fsPath,this.NLPENGINE_FOLDER);

        (async () => {
            const toPath = path.join(engineDir,this.NLPENGINE_FILES_ASSET);

            const extract = require('extract-zip')
            try {
                this.debugMessage('Unzipping: ' + engineDir);
                await extract(toPath, { dir: engineDir });
                this.debugMessage('UNZIPPED: ' + toPath);
                dirfuncs.delFile(toPath);
                extension.engineFilesZipStatus = zippingStatus.DONE;
                extension.hasEngineFiles = true;
            }
            catch (err) {
                this.debugMessage('Could not unzip file: ' + toPath);
            }
        })();
    }

    downloadExecutable(extension: ExtensionItem) {
        const config = vscode.workspace.getConfiguration('engine');
        config.update('platform',this.platform,vscode.ConfigurationTarget.Global);
        var exe = '';
        switch (this.platform) {
            case 'win32':
                exe = 'nlpw.exe';
                break;
            case 'darwin':
                exe = 'nlpm.exe';
                break;
            default:
                exe = 'nlpl.exe';
        }
        const url = this.GITHUB_ENGINE_LATEST_RELEASE + exe;
        const engDir = path.join(extension.uri.fsPath,this.NLPENGINE_FOLDER);
        if (!fs.existsSync(engDir)) {
            dirfuncs.makeDir(engDir);
        }
        var localExePat = path.join(engDir,this.NLP_EXE);
        if (fs.existsSync(localExePat)) {
            dirfuncs.delFile(localExePat);
        }
        const Downloader = require('nodejs-file-downloader');

        (async () => {
        
            const downloader = new Downloader({
                url: url,   
                directory: engDir,
                filename: this.NLP_EXE
            })
            try {
                this.debugMessage('Downloading: ' + url);
                await downloader.download();
                dirfuncs.changeMod(localExePat,0o755);
                this.debugMessage('DONE DOWNLOAD: ' + url);
                visualText.setLatestEngineDownload(engDir);
            }
            catch (error) {
                extension.engineDownloadStatus = downloadStatus.FAILED;
                this.debugMessage('FAILED download: ' + url + '\n' + error);
            }

        })();     
    }

    downloadExecutableICU(extension: ExtensionItem, icuFileNum: number) {
        const config = vscode.workspace.getConfiguration('engine');
        config.update('platform',this.platform,vscode.ConfigurationTarget.Global);
        var libRelease = '';
        var lib = '';
        switch (this.platform) {
            case 'win32':
                libRelease = icuFileNum == 1 ? this.ICU1_WIN : this.ICU2_WIN;
                lib = icuFileNum == 1 ? this.ICU1_WIN : this.ICU2_WIN;
                break;
            case 'darwin':
                libRelease = icuFileNum == 1 ? this.ICU1_MAC : this.ICU2_MAC;
                lib = icuFileNum == 1 ? this.ICU1_LINUX : this.ICU2_LINUX;
                break;
            default:
                libRelease = icuFileNum == 1 ? this.ICU1_LINUX : this.ICU2_LINUX;
                lib = icuFileNum == 1 ? this.ICU1_LINUX : this.ICU2_LINUX;
        }
        const url = this.GITHUB_ENGINE_LATEST_RELEASE + libRelease;
        const engDir = path.join(extension.uri.fsPath,this.NLPENGINE_FOLDER);
        if (!fs.existsSync(engDir)) {
            dirfuncs.makeDir(engDir);
        }
        var localExePat = path.join(engDir,lib);
        if (fs.existsSync(localExePat)) {
            dirfuncs.delFile(localExePat);
        }
        const Downloader = require('nodejs-file-downloader');

        (async () => {
        
            const downloader = new Downloader({
                url: url,   
                directory: engDir,
                filename: lib
            })
            try {
                this.debugMessage('Downloading: ' + url);
                await downloader.download();
                this.debugMessage('DONE DOWNLOAD: ' + url);
                if (icuFileNum == 1) {
                    extension.engineDownloadICU1Status = downloadStatus.DONE;
                    extension.hasICU1File = true;
                }
                else if (icuFileNum == 2) {
                    extension.engineDownloadICU2Status = downloadStatus.DONE;
                    extension.hasICU2File = true;
                }
            }
            catch (error) {
                if (icuFileNum == 1) {
                    extension.engineDownloadICU1Status = downloadStatus.FAILED;
                    extension.hasICU1File = false;
                }
                else if (icuFileNum == 2) {
                    extension.engineDownloadICU2Status = downloadStatus.FAILED;
                    extension.hasICU2File = false;
                }
                this.debugMessage('FAILED download: ' + url + '\n' + error);
            }
        })();     
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

    updaterTimer() {
        let debug = false;

        if (visualText.updaterCounter++ >= 60) {
            visualText.debugMessage('Updater timed out');
            visualText.updaterGlobalStatus = updaterStatus.DONE;
        }

        if (debug) visualText.debugMessage('status: ' + visualText.updaterStatusStrs[visualText.updaterGlobalStatus] + ' ' + visualText.updaterCounter.toString());

        switch (visualText.updaterGlobalStatus) {
            case updaterStatus.FAILED: {
                clearInterval(visualText.updaterID);
                visualText.debugMessage('UPDATE FAILED');
                break;
            }
            case updaterStatus.GATHER_EXTENSIONS: {
                visualText.getVersions();
                if (!visualText.extensionItems.length)
                    visualText.getExtensionDirs();
                visualText.updaterGlobalStatus = updaterStatus.VERSION_ENGINES;
                break;
            }
            case updaterStatus.VERSION_ENGINES: {
                var versionsDone = true;
                for (let ext of visualText.extensionItems) {
                    if (ext.hasEngine) {
                        if (ext.engineVersion.length == 0 && ext.engineVersionStatus == versionStatus.UNKNOWN) {
                            ext.engineVersionStatus = versionStatus.VERSIONING;
                            visualText.debugMessage('Versioning engine: ' + ext.uri.fsPath.toString());
                            ext.timerCount++;
                            visualText.fetchExeVersion(ext.uri.fsPath,debug)?.then(notUsed => {
                                visualText.setExtEngineVersion(ext.uri.fsPath,visualText.cmdEngineVersion);
                            });
                            versionsDone = false;
                        }
                        else if (ext.engineVersionStatus == versionStatus.VERSIONING) {
                            if (ext.timerCount++ < 10)
                                versionsDone = false;
                            else {
                                visualText.debugMessage('Versioning FAILED: ' + ext.uri.fsPath.toString());
                                ext.timerCount = 0;
                                ext.engineVersionStatus = versionStatus.FAILED;
                                visualText.updaterGlobalStatus = updaterStatus.FAILED;
                            }
                        }
                    }       
                }
                if (versionsDone && visualText.updaterGlobalStatus != updaterStatus.FAILED) {
                    visualText.updaterGlobalStatus = updaterStatus.CHOOSE_LATEST;
                }
                break;
            }
            case updaterStatus.CHOOSE_LATEST: {
                var latestVersion = '';
                var latestEngineVersion = '';
                var latestIndex = 0;
                var index = 0;
                for (let ext of visualText.extensionItems) {
                    if (ext.hasEngine && ext.engineVersion.length) {
                        if (latestEngineVersion.length == 0) {
                            latestVersion = ext.vtVersion
                            latestEngineVersion = ext.engineVersion;
                            latestIndex = index;
                        } else if (visualText.versionCompare(ext.vtVersion,latestVersion) > 0 && visualText.versionCompare(ext.engineVersion,latestEngineVersion) >= 0) {
                            latestVersion = ext.vtVersion
                            latestEngineVersion = ext.engineVersion;
                            latestIndex = index;
                        }
                    }
                    index++;
                }
                // Mark for deletion
                index = 0;
                for (let ext of visualText.extensionItems) {
                    if (ext.hasEngine && ext.engineVersionStatus != versionStatus.FAILED) {
                        if (index != latestIndex)
                            ext.engineDownloadStatus = downloadStatus.DELETE;
                        else
                            ext.isLatestEngine = true;
                    }
                    index++;
                }
                visualText.lastestEngineIndex = latestIndex;
                visualText.updaterGlobalStatus = updaterStatus.REPAIR;
                break;
            }
            case updaterStatus.REPAIR: {
                for (let ext of visualText.extensionItems) {
                    if (ext.engineDownloadStatus == downloadStatus.DELETE) {
                        var engFolder = path.join(ext.uri.fsPath,visualText.NLPENGINE_FOLDER);
                        visualText.debugMessage('Removing NLP Engine: ' + engFolder);
                        dirfuncs.delDir(engFolder);
                        visualText.debugMessage('REMOVE DONE: ' + engFolder);
                        ext.hasEngine = false;
                        ext.engineDownloadStatus = downloadStatus.DONE;
                        continue;
                    }
                    if (ext.isLatestEngine ||
                        (!ext.isLatestEngine && ext.hasEngineFiles && ext.hasVTFiles) ||
                        ext.engineDownloadStatus == downloadStatus.UPDATE ||
                        ext.vtFilesDownloadStatus == downloadStatus.UPDATE) {

                        if (ext.engineVersion.length == 0 || !ext.hasICU1File) {
                            if (debug) visualText.debugMessage('   engineDownloadICU1Status: ' + visualText.downloadStatusStrs[ext.engineDownloadICU1Status]);
                            if (ext.engineDownloadICU1Status == downloadStatus.FAILED) {
                                visualText.updaterGlobalStatus = updaterStatus.FAILED;
                            }
                            else if (ext.engineDownloadICU1Status == downloadStatus.UNKNOWN) {
                                ext.engineDownloadICU1Status = downloadStatus.DOWNLOADING;
                                visualText.downloadExecutableICU(ext,1);
                            }
                        }

                        if (ext.hasICU1File && (ext.engineVersion.length == 0 || !ext.hasICU2File)) {
                            if (debug) visualText.debugMessage('   engineDownloadICU2Status: ' + visualText.downloadStatusStrs[ext.engineDownloadICU2Status]);
                            if (ext.engineDownloadICU2Status == downloadStatus.FAILED) {
                                visualText.updaterGlobalStatus = updaterStatus.FAILED;
                            }
                            else if (ext.engineDownloadICU2Status == downloadStatus.UNKNOWN) {
                                ext.engineDownloadICU2Status = downloadStatus.DOWNLOADING;
                                visualText.downloadExecutableICU(ext,2);
                            }
                        }

                        if (ext.hasICU1File && ext.hasICU2File && ext.engineDownloadStatus == downloadStatus.UPDATE || (visualText.engineDir.fsPath.length <= 1 && ext.engineDownloadStatus == downloadStatus.UNKNOWN)) {
                            if (debug) visualText.debugMessage('   engineDownloadStatus: ' + visualText.downloadStatusStrs[ext.engineDownloadStatus]);
                            ext.engineDownloadStatus = downloadStatus.DOWNLOADING;
                            visualText.downloadExecutable(ext);
                        }
                        else if (visualText.engineDir.fsPath.length > 1 && ext.engineFilesDownloadStatus == downloadStatus.UPDATE) {
                            if (debug) visualText.debugMessage('   engineFilesDownloadStatus: ' + visualText.downloadStatusStrs[ext.engineFilesDownloadStatus]);
                            ext.engineFilesDownloadStatus = downloadStatus.DOWNLOADING;
                        }

                        if (ext.hasEngine && ext.hasICU1File && ext.hasICU2File && (ext.engineVersion.length == 0 || !ext.hasEngineFiles)) {
                            if (debug) visualText.debugMessage('   engineFilesDownloadStatus: ' + visualText.downloadStatusStrs[ext.engineFilesDownloadStatus]);
                            if (debug) visualText.debugMessage('   engineFilesZipStatus: ' + visualText.zippingStatusStrs[ext.engineFilesZipStatus]);
                            if (!ext.hasEngineFiles && ext.engineVersion.length && ext.engineFilesDownloadStatus == downloadStatus.UNKNOWN) {
                                ext.engineFilesDownloadStatus = downloadStatus.DOWNLOADING;
                                visualText.downloadEngineFiles(ext);
                            }
                            else if (!ext.hasEngineFiles && ext.engineVersion.length && ext.engineFilesDownloadStatus == downloadStatus.DONE && ext.engineFilesZipStatus == zippingStatus.UNKNOWN) {
                                ext.engineFilesZipStatus = zippingStatus.UNZIPPING;
                                visualText.unzipEngineFiles(ext);
                            }
                        }

                        if (ext.hasEngine && ext.hasICU1File && ext.hasICU2File && ext.hasEngineFiles && (!ext.hasVTFiles || !visualText.vtFilesVersion.length)) {
                            if (debug) visualText.debugMessage('   vtFilesDownloadStatus: ' + visualText.downloadStatusStrs[ext.vtFilesDownloadStatus]);
                            if (debug) visualText.debugMessage('   vtFilesZipStatus: ' + visualText.zippingStatusStrs[ext.vtFilesZipStatus]);
                            if (debug) visualText.debugMessage('   vtFilesVersionStatus: ' + visualText.versionStatusStrs[ext.vtFilesVersionStatus]);
                            if (ext.vtFilesDownloadStatus == downloadStatus.UNKNOWN || ext.vtFilesDownloadStatus == downloadStatus.UPDATE) {
                                ext.vtFilesDownloadStatus = downloadStatus.DOWNLOADING;
                                visualText.downloadVisualTextFiles(ext);
                            }
                            else if (ext.engineVersion.length && ext.vtFilesDownloadStatus == downloadStatus.DONE && ext.vtFilesZipStatus == zippingStatus.UNKNOWN) {
                                ext.vtFilesZipStatus = zippingStatus.UNZIPPING;
                                visualText.unzipVTFiles(ext);
                            }
                            else if (ext.engineVersion.length && ext.vtFilesZipStatus == zippingStatus.DONE && ext.vtFilesVersionStatus == versionStatus.UNKNOWN) {
                                ext.vtFilesVersionStatus = versionStatus.VERSIONING;
                                visualText.checkVTFilesVersion(true);
                            }
                        }
                        if (ext.hasEngine && ext.hasEngineFiles && ext.hasVTFiles &&
                            visualText.engineVersion.length && visualText.engineVersion.length && visualText.vtFilesVersion.length)
                            visualText.updaterGlobalStatus = updaterStatus.CHECK_ENGINE; 
                    }
                }
                break;
            }
            case updaterStatus.CHECK_ENGINE: {
                visualText.checkForEngineUpdate();
                break;
            }
            case updaterStatus.CHECK_FILES: {
                visualText.checkForVisualTextFilesUpdate();
                break;
            }
            case updaterStatus.DONE: {
                clearInterval(visualText.updaterID);
                visualText.debugMessage('UPDATE CHECK COMPLETE');
                break;
            }
        }
    }

    getExtensionDirs() {
        var parentDir = this.extensionParentDirectory();
        var dirs: vscode.Uri[] = new Array();
        this.extensionItems = [];
        dirs = dirfuncs.getDirectories(parentDir);
        var latestVersion = '';
        var latestEngineVersion = '';
        var extLatest = 0;
        var engineLatest = 0;
        var counter = 0;
        var hasAll = -1;

        for (let dir of dirs) {
            var name = path.basename(dir.fsPath);
            if (name.startsWith(this.EXTENSION_NAME)) {
                this.extensionItems.push({
                    uri: dir,
                    hasEngine: this.hasEngine(dir),
                    hasICU1File: this.hasICUFiles(dir, 1),
                    hasICU2File: this.hasICUFiles(dir, 2),
                    hasEngineFiles: this.isEngineDirectory(dir),
                    hasVTFiles: this.isVisualTextDirectory(dir),
                    vtVersion: this.versionFromPath(dir),
                    isLatest: false,
                    isLatestEngine: false,
                    engineVersion: '',
                    timerCount: 0,
                    engineDownloadStatus: downloadStatus.UNKNOWN,
                    engineDownloadICU1Status: downloadStatus.UNKNOWN,
                    engineDownloadICU2Status: downloadStatus.UNKNOWN,
                    engineVersionStatus: versionStatus.UNKNOWN,
                    engineFilesDownloadStatus: downloadStatus.UNKNOWN,
                    engineFilesZipStatus: zippingStatus.UNKNOWN,
                    vtFilesVersion: '',
                    vtFilesDownloadStatus: downloadStatus.UNKNOWN,
                    vtFilesZipStatus: zippingStatus.UNKNOWN,
                    vtFilesVersionStatus: versionStatus.UNKNOWN
                });
                var ext = this.extensionItems[this.extensionItems.length - 1];
                if (ext.hasEngine && ext.hasICU1File && ext.hasICU2File && ext.hasVTFiles && ext.hasEngineFiles)
                    hasAll = counter;
                if (ext.vtVersion.length && (!latestVersion.length || this.versionCompare(ext.vtVersion,latestVersion) > 0)) {
                    latestVersion = ext.vtVersion;
                    if (counter) {
                        this.extensionItems[extLatest].isLatest = false;
                    }
                    extLatest = counter;
                    ext.isLatest = true;
                }
                if (ext.engineVersion.length && (!latestEngineVersion.length || this.versionCompare(ext.vtVersion,latestEngineVersion))) {
                    latestEngineVersion = ext.engineVersion;
                    if (counter) {
                        this.extensionItems[engineLatest].isLatestEngine = false;
                    }
                    engineLatest = counter;
                    ext.isLatestEngine = true;
                }
                counter++;
            }
        }

        // Look for incomplete
        if (hasAll < 0) {
            var hasSomething = false;
            for (let ext of visualText.extensionItems) {
                if (ext.hasEngine || ext.hasICU1File || ext.hasICU2File || ext.hasEngineFiles || ext.hasVTFiles) {
                    hasSomething = true;
                }
            }
            if (!hasSomething && this.extensionItems[extLatest]) {
                var ext = this.extensionItems[extLatest];
                ext.engineDownloadStatus = downloadStatus.UPDATE;
                if (ext.engineVersion.length)
                    ext.isLatestEngine = true;
            }
        }
    }

    getExtension(): ExtensionItem {
        var ext = visualText.extensionItems[visualText.lastestEngineIndex];
        return ext; 
    }

    setLatestVTVersionStatus(status: versionStatus) {
        var ext = visualText.extensionItems[visualText.lastestEngineIndex];
        if (ext) {
            ext.vtFilesVersionStatus = status;
        }
    }

    setLatestEngineDownload(engDir: string) {
        var engDirIndex = this.findExtensionIndex(engDir);
        engDirIndex = engDirIndex != this.lastestEngineIndex ? engDirIndex : this.lastestEngineIndex;
        var ext = visualText.extensionItems[engDirIndex];
        if (ext) {
            this.setEnginePath(path.join(engDir,this.NLP_EXE));
            this.updaterGlobalStatus = updaterStatus.VERSION_ENGINES;
            ext.hasEngine = true;
            ext.hasEngineFiles = false;
            ext.engineDownloadStatus = downloadStatus.DONE;
            this.engineVersion = this.repoEngineVersion;
            if (nlpStatusBar !== undefined) {
                nlpStatusBar.updateEngineVersion(this.engineVersion);    
            }
        }
    }

    findExtensionIndex(engDir: string): number {
        var index = 0;
        for (let ext of this.extensionItems) {
            if (engDir.startsWith(ext.uri.fsPath))
                break;
            index++;
        }
        return index;
    }

    setLatestEngineFilesDownload(status: downloadStatus) {
        var ext = this.extensionItems[this.lastestEngineIndex];
        if (ext) {
            ext.engineFilesDownloadStatus = status;
        }
    }

    setLatestVTFilesDownload(status: downloadStatus) {
        var ext = this.extensionItems[this.lastestEngineIndex];
        if (ext) {
            ext.vtFilesDownloadStatus = status;
        }
    }
    
    finalizeVTFilesVersion(status: zippingStatus) {
        var ext = this.extensionItems[this.lastestEngineIndex];
        if (ext) {
            ext.hasVTFiles = true;
            ext.vtFilesZipStatus = status;
            this.vtFilesVersion = this.repoVTFilesVersion;
            this.setVTFilesVersion(this.repoVTFilesVersion);
            if (nlpStatusBar !== undefined) {
                nlpStatusBar.updateFilesVersion(this.repoVTFilesVersion);
            }
        }
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
            let v1 = parseInt(this.trimV(toks1[i]));
            let v2 = parseInt(this.trimV(toks2[i]));
            if (v1 > v2) return 1;
            if (v2 > v1) return -1;
        }
        return 0;
    }

    trimV(version: string): string {
        var ret = version;
        if (version.substring(0,1) == 'v') {
            ret = version.substring(1,version.length-1);
        }
        return ret;
    }

    engineDirectory() {
        return vscode.Uri.file(path.join(this.extensionDirectory().fsPath,this.NLPENGINE_FOLDER));
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
        return vscode.Uri.file(path.join(this.engineDirectory().fsPath,this.VISUALTEXT_FILES_FOLDER));
    }
  
    fetchExeVersion(extentionDir: string = '', debug: boolean=false) {
        visualText.cmdEngineVersion = '';
		const cp = require('child_process');
		var exe = path.join(extentionDir,this.NLPENGINE_FOLDER,this.NLP_EXE);
        if (debug) visualText.debugMessage('version exe: ' + exe);
        if (fs.existsSync(exe)) {
            return new Promise((resolve) => {
                const child = cp.spawn(exe, ['--version']);
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
                this.debugMessage(err);
            });      
        }
	}

    setExtEngineVersion(extentionDir: string, version: string): boolean {
        if (version.length) {
            var missingEngineVersion: boolean = false;
            var currentVersion = '';
            var latestVersion = '';
            let latestPath = '';
            for (let ext of this.extensionItems) {
                if (ext.uri.fsPath == extentionDir) {
                    ext.engineVersion = version;
                    ext.engineVersionStatus = versionStatus.DONE;
                    currentVersion = version;
                    latestPath = ext.uri.fsPath;
                } else if (ext.hasEngine == true) {
                    if (ext.engineVersion.length == 0) {
                        missingEngineVersion = true;
                    } else {
                        currentVersion = ext.engineVersion;
                        latestPath = ext.uri.fsPath;
                    }
                }
                if (latestVersion.length == 0 || this.versionCompare(currentVersion,latestVersion)) {
                    latestVersion = currentVersion;
                }
            }

            // If all versions are filled, set the global version
            if (!missingEngineVersion) {
                this.setEngineVersion(latestVersion);
                this.setEnginePath(path.join(latestPath,this.NLPENGINE_FOLDER,this.NLP_EXE));
            }         
        }
        return false;
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
    
    setEnginePath(path: string) {
        this.engineDir = vscode.Uri.file(path);
        const config = vscode.workspace.getConfiguration('engine');
        config.update('path',path,vscode.ConfigurationTarget.Global);
    }

    getEnginePath(): string | undefined {
        const config = vscode.workspace.getConfiguration('engine');
        return config.get<string>('path');
    }

    setVTFilesVersion(version: string) {
        this.vtFilesVersion = version;
        const config = vscode.workspace.getConfiguration('engine');
        config.update('visualtext',version,vscode.ConfigurationTarget.Global);
    }

    getVTFilesVersion(): string | undefined {
        const config = vscode.workspace.getConfiguration('engine');
        return config.get<string>('visualtext');
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

    getAnalyzer(): vscode.Uri {
        return this.currentAnalyzer;
    }

    hasAnalyzers(): boolean {
        var i = 0;
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
        var exePath = this.getEnginePath();
        if (exePath) {
            var engineDir = path.dirname(exePath);
            if (dirName.length)
                return path.join(engineDir,this.VISUALTEXT_FILES_FOLDER,dirName);
            else
                return path.join(engineDir,this.VISUALTEXT_FILES_FOLDER);
        }
        return '';
    }

    hasEngine(extDir: vscode.Uri): boolean {
        var engPath = path.join(extDir.fsPath,this.NLPENGINE_FOLDER,this.NLP_EXE);
        return fs.existsSync(engPath);
    }

    hasICUFiles(extDir: vscode.Uri, icuFileNum: number): boolean {
        var icu = '';
        switch (this.platform) {
            case 'win32':
                icu = icuFileNum == 1 ? this.ICU1_WIN : this.ICU2_WIN;
                break;

            case 'darwin':
                icu = icuFileNum == 1 ? this.ICU1_MAC : this.ICU2_MAC;
                break;

            default:
                icu = icuFileNum == 1 ? this.ICU1_LINUX : this.ICU2_LINUX;
        }
        var icuPath = path.join(extDir.fsPath,this.NLPENGINE_FOLDER,icu);
        return fs.existsSync(icuPath);
    }

    isEngineDirectory(dirPath: vscode.Uri): boolean {
        var engDir = path.join(dirPath.fsPath,this.NLPENGINE_FOLDER);
        if (engDir.length > 1 && fs.existsSync(engDir)) {
            var dirs = dirfuncs.getDirectories(vscode.Uri.file(engDir));
            var data = false;
            var analyzers = false;
    
            for (let dir of dirs) {
                if (path.basename(dir.fsPath).localeCompare('data') == 0) {
                    data = true;
                }
                else if (path.basename(dir.fsPath).localeCompare('analyzers') == 0) {
                    analyzers = true;
                }
            }
    
            return data && analyzers;
        }
        return false;
    }

    isVisualTextDirectory(dirPath: vscode.Uri): boolean {
        var engDir = path.join(dirPath.fsPath,this.NLPENGINE_FOLDER,this.VISUALTEXT_FILES_FOLDER);
        if (engDir.length > 1 && fs.existsSync(engDir)) {
            var dirs = dirfuncs.getDirectories(vscode.Uri.file(engDir));
            var spec = false;
            var analyzers = false;
            var help = false;

            for (let dir of dirs) {
                if (path.basename(dir.fsPath).localeCompare('spec') == 0) {
                    spec = true;
                }
                else if (path.basename(dir.fsPath).localeCompare('analyzers') == 0) {
                    analyzers = true;
                }
                else if (path.basename(dir.fsPath).localeCompare('Help') == 0) {
                    help = true;
                }
            }

            return spec && analyzers && help;            
        }
        return false;
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
        var ext = visualText.extensionItems[visualText.lastestEngineIndex];
        if (ext) {
            ext.engineDownloadStatus = downloadStatus.UPDATE;
            ext.hasEngine = false;
            this.updaterGlobalStatus = updaterStatus.REPAIR;
            this.debugMessage('NLP Engine updating version');
            return true;   
        }
        return false;
    }
    
    updateEngine() {
        if (this.setUpdateEngine())
            this.startUpdater();          
    }

    runUpdater() {
        if (this.setRerunUpdater())
            this.startUpdater();    
    }

    setRerunUpdater(): boolean {
        var ext = visualText.extensionItems[visualText.lastestEngineIndex];
        if (ext) {
            visualText.extensionItems = [];
            this.updaterGlobalStatus = updaterStatus.GATHER_EXTENSIONS;
            this.debugMessage('Update NLP Engine'); 
            return true;        
        }
        return false;      
    }

    setUpdateVTFiles(): boolean {
        var ext = visualText.extensionItems[visualText.lastestEngineIndex];
        if (ext) {
            ext.vtFilesDownloadStatus = downloadStatus.UPDATE  
            ext.hasVTFiles = false;
            this.updaterGlobalStatus = updaterStatus.REPAIR;
            this.debugMessage('VisualText files updating to version ' + visualText.repoVTFilesVersion); 
            return true;        
        }
        return false;      
    }

    updateVTFiles() {
        if (this.setUpdateVTFiles())
            this.startUpdater(); 
    }

	convertPatFiles(analyzerDir: vscode.Uri) {
		visualText.fileOps.addFileOperation(analyzerDir,analyzerDir,[fileOpRefresh.ANALYZER],fileOperation.RENAME,'pat','nlp');
		visualText.fileOps.startFileOps();
	}

    stopFileOps() {
        visualText.fileOps.stopAll();
    }
}
