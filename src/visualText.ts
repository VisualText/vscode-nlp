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

    public analyzer = new Analyzer();
    public debugOut = vscode.window.createOutputChannel("VisualText");
    private platform: string = '';
    private homeDir: string = '';
    private version: string = '';
    private jsonState = new JsonState();

    private analyzers: vscode.Uri[] = new Array();
    private engineDir: vscode.Uri = vscode.Uri.file('');
    private analyzerDir: vscode.Uri = vscode.Uri.file('');
    private currentAnalyzer: vscode.Uri = vscode.Uri.file('');
    private workspaceFold: vscode.WorkspaceFolder | undefined = undefined;
    private username: string = '';

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

        this.readConfig();
    }
    
    static attach(ctx: vscode.ExtensionContext): VisualText {
        if (!visualText) {
            visualText = new VisualText(ctx);
            if (vscode.workspace.workspaceFolders) {
                visualText.workspaceFold = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];
                if (visualText.workspaceFold) {
                    visualText.readConfig();
                    visualText.readState();
                    visualText.initSettings();
                }
            }
        }
        return visualText;
    }

    public debugMessage(msg: string) {
        this.debugOut.show();
        this.debugOut.appendLine(msg);
    }

	readState(): boolean {
        if (this.workspaceFold) {
            this.analyzerDir = this.workspaceFold.uri;
            if (this.jsonState.jsonParse(this.analyzerDir,'state','visualText')) {
                var saveit = false;
                var parse = this.jsonState.json.visualText[0];
                var currAnalyzer = parse.currentAnalyzer;

                if (currAnalyzer.length == 0) {
                    var analyzers = dirfuncs.getDirectories(this.workspaceFold.uri);
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
        var directory = config.get<string>('directory');
        if (!directory) {
            directory = path.join(this.engineDir.fsPath,'analyzers');
            config.update('directory',directory,vscode.ConfigurationTarget.Global);
        }
        this.analyzerDir = vscode.Uri.file(directory);
    }

    configEngineExecutable() {
        const config = vscode.workspace.getConfiguration('engine');
        const platform = config.get<string>('platform');
        const exePathFrom = path.join(this.engineDir.fsPath,'exe');
        if (dirfuncs.isDir(exePathFrom)) {
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
            const fromPath = path.join(exePathFrom,exe);
            const pathTo = path.join(this.engineDir.fsPath,'nlp.exe');
            dirfuncs.copyFile(fromPath,pathTo);
            dirfuncs.changeMod(pathTo,755);
        }
    }

    configFindEngine() {    
        let extDir = '.vscode';
        if (this.platform == 'linux' || this.platform == 'darwin') {
            extDir = '.vscode-server';
        }
        this.engineDir = vscode.Uri.file(path.join(this.homeDir,extDir,'extensions','dehilster.nlp-'+this.version,'nlp-engine'));

        const config = vscode.workspace.getConfiguration('engine');
        if (dirfuncs.isDir(this.engineDir.fsPath)) {
            config.update('path',this.engineDir.fsPath,vscode.ConfigurationTarget.Global);
            this.debugMessage('Engine directory: ' + this.engineDir.fsPath);
        } else {
            this.debugMessage('CANNOT FIND Engine directory: ' + this.engineDir.fsPath);            
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
		return this.workspaceFold?.uri.fsPath.length ? true : false;
	}

	getWorkspaceFolder(): vscode.Uri {
        if (this.workspaceFold) {
		    return this.workspaceFold.uri;            
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