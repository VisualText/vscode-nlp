"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Analyzer = exports.analyzer = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const sequence_1 = require("./sequence");
const visualText_1 = require("./visualText");
const jsonState_1 = require("./jsonState");
const dirfuncs_1 = require("./dirfuncs");
const textFile_1 = require("./textFile");
const textFile_2 = require("./textFile");
const fileOps_1 = require("./fileOps");
class Analyzer {
    ;
    constructor() {
        this.seqFile = new sequence_1.SequenceFile();
        this.jsonState = new jsonState_1.JsonState();
        this.analyzerDir = vscode.Uri.file('');
        this.specDir = vscode.Uri.file('');
        this.inputDir = vscode.Uri.file('');
        this.outputDir = vscode.Uri.file('');
        this.kbDir = vscode.Uri.file('');
        this.logDir = vscode.Uri.file('');
        this.currentTextFile = vscode.Uri.file('');
        this.currentPassFile = vscode.Uri.file('');
        this.passNum = 0;
        this.loaded = false;
        this.timerCounter = 0;
        this.timerID = 0;
        this.analyzerCopyUri = vscode.Uri.file('');
        this.name = "";
    }
    readState() {
        if (this.jsonState.jsonParse(this.analyzerDir, 'state')) {
            var parse = this.jsonState.json.visualText[0];
            if (parse.currentTextFile) {
                var currentFile = parse.currentTextFile;
                if (fs.existsSync(currentFile))
                    this.currentTextFile = vscode.Uri.file(currentFile);
                else if (currentFile.includes('input')) {
                    this.currentTextFile = vscode.Uri.file('');
                }
                else
                    this.currentTextFile = vscode.Uri.file(path.join(this.getInputDirectory().fsPath, currentFile));
                if (parse.currentPassFile) {
                    currentFile = parse.currentPassFile;
                    if (fs.existsSync(currentFile))
                        this.currentPassFile = vscode.Uri.file(currentFile);
                    else
                        this.currentPassFile = vscode.Uri.file(path.join(this.getSpecDirectory().fsPath, currentFile));
                }
                vscode.commands.executeCommand('status.update');
                this.outputDirectory();
            }
        }
    }
    hasText() {
        return this.currentTextFile.fsPath.length ? true : false;
    }
    newAnalyzer() {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: 'newanalyzer', prompt: 'Enter new analyzer name' }).then(newname => {
                if (newname) {
                    this.createNewAnalyzer(newname);
                    return newname;
                }
            });
        }
        return '';
    }
    zeroAnalyzer() {
        this.analyzerDir = vscode.Uri.file('');
        this.specDir = vscode.Uri.file('');
        this.inputDir = vscode.Uri.file('');
        this.outputDir = vscode.Uri.file('');
        this.kbDir = vscode.Uri.file('');
        this.currentTextFile = vscode.Uri.file('');
        this.passNum = 0;
        this.loaded = false;
    }
    createNewAnalyzer(analyzerName) {
        visualText_1.visualText.readState();
        this.analyzerDir = vscode.Uri.file(path.join(visualText_1.visualText.getWorkspaceFolder().fsPath, analyzerName));
        if (fs.existsSync(this.analyzerDir.fsPath)) {
            vscode.window.showWarningMessage('Analyzer folder already exists');
            return false;
        }
        else if (!visualText_1.visualText.visualTextDirectoryExists()) {
            vscode.window.showWarningMessage('NLP Engine not found');
            return false;
        }
        else {
            let items = [];
            var fromDir = path.join(visualText_1.visualText.getVisualTextDirectory('analyzers'));
            if (dirfuncs_1.dirfuncs.isDir(fromDir)) {
                let files = dirfuncs_1.dirfuncs.getDirectories(vscode.Uri.file(fromDir));
                for (let file of files) {
                    if (dirfuncs_1.dirfuncs.isDir(file.fsPath)) {
                        items.push({ label: path.basename(file.fsPath), description: ' (analyzer template)' });
                    }
                }
                vscode.window.showQuickPick(items).then(selection => {
                    if (!selection) {
                        return false;
                    }
                    this.makeNewAnalyzer(fromDir, selection.label);
                    this.loaded = true;
                    return true;
                });
            }
            else {
                fromDir = path.join(visualText_1.visualText.getVisualTextDirectory('visualText'));
                this.makeNewAnalyzer(fromDir, '');
            }
        }
        return false;
    }
    makeNewAnalyzer(fromDir, analyzer) {
        fromDir = path.join(fromDir, analyzer);
        if (!dirfuncs_1.dirfuncs.makeDir(this.analyzerDir.fsPath)) {
            vscode.window.showWarningMessage(`Could not make directory: ${fromDir}`);
            return false;
        }
        visualText_1.visualText.fileOps.addFileOperation(vscode.Uri.file(fromDir), this.analyzerDir, [fileOps_1.fileOpRefresh.ANALYZERS], fileOps_1.fileOperation.COPY);
        visualText_1.visualText.fileOps.startFileOps();
    }
    createAnaSequenceFile(content = '') {
        var cont = content.length ? content : '#\ntokenize	nil	# Gen:   Convert input to token list.';
        if (this.getSpecDirectory()) {
            var anaFile = path.join(this.getSpecDirectory().fsPath, visualText_1.visualText.ANALYZER_SEQUENCE_FILE);
            return dirfuncs_1.dirfuncs.writeFile(anaFile, cont);
        }
        return false;
    }
    saveStateFile() {
        if (this.currentPassFile.fsPath.length == 0 || this.currentTextFile.fsPath.length == 0) {
            if (this.jsonState.jsonParse(this.analyzerDir, 'state')) {
                var parse = this.jsonState.json.visualText[0];
                if (parse.currentTextFile && this.currentPassFile.fsPath.length == 0) {
                    var currentFile = parse.currentTextFile;
                    if (fs.existsSync(currentFile))
                        this.currentTextFile = vscode.Uri.file(currentFile);
                    else
                        this.currentTextFile = vscode.Uri.file(path.join(this.getInputDirectory().fsPath, currentFile));
                }
                if (parse.currentPassFile && this.currentPassFile.fsPath.length == 0) {
                    var currentFile = parse.currentPassFile;
                    if (fs.existsSync(currentFile))
                        this.currentPassFile = vscode.Uri.file(currentFile);
                    else
                        this.currentPassFile = vscode.Uri.file(path.join(this.getSpecDirectory().fsPath, currentFile));
                }
            }
        }
        this.saveAnalyzerState();
        this.outputDirectory();
    }
    saveAnalyzerState() {
        var stateJsonDefault = {
            "visualText": [
                {
                    "name": "Analyzer",
                    "type": "state",
                    "currentTextFile": this.currentTextFile.fsPath,
                    "currentPassFile": this.currentPassFile.fsPath
                }
            ]
        };
        this.jsonState.saveFile(this.analyzerDir.fsPath, 'state', stateJsonDefault);
    }
    getCurrentFile() {
        return this.currentTextFile;
    }
    saveCurrentFile(currentFile) {
        this.currentTextFile = currentFile;
        this.outputDirectory();
        this.saveAnalyzerState();
    }
    saveCurrentPass(passFile, passNum) {
        this.currentPassFile = passFile;
        this.passNum = passNum;
        this.saveAnalyzerState();
    }
    load(analyzerDir) {
        this.setWorkingDir(analyzerDir);
        this.readState();
        this.seqFile.init();
        vscode.commands.executeCommand('analyzerView.updateTitle', analyzerDir);
        if (this.currentTextFile.fsPath.length)
            vscode.commands.executeCommand('textView.updateTitle', vscode.Uri.file(this.currentTextFile.fsPath));
    }
    outputDirectory() {
        if (this.currentTextFile.fsPath.length > 2) {
            this.outputDir = vscode.Uri.file(this.currentTextFile.fsPath + visualText_1.visualText.LOG_SUFFIX);
        }
        else {
            this.outputDir = vscode.Uri.file(path.join(this.analyzerDir.fsPath, 'output'));
        }
    }
    clearOutputDirectory() {
        if (fs.lstatSync(this.outputDir.fsPath).isDirectory()) {
            fs.readdir(this.outputDir.fsPath, (err, files) => {
                if (err)
                    throw err;
                for (const file of files) {
                    fs.unlink(path.join(this.outputDir.fsPath, file), err => {
                        if (err)
                            throw err;
                    });
                }
            });
        }
    }
    treeFile(name) {
        if (this.logDir.fsPath.length) {
            var pather = path.join(this.logDir.fsPath, name);
            pather = pather.concat('.log');
            return vscode.Uri.file(pather);
        }
        return vscode.Uri.file('');
    }
    isLoaded() {
        return this.loaded;
    }
    setCurrentTextFile(filePath) {
        this.currentTextFile = filePath;
    }
    getAnalyzerDirectory(subDir = '') {
        return vscode.Uri.file(path.join(this.analyzerDir.fsPath, subDir));
    }
    getInputDirectory() {
        return this.inputDir;
    }
    getSpecDirectory() {
        return this.specDir;
    }
    getOutputDirectory() {
        return this.outputDir;
    }
    getLogDirectory() {
        return this.logDir;
    }
    getKBDirectory() {
        return this.kbDir;
    }
    getTextPath() {
        return this.currentTextFile;
    }
    getPassPath() {
        return this.currentPassFile;
    }
    getTreeFile() {
        var textFile = new textFile_1.TextFile();
        return textFile.anaFile(this.passNum, textFile_2.nlpFileType.TREE);
    }
    setWorkingDir(directory) {
        this.analyzerDir = directory;
        if (fs.existsSync(directory.fsPath)) {
            this.specDir = vscode.Uri.file(path.join(directory.fsPath, 'spec'));
            this.inputDir = vscode.Uri.file(path.join(directory.fsPath, 'input'));
            this.kbDir = vscode.Uri.file(path.join(directory.fsPath, 'kb', 'user'));
            this.logDir = vscode.Uri.file(path.join(directory.fsPath, 'logs'));
            this.loaded = true;
        }
        else
            this.loaded = false;
    }
    getAnalyzerConverting() {
        let moose = 1;
    }
}
exports.Analyzer = Analyzer;
//# sourceMappingURL=analyzer.js.map