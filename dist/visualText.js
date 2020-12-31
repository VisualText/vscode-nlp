"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisualText = exports.visualText = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const analyzer_1 = require("./analyzer");
const dirfuncs_1 = require("./dirfuncs");
const jsonState_1 = require("./jsonState");
class VisualText {
    constructor(ctx) {
        this.analyzer = new analyzer_1.Analyzer();
        this.jsonState = new jsonState_1.JsonState();
        this.analyzers = new Array();
        this.engineDir = vscode.Uri.file('');
        this.analyzerDir = vscode.Uri.file('');
        this.currentAnalyzer = vscode.Uri.file('');
        this.workspaceFold = undefined;
        this._ctx = ctx;
    }
    static attach(ctx) {
        if (!exports.visualText) {
            exports.visualText = new VisualText(ctx);
            if (vscode.workspace.workspaceFolders) {
                exports.visualText.workspaceFold = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];
                if (exports.visualText.workspaceFold) {
                    exports.visualText.readState();
                    exports.visualText.getAnalyzers();
                    exports.visualText.initSettings();
                }
            }
        }
        return exports.visualText;
    }
    readState() {
        if (this.workspaceFold) {
            this.analyzerDir = this.workspaceFold.uri;
            if (this.jsonState.jsonParse(this.analyzerDir, 'state', 'visualText')) {
                var saveit = false;
                var parse = this.jsonState.json.visualText[0];
                var currAnalyzer = parse.currentAnalyzer;
                if (currAnalyzer.length == 0) {
                    var analyzers = dirfuncs_1.dirfuncs.getDirectories(this.workspaceFold.uri);
                    currAnalyzer = analyzers[0].path;
                    saveit = true;
                }
                if (currAnalyzer) {
                    if (fs.existsSync(currAnalyzer))
                        this.currentAnalyzer = vscode.Uri.file(currAnalyzer);
                    else
                        this.currentAnalyzer = vscode.Uri.file(path.join(this.analyzerDir.path, currAnalyzer));
                    if (parse.engineDir) {
                        if (parse.engineDir.length > 1) {
                            this.engineDir = vscode.Uri.file(path.join(parse.engineDir));
                        }
                        else {
                            this.findEngine();
                            saveit = true;
                        }
                    }
                    if (saveit)
                        this.saveCurrentAnalyzer(this.analyzerDir);
                    this.loadAnalyzer(this.currentAnalyzer);
                    return true;
                }
            }
            else {
                this.saveCurrentAnalyzer(this.analyzerDir);
            }
        }
        return false;
    }
    initSettings() {
        var fromDir = this.getVisualTextDirectory('.vscode');
        if (fs.existsSync(fromDir)) {
            var toDir = path.join(this.analyzerDir.path, '.vscode');
            if (!fs.existsSync(toDir)) {
                if (!dirfuncs_1.dirfuncs.copyDirectory(fromDir, toDir)) {
                    vscode.window.showWarningMessage('Copy settings file failed');
                    return false;
                }
                return true;
            }
            this.ensureExists('settings.json', toDir, fromDir);
            this.ensureExists('state.json', toDir, fromDir);
        }
        return false;
    }
    ensureExists(fileName, toDir, fromDir) {
        var toFile = path.join(toDir, fileName);
        if (!fs.existsSync(toFile)) {
            var fromFile = path.join(fromDir, fileName);
            fs.copyFileSync(fromFile, toFile);
        }
    }
    findEngine() {
        if (this.getEngineDirectory().path.length < 2) {
            this.engineDir = dirfuncs_1.dirfuncs.findFolder(this.getWorkspaceFolder(), 'nlp-engine');
        }
    }
    saveCurrentAnalyzer(currentAnalyzer) {
        this.findEngine();
        var stateJsonDefault = {
            "visualText": [
                {
                    "name": "Analyzer",
                    "type": "state",
                    "engineDir": this.getEngineDirectory().path,
                    "currentAnalyzer": currentAnalyzer.path
                }
            ]
        };
        this.jsonState.saveFile(this.analyzerDir.path, 'state', stateJsonDefault);
        this.setCurrentAnalyzer(currentAnalyzer);
    }
    loadAnalyzer(analyzerDirectory) {
        this.saveCurrentAnalyzer(analyzerDirectory);
        this.analyzer.load(analyzerDirectory);
        vscode.commands.executeCommand('textView.refreshAll');
        vscode.commands.executeCommand('sequenceView.refreshAll');
        vscode.commands.executeCommand('outputView.refreshAll');
    }
    setCurrentAnalyzer(currentAnalyzer) {
        if (this.jsonState.json) {
            var parse = this.jsonState.json.visualText[0];
            parse.currentAnalyzer = currentAnalyzer.path;
            this.jsonState.writeFile();
        }
    }
    getAnalyzer() {
        return this.currentAnalyzer;
    }
    getEngineDirectory() {
        return this.engineDir;
    }
    hasAnalyzers() {
        var i = 0;
        return this.analyzers.length ? true : false;
    }
    getAnalyzers() {
        if (this.analyzerDir.path.length) {
            this.analyzers = [];
            this.analyzers = dirfuncs_1.dirfuncs.getDirectories(this.analyzerDir);
        }
        return this.analyzers;
    }
    hasWorkspaceFolder() {
        var _a;
        return ((_a = this.workspaceFold) === null || _a === void 0 ? void 0 : _a.uri.path.length) ? true : false;
    }
    getWorkspaceFolder() {
        if (this.workspaceFold) {
            return this.workspaceFold.uri;
        }
        return vscode.Uri.file('');
    }
    visualTextDirectoryExists() {
        return fs.existsSync(this.getVisualTextDirectory());
    }
    getVisualTextDirectory(dirName = '') {
        if (dirName.length)
            return path.join(this.getEngineDirectory().path, 'visualtext', dirName);
        else
            return path.join(this.getEngineDirectory().path, 'visualtext');
    }
}
exports.VisualText = VisualText;
//# sourceMappingURL=visualText.js.map