import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Analyzer } from './analyzer';
import { dirfuncs } from './dirfuncs';
import { JsonState } from './jsonState';
import { nlpStatusBar } from './status';

export enum vtStatus { UNKNOWN, VERSION, VERSION_DONE, DONE }

export let visualText: VisualText;
export class VisualText {
    _ctx: vscode.ExtensionContext;
    
    public readonly LOG_SUFFIX = '_log';
    public readonly NLP_EXE = 'nlp.exe';
    public readonly VISUALTEXT_FILES_DIR = 'visualtext';
    public readonly NLPENGINE_FILES_ASSET = 'nlpengine.zip';
    public readonly VISUALTEXT_FILES_ASSET = 'visualtext.zip';
    public readonly GITHUB_ENGINE_LATEST_RELEASE = 'https://github.com/VisualText/nlp-engine/releases/latest/download/';
    public readonly GITHUB_ENGINE_LATEST_VERSION = 'https://github.com/VisualText/nlp-engine/releases/latest/';
    public readonly GITHUB_VISUALTEXT_FILES_LATEST_RELEASE = 'https://github.com/VisualText/visualtext-files/releases/latest/download/';
    public readonly GITHUB_VISUALTEXT_FILES_LATEST_VERSION = 'https://github.com/VisualText/visualtext-files/releases/latest/';

    public analyzer = new Analyzer();
    public version: string = '';
    public engineVersion: string = '';
    public filesVersion: string = '';
    public engineDir: vscode.Uri = vscode.Uri.file('');

    public debugOut = vscode.window.createOutputChannel('VisualText');
    private platform: string = '';
    private homeDir: string = '';
    private username: string = '';
    private jsonState = new JsonState();
    private newerEngineVersion: boolean = false;
    private newerFileVersion: boolean = false;
    private statusEngine: vtStatus = vtStatus.UNKNOWN;
    private statusFiles: vtStatus = vtStatus.UNKNOWN;
    private analyzers: vscode.Uri[] = new Array();
    private extensionDir: vscode.Uri = vscode.Uri.file('');

    private analyzerDir: vscode.Uri = vscode.Uri.file('');
    private currentAnalyzer: vscode.Uri = vscode.Uri.file('');
    private workspaceFold: vscode.Uri = vscode.Uri.file('');

	constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;
        this.debugOut.show();

        this.platform = os.platform();
        let plat = this.platform == 'darwin' ? 'mac' : this.platform;
        this.debugMessage('Platform: ' + plat);

        this.homeDir = os.homedir();
        this.debugMessage('User profile path: ' + this.homeDir);

        this.version = vscode.extensions.getExtension('dehilster.nlp')?.packageJSON.version;
        this.debugMessage('VSCode NLP++ Extension version: ' + this.version);
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

    public debugMessage(msg: string) {
        this.debugOut.show();
        this.debugOut.appendLine(msg);
    }

