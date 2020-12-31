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
const logfile_1 = require("./logfile");
const textFile_1 = require("./textFile");
class Analyzer {
    constructor() {
        this.seqFile = new sequence_1.SequenceFile();
        this.jsonState = new jsonState_1.JsonState();
        this.analyzerDir = vscode.Uri.file('');
        this.specDir = vscode.Uri.file('');
        this.inputDir = vscode.Uri.file('');
        this.outputDir = vscode.Uri.file('');
        this.logDir = vscode.Uri.file('');
        this.currentTextFile = vscode.Uri.file('');
        this.currentPassFile = vscode.Uri.file('');
        this.passNum = 0;
        this.loaded = false;
    }
    ;
    readState() {
        if (this.jsonState.jsonParse(this.analyzerDir, 'state', 'visualText')) {
            var parse = this.jsonState.json.visualText[0];
            if (parse.currentTextFile) {
                var currentFile = parse.currentTextFile;
                if (fs.existsSync(currentFile))
                    this.currentTextFile = vscode.Uri.file(currentFile);
                else
                    this.currentTextFile = vscode.Uri.file(path.join(this.getInputDirectory().path, currentFile));
                if (parse.currentPassFile) {
                    currentFile = parse.currentPassFile;
                    if (fs.existsSync(currentFile))
                        this.currentPassFile = vscode.Uri.file(currentFile);
                    else
                        this.currentPassFile = vscode.Uri.file(path.join(this.getSpecDirectory().path, currentFile));
                }
                vscode.commands.executeCommand('status.update');
                this.outputDirectory();
            }
        }
    }
    hasText() {
        return this.currentTextFile.path.length ? true : false;
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
        this.currentTextFile = vscode.Uri.file('');
        this.passNum = 0;
        this.loaded = false;
    }
    createNewAnalyzer(analyzerName) {
        visualText_1.visualText.readState();
        this.analyzerDir = vscode.Uri.file(path.join(visualText_1.visualText.getWorkspaceFolder().path, analyzerName));
        if (fs.existsSync(this.analyzerDir.path)) {
            vscode.window.showWarningMessage('Analyzer folder already exists');
            return false;
        }
        else if (!visualText_1.visualText.visualTextDirectoryExists()) {
            vscode.window.showWarningMessage('NLP Engine not set. Set in state.json in main directory.');
            return false;
        }
        else {
            var fromDir = path.join(visualText_1.visualText.getVisualTextDirectory('analyzer'));
            if (!dirfuncs_1.dirfuncs.makeDir(this.analyzerDir.path)) {
                vscode.window.showWarningMessage(`Could not make directory: ${fromDir}`);
                return false;
            }
            if (!dirfuncs_1.dirfuncs.copyDirectory(fromDir, this.analyzerDir.path)) {
                vscode.window.showWarningMessage('Copy directory for new analyzer failed');
                return false;
            }
            this.load(this.analyzerDir);
            vscode.commands.executeCommand('textView.refreshAll');
            vscode.commands.executeCommand('outputView.refreshAll');
            vscode.commands.executeCommand('sequenceView.refreshAll');
            vscode.commands.executeCommand('analyzerView.refreshAll');
            this.loaded = true;
            return true;
        }
    }
    createAnaSequenceFile(content = '') {
        var cont = content.length ? content : '#\ntokenize	nil	# Gen:   Convert input to token list.';
        if (this.getSpecDirectory()) {
            var anaFile = path.join(this.getSpecDirectory().path, 'analyzer.seq');
            return dirfuncs_1.dirfuncs.writeFile(anaFile, cont);
        }
        return false;
    }
    saveStateFile() {
        if (this.currentPassFile.path.length == 0 || this.currentTextFile.path.length == 0) {
            if (this.jsonState.jsonParse(this.analyzerDir, 'state', 'visualText')) {
                var parse = this.jsonState.json.visualText[0];
                if (parse.currentTextFile && this.currentPassFile.path.length == 0) {
                    var currentFile = parse.currentTextFile;
                    if (fs.existsSync(currentFile))
                        this.currentTextFile = vscode.Uri.file(currentFile);
                    else
                        this.currentTextFile = vscode.Uri.file(path.join(this.getInputDirectory().path, currentFile));
                }
                if (parse.currentPassFile && this.currentPassFile.path.length == 0) {
                    var currentFile = parse.currentPassFile;
                    if (fs.existsSync(currentFile))
                        this.currentPassFile = vscode.Uri.file(currentFile);
                    else
                        this.currentPassFile = vscode.Uri.file(path.join(this.getSpecDirectory().path, currentFile));
                }
            }
        }
        var stateJsonDefault = {
            "visualText": [
                {
                    "name": "Analyzer",
                    "type": "state",
                    "currentTextFile": this.currentTextFile.path,
                    "currentPassFile": this.currentPassFile.path
                }
            ]
        };
        this.jsonState.saveFile(this.analyzerDir.path, 'state', stateJsonDefault);
        this.outputDirectory();
    }
    saveCurrentFile(currentFile) {
        this.currentTextFile = currentFile;
        this.saveStateFile();
    }
    saveCurrentPass(passFile, passNum) {
        this.currentPassFile = passFile;
        this.passNum = passNum;
        this.saveStateFile();
    }
    load(analyzerDir) {
        this.setWorkingDir(analyzerDir);
        this.readState();
        this.seqFile.init();
        vscode.commands.executeCommand('analyzerView.updateTitle', analyzerDir);
        if (this.currentTextFile.path.length)
            vscode.commands.executeCommand('textView.updateTitle', vscode.Uri.file(this.currentTextFile.path));
    }
    outputDirectory() {
        if (this.currentTextFile.path.length) {
            this.outputDir = vscode.Uri.file(this.currentTextFile.path + '_log');
        }
        else {
            this.outputDir = vscode.Uri.file(path.join(this.analyzerDir.path, 'output'));
        }
    }
    clearOutputDirectory() {
        if (fs.lstatSync(this.outputDir.path).isDirectory()) {
            fs.readdir(this.outputDir.path, (err, files) => {
                if (err)
                    throw err;
                for (const file of files) {
                    fs.unlink(path.join(this.outputDir.path, file), err => {
                        if (err)
                            throw err;
                    });
                }
            });
        }
    }
    logFile(name) {
        if (this.logDir.path.length) {
            var pather = path.join(this.logDir.path, name);
            pather = pather.concat('.log');
            return vscode.Uri.file(pather);
        }
        return vscode.Uri.file('');
    }
    isLoaded() {
        return this.loaded;
    }
    getAnalyzerDirectory(subDir = '') {
        return vscode.Uri.file(path.join(this.analyzerDir.path, subDir));
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
    getTextPath() {
        return this.currentTextFile;
    }
    getPassPath() {
        return this.currentPassFile;
    }
    getAnaLogFile() {
        var logFile = new logfile_1.LogFile();
        return logFile.anaFile(this.passNum, textFile_1.nlpFileType.TREE);
    }
    setWorkingDir(directory) {
        this.analyzerDir = directory;
        if (fs.existsSync(directory.path)) {
            this.specDir = vscode.Uri.file(path.join(directory.path, 'spec'));
            this.inputDir = vscode.Uri.file(path.join(directory.path, 'input'));
            this.logDir = vscode.Uri.file(path.join(directory.path, 'logs'));
            this.loaded = true;
        }
        else
            this.loaded = false;
    }
}
exports.Analyzer = Analyzer;
//# sourceMappingURL=analyzer.js.map