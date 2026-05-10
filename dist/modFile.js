"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModFile = exports.modFile = exports.modType = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const path = tslib_1.__importStar(require("path"));
const fs = tslib_1.__importStar(require("fs"));
const visualText_1 = require("./visualText");
const textFile_1 = require("./textFile");
const sequence_1 = require("./sequence");
const logView_1 = require("./logView");
const analyzer_1 = require("./analyzer");
var modType;
(function (modType) {
    modType[modType["UNKNOWN"] = 0] = "UNKNOWN";
    modType[modType["INPUT"] = 1] = "INPUT";
    modType[modType["SPEC"] = 2] = "SPEC";
    modType[modType["KB"] = 3] = "KB";
})(modType || (exports.modType = modType = {}));
class ModFile extends textFile_1.TextFile {
    constructor() {
        super();
        this.MODFILE_HEADER = '<modfile';
        this.MODFILE_KB = '\\kb\\user\\';
        this.MODFILE_SPEC = '\\spec\\';
        this.MODFILE_INPUT = '\\input\\';
        this.seqInsertPoint = '';
        this.files = new Array();
    }
    getMod() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            let retVal = false;
            if (visualText_1.visualText.modFiles.length == 0) {
                const items = [];
                items.push({ label: 'Create', description: 'Create a new mod file' });
                items.push({ label: 'Abort', description: 'Abort this attempt' });
                yield vscode.window.showQuickPick(items, { title: 'Mod File', canPickMany: false, placeHolder: 'Choose create or abort' }).then(selection => {
                    if (typeof selection === undefined || !selection || selection.label == 'Abort')
                        retVal = false;
                    else {
                        visualText_1.visualText.analyzer.modCreate(visualText_1.visualText.analyzer.getKBDirectory());
                        retVal = true;
                    }
                });
            }
            else {
                const items = visualText_1.visualText.modFileList();
                yield vscode.window.showQuickPick(items, { title: 'Add to Mod File', canPickMany: false, placeHolder: 'choose mod file' }).then(selection => {
                    if (!selection || !selection.description)
                        return false;
                    const modUri = vscode.Uri.file(selection.description);
                    visualText_1.visualText.setModFile(modUri);
                    retVal = true;
                });
            }
            return retVal;
        });
    }
    addFile(uri, showFile = false) {
        visualText_1.visualText.mod.getMod().then(retVal => {
            if (retVal) {
                visualText_1.visualText.mod.appendFile(uri);
                if (showFile)
                    vscode.window.showTextDocument(this.getUri());
            }
        });
    }
    load(filePath) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this.setFile(filePath);
            const relFilePath = '';
            const filepath = '';
            const content = '';
            this.seqInsertPoint = '';
            let kb = false;
            let spec = false;
            let input = false;
            if (this.parseFiles(filePath)) {
                yield this.selectInsertPoint(filePath);
                if (this.seqInsertPoint == 'abort')
                    return;
                const textFile = new textFile_1.TextFile();
                for (const mod of this.files) {
                    textFile.setFile(mod.uri);
                    textFile.setText(mod.content);
                    textFile.saveFile();
                    if (mod.type == modType.INPUT)
                        input = true;
                    if (mod.type == modType.KB)
                        kb = true;
                    if (mod.type == modType.SPEC)
                        spec = true;
                    if (mod.type == modType.SPEC) {
                        const seqItem = visualText_1.visualText.analyzer.seqFile.findPassFromUri(this.seqInsertPoint);
                        visualText_1.visualText.analyzer.seqFile.insertPass(seqItem.passNum, mod.uri);
                    }
                }
                if (filepath.length > 0 && content.length > 0)
                    this.saveSection(filepath, content);
                if (input)
                    vscode.commands.executeCommand('textView.refreshAll');
                if (spec)
                    vscode.commands.executeCommand('sequenceView.refreshAll');
                if (kb)
                    vscode.commands.executeCommand('kbView.refreshAll');
            }
        });
    }
    saveSection(filepath, content) {
        const textFile = new textFile_1.TextFile();
        const uri = vscode.Uri.file(filepath);
        textFile.setFile(uri);
        textFile.setText(content);
        textFile.saveFile();
        if (filepath.includes('\\spec\\')) {
            const seqItem = visualText_1.visualText.analyzer.seqFile.findPassFromUri(filepath);
            visualText_1.visualText.analyzer.seqFile.insertPass(seqItem.passNum, uri);
        }
    }
    clearMod(modItem) {
        modItem.uri = vscode.Uri.file('');
        modItem.parentDir = '';
        modItem.filename = '';
        modItem.type = modType.UNKNOWN;
        modItem.content = '';
        modItem.exists = false;
    }
    parseFiles(filePath) {
        this.setFile(filePath);
        let good = true;
        let content = '';
        let started = false;
        const modItem = { uri: vscode.Uri.file(''), parentDir: '', filename: '', type: modType.UNKNOWN, content: '', exists: false };
        this.files = [];
        for (const line of this.getLines()) {
            if (line.indexOf(this.MODFILE_HEADER) == 0) {
                started = true;
                if (content.length > 0) {
                    const mod = this.files[this.files.length - 1];
                    mod.content = content;
                }
                content = '';
                const tokens = line.split(/[\<\t\s\>]/);
                const relFilePath = tokens[2];
                const modItem = this.getModItem(relFilePath);
                this.files.push(modItem);
                if (modItem.exists) {
                    logView_1.logView.addMessage('Mod exists: ' + path.join(modItem.parentDir, modItem.filename), logView_1.logLineType.WARNING, modItem.uri);
                    good = false;
                }
            }
            else if (started) {
                content = content + line + '\n';
            }
        }
        if (content.length > 0) {
            const mod = this.files[this.files.length - 1];
            mod.content = content;
        }
        if (!good) {
            vscode.commands.executeCommand('logView.refreshAll');
        }
        return good;
    }
    getModItem(relFilePath) {
        const filepath = path.join(visualText_1.visualText.analyzer.getAnalyzerDirectory().fsPath, relFilePath);
        let type = modType.UNKNOWN;
        const filename = path.basename(filepath);
        const parentDir = path.dirname(relFilePath);
        if (filepath.includes(this.MODFILE_KB)) {
            type = modType.KB;
        }
        else if (filepath.includes(this.MODFILE_SPEC)) {
            type = modType.SPEC;
        }
        else if (filepath.includes(this.MODFILE_INPUT)) {
            type = modType.INPUT;
        }
        return { uri: vscode.Uri.file(filepath), parentDir: parentDir, filename: filename, type: type, content: '', exists: fs.existsSync(filepath) };
    }
    selectInsertPoint(filePath) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this.setFile(filePath);
            let filepath = '';
            for (const line of this.getLines()) {
                if (line.indexOf(this.MODFILE_HEADER) == 0) {
                    const tokens = line.split(/[\<\t\s\>]/);
                    const relFilePath = tokens[2];
                    filepath = path.join(visualText_1.visualText.getAnalyzerDir().fsPath, relFilePath);
                    if (filepath.includes(this.MODFILE_SPEC)) {
                        const seq = new sequence_1.SequenceFile;
                        const items = [];
                        seq.choicePasses(visualText_1.visualText.analyzer.getSpecDirectory().fsPath, items, '');
                        yield vscode.window.showQuickPick(items, { title: 'Choose Pass', canPickMany: false, placeHolder: 'Choose pass to insert after' }).then(selection => {
                            if (typeof selection === undefined || !selection) {
                                this.seqInsertPoint = 'abort';
                            }
                            else {
                                this.seqInsertPoint = selection.description;
                            }
                        });
                    }
                }
            }
            return '';
        });
    }
    appendFile(filePath) {
        const fileContent = fs.readFileSync(filePath.fsPath, 'utf8');
        this.appendText(this.headerLine(filePath));
        this.appendText(fileContent);
        this.saveFile();
    }
    headerLine(filePath) {
        let header = '';
        const filepath = filePath.fsPath;
        let dir = '';
        const diff = path.win32.normalize(filepath);
        if (filepath.includes(this.MODFILE_KB)) {
            dir = visualText_1.visualText.analyzer.anaSubDirPath(analyzer_1.anaSubDir.KB);
        }
        else if (filepath.includes(this.MODFILE_SPEC)) {
            dir = visualText_1.visualText.analyzer.anaSubDirPath(analyzer_1.anaSubDir.SPEC);
        }
        else if (filepath.includes(this.MODFILE_INPUT)) {
            dir = visualText_1.visualText.analyzer.anaSubDirPath(analyzer_1.anaSubDir.INPUT);
        }
        const name = path.basename(filePath.fsPath);
        const finalPath = path.join(dir, name);
        header = '\n' + this.MODFILE_HEADER + ' ' + finalPath + '>\n';
        return header;
    }
}
exports.ModFile = ModFile;
//# sourceMappingURL=modFile.js.map