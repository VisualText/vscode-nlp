import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as rimraf from 'rimraf';
import { visualText } from './visualText';
import { anaSubDir } from './analyzer';

export enum getFileTypes { UNKNOWN, FILES, FILES_DIRS, DIRS }

export namespace dirfuncs {

    export function copyDirectory(fromPath: string, toPath: string): boolean {
        const copydir = require('copy-dir');
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
        if (!fs.existsSync(fromPath)) {
            vscode.window.showInformationMessage('copyFile from does not exist: ' + fromPath);
            return false;
        }
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
        const parentDir = path.dirname(dirPath.fsPath);
        if (path.basename(parentDir).localeCompare(folderToFind) == 0) {
            return vscode.Uri.file(parentDir);
        }

        if (parentDir && parentDir?.length > 1) {
            const found = findFolder(vscode.Uri.file(parentDir), folderToFind);
            if (found.fsPath.length > 2)
                return found;
        }

        const dirs = getDirectories(dirPath);
        for (const dir of dirs) {
            if (path.basename(dir.fsPath).localeCompare(folderToFind) == 0) {
                return dir;
            }
        }

        return vscode.Uri.file('');
    }

    export function analyzerFolderCount(dirPath: vscode.Uri): number {
        let specCount = 0;
        const dirs = getDirectories(dirPath);
        for (const dir of dirs) {
            const subDirs = getDirectories(dir);
            for (const subDir of subDirs) {
                if (path.basename(subDir.fsPath).localeCompare(visualText.ANALYZER_SEQUENCE_FOLDER) == 0) {
                    const specfile = path.join(subDir.fsPath,visualText.ANALYZER_SEQUENCE_FILE);
                    if (fs.existsSync(specfile))
                        specCount++;
                }
            }
        }

        return specCount;
    }
    
    export function getDirectories(folder: vscode.Uri): vscode.Uri[] {
        const dirUris: vscode.Uri[] = new Array();
        if (dirfuncs.isDir(folder.fsPath)) {
            const filenames = fs.readdirSync(folder.fsPath);
            for (const filename of filenames) {
                if (!filename.startsWith('.')) {
                    const filepath = path.join(folder.fsPath,filename);
                    try {
                        const stats = fs.statSync(filepath);
                        if (stats.isDirectory())
                            dirUris.push(vscode.Uri.file(filepath));
                    } catch (err: any) {
                        console.error(err)
                    }
                }
            }            
        }
        return dirUris;
    }

    export function getDirectoryTypes(folder: vscode.Uri): {uri: vscode.Uri, type: vscode.FileType}[] {
        const dirsAndTypes = Array();
        const filenames = fs.readdirSync(folder.fsPath);
        for (const filename of filenames) {
            if (!filename.startsWith('.')) {
                const filepath = path.join(folder.fsPath,filename);
                try {
                    const stats = fs.statSync(filepath);
                    const type = stats.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File;
                    dirsAndTypes.push({uri: vscode.Uri.file(filepath), type: type, hasLogs: false});
                } catch (err: any) {
                    console.error(err)
                }
            }
        }
        return dirsAndTypes;
    }

    export function fileCount(dir: vscode.Uri): number {
        const files = fs.readdirSync(dir.fsPath, { withFileTypes: true });
        let count = 0;
        for (const file of files) {
            if (file.isFile()) {
                count++;
            }
            else if (file.isDirectory() && !dirfuncs.directoryIsLog(file.name)) {
                count += fileCount(vscode.Uri.file(path.join(dir.fsPath, file.name)));
            }
        }
        return count;
    }

