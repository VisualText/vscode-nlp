import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Analyzer } from './analyzer';
import { dirfuncs } from './dirfuncs';
import { JsonState } from './jsonState';

export let visualText: VisualText;
export class VisualText {
    _ctx: vscode.ExtensionContext;
    
    public readonly LOG_SUFFIX = '_log';
    public readonly NLP_EXE = 'nlp.exe';
    public readonly GITHUB_LATEST_RELEASE = 'https://github.com/VisualText/nlp-engine/releases/latest/download/';

    public analyzer = new Analyzer();
    public debugOut = vscode.window.createOutputChannel('VisualText');
    private platform: string = '';
    private homeDir: string = '';
    private version: string = '';
    private username: string = '';
    private jsonState = new JsonState();

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
        this.configFindEngine();
        this.configEngineDirectories();
        this.configEngineExecutable();
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

    configEngineDirectories() {
        const config = vscode.workspace.getConfiguration('engine');
        if (dirfuncs.isDir(this.engineDir.fsPath)) {
            const zipFile = 'visualtext.zip';
            const url = this.GITHUB_LATEST_RELEASE + zipFile;
            const toPath = path.join(this.engineDir.fsPath,zipFile);
            this.debugMessage('toPath: ' + toPath);

            const Downloader = require('nodejs-file-downloader');

            (async () => {
            
                const downloader = new Downloader({
                    url: url,   
                    directory: this.engineDir.fsPath        
                })
                try {
                    await downloader.download();
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
                    this.debugMessage('Error: ' + error);
                    console.log('Download failed',error);
                }
            
            })();
        }
    }

    configEngineExecutable() {
        const config = vscode.workspace.getConfiguration('engine');
        if (this.engineDir.fsPath) {
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
            const toPath = path.join(this.engineDir.fsPath,this.NLP_EXE);

            const Downloader = require('nodejs-file-downloader');
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
                } catch (error) {
                    this.debugMessage('FAILED download: ' + url);
                }
            
            })(); 

        }
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
                        this.username = username;
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
}