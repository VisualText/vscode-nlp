"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dirfuncs = exports.getFileTypes = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const path = tslib_1.__importStar(require("path"));
const fs = tslib_1.__importStar(require("fs"));
const del_1 = require("del");
const visualText_1 = require("./visualText");
const analyzer_1 = require("./analyzer");
var getFileTypes;
(function (getFileTypes) {
    getFileTypes[getFileTypes["UNKNOWN"] = 0] = "UNKNOWN";
    getFileTypes[getFileTypes["FILES"] = 1] = "FILES";
    getFileTypes[getFileTypes["FILES_DIRS"] = 2] = "FILES_DIRS";
    getFileTypes[getFileTypes["DIRS"] = 3] = "DIRS";
})(getFileTypes || (exports.getFileTypes = getFileTypes = {}));
var dirfuncs;
(function (dirfuncs) {
    function copyDirectory(fromPath, toPath) {
        const copydir = require('copy-dir');
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
    function copyFile(fromPath, toPath) {
        if (!fs.existsSync(fromPath)) {
            vscode.window.showInformationMessage('copyFile from does not exist: ' + fromPath);
            return false;
        }
        try {
            const statsFrom = fs.statSync(fromPath);
            if (statsFrom.isFile()) {
                fs.copyFileSync(fromPath, toPath);
                return true;
            }
        }
        catch (err) {
            vscode.window.showInformationMessage('Could not copy file ' + fromPath + ' to ' + toPath + ' - ' + err.message);
        }
        return false;
    }
    dirfuncs.copyFile = copyFile;
    function changeMod(filePath, mod) {
        try {
            fs.chmodSync(filePath, mod);
            return true;
        }
        catch (err) {
            vscode.window.showInformationMessage('Could not chmod on ' + filePath + ' - ' + err.message);
        }
        return false;
    }
    dirfuncs.changeMod = changeMod;
    function sameParentDirectory(dir1, dir2) {
        return path.dirname(dir1.fsPath).localeCompare(path.dirname(dir2.fsPath)) == 0 ? true : false;
    }
    dirfuncs.sameParentDirectory = sameParentDirectory;
    function isDir(path) {
        if (path.length <= 1)
            return false;
        try {
            const stats = fs.statSync(path);
            if (stats.isDirectory())
                return true;
        }
        catch (err) {
            //visualText.debugMessage(err.message);
        }
        return false;
    }
    dirfuncs.isDir = isDir;
    function rename(oldPath, newPath) {
        try {
            fs.renameSync(oldPath, newPath);
            return true;
        }
        catch (err) {
            vscode.window.showInformationMessage('Could not rename file ' + oldPath + ' to ' + newPath + ' - ' + err.message);
        }
        return false;
    }
    dirfuncs.rename = rename;
    function findFolder(dirPath, folderToFind) {
        const parentDir = path.dirname(dirPath.fsPath);
        if (path.basename(parentDir).localeCompare(folderToFind) == 0) {
            return vscode.Uri.file(parentDir);
        }
        if (parentDir && (parentDir === null || parentDir === void 0 ? void 0 : parentDir.length) > 1) {
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
    dirfuncs.findFolder = findFolder;
    function analyzerFolderCount(dirPath) {
        let specCount = 0;
        const dirs = getDirectories(dirPath);
        for (const dir of dirs) {
            const subDirs = getDirectories(dir);
            for (const subDir of subDirs) {
                if (path.basename(subDir.fsPath).localeCompare(visualText_1.visualText.ANALYZER_SEQUENCE_FOLDER) == 0) {
                    const specfile = path.join(subDir.fsPath, visualText_1.visualText.ANALYZER_SEQUENCE_FILE);
                    if (fs.existsSync(specfile))
                        specCount++;
                }
            }
        }
        return specCount;
    }
    dirfuncs.analyzerFolderCount = analyzerFolderCount;
    function getDirectories(folder) {
        const dirUris = new Array();
        if (dirfuncs.isDir(folder.fsPath)) {
            const filenames = fs.readdirSync(folder.fsPath);
            for (const filename of filenames) {
                if (!filename.startsWith('.')) {
                    const filepath = path.join(folder.fsPath, filename);
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
        }
        return dirUris;
    }
    dirfuncs.getDirectories = getDirectories;
    function getDirectoryTypes(folder) {
        const dirsAndTypes = Array();
        const filenames = fs.readdirSync(folder.fsPath);
        for (const filename of filenames) {
            if (!filename.startsWith('.')) {
                const filepath = path.join(folder.fsPath, filename);
                try {
                    const stats = fs.statSync(filepath);
                    const type = stats.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File;
                    dirsAndTypes.push({ uri: vscode.Uri.file(filepath), type: type, hasLogs: false });
                }
                catch (err) {
                    console.error(err);
                }
            }
        }
        return dirsAndTypes;
    }
    dirfuncs.getDirectoryTypes = getDirectoryTypes;
    function fileCount(dir) {
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
    dirfuncs.fileCount = fileCount;
    function getFiles(folder, filter = [], getType = getFileTypes.FILES, recurse = false) {
        const fileUris = new Array();
        const filenames = fs.readdirSync(folder.fsPath);
        for (const filename of filenames) {
            if (!filename.startsWith('.')) {
                const filePath = path.join(folder.fsPath, filename);
                const ext = path.extname(filePath);
                const stats = fs.statSync(filePath);
                if ((getType == getFileTypes.DIRS && stats.isDirectory()) || filter.length == 0 || filter.includes(ext))
                    fileUris.push(vscode.Uri.file(filePath));
                if (stats.isDirectory() && recurse) {
                    const children = getFiles(vscode.Uri.file(filename), filter, getType, recurse);
                    for (const child of children) {
                        fileUris.push(child);
                    }
                }
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
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir);
            }
            catch (err) {
                vscode.window.showInformationMessage('Error creating directory ' + dir + ': ' + err.message);
                return false;
            }
        }
        try {
            fs.writeFileSync(filePath, content, 'utf-8');
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
        if (!fs.existsSync(dirPath) || dirPath.length <= 2)
            return false;
        try {
            (0, del_1.deleteSync)(dirPath);
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
        const filenames = fs.readdirSync(folder.fsPath);
        for (const filename of filenames) {
            if (!filename.startsWith('.')) {
                const filePath = path.join(folder.fsPath, filename);
                const ext = path.extname(filePath);
                const stats = fs.statSync(filePath);
                if (!stats.isDirectory() && (filter.length == 0 || filter.includes(ext)))
                    delFile(filePath);
            }
        }
        return fileUris;
    }
    dirfuncs.deleteFiles = deleteFiles;
    function emptyDir(dirPath) {
        if (!fs.existsSync(dirPath) || dirPath.length <= 2)
            return false;
        try {
            (0, del_1.deleteSync)(dirPath);
            fs.mkdirSync(dirPath);
            return true;
        }
        catch (err) {
            vscode.window.showInformationMessage('Error emptying folder ' + dirPath + ': ' + err.message);
        }
        return false;
    }
    dirfuncs.emptyDir = emptyDir;
    function analyzerHasLogFiles(dir) {
        const outputDir = visualText_1.visualText.analyzer.constructDir(dir, analyzer_1.anaSubDir.OUTPUT);
        if (fs.existsSync(outputDir.fsPath) && dirfuncs.directoryHasFiles(outputDir))
            return true;
        const logsDir = visualText_1.visualText.analyzer.constructDir(dir, analyzer_1.anaSubDir.LOGS);
        if (fs.existsSync(logsDir.fsPath) && dirfuncs.directoryHasFiles(logsDir))
            return true;
        const inputDir = visualText_1.visualText.analyzer.constructDir(dir, analyzer_1.anaSubDir.INPUT);
        if (fs.existsSync(inputDir.fsPath)) {
            return dirfuncs.hasLogDirs(inputDir, false);
        }
        return false;
    }
    dirfuncs.analyzerHasLogFiles = analyzerHasLogFiles;
    function directoryHasFiles(dir) {
        const filenames = fs.readdirSync(dir.fsPath);
        return filenames.length ? true : false;
    }
    dirfuncs.directoryHasFiles = directoryHasFiles;
    function hasLogDirs(dir, first) {
        if (dirfuncs.isDir(dir.fsPath)) {
            const entries = dirfuncs.getDirectoryTypes(dir);
            for (const entry of entries) {
                if (entry.type == vscode.FileType.Directory) {
                    if (visualText_1.visualText.isAnalyzerDirectory(entry.uri) && dirfuncs.analyzerHasLogFiles(entry.uri))
                        return true;
                    if (dirfuncs.directoryIsLog(entry.uri.fsPath))
                        return true;
                    else {
                        const has = dirfuncs.hasLogDirs(entry.uri, false);
                        if (has)
                            return true;
                    }
                }
            }
        }
        else {
            return dirfuncs.fileHasLog(dir.fsPath);
        }
        return false;
    }
    dirfuncs.hasLogDirs = hasLogDirs;
    function hasFile(dir, filename) {
        if (dirfuncs.isDir(dir.fsPath)) {
            const files = fs.readdirSync(dir.fsPath, { withFileTypes: true });
            for (const file of files) {
                if (file.name == filename)
                    return true;
            }
        }
        return false;
    }
    dirfuncs.hasFile = hasFile;
    function hasFiles(dir) {
        if (dirfuncs.isDir(dir.fsPath)) {
            const files = fs.readdirSync(dir.fsPath, { withFileTypes: true });
            if (files && files.length > 0)
                return true;
        }
        return false;
    }
    dirfuncs.hasFiles = hasFiles;
    function hasDirs(dir) {
        if (dirfuncs.isDir(dir.fsPath)) {
            const entries = dirfuncs.getDirectoryTypes(dir);
            for (const entry of entries) {
                if (entry.type == vscode.FileType.Directory && !visualText_1.visualText.isAnalyzerDirectory(entry.uri)) {
                    return true;
                }
            }
        }
        return false;
    }
    dirfuncs.hasDirs = hasDirs;
    function parentHasOtherDirs(uri) {
        const parent = path.dirname(uri.fsPath);
        const basename = path.basename(uri.fsPath);
        if (parent.length) {
            const entries = dirfuncs.getDirectoryTypes(vscode.Uri.file(parent));
            for (const entry of entries) {
                if (entry.type == vscode.FileType.Directory
                    && path.basename(entry.uri.fsPath) != basename
                    && !visualText_1.visualText.isAnalyzerDirectory(entry.uri)
                    && !entry.uri.fsPath.endsWith(visualText_1.visualText.TEST_SUFFIX)
                    && !dirfuncs.directoryIsLog(entry.uri.fsPath)) {
                    return true;
                }
            }
        }
        return false;
    }
    dirfuncs.parentHasOtherDirs = parentHasOtherDirs;
    function directoryIsLog(dirPath) {
        return dirPath.endsWith(visualText_1.visualText.LOG_SUFFIX);
    }
    dirfuncs.directoryIsLog = directoryIsLog;
    function fileHasLog(filePath) {
        return dirfuncs.isDir(filePath + visualText_1.visualText.LOG_SUFFIX);
    }
    dirfuncs.fileHasLog = fileHasLog;
    function needToCopy(fileFrom, fileTo) {
        if (!fs.existsSync(fileTo))
            return true;
        try {
            const file1Content = fs.readFileSync(fileFrom, 'utf-8');
            const file2Content = fs.readFileSync(fileTo, 'utf-8');
            if (file1Content === file2Content)
                return false;
            return true;
        }
        catch (error) {
            console.error('Error reading files:', error);
            return false;
        }
    }
    dirfuncs.needToCopy = needToCopy;
})(dirfuncs || (exports.dirfuncs = dirfuncs = {}));
//# sourceMappingURL=dirfuncs.js.map