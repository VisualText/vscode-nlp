import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { isAbsolute } from 'path';
import { SequenceFile, moveDirection } from './sequence';
import { TextFile, nlpFileType, separatorType } from './textFile';

export let analyzer: Analyzer;
export class Analyzer {
    private specDir: vscode.Uri = vscode.Uri.file('');
    private inputDir: vscode.Uri = vscode.Uri.file('');
    private outputDir: vscode.Uri = vscode.Uri.file('');
    private workingDir: vscode.Uri = vscode.Uri.file('');

	constructor() {
        if (vscode.workspace.workspaceFolders) {
            const workspaceFolder = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];
            if (workspaceFolder) {
				this.setWorkingDir(workspaceFolder.uri);
			}
		}
    }
    
	hasWorkingDirectory(): boolean {
		return this.workingDir.path.length ? true : false;
	}

	getWorkingDirectory(): vscode.Uri {
		return this.workingDir;
    }
    
    getSpecDirectory(): vscode.Uri {
		return this.specDir;
	}

    getOutputDirectory(): vscode.Uri {
        return this.outputDir;
    }

	setWorkingDir(directory: vscode.Uri) {
		this.workingDir = directory;
        this.specDir = vscode.Uri.file(path.join(directory.path,'spec'));
        this.inputDir = vscode.Uri.file(path.join(directory.path,'input'));
        this.outputDir = vscode.Uri.file(path.join(directory.path,'output'));
	}

    setOutDirectory(outfolder: string) {
        this.outputDir = vscode.Uri.file(outfolder);
    }

    setInputDirectory(inputDir: string) {
        this.inputDir = vscode.Uri.file(inputDir);
    }
}