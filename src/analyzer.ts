import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { settings } from './settings';

export let analyzer: Analyzer;
export class Analyzer {
    private analyzerDir: vscode.Uri = vscode.Uri.file('');
    private specDir: vscode.Uri = vscode.Uri.file('');
    private inputDir: vscode.Uri = vscode.Uri.file('');
    private outputDir: vscode.Uri = vscode.Uri.file('');
    private textPath: string = '';
    private state: any;

	constructor() {
    }

	readSettings() {
        this.state = settings.jsonParse(this.analyzerDir,'state','visualText');
        if (this.state) {
            var parse = this.state.visualText[0];
            if (parse.currentTextFile) {
                if (fs.existsSync(parse.currentTextFile))
                    this.textPath = parse.currentTextFile;
                else
                    this.textPath = path.join(this.getInputDirectory().path, parse.currentTextFile);
                this.outputDirectory();
            }
        }
    }

    saveCurrentFile(file: vscode.Uri) {
        settings.setCurrentFile(this.analyzerDir, 'state', 'visualText', file);
        this.textPath = file.path;
        this.outputDirectory();
    }

    createConfig(name: string) {
        if (!this.state) {
            //configs.createLevelOne('settings','visualText');
        }
    }

    load(analyzerDir: vscode.Uri) {
        this.setWorkingDir(analyzerDir);
        this.readSettings();
    }

    outputDirectory() {
        if (this.textPath.length) {
            this.outputDir = vscode.Uri.file(this.textPath + '_log');
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
        return this.textPath;
    }

	setWorkingDir(directory: vscode.Uri) {
		this.analyzerDir = directory;
        this.specDir = vscode.Uri.file(path.join(directory.path,'spec'));
        this.inputDir = vscode.Uri.file(path.join(directory.path,'input'));
	}
}