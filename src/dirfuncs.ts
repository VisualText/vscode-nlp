import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as rimraf from 'rimraf';
import { visualText } from './visualText';

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

    export function copyFile(fromPath: string, toPath: string): boolean {
        try {
            const statsFrom = fs.statSync(fromPath);
            if (statsFrom.isFile()) {
                fs.copyFileSync(fromPath,toPath);
                return true;
            }
        } catch (err: any) {
            vscode.window.showInformationMessage('Could not copy file ' + fromPath + ' to ' + toPath + ' - ' + err.message);
        }
        return false;
    }

    export function changeMod(filePath: string, mod: number): boolean {
        try {
            fs.chmodSync(filePath,mod);
            return true;
        } catch (err: any) {
            vscode.window.showInformationMessage('Could not chmod on ' + filePath + ' - ' + err.message);
        }
        return false;
    }

    export function sameParentDirectory(dir1: vscode.Uri, dir2: vscode.Uri): boolean {
        return path.dirname(dir1.fsPath).localeCompare(path.dirname(dir2.fsPath)) == 0 ? true : false;
    }

    export function isDir(path: string): boolean {
        if (path.length <= 1)
            return false;
        try {
            const stats = fs.statSync(path);
            if (stats.isDirectory())
                return true;
        } catch (err: any) {
            //visualText.debugMessage(err.message);
        }
        return false;
    }

    export function rename(oldPath: string, newPath: string): boolean {
        try {
            fs.renameSync(oldPath,newPath);
            return true;
        } catch (err: any) {
            vscode.window.showInformationMessage('Could not rename file ' + oldPath + ' to ' + newPath + ' - ' + err.message);
        }
        return false;
    }

    export function findFolder(dirPath: vscode.Uri, folderToFind: string): vscode.Uri {
        var parentDir = path.dirname(dirPath.fsPath);
        if (path.basename(parentDir).localeCompare(folderToFind) == 0) {
            return vscode.Uri.file(parentDir);
        }

        if (parentDir && parentDir?.length > 1) {
            var found = findFolder(vscode.Uri.file(parentDir), folderToFind);
            if (found.fsPath.length > 2)
                return found;
        }

        var dirs = getDirectories(dirPath);
        for (let dir of dirs) {
            if (path.basename(dir.fsPath).localeCompare(folderToFind) == 0) {
                return dir;
            }
        }

        return vscode.Uri.file('');
    }

    export function analyzerFolderCount(dirPath: vscode.Uri): number {
        var specCount = 0;
        var dirs = getDirectories(dirPath);
        for (let dir of dirs) {
            var subDirs = getDirectories(dir);
            for (let subDir of subDirs) {
                if (path.basename(subDir.fsPath).localeCompare('spec') == 0) {
                    let specfile = path.join(subDir.fsPath,'analyzer.seq');
                    if (fs.existsSync(specfile))
                        specCount++;
                }
            }
        }

        return specCount;
    }
    
    export function getDirectories(folder: vscode.Uri): vscode.Uri[] {
        const dirUris: vscode.Uri[] = new Array();
        const filenames = fs.readdirSync(folder.fsPath);
        for (let filename of filenames) {
            if (!filename.startsWith('.')) {
                var filepath = path.join(folder.fsPath,filename);
                try {
                    const stats = fs.statSync(filepath);
                    if (stats.isDirectory())
                        dirUris.push(vscode.Uri.file(filepath));
                } catch (err: any) {
                    console.error(err)
                }
            }
        }
        return dirUris;
    }

    export function getDirectoryTypes(folder: vscode.Uri): {uri: vscode.Uri, type: vscode.FileType}[] {
        var dirsAndTypes = Array();
        const filenames = fs.readdirSync(folder.fsPath);
        for (let filename of filenames) {
            if (!filename.startsWith('.')) {
                var filepath = path.join(folder.fsPath,filename);
                try {
                    const stats = fs.statSync(filepath);
                    var type = stats.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File;
                    dirsAndTypes.push({uri: vscode.Uri.file(filepath), type: type, hasLogs: false});
                } catch (err: any) {
                    console.error(err)
                }
            }
        }
        return dirsAndTypes;
    }

    export function getFiles(folder: vscode.Uri, filter: string[]=[], skipDirectories: boolean=false): vscode.Uri[] {
        const fileUris: vscode.Uri[] = new Array();
        const filenames = fs.readdirSync(folder.fsPath);
        for (let filename of filenames) {
            if (!filename.startsWith('.')) {
                var filePath = path.join(folder.fsPath,filename);
                var ext = path.extname(filePath);
                const stats = fs.statSync(filePath);
                if (!(skipDirectories && stats.isDirectory()) && (filter.length == 0 || filter.includes(ext)))
                    fileUris.push(vscode.Uri.file(filePath));
            }
        }
        return fileUris;
    }

    export function makeDir(dirPath: string): boolean {
        try {
            fs.mkdirSync(dirPath);
            return true;
        } catch (err: any) {
            vscode.window.showInformationMessage('Error creating folder ' + dirPath + ': ' + err.message);
        } 
        return false;
    }

    export function writeFile(filePath: string, content: string): boolean {
        try {
            fs.writeFileSync(filePath,content,{flag:'w'});
            return true;
        } catch (err: any) {
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
        } catch (err: any) {
            vscode.window.showInformationMessage('Error reading file stats on ' + filePath + ': ' + err.message);
        }
        return '';
    }
    
    export function delFile(filePath: string): boolean {
        try {
            fs.unlinkSync(filePath);
            return true;
        } catch (err: any) {
            vscode.window.showInformationMessage('Error deleting file ' + filePath + ': ' + err.message);
        } 
        return false;
    }

    export function delDir(dirPath: string): boolean {
        if (!fs.existsSync(dirPath) || dirPath.length <= 2)
            return false;
        try {
            rimraf.sync(dirPath);
            return true;
        } catch (err: any) {
            vscode.window.showInformationMessage('Error deleting folder ' + dirPath + ': ' + err.message);
        } 
        return false;
    }
    
    export function deleteFiles(folder: vscode.Uri, filter: string[]=[]): vscode.Uri[] {
        const fileUris: vscode.Uri[] = new Array();
        const filenames = fs.readdirSync(folder.fsPath);
        for (let filename of filenames) {
            if (!filename.startsWith('.')) {
                var filePath = path.join(folder.fsPath,filename);
                var ext = path.extname(filePath);
                const stats = fs.statSync(filePath);
                if (!stats.isDirectory() && (filter.length == 0 || filter.includes(ext)))
                    delFile(filePath);
            }
        }
        return fileUris;
    }

    export function emptyDir(dirPath: string): boolean {
        if (!fs.existsSync(dirPath) || dirPath.length <= 2)
            return false;
        try {
            rimraf.sync(dirPath);
            fs.mkdirSync(dirPath);
            return true;
        } catch (err: any) {
            vscode.window.showInformationMessage('Error emptying folder ' + dirPath + ': ' + err.message);
        } 
        return false;
    }

    export function hasLogDirs(dir: vscode.Uri, first: boolean): boolean {
		var inputDir = first ? vscode.Uri.file(path.join(dir.fsPath,'input')) : dir;
        if (fs.existsSync(inputDir.fsPath)) {
            var entries = dirfuncs.getDirectoryTypes(inputDir);

            for (let entry of entries) {
                if (entry.type == vscode.FileType.Directory) {
                    if (dirfuncs.directoryIsLog(entry.uri.fsPath))
                        return true;
                    else {
                        var has = dirfuncs.hasLogDirs(entry.uri,false);
                        if (has) return true;
                    }
                }
            }            
        }
		return false;
	}

    export function directoryIsLog(dirPath: string): boolean {
		return dirPath.endsWith(visualText.LOG_SUFFIX);
	}

    export function fileHasLog(filePath: string): boolean {
        return dirfuncs.isDir(filePath + visualText.LOG_SUFFIX);
    }
}