    export function getFiles(folder: vscode.Uri, filter: string[]=[], getType: getFileTypes=getFileTypes.FILES, recurse: boolean=false): vscode.Uri[] {
        const fileUris: vscode.Uri[] = new Array();
        const filenames = fs.readdirSync(folder.fsPath);
        for (const filename of filenames) {
            if (!filename.startsWith('.')) {
                const filePath = path.join(folder.fsPath,filename);
                const ext = path.extname(filePath);
                const stats = fs.statSync(filePath);
                if ((getType == getFileTypes.DIRS && stats.isDirectory()) || filter.length == 0 || filter.includes(ext))
                    fileUris.push(vscode.Uri.file(filePath));
                if (stats.isDirectory() && recurse) {
                    const children = getFiles(vscode.Uri.file(filename),filter,getType,recurse);
                    for (const child of children) {
                        fileUris.push(child);
                    }
                }
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
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir);
            } catch (err: any) {
                vscode.window.showInformationMessage('Error creating directory ' + dir + ': ' + err.message);
                return false;
            }
        }
        try {
            fs.writeFileSync(filePath,content,'utf-8');
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
        for (const filename of filenames) {
            if (!filename.startsWith('.')) {
                const filePath = path.join(folder.fsPath,filename);
                const ext = path.extname(filePath);
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

    export function analyzerHasLogFiles(dir: vscode.Uri): boolean {
        const outputDir = visualText.analyzer.constructDir(dir,anaSubDir.OUTPUT);
        if (fs.existsSync(outputDir.fsPath) && dirfuncs.directoryHasFiles(outputDir))
            return true;
        const logsDir = visualText.analyzer.constructDir(dir,anaSubDir.LOGS);
        if (fs.existsSync(logsDir.fsPath) && dirfuncs.directoryHasFiles(logsDir))
            return true;
        const inputDir = visualText.analyzer.constructDir(dir,anaSubDir.INPUT);
        if (fs.existsSync(inputDir.fsPath)) {
            return dirfuncs.hasLogDirs(inputDir,false);
        }
		return false;
	}

    export function directoryHasFiles(dir: vscode.Uri) {
        const filenames = fs.readdirSync(dir.fsPath);
        return filenames.length ? true : false;
    }

    export function hasLogDirs(dir: vscode.Uri, first: boolean): boolean {
        if (dirfuncs.isDir(dir.fsPath)) {
            const entries = dirfuncs.getDirectoryTypes(dir);

            for (const entry of entries) {
                if (entry.type == vscode.FileType.Directory) {
                    if (visualText.isAnalyzerDirectory(entry.uri) && dirfuncs.analyzerHasLogFiles(entry.uri))
                        return true;
                    if (dirfuncs.directoryIsLog(entry.uri.fsPath))
                        return true;
                    else {
                        const has = dirfuncs.hasLogDirs(entry.uri,false);
                        if (has)
                            return true;
                    }
                }
            }                  
        } else {
            return dirfuncs.fileHasLog(dir.fsPath);
        }

		return false;
	}

    export function hasFile(dir: vscode.Uri, filename: string): boolean {
        if (dirfuncs.isDir(dir.fsPath)) {
            const files = fs.readdirSync(dir.fsPath, { withFileTypes: true });
            for (const file of files) {
                if (file.name == filename)
                    return true;
            }                  
        }

		return false;
	}

    export function hasFiles(dir: vscode.Uri): boolean {
        if (dirfuncs.isDir(dir.fsPath)) {
            const files = fs.readdirSync(dir.fsPath, { withFileTypes: true });
            if (files && files.length > 0)
                return true;                 
        }

		return false;
	}

    export function hasDirs(dir: vscode.Uri): boolean {
        if (dirfuncs.isDir(dir.fsPath)) {
            const entries = dirfuncs.getDirectoryTypes(dir);

            for (const entry of entries) {
                if (entry.type == vscode.FileType.Directory && !visualText.isAnalyzerDirectory(entry.uri)) {
                    return true;
                }
            }                  
        }
		return false;
	}

    export function parentHasOtherDirs(uri: vscode.Uri): boolean {
        const parent = path.dirname(uri.fsPath);
        const basename = path.basename(uri.fsPath);
        if (parent.length) {
            const entries = dirfuncs.getDirectoryTypes(vscode.Uri.file(parent));

            for (const entry of entries) {
                if (entry.type == vscode.FileType.Directory
                    && path.basename(entry.uri.fsPath) != basename
                    && !visualText.isAnalyzerDirectory(entry.uri)
                    && !entry.uri.fsPath.endsWith(visualText.TEST_SUFFIX)
                    && !dirfuncs.directoryIsLog(entry.uri.fsPath)) {
                    return true;
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

    export function needToCopy(fileFrom: string, fileTo: string): boolean {
        if (!fs.existsSync(fileTo))
            return true;
        try {
            const file1Content = fs.readFileSync(fileFrom, 'utf-8');
            const file2Content = fs.readFileSync(fileTo, 'utf-8');
            if (file1Content === file2Content)
                return false;
            return true;
        } catch (error) {
            console.error('Error reading files:', error);
            return false;
        }
    }
}
