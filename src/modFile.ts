import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { TextFile, nlpFileType } from './textFile';

export let modFile: ModFile;
export class ModFile extends TextFile {

	constructor() {
		super();
	}

    addFile(uri: vscode.Uri) {
        if (visualText.mod.getUri() && fs.existsSync(visualText.mod.getUri().fsPath)) {
            visualText.mod.appendFile(uri);
            vscode.window.showTextDocument(visualText.mod.getUri());
        } else {
            vscode.window.showWarningMessage('No mod file selected');
        }
    }

    parse(filePath: vscode.Uri) {
        this.setFile(filePath);
    }

    appendFile(filePath: vscode.Uri) {
        var fileContent: string = fs.readFileSync(filePath.fsPath,'utf8');
        this.appendText(this.headerLine(filePath));
        this.appendText(fileContent);
        this.saveFile();
    }

    headerLine(filePath: vscode.Uri) {
        var header = '';
        var name = path.basename(filePath.fsPath);
        header = '\n<modfile: ' + name + '>\n';
        return header;
    }
}