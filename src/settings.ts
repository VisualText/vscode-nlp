import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TextFile } from './textFile';

export namespace settings {

    function filePath(filepath: string, filename: string): string {
        return path.join(filepath,'.vscode',filename+'.json');
    }

    function parseFile(dirPath: vscode.Uri, filename: string, label: string): any {
        const filepath = filePath(dirPath.path,filename);
        const textFile = new TextFile(filepath,false);
        if (textFile.getText().length) {
            return JSON.parse(textFile.getText());
        }
        return '';
    }

    export function jsonParse(dirPath: vscode.Uri, filename: string, label: string): any {
        return parseFile(dirPath,filename,label);
    }

    export function setCurrentFile(dirPath: vscode.Uri,  filename: string, label: string, currentTextFile: vscode.Uri, ): any {
        const json = parseFile(dirPath,filename,label);
        if (json) {
            const parse = json.visualText[0];
            if (parse.currentTextFile) {
                parse.currentTextFile = currentTextFile.path;
                const filepath = filePath(dirPath.path,filename);
                fs.writeFileSync(filepath,JSON.stringify(json,null,4),{flag:'w+'});
            }              
        }
    }

    export function setCurrentAnalyzer(dirPath: vscode.Uri,  filename: string, label: string, currentAnalyzer: vscode.Uri, ): any {
        const json = parseFile(dirPath,filename,label);
        if (json) {
            const parse = json.visualText[0];
            if (parse.currentAnalyzer) {
                parse.currentAnalyzer = currentAnalyzer.path;
                const filepath = filePath(dirPath.path,filename);
                fs.writeFileSync(filepath,JSON.stringify(json,null,4),{flag:'w+'});
            }              
        }
    }
}