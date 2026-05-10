"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextView = exports.textView = exports.FileSystemProvider = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const path = tslib_1.__importStar(require("path"));
const visualText_1 = require("./visualText");
const nlp_1 = require("./nlp");
const findFile_1 = require("./findFile");
const findView_1 = require("./findView");
const dirfuncs_1 = require("./dirfuncs");
const status_1 = require("./status");
const fileOps_1 = require("./fileOps");
const analyzer_1 = require("./analyzer");
const fs = tslib_1.__importStar(require("fs"));
const moment_1 = tslib_1.__importDefault(require("moment"));
require("moment-duration-format");
class FileSystemProvider {
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    getChildren(textItem) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (textItem) {
                return this.getKeepers(textItem.uri);
            }
            if (visualText_1.visualText.hasWorkspaceFolder() && visualText_1.visualText.hasAnalyzers() && visualText_1.visualText.analyzer.isLoaded()) {
                return this.getKeepers(visualText_1.visualText.analyzer.getInputDirectory());
            }
            return [];
        });
    }
    getMovement(textItem) {
        textItem.moveDown = false;
        textItem.moveUp = false;
        const itemPath = textItem.uri.fsPath;
        const parent = path.dirname(itemPath);
        const inputPath = visualText_1.visualText.analyzer.getInputDirectory().fsPath;
        if (parent != inputPath) {
            textItem.moveUp = true;
        }
        if (textItem.type == vscode.FileType.Directory) {
            if (dirfuncs_1.dirfuncs.parentHasOtherDirs(textItem.uri)) {
                textItem.moveDown = true;
            }
        }
        else if (dirfuncs_1.dirfuncs.parentHasOtherDirs(vscode.Uri.file(itemPath))) {
            textItem.moveDown = true;
        }
    }
    getTreeItem(textItem) {
        const treeItem = new vscode.TreeItem(textItem.uri, textItem.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        if (!visualText_1.visualText.getTextFastLoad())
            this.getMovement(textItem);
        let conVal = textItem.moveDown ? 'moveDown' : '';
        if (textItem.moveUp)
            conVal = conVal + 'moveUp';
        const hasLogs = textItem.hasLogs ? 'HasLogs' : '';
        let hasTest = '';
        if (textItem.type === vscode.FileType.File) {
            const testFolder = visualText_1.visualText.analyzer.testFolder(textItem.uri).fsPath;
            if (fs.existsSync(testFolder))
                hasTest = 'test';
            treeItem.command = { command: 'textView.openFile', title: "Open File", arguments: [textItem], };
            treeItem.contextValue = 'file' + conVal + hasLogs + hasTest;
            //treeItem.tooltip = treeItem.contextValue;
            if (textItem.uri.fsPath.endsWith('.py')) {
                treeItem.iconPath = {
                    light: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'light', 'python.svg')),
                    dark: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'dark', 'python.svg'))
                };
            }
            else {
                treeItem.iconPath = {
                    light: vscode.Uri.file(textItem.hasLogs ?
                        hasTest ? path.join(__filename, '..', '..', 'resources', 'light', 'document-test.svg') : path.join(__filename, '..', '..', 'resources', 'light', 'document.svg') :
                        hasTest ? path.join(__filename, '..', '..', 'resources', 'light', 'file-test.svg') : path.join(__filename, '..', '..', 'resources', 'light', 'file.svg')),
                    dark: vscode.Uri.file(textItem.hasLogs ?
                        hasTest ? path.join(__filename, '..', '..', 'resources', 'dark', 'document-test.svg') : path.join(__filename, '..', '..', 'resources', 'dark', 'document.svg') :
                        hasTest ? path.join(__filename, '..', '..', 'resources', 'dark', 'file-test.svg') : path.join(__filename, '..', '..', 'resources', 'dark', 'file.svg')),
                };
            }
        }
        else {
            if (!visualText_1.visualText.getAutoUpdate()) {
                if (visualText_1.visualText.analyzer.folderHasTests(textItem.uri))
                    hasTest = 'test';
            }
            const hasNonText = textItem.hasNonText ? 'HasNonText' : '';
            treeItem.command = { command: 'textView.openFile', title: "Open File", arguments: [textItem], };
            treeItem.contextValue = 'dir' + conVal + hasNonText + hasLogs + hasTest;
            //treeItem.tooltip = treeItem.contextValue;
            treeItem.iconPath = {
                light: vscode.Uri.file(hasTest ? path.join(__filename, '..', '..', 'resources', 'dark', 'folder-test.svg') : path.join(__filename, '..', '..', 'resources', 'dark', 'folder.svg')),
                dark: vscode.Uri.file(hasTest ? path.join(__filename, '..', '..', 'resources', 'dark', 'folder-test.svg') : path.join(__filename, '..', '..', 'resources', 'dark', 'folder.svg')),
            };
        }
        return treeItem;
    }
    getKeepers(dir) {
        // this.checkFileCount(dir.fsPath);
        let keepers = Array();
        const entries = dirfuncs_1.dirfuncs.getDirectoryTypes(dir);
        const startTime = (0, moment_1.default)();
        for (const entry of entries) {
            if (!entry.uri.fsPath.endsWith(visualText_1.visualText.TEST_SUFFIX) && !(entry.type == vscode.FileType.Directory && dirfuncs_1.dirfuncs.directoryIsLog(entry.uri.fsPath))) {
                let hasLogs = false;
                let hasNonText = false;
                if (!visualText_1.visualText.getTextFastLoad()) {
                    hasLogs = dirfuncs_1.dirfuncs.hasLogDirs(entry.uri, false);
                    hasNonText = entry.type == vscode.FileType.Directory && this.dirHasNonText(entry.uri) ? true : false;
                }
                keepers.push({ uri: entry.uri, type: entry.type, hasLogs: hasLogs, hasNonText: hasNonText, moveUp: false, moveDown: false });
            }
        }
        let hasAllLogs = false;
        if (!visualText_1.visualText.getTextFastLoad())
            hasAllLogs = dirfuncs_1.dirfuncs.hasLogDirs(dir, true);
        vscode.commands.executeCommand('setContext', 'text.hasLogs', false);
        if (visualText_1.visualText.getTextFastLoad()) {
            const endTime = (0, moment_1.default)();
            const timeDiff = moment_1.default.duration(endTime.diff(startTime), 'milliseconds').format('mm:ss:SS');
            visualText_1.visualText.debugMessage(`TextView loading: ${timeDiff} (m:s:ms)`);
        }
        return keepers;
    }
    checkFileCount(dir) {
        const count = dirfuncs_1.dirfuncs.fileCount(visualText_1.visualText.analyzer.getInputDirectory());
        if (!visualText_1.visualText.fastAnswered && count > 100 && !visualText_1.visualText.getTextFastLoad()) {
            const items = [];
            const offMsg = 'Turn On Fast Text Load';
            items.push({ label: offMsg, description: 'files will not have attributes such as \'has log files\'' });
            items.push({ label: 'Leave Fast Load Off', description: 'please generate all the file attributes' });
            vscode.window.showQuickPick(items, { title: 'Fast Load Toggle', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
                if (selection != undefined) {
                    if (selection.label == 'Turn On Fast Text Load')
                        visualText_1.visualText.setTextFastLoad(true);
                }
            });
            visualText_1.visualText.fastAnswered = true;
        }
    }
    dirHasNonText(dir) {
        const files = dirfuncs_1.dirfuncs.getFiles(dir);
        for (const file of files) {
            if (!file.fsPath.endsWith('.txt'))
                return true;
        }
        return false;
    }
    importFiles(textItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const options = {
                canSelectMany: true,
                openLabel: 'Import Existing File(s)',
                defaultUri: visualText_1.visualText.getWorkspaceFolder(),
                canSelectFiles: true,
                canSelectFolders: false,
                filters: {
                    'Text files': ['txt', 'xml', 'html', 'csv'],
                    'All files': ['*']
                }
            };
            vscode.window.showOpenDialog(options).then(selections => {
                if (!selections) {
                    return;
                }
                let dir = visualText_1.visualText.analyzer.getInputDirectory().fsPath;
                if (textItem) {
                    dir = textItem.uri.fsPath;
                    if (textItem.type == vscode.FileType.File) {
                        dir = path.dirname(textItem.uri.fsPath);
                    }
                }
                for (const sel of selections) {
                    const filename = path.basename(sel.fsPath);
                    const newPath = vscode.Uri.file(path.join(dir, filename));
                    visualText_1.visualText.fileOps.addFileOperation(sel, newPath, [fileOps_1.fileOpRefresh.TEXT], fileOps_1.fileOperation.COPY);
                }
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    existingFolder(textItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const options = {
                canSelectMany: true,
                openLabel: 'Add Existing Folder(s)',
                defaultUri: visualText_1.visualText.getWorkspaceFolder(),
                canSelectFiles: false,
                canSelectFolders: true,
            };
            vscode.window.showOpenDialog(options).then(selections => {
                if (!selections) {
                    return;
                }
                for (const sel of selections) {
                    const dirname = path.basename(sel.fsPath);
                    let dir = visualText_1.visualText.analyzer.getInputDirectory().fsPath;
                    if (textItem) {
                        dir = path.dirname(textItem.uri.fsPath);
                    }
                    const newPath = vscode.Uri.file(path.join(dir, dirname));
                    visualText_1.visualText.fileOps.addFileOperation(sel, newPath, [fileOps_1.fileOpRefresh.TEXT], fileOps_1.fileOperation.COPY);
                }
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    rename(textItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: path.basename(textItem.uri.fsPath), prompt: 'Enter new name for file' }).then(newname => {
                if (newname) {
                    const original = textItem.uri;
                    if (path.extname(newname).length == 0)
                        newname = newname + path.extname(textItem.uri.fsPath);
                    const newfile = vscode.Uri.file(path.join(path.dirname(textItem.uri.fsPath), newname));
                    dirfuncs_1.dirfuncs.rename(original.fsPath, newfile.fsPath);
                    vscode.window.showTextDocument(newfile);
                    const logFolderOrig = vscode.Uri.file(path.join(original.fsPath + visualText_1.visualText.LOG_SUFFIX));
                    if (dirfuncs_1.dirfuncs.isDir(logFolderOrig.fsPath)) {
                        const logFolderNew = vscode.Uri.file(path.join(path.dirname(textItem.uri.fsPath), newname + visualText_1.visualText.LOG_SUFFIX));
                        dirfuncs_1.dirfuncs.rename(logFolderOrig.fsPath, logFolderNew.fsPath);
                    }
                    vscode.commands.executeCommand('textView.refreshAll');
                }
            });
        }
    }
    renameDir(textItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: path.basename(textItem.uri.fsPath), prompt: 'Enter new name for directory' }).then(newname => {
                if (newname) {
                    const original = textItem.uri;
                    const newfile = vscode.Uri.file(path.join(path.dirname(textItem.uri.fsPath), newname));
                    dirfuncs_1.dirfuncs.rename(original.fsPath, newfile.fsPath);
                    vscode.commands.executeCommand('textView.refreshAll');
                }
            });
        }
    }
    convert(textItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            visualText_1.visualText.fileOps.addFileOperation(textItem.uri, textItem.uri, [fileOps_1.fileOpRefresh.TEXT], fileOps_1.fileOperation.RENAME, '', 'txt');
            visualText_1.visualText.fileOps.startFileOps(100);
        }
    }
}
exports.FileSystemProvider = FileSystemProvider;
class TextView {
    constructor(context) {
        this.findFile = new findFile_1.FindFile();
        const treeDataProvider = new FileSystemProvider();
        this.textView = vscode.window.createTreeView('textView', { treeDataProvider });
        vscode.commands.registerCommand('textView.refreshAll', () => treeDataProvider.refresh());
        vscode.commands.registerCommand('textView.importFiles', (textItem) => treeDataProvider.importFiles(textItem));
        vscode.commands.registerCommand('textView.existingFolder', (textItem) => treeDataProvider.existingFolder(textItem));
        vscode.commands.registerCommand('textView.rename', (textItem) => treeDataProvider.rename(textItem));
        vscode.commands.registerCommand('textView.renameDir', (textItem) => treeDataProvider.renameDir(textItem));
        vscode.commands.registerCommand('textView.convert', (textItem) => treeDataProvider.convert(textItem));
        vscode.commands.registerCommand('textView.openFile', (textItem) => this.openFile(textItem));
        vscode.commands.registerCommand('textView.analyzerCurrent', () => this.analyzerCurrent());
        vscode.commands.registerCommand('textView.analyze', (textItem) => this.analyze(textItem));
        vscode.commands.registerCommand('textView.analyzeDir', (textItem) => this.analyzeDir(textItem));
        vscode.commands.registerCommand('textView.openText', () => this.openText());
        vscode.commands.registerCommand('textView.search', () => this.search());
        vscode.commands.registerCommand('textView.fastLoad', () => this.fastLoad(true));
        vscode.commands.registerCommand('textView.fastLoadOff', () => this.fastLoad(false));
        vscode.commands.registerCommand('textView.newTextTop', (textItem) => this.newText(textItem, true));
        vscode.commands.registerCommand('textView.newText', (textItem) => this.newText(textItem, false));
        vscode.commands.registerCommand('textView.newDirTop', (textItem) => this.newDir(textItem, true));
        vscode.commands.registerCommand('textView.newDir', (textItem) => this.newDir(textItem, false));
        vscode.commands.registerCommand('textView.deleteFile', (textItem) => this.deleteFile(textItem));
        vscode.commands.registerCommand('textView.deleteDir', (textItem) => this.deleteFile(textItem));
        vscode.commands.registerCommand('textView.deleteFileLogs', (textItem) => this.deleteFileLogs(textItem));
        vscode.commands.registerCommand('textView.deleteAnalyzerLogs', () => this.deleteAnalyzerLogs());
        vscode.commands.registerCommand('textView.splitDir', (textItem) => this.splitDir(textItem));
        vscode.commands.registerCommand('textView.updateTitle', (textItem) => this.updateTitle(textItem));
        vscode.commands.registerCommand('textView.propertiesFile', (textItem) => this.propertiesFile(textItem));
        vscode.commands.registerCommand('textView.propertiesFolder', (textItem) => this.propertiesFolder(textItem));
        vscode.commands.registerCommand('textView.explore', (textItem) => this.explore(textItem));
        vscode.commands.registerCommand('textView.exploreAll', (textItem) => this.exploreAll(textItem));
        vscode.commands.registerCommand('textView.moveToFolder', (textItem) => this.moveToFolder(textItem));
        vscode.commands.registerCommand('textView.moveUp', (textItem) => this.moveUp(textItem));
        vscode.commands.registerCommand('textView.copyToAnalyzer', (textItem) => this.copyToAnalyzer(textItem));
        vscode.commands.registerCommand('textView.modAdd', (textItem) => this.modAdd(textItem));
        vscode.commands.registerCommand('textView.runTest', (textItem) => this.runTest(textItem));
        vscode.commands.registerCommand('textView.deleteTest', (textItem) => this.deleteTest(textItem));
        vscode.commands.registerCommand('textView.editTest', (textItem) => this.editTest(textItem));
        vscode.commands.registerCommand('textView.python', (textItem) => this.python(textItem));
        this.folderUri = undefined;
    }
    static attach(ctx) {
        if (!exports.textView) {
            exports.textView = new TextView(ctx);
        }
        return exports.textView;
    }
    python(textItem) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (visualText_1.visualText.hasWorkspaceFolder()) {
                const textFilePath = path.dirname(textItem.uri.fsPath);
                const items = yield visualText_1.visualText.chooseLibFiles('Choose python scripts', 'python', '', [".py"]);
                for (const item of items) {
                    if (item.description) {
                        const original = vscode.Uri.file(path.join(item.description, item.label));
                        const newFile = vscode.Uri.file(path.join(textFilePath, item.label));
                        visualText_1.visualText.fileOps.addFileOperation(original, newFile, [fileOps_1.fileOpRefresh.TEXT], fileOps_1.fileOperation.COPY);
                    }
                }
                visualText_1.visualText.fileOps.startFileOps();
            }
        });
    }
    fastLoad(fastFlag = false) {
        visualText_1.visualText.setTextFastLoad(fastFlag);
        vscode.commands.executeCommand('setContext', 'textView.fastload', fastFlag);
    }
    editTest(textItem) {
        if (visualText_1.visualText.getWorkspaceFolder()) {
            visualText_1.visualText.editTestFiles(textItem.uri);
        }
    }
    deleteTest(textItem) {
        const items = [];
        items.push({ label: 'Yes', description: 'Delete all the test files associated with this test' });
        items.push({ label: 'No', description: 'Do not delete the test files' });
        vscode.window.showQuickPick(items, { title: 'Delete Test Files', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
            if (!selection || selection.label == 'No')
                return;
            const testFolder = visualText_1.visualText.analyzer.testFolder(textItem.uri);
            visualText_1.visualText.fileOps.addFileOperation(testFolder, testFolder, [fileOps_1.fileOpRefresh.TEXT, fileOps_1.fileOpRefresh.OUTPUT], fileOps_1.fileOperation.DELETE);
            visualText_1.visualText.fileOps.startFileOps();
        });
    }
    runTest(textItem) {
        visualText_1.visualText.testInit();
        if (dirfuncs_1.dirfuncs.isDir(textItem.uri.fsPath)) {
            const files = dirfuncs_1.dirfuncs.getFiles(textItem.uri);
            if (files.length)
                dirfuncs_1.dirfuncs.delFile(visualText_1.visualText.regressionTestFile());
            for (const file of files) {
                if (visualText_1.visualText.analyzer.fileHasTests(file))
                    visualText_1.visualText.runTest(file);
            }
        }
        else {
            dirfuncs_1.dirfuncs.delFile(visualText_1.visualText.regressionTestFile());
            visualText_1.visualText.runTest(textItem.uri);
        }
        visualText_1.visualText.closeTest();
        vscode.window.showTextDocument(vscode.Uri.file(visualText_1.visualText.regressionTestFile()));
        vscode.commands.executeCommand('kbView.refreshAll');
    }
    modAdd(textItem) {
        visualText_1.visualText.mod.addFile(textItem.uri, true);
    }
    copyToAnalyzer(textItem) {
        if (visualText_1.visualText.getWorkspaceFolder()) {
            const dirs = dirfuncs_1.dirfuncs.getDirectories(visualText_1.visualText.getWorkspaceFolder());
            const items = visualText_1.visualText.analyzerFolderList();
            const title = 'Copy to Analyzer';
            const placeHolder = 'Choose analyzer to copy to';
            vscode.window.showQuickPick(items, { title, canPickMany: false, placeHolder: placeHolder }).then(selection => {
                if (!selection || !selection.description)
                    return;
                if (selection.description.startsWith('(FOLDER')) {
                    vscode.window.showWarningMessage('You must select an analyzer directory not a folder');
                    return;
                }
                const subDir = visualText_1.visualText.analyzer.anaSubDirPath(analyzer_1.anaSubDir.INPUT);
                if (dirfuncs_1.dirfuncs.isDir(textItem.uri.fsPath)) {
                    const newFolder = vscode.Uri.file(path.join(selection.description, subDir, path.basename(textItem.uri.fsPath)));
                    visualText_1.visualText.fileOps.addFileOperation(textItem.uri, newFolder, [fileOps_1.fileOpRefresh.TEXT], fileOps_1.fileOperation.COPY);
                }
                else {
                    const newFile = vscode.Uri.file(path.join(selection.description, subDir, path.basename(textItem.uri.fsPath)));
                    visualText_1.visualText.fileOps.addFileOperation(textItem.uri, newFile, [fileOps_1.fileOpRefresh.TEXT], fileOps_1.fileOperation.COPY);
                }
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    moveToFolder(textItem) {
        if (this.folderUri) {
            const to = path.join(this.folderUri.fsPath, path.basename(textItem.uri.fsPath));
            this.moveFileWithFolders(textItem.uri.fsPath, to);
            vscode.commands.executeCommand('textView.refreshAll');
        }
        else {
            vscode.window.showInformationMessage('No folder selected');
        }
    }
    moveUp(textItem) {
        let parent = path.dirname(textItem.uri.fsPath);
        const analyzersFolder = visualText_1.visualText.analyzer.getInputDirectory();
        if (parent != analyzersFolder.fsPath) {
            parent = path.dirname(parent);
            const to = path.join(parent, path.basename(textItem.uri.fsPath));
            this.moveFileWithFolders(textItem.uri.fsPath, to);
            vscode.commands.executeCommand('textView.refreshAll');
        }
        else {
            vscode.window.showInformationMessage('Already at the top');
        }
    }
    moveFileWithFolders(from, to) {
        dirfuncs_1.dirfuncs.rename(from, to);
        if (!dirfuncs_1.dirfuncs.isDir(from)) {
            const outputFolder = from + visualText_1.visualText.LOG_SUFFIX;
            if (fs.existsSync(outputFolder)) {
                const toFolder = to + visualText_1.visualText.LOG_SUFFIX;
                dirfuncs_1.dirfuncs.rename(outputFolder, toFolder);
            }
            const testFolder = from + visualText_1.visualText.TEST_SUFFIX;
            if (fs.existsSync(testFolder)) {
                const toFolder = to + visualText_1.visualText.TEST_SUFFIX;
                dirfuncs_1.dirfuncs.rename(testFolder, toFolder);
            }
        }
    }
    explore(textItem) {
        if (textItem.uri.fsPath.length) {
            let pather = textItem.uri.fsPath;
            if (!dirfuncs_1.dirfuncs.isDir(pather))
                pather = path.dirname(pather);
            visualText_1.visualText.openFileManager(pather);
        }
    }
    exploreAll(textItem) {
        const inputDir = visualText_1.visualText.analyzer.getInputDirectory().fsPath;
        if (fs.existsSync(inputDir)) {
            visualText_1.visualText.openFileManager(inputDir);
        }
    }
    analyze(textItem) {
        if (textItem.uri.fsPath.length) {
            // visualText.nlp.addAnalyzer(textItem.uri,analyzerType.FILE);
            // visualText.nlp.startAnalyzer();
            const nlp = new nlp_1.NLPFile();
            nlp.analyze(textItem.uri);
        }
    }
    analyzerCurrent() {
        if (visualText_1.visualText.analyzer.hasText()) {
            const textUri = visualText_1.visualText.analyzer.getTextPath();
            this.openFile({ uri: textUri, type: vscode.FileType.File, hasLogs: false, hasNonText: false, moveUp: false, moveDown: false });
            const nlp = new nlp_1.NLPFile();
            nlp.analyze(textUri);
        }
    }
    propertiesFile(textItem) {
        fs.stat(textItem.uri.fsPath, (err, stats) => {
            if (err) {
                vscode.window.showInformationMessage('File read error: ' + err);
            }
            else {
                const sizeStr = this.humanFileSize(stats.size, true, 1);
                const base = path.basename(textItem.uri.fsPath);
                vscode.window.showInformationMessage(base + ": " + sizeStr);
            }
        });
    }
    propertiesFolder(textItem) {
        const files = dirfuncs_1.dirfuncs.getFiles(textItem.uri);
        const len = files.length;
        const base = path.basename(textItem.uri.fsPath);
        vscode.window.showInformationMessage(base + ": " + len + " files");
    }
    humanFileSize(bytes, si, dp) {
        const thresh = si ? 1000 : 1024;
        if (Math.abs(bytes) < thresh) {
            return bytes + ' B';
        }
        const units = si
            ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
            : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
        let u = -1;
        const r = Math.pow(10, dp);
        do {
            bytes /= thresh;
            ++u;
        } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);
        return bytes.toFixed(dp) + ' ' + units[u];
    }
    analyzeDir(textItem) {
        if (textItem.uri.fsPath.length) {
            const items = [];
            const foldername = path.basename(textItem.uri.fsPath);
            let msg = '';
            msg = msg.concat('Analyze all files in folder \'', foldername, '\'?');
            if (status_1.nlpStatusBar.getDevMode() == status_1.DevMode.DEV) {
                const fileCount = dirfuncs_1.dirfuncs.fileCount(textItem.uri);
                if (fileCount > 10) {
                    const items = [];
                    const offMsg = 'Turn Off Logs';
                    items.push({ label: offMsg, description: fileCount + ' files will be analyzed, each will generate logs' });
                    items.push({ label: 'Leave Logs On', description: 'please generate all the logs' });
                    vscode.window.showQuickPick(items, { title: 'Logs Toggle', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
                        if (!selection) {
                            exports.textView.askAnalyzeFolder(textItem);
                            return;
                        }
                        status_1.nlpStatusBar.setDevState(selection.label == offMsg ? status_1.DevMode.NORMAL : status_1.DevMode.DEV);
                        status_1.nlpStatusBar.updateFiredState();
                        exports.textView.askAnalyzeFolder(textItem);
                    });
                }
                else {
                    exports.textView.askAnalyzeFolder(textItem);
                }
            }
            else {
                exports.textView.askAnalyzeFolder(textItem);
            }
        }
    }
    askAnalyzeFolder(textItem) {
        const items = [];
        const foldername = path.basename(textItem.uri.fsPath);
        let msg = '';
        msg = msg.concat('Analyze all files in folder \'', foldername, '\'?');
        items.push({ label: 'Yes', description: msg });
        items.push({ label: 'No', description: 'Do not analyze folder \'' + foldername + '\'' });
        vscode.window.showQuickPick(items, { title: 'Analyzer Folders', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
            if (!selection || selection.label == 'No')
                return;
            visualText_1.visualText.nlp.addAnalyzer(textItem.uri, nlp_1.analyzerType.DIRECTORY);
            visualText_1.visualText.nlp.startAnalyzer();
        });
    }
    search() {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            if (visualText_1.visualText.hasWorkspaceFolder()) {
                vscode.window.showInputBox({ value: 'searchword', prompt: 'Enter term to search' }).then(searchWord => {
                    if (searchWord) {
                        this.findFile.searchFiles(visualText_1.visualText.analyzer.getInputDirectory(), searchWord, []);
                        findView_1.findView.loadFinds(searchWord, this.findFile.getMatches());
                        vscode.commands.executeCommand('findView.updateTitle');
                        vscode.commands.executeCommand('findView.refreshAll');
                    }
                });
            }
        }
    }
    openText() {
        if (visualText_1.visualText.analyzer.hasText()) {
            vscode.window.showTextDocument(visualText_1.visualText.analyzer.getTextPath());
            vscode.commands.executeCommand('status.update');
        }
    }
    updateTitle(resource) {
        const filepath = resource.fsPath;
        if (resource && filepath.length) {
            const filename = path.basename(resource.fsPath);
            if (filename.length) {
                this.textView.title = `TEXT (${filename})`;
                return;
            }
        }
        this.textView.title = 'TEXT';
    }
    openFile(textItem) {
        this.updateTitle(textItem.uri);
        visualText_1.visualText.colorizeAnalyzer();
        if (textItem.type == vscode.FileType.File) {
            this.folderUri = undefined;
            vscode.window.showTextDocument(textItem.uri);
            visualText_1.visualText.analyzer.saveCurrentFile(textItem.uri);
            vscode.commands.executeCommand('outputView.refreshAll');
            vscode.commands.executeCommand('status.update');
        }
        else {
            this.folderUri = textItem.uri;
        }
    }
    deleteFile(textItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const items = [];
            let deleteDescr = '';
            const filename = path.basename(textItem.uri.fsPath);
            deleteDescr = deleteDescr.concat('Delete \'', filename, '\'?');
            items.push({ label: 'Yes', description: deleteDescr });
            items.push({ label: 'No', description: 'Do not delete ' + filename });
            vscode.window.showQuickPick(items, { title: 'Delete File', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                visualText_1.visualText.fileOps.addFileOperation(textItem.uri, textItem.uri, [fileOps_1.fileOpRefresh.TEXT], fileOps_1.fileOperation.DELETE);
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    deleteFileOrFolderLogs(textItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            if (dirfuncs_1.dirfuncs.isDir(textItem.uri.fsPath)) {
                this.deleteFolderLogs(textItem.uri);
            }
            else {
                this.deleteFileLogDir(textItem.uri.fsPath);
            }
        }
    }
    deleteFileLogs(textItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const items = [];
            let deleteDescr = '';
            const filename = path.basename(textItem.uri.fsPath);
            const type = dirfuncs_1.dirfuncs.isDir(textItem.uri.fsPath) ? 'directory' : 'file';
            deleteDescr = deleteDescr.concat('Delete logs for ', type, ' \'', filename, '\'?');
            items.push({ label: 'Yes', description: deleteDescr });
            items.push({ label: 'No', description: 'Do not delete logs for ' + filename });
            vscode.window.showQuickPick(items, { title: 'Delete File Logs', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                this.deleteFileOrFolderLogs(textItem);
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    deleteFolderFileLogs(textItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const items = [];
            let deleteDescr = '';
            const filename = path.basename(textItem.uri.fsPath);
            deleteDescr = deleteDescr.concat('Delete logs for \'', filename, '\'?');
            items.push({ label: 'Yes', description: deleteDescr });
            items.push({ label: 'No', description: 'Do not delete logs for ' + filename });
            vscode.window.showQuickPick(items, { title: 'Delete Folder File Logs', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                this.deleteFolderLogs(textItem.uri);
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    deleteFolderLogs(dir) {
        const analyzerName = path.basename(dir.fsPath);
        const logDirs = Array();
        exports.textView.getLogDirs(dir, logDirs, false);
        const count = logDirs.length;
        if (count) {
            for (const dir of logDirs) {
                visualText_1.visualText.fileOps.addFileOperation(dir.uri, dir.uri, [fileOps_1.fileOpRefresh.TEXT, fileOps_1.fileOpRefresh.ANALYZER, fileOps_1.fileOpRefresh.ANALYZERS, fileOps_1.fileOpRefresh.OUTPUT], fileOps_1.fileOperation.DELETE);
            }
            ;
        }
    }
    deleteFileLogDir(dirPath) {
        const logPath = vscode.Uri.file(dirPath + visualText_1.visualText.LOG_SUFFIX);
        visualText_1.visualText.fileOps.addFileOperation(logPath, logPath, [fileOps_1.fileOpRefresh.TEXT, fileOps_1.fileOpRefresh.ANALYZER, fileOps_1.fileOpRefresh.ANALYZERS, fileOps_1.fileOpRefresh.OUTPUT], fileOps_1.fileOperation.DELETE);
    }
    deleteAnalyzerLogs() {
        if (visualText_1.visualText.hasWorkspaceFolder() && visualText_1.visualText.analyzer.hasText()) {
            const items = [];
            let deleteDescr = '';
            deleteDescr = deleteDescr.concat('Delete all logs for this Analyzer?');
            items.push({ label: 'Yes', description: deleteDescr });
            items.push({ label: 'No', description: 'Do not delete all logs for this Analyzer' });
            vscode.window.showQuickPick(items, { title: 'Delete Analyzer Logs', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                const inputPath = visualText_1.visualText.analyzer.getInputDirectory();
                if (inputPath.fsPath.length) {
                    this.deleteFolderLogs(inputPath);
                    visualText_1.visualText.fileOps.startFileOps();
                }
            });
        }
    }
    splitDir(textItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: "3000", prompt: 'Enter number of files per directory' }).then(numFiles => {
                if (numFiles) {
                    visualText_1.visualText.fileOps.addFileOperation(textItem.uri, vscode.Uri.file(''), [fileOps_1.fileOpRefresh.TEXT], fileOps_1.fileOperation.BREAK, numFiles.toString());
                    visualText_1.visualText.fileOps.startFileOps(0);
                }
            });
        }
    }
    getLogDirs(dir, logDirs, first) {
        const inputDir = first ? visualText_1.visualText.analyzer.getInputDirectory() : dir;
        const entries = dirfuncs_1.dirfuncs.getDirectoryTypes(inputDir);
        for (const entry of entries) {
            if (entry.type == vscode.FileType.Directory) {
                const name = path.basename(entry.uri.fsPath);
                if (dirfuncs_1.dirfuncs.directoryIsLog(entry.uri.fsPath) || name == 'logs' || name == 'output')
                    logDirs.push({ uri: entry.uri, type: entry.type, hasLogs: false, hasNonText: false, moveUp: false, moveDown: false });
                else
                    this.getLogDirs(entry.uri, logDirs, false);
            }
        }
    }
    newDir(textItem, top) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: 'dirname', prompt: 'Enter directory name' }).then(newdir => {
                if (newdir) {
                    let dirPath = visualText_1.visualText.analyzer.getInputDirectory().fsPath;
                    if (textItem && !top)
                        dirPath = dirfuncs_1.dirfuncs.getDirPath(textItem.uri.fsPath);
                    dirPath = path.join(dirPath, newdir);
                    dirfuncs_1.dirfuncs.makeDir(dirPath);
                    vscode.commands.executeCommand('textView.refreshAll');
                }
            });
        }
    }
    newText(textItem, top) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: 'filename', prompt: 'Enter text file name' }).then(newname => {
                if (newname) {
                    let dirPath = visualText_1.visualText.analyzer.getInputDirectory().fsPath;
                    if (textItem && !top)
                        dirPath = dirfuncs_1.dirfuncs.getDirPath(textItem.uri.fsPath);
                    let filepath = path.join(dirPath, newname + '.txt');
                    if (path.extname(newname))
                        filepath = path.join(dirPath, newname);
                    dirfuncs_1.dirfuncs.writeFile(filepath, 'Hello world!');
                    vscode.commands.executeCommand('textView.refreshAll');
                }
            });
        }
    }
}
exports.TextView = TextView;
//# sourceMappingURL=textView.js.map