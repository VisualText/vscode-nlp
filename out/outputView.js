"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutputView = exports.outputView = exports.OutputTreeDataProvider = exports.outputFileType = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const visualText_1 = require("./visualText");
const logView_1 = require("./logView");
const textFile_1 = require("./textFile");
const dirfuncs_1 = require("./dirfuncs");
var outputFileType;
(function (outputFileType) {
    outputFileType[outputFileType["TXT"] = 0] = "TXT";
    outputFileType[outputFileType["KB"] = 1] = "KB";
    outputFileType[outputFileType["NLP"] = 2] = "NLP";
})(outputFileType = exports.outputFileType || (exports.outputFileType = {}));
class OutputTreeDataProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return {
            resourceUri: element.uri,
            collapsibleState: void 0,
            command: {
                command: 'outputView.openFile',
                arguments: [element.uri],
                title: 'Open Output File'
            }
        };
    }
    getChildren(element) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const children = new Array();
            for (let folder of exports.outputView.getOutputFiles()) {
                children.push({ uri: folder });
            }
            return children;
        }
        return [];
    }
    addKB() {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            var seqFile = visualText_1.visualText.analyzer.seqFile;
            const options = {
                canSelectMany: false,
                openLabel: 'Add KB File',
                defaultUri: visualText_1.visualText.getWorkspaceFolder(),
                canSelectFiles: true,
                canSelectFolders: true,
                filters: {
                    'Text files': ['kb'],
                    'All files': ['*']
                }
            };
            vscode.window.showOpenDialog(options).then(selection => {
                if (!selection) {
                    return;
                }
                var oldPath = selection[0].path;
                var filename = path.basename(oldPath);
                var dir = visualText_1.visualText.analyzer.getAnalyzerDirectory('kb').path;
                var newPath = path.join(dir, filename);
                fs.copyFileSync(oldPath, newPath);
                exports.outputView.setType(outputFileType.KB);
                logView_1.logView.addMessage('KB File copied: ' + filename, vscode.Uri.file(oldPath));
                vscode.commands.executeCommand('logView.refreshAll');
                this.refresh();
            });
        }
    }
}
exports.OutputTreeDataProvider = OutputTreeDataProvider;
class OutputView {
    constructor(context) {
        const outputViewProvider = new OutputTreeDataProvider();
        this.outputView = vscode.window.createTreeView('outputView', { treeDataProvider: outputViewProvider });
        vscode.commands.registerCommand('outputView.refreshAll', () => outputViewProvider.refresh());
        vscode.commands.registerCommand('outputView.addKB', () => outputViewProvider.addKB());
        vscode.commands.registerCommand('outputView.deleteOutput', (resource) => this.deleteOutput(resource));
        vscode.commands.registerCommand('outputView.openFile', (resource) => this.openFile(resource));
        vscode.commands.registerCommand('outputView.kb', () => this.loadKB());
        vscode.commands.registerCommand('outputView.txt', () => this.loadTxt());
        vscode.commands.registerCommand('outputView.orphanPasses', () => this.loadOrphans());
        this.outputFiles = [];
        this.logDirectory = vscode.Uri.file('');
        this.type = outputFileType.TXT;
    }
    static attach(ctx) {
        if (!exports.outputView) {
            exports.outputView = new OutputView(ctx);
        }
        return exports.outputView;
    }
    setType(type) {
        this.type = type;
    }
    getType() {
        return this.type;
    }
    loadTxt() {
        this.clearOutput(outputFileType.TXT);
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
    directoryIsLog(path) {
        if (!path.endsWith('_log'))
            return false;
        const filepath = path.substr(0, path.length - 4);
        var stats = fs.lstatSync(filepath);
        if (!stats)
            return false;
        return stats.isFile();
    }
    fileHasLog(path) {
        this.logDirectory = vscode.Uri.file('');
        if (path.length == 0)
            return false;
        this.logDirectory = vscode.Uri.file(path + '_log');
        if (!fs.existsSync(this.logDirectory.path))
            return false;
        var stats = fs.lstatSync(this.logDirectory.path);
        if (!stats)
            return false;
        return stats.isDirectory();
    }
    getOutputFiles() {
        this.outputFiles = [];
        if (visualText_1.visualText.analyzer.hasText()) {
            if (this.type == outputFileType.KB) {
                this.outputFiles = dirfuncs_1.dirfuncs.getFiles(visualText_1.visualText.analyzer.getAnalyzerDirectory('kb'), ['.kb'], true);
                var kbFiles = dirfuncs_1.dirfuncs.getFiles(visualText_1.visualText.analyzer.getOutputDirectory(), ['.kbb'], true);
                this.outputFiles = this.outputFiles.concat(kbFiles);
            }
            else if (this.type == outputFileType.NLP) {
                var nlpFiles = dirfuncs_1.dirfuncs.getFiles(visualText_1.visualText.analyzer.getSpecDirectory(), ['.pat', '.nlp'], true);
                for (let nlpFile of nlpFiles) {
                    if (visualText_1.visualText.analyzer.seqFile.isOrphan(path.basename(nlpFile.path, '.pat')) == true) {
                        this.outputFiles.push(nlpFile);
                    }
                }
            }
            else {
                var textPath = visualText_1.visualText.analyzer.getTextPath().path;
                this.outputFiles = [];
                if (textPath.length && this.fileHasLog(textPath)) {
                    var candidates = dirfuncs_1.dirfuncs.getFiles(this.logDirectory, ['.txt', '.log']);
                    for (let cand of candidates) {
                        let base = path.basename(cand.path);
                        if (!base.startsWith('ana'))
                            this.outputFiles.push(cand);
                    }
                }
                else {
                    dirfuncs_1.dirfuncs.delDir(visualText_1.visualText.analyzer.getOutputDirectory().path);
                }
            }
        }
        return this.outputFiles;
    }
    openFile(resource) {
        var textFile = new textFile_1.TextFile(resource.path);
        textFile.cleanZeroZero();
        vscode.window.showTextDocument(resource);
    }
    deleteOutput(resource) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            let items = [];
            var deleteDescr = '';
            deleteDescr = deleteDescr.concat('Delete \'', path.basename(resource.uri.path), '\' analzyer');
            items.push({ label: 'Yes', description: deleteDescr });
            items.push({ label: 'No', description: 'Do not delete pass' });
            vscode.window.showQuickPick(items).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                if (!dirfuncs_1.dirfuncs.delFile(resource.uri.path)) {
                    vscode.window.showWarningMessage('Could not delete file: ' + resource.uri.path);
                }
                else
                    vscode.commands.executeCommand('outputView.refreshAll');
            });
        }
    }
    addKB(resource) {
        console.log('New Output code to be implemented');
    }
}
exports.OutputView = OutputView;
//# sourceMappingURL=outputView.js.map