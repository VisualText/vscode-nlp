import * as vscode from 'vscode';
import * as path from 'path';
import { TextFile } from './textFile';

export namespace settings {

    export function parse(dirPath: vscode.Uri, filename: string, label: string): any {
        const filepath = path.join(dirPath.path,'.vscode',filename+'.json');
        const textFile = new TextFile(filepath,false);
        if (textFile.getText().length) {
            return JSON.parse(textFile.getText());
        }
        return '';
    }

    export function setLevelOne(workspace: vscode.Uri,  filename: string, key: string, value: string): any {
        return false;
    }

}