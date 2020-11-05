import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export namespace dirfuncs {
    
    export function getDirectories(folder: vscode.Uri): vscode.Uri[] {
        const dirUris: vscode.Uri[] = new Array();
        const filenames = fs.readdirSync(folder.path);
        for (let filename of filenames) {
            if (!filename.startsWith('.')) {
                var filepath = path.join(folder.path,filename);
                try {
                    const stats = fs.statSync(filepath);
                    if (stats.isDirectory())
                    dirUris.push(vscode.Uri.file(filepath));
                } catch (err) {
                    console.error(err)
                }
            }
        }
        return dirUris;
    }

    export function getFiles(folder: vscode.Uri): vscode.Uri[] {
        const fileUris: vscode.Uri[] = new Array();
        const filenames = fs.readdirSync(folder.path);
        for (let filename of filenames) {
            if (!filename.startsWith('.')) {
                var filepath = path.join(folder.path,filename);
                fileUris.push(vscode.Uri.file(filepath));
            }
        }
        return fileUris;
    }

}