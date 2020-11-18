import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Analyzer } from './analyzer';
import { dirfuncs } from './dirfuncs';
import { JsonState } from './jsonState';

export let visualText: VisualText;
export class VisualText {
    _ctx: vscode.ExtensionContext;

    public analyzer = new Analyzer();
    private jsonState = new JsonState();

    private analyzers: vscode.Uri[] = new Array();
    private engineDir: vscode.Uri = vscode.Uri.file('');
    private analyzerDir: vscode.Uri = vscode.Uri.file('');
    private currentAnalyzer: vscode.Uri = vscode.Uri.file('');
    private workspaceFold: vscode.WorkspaceFolder | undefined = undefined;

	constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;
    }
    
    static attach(ctx: vscode.ExtensionContext): VisualText {
        if (!visualText) {
            visualText = new VisualText(ctx);
            if (vscode.workspace.workspaceFolders) {
                visualText.workspaceFold = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];
                if (visualText.workspaceFold) {
                    visualText.readState();
                    visualText.getAnalyzers();
                }
            }
        }
        return visualText;
    }

	readState(): boolean {
        if (this.workspaceFold) {
            this.analyzerDir = this.workspaceFold.uri;
            if (this.jsonState.jsonParse(this.analyzerDir,'state','visualText')) {
                var parse = this.jsonState.json.visualText[0];
                var currAnalyzer = parse.currentAnalyzer;
                if (currAnalyzer.length == 0) {
                    var analyzers = dirfuncs.getDirectories(this.workspaceFold.uri);
                    currAnalyzer = analyzers[0].path;
                }
                if (currAnalyzer) {
                    if (fs.existsSync(currAnalyzer))
                        this.currentAnalyzer = vscode.Uri.file(currAnalyzer);
                    else
                        this.currentAnalyzer = vscode.Uri.file(path.join(this.analyzerDir.path,currAnalyzer));
                    if (parse.engineDir) {
                        this.engineDir = vscode.Uri.file(path.join(parse.engineDir));
                        this.initSettings();
                    }
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
            var toDir = path.join(this.analyzerDir.path,'.vscode');
            if (!dirfuncs.copyDirectory(fromDir,toDir)) {
                vscode.window.showWarningMessage('Copy settings file failed');
                return false;
            }            
        }
        return false;
    }

    saveCurrentAnalyzer(currentAnalyzer: vscode.Uri) {
        if (this.getEngineDirectory().path.length < 2) {
            this.engineDir = dirfuncs.findFolder(this.getWorkspaceFolder(),'nlp-engine');
        }
        var stateJsonDefault: any = {
            "visualText": [
                {
                    "name": "Analyzer",
                    "type": "state",
                    "engineDir": this.getEngineDirectory().path,
                    "currentAnalyzer": currentAnalyzer.path   
                }
            ]
        }
        this.jsonState.saveFile(this.analyzerDir.path, 'state', stateJsonDefault);
        this.setCurrentAnalyzer(currentAnalyzer);       
    }

    loadAnalyzer(analyzerDirectory: vscode.Uri) {
        this.saveCurrentAnalyzer(analyzerDirectory);
        this.analyzer.load(analyzerDirectory);
        vscode.commands.executeCommand('textView.refreshAll');
        vscode.commands.executeCommand('sequenceView.refreshAll');
        vscode.commands.executeCommand('outputView.refreshAll');
        vscode.commands.executeCommand('analyzerView.reveal', analyzerDirectory);
    }

    setCurrentAnalyzer(currentAnalyzer: vscode.Uri) {
        if (this.jsonState.json) {
            var parse = this.jsonState.json.visualText[0];
            parse.currentAnalyzer = currentAnalyzer.path;
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
        if (this.analyzerDir.path.length) {
            this.analyzers = [];
            this.analyzers = dirfuncs.getDirectories(this.analyzerDir);
        }
        return this.analyzers;
    }

	hasWorkspaceFolder(): boolean {
		return this.workspaceFold?.uri.path.length ? true : false;
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
            return path.join(this.getEngineDirectory().path,'visualtext',dirName);
        else
            return path.join(this.getEngineDirectory().path,'visualtext');
    }
}