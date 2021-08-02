import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Analyzer } from './analyzer';
import { dirfuncs } from './dirfuncs';
import { JsonState } from './jsonState';
import stream = require('stream');

export let visualText: VisualText;
export class VisualText {
    _ctx: vscode.ExtensionContext;
    
    public readonly LOG_SUFFIX = '_log';
    public readonly NLP_EXE = 'nlp.exe';
    public readonly GITHUB_LATEST_RELEASE = 'https://github.com/VisualText/nlp-engine/releases/latest/download/';
    public readonly GITHUB_LATEST_VERSION = 'https://github.com/VisualText/nlp-engine/releases/latest/';
    public readonly GITHUB_ENGINE_DIR_ZIP = 'visualtext.zip';

    public analyzer = new Analyzer();
    public debugOut = vscode.window.createOutputChannel('VisualText');
    private platform: string = '';
    private homeDir: string = '';
    private version: string = '';
    private username: string = '';
    private jsonState = new JsonState();
    private newerVersion: boolean = false;

    private analyzers: vscode.Uri[] = new Array();
    private extensionDir: vscode.Uri = vscode.Uri.file('');
    private engineDir: vscode.Uri = vscode.Uri.file('');
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
        this.debugMessage('NLP++ Extension version: ' + this.version);
    }
    
    static attach(ctx: vscode.ExtensionContext): VisualText {
        if (!visualText) {
            visualText = new VisualText(ctx);
            if (vscode.workspace.workspaceFolders) {
                visualText.workspaceFold = vscode.workspace.workspaceFolders[0].uri;
            }
            visualText.configureEngine();
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

    /*
    readConfig() {
        this.checkEngineVersion();
        this.configFindEngine();
        this.configEngineDirectories();
        this.configEngineExecutable(false);
        this.configFindUsername();
        this.configAnalzyerDirectory();
        this.getAnalyzers();
        this.configCurrentAnalzyer();

        if (dirfuncs.isDir(this.analyzerDir.fsPath)) {
            vscode.commands.executeCommand("vscode.openFolder",this.analyzerDir);
        }
    }
    */

    async configureEngine() {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Configure Engine',
            cancellable: false
        }, (progress, token) => {
            progress.report({ increment: 10, message: 'Check Version' });
            return this.configFindEngine().then(engineDir => {
                progress.report({ increment: 10, message: 'Find Engine' });
                return this.checkEngineVersion();
            }).then(newerVersion => {
                progress.report({ increment: 10, message: 'Engine directories' });
                return this.configEngineExecutable();
            }).then(engineExeDir => {
                progress.report({ increment: 10, message: 'Engine directories' });
                return this.configEngineDirectories();
            }).then(zipDir => {
                progress.report({ increment: 10, message: 'Extract VisualText directories' });
                return this.extractEngineDirZip();
            }).then(zip => {
                progress.report({ increment: 10, message: 'User name' });
                return this.configFindUsername();
            }).then(username => {
                progress.report({ increment: 10, message: 'Analyzer Directory' });
                return this.configAnalzyerDirectory();
            }).then(analyzerDir => {
                progress.report({ increment: 10, message: 'Analyzers' });
                this.getAnalyzers();
                this.configCurrentAnalzyer();
            }).catch(e => {
                this.debugMessage(`NLP Engine configuration failed - ${e.message}.${os.EOL}`);
                throw e;
            });
        });
    }

    checkEngineVersion() {
        return new Promise((resolve,reject) => {
            const https = require('follow-redirects').https;

            const request = https.get(this.GITHUB_LATEST_VERSION, function (res) {
                res.on('data', function (chunk) {
                    let url = res.responseUrl;
                    let version: string = url.substring(url.lastIndexOf('/') + 1);
                    const config = vscode.workspace.getConfiguration('engine');
                    let currentVersion: string | undefined = config.get<string>('version');
                    if (currentVersion == undefined && version.length) {
                        visualText.newerVersion = true;
                        config.update('version',version,vscode.ConfigurationTarget.Global);
                    } else if (currentVersion != undefined && version.localeCompare(currentVersion) != 0) {
                        visualText.newerVersion = true;
                        config.update('version',version,vscode.ConfigurationTarget.Global);
                    } else if (currentVersion != undefined && version.localeCompare(currentVersion) == 0) {
                        visualText.newerVersion = false;
                    }
                    resolve(visualText.newerVersion);
                });
            }).on('error', function (err) {
                reject(err);
            });
            request.end();
        });
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
        return new Promise((resolve,reject) => {
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

            resolve(directory);
        });
    }

    configEngineDirectories() {
        return new Promise((resolve,reject) => {
            
            const config = vscode.workspace.getConfiguration('engine');
            if (dirfuncs.isDir(this.engineDir.fsPath)) {
                var analyzerFolder = path.join(this.engineDir.fsPath,"analyzers");

                if (!fs.existsSync(analyzerFolder)) {
                    const url = this.GITHUB_LATEST_RELEASE + this.GITHUB_ENGINE_DIR_ZIP;
                    const toPath = path.join(this.engineDir.fsPath,this.GITHUB_ENGINE_DIR_ZIP);

                    const Downloader = require('nodejs-file-downloader');
                    const downloader = new Downloader({
                        url: url,   
                        directory: this.engineDir.fsPath        
                    })
                    try {
                        downloader.download();
                        dirfuncs.changeMod(toPath,755);
                        this.debugMessage('Downloaded: ' + url);
                        resolve(toPath);

                    } catch (error) {
                        console.log('Download failed',error);
                        reject(error);
                    }
                }
            }
        });
    }

    extractEngineDirZip() {
        return new Promise((resolve,reject) => {
            let zipPath = path.join(this.engineDir.fsPath,this.GITHUB_ENGINE_DIR_ZIP);
            const extract = require('extract-zip')
            try {
                extract(zipPath, { dir: this.engineDir.fsPath });
                this.debugMessage('Unzipped: ' + zipPath);
                dirfuncs.delFile(zipPath);
                this.configAnalzyerDirectory();
                vscode.commands.executeCommand("vscode.openFolder",this.analyzerDir);
                resolve(zipPath);

            } catch (err) {
                this.debugMessage('Could not unzip file: ' + zipPath);
                reject(zipPath);
            }
        });
    }

    configEngineExecutable() {
        return new Promise((resolve,reject) => {
            const config = vscode.workspace.getConfiguration('engine');
            if (this.engineDir.fsPath) {
                const toPath = path.join(this.engineDir.fsPath,this.NLP_EXE);
                if (this.engineDir.fsPath.length > 2 && !fs.existsSync(toPath) || visualText.newerVersion) {
                    if (visualText.newerVersion && fs.existsSync(toPath)) {
                        dirfuncs.delFile(toPath);
                    }
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
                    const url = this.GITHUB_LATEST_RELEASE + exe;

                    const https = require('follow-redirects').https;
                    const file = fs.createWriteStream(toPath);
                    let fileInfo;
                
                    const request = https.get(url, response => {
                        if (response.statusCode !== 200) {
                            reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
                            return;
                        }

                        fileInfo = {
                            mime: response.headers['content-type'],
                            size: parseInt(response.headers['content-length'], 10),
                        };

                        response.pipe(file);
                    });
                
                    // The destination stream is ended by the time it's called
                    file.on('finish', () => resolve(fileInfo));
                
                    request.on('error', err => {
                        fs.unlink(toPath, () => reject(err));
                    });
                
                    file.on('error', err => {
                        fs.unlink(toPath, () => reject(err));
                    });
                
                    request.end();             
                }
            }
        });
    }

    configFindEngine() {
        return new Promise((resolve,reject) => {
            const config = vscode.workspace.getConfiguration('engine');
            var engineDir = config.get<string>('path');

            if (engineDir && dirfuncs.isDir(engineDir)) {
                this.engineDir = vscode.Uri.file(engineDir);
                resolve(this.engineDir.fsPath);

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
                resolve(this.engineDir.fsPath);
            } else {
                reject();
                //this.askEngine();
            }
        });
    }

    configFindUsername() {
        return new Promise((resolve,reject) => {
            const config = vscode.workspace.getConfiguration('user');
            const username = config.get<string>('name');
            if (!username) {
                vscode.window.showErrorMessage("No user name for comments.", "Enter user name").then(response => {
                    vscode.window.showInputBox({ value: 'Your Name', prompt: 'Enter author name for comments' }).then(username => {
                        if (username) {
                            this.username = username;
                            config.update("name",username,vscode.ConfigurationTarget.Global);
                        }
                    });
                });
            } else {
                this.username = username;
            }
            resolve(username);
        });
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
}