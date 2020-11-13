import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export namespace dirfuncs {

    export function copyDirectory(fromPath: string, toPath: string): boolean {
        var copydir = require('copy-dir');
        if (!fs.existsSync(toPath)) {
            if (!makeDir(toPath))
                return false;
        }
 
        copydir(fromPath,toPath, function(err) {
            if (err)
                return false;
        });

        return true;
    }

    export function isDir(path: string): boolean {
        try {
            const stats = fs.statSync(path);
            if (stats.isDirectory())
                return true;
        } catch (err) {
            vscode.window.showInformationMessage('Directory test failed on ' + path + ': ' + err.message);
        }
        return false;
    }

    export function renameFile(oldPath: string, newPath: string): boolean {
        try {
            fs.renameSync(oldPath,newPath);
            return true;
        } catch (err) {
            vscode.window.showInformationMessage('Could not rename file ' + oldPath + ' to ' + newPath + ' - ' + err.message);
        }
        return false;
    }

    export function findFolder(dirPath: vscode.Uri, folderToFind: string): vscode.Uri {
        var parentDir = path.dirname(dirPath.path);
        if (path.basename(parentDir).localeCompare(folderToFind) == 0) {
            return vscode.Uri.file(parentDir);
        }

        if (parentDir && parentDir?.length > 1) {
            var found = findFolder(vscode.Uri.file(parentDir), folderToFind);
            if (found.path.length > 2)
                return found;
        }

        var dirs = getDirectories(dirPath);
        for (let dir of dirs) {
            if (dir.path.localeCompare(folderToFind) == 0) {
                return dir;
            }
        }

        return vscode.Uri.file('');
    }
    
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

    export function getDirectoryTypes(folder: vscode.Uri): {uri: vscode.Uri, type: vscode.FileType}[] {
        var dirsAndTypes = Array();
        const filenames = fs.readdirSync(folder.path);
        for (let filename of filenames) {
            if (!filename.startsWith('.')) {
                var filepath = path.join(folder.path,filename);
                try {
                    const stats = fs.statSync(filepath);
                    var type = stats.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File;
                    dirsAndTypes.push({uri: vscode.Uri.file(filepath), type: type});
                } catch (err) {
                    console.error(err)
                }
            }
        }
        return dirsAndTypes;
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

    export function makeDir(dirPath: string): boolean {
        try {
            fs.mkdirSync(dirPath);
            return true;
        } catch (err) {
            vscode.window.showInformationMessage('Error creating folder ' + dirPath + ': ' + err.message);
        } 
        return false;
    }

    export function writeFile(filePath: string, content: string): boolean {
        try {
            fs.writeFileSync(filePath,content,{flag:'w'});
            return true;
        } catch (err) {
            vscode.window.showInformationMessage('Error writing file ' + filePath + ': ' + err.message);
        }
        return false;    
    }

    export function getDirPath(filePath: string): string {
        try {
            const stats = fs.statSync(filePath);
            if (stats.isDirectory())
                return filePath;
            else if (stats.isFile()) {
                return path.dirname(filePath);
            }
        } catch (err) {
            vscode.window.showInformationMessage('Error reading file stats on ' + filePath + ': ' + err.message);
        }
        return '';
    }
    
    export function delFile(filePath: string): boolean {
        try {
            fs.unlinkSync(filePath);
            return true;
        } catch (err) {
            vscode.window.showInformationMessage('Error deleting file ' + filePath + ': ' + err.message);
        } 
        return false;
    }

    export function delDir(dirPath: string): boolean {
        try {
            fs.rmdirSync(dirPath,{recursive: true});
            return true;
        } catch (err) {
            vscode.window.showInformationMessage('Error deleting folder ' + dirPath + ': ' + err.message);
        } 
        return false;
    }

    export function emptyDir(dirPath: string): boolean {
        try {
            fs.rmdirSync(dirPath,{recursive: true});
            fs.mkdirSync(dirPath);
            return true;
        } catch (err) {
            vscode.window.showInformationMessage('Error emptying folder ' + dirPath + ': ' + err.message);
        } 
        return false;
    }
}