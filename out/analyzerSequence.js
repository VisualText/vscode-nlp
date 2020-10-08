"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyzerSequence = exports.FileSystemProvider = exports.SequenceLine = exports.FileStat = void 0;
const tslib_1 = require("tslib");
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const rimraf = require("rimraf");
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
var moveDirection;
(function (moveDirection) {
    moveDirection[moveDirection["Up"] = 0] = "Up";
    moveDirection[moveDirection["Down"] = 1] = "Down";
})(moveDirection || (moveDirection = {}));
var seqType;
(function (seqType) {
    seqType[seqType["nlp"] = 0] = "nlp";
    seqType[seqType["stub"] = 1] = "stub";
})(seqType || (seqType = {}));
class SequenceLine {
    constructor(line = '') {
        this.line = '';
        this.type = seqType.nlp;
        this.tokens = new Array();
        this.basename = '';
        this.Set(line);
    }
    Set(line) {
        this.line = line;
        if (line.length)
            this.tokens = line.split(/[\t\s]/);
        else
            this.tokens = [];
    }
    CleanLine(line) {
        var cleanstr = '';
        for (var i = 0; i < this.tokens.length; i++) {
            if (i == 0)
                cleanstr = this.tokens[i];
            else if (i < 3)
                cleanstr = cleanstr.concat('\t', this.tokens[i]);
            else
                cleanstr = cleanstr.concat(' ', this.tokens[i]);
        }
        return cleanstr;
    }
    IsValid() {
        if (this.tokens.length) {
            if (this.tokens.length >= 2 && this.tokens[0].localeCompare('#'))
                return true;
        }
        return false;
    }
    IsRuleFile() {
        if (this.tokens.length) {
            if (this.tokens[0].localeCompare('pat') == 0 ||
                this.tokens[0].localeCompare('rec') == 0 ||
                this.tokens[0].localeCompare('nlp') == 0)
                return true;
        }
        return false;
    }
    FileName() {
        return this.tokens[1].concat('.pat');
    }
    GetType() {
        return this.type;
    }
    GetTypeName() {
        return this.tokens[0];
    }
    GetName() {
        if (this.tokens[0].localeCompare('tokenize') == 0)
            return this.tokens[0];
        return this.tokens[1];
    }
    GetStubName() {
        if (this.tokens[0].localeCompare('tokenize') == 0)
            return this.tokens[0];
        else if (this.tokens[0].localeCompare('stub') == 0)
            return this.tokens[1];
        else if (this.tokens[0].localeCompare('end') == 0)
            return this.tokens[0].concat('_', this.tokens[1]);
        return this.tokens[1];
    }
    GetTypeFromFile(filename) {
        this.type = seqType.nlp;
        this.basename = path.basename(filename, '.nlp');
        this.basename = path.basename(this.basename, '.pat');
        var basenamestub = path.basename(filename, '.stub');
        if (basenamestub.length < this.basename.length) {
            this.type = seqType.stub;
            this.basename = basenamestub;
            return seqType.stub;
        }
        return seqType.nlp;
    }
    GetBasename() {
        return this.basename;
    }
}
exports.SequenceLine = SequenceLine;
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
            if (vscode.workspace.workspaceFolders) {
                const workspaceFolder = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];
                if (workspaceFolder) {
                    const specUri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, 'spec'));
                    const children = yield this.readDirectory(specUri);
                    children.sort((a, b) => {
                        if (a[1] === b[1]) {
                            return a[0].localeCompare(b[0]);
                        }
                        return a[1] === vscode.FileType.Directory ? -1 : 1;
                    });
                    const chittlins = children.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(specUri.fsPath, name)), type }));
                    const patsOnly = chittlins.filter(item => item.uri.fsPath.endsWith('.pat') || item.uri.fsPath.endsWith('.nlp'));
                    const orderedArray = new Array();
                    var lines = fs.readFileSync(path.join(specUri.fsPath, 'analyzer.seq'), 'utf8').split('\n');
                    var seqLine = new SequenceLine();
                    for (let line of lines) {
                        seqLine.Set(line);
                        if (seqLine.IsValid()) {
                            if (seqLine.IsRuleFile()) {
                                var found = patsOnly.filter(item => item.uri.fsPath.endsWith(seqLine.FileName()));
                                if (found.length)
                                    orderedArray.push({ uri: found[0].uri, type: 1 });
                                else
                                    orderedArray.push({ uri: vscode.Uri.file(seqLine.FileName()), type: 1 });
                            }
                            else {
                                orderedArray.push({ uri: vscode.Uri.file(seqLine.GetStubName().concat('.stub')), type: 1 });
                            }
                        }
                    }
                    return orderedArray;
                }
            }
            return [];
        });
    }
    getTreeItem(element) {
        const treeItem = new vscode.TreeItem(element.uri, element.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        if (element.type === vscode.FileType.File) {
            treeItem.command = { command: 'analyzerSequence.openFile', title: 'Open File', arguments: [element.uri], };
            treeItem.contextValue = 'file';
        }
        return treeItem;
    }
    moveUp(resource) {
        this.moveSequence(resource, moveDirection.Up);
    }
    moveDown(resource) {
        this.moveSequence(resource, moveDirection.Down);
    }
    moveSequence(resource, direction) {
        if (vscode.workspace.workspaceFolders) {
            const workspacefolder = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];
            if (workspacefolder) {
                var seqLine = new SequenceLine();
                var seqFileType = seqLine.GetTypeFromFile(resource.uri.path);
                var basename = seqLine.GetBasename();
                var newlines = new Array();
                var cleanlines = new Array();
                var specfilename = path.join(workspacefolder.uri.fsPath, 'spec', 'analyzer.seq');
                var analyzeFile = vscode.Uri.file(specfilename);
                var lines = fs.readFileSync(analyzeFile.path, 'utf8').split('\n');
                for (let line of lines) {
                    seqLine.Set(line);
                    if (seqLine.IsValid()) {
                        cleanlines.push(seqLine.CleanLine(line));
                    }
                }
                var row = -1;
                var r = 0;
                for (let line of lines) {
                    seqLine.Set(line);
                    if (basename.localeCompare(seqLine.GetName()) == 0) {
                        row = r;
                        break;
                    }
                    r++;
                }
                // Build new file
                if (row == 0) {
                    vscode.window.showWarningMessage('Tokenize must be first');
                }
                else if (row == 1 && direction == moveDirection.Up) {
                    vscode.window.showWarningMessage('Cannot move into the first position');
                }
                else if (row >= 1 && row + 1 < cleanlines.length) {
                    for (var i = 0; i < cleanlines.length; i++) {
                        if ((direction == moveDirection.Up && i + 1 == row) || (direction == moveDirection.Down && i == row)) {
                            newlines.push(cleanlines[i + 1]);
                            newlines.push(cleanlines[i]);
                            i++;
                        }
                        else if (cleanlines[i].length)
                            newlines.push(cleanlines[i]);
                    }
                    // Make file from lines
                    var newcontent = '';
                    for (var i = 0; i < newlines.length; i++) {
                        if (i > 0)
                            newcontent = newcontent.concat('\n');
                        newcontent = newcontent.concat(newlines[i]);
                    }
                    fs.writeFileSync(specfilename, newcontent, { flag: 'w+' });
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
    }
}
exports.FileSystemProvider = FileSystemProvider;
class AnalyzerSequence {
    constructor(context) {
        this.basename = '';
        this.outfolder = '';
        this.inputFile = '';
        this.highlightFile = '';
        this.firedFroms = new Array();
        this.firedTos = new Array();
        const treeDataProvider = new FileSystemProvider();
        this.analyzerSequence = vscode.window.createTreeView('analyzerSequence', { treeDataProvider });
        vscode.commands.registerCommand('analyzerSequence.openFile', (resource) => this.openResource(resource));
        vscode.commands.registerCommand('analyzerSequence.moveUp', (resource) => treeDataProvider.moveUp(resource));
        vscode.commands.registerCommand('analyzerSequence.moveDown', (resource) => treeDataProvider.moveDown(resource));
        vscode.commands.registerCommand('analyzerSequence.refreshEntry', () => treeDataProvider.refresh());
    }
    openResource(resource) {
        if (resource.path.localeCompare('/stub') == 0 || resource.path.localeCompare('/end') == 0 || resource.path.localeCompare('/tokenize') == 0) {
            vscode.window.showWarningMessage('Not editable');
            return;
        }
        this.workspacefolder = vscode.workspace.getWorkspaceFolder(resource);
        if (this.workspacefolder) {
            this.outfolder = path.join(this.workspacefolder.uri.fsPath, 'output');
            if (fs.existsSync(this.outfolder)) {
                const firefile = this.findLogfile(resource);
                vscode.window.showTextDocument(firefile);
            }
        }
    }
    fileCreateTime(filepath) {
        if (fs.existsSync(filepath)) {
            var stats = fs.statSync(filepath);
            if (stats)
                return stats.ctime;
        }
        return new Date(1970, 1, 1);
    }
    fileGroup(logfile) {
        this.basename = path.basename(logfile.path, '.log');
        this.highlightFile = path.join(this.outfolder, this.basename + '.txxt');
        this.inputFile = path.join(this.outfolder, 'input.txt');
    }
    writeFiredText(logfile) {
        this.fileGroup(logfile);
        var logDate = this.fileCreateTime(logfile.path);
        var inputDate = this.fileCreateTime(this.inputFile);
        if (inputDate < logDate && fs.existsSync(this.highlightFile))
            return vscode.Uri.file(this.highlightFile);
        else if (!fs.existsSync(this.inputFile))
            return logfile;
        var text = fs.readFileSync(this.inputFile, 'utf8');
        const regReplace = new RegExp('\r\n', 'g');
        text = text.replace(regReplace, '\r');
        var textfire = '';
        var lastTo = 0;
        var between = '';
        var highlight = '';
        var from = 0;
        var to = 0;
        if (this.firedFroms.length) {
            for (var i = 0; i < this.firedFroms.length; i++) {
                from = this.firedFroms[i];
                to = this.firedTos[i];
                between = text.substring(lastTo, from);
                highlight = text.substring(from, to + 1);
                textfire = textfire.concat(between, '[[', highlight, ']]');
                lastTo = to + 1;
                between = '';
            }
            textfire = textfire.concat(text.substring(lastTo, text.length));
        }
        else {
            textfire = text;
        }
        fs.writeFileSync(this.highlightFile, textfire, { flag: 'w+' });
        this.firedFroms = [];
        this.firedTos = [];
        const regBack = new RegExp('\r', 'g');
        text = text.replace(regBack, '\r\n');
        return vscode.Uri.file(this.highlightFile);
    }
    findLogfile(resource) {
        var logfile = vscode.Uri.file('');
        var firefile = vscode.Uri.file('');
        const filenames = fs.readdirSync(this.outfolder);
        const restoks = path.basename(resource.path).split('.');
        const baser = restoks[0];
        var arrayLength = filenames.length;
        var re = new RegExp('\\w+', 'g');
        var refire = new RegExp('[\[,\]', 'g');
        for (var i = 0; i < arrayLength; i++) {
            var filename = filenames[i];
            if (filename.endsWith('.log')) {
                var lines = fs.readFileSync(path.join(this.outfolder, filename), 'utf8').split('\n');
                var l = 0;
                var found = false;
                var from = 0;
                var to = 0;
                for (let line of lines) {
                    if (found) {
                        var tokens = line.split(',fired');
                        if (tokens.length > 1) {
                            var tts = line.split(refire);
                            if (+tts[2] > to) {
                                from = +tts[1];
                                to = +tts[2];
                                this.firedFroms.push(from);
                                this.firedTos.push(to);
                            }
                        }
                    }
                    else if (l++ == 2) {
                        var toks = line.match(re);
                        if (toks) {
                            var base = path.basename(resource.path, '.pat');
                            if (baser.localeCompare(toks[2]) == 0) {
                                logfile = vscode.Uri.file(path.join(this.outfolder, filename));
                                found = true;
                            }
                        }
                        else {
                            return vscode.Uri.file(path.join(this.outfolder, 'final.log'));
                        }
                    }
                }
                if (found) {
                    return this.writeFiredText(logfile);
                }
            }
        }
        return logfile;
    }
}
exports.AnalyzerSequence = AnalyzerSequence;
//# sourceMappingURL=analyzerSequence.js.map