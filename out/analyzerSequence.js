"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyzerSequence = exports.analyzerSequence = exports.FileSystemProvider = exports.FileStat = void 0;
const tslib_1 = require("tslib");
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const rimraf = require("rimraf");
const sequence_1 = require("./sequence");
const logfile_1 = require("./logfile");
//#region Utilities
var _;
(function (_) {
    function handleResult(resolve, reject, error, result) {
        if (error) {
            reject(massageError(error));
        }
        else {
            resolve(result);
        }
    }
    function massageError(error) {
        if (error.code === 'ENOENT') {
            return vscode.FileSystemError.FileNotFound();
        }
        if (error.code === 'EISDIR') {
            return vscode.FileSystemError.FileIsADirectory();
        }
        if (error.code === 'EEXIST') {
            return vscode.FileSystemError.FileExists();
        }
        if (error.code === 'EPERM' || error.code === 'EACCESS') {
            return vscode.FileSystemError.NoPermissions();
        }
        return error;
    }
    function checkCancellation(token) {
        if (token.isCancellationRequested) {
            throw new Error('Operation cancelled');
        }
    }
    _.checkCancellation = checkCancellation;
    function normalizeNFC(items) {
        if (process.platform !== 'darwin') {
            return items;
        }
        if (Array.isArray(items)) {
            return items.map(item => item.normalize('NFC'));
        }
        return items.normalize('NFC');
    }
    _.normalizeNFC = normalizeNFC;
    function readdir(path) {
        return new Promise((resolve, reject) => {
            fs.readdir(path, (error, children) => handleResult(resolve, reject, error, normalizeNFC(children)));
        });
    }
    _.readdir = readdir;
    function stat(path) {
        return new Promise((resolve, reject) => {
            fs.stat(path, (error, stat) => handleResult(resolve, reject, error, stat));
        });
    }
    _.stat = stat;
    function readfile(path) {
        return new Promise((resolve, reject) => {
            fs.readFile(path, (error, buffer) => handleResult(resolve, reject, error, buffer));
        });
    }
    _.readfile = readfile;
    function writefile(path, content) {
        return new Promise((resolve, reject) => {
            fs.writeFile(path, content, error => handleResult(resolve, reject, error, void 0));
        });
    }
    _.writefile = writefile;
    function exists(path) {
        return new Promise((resolve, reject) => {
            fs.exists(path, exists => handleResult(resolve, reject, null, exists));
        });
    }
    _.exists = exists;
    function rmrf(path) {
        return new Promise((resolve, reject) => {
            rimraf(path, error => handleResult(resolve, reject, error, void 0));
        });
    }
    _.rmrf = rmrf;
    function mkdir(path) {
        return new Promise((resolve, reject) => {
            //mkdirp(path, error => handleResult(resolve, reject, error, void 0));
        });
    }
    _.mkdir = mkdir;
    function rename(oldPath, newPath) {
        return new Promise((resolve, reject) => {
            fs.rename(oldPath, newPath, error => handleResult(resolve, reject, error, void 0));
        });
    }
    _.rename = rename;
    function unlink(path) {
        return new Promise((resolve, reject) => {
            fs.unlink(path, error => handleResult(resolve, reject, error, void 0));
        });
    }
    _.unlink = unlink;
})(_ || (_ = {}));
class FileStat {
    constructor(fsStat) {
        this.fsStat = fsStat;
    }
    get type() {
        return this.fsStat.isFile() ? vscode.FileType.File : this.fsStat.isDirectory() ? vscode.FileType.Directory : this.fsStat.isSymbolicLink() ? vscode.FileType.SymbolicLink : vscode.FileType.Unknown;
    }
    get isFile() {
        return this.fsStat.isFile();
    }
    get isDirectory() {
        return this.fsStat.isDirectory();
    }
    get isSymbolicLink() {
        return this.fsStat.isSymbolicLink();
    }
    get size() {
        return this.fsStat.size;
    }
    get ctime() {
        return this.fsStat.ctime.getTime();
    }
    get mtime() {
        return this.fsStat.mtime.getTime();
    }
}
exports.FileStat = FileStat;
//#endregion
class FileSystemProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this._onDidChangeFile = new vscode.EventEmitter();
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    get onDidChangeFile() {
        return this._onDidChangeFile.event;
    }
    watch(uri, options) {
        const watcher = fs.watch(uri.fsPath, { recursive: options.recursive }, (event, filename) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const filepath = path.join(uri.fsPath, _.normalizeNFC(filename.toString()));
            // TODO support excludes (using minimatch library?)
            this._onDidChangeFile.fire([{
                    type: event === 'change' ? vscode.FileChangeType.Changed : (yield _.exists(filepath)) ? vscode.FileChangeType.Created : vscode.FileChangeType.Deleted,
                    uri: uri.with({ path: filepath })
                }]);
        }));
        return { dispose: () => watcher.close() };
    }
    stat(uri) {
        return this._stat(uri.fsPath);
    }
    _stat(path) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return new FileStat(yield _.stat(path));
        });
    }
    readDirectory(uri) {
        return this._readDirectory(uri);
    }
    _readDirectory(uri) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const children = yield _.readdir(uri.fsPath);
            const result = [];
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                const stat = yield this._stat(path.join(uri.fsPath, child));
                result.push([child, stat.type]);
            }
            return Promise.resolve(result);
        });
    }
    createDirectory(uri) {
        return _.mkdir(uri.fsPath);
    }
    readFile(uri) {
        return _.readfile(uri.fsPath);
    }
    writeFile(uri, content, options) {
        return this._writeFile(uri, content, options);
    }
    _writeFile(uri, content, options) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const exists = yield _.exists(uri.fsPath);
            if (!exists) {
                if (!options.create) {
                    throw vscode.FileSystemError.FileNotFound();
                }
                yield _.mkdir(path.dirname(uri.fsPath));
            }
            else {
                if (!options.overwrite) {
                    throw vscode.FileSystemError.FileExists();
                }
            }
            return _.writefile(uri.fsPath, content);
        });
    }
    delete(uri, options) {
        if (options.recursive) {
            return _.rmrf(uri.fsPath);
        }
        return _.unlink(uri.fsPath);
    }
    rename(oldUri, newUri, options) {
        return this._rename(oldUri, newUri, options);
    }
    _rename(oldUri, newUri, options) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const exists = yield _.exists(newUri.fsPath);
            if (exists) {
                if (!options.overwrite) {
                    throw vscode.FileSystemError.FileExists();
                }
                else {
                    yield _.rmrf(newUri.fsPath);
                }
            }
            const parentExists = yield _.exists(path.dirname(newUri.fsPath));
            if (!parentExists) {
                yield _.mkdir(path.dirname(newUri.fsPath));
            }
            return _.rename(oldUri.fsPath, newUri.fsPath);
        });
    }
    // tree data provider
    getChildren(element) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (element) {
                const children = yield this.readDirectory(element.uri);
                return children.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(element.uri.fsPath, name)), type }));
            }
            var seqFile = new sequence_1.SequenceFile();
            if (seqFile.HasWorkingDirectory()) {
                const children = yield this.readDirectory(seqFile.GetSpecFolder());
                children.sort((a, b) => {
                    if (a[1] === b[1]) {
                        return a[0].localeCompare(b[0]);
                    }
                    return a[1] === vscode.FileType.Directory ? -1 : 1;
                });
                const chittlins = children.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(seqFile.GetSpecFolder().fsPath, name)), type }));
                const patsOnly = chittlins.filter(item => item.uri.fsPath.endsWith('.pat') || item.uri.fsPath.endsWith('.nlp'));
                const orderedArray = new Array();
                for (let pass of seqFile.GetPasses()) {
                    seqFile.SetPass(pass);
                    if (seqFile.IsValid()) {
                        if (seqFile.IsRuleFile()) {
                            var found = patsOnly.filter(item => item.uri.fsPath.endsWith(seqFile.FileName()));
                            if (found.length)
                                orderedArray.push({ uri: found[0].uri, type: 1 });
                            else
                                orderedArray.push({ uri: vscode.Uri.file(seqFile.FileName()), type: 1 });
                        }
                        else {
                            orderedArray.push({ uri: vscode.Uri.file(seqFile.GetStubName().concat('.stub')), type: 1 });
                        }
                    }
                }
                return orderedArray;
            }
            return [];
        });
    }
    getTreeItem(element) {
        const treeItem = new vscode.TreeItem(element.uri, element.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        if (element.type === vscode.FileType.File) {
            treeItem.command = { command: 'analyzerSequence.openFile', title: 'Open File', arguments: [element], };
            treeItem.contextValue = 'file';
        }
        return treeItem;
    }
    moveUp(resource) {
        this.moveSequence(resource, sequence_1.moveDirection.UP);
    }
    moveDown(resource) {
        this.moveSequence(resource, sequence_1.moveDirection.DOWN);
    }
    moveSequence(resource, direction) {
        var seqFile = new sequence_1.SequenceFile();
        if (seqFile.HasWorkingDirectory()) {
            seqFile.SetFile(resource.uri.path);
            var basename = seqFile.GetBasename();
            var row = seqFile.FindPass(basename);
            // Build new file
            if (row == 0) {
                vscode.window.showWarningMessage('Tokenize must be first');
            }
            else if (row == 1 && direction == sequence_1.moveDirection.UP) {
                vscode.window.showWarningMessage('Cannot move into the first position');
            }
            else if (row >= 1 && row + 1 < seqFile.GetPasses().length) {
                seqFile.MovePass(direction, row);
                seqFile.SaveFile();
                this.refresh();
            }
            else if (row == -1) {
                vscode.window.showWarningMessage('Item cannot move up');
            }
            else {
                vscode.window.showWarningMessage('Item cannot move down');
            }
        }
    }
    deletePass(resource) {
        var seqFile = new sequence_1.SequenceFile();
        if (seqFile.HasWorkingDirectory()) {
            let items = [];
            var deleteDescr = '';
            deleteDescr = deleteDescr.concat('Delete \'', path.basename(resource.uri.path), '\' pass');
            items.push({ label: 'Yes', description: deleteDescr });
            items.push({ label: 'No', description: 'Do not delete pass' });
            vscode.window.showQuickPick(items).then(selection => {
                seqFile.SetFile(resource.uri.path);
                if (!selection) {
                    return;
                }
                if (selection.label.localeCompare('Yes') == 0) {
                    seqFile.DeletePass(resource.uri);
                    this.refresh();
                }
            });
        }
    }
    insertPass(resource) {
        var seqFile = new sequence_1.SequenceFile();
        if (seqFile.HasWorkingDirectory()) {
            const options = {
                canSelectMany: false,
                openLabel: 'Open',
                defaultUri: seqFile.GetSpecFolder(),
                filters: {
                    'Text files': ['pat', 'nlp'],
                    'All files': ['*']
                }
            };
            vscode.window.showOpenDialog(options).then(selection => {
                if (!selection) {
                    return;
                }
                var newfile = vscode.Uri.file(selection[0].path);
                seqFile.InsertPass(resource.uri, newfile);
                this.refresh();
            });
        }
    }
    insertNewPass(resource) {
        var seqFile = new sequence_1.SequenceFile();
        if (seqFile.HasWorkingDirectory()) {
            vscode.window.showInputBox({ value: 'newpass' }).then(newname => {
                var original = resource.uri;
                if (newname) {
                    seqFile.InsertNewPass(resource.uri, newname);
                    this.refresh();
                }
            });
        }
    }
    renamePass(resource) {
        var seqFile = new sequence_1.SequenceFile();
        if (seqFile.HasWorkingDirectory()) {
            var basename = path.basename(resource.uri.path, '.pat');
            vscode.window.showInputBox({ value: basename }).then(newname => {
                var original = resource.uri;
                if (newname) {
                    seqFile.RenamePass(basename, newname);
                    var newfile = vscode.Uri.file(path.join(seqFile.GetSpecFolder().path, newname.concat(path.extname(original.path))));
                    this.rename(original, newfile, { overwrite: false });
                    this.refresh();
                }
            });
        }
    }
}
exports.FileSystemProvider = FileSystemProvider;
class AnalyzerSequence {
    constructor(context) {
        this.seqFile = new sequence_1.SequenceFile();
        this.logFile = new logfile_1.LogFile();
        const treeDataProvider = new FileSystemProvider();
        this.analyzerSequence = vscode.window.createTreeView('analyzerSequence', { treeDataProvider });
        vscode.commands.registerCommand('analyzerSequence.openFile', (resource) => this.openNLP(resource));
        vscode.commands.registerCommand('analyzerSequence.openTree', (resource) => this.openTree(resource));
        vscode.commands.registerCommand('analyzerSequence.openHighlight', (resource) => this.openHighlight(resource));
        vscode.commands.registerCommand('analyzerSequence.openKB', (resource) => this.openKB(resource));
        vscode.commands.registerCommand('analyzerSequence.moveUp', (resource) => treeDataProvider.moveUp(resource));
        vscode.commands.registerCommand('analyzerSequence.moveDown', (resource) => treeDataProvider.moveDown(resource));
        vscode.commands.registerCommand('analyzerSequence.refreshEntry', () => treeDataProvider.refresh());
        vscode.commands.registerCommand('analyzerSequence.insert', (resource) => treeDataProvider.insertPass(resource));
        vscode.commands.registerCommand('analyzerSequence.insertNew', (resource) => treeDataProvider.insertNewPass(resource));
        vscode.commands.registerCommand('analyzerSequence.delete', (resource) => treeDataProvider.deletePass(resource));
        vscode.commands.registerCommand('analyzerSequence.rename', (resource) => treeDataProvider.renamePass(resource));
    }
    static attach(ctx) {
        if (!exports.analyzerSequence) {
            exports.analyzerSequence = new AnalyzerSequence(ctx);
        }
        return exports.analyzerSequence;
    }
    openNLP(resource) {
        this.seqFile.SetFile(resource.uri.path);
        if (!this.seqFile.IsRuleFile()) {
            vscode.window.showWarningMessage('Not editable');
            return;
        }
        vscode.window.showTextDocument(resource.uri);
    }
    openTree(resource) {
        this.seqFile.SetFile(resource.uri.path);
        if (!this.seqFile.IsRuleFile()) {
            vscode.window.showWarningMessage('Not editable');
            return;
        }
        this.workspacefolder = vscode.workspace.getWorkspaceFolder(resource.uri);
        if (this.workspacefolder) {
            this.logFile.setOutputFolder(path.join(this.workspacefolder.uri.fsPath, 'output'));
            if (fs.existsSync(this.logFile.getOutputFolder())) {
                var logfile = this.logFile.findLogfile(resource.uri, sequence_1.nlpFileType.LOG);
                if (logfile)
                    vscode.window.showTextDocument(logfile);
                else
                    vscode.window.showTextDocument(resource.uri);
            }
        }
    }
    openHighlight(resource) {
        this.seqFile.SetFile(resource.uri.path);
        if (!this.seqFile.IsRuleFile()) {
            vscode.window.showWarningMessage('Not editable');
            return;
        }
        this.workspacefolder = vscode.workspace.getWorkspaceFolder(resource.uri);
        if (this.workspacefolder) {
            this.logFile.setOutputFolder(path.join(this.workspacefolder.uri.fsPath, 'output'));
            if (fs.existsSync(this.logFile.getOutputFolder())) {
                var firefile = this.logFile.findLogfile(resource.uri, sequence_1.nlpFileType.TXXT);
                if (firefile)
                    vscode.window.showTextDocument(firefile);
                else
                    vscode.window.showTextDocument(resource.uri);
            }
        }
    }
    openKB(resource) {
        this.seqFile.SetFile(resource.uri.path);
        if (!this.seqFile.IsRuleFile()) {
            vscode.window.showWarningMessage('Not editable');
            return;
        }
        this.workspacefolder = vscode.workspace.getWorkspaceFolder(resource.uri);
        if (this.workspacefolder) {
            this.logFile.setOutputFolder(path.join(this.workspacefolder.uri.fsPath, 'output'));
            if (fs.existsSync(this.logFile.getOutputFolder())) {
                var kbfile = this.logFile.findLogfile(resource.uri, sequence_1.nlpFileType.KB);
                if (fs.existsSync(kbfile.path))
                    vscode.window.showTextDocument(kbfile);
                else
                    vscode.window.showWarningMessage('No KB file for this pass');
            }
        }
    }
}
exports.AnalyzerSequence = AnalyzerSequence;
//# sourceMappingURL=analyzerSequence.js.map