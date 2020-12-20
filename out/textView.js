"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextView = exports.textView = exports.FileSystemProvider = void 0;
const tslib_1 = require("tslib");
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const visualText_1 = require("./visualText");
const nlp_1 = require("./nlp");
const findFile_1 = require("./findFile");
const findView_1 = require("./findView");
const outputView_1 = require("./outputView");
const dirfuncs_1 = require("./dirfuncs");
class FileSystemProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getChildren(entry) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (entry) {
                return this.getKeepers(entry.uri);
            }
            if (visualText_1.visualText.hasWorkspaceFolder() && visualText_1.visualText.hasAnalyzers() && visualText_1.visualText.analyzer.isLoaded()) {
                return this.getKeepers(visualText_1.visualText.analyzer.getInputDirectory());
            }
            return [];
        });
    }
    getTreeItem(entry) {
        const treeItem = new vscode.TreeItem(entry.uri, entry.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        if (entry.type === vscode.FileType.File) {
            treeItem.command = { command: 'textView.openFile', title: "Open File", arguments: [entry], };
            treeItem.contextValue = 'file';
            var isLogDir = outputView_1.outputView.fileHasLog(entry.uri.path);
            treeItem.iconPath = {
                light: isLogDir ? path.join(__filename, '..', '..', 'resources', 'dark', 'document.svg') :
                    path.join(__filename, '..', '..', 'resources', 'light', 'file.svg'),
                dark: isLogDir ? path.join(__filename, '..', '..', 'resources', 'dark', 'document.svg') :
                    path.join(__filename, '..', '..', 'resources', 'dark', 'file.svg'),
            };
        }
        return treeItem;
    }
    getKeepers(dir) {
        var keepers = Array();
        var entries = dirfuncs_1.dirfuncs.getDirectoryTypes(dir);
        for (let entry of entries) {
            if (!(entry.type == vscode.FileType.Directory && outputView_1.outputView.directoryIsLog(entry.uri.path))) {
                keepers.push(entry);
            }
        }
        return keepers;
    }
    existingText(entry) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const options = {
                canSelectMany: false,
                openLabel: 'Add Existing File',
                defaultUri: visualText_1.visualText.getWorkspaceFolder(),
                canSelectFiles: true,
                canSelectFolders: true,
                filters: {
                    'Text files': ['txt', 'xml', 'html', 'cvs'],
                    'All files': ['*']
                }
            };
            vscode.window.showOpenDialog(options).then(selection => {
                if (!selection) {
                    return;
                }
                var oldPath = selection[0].path;
                var filename = path.basename(oldPath);
                var dir = visualText_1.visualText.analyzer.getInputDirectory().path;
                if (entry) {
                    dir = path.dirname(entry.uri.path);
                }
                else if (visualText_1.visualText.analyzer.getTextPath()) {
                    var textPath = visualText_1.visualText.analyzer.getTextPath().path;
                    if (textPath.length)
                        dir = path.dirname(textPath);
                }
                var newPath = path.join(dir, filename);
                fs.copyFileSync(oldPath, newPath);
                this.refresh();
            });
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
        vscode.commands.registerCommand('textView.existingText', (entry) => treeDataProvider.existingText(entry));
        vscode.commands.registerCommand('textView.openFile', (entry) => this.openFile(entry));
        vscode.commands.registerCommand('textView.analyzeLast', () => this.analyzeLast());
        vscode.commands.registerCommand('textView.analyze', (entry) => this.analyze(entry));
        vscode.commands.registerCommand('textView.openText', () => this.openText());
        vscode.commands.registerCommand('textView.search', () => this.search());
        vscode.commands.registerCommand('textView.newText', (entry) => this.newText(entry));
        vscode.commands.registerCommand('textView.newDir', (entry) => this.newDir(entry));
        vscode.commands.registerCommand('textView.deleteText', (entry) => this.deleteText(entry));
        vscode.commands.registerCommand('textView.updateTitle', (entry) => this.updateTitle(entry));
    }
    static attach(ctx) {
        if (!exports.textView) {
            exports.textView = new TextView(ctx);
        }
        return exports.textView;
    }
    analyzeLast() {
        if (visualText_1.visualText.analyzer.hasText()) {
            var textUri = visualText_1.visualText.analyzer.getTextPath();
            this.openFile({ uri: textUri, type: vscode.FileType.File });
            var nlp = new nlp_1.NLPFile();
            nlp.analyze(textUri);
        }
    }
    analyze(entry) {
        if (entry.uri.path.length) {
            this.openFile(entry);
            var nlp = new nlp_1.NLPFile();
            nlp.analyze(entry.uri);
        }
    }
    search() {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            if (visualText_1.visualText.hasWorkspaceFolder()) {
                vscode.window.showInputBox({ value: 'searchword', prompt: 'Enter term to search' }).then(searchWord => {
                    if (searchWord) {
                        this.findFile.searchFiles(visualText_1.visualText.analyzer.getInputDirectory(), searchWord, '.txt');
                        findView_1.findView.loadFinds(searchWord, this.findFile.getMatches());
                        vscode.commands.executeCommand('findView.refreshAll');
                        vscode.commands.executeCommand('findView.updateTitle');
                    }
                });
            }
        }
    }
    openText() {
        if (visualText_1.visualText.analyzer.hasText())
            vscode.window.showTextDocument(visualText_1.visualText.analyzer.getTextPath());
        vscode.commands.executeCommand('status.update');
    }
    updateTitle(resource) {
        var filepath = resource.path;
        if (resource && filepath.length) {
            var filename = path.basename(resource.path);
            if (filename.length) {
                this.textView.title = `TEXT (${filename})`;
                return;
            }
        }
        this.textView.title = 'TEXT';
    }
    openFile(entry) {
        this.updateTitle(entry.uri);
        vscode.window.showTextDocument(entry.uri);
        visualText_1.visualText.analyzer.saveCurrentFile(entry.uri);
        vscode.commands.executeCommand('outputView.refreshAll');
        vscode.commands.executeCommand('status.update');
    }
    deleteText(entry) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            let items = [];
            var deleteDescr = '';
            var filename = path.basename(entry.uri.path);
            deleteDescr = deleteDescr.concat('Delete \'', filename, '\'?');
            items.push({ label: 'Yes', description: deleteDescr });
            items.push({ label: 'No', description: 'Do not delete ' + filename });
            vscode.window.showQuickPick(items).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                var path = entry.uri.path;
                if (dirfuncs_1.dirfuncs.isDir(path))
                    dirfuncs_1.dirfuncs.delDir(path);
                else
                    dirfuncs_1.dirfuncs.delFile(path);
                vscode.commands.executeCommand('textView.refreshAll');
            });
        }
    }
    newDir(entry) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: 'dirname', prompt: 'Enter directory name' }).then(newdir => {
                if (newdir) {
                    var dirPath = visualText_1.visualText.analyzer.getInputDirectory().path;
                    if (entry)
                        dirPath = dirfuncs_1.dirfuncs.getDirPath(entry.uri.path);
                    dirPath = path.join(dirPath, newdir);
                    dirfuncs_1.dirfuncs.makeDir(dirPath);
                    vscode.commands.executeCommand('textView.refreshAll');
                }
            });
        }
    }
    newText(entry) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: 'filename', prompt: 'Enter text file name' }).then(newname => {
                if (newname) {
                    var dirPath = visualText_1.visualText.analyzer.getInputDirectory().path;
                    if (entry)
                        dirPath = dirfuncs_1.dirfuncs.getDirPath(entry.uri.path);
                    var filepath = path.join(dirPath, newname + '.txt');
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