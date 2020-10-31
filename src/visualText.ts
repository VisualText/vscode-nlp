import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Analyzer } from './analyzer';
import { dirfuncs } from './dirfuncs';
import { settings } from './settings';

export let visualText: VisualText;
export class VisualText {
    _ctx: vscode.ExtensionContext;

    public analyzer = new Analyzer();

    private analyzers: vscode.Uri[] = new Array();
    private currentTextFile: vscode.Uri = vscode.Uri.file('');
    private analyzerDir: vscode.Uri = vscode.Uri.file('');
    private currentAnalyzer: vscode.Uri = vscode.Uri.file('');
    private workspaceFold: vscode.WorkspaceFolder | undefined = undefined;
    private state: any;

	constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;
        if (vscode.workspace.workspaceFolders) {
            this.workspaceFold = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];
            if (this.workspaceFold) {
                this.init();
			}
		}
    }
    
	init() {
        this.state = settings.jsonParse(this.workspaceFold.uri,'state','visualText');
        if (this.state) {
            var parse = this.state.visualText[0];
            if (parse.analyzerDir) {
                this.analyzerDir = vscode.Uri.file(parse.analyzerDir);
            }
            if (parse.currentAnalyzer) {
                if (fs.existsSync(parse.currentAnalyzer))
                    this.currentAnalyzer = vscode.Uri.file(parse.currentAnalyzer);
                else
                    this.currentAnalyzer = vscode.Uri.file(path.join(this.analyzerDir.path,parse.currentAnalyzer));
                this.analyzer.setWorkingDir(this.currentAnalyzer);
                this.analyzer.readSettings();
            }
        }
    }
    
    static attach(ctx: vscode.ExtensionContext): VisualText {
        if (!visualText) {
            visualText = new VisualText(ctx);
        }
        return visualText;
    }

    loadAnalyzer(analyzerDirectory: vscode.Uri) {
        this.analyzer.load(analyzerDirectory);
        vscode.commands.executeCommand('textView.refreshAll');
        vscode.commands.executeCommand('sequenceView.refreshAll');
        settings.setCurrentAnalyzer(this.analyzerDir, 'state', 'visualText', this.analyzerDir);
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

    setTextFile(textFile: vscode.Uri) {
        this.currentTextFile = textFile;
        this.analyzer.saveCurrentFile(textFile);
    }

    getTextFile(): vscode.Uri {
        return this.currentTextFile;
    }

	hasWorkingDirectory(): boolean {
		return this.workspaceFold ? true : false;
	}

	getWorkingDirectory(): vscode.Uri {
		return this.workspaceFold.uri;
    }
}