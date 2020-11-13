import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Analyzer } from './analyzer';
import { dirfuncs } from './dirfuncs';
import { JsonState } from './jsonState';
import { Z_FIXED } from 'zlib';

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
        if (vscode.workspace.workspaceFolders) {
            this.workspaceFold = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];
            if (this.workspaceFold) {
                this.readState();
                this.getAnalyzers();
			}
		}
    }
    
    static attach(ctx: vscode.ExtensionContext): VisualText {
        if (!visualText) {
            visualText = new VisualText(ctx);
        }
        return visualText;
    }

	readState(): boolean {
        if (this.workspaceFold) {
            this.analyzerDir = this.workspaceFold.uri;
            if (this.jsonState.jsonParse(this.analyzerDir,'state','visualText')) {
                var parse = this.jsonState.json.visualText[0];
                if (parse.currentAnalyzer) {
                    var dir = parse.currentAnalyzer;
                    if (fs.existsSync(dir))
                        this.currentAnalyzer = vscode.Uri.file(dir);
                    else
                        this.currentAnalyzer = vscode.Uri.file(path.join(this.analyzerDir.path,dir));
                    if (parse.engineDir) {
                        this.engineDir = vscode.Uri.file(path.join(parse.engineDir));
                        this.initSettings();
                    }
                    this.analyzer.load(this.currentAnalyzer);
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
        this.analyzer.load(analyzerDirectory);
        this.saveCurrentAnalyzer(analyzerDirectory);
        vscode.commands.executeCommand('textView.refreshAll');
        vscode.commands.executeCommand('sequenceView.refreshAll');
        vscode.commands.executeCommand('outputView.refreshAll');
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