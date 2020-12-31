"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dirfuncs = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
var dirfuncs;
(function (dirfuncs) {
    function copyDirectory(fromPath, toPath) {
        var copydir = require('copy-dir');
        if (!fs.existsSync(toPath)) {
            if (!makeDir(toPath))
                return false;
        }
        copydir(fromPath, toPath, function (err) {
            if (err)
                return false;
        });
        return true;
    }
    dirfuncs.copyDirectory = copyDirectory;
    function sameParentDirectory(dir1, dir2) {
        return path.dirname(dir1.path).localeCompare(path.dirname(dir2.path)) == 0 ? true : false;
    }
    dirfuncs.sameParentDirectory = sameParentDirectory;
    function isDir(path) {
        try {
            const stats = fs.statSync(path);
            if (stats.isDirectory())
                return true;
        }
        catch (err) {
            vscode.window.showInformationMessage('Directory test failed on ' + path + ': ' + err.message);
        }
        return false;
    }
    dirfuncs.isDir = isDir;
    function renameFile(oldPath, newPath) {
        try {
            fs.renameSync(oldPath, newPath);
            return true;
        }
        catch (err) {
            vscode.window.showInformationMessage('Could not rename file ' + oldPath + ' to ' + newPath + ' - ' + err.message);
        }
        return false;
    }
    dirfuncs.renameFile = renameFile;
    function findFolder(dirPath, folderToFind) {
        var parentDir = path.dirname(dirPath.path);
        if (path.basename(parentDir).localeCompare(folderToFind) == 0) {
            return vscode.Uri.file(parentDir);
        }
        if (parentDir && (parentDir === null || parentDir === void 0 ? void 0 : parentDir.length) > 1) {
            var found = findFolder(vscode.Uri.file(parentDir), folderToFind);
            if (found.path.length > 2)
                return found;
        }
        var dirs = getDirectories(dirPath);
        for (let dir of dirs) {
            if (path.basename(dir.path).localeCompare(folderToFind) == 0) {
                return dir;
            }
        }
        return vscode.Uri.file('');
    }
    dirfuncs.findFolder = findFolder;
    function getDirectories(folder) {
        const dirUris = new Array();
        const filenames = fs.readdirSync(folder.path);
        for (let filename of filenames) {
            if (!filename.startsWith('.')) {
                var filepath = path.join(folder.path, filename);
                try {
                    const stats = fs.statSync(filepath);
                    if (stats.isDirectory())
                        dirUris.push(vscode.Uri.file(filepath));
                }
                catch (err) {
                    console.error(err);
                }
            }
        }
        return dirUris;
    }
    dirfuncs.getDirectories = getDirectories;
    function getDirectoryTypes(folder) {
        var dirsAndTypes = Array();
        const filenames = fs.readdirSync(folder.path);
        for (let filename of filenames) {
            if (!filename.startsWith('.')) {
                var filepath = path.join(folder.path, filename);
                try {
                    const stats = fs.statSync(filepath);
                    var type = stats.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File;
                    dirsAndTypes.push({ uri: vscode.Uri.file(filepath), type: type });
                }
                catch (err) {
                    console.error(err);
                }
            }
        }
        return dirsAndTypes;
    }
    dirfuncs.getDirectoryTypes = getDirectoryTypes;
    function getFiles(folder, filter = [], skipDirectories = false) {
        const fileUris = new Array();
        const filenames = fs.readdirSync(folder.path);
        for (let filename of filenames) {
            if (!filename.startsWith('.')) {
                var filePath = path.join(folder.path, filename);
                var ext = path.extname(filePath);
                const stats = fs.statSync(filePath);
                if (!(skipDirectories && stats.isDirectory()) && (filter.length == 0 || filter.includes(ext)))
                    fileUris.push(vscode.Uri.file(filePath));
            }
        }
        return fileUris;
    }
    dirfuncs.getFiles = getFiles;
    function makeDir(dirPath) {
        try {
            fs.mkdirSync(dirPath);
            return true;
        }
        catch (err) {
            vscode.window.showInformationMessage('Error creating folder ' + dirPath + ': ' + err.message);
        }
        return false;
    }
    dirfuncs.makeDir = makeDir;
    function writeFile(filePath, content) {
        try {
            fs.writeFileSync(filePath, content, { flag: 'w' });
            return true;
        }
        catch (err) {
            vscode.window.showInformationMessage('Error writing file ' + filePath + ': ' + err.message);
        }
        return false;
    }
    dirfuncs.writeFile = writeFile;
    function getDirPath(filePath) {
        try {
            const stats = fs.statSync(filePath);
            if (stats.isDirectory())
                return filePath;
            else if (stats.isFile()) {
                return path.dirname(filePath);
            }
        }
        catch (err) {
            vscode.window.showInformationMessage('Error reading file stats on ' + filePath + ': ' + err.message);
        }
        return '';
    }
    dirfuncs.getDirPath = getDirPath;
    function delFile(filePath) {
        try {
            fs.unlinkSync(filePath);
            return true;
        }
        catch (err) {
            vscode.window.showInformationMessage('Error deleting file ' + filePath + ': ' + err.message);
        }
        return false;
    }
    dirfuncs.delFile = delFile;
    function delDir(dirPath) {
        try {
            fs.rmdirSync(dirPath);
            return true;
        }
        catch (err) {
            vscode.window.showInformationMessage('Error deleting folder ' + dirPath + ': ' + err.message);
        }
        return false;
    }
    dirfuncs.delDir = delDir;
    function deleteFiles(folder, filter = []) {
        const fileUris = new Array();
        const filenames = fs.readdirSync(folder.path);
        for (let filename of filenames) {
            if (!filename.startsWith('.')) {
                var filePath = path.join(folder.path, filename);
                var ext = path.extname(filePath);
                const stats = fs.statSync(filePath);
                if (!stats.isDirectory() && (filter.length == 0 || filter.includes(ext)))
                    delFile(filePath);
            }
        }
        return fileUris;
    }
    dirfuncs.deleteFiles = deleteFiles;
    function emptyDir(dirPath) {
        try {
            fs.rmdirSync(dirPath);
            fs.mkdirSync(dirPath);
            return true;
        }
        catch (err) {
            vscode.window.showInformationMessage('Error emptying folder ' + dirPath + ': ' + err.message);
        }
        return false;
    }
    dirfuncs.emptyDir = emptyDir;
})(dirfuncs = exports.dirfuncs || (exports.dirfuncs = {}));
//# sourceMappingURL=dirfuncs.js.map