	readState(): boolean {
        if (this.workspaceFold) {
            this.analyzerDir = this.workspaceFold;
            if (this.jsonState.jsonParse(this.analyzerDir,'state','visualText')) {
                var saveit = false;
                var parse = this.jsonState.json.visualText[0];
                var currAnalyzer = parse.currentAnalyzer;

                if (currAnalyzer.length == 0) {
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
        vscode.commands.executeCommand('workbench.action.openPanel');
        this.configFindEngine();
        this.configEngineExecutable();
        this.configureVisualTextFiles();
        this.configFindUsername();
        this.configAnalzyerDirectory();
        this.getAnalyzers();
        this.configCurrentAnalzyer();

        if (dirfuncs.isDir(this.analyzerDir.fsPath)) {
            vscode.commands.executeCommand("vscode.openFolder",this.analyzerDir);
        }
    }

    configCurrentAnalzyer() {
        const config = vscode.workspace.getConfiguration('analyzer');
        var current = config.get<string>('current');
        if (!current) {
            if (this.analyzers.length) {
                this.currentAnalyzer = this.analyzers[0];
                config.update('current',this.currentAnalyzer.fsPath,vscode.ConfigurationTarget.WorkspaceFolder);
                config.update('current',this.currentAnalyzer.fsPath,vscode.ConfigurationTarget.Global);
                this.debugMessage('Current analyzer: '+this.currentAnalyzer.fsPath);
            }
        } else {
            this.currentAnalyzer = vscode.Uri.file(current);
        }
    }

    configAnalzyerDirectory() {
        const config = vscode.workspace.getConfiguration('analyzer');

        if (this.workspaceFold.fsPath.length > 1 && dirfuncs.analyzerFolderCount(this.workspaceFold)) {
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

    configureVisualTextFiles() {
        if (dirfuncs.isDir(this.engineDir.fsPath)) {
            var visualTextDir = path.join(this.engineDir.fsPath,this.VISUALTEXT_FILES_DIR);
            if (!fs.existsSync(visualTextDir)) {
                dirfuncs.makeDir(visualTextDir);
            }

            this.checkVisualTextFilesVersion()
            .then(value => {
                if (visualText.newerFileVersion) {
                    const toPath = path.join(this.engineDir.fsPath,this.VISUALTEXT_FILES_DIR);
                    this.downloadVisualTextFiles(toPath);
                    const config = vscode.workspace.getConfiguration('engine');
                    config.update('visualtext',visualText.filesVersion,vscode.ConfigurationTarget.Global);
                    visualText.debugMessage('VisualText files updated to version ' + visualText.filesVersion);
                    nlpStatusBar.updateFilesVersion(visualText.filesVersion);                  
                } else {
                    visualText.debugMessage('VisualText files version ' + visualText.filesVersion);
                }

            }).catch(err => {
                this.debugMessage(err);
            });
        }
    }

    checkVisualTextFilesVersion() {
        return new Promise((resolve,reject) => {
            const https = require('follow-redirects').https;
            this.statusFiles = vtStatus.VERSION;

            const request = https.get(this.GITHUB_VISUALTEXT_FILES_LATEST_VERSION, function (res) {
                res.on('data', function (chunk) {
                    if (visualText.statusFiles == vtStatus.VERSION) {
                        let url = res.responseUrl;
                        visualText.filesVersion = url.substring(url.lastIndexOf('/') + 1);
                        const config = vscode.workspace.getConfiguration('engine');
                        let currentVersion: string | undefined = config.get<string>('visualtext');

                        if (((currentVersion == undefined || currentVersion.length == 0) && visualText.filesVersion.length) ||
                            (currentVersion != undefined && visualText.filesVersion.localeCompare(currentVersion) != 0)) {

                            visualText.newerFileVersion = true;

                        } else if (currentVersion != undefined && visualText.filesVersion.localeCompare(currentVersion) == 0) {
                            var visualTextDir = path.join(visualText.engineDir.fsPath,visualText.VISUALTEXT_FILES_DIR);
                            if (visualText.isVisualTextDirectory(vscode.Uri.file(visualTextDir)))
                                visualText.newerFileVersion = false;
                            else
                                visualText.newerFileVersion = true;
                        }  
                        visualText.statusFiles = vtStatus.VERSION_DONE;                     
                    }
                    resolve(visualText.newerFileVersion);
                });
            }).on('error', function (err) {
                reject(err);
            });
            request.end();
        });
    }

    checkEngineVersion() {
        return new Promise((resolve,reject) => {
            const https = require('follow-redirects').https;
            this.statusEngine = vtStatus.VERSION;

            const request = https.get(this.GITHUB_ENGINE_LATEST_VERSION, function (res) {
                res.on('data', function (chunk) {
                    if (visualText.statusEngine == vtStatus.VERSION) {
                        let url = res.responseUrl;
                        visualText.engineVersion = url.substring(url.lastIndexOf('/') + 1);
                        const config = vscode.workspace.getConfiguration('engine');
                        let currentVersion: string | undefined = config.get<string>('version');

                        if (((currentVersion == undefined || currentVersion.length == 0) && visualText.engineVersion.length) ||
                            (currentVersion != undefined && visualText.engineVersion.localeCompare(currentVersion) != 0)) {

                            visualText.newerEngineVersion = true;

                        } else if (currentVersion != undefined && visualText.engineVersion.localeCompare(currentVersion) == 0) {
                            if (visualText.hasEngineDirectories(visualText.engineDir))
                                visualText.newerEngineVersion = false;
                            else
                                visualText.newerEngineVersion = true;
                            }  
                        visualText.statusEngine = vtStatus.VERSION_DONE;                     
                    }
                    resolve(visualText.newerEngineVersion);
                });
            }).on('error', function (err) {
                reject(err);
            });
            request.end();
        });
    }

    public existsNewerVersion(): boolean {
        return this.newerEngineVersion ? true : false;
    }

    public existsNewerFileVersion(): boolean {
        return this.newerFileVersion ? true : false;
    }

    configEngineExecutable() {
        if (this.engineDir.fsPath) {
            const toPath = path.join(this.engineDir.fsPath,this.NLP_EXE);

            if (!fs.existsSync(toPath)) {
                visualText.newerEngineVersion = true;
                this.downloadExecutable(toPath);
                this.downloadEngineFiles();
                return;
            }

            this.checkEngineVersion()
            .then(value => {
                if (visualText.newerEngineVersion) {
                    this.downloadExecutable(toPath);
                    this.downloadEngineFiles();
                    const config = vscode.workspace.getConfiguration('engine');
                    config.update('version',visualText.engineVersion,vscode.ConfigurationTarget.Global);
                    visualText.debugMessage('NLP Engine updated to version ' + visualText.engineVersion);
                } else {
                    visualText.debugMessage('NLP Engine version ' + visualText.engineVersion);
                }
                nlpStatusBar.updateVersion(visualText.engineVersion);      

            }).catch(err => {
                this.debugMessage(err);
            });
        }
    }
    
    downloadVisualTextFiles(toPath: string) {
         if (this.newerFileVersion) {
            const url = this.GITHUB_VISUALTEXT_FILES_LATEST_RELEASE + this.VISUALTEXT_FILES_ASSET;

            const Downloader = require('nodejs-file-downloader');

            (async () => {
            
                const downloader = new Downloader({
                    url: url,   
                    directory: this.engineDir.fsPath        
                })
                try {
                    await downloader.download();
                    const toPath = path.join(this.engineDir.fsPath,this.VISUALTEXT_FILES_ASSET);
                    dirfuncs.changeMod(toPath,755);
                    this.debugMessage('Downloaded: ' + url);

                    const extract = require('extract-zip')
                    try {
                        var visualTextDir = path.join(this.engineDir.fsPath,this.VISUALTEXT_FILES_DIR);
                        dirfuncs.delDir(visualTextDir);
                        dirfuncs.makeDir(visualTextDir);
                        await extract(toPath, { dir: visualTextDir });
                        this.debugMessage('Unzipped: ' + toPath);
                        dirfuncs.delFile(toPath);
                    } catch (err) {
                        this.debugMessage('Could not unzip file: ' + toPath);
                    }

                } catch (error) {
                    console.log('Download failed',error);
                }

            })();
        }
    }

    downloadEngineFiles() {
        if (this.newerEngineVersion) {
           const url = this.GITHUB_ENGINE_LATEST_RELEASE + this.NLPENGINE_FILES_ASSET;

           const Downloader = require('nodejs-file-downloader');

           (async () => {
           
               const downloader = new Downloader({
                   url: url,   
                   directory: this.engineDir.fsPath        
               })
               try {
                   await downloader.download();
                   const toPath = path.join(this.engineDir.fsPath,this.NLPENGINE_FILES_ASSET);
                   dirfuncs.changeMod(toPath,755);
                   this.debugMessage('Downloaded: ' + url);

                   const extract = require('extract-zip')
                   try {
                       await extract(toPath, { dir: this.engineDir.fsPath });
                       this.debugMessage('Unzipped: ' + toPath);
                       dirfuncs.delFile(toPath);
                   } catch (err) {
                       this.debugMessage('Could not unzip file: ' + toPath);
                   }

               } catch (error) {
                   console.log('Download failed',error);
               }

           })();
       }
   }

    downloadExecutable(toPath: string) {
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
        const Downloader = require('nodejs-file-downloader');
        var localExePat = path.join(this.engineDir.fsPath,this.NLP_EXE);
        if (fs.existsSync(localExePat)) {
            dirfuncs.delFile(localExePat);
        }

        (async () => {
        
            const downloader = new Downloader({
                url: url,   
                directory: this.engineDir.fsPath,
                filename: this.NLP_EXE
            })
            try {
                await downloader.download();
                dirfuncs.changeMod(toPath,755);
                this.debugMessage('Downloaded: ' + url);
                this.checkEngineVersion();
                
            } catch (error) {
                this.debugMessage('FAILED download: ' + url);
            }

        })();     
    }

    configFindEngine() {    
        const config = vscode.workspace.getConfiguration('engine');
        var engineDir = config.get<string>('path');

        if (engineDir && dirfuncs.isDir(engineDir)) {
            this.engineDir = vscode.Uri.file(engineDir);

        } else {
            // Check if the engine came with vscode-nlp
            let extDir = '.vscode';
            if (this.platform == 'linux' || this.platform == 'darwin') {
                extDir = '.vscode-server';
            }
            this.extensionDir = vscode.Uri.file(path.join(this.homeDir,extDir,'extensions','dehilster.nlp-'+this.version));

            if (dirfuncs.isDir(this.extensionDir.fsPath)) {
                this.engineDir = vscode.Uri.file(path.join(this.extensionDir.fsPath,'nlp-engine'));
                if (!dirfuncs.isDir(this.engineDir.fsPath)) {
                    this.debugMessage('Creating directory: ' + this.extensionDir.fsPath);
                    dirfuncs.makeDir(this.engineDir.fsPath);
                }
                config.update('path',this.engineDir.fsPath,vscode.ConfigurationTarget.Global);
            } else {
                vscode.window.showWarningMessage('NLP Engine not set. Set in the NLP extension settings.');
            }
        }

        if (dirfuncs.isDir(this.engineDir.fsPath)) {
            this.debugMessage('Engine directory: ' + this.engineDir.fsPath);
        } else {
            this.askEngine();
        }
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

	askEngine() {
        var enginePath = '';
        var startingPath = vscode.Uri.file('');
        
        if (vscode.workspace.workspaceFolders) {
            if (vscode.workspace.workspaceFolders.length === 1) {
                startingPath = vscode.workspace.workspaceFolders[0].uri;
            }
        }

        vscode.window.showErrorMessage("Unknown nlp engine path.", "Enter path manually").then(response => {

            const options: vscode.OpenDialogOptions = {
                canSelectMany: false,
                openLabel: 'Open',
                defaultUri: startingPath,
                canSelectFiles: false,
                canSelectFolders: true
            };
            
            vscode.window.showOpenDialog(options).then(engPath => {
                if (!engPath) {
                    return;
                }
                var newPath = engPath[0].fsPath;
                var exe = path.join(newPath,'nlp.exe');
                if (!dirfuncs.isDir(newPath) || !fs.existsSync(exe)) {
                    this.debugMessage("Unknown nlp engine path.");
                } else {
                    enginePath = newPath;
					visualText.setEngineDir(engPath[0]);
                    const config = vscode.workspace.getConfiguration('engine');
                    config.update('path',enginePath,vscode.ConfigurationTarget.Global);								
                }
            });
        });
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
        vscode.commands.executeCommand('outputView.refreshAll');
    }

    setCurrentAnalyzer(currentAnalyzer: vscode.Uri) {
        if (this.jsonState.json) {
            var parse = this.jsonState.json.visualText[0];
            parse.currentAnalyzer = currentAnalyzer.fsPath;
            this.jsonState.writeFile();
        }
    }

    setEngineDir(path: vscode.Uri) {
        this.engineDir = path;
    }

    getAnalyzer(): vscode.Uri {
        return this.currentAnalyzer;
    }
    
    getEngineDirectory() {
        return this.engineDir;
    }

    hasAnalyzers(): boolean {
        var i = 0;
        return this.analyzers.length ? true : false;
    }

    getAnalyzers(): vscode.Uri[] {
        if (this.analyzerDir.fsPath.length) {
            this.analyzers = [];
            this.analyzers = dirfuncs.getDirectories(this.analyzerDir);
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
        if (dirName.length)
            return path.join(this.getEngineDirectory().fsPath,'visualtext',dirName);
        else
            return path.join(this.getEngineDirectory().fsPath,'visualtext');
    }

    hasEngineDirectories(dirPath: vscode.Uri): boolean {
        var dirs = dirfuncs.getDirectories(dirPath);
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

    isVisualTextDirectory(dirPath: vscode.Uri): boolean {
        var dirs = dirfuncs.getDirectories(dirPath);
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
}