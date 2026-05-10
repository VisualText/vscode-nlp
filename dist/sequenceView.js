"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SequenceView = exports.sequenceView = exports.PassTree = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const path = tslib_1.__importStar(require("path"));
const fs = tslib_1.__importStar(require("fs"));
const visualText_1 = require("./visualText");
const sequence_1 = require("./sequence");
const textFile_1 = require("./textFile");
const nlp_1 = require("./nlp");
const treeFile_1 = require("./treeFile");
const findFile_1 = require("./findFile");
const fileOps_1 = require("./fileOps");
const findView_1 = require("./findView");
const analyzerView_1 = require("./analyzerView");
const dirfuncs_1 = require("./dirfuncs");
const logView_1 = require("./logView");
const sequence_2 = require("./sequence");
const analyzer_1 = require("./analyzer");
class PassTree {
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    getChildren(seqItem) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const seqFile = visualText_1.visualText.analyzer.seqFile;
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
        const len = passes.length;
        const seqItems = new Array();
        if (len == 0)
            return seqItems;
        const seqFile = visualText_1.visualText.analyzer.seqFile;
        const treeFile = new treeFile_1.TreeFile();
        const collapse = vscode.TreeItemCollapsibleState.None;
        const openingFolder = seqFile.inFolder(passes[0]);
        const hasPat = dirfuncs_1.dirfuncs.getFiles(visualText_1.visualText.analyzer.getSpecDirectory(), ['.pat']).length ? true : false;
        vscode.commands.executeCommand('setContext', 'sequence.hasPat', hasPat);
        let pnum = 0;
        let row = 0;
        let tooltip = '';
        const debugConVal = false;
        for (const passItem of passes) {
            let label = passItem.passNum.toString() + ' ' + passItem.name;
            row = passItem.row;
            let conVal = '';
            const inFolder = seqFile.inFolder(passItem);
            if (pnum > 1 || inFolder)
                conVal = conVal + 'mvup';
            if (pnum < len - 1 || inFolder)
                conVal = conVal + 'mvdown';
            if (inFolder)
                conVal = conVal + 'inside';
            else
                conVal = conVal + 'outside';
            pnum++;
            if (seqFile.hasSisterFile(passItem.name)) {
                conVal = conVal + 'sister';
            }
            if (passItem.library.fsPath.length > 2) {
                conVal = conVal + 'library';
            }
            if (passItem.isEnd(passItem.name) || (inFolder && !openingFolder)) {
                const donothing = true;
            }
            else if (passItem.isFolder()) {
                conVal = conVal + 'foldernotok';
                label = passItem.name;
                if (debugConVal)
                    label = row.toString() + ' ' + conVal;
                const passes = seqFile.getFolderPasses(passItem.typeStr, passItem.name);
                let oneActive = false;
                for (const pass of passes) {
                    if (pass.active) {
                        oneActive = true;
                        break;
                    }
                }
                if (!oneActive)
                    passItem.active = false;
                seqItems.push({
                    uri: passItem.uri, label: label, name: passItem.name, tooltip: passItem.uri.fsPath, contextValue: conVal, inFolder: passItem.inFolder,
                    type: passItem.typeStr, passNum: passItem.passNum, library: passItem.library, row: row,
                    collapsibleState: vscode.TreeItemCollapsibleState.Collapsed, active: passItem.active
                });
            }
            else if (passItem.isEnd(passItem.name)) {
                const donothing = true;
            }
            else if (passItem.isRuleFile()) {
                conVal = conVal + 'filenotok';
                if (treeFile.hasFileType(passItem.uri, passItem.passNum, textFile_1.nlpFileType.TREE))
                    conVal = conVal + 'hasLog';
                if (treeFile.hasFileType(passItem.uri, passItem.passNum, textFile_1.nlpFileType.KBB))
                    conVal = conVal + 'hasKB';
                if (debugConVal)
                    label = row.toString() + ' ' + conVal;
                tooltip = row.toString() + ' ' + tooltip;
                if (passItem.fileExists())
                    seqItems.push({
                        uri: passItem.uri, label: label, name: passItem.name, tooltip: passItem.uri.fsPath, contextValue: conVal,
                        inFolder: passItem.inFolder, type: passItem.typeStr, passNum: passItem.passNum, library: passItem.library, row: row,
                        collapsibleState: collapse, active: passItem.active
                    });
                else
                    seqItems.push({
                        uri: passItem.uri, label: label, name: passItem.name, tooltip: 'MISSING', contextValue: 'missing', inFolder: passItem.inFolder,
                        type: 'missing', passNum: passItem.passNum, library: passItem.library, row: row,
                        collapsibleState: collapse, active: passItem.active
                    });
            }
            else {
                tooltip = passItem.uri.fsPath;
                if (passItem.tokenizer) {
                    label = '1 ' + passItem.typeStr;
                    tooltip = passItem.fetchTooltip();
                    conVal = conVal + 'tokenize' + 'hasLog';
                    conVal = conVal.replace('mvdown', '');
                }
                else {
                    label = passItem.name;
                    conVal = conVal + 'stub';
                }
                if (debugConVal)
                    label = row.toString() + ' ' + conVal;
                seqItems.push({
                    uri: passItem.uri, label: label, name: passItem.name, tooltip: tooltip, contextValue: conVal, inFolder: passItem.inFolder,
                    type: passItem.typeStr, passNum: passItem.passNum, library: passItem.library, row: row,
                    collapsibleState: collapse, active: passItem.active
                });
            }
        }
        const specDir = visualText_1.visualText.analyzer.getSpecDirectory();
        const anaName = visualText_1.visualText.getCurrentAnalyzerName();
        if (hasPat && analyzerView_1.analyzerView.converting == false && anaName.length) {
            const button = "Convert to .nlp";
            vscode.window.showInformationMessage("Analyzer " + anaName + " sequence has .pat extensions", button).then(response => {
                if (button === response) {
                    analyzerView_1.analyzerView.converting = true;
                    if (analyzerView_1.analyzerView.chosen)
                        visualText_1.visualText.convertPatFiles(analyzerView_1.analyzerView.chosen);
                }
            });
        }
        return seqItems;
    }
    getTreeItem(seqItem) {
        let icon = seqItem.active ? 'dna.svg' : 'dna-grayed.svg';
        let collapse = vscode.TreeItemCollapsibleState.None;
        if (seqItem.library.fsPath.length > 2) {
            icon = seqItem.active ? 'dna-lib.svg' : 'dna-lib-grayed.svg';
        }
        else if (seqItem.type.localeCompare('rec') == 0) {
            icon = seqItem.active ? 'dnar.svg' : 'dnar-grayed.svg';
        }
        else if (seqItem.type.localeCompare('folder') == 0) {
            icon = seqItem.active ? 'folder.svg' : 'folder-inactive.svg';
            collapse = vscode.TreeItemCollapsibleState.Collapsed;
        }
        else if (seqItem.type.localeCompare('nlp')) {
            icon = 'seq-circle.svg';
        }
        return {
            resourceUri: seqItem.uri,
            tooltip: seqItem.tooltip,
            label: seqItem.label,
            contextValue: seqItem.contextValue,
            collapsibleState: collapse,
            iconPath: {
                light: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'light', icon)),
                dark: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'dark', icon))
            },
            command: {
                command: 'sequenceView.openPass',
                arguments: [seqItem],
                title: 'Open Pass'
            }
        };
    }
    moveUp(seqItem) {
        this.moveSequence(seqItem, sequence_1.moveDirection.UP);
    }
    moveDown(seqItem) {
        this.moveSequence(seqItem, sequence_1.moveDirection.DOWN);
    }
    moveSequence(seqItem, direction) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const seqFile = visualText_1.visualText.analyzer.seqFile;
            const passItem = seqFile.findPass(seqItem.type, seqItem.name);
            const row = passItem.row;
            if (seqItem.type.localeCompare('tokenize') == 0 || seqItem.type.localeCompare('dicttokz') == 0 || seqItem.type.localeCompare('chartok') == 0) {
                vscode.window.showWarningMessage('Cannot move the tokenizer');
            }
            else if (row == 1 && direction == sequence_1.moveDirection.UP) {
                vscode.window.showWarningMessage('Tokenizer must be first');
            }
            else if (row == 0 && direction == sequence_1.moveDirection.UP) {
                vscode.window.showWarningMessage('Item cannot move up');
            }
            else if (seqItem.type.localeCompare('folder') == 0 && direction == sequence_1.moveDirection.DOWN && seqFile.atBottom(passItem)) {
                vscode.window.showWarningMessage('Item cannot move down');
            }
            else if (row + 1 == seqFile.passCount() && direction == sequence_1.moveDirection.DOWN) {
                vscode.window.showWarningMessage('Item cannot move down');
            }
            else {
                seqFile.movePass(seqItem, direction);
                seqFile.saveFile();
                vscode.commands.executeCommand('sequenceView.refreshAll');
            }
        }
    }
    deleteFolder(seqItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const seqFile = visualText_1.visualText.analyzer.seqFile;
            const items = [];
            items.push({ label: 'DELETE FOLDER', description: 'Delete ' + seqItem.name + ' Folder and ALL ITS PASSES' });
            items.push({ label: 'Delete folder only', description: 'Delete ' + seqItem.name + ' Folder ONLY and keep all the passes' });
            items.push({ label: 'Abort', description: 'Do not delete folder' });
            vscode.window.showQuickPick(items, { title: 'Delete Folder', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
                if (seqItem.type.localeCompare('missing') == 0) {
                    seqFile.deletePassInSeqFile(seqItem.type, seqItem.name);
                }
                else {
                    if (!selection || selection.label == 'Abort')
                        return;
                    else if (selection.label == 'Delete folder only') {
                        const item = seqFile.findPass(seqItem.type, seqItem.name);
                        seqFile.deleteFolder(item, true);
                    }
                    else
                        seqFile.deletePass(seqItem);
                    seqFile.saveFile();
                }
                vscode.commands.executeCommand('sequenceView.refreshAll');
            });
        }
    }
    deletePass(seqItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const seqFile = visualText_1.visualText.analyzer.seqFile;
            const items = [];
            let deleteDescr = '';
            deleteDescr = deleteDescr.concat('Delete \'', seqItem.name, '\' pass');
            items.push({ label: 'Yes', description: deleteDescr });
            items.push({ label: 'No', description: 'Do not delete pass' });
            vscode.window.showQuickPick(items, { title: 'Delete File', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
                if (seqItem.type.localeCompare('missing') == 0) {
                    seqFile.deletePassInSeqFile(seqItem.type, seqItem.name);
                }
                else {
                    if (!selection || selection.label == 'No')
                        return;
                    seqFile.deletePass(seqItem);
                    this.refresh();
                }
                vscode.commands.executeCommand('sequenceView.refreshAll');
            });
        }
    }
    libraryUtilFuncs(seqItem) {
        this.insertLibraryFile(seqItem, '', 'UtilFuncs.nlp');
    }
    libraryKBFuncs(seqItem) {
        this.insertLibraryFile(seqItem, '', 'KBFuncs.nlp');
    }
    libraryTreeFuncs(seqItem) {
        this.insertLibraryFile(seqItem, '', 'TreeFuncs.nlp');
    }
    libraryLines(seqItem) {
        this.insertLibraryFile(seqItem, 'Formatting', 'Lines.nlp');
    }
    libraryLinesDictTokZ(seqItem) {
        this.insertLibraryFile(seqItem, 'Formatting', 'LinesDictTokZ.nlp');
    }
    libraryWhiteSpaces(seqItem) {
        this.insertLibraryFile(seqItem, 'Formatting', 'RemoveWhiteSpace.nlp');
    }
    insertLibraryFile(seqItem, dir, filename) {
        const filepath = path.join(visualText_1.visualText.getVisualTextDirectory(visualText_1.visualText.ANALYZER_SEQUENCE_FOLDER), dir, filename);
        const newfile = vscode.Uri.file(filepath);
        const seqFile = visualText_1.visualText.analyzer.seqFile;
        const passNum = seqFile.findPassByFilename(filename);
        // If the pass exists, replace it
        if (passNum) {
            const currentFile = vscode.Uri.file(path.join(visualText_1.visualText.analyzer.getSpecDirectory().fsPath, filename));
            visualText_1.visualText.fileOps.addFileOperation(currentFile, currentFile, [fileOps_1.fileOpRefresh.ANALYZER], fileOps_1.fileOperation.DELETE);
            visualText_1.visualText.fileOps.addFileOperation(newfile, currentFile, [fileOps_1.fileOpRefresh.ANALYZER], fileOps_1.fileOperation.COPY);
            visualText_1.visualText.fileOps.startFileOps();
        }
        else {
            seqFile.insertPass(seqItem.row, newfile);
        }
        vscode.commands.executeCommand('sequenceView.refreshAll');
    }
    insertLibraryPass(seqItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const seqFile = visualText_1.visualText.analyzer.seqFile;
            const options = {
                canSelectMany: true,
                openLabel: 'Open',
                defaultUri: seqFile.getLibraryDirectory(),
                canSelectFiles: true,
                canSelectFolders: false,
                filters: {
                    'Text files': ['pat', 'nlp'],
                    'All files': ['*']
                }
            };
            vscode.window.showOpenDialog(options).then(selection => {
                if (!selection) {
                    return;
                }
                for (const select of selection.reverse()) {
                    const newfile = vscode.Uri.file(select.fsPath);
                    seqFile.insertPass(seqItem.row, newfile);
                }
                vscode.commands.executeCommand('sequenceView.refreshAll');
            });
        }
    }
    insertPass(seqItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const seq = new sequence_2.SequenceFile;
            const items = [];
            seq.choicePasses(visualText_1.visualText.analyzer.seqFile.getSpecDirectory().fsPath, items, '', false);
            exports.sequenceView.insertChosenPasses(seqItem, items);
        }
    }
    insertSisterPass(seqItem) {
        if (visualText_1.visualText.getWorkspaceFolder()) {
            const items = visualText_1.visualText.analyzerFolderList(true);
            exports.sequenceView.insertChosenPasses(seqItem, items);
        }
    }
    insertCode(seqItem) {
        this.insertNew(seqItem, sequence_1.newPassType.CODE);
    }
    insertDecl(seqItem) {
        this.insertNew(seqItem, sequence_1.newPassType.DECL);
    }
    insertRules(seqItem) {
        this.insertNew(seqItem, sequence_1.newPassType.RULES);
    }
    insertNew(seqItem, type) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const seqFile = visualText_1.visualText.analyzer.seqFile;
            let newPass = 'newpass';
            if (type == sequence_1.newPassType.DECL)
                newPass = 'funcs';
            else if (type == sequence_1.newPassType.CODE)
                newPass = 'init';
            vscode.window.showInputBox({ title: 'Insert Pass', value: newPass, prompt: 'Enter new pass name' }).then(newname => {
                if (newname) {
                    if (seqItem && (seqItem.uri || seqFile.getPasses().length > 1))
                        seqFile.insertNewPass(seqItem, newname, type);
                    else
                        seqFile.insertNewPassEnd(newname, type);
                    vscode.commands.executeCommand('sequenceView.refreshAll');
                }
            });
        }
    }
    renameTopComment(passFile) {
        const textFile = new textFile_1.TextFile();
        textFile.setFile(passFile);
        const lines = textFile.getLines();
        const newName = path.parse(passFile.fsPath).name;
        if (lines.length >= 7) {
            const fileLine = lines[1];
            const newLine = "# FILE: " + newName;
            lines[1] = newLine;
            textFile.saveFileLines();
        }
    }
    renamePass(seqItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const seqFile = visualText_1.visualText.analyzer.seqFile;
            vscode.window.showInputBox({ title: 'Rename Pass', value: seqItem.name, prompt: 'Enter new name for pass' }).then(newname => {
                const original = seqItem.uri;
                if (newname) {
                    const newFile = path.join(path.dirname(seqItem.uri.fsPath), newname + '.nlp');
                    if (fs.existsSync(newFile)) {
                        vscode.window.showWarningMessage('This pass name already exists: ' + newname);
                        vscode.commands.executeCommand('sequenceView.rename', seqItem);
                    }
                    else {
                        seqFile.renamePass(seqItem, newname);
                        if (seqItem.type.localeCompare('nlp') == 0 || seqItem.type.localeCompare('rec') == 0) {
                            const newfile = vscode.Uri.file(path.join(seqFile.getSpecDirectory().fsPath, newname.concat(path.extname(original.fsPath))));
                            dirfuncs_1.dirfuncs.rename(original.fsPath, newfile.fsPath);
                            this.renameTopComment(newfile);
                            vscode.window.showTextDocument(newfile);
                        }
                        vscode.commands.executeCommand('sequenceView.refreshAll');
                    }
                }
            });
        }
    }
    renameFolder(seqItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const seqFile = visualText_1.visualText.analyzer.seqFile;
            vscode.window.showInputBox({ title: 'Rename Folder', value: seqItem.name, prompt: 'Enter new name for folder' }).then(newname => {
                const original = seqItem.uri;
                if (newname) {
                    const exists = seqFile.findPass('folder', newname);
                    if (exists.name.length) {
                        vscode.window.showWarningMessage('This folder name already exists: ' + newname);
                        vscode.commands.executeCommand('sequenceView.rename', seqItem);
                    }
                    else {
                        seqFile.renamePass(seqItem, newname);
                        vscode.commands.executeCommand('sequenceView.refreshAll');
                    }
                }
            });
        }
    }
    duplicatePass(seqItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const seqFile = visualText_1.visualText.analyzer.seqFile;
            const seedName = this.incrementEndNumber(seqItem.name);
            vscode.window.showInputBox({ title: 'Duplicate Pass', value: seedName, prompt: 'Enter name for duplicate pass' }).then(newname => {
                if (newname) {
                    seqFile.duplicatePass(seqItem, newname);
                    vscode.commands.executeCommand('sequenceView.refreshAll');
                }
            });
        }
    }
    incrementEndNumber(word) {
        let neword = word;
        const tokens = word.split(/([0-9]+)/);
        if (tokens.length > 1) {
            neword = tokens[0] + (Number(tokens[1]) + 1).toString();
        }
        else {
            neword = neword + '1';
        }
        return neword;
    }
    newFolder(seqItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const seqFile = visualText_1.visualText.analyzer.seqFile;
            vscode.window.showInputBox({ title: 'Create New Folder', value: 'newpass', prompt: 'Enter new folder name' }).then(newname => {
                if (newname) {
                    if (seqItem.row == 0 || seqItem.type == "folder" || (seqItem && seqItem.uri))
                        seqFile.insertNewFolder(seqItem, newname);
                    else
                        seqFile.insertNewFolderEnd(newname);
                    vscode.commands.executeCommand('sequenceView.refreshAll');
                }
            });
        }
    }
    typePat(seqItem) {
        visualText_1.visualText.analyzer.seqFile.saveType(seqItem, 'nlp');
        vscode.commands.executeCommand('sequenceView.refreshAll');
    }
    typeRec(seqItem) {
        visualText_1.visualText.analyzer.seqFile.saveType(seqItem, 'rec');
        vscode.commands.executeCommand('sequenceView.refreshAll');
    }
    typeOn(seqItem) {
        visualText_1.visualText.analyzer.seqFile.saveActive(seqItem, true);
        vscode.commands.executeCommand('sequenceView.refreshAll');
    }
    typeOff(seqItem) {
        visualText_1.visualText.analyzer.seqFile.saveActive(seqItem, false);
        vscode.commands.executeCommand('sequenceView.refreshAll');
    }
    tokenize(seqItem) {
        this.renameToken(seqItem, 'tokenize');
    }
    dicttok(seqItem) {
        this.renameToken(seqItem, 'dicttok');
    }
    dicttokz(seqItem) {
        this.renameToken(seqItem, 'dicttokz');
    }
    chartok(seqItem) {
        this.renameToken(seqItem, 'chartok');
    }
    cmltok(seqItem) {
        this.renameToken(seqItem, 'cmltok');
    }
    renameToken(seqItem, newname) {
        visualText_1.visualText.analyzer.seqFile.saveType(seqItem, newname);
        vscode.commands.executeCommand('sequenceView.refreshAll');
    }
}
exports.PassTree = PassTree;
class SequenceView {
    static attach(ctx) {
        if (!exports.sequenceView) {
            exports.sequenceView = new SequenceView(ctx);
        }
        return exports.sequenceView;
    }
    constructor(context) {
        this.textFile = new textFile_1.TextFile();
        this.treeFile = new treeFile_1.TreeFile();
        this.findFile = new findFile_1.FindFile();
        const treeDataProvider = new PassTree();
        this.sequenceView = vscode.window.createTreeView('sequenceView', { treeDataProvider });
        vscode.commands.registerCommand('sequenceView.openPass', (seqItem) => this.openPass(seqItem));
        vscode.commands.registerCommand('sequenceView.openTree', (seqItem) => this.openTree(seqItem));
        vscode.commands.registerCommand('sequenceView.displayMatchedRules', (seqItem) => this.displayMatchedRules(seqItem));
        vscode.commands.registerCommand('sequenceView.openKB', (seqItem) => this.openKB(seqItem));
        vscode.commands.registerCommand('sequenceView.search', () => this.search());
        vscode.commands.registerCommand('sequenceView.searchTop', () => this.searchTop());
        vscode.commands.registerCommand('sequenceView.finalTree', () => this.finalTree());
        vscode.commands.registerCommand('sequenceView.convert', () => this.convertPatToNLP());
        vscode.commands.registerCommand('sequenceView.moveUp', (seqItem) => treeDataProvider.moveUp(seqItem));
        vscode.commands.registerCommand('sequenceView.moveDown', (seqItem) => treeDataProvider.moveDown(seqItem));
        vscode.commands.registerCommand('sequenceView.refreshAll', () => treeDataProvider.refresh());
        vscode.commands.registerCommand('sequenceView.insert', (seqItem) => treeDataProvider.insertPass(seqItem));
        vscode.commands.registerCommand('sequenceView.insertSister', (seqItem) => treeDataProvider.insertSisterPass(seqItem));
        vscode.commands.registerCommand('sequenceView.insertNew', (seqItem) => treeDataProvider.insertRules(seqItem));
        vscode.commands.registerCommand('sequenceView.insertCode', (seqItem) => treeDataProvider.insertCode(seqItem));
        vscode.commands.registerCommand('sequenceView.insertDecl', (seqItem) => treeDataProvider.insertDecl(seqItem));
        vscode.commands.registerCommand('sequenceView.insertLibrary', (seqItem) => treeDataProvider.insertLibraryPass(seqItem));
        vscode.commands.registerCommand('sequenceView.libraryKBFuncs', (seqItem) => treeDataProvider.libraryKBFuncs(seqItem));
        vscode.commands.registerCommand('sequenceView.libraryTreeFuncs', (seqItem) => treeDataProvider.libraryTreeFuncs(seqItem));
        vscode.commands.registerCommand('sequenceView.libraryUtilFuncs', (seqItem) => treeDataProvider.libraryUtilFuncs(seqItem));
        vscode.commands.registerCommand('sequenceView.libraryLines', (seqItem) => treeDataProvider.libraryLines(seqItem));
        vscode.commands.registerCommand('sequenceView.libraryLinesDictTokZ', (seqItem) => treeDataProvider.libraryLinesDictTokZ(seqItem));
        vscode.commands.registerCommand('sequenceView.libraryWhiteSpaces', (seqItem) => treeDataProvider.libraryWhiteSpaces(seqItem));
        vscode.commands.registerCommand('sequenceView.delete', (seqItem) => treeDataProvider.deletePass(seqItem));
        vscode.commands.registerCommand('sequenceView.deleteFolder', (seqItem) => treeDataProvider.deleteFolder(seqItem));
        vscode.commands.registerCommand('sequenceView.duplicate', (seqItem) => treeDataProvider.duplicatePass(seqItem));
        vscode.commands.registerCommand('sequenceView.rename', (seqItem) => treeDataProvider.renamePass(seqItem));
        vscode.commands.registerCommand('sequenceView.renameFolder', (seqItem) => treeDataProvider.renameFolder(seqItem));
        vscode.commands.registerCommand('sequenceView.typePat', (seqItem) => treeDataProvider.typePat(seqItem));
        vscode.commands.registerCommand('sequenceView.typeRec', (seqItem) => treeDataProvider.typeRec(seqItem));
        vscode.commands.registerCommand('sequenceView.typeOff', (seqItem) => treeDataProvider.typeOff(seqItem));
        vscode.commands.registerCommand('sequenceView.typeOn', (seqItem) => treeDataProvider.typeOn(seqItem));
        vscode.commands.registerCommand('sequenceView.newFolder', (seqItem) => treeDataProvider.newFolder(seqItem));
        vscode.commands.registerCommand('sequenceView.tokenize', (seqItem) => treeDataProvider.tokenize(seqItem));
        vscode.commands.registerCommand('sequenceView.dicttok', (seqItem) => treeDataProvider.dicttok(seqItem));
        vscode.commands.registerCommand('sequenceView.dicttokz', (seqItem) => treeDataProvider.dicttokz(seqItem));
        vscode.commands.registerCommand('sequenceView.chartok', (seqItem) => treeDataProvider.chartok(seqItem));
        vscode.commands.registerCommand('sequenceView.cmltok', (seqItem) => treeDataProvider.cmltok(seqItem));
        vscode.commands.registerCommand('sequenceView.explore', () => this.explore());
        vscode.commands.registerCommand('sequenceView.insertOrphan', (seqItem) => this.insertOrphan(seqItem));
        vscode.commands.registerCommand('sequenceView.toggleActive', (seqItem) => this.toggleActive(seqItem));
        vscode.commands.registerCommand('sequenceView.modAdd', () => this.modAdd());
        vscode.commands.registerCommand('sequenceView.video', () => this.video());
        vscode.commands.registerCommand('sequenceView.insertAnalyzerBlock', (seqItem) => this.insertAnalyzerBlocks(seqItem));
        vscode.commands.registerCommand('sequenceView.compareSisters', (seqItem) => this.compareSisters(seqItem));
        vscode.commands.registerCommand('sequenceView.copyContext', (seqItem) => this.copyContext(seqItem));
        vscode.commands.registerCommand('sequenceView.compareLibrary', (seqItem) => this.compareLibrary(seqItem));
        vscode.commands.registerCommand('sequenceView.updateTitle', () => this.updateTitle());
    }
    copyContext(seqItem) {
        if (seqItem) {
            const nlp = new nlp_1.NLPFile();
            const contextLine = nlp.getContextLine(seqItem.uri);
            if (!contextLine) {
                vscode.window.showWarningMessage('No context line found');
                return;
            }
            const seq = new sequence_2.SequenceFile;
            let items = [];
            seq.choiceRulePasses(visualText_1.visualText.analyzer.seqFile.getSpecDirectory().fsPath, items);
            items = items.filter(item => item.description !== seqItem.uri.fsPath);
            const title = 'Copy Context to Pass(es)';
            const placeHolder = 'Choose NLP files to insert';
            vscode.window.showQuickPick(items, { title, canPickMany: true, placeHolder: placeHolder }).then(selections => {
                if (!selections)
                    return;
                for (const selection of selections) {
                    if (selection.description) {
                        nlp.setFile(vscode.Uri.file(selection.description));
                        nlp.replaceContextLineInFile(contextLine);
                    }
                }
            });
        }
    }
    compareLibrary(seqItem) {
        if (visualText_1.visualText.getWorkspaceFolder()) {
            if (seqItem.library.fsPath.length > 2) {
                vscode.commands.executeCommand("vscode.diff", seqItem.library, seqItem.uri);
            }
        }
    }
    searchFilesRecursively(dir, filename) {
        const items = [];
        function traverseDirectory(currentDir) {
            const files = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const file of files) {
                const filePath = path.join(currentDir, file.name);
                const parsed = path.parse(filePath);
                if (file.isDirectory()) {
                    traverseDirectory(filePath);
                }
                else if (parsed.name == filename) {
                    items.push({ label: filename, description: filePath });
                }
            }
        }
        traverseDirectory(dir);
        return items;
    }
    compareSisters(seqItem) {
        if (visualText_1.visualText.getWorkspaceFolder()) {
            const items = visualText_1.visualText.analyzer.seqFile.getSisterFiles(seqItem.uri.fsPath);
            if (items.length == 1 && items[0].description)
                vscode.commands.executeCommand("vscode.diff", seqItem.uri, vscode.Uri.file(items[0].description));
            else {
                vscode.window.showQuickPick(items, { title: 'Choose file to compare', canPickMany: false, placeHolder: 'Choose sister file to compare' }).then(selection => {
                    if (!selection || !selection.description)
                        return false;
                    vscode.commands.executeCommand("vscode.diff", seqItem.uri, vscode.Uri.file(selection.description));
                    vscode.commands.executeCommand('sequenceView.refreshAll');
                    return true;
                });
            }
        }
    }
    insertAnalyzerBlocks(seqItem) {
        if (visualText_1.visualText.getWorkspaceFolder()) {
            const items = [];
            const fromDir = path.join(visualText_1.visualText.getVisualTextDirectory('analyzers'));
            if (dirfuncs_1.dirfuncs.isDir(fromDir)) {
                const files = dirfuncs_1.dirfuncs.getDirectories(vscode.Uri.file(fromDir));
                for (const file of files) {
                    if (dirfuncs_1.dirfuncs.isDir(file.fsPath)) {
                        const readme = path.join(file.fsPath, "README.MD");
                        let descr, tit;
                        ({ title: tit, description: descr } = visualText_1.visualText.analyzer.readDescription(readme));
                        items.push({ label: tit, description: descr });
                    }
                }
                vscode.window.showQuickPick(items, { title: 'Insert Analyzer', canPickMany: true, placeHolder: 'Choose analyzer blocks to insert' }).then(selections => {
                    if (!selections)
                        return false;
                    let row = seqItem.row;
                    if (seqItem.type.localeCompare('folder') == 0)
                        row = visualText_1.visualText.analyzer.seqFile.getLastItemInFolder(row).row;
                    const toDir = visualText_1.visualText.analyzer.getAnalyzerDirectory().fsPath;
                    visualText_1.visualText.fileOps.addFileOperation(vscode.Uri.file(fromDir), vscode.Uri.file(toDir), [fileOps_1.fileOpRefresh.ANALYZER], fileOps_1.fileOperation.ANASEL, row.toString());
                    for (const selection of selections) {
                        if (selection.description)
                            this.insertAnalyzerBlock(fromDir, toDir, selection.label);
                    }
                    visualText_1.visualText.fileOps.startFileOps();
                    vscode.commands.executeCommand('sequenceView.refreshAll');
                    return true;
                });
            }
            else {
                vscode.window.showWarningMessage('No analyzers found in ' + fromDir);
            }
        }
    }
    insertAnalyzerBlock(fromDirIn, toDir, folderName) {
        const fromDir = path.join(fromDirIn, folderName, visualText_1.visualText.ANALYZER_SEQUENCE_FOLDER);
        const folder = this.makeAbbrevFolderName(folderName);
        // Copy analyzer block to analyzer
        visualText_1.visualText.fileOps.addFileOperation(vscode.Uri.file(fromDir), vscode.Uri.file(toDir), [fileOps_1.fileOpRefresh.ANALYZER], fileOps_1.fileOperation.ANAFOLDER, folder, "folder");
        const sequence = new sequence_2.SequenceFile;
        sequence.getPassFiles(fromDir);
        let orderCount = 0;
        for (const pi of sequence.getPassItems()) {
            if (pi.uri.path.length > 2 && pi.name != "nil") {
                const basename = path.basename(pi.uri.path);
                let toUri = vscode.Uri.file(path.join(toDir, visualText_1.visualText.ANALYZER_SEQUENCE_FOLDER, basename));
                const fromUri = vscode.Uri.file(path.join(fromDir, basename));
                if (dirfuncs_1.dirfuncs.needToCopy(fromUri.fsPath, toUri.fsPath)) {
                    toUri = vscode.Uri.file(exports.sequenceView.safeBlockFilename(path.join(toDir, visualText_1.visualText.ANALYZER_SEQUENCE_FOLDER, basename), folder));
                    visualText_1.visualText.fileOps.addFileOperation(fromUri, toUri, [fileOps_1.fileOpRefresh.ANALYZER], fileOps_1.fileOperation.COPY);
                    visualText_1.visualText.fileOps.addFileOperation(fromUri, toUri, [fileOps_1.fileOpRefresh.ANALYZER], fileOps_1.fileOperation.ANAFILE, basename);
                }
            }
            orderCount++;
        }
        visualText_1.visualText.fileOps.addFileOperation(vscode.Uri.file(""), vscode.Uri.file(""), [fileOps_1.fileOpRefresh.ANALYZER], fileOps_1.fileOperation.ANAFOLDER, folder, "end");
        // Copy over KB files
        const fromUri = visualText_1.visualText.analyzer.constructDir(vscode.Uri.file(path.join(fromDirIn, folderName)), analyzer_1.anaSubDir.KB);
        const toUri = visualText_1.visualText.analyzer.constructDir(vscode.Uri.file(toDir), analyzer_1.anaSubDir.KB);
        const kbFiles = dirfuncs_1.dirfuncs.getFiles(fromUri, [".dict", ".kbb"]);
        for (const kbFile of kbFiles) {
            const tUri = path.join(toUri.fsPath, path.basename(kbFile.fsPath));
            if (dirfuncs_1.dirfuncs.needToCopy(kbFile.fsPath, tUri)) {
                visualText_1.visualText.fileOps.addFileOperation(kbFile, vscode.Uri.file(exports.sequenceView.safeBlockFilename(tUri, folder)), [fileOps_1.fileOpRefresh.KB], fileOps_1.fileOperation.COPY);
            }
        }
    }
    makeAbbrevFolderName(name, cuttoff = 4) {
        let abbrev = '';
        const tokens = name.split(' ');
        for (const token of tokens) {
            let tok = token.substring(0, Math.min(token.length, cuttoff));
            tok = tok.charAt(0).toUpperCase() + tok.substring(1).toLowerCase();
            abbrev = abbrev.concat(tok);
        }
        return abbrev;
    }
    modAdd() {
        if (visualText_1.visualText.modFiles.length == 0) {
            vscode.window.showWarningMessage('No modfiles exist. Please create one in the KB view');
            return;
        }
        visualText_1.visualText.mod.getMod().then(retVal => {
            if (!retVal)
                return;
            const seq = new sequence_2.SequenceFile;
            const items = [];
            seq.choicePasses(visualText_1.visualText.analyzer.getSpecDirectory().fsPath, items, '', false);
            vscode.window.showQuickPick(items, { title: 'Choose Pass', canPickMany: true, placeHolder: 'Choose pass to insert after' }).then(selections => {
                if (!selections) {
                    return;
                }
                else {
                    for (const selection of selections) {
                        if (selection.description)
                            visualText_1.visualText.mod.appendFile(vscode.Uri.file(selection.description));
                    }
                    vscode.window.showTextDocument(visualText_1.visualText.mod.getUri());
                }
            });
        });
    }
    toggleActive(seqItem) {
        if (seqItem) {
            visualText_1.visualText.analyzer.seqFile.saveActive(seqItem, !seqItem.active);
            vscode.commands.executeCommand('sequenceView.refreshAll');
        }
    }
    insertOrphan(seqItem) {
        if (visualText_1.visualText.getWorkspaceFolder()) {
            const dirs = dirfuncs_1.dirfuncs.getDirectories(visualText_1.visualText.getWorkspaceFolder());
            const items = [];
            const nlpFiles = dirfuncs_1.dirfuncs.getFiles(visualText_1.visualText.analyzer.getSpecDirectory(), ['.pat', '.nlp']);
            for (const nlpFile of nlpFiles) {
                if (visualText_1.visualText.analyzer.seqFile.isOrphan(path.basename(nlpFile.fsPath, '.nlp')) == true &&
                    visualText_1.visualText.analyzer.seqFile.isOrphan(path.basename(nlpFile.fsPath, '.pat')) == true) {
                    items.push({ label: path.basename(nlpFile.fsPath), description: nlpFile.fsPath });
                }
            }
            if (items.length == 0) {
                vscode.window.showWarningMessage('No orphan files for this analyzer');
                return;
            }
            this.insertChosenPasses(seqItem, items, true);
        }
    }
    insertChosenPasses(seqItem, items, orphanFlag = false) {
        if (visualText_1.visualText.getWorkspaceFolder()) {
            const title = 'Insert NLP files';
            const placeHolder = 'Choose NLP files to insert';
            vscode.window.showQuickPick(items, { title, canPickMany: true, placeHolder: placeHolder }).then(selections => {
                var _a;
                if (!selections)
                    return;
                let found = false;
                let fromDir = '';
                if (((_a = seqItem.contextValue) === null || _a === void 0 ? void 0 : _a.indexOf('tokenize')) != -1) {
                    fromDir = visualText_1.visualText.analyzer.getSpecDirectory().fsPath;
                }
                else {
                    fromDir = path.dirname(seqItem.uri.fsPath);
                }
                const seqFile = visualText_1.visualText.analyzer.seqFile;
                for (const selection of selections.reverse()) {
                    if (selection.description) {
                        const uri = vscode.Uri.file(selection.description);
                        if (dirfuncs_1.dirfuncs.isDir(selection.description)) {
                            const files = dirfuncs_1.dirfuncs.getFiles(uri, ['.nlp', '.pat']);
                            for (const file of files) {
                                const toUri = vscode.Uri.file(this.safeFilename(path.join(fromDir, path.basename(file.fsPath)), orphanFlag));
                                const fromUri = vscode.Uri.file(path.join(uri.fsPath, path.basename(file.fsPath)));
                                seqFile.insertPass(seqItem.row, toUri);
                                visualText_1.visualText.fileOps.addFileOperation(fromUri, toUri, [fileOps_1.fileOpRefresh.ANALYZER], fileOps_1.fileOperation.COPY);
                                found = true;
                            }
                        }
                        else {
                            const toUri = vscode.Uri.file(this.safeFilename(path.join(fromDir, path.basename(uri.fsPath)), orphanFlag));
                            seqFile.insertPass(seqItem.row, toUri);
                            visualText_1.visualText.fileOps.addFileOperation(uri, toUri, [fileOps_1.fileOpRefresh.ANALYZER], fileOps_1.fileOperation.COPY);
                            found = true;
                        }
                    }
                }
                if (found)
                    visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    safeBlockFilename(filePath, folderName) {
        let newFilePath = filePath;
        if (fs.existsSync(filePath) || visualText_1.visualText.analyzer.seqFile.findPassByFilename(filePath)) {
            const dotIndex = filePath.lastIndexOf('.');
            if (dotIndex === -1) {
                newFilePath = filePath + "_" + folderName;
            }
            else {
                newFilePath = filePath.substring(0, dotIndex) + "_" + folderName + filePath.substring(dotIndex);
            }
        }
        return newFilePath;
    }
    safeFilename(filePath, orphanFlag = false) {
        let newFilePath = filePath;
        if (fs.existsSync(filePath) && !orphanFlag) {
            const filename = path.basename(filePath);
            const regex = /([a-zA-Z]+)(\d+)\.([a-zA-Z]+)/;
            const match = filePath.match(regex);
            let newFileName = '';
            let newNumber = 1;
            let front = filename.split('.')[0];
            const ext = filename.split('.')[1];
            if (match) {
                front = match[1];
                const num = match[2];
                newNumber = Number(num) + 1;
            }
            newFileName = `${front}${newNumber}.${ext}`;
            newFilePath = path.join(path.dirname(filePath), newFileName);
            while (fs.existsSync(newFilePath)) {
                newNumber++;
                newFileName = `${front}${newNumber}.${ext}`;
                newFilePath = path.join(path.dirname(filePath), newFileName);
            }
        }
        return newFilePath;
    }
    video() {
        const url = 'http://vscodeanaseq.visualtext.org';
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
    }
    explore() {
        const dir = visualText_1.visualText.analyzer.getSpecDirectory();
        visualText_1.visualText.openFileManager(dir.fsPath);
    }
    passTree(nlpFilePath) {
        const passItem = this.passItemFromPath(nlpFilePath);
        this.openTreeFile(passItem.passNum);
    }
    passItemFromPath(nlpFilePath) {
        const seqFile = visualText_1.visualText.analyzer.seqFile;
        let seqName = path.basename(nlpFilePath, '.pat');
        seqName = path.basename(seqName, '.nlp');
        const passItem = seqFile.findPass('nlp', seqName);
        if (passItem.passNum) {
            logView_1.logView.addMessage(seqName + ': ' + passItem.passNum.toString(), logView_1.logLineType.SEQUENCE, passItem.uri);
        }
        else {
            logView_1.logView.addMessage(seqName + ': could not find this file in the sequence', logView_1.logLineType.SEQUENCE, vscode.Uri.file(nlpFilePath));
        }
        return passItem;
    }
    reveal(nlpFilePath) {
        const passItem = this.passItemFromPath(nlpFilePath);
        // let label = passItem.passNum.toString() + ' ' + passItem.text;
        // let seqItem: SequenceItem = {uri: passItem.uri, library: passItem.uri, label: label, name: passItem.name, tooltip: passItem.uri.fsPath, contextValue: 'missing', inFolder: passItem.inFolder,
        // type: 'nlp', passNum: passItem.passNum, row: passItem.row, collapsibleState: vscode.TreeItemCollapsibleState.Expanded, active: passItem.active};
        // this.sequenceView.reveal(seqItem, {select: true, focus: true, expand: 2});
        vscode.commands.executeCommand('logView.refreshAll');
    }
    replaceContext(nlpFilePath) {
        const passItem = this.passItemFromPath(nlpFilePath);
        const seqFile = visualText_1.visualText.analyzer.seqFile;
        const prevItem = seqFile.prevNLP(passItem);
        const uri = prevItem.uri;
        const nlp = new nlp_1.NLPFile();
        const contextLine = nlp.getContextLine(uri);
        if (contextLine.length) {
            nlp.setFile(passItem.uri);
            nlp.replaceContext(contextLine, false);
        }
    }
    convertPatToNLP() {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const items = [];
            items.push({ label: 'Yes', description: 'Convert all the .pat files to .nlp' });
            items.push({ label: 'No', description: 'Do not convert' });
            vscode.window.showQuickPick(items, { title: 'Convert PAT Files', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                visualText_1.visualText.convertPatFiles(visualText_1.visualText.analyzer.getAnalyzerDirectory());
            });
        }
    }
    finalTree() {
        const dir = visualText_1.visualText.analyzer.getOutputDirectory();
        const finalTree = path.join(dir.fsPath, 'final.tree');
        if (fs.existsSync(finalTree)) {
            visualText_1.visualText.colorizeAnalyzer();
            vscode.window.showTextDocument(vscode.Uri.file(finalTree));
        }
        else {
            vscode.window.showInformationMessage('No final tree found');
        }
    }
    search(word = '', functionFlag = false) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            if (word.length == 0) {
                vscode.window.showInputBox({ title: 'Find in Passes', value: 'searchword', prompt: 'Enter term to search' }).then(searchWord => {
                    if (searchWord === null || searchWord === void 0 ? void 0 : searchWord.length)
                        this.findWord(searchWord, functionFlag);
                });
            }
            else {
                this.findWord(word, functionFlag);
            }
        }
    }
    searchTop(word = '', functionFlag = false) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            if (word.length == 0) {
                vscode.window.showInputBox({ title: 'Find in Top Level Passes', value: 'searchword', prompt: 'Enter term to search at the top level' }).then(searchWord => {
                    if (searchWord === null || searchWord === void 0 ? void 0 : searchWord.length)
                        this.findWord(searchWord, functionFlag, true);
                });
            }
            else {
                this.findWord(word, functionFlag, true);
            }
        }
    }
    findWord(word, functionFlag = false, topFlag = false) {
        if (word.length) {
            if (functionFlag) {
                this.findFile.searchFiles(visualText_1.visualText.analyzer.getSpecDirectory(), word, ['.nlp', '.pat'], 0, true);
                const matches = this.findFile.getMatches();
                const finalMatches = [];
                for (const match of matches) {
                    if (this.matchFunctionLine(word, match.line)) {
                        finalMatches.push(match);
                    }
                }
                // Display the find(s)
                if (finalMatches.length >= 1) {
                    findView_1.findView.openFile(finalMatches[0]);
                    findView_1.findView.loadFinds(word, finalMatches);
                }
            }
            else {
                this.findFile.searchSequenceFiles(word, topFlag);
                findView_1.findView.loadFinds(word, this.findFile.getMatches());
            }
            findView_1.findView.setSearchWord(word);
            vscode.commands.executeCommand('findView.updateTitle');
            vscode.commands.executeCommand('findView.refreshAll');
        }
    }
    matchFunctionLine(original, line) {
        const tokens = line.split('(');
        return tokens.length > 1 && tokens[0].localeCompare(original) == 0;
    }
    notMissing(seqItem) {
        if (seqItem.type.localeCompare('missing') == 0) {
            vscode.window.showInformationMessage('File is missing: ' + seqItem.name);
            return false;
        }
        return true;
    }
    openPass(seqItem) {
        if (this.notMissing(seqItem) && seqItem.type.localeCompare('folder') && seqItem.type.localeCompare('stub')) {
            // Mostly for debugging purposes
            if (seqItem.passNum == 1)
                seqItem.uri = visualText_1.visualText.analyzer.seqFile.getSequenceFile();
            this.textFile.setFile(seqItem.uri);
            if (seqItem.passNum != 1 && !this.textFile.isFileType(textFile_1.nlpFileType.NLP)) {
                vscode.window.showWarningMessage('Not editable');
                return;
            }
            visualText_1.visualText.analyzer.saveCurrentPass(seqItem.uri, seqItem.passNum);
            visualText_1.visualText.colorizeAnalyzer();
            vscode.window.showTextDocument(seqItem.uri);
        }
    }
    openTree(seqItem) {
        if (this.notMissing(seqItem)) {
            if (seqItem.passNum == 1) {
                this.openTreeFile(seqItem.passNum);
            }
            else {
                this.textFile.setFileType(seqItem.uri.fsPath);
                if (!this.textFile.isFileType(textFile_1.nlpFileType.NLP)) {
                    vscode.window.showWarningMessage('Not editable');
                    return;
                }
                if (fs.existsSync(visualText_1.visualText.analyzer.getOutputDirectory().fsPath)) {
                    this.openTreeFile(seqItem.passNum);
                }
            }
        }
    }
    openTreeFileFromPath(nlpFilePath) {
        const passItem = this.passItemFromPath(nlpFilePath);
        this.openRuleMatchFile(passItem.passNum);
    }
    openTreeFile(passNum) {
        const logfile = this.treeFile.anaFile(passNum, textFile_1.nlpFileType.TREE);
        if (fs.existsSync(logfile.fsPath)) {
            visualText_1.visualText.colorizeAnalyzer();
            vscode.commands.executeCommand('vscode.open', vscode.Uri.file(logfile.fsPath));
        }
        else
            vscode.window.showWarningMessage('No tree file ' + path.basename(logfile.fsPath));
    }
    openRuleMatchFile(passNum) {
        const firefile = this.treeFile.firedFile(passNum);
        if (fs.existsSync(firefile.fsPath)) {
            visualText_1.visualText.colorizeAnalyzer();
            vscode.window.showTextDocument(firefile);
        }
        else
            vscode.window.showWarningMessage('No rule matches file with this pass');
    }
    displayMatchedRules(seqItem) {
        if (this.notMissing(seqItem)) {
            if (seqItem.passNum == 1) {
                this.openRuleMatchFile(seqItem.passNum);
            }
            else {
                this.textFile.setFile(seqItem.uri);
                if (!this.textFile.isFileType(textFile_1.nlpFileType.NLP)) {
                    vscode.window.showWarningMessage('Not editable');
                    return;
                }
                if (fs.existsSync(visualText_1.visualText.analyzer.getOutputDirectory().fsPath)) {
                    this.openRuleMatchFile(seqItem.passNum);
                }
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
            if (fs.existsSync(visualText_1.visualText.analyzer.getOutputDirectory().fsPath)) {
                const kbfile = this.treeFile.anaFile(seqItem.passNum, textFile_1.nlpFileType.KBB);
                if (fs.existsSync(kbfile.fsPath)) {
                    visualText_1.visualText.colorizeAnalyzer();
                    vscode.window.showTextDocument(kbfile);
                }
                else
                    vscode.window.showWarningMessage('No KB file for this pass');
            }
        }
    }
    updateTitle() {
        const analyzerName = visualText_1.visualText.getCurrentAnalyzerName();
        if (analyzerName.length > 0) {
            this.sequenceView.title = `ANALYZER (${analyzerName})`;
        }
        else {
            this.sequenceView.title = 'ANALYZER';
        }
    }
}
exports.SequenceView = SequenceView;
//# sourceMappingURL=sequenceView.js.map