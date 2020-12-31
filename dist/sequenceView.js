"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SequenceView = exports.sequenceView = exports.PassTree = void 0;
const tslib_1 = require("tslib");
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const visualText_1 = require("./visualText");
const sequence_1 = require("./sequence");
const textFile_1 = require("./textFile");
const logfile_1 = require("./logfile");
const findFile_1 = require("./findFile");
const findView_1 = require("./findView");
const dirfuncs_1 = require("./dirfuncs");
class PassTree {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh(seqItem) {
        this._onDidChangeTreeData.fire(seqItem);
    }
    getChildren(seqItem) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            var seqFile = visualText_1.visualText.analyzer.seqFile;
            if (seqItem) {
                return this.getPasses(seqFile.getFolderPasses(seqItem.type, seqItem.name));
            }
            if (visualText_1.visualText.hasWorkspaceFolder() && visualText_1.visualText.hasAnalyzers()) {
                seqFile.init();
                return this.getPasses(seqFile.getPasses());
            }
            return [];
        });
    }
    getPasses(passes) {
        var folder = '';
        const seqItems = new Array();
        const logFile = new logfile_1.LogFile();
        const textFile = new textFile_1.TextFile();
        var collapse = vscode.TreeItemCollapsibleState.None;
        var order = 0;
        for (let passItem of passes) {
            var label = passItem.passNum.toString() + ' ' + passItem.name;
            if (passItem.isFolder()) {
                folder = passItem.name;
                label = passItem.name;
                seqItems.push({ label: label, name: passItem.name, tooltip: passItem.uri.path, contextValue: 'folder', inFolder: passItem.inFolder,
                    type: passItem.typeStr, passNum: passItem.passNum, order: order, collapsibleState: vscode.TreeItemCollapsibleState.Collapsed });
            }
            else if (folder.length) {
                if (passItem.isEnd(folder))
                    folder = '';
            }
            else if (passItem.isRuleFile()) {
                var logPath = logFile.anaFile(passItem.passNum, textFile_1.nlpFileType.TREE);
                var hasLog = fs.existsSync(logPath.path) ? true : false;
                var conVal = '';
                if (logFile.hasLogFileType(passItem.uri, passItem.passNum, textFile_1.nlpFileType.TREE))
                    conVal = 'hasLog';
                if (logFile.hasLogFileType(passItem.uri, passItem.passNum, textFile_1.nlpFileType.KBB))
                    conVal = conVal + 'hasKB';
                if (conVal.length == 0)
                    conVal = 'file';
                if (passItem.fileExists())
                    seqItems.push({ uri: passItem.uri, label: label, name: passItem.name, tooltip: passItem.uri.path, contextValue: conVal,
                        inFolder: passItem.inFolder, type: passItem.typeStr, passNum: passItem.passNum, order: order, collapsibleState: collapse });
                else
                    seqItems.push({ label: label, name: passItem.name, tooltip: 'MISSING', contextValue: 'missing', inFolder: passItem.inFolder,
                        type: 'missing', passNum: passItem.passNum, order: order, collapsibleState: collapse });
            }
            else {
                if (passItem.typeStr.localeCompare('tokenize') == 0)
                    label = '1 tokenize';
                else if (passItem.typeStr.localeCompare('dicttokz') == 0)
                    label = '1 dicttokz';
                else
                    label = passItem.name;
                seqItems.push({ label: label, name: passItem.name, tooltip: passItem.uri.path, contextValue: 'stub', inFolder: passItem.inFolder,
                    type: passItem.typeStr, passNum: passItem.passNum, order: order, collapsibleState: collapse });
            }
            order++;
        }
        return seqItems;
    }
    getTreeItem(seqItem) {
        var icon = 'dna.svg';
        var active = true;
        var collapse = vscode.TreeItemCollapsibleState.None;
        if (seqItem.type[0] == '/') {
            active = false;
        }
        else if (seqItem.type.localeCompare('rec') == 0) {
            icon = 'dnar.svg';
        }
        else if (seqItem.type.localeCompare('folder') == 0) {
            icon = 'folder.svg';
            collapse = vscode.TreeItemCollapsibleState.Collapsed;
        }
        else if (seqItem.type.localeCompare('pat')) {
            icon = 'seq-circle.svg';
        }
        if (!active) {
            return {
                resourceUri: seqItem.uri,
                label: seqItem.label,
                contextValue: seqItem.contextValue,
                collapsibleState: collapse,
                command: {
                    command: 'sequenceView.openFile',
                    arguments: [seqItem],
                    title: 'Open Pass'
                }
            };
        }
        else {
            return {
                resourceUri: seqItem.uri,
                label: seqItem.label,
                contextValue: seqItem.contextValue,
                collapsibleState: collapse,
                iconPath: {
                    light: path.join(__filename, '..', '..', 'resources', 'light', icon),
                    dark: path.join(__filename, '..', '..', 'resources', 'dark', icon)
                },
                command: {
                    command: 'sequenceView.openFile',
                    arguments: [seqItem],
                    title: 'Open Pass'
                }
            };
        }
    }
    moveUp(seqItem) {
        this.moveSequence(seqItem, sequence_1.moveDirection.UP);
    }
    moveDown(seqItem) {
        this.moveSequence(seqItem, sequence_1.moveDirection.DOWN);
    }
    moveSequence(seqItem, direction) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            var seqFile = visualText_1.visualText.analyzer.seqFile;
            var passItem = seqFile.findPass(seqItem.type, seqItem.name);
            var order = passItem.order;
            if (seqItem.type.localeCompare('tokenize') == 0 || seqItem.type.localeCompare('dicttokz') == 0) {
                vscode.window.showWarningMessage('Cannot move the tokenizer');
            }
            else if (order == 1 && direction == sequence_1.moveDirection.UP) {
                vscode.window.showWarningMessage('Tokenizer must be first');
            }
            else if (order == 0 && direction == sequence_1.moveDirection.UP) {
                vscode.window.showWarningMessage('Item cannot move up');
            }
            else if (seqItem.type.localeCompare('folder') == 0 && direction == sequence_1.moveDirection.DOWN && seqFile.atBottom(passItem)) {
                vscode.window.showWarningMessage('Item cannot move down');
            }
            else if (order + 1 == seqFile.passCount() && direction == sequence_1.moveDirection.DOWN) {
                vscode.window.showWarningMessage('Item cannot move down');
            }
            else {
                seqFile.movePass(seqItem, direction);
                seqFile.saveFile();
                this.refresh(seqItem);
            }
        }
    }
    deletePass(seqItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            var seqFile = visualText_1.visualText.analyzer.seqFile;
            let items = [];
            var deleteDescr = '';
            deleteDescr = deleteDescr.concat('Delete \'', seqItem.name, '\' pass');
            items.push({ label: 'Yes', description: deleteDescr });
            items.push({ label: 'No', description: 'Do not delete pass' });
            vscode.window.showQuickPick(items).then(selection => {
                if (seqItem.type.localeCompare('missing') == 0) {
                    seqFile.deletePassInSeqFile(seqItem.type, seqItem.name);
                }
                else {
                    if (!selection || selection.label == 'No')
                        return;
                    seqFile.deletePass(seqItem);
                    this.refresh(seqItem);
                }
                vscode.commands.executeCommand('sequenceView.refreshAll');
            });
        }
    }
    insertLibraryPass(seqItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            var seqFile = visualText_1.visualText.analyzer.seqFile;
            const options = {
                canSelectMany: false,
                openLabel: 'Open',
                defaultUri: seqFile.getLibraryDirectory(),
                canSelectFiles: true,
                canSelectFolders: true,
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
                seqFile.insertPass(seqItem, newfile);
                this.refresh(seqItem);
            });
        }
    }
    insertPass(seqItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            var seqFile = visualText_1.visualText.analyzer.seqFile;
            const options = {
                canSelectMany: false,
                openLabel: 'Open',
                defaultUri: seqFile.getSpecDirectory(),
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
                seqFile.insertPass(seqItem, newfile);
                this.refresh(seqItem);
            });
        }
    }
    insertNewPass(seqItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            var seqFile = visualText_1.visualText.analyzer.seqFile;
            vscode.window.showInputBox({ value: 'newpass', prompt: 'Enter new pass name' }).then(newname => {
                if (newname) {
                    if (seqItem && (seqItem.uri || seqFile.getPasses().length > 1))
                        seqFile.insertNewPass(seqItem, newname);
                    else
                        seqFile.insertNewPassEnd(newname);
                    this.refresh(seqItem);
                }
            });
        }
    }
    renamePass(seqItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            var seqFile = visualText_1.visualText.analyzer.seqFile;
            vscode.window.showInputBox({ value: seqItem.name, prompt: 'Enter new name for pass' }).then(newname => {
                var original = seqItem.uri;
                if (newname) {
                    seqFile.renamePass(seqItem, newname);
                    if (seqItem.type.localeCompare('pat') == 0 || seqItem.type.localeCompare('rec') == 0) {
                        var newfile = vscode.Uri.file(path.join(seqFile.getSpecDirectory().path, newname.concat(path.extname(original.path))));
                        dirfuncs_1.dirfuncs.renameFile(original.path, newfile.path);
                    }
                    this.refresh(seqItem);
                }
            });
        }
    }
    newFolder(seqItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            var seqFile = visualText_1.visualText.analyzer.seqFile;
            vscode.window.showInputBox({ value: 'newpass', prompt: 'Enter new folder name' }).then(newname => {
                if (newname) {
                    if (seqItem && seqItem.uri)
                        seqFile.insertNewFolder(seqItem, newname);
                    else
                        seqFile.insertNewFolderEnd(newname);
                    this.refresh(seqItem);
                }
            });
        }
    }
    typePat(seqItem) {
        visualText_1.visualText.analyzer.seqFile.saveType(seqItem.passNum, 'pat');
        this.refresh(seqItem);
    }
    typeRec(seqItem) {
        visualText_1.visualText.analyzer.seqFile.saveType(seqItem.passNum, 'rec');
        this.refresh(seqItem);
    }
    typeOn(seqItem) {
        visualText_1.visualText.analyzer.seqFile.saveActive(seqItem.passNum, '');
        this.refresh(seqItem);
    }
    typeOff(seqItem) {
        visualText_1.visualText.analyzer.seqFile.saveActive(seqItem.passNum, '/');
        this.refresh(seqItem);
    }
}
exports.PassTree = PassTree;
class SequenceView {
    constructor(context) {
        this.textFile = new textFile_1.TextFile();
        this.logFile = new logfile_1.LogFile();
        this.findFile = new findFile_1.FindFile();
        const treeDataProvider = new PassTree();
        this.sequenceView = vscode.window.createTreeView('sequenceView', { treeDataProvider });
        vscode.commands.registerCommand('sequenceView.openFile', (seqItem) => this.openNLP(seqItem));
        vscode.commands.registerCommand('sequenceView.openTree', (seqItem) => this.openTree(seqItem));
        vscode.commands.registerCommand('sequenceView.openHighlight', (seqItem) => this.openHighlight(seqItem));
        vscode.commands.registerCommand('sequenceView.openKB', (seqItem) => this.openKB(seqItem));
        vscode.commands.registerCommand('sequenceView.search', () => this.search());
        vscode.commands.registerCommand('sequenceView.finalTree', () => this.finalTree());
        vscode.commands.registerCommand('sequenceView.moveUp', (seqItem) => treeDataProvider.moveUp(seqItem));
        vscode.commands.registerCommand('sequenceView.moveDown', (seqItem) => treeDataProvider.moveDown(seqItem));
        vscode.commands.registerCommand('sequenceView.refreshAll', (seqItem) => treeDataProvider.refresh(seqItem));
        vscode.commands.registerCommand('sequenceView.insert', (seqItem) => treeDataProvider.insertPass(seqItem));
        vscode.commands.registerCommand('sequenceView.insertNew', (seqItem) => treeDataProvider.insertNewPass(seqItem));
        vscode.commands.registerCommand('sequenceView.insertLibrary', (seqItem) => treeDataProvider.insertLibraryPass(seqItem));
        vscode.commands.registerCommand('sequenceView.delete', (seqItem) => treeDataProvider.deletePass(seqItem));
        vscode.commands.registerCommand('sequenceView.rename', (seqItem) => treeDataProvider.renamePass(seqItem));
        vscode.commands.registerCommand('sequenceView.typePat', (seqItem) => treeDataProvider.typePat(seqItem));
        vscode.commands.registerCommand('sequenceView.typeRec', (seqItem) => treeDataProvider.typeRec(seqItem));
        vscode.commands.registerCommand('sequenceView.typeOff', (seqItem) => treeDataProvider.typeOff(seqItem));
        vscode.commands.registerCommand('sequenceView.typeOn', (seqItem) => treeDataProvider.typeOn(seqItem));
        vscode.commands.registerCommand('sequenceView.newFolder', (seqItem) => treeDataProvider.newFolder(seqItem));
    }
    static attach(ctx) {
        if (!exports.sequenceView) {
            exports.sequenceView = new SequenceView(ctx);
        }
        return exports.sequenceView;
    }
    finalTree() {
        var dir = visualText_1.visualText.analyzer.getOutputDirectory();
        var finalLog = path.join(dir.path, 'final.log');
        if (fs.existsSync(finalLog)) {
            vscode.window.showTextDocument(vscode.Uri.file(finalLog));
        }
        else {
            vscode.window.showInformationMessage('No final tree foud');
        }
    }
    search(word = '') {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            if (word.length == 0) {
                vscode.window.showInputBox({ value: 'searchword', prompt: 'Enter term to search' }).then(searchWord => {
                    if (searchWord === null || searchWord === void 0 ? void 0 : searchWord.length)
                        this.findWord(searchWord);
                });
            }
            else {
                this.findWord(word);
            }
        }
    }
    findWord(word) {
        if (word.length) {
            this.findFile.searchFiles(visualText_1.visualText.analyzer.getSpecDirectory(), word, '.pat');
            findView_1.findView.loadFinds(word, this.findFile.getMatches());
            vscode.commands.executeCommand('findView.refreshAll');
            vscode.commands.executeCommand('findView.updateTitle');
        }
    }
    notMissing(seqItem) {
        if (seqItem.type.localeCompare('missing') == 0) {
            vscode.window.showInformationMessage('File is missing: ' + seqItem.name);
            return false;
        }
        return true;
    }
    openNLP(seqItem) {
        if (this.notMissing(seqItem) && seqItem.type.localeCompare('folder') && seqItem.type.localeCompare('stub')) {
            this.textFile.setFile(seqItem.uri);
            if (!this.textFile.isFileType(textFile_1.nlpFileType.NLP)) {
                vscode.window.showWarningMessage('Not editable');
                return;
            }
            visualText_1.visualText.analyzer.saveCurrentPass(seqItem.uri, seqItem.passNum);
            vscode.window.showTextDocument(seqItem.uri);
        }
    }
    openTree(seqItem) {
        if (this.notMissing(seqItem)) {
            this.textFile.setFile(seqItem.uri);
            if (!this.textFile.isFileType(textFile_1.nlpFileType.NLP)) {
                vscode.window.showWarningMessage('Not editable');
                return;
            }
            if (fs.existsSync(visualText_1.visualText.analyzer.getOutputDirectory().path)) {
                var logfile = this.logFile.anaFile(seqItem.passNum, textFile_1.nlpFileType.TREE);
                if (fs.existsSync(logfile.path))
                    vscode.window.showTextDocument(logfile);
                else
                    vscode.window.showWarningMessage('No tree file ' + path.basename(logfile.path));
            }
        }
    }
    openHighlight(seqItem) {
        if (this.notMissing(seqItem)) {
            this.textFile.setFile(seqItem.uri);
            if (!this.textFile.isFileType(textFile_1.nlpFileType.NLP)) {
                vscode.window.showWarningMessage('Not editable');
                return;
            }
            if (fs.existsSync(visualText_1.visualText.analyzer.getOutputDirectory().path)) {
                var firefile = this.logFile.firedFile(seqItem.passNum);
                if (fs.existsSync(firefile.path))
                    vscode.window.showTextDocument(firefile);
                else
                    vscode.window.showWarningMessage('No highlight file with this pass');
            }
        }
    }
    openKB(seqItem) {
        if (this.notMissing(seqItem)) {
            this.textFile.setFile(seqItem.uri);
            if (!this.textFile.isFileType(textFile_1.nlpFileType.NLP)) {
                vscode.window.showWarningMessage('Not editable');
                return;
            }
            if (fs.existsSync(visualText_1.visualText.analyzer.getOutputDirectory().path)) {
                var kbfile = this.logFile.anaFile(seqItem.passNum, textFile_1.nlpFileType.KBB);
                if (fs.existsSync(kbfile.path))
                    vscode.window.showTextDocument(kbfile);
                else
                    vscode.window.showWarningMessage('No KB file for this pass');
            }
        }
    }
}
exports.SequenceView = SequenceView;
//# sourceMappingURL=sequenceView.js.map