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
    private analyzerDir: vscode.Uri = vscode.Uri.file('');
    private currentAnalyzer: vscode.Uri = vscode.Uri.file('');
    private workspaceFold: vscode.WorkspaceFolder | undefined = undefined;
    private state: any;

	constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;
        if (vscode.workspace.workspaceFolders) {
            this.workspaceFold = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];
            if (this.workspaceFold) {
                this.readState();
			}
		}
    }
    
    static attach(ctx: vscode.ExtensionContext): VisualText {
        if (!visualText) {
            visualText = new VisualText(ctx);
        }
        return visualText;
    }    

	readState() {
        if (this.workspaceFold) {
            this.analyzerDir = this.workspaceFold.uri;
            if (this.jsonState.jsonParse(this.analyzerDir,'state','visualText')) {
                var parse = this.jsonState.json.visualText[0];
                if (parse.analyzerDir) {
                    this.analyzerDir = vscode.Uri.file(parse.analyzerDir);
                }
                if (parse.currentAnalyzer) {
                    var dir = parse.currentAnalyzer;
                    if (fs.existsSync(dir))
                        this.currentAnalyzer = vscode.Uri.file(dir);
                    else
                        this.currentAnalyzer = vscode.Uri.file(path.join(this.analyzerDir.path,dir));
                    
                    this.analyzer.load(this.currentAnalyzer);
                }
            } else {
                this.setCurrentAnalyzer(this.analyzerDir)
            }       
        }
    }

    saveCurrentAnalyzer(currentAnalyzer: vscode.Uri) {
        var stateJsonDefault: any = {
            "visualText": [
                {
                    "name": "Analyzer",
                    "type": "state",
                    "currentAnalyzer": currentAnalyzer.path   
                }
            ]
        }
        this.jsonState.saveFile(this.analyzerDir.path, 'state', stateJsonDefault);
        this.setCurrentAnalyzer(currentAnalyzer);       
    }

    loadAnalyzer(analyzerDirectory: vscode.Uri) {
        this.analyzer.load(analyzerDirectory);
        vscode.commands.executeCommand('textView.refreshAll');
        vscode.commands.executeCommand('sequenceView.refreshAll');
        this.saveCurrentAnalyzer(analyzerDirectory);
    }

    setCurrentAnalyzer(currentAnalyzer: vscode.Uri) {
        if (this.jsonState.json) {
            var parse = this.jsonState.json.visualText[0];
            parse.currentAnalyzer = currentAnalyzer.path;
            this.jsonState.writeFile();
        }
    }

    getAnalyzer(analyzerDirectory: vscode.Uri) {
        return this.currentAnalyzer;
    }

    getAnalyzers(): vscode.Uri[] {
        if (this.analyzerDir.path.length) {
            this.analyzers = [];
            this.analyzers = dirfuncs.getDirectories(this.analyzerDir);
        }
        return this.analyzers;
    }
	hasWorkingDirectory(): boolean {
		return this.workspaceFold ? true : false;
	}

	getWorkingDirectory(): vscode.Uri {
        if (this.workspaceFold) {
		    return this.workspaceFold.uri;            
        }
        return vscode.Uri.file('');
    }
}