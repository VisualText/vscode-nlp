import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { analyzerView } from './analyzerView';
import { JsonState } from './jsonState';

export let analyzer: Analyzer;
export class Analyzer {

    private jsonState = new JsonState();
    private analyzerDir: vscode.Uri = vscode.Uri.file('');
    private specDir: vscode.Uri = vscode.Uri.file('');
    private inputDir: vscode.Uri = vscode.Uri.file('');
    private outputDir: vscode.Uri = vscode.Uri.file('');
    private textPath: vscode.Uri = vscode.Uri.file('');
    private state: any;

	constructor() {
    }

	readState() {
        if (this.jsonState.jsonParse(this.analyzerDir,'state','visualText')) {
            var parse = this.jsonState.json.visualText[0];
            if (parse.currentTextFile) {
                var currentFile = parse.currentTextFile;
                if (fs.existsSync(currentFile))
                    this.textPath = vscode.Uri.file(currentFile);
                else
                    this.textPath = vscode.Uri.file(path.join(this.getInputDirectory().path,currentFile));
                this.outputDirectory();               
            }
        }
    }

    saveCurrentFile(currentFile: vscode.Uri) {
        var stateJsonDefault: any = {
            "visualText": [
                {
                    "name": "Analyzer",
                    "type": "state",
                    "currentTextFile": currentFile.path  
                }
            ]
        }
        this.jsonState.saveFile(this.analyzerDir.path, 'state', stateJsonDefault);      
        this.outputDirectory();
    }

    load(analyzerDir: vscode.Uri) {
        this.setWorkingDir(analyzerDir);
        this.readState();
        vscode.commands.executeCommand('analyzerView.updateTitle',analyzerDir);
        if (this.textPath.path.length)
            vscode.commands.executeCommand('textView.updateTitle',vscode.Uri.file(this.textPath.path));
    }

    outputDirectory() {
        if (this.textPath.path.length) {
            this.outputDir = vscode.Uri.file(this.textPath.path + '_log');
        } else {
            this.outputDir = vscode.Uri.file(path.join(this.analyzerDir.path,'output'));
        }
    }

    clearOutputDirectory() {
        if (fs.lstatSync(this.outputDir.path).isDirectory()) {
            fs.readdir(this.outputDir.path, (err, files) => {
                if (err) throw err;
            
                for (const file of files) {
                    fs.unlink(path.join(this.outputDir.path, file), err => {
                        if (err) throw err;
                    });
                }
            });            
        }
    }

    getInputDirectory(): vscode.Uri {
        return this.inputDir;
    }

    getSpecDirectory(): vscode.Uri {
		return this.specDir;
	}

    getOutputDirectory(): vscode.Uri {
        return this.outputDir;
    }

    getTextPath(): string {
        return this.textPath.path;
    }

	setWorkingDir(directory: vscode.Uri) {
		this.analyzerDir = directory;
        this.specDir = vscode.Uri.file(path.join(directory.path,'spec'));
        this.inputDir = vscode.Uri.file(path.join(directory.path,'input'));
	}
}