"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutputView = exports.outputView = exports.OutputTreeDataProvider = exports.outputFileType = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const path = tslib_1.__importStar(require("path"));
const fs = tslib_1.__importStar(require("fs"));
const visualText_1 = require("./visualText");
const textFile_1 = require("./textFile");
const dirfuncs_1 = require("./dirfuncs");
const fileOps_1 = require("./fileOps");
const analyzer_1 = require("./analyzer");
var outputFileType;
(function (outputFileType) {
    outputFileType[outputFileType["ALL"] = 0] = "ALL";
    outputFileType[outputFileType["TXXT"] = 1] = "TXXT";
    outputFileType[outputFileType["TREE"] = 2] = "TREE";
    outputFileType[outputFileType["KB"] = 3] = "KB";
    outputFileType[outputFileType["NLP"] = 4] = "NLP";
})(outputFileType || (exports.outputFileType = outputFileType = {}));
class OutputTreeDataProvider {
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    getTreeItem(outputItem) {
        const icon = visualText_1.visualText.fileIconFromExt(outputItem.uri.fsPath);
        const testFolder = visualText_1.visualText.analyzer.testFolder(outputItem.uri, true);
        const testFile = path.join(testFolder.fsPath, path.basename(outputItem.uri.fsPath));
        const value = fs.existsSync(testFile) ? 'test' : '';
        return {
            resourceUri: outputItem.uri,
            collapsibleState: void 0,
            contextValue: value,
            command: {
                command: 'outputView.openFile',
                arguments: [outputItem.uri],
                title: 'Open Output File'
            },
            iconPath: {
                light: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'light', icon)),
                dark: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'dark', icon))
            },
        };
    }
    getChildren(outputItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const children = new Array();
            for (const folder of exports.outputView.getOutputFiles()) {
                children.push({ uri: folder });
            }
            return children;
        }
        return [];
    }
}
exports.OutputTreeDataProvider = OutputTreeDataProvider;
class OutputView {
    constructor(context) {
        const outputViewProvider = new OutputTreeDataProvider();
        this.outputView = vscode.window.createTreeView('outputView', { treeDataProvider: outputViewProvider });
        vscode.commands.registerCommand('outputView.refreshAll', () => outputViewProvider.refresh());
        vscode.commands.registerCommand('outputView.copytoKB', (resource) => this.copytoKB(resource));
        vscode.commands.registerCommand('outputView.copytoText', (resource) => this.copytoText(resource));
        vscode.commands.registerCommand('outputView.deleteOutput', (resource) => this.deleteOutput(resource));
        vscode.commands.registerCommand('outputView.openFile', (resource) => this.openFile(resource));
        vscode.commands.registerCommand('outputView.addTest', (resource) => this.addTest(resource));
        vscode.commands.registerCommand('outputView.runTest', (resource) => this.runTest(resource));
        vscode.commands.registerCommand('outputView.deleteTest', (resource) => this.deleteTest(resource));
        vscode.commands.registerCommand('outputView.editTest', (resource) => this.editTest(resource));
        vscode.commands.registerCommand('outputView.rename', (resource) => this.rename(resource));
        vscode.commands.registerCommand('outputView.kb', () => this.loadKB());
        vscode.commands.registerCommand('outputView.matches', () => this.loadTxxt());
        vscode.commands.registerCommand('outputView.trees', () => this.loadTrees());
        vscode.commands.registerCommand('outputView.all', () => this.loadAll());
        vscode.commands.registerCommand('outputView.orphanPasses', () => this.loadOrphans());
        vscode.commands.registerCommand('outputView.deleteOrphans', () => this.deleteOrphans());
        vscode.commands.registerCommand('outputView.explore', () => this.explore());
        vscode.commands.registerCommand('outputView.video', () => this.video());
        this.outputFiles = [];
        this.logDirectory = vscode.Uri.file('');
        this.testDirectory = vscode.Uri.file('');
        this.type = outputFileType.ALL;
    }
    static attach(ctx) {
        if (!exports.outputView) {
            exports.outputView = new OutputView(ctx);
        }
        return exports.outputView;
    }
    rename(outputItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: path.basename(outputItem.uri.fsPath), prompt: 'Enter new name for file' }).then(newname => {
                if (newname) {
                    const original = outputItem.uri;
                    if (path.extname(newname).length == 0)
                        newname = newname + path.extname(outputItem.uri.fsPath);
                    const newfile = vscode.Uri.file(path.join(path.dirname(outputItem.uri.fsPath), newname));
                    dirfuncs_1.dirfuncs.rename(original.fsPath, newfile.fsPath);
                    vscode.window.showTextDocument(newfile);
                    const logFolderOrig = vscode.Uri.file(path.join(original.fsPath + visualText_1.visualText.LOG_SUFFIX));
                    if (dirfuncs_1.dirfuncs.isDir(logFolderOrig.fsPath)) {
                        const logFolderNew = vscode.Uri.file(path.join(path.dirname(outputItem.uri.fsPath), newname + visualText_1.visualText.LOG_SUFFIX));
                        dirfuncs_1.dirfuncs.rename(logFolderOrig.fsPath, logFolderNew.fsPath);
                    }
                    vscode.commands.executeCommand('outputView.refreshAll');
                }
            });
        }
    }
    editTest(outputItem) {
        if (visualText_1.visualText.getWorkspaceFolder()) {
            visualText_1.visualText.editTestFiles(outputItem.uri, true);
        }
    }
    deleteTest(outputItem) {
        const items = [];
        items.push({ label: 'Yes', description: 'Delete all the test files associated with this test' });
        items.push({ label: 'No', description: 'Do not delete the test files' });
        vscode.window.showQuickPick(items, { title: 'Delete Test Files', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
            if (!selection || selection.label == 'No')
                return;
            const testFolder = visualText_1.visualText.analyzer.testFolder(outputItem.uri, true);
            visualText_1.visualText.fileOps.addFileOperation(testFolder, testFolder, [fileOps_1.fileOpRefresh.TEXT, fileOps_1.fileOpRefresh.OUTPUT], fileOps_1.fileOperation.DELETE);
            visualText_1.visualText.fileOps.startFileOps();
        });
    }
    runTest(outputItem) {
        const logDir = path.dirname(outputItem.uri.fsPath);
        let textFile = path.basename(logDir);
        textFile = textFile.substring(0, textFile.length - visualText_1.visualText.LOG_SUFFIX.length);
        const textFilePath = path.join(path.dirname(logDir), textFile);
        if (fs.existsSync(textFilePath)) {
            visualText_1.visualText.testInit();
            dirfuncs_1.dirfuncs.delFile(visualText_1.visualText.regressionTestFile());
            visualText_1.visualText.runTest(vscode.Uri.file(textFilePath));
            visualText_1.visualText.closeTest();
            vscode.window.showTextDocument(vscode.Uri.file(visualText_1.visualText.regressionTestFile()));
            vscode.commands.executeCommand('kbView.refreshAll');
        }
    }
    addTest(outputItem) {
        let hasTestFile = true;
        const parent = path.basename(path.dirname(outputItem.uri.fsPath));
        const textName = parent.substring(0, parent.length - 4);
        const testFolder = visualText_1.visualText.analyzer.testFolder(outputItem.uri, true);
        if (!fs.existsSync(testFolder.fsPath)) {
            this.testDirectory = testFolder;
            dirfuncs_1.dirfuncs.makeDir(testFolder.fsPath);
            hasTestFile = false;
        }
        const testFilePath = vscode.Uri.file(path.join(testFolder.fsPath, path.basename(outputItem.uri.fsPath)));
        if (!hasTestFile || !fs.existsSync(outputItem.uri.fsPath)) {
            visualText_1.visualText.fileOps.addFileOperation(outputItem.uri, testFilePath, [fileOps_1.fileOpRefresh.OUTPUT, fileOps_1.fileOpRefresh.TEXT], fileOps_1.fileOperation.COPY);
            visualText_1.visualText.fileOps.startFileOps();
        }
        else {
            const items = [];
            items.push({ label: 'Yes', description: 'Overwrite the current test file?' });
            items.push({ label: 'No', description: 'Do not overwrite' });
            vscode.window.showQuickPick(items, { title: 'Add Test File', placeHolder: 'Choose response' }).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                visualText_1.visualText.fileOps.addFileOperation(outputItem.uri, testFilePath, [fileOps_1.fileOpRefresh.OUTPUT, fileOps_1.fileOpRefresh.TEXT], fileOps_1.fileOperation.COPY);
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    video() {
        const url = 'http://vscodeoutviewer.visualtext.org';
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
    }
    explore() {
        const dir = visualText_1.visualText.analyzer.getOutputDirectory();
        visualText_1.visualText.openFileManager(dir.fsPath);
    }
    deleteOrphans() {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const files = [];
            const nlpFiles = dirfuncs_1.dirfuncs.getFiles(visualText_1.visualText.analyzer.getSpecDirectory(), ['.pat', '.nlp']);
            for (const nlpFile of nlpFiles) {
                if (visualText_1.visualText.analyzer.seqFile.isOrphan(path.basename(nlpFile.fsPath, '.nlp')) == true &&
                    visualText_1.visualText.analyzer.seqFile.isOrphan(path.basename(nlpFile.fsPath, '.pat')) == true) {
                    files.push(nlpFile);
                }
            }
            const count = files.length;
            const items = [];
            items.push({ label: 'Yes', description: 'Delete all orphan passes' });
            items.push({ label: 'No', description: 'Do not delete file' });
            vscode.window.showQuickPick(items, { title: 'Delete Orphan Files', placeHolder: 'Delete all ' + count.toString() + ' file(s)' }).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                for (const file of files) {
                    visualText_1.visualText.fileOps.addFileOperation(file, file, [fileOps_1.fileOpRefresh.OUTPUT], fileOps_1.fileOperation.DELETE);
                }
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    setType(type) {
        this.type = type;
    }
    getType() {
        return this.type;
    }
    loadAll() {
        this.clearOutput(outputFileType.ALL);
    }
    loadTxxt() {
        this.clearOutput(outputFileType.TXXT);
    }
    loadTrees() {
        this.clearOutput(outputFileType.TREE);
    }
    loadKB() {
        this.clearOutput(outputFileType.KB);
    }
    loadOrphans() {
        this.clearOutput(outputFileType.NLP);
    }
    clearOutput(type) {
        this.type = type;
        this.outputFiles = [];
        vscode.commands.executeCommand('outputView.refreshAll');
    }
    fileHasLog(filepath) {
        this.logDirectory = vscode.Uri.file('');
        if (filepath.length == 0)
            return false;
        this.logDirectory = vscode.Uri.file(filepath + visualText_1.visualText.LOG_SUFFIX);
        if (!fs.existsSync(this.logDirectory.fsPath))
            return false;
        const stats = fs.lstatSync(this.logDirectory.fsPath);
        if (!stats)
            return false;
        return stats.isDirectory();
    }
    fileHasTest(filepath) {
        this.testDirectory = vscode.Uri.file('');
        if (filepath.length == 0)
            return false;
        this.logDirectory = vscode.Uri.file(filepath + visualText_1.visualText.TEST_SUFFIX);
        if (!fs.existsSync(this.testDirectory.fsPath))
            return false;
        const stats = fs.lstatSync(this.testDirectory.fsPath);
        if (!stats)
            return false;
        return stats.isDirectory();
    }
    getOutputFiles() {
        this.outputFiles = [];
        if (visualText_1.visualText.analyzer.hasText()) {
            if (this.type == outputFileType.KB) {
                this.outputFiles = dirfuncs_1.dirfuncs.getFiles(visualText_1.visualText.analyzer.getAnalyzerDirectory('kb'), ['.kb']);
                const kbFiles = dirfuncs_1.dirfuncs.getFiles(visualText_1.visualText.analyzer.getOutputDirectory(), ['.kbb']);
                this.outputFiles = this.outputFiles.concat(kbFiles);
            }
            else if (this.type == outputFileType.NLP) {
                const nlpFiles = dirfuncs_1.dirfuncs.getFiles(visualText_1.visualText.analyzer.getSpecDirectory(), ['.pat', '.nlp']);
                for (const nlpFile of nlpFiles) {
                    if (visualText_1.visualText.analyzer.seqFile.isOrphan(path.basename(nlpFile.fsPath, '.nlp')) == true &&
                        visualText_1.visualText.analyzer.seqFile.isOrphan(path.basename(nlpFile.fsPath, '.pat')) == true) {
                        this.outputFiles.push(nlpFile);
                    }
                }
            }
            else if (this.type == outputFileType.TXXT) {
                const matchFiles = dirfuncs_1.dirfuncs.getFiles(this.logDirectory, ['.txxt']);
                this.outputFiles = this.outputFiles.concat(matchFiles);
            }
            else if (this.type == outputFileType.TREE) {
                const finalTree = vscode.Uri.file(path.join(this.logDirectory.fsPath, 'final.tree'));
                if (fs.existsSync(finalTree.fsPath)) {
                    this.outputFiles.push(finalTree);
                }
                const matchFiles = dirfuncs_1.dirfuncs.getFiles(this.logDirectory, ['.tree']);
                this.outputFiles = this.outputFiles.concat(matchFiles);
            }
            else {
                const textPath = visualText_1.visualText.analyzer.getTextPath().fsPath;
                this.outputFiles = [];
                if (textPath.length && this.fileHasLog(textPath)) {
                    const finalTree = vscode.Uri.file(path.join(this.logDirectory.fsPath, 'final.tree'));
                    if (fs.existsSync(finalTree.fsPath)) {
                        this.outputFiles.push(finalTree);
                    }
                    const candidates = dirfuncs_1.dirfuncs.getFiles(this.logDirectory);
                    for (const cand of candidates) {
                        const ext = path.parse(cand.fsPath).ext;
                        if (ext.localeCompare('.tree') != 0 && ext.localeCompare('.txxt') != 0)
                            this.outputFiles.push(cand);
                    }
                }
            }
        }
        return this.outputFiles;
    }
    openFile(resource) {
        const textFile = new textFile_1.TextFile(resource.fsPath);
        textFile.cleanZeroZero();
        visualText_1.visualText.colorizeAnalyzer();
        vscode.window.showTextDocument(resource);
    }
    deleteOutput(resource) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const items = [];
            let deleteDescr = '';
            deleteDescr = deleteDescr.concat('Delete \'', path.basename(resource.uri.fsPath), '\'');
            items.push({ label: 'Yes', description: deleteDescr });
            items.push({ label: 'No', description: 'Do not delete file' });
            vscode.window.showQuickPick(items, { title: 'Delete File', placeHolder: 'Select Yes or No?' }).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                visualText_1.visualText.fileOps.addFileOperation(resource.uri, resource.uri, [fileOps_1.fileOpRefresh.OUTPUT], fileOps_1.fileOperation.DELETE);
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    copytoKB(outputItem) {
        const kbDir = visualText_1.visualText.analyzer.anaSubDirPath(analyzer_1.anaSubDir.KB);
        this.copyFileToAnalyzer(outputItem.uri, kbDir, 'Copy file to another analyzer', 'Copy file to the KB directory of:');
    }
    copytoText(outputItem) {
        const out = visualText_1.visualText.analyzer.anaSubDirPath(analyzer_1.anaSubDir.INPUT);
        this.copyFileToAnalyzer(outputItem.uri, out, 'Copy file to another analyzer', 'Copy file to input directory of:');
    }
    copyFileToAnalyzer(uri, subdir, title, placeHolder) {
        if (visualText_1.visualText.getWorkspaceFolder()) {
            const items = visualText_1.visualText.analyzerFolderList();
            vscode.window.showQuickPick(items, { title, canPickMany: false, placeHolder: placeHolder }).then(selection => {
                if (!selection || !selection.description)
                    return;
                if (selection.description.startsWith('(FOLDER')) {
                    vscode.window.showWarningMessage('You must select an analyzer directory not a folder');
                    return;
                }
                const newFile = vscode.Uri.file(path.join(selection.description, subdir, path.basename(uri.fsPath)));
                visualText_1.visualText.fileOps.addFileOperation(uri, newFile, [fileOps_1.fileOpRefresh.KB, fileOps_1.fileOpRefresh.TEXT], fileOps_1.fileOperation.COPY);
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
}
exports.OutputView = OutputView;
//# sourceMappingURL=outputView.js.map