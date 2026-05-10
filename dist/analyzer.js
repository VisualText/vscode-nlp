"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Analyzer = exports.analyzer = exports.anaSubDir = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const path = tslib_1.__importStar(require("path"));
const fs = tslib_1.__importStar(require("fs"));
const sequence_1 = require("./sequence");
const visualText_1 = require("./visualText");
const jsonState_1 = require("./jsonState");
const dirfuncs_1 = require("./dirfuncs");
const textFile_1 = require("./textFile");
const textFile_2 = require("./textFile");
const logView_1 = require("./logView");
const fileOps_1 = require("./fileOps");
const sequenceView_1 = require("./sequenceView");
var anaSubDir;
(function (anaSubDir) {
    anaSubDir[anaSubDir["UNKNOWN"] = 0] = "UNKNOWN";
    anaSubDir[anaSubDir["INPUT"] = 1] = "INPUT";
    anaSubDir[anaSubDir["KB"] = 2] = "KB";
    anaSubDir[anaSubDir["LOGS"] = 3] = "LOGS";
    anaSubDir[anaSubDir["OUTPUT"] = 4] = "OUTPUT";
    anaSubDir[anaSubDir["SPEC"] = 5] = "SPEC";
})(anaSubDir || (exports.anaSubDir = anaSubDir = {}));
;
class Analyzer {
    ;
    constructor() {
        this.seqFile = new sequence_1.SequenceFile();
        this.jsonState = new jsonState_1.JsonState();
        this.analyzerDir = vscode.Uri.file("");
        this.specDir = vscode.Uri.file("");
        this.inputDir = vscode.Uri.file("");
        this.outputDir = vscode.Uri.file("");
        this.kbDir = vscode.Uri.file("");
        this.logDir = vscode.Uri.file("");
        this.currentTextFile = vscode.Uri.file("");
        this.currentPassFile = vscode.Uri.file("");
        this.passNum = 0;
        this.loaded = false;
        this.hasLogs = false;
        this.timerCounter = 0;
        this.timerID = 0;
        this.analyzerCopyUri = vscode.Uri.file("");
        this.name = "";
    }
    readState() {
        if (this.jsonState.jsonParse(this.analyzerDir, "state")) {
            const parse = this.jsonState.json.visualText[0];
            if (parse.currentTextFile) {
                let currentFile = parse.currentTextFile;
                if (fs.existsSync(currentFile))
                    this.currentTextFile = vscode.Uri.file(currentFile);
                else if (currentFile.includes("input")) {
                    this.currentTextFile = vscode.Uri.file("");
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
                vscode.commands.executeCommand("status.update");
                this.outputDirectory();
            }
        }
    }
    modCreate(uri) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield vscode.window.showInputBox({ value: "filename", prompt: "Enter mod file name" }).then(newname => {
                if (newname) {
                    const filepath = path.join(uri.fsPath, newname + ".nlm");
                    if (fs.existsSync(filepath)) {
                        vscode.window.showWarningMessage("Mod file: " + filepath + " already exists");
                        return false;
                    }
                    const modUri = vscode.Uri.file(filepath);
                    visualText_1.visualText.modFiles.push(modUri);
                    dirfuncs_1.dirfuncs.writeFile(filepath, "# Description goes here");
                    visualText_1.visualText.setModFile(modUri);
                    vscode.commands.executeCommand("kbView.refreshAll");
                    return true;
                }
            });
        });
    }
    hasText() {
        return this.currentTextFile.fsPath.length ? true : false;
    }
    newAnalyzer(dir) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const exampleDir = visualText_1.visualText.getBlockAnalyzersPath().fsPath;
            const workDir = visualText_1.visualText.getWorkspaceFolder().fsPath;
            if (exampleDir == workDir) {
                const button = "Create analyzer reguardless";
                vscode.window.showInformationMessage("Any analyzer in the example analyzers folder will be lost when updated.", button).then(response => {
                    if (button === response) {
                        this.askToCreateNewAnalyzer(dir);
                    }
                });
            }
            else {
                this.askToCreateNewAnalyzer(dir);
            }
        }
        return "";
    }
    askToCreateNewAnalyzer(dir) {
        vscode.window.showInputBox({ value: "name", prompt: "Enter new analyzer name" }).then(newname => {
            if (newname) {
                this.createNewAnalyzer(dir, newname);
                return newname;
            }
        });
    }
    zeroAnalyzer() {
        this.analyzerDir = vscode.Uri.file("");
        this.specDir = vscode.Uri.file("");
        this.inputDir = vscode.Uri.file("");
        this.outputDir = vscode.Uri.file("");
        this.kbDir = vscode.Uri.file("");
        this.currentTextFile = vscode.Uri.file("");
        this.name = "";
        this.passNum = 0;
        this.loaded = false;
    }
    createNewAnalyzer(dir, analyzerName) {
        visualText_1.visualText.readState();
        this.analyzerDir = vscode.Uri.file(path.join(dir.fsPath, analyzerName));
        if (fs.existsSync(this.analyzerDir.fsPath)) {
            vscode.window.showWarningMessage("Analyzer already exists");
            return false;
        }
        else if (!visualText_1.visualText.visualTextDirectoryExists()) {
            vscode.window.showWarningMessage("Block analyzer files missing");
            return false;
        }
        else {
            const items = [];
            let fromDir = path.join(visualText_1.visualText.getVisualTextDirectory("analyzers"));
            if (dirfuncs_1.dirfuncs.isDir(fromDir)) {
                const files = dirfuncs_1.dirfuncs.getDirectories(vscode.Uri.file(fromDir));
                const dirMap = {};
                for (const file of files) {
                    const basename = path.basename(file.fsPath);
                    if (dirfuncs_1.dirfuncs.isDir(file.fsPath)) {
                        const readme = path.join(file.fsPath, "README.MD");
                        let descr, tit;
                        ({ title: tit, description: descr } = this.readDescription(readme));
                        items.push({ label: tit, description: descr });
                        dirMap[tit] = basename;
                    }
                }
                vscode.window.showQuickPick(items, { title: "Creating New Analyzer", canPickMany: true, placeHolder: "Choose analyzer block" }).then(selections => {
                    if (!selections) {
                        return false;
                    }
                    if (selections.length == 1) {
                        let dirName = dirMap[selections[0].label];
                        this.makeNewAnalyzer(fromDir, dirName);
                        visualText_1.visualText.fileOps.startFileOps();
                        this.loaded = true;
                        return true;
                    }
                    this.makeNewAnalyzer(fromDir, "Bare Minimum");
                    const toDir = this.analyzerDir.fsPath;
                    visualText_1.visualText.fileOps.addFileOperation(vscode.Uri.file(fromDir), vscode.Uri.file(toDir), [fileOps_1.fileOpRefresh.ANALYZER], fileOps_1.fileOperation.ANASEL, "1");
                    for (const selection of selections) {
                        sequenceView_1.sequenceView.insertAnalyzerBlock(fromDir, toDir, selection.label);
                    }
                    this.loaded = true;
                    visualText_1.visualText.fileOps.startFileOps();
                    return true;
                });
            }
            else {
                fromDir = path.join(visualText_1.visualText.getVisualTextDirectory("visualText"));
                this.makeNewAnalyzer(fromDir, "");
                return true;
            }
        }
        return false;
    }
    readDescription(filepath) {
        if (!fs.existsSync(filepath))
            return { title: "", description: "" };
        const textFile = new textFile_1.TextFile(filepath);
        let line = "";
        let description = "";
        let count = 0;
        let title = "";
        const lines = textFile.getLines();
        for (const line of lines) {
            let l = line.toString().trim();
            if (title.length == 0 && l.length > 0) {
                if (l.startsWith("# ")) {
                    l = l.substring(2);
                }
                title = l;
            }
            else if (title.length > 0 && l.length > 0) {
                description += l;
                if (count > 0 && description.length > 5)
                    break;
            }
            count++;
        }
        return { title, description };
    }
    makeNewAnalyzer(fromDir, analyzer) {
        fromDir = path.join(fromDir, analyzer);
        if (!dirfuncs_1.dirfuncs.makeDir(this.analyzerDir.fsPath)) {
            vscode.window.showWarningMessage(`Could not make directory: ${fromDir}`);
            return false;
        }
        visualText_1.visualText.fileOps.addFileOperation(vscode.Uri.file(fromDir), this.analyzerDir, [fileOps_1.fileOpRefresh.ANALYZERS], fileOps_1.fileOperation.COPY);
        visualText_1.visualText.fileOps.addFileOperation(vscode.Uri.file(fromDir), this.analyzerDir, [fileOps_1.fileOpRefresh.ANALYZERS], fileOps_1.fileOperation.ANALOAD);
    }
    createAnaSequenceFile(content = "") {
        const cont = content.length ? content : "#\ntokenize	nil	# Gen:   Convert input to token list.";
        if (this.getSpecDirectory()) {
            const anaFile = path.join(this.getSpecDirectory().fsPath, visualText_1.visualText.ANALYZER_SEQUENCE_FILE);
            return dirfuncs_1.dirfuncs.writeFile(anaFile, cont);
        }
        return false;
    }
    saveStateFile() {
        if (this.currentPassFile.fsPath.length == 0 || this.currentTextFile.fsPath.length == 0) {
            if (this.jsonState.jsonParse(this.analyzerDir, "state")) {
                const parse = this.jsonState.json.visualText[0];
                if (parse.currentTextFile && this.currentPassFile.fsPath.length == 0) {
                    const currentFile = parse.currentTextFile;
                    if (fs.existsSync(currentFile))
                        this.currentTextFile = vscode.Uri.file(currentFile);
                    else
                        this.currentTextFile = vscode.Uri.file(path.join(this.getInputDirectory().fsPath, currentFile));
                }
                if (parse.currentPassFile && this.currentPassFile.fsPath.length == 0) {
                    const currentFile = parse.currentPassFile;
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
        const stateJsonDefault = {
            "visualText": [
                {
                    "name": "Analyzer",
                    "type": "state",
                    "currentTextFile": this.currentTextFile.fsPath,
                    "currentPassFile": this.currentPassFile.fsPath
                }
            ]
        };
        this.jsonState.saveFile(this.analyzerDir.fsPath, "state", stateJsonDefault);
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
        this.checkHierFile();
        vscode.commands.executeCommand("analyzerView.updateTitle", analyzerDir);
        if (this.currentTextFile.fsPath.length > 2)
            vscode.commands.executeCommand("textView.updateTitle", vscode.Uri.file(this.currentTextFile.fsPath));
    }
    checkHierFile() {
        const kbPath = visualText_1.visualText.analyzer.getKBDirectory();
        const hierPath = path.join(kbPath.fsPath, "hier.kb");
        if (fs.existsSync(hierPath)) {
            const currHierText = new textFile_1.TextFile(hierPath);
            visualText_1.visualText.getExtensionDirs();
            const extPath = visualText_1.visualText.getExtensionPath();
            const extHierPath = path.join(extPath.fsPath, "nlp-engine", "visualtext", "analyzers", "basic", "kb", "user", "hier.kb");
            if (fs.existsSync(extHierPath)) {
                const basicHierText = new textFile_1.TextFile(extHierPath);
                if (basicHierText.getText() != currHierText.getText()) {
                    visualText_1.visualText.debugMessage("Updating hier.kb file", logView_1.logLineType.UPDATER);
                    currHierText.setText(basicHierText.getText());
                    currHierText.saveFile();
                }
            }
        }
    }
    outputDirectory() {
        if (this.currentTextFile.fsPath.length > 2) {
            this.outputDir = vscode.Uri.file(this.currentTextFile.fsPath + visualText_1.visualText.LOG_SUFFIX);
        }
        else {
            this.outputDir = vscode.Uri.file(path.join(this.analyzerDir.fsPath, "output"));
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
            let pather = path.join(this.logDir.fsPath, name);
            pather = pather.concat(".log");
            return vscode.Uri.file(pather);
        }
        return vscode.Uri.file("");
    }
    isLoaded() {
        return this.loaded;
    }
    setCurrentTextFile(filePath) {
        this.currentTextFile = filePath;
    }
    getAnalyzerDirectory(subDir = "") {
        return vscode.Uri.file(path.join(this.analyzerDir.fsPath, subDir));
    }
    getInputDirectory() {
        return this.inputDir;
    }
    getSpecDirectory() {
        return this.specDir;
    }
    getOutputDirectory(filename = "") {
        if (filename.length)
            return vscode.Uri.file(path.join(visualText_1.visualText.analyzer.getOutputDirectory().fsPath, filename));
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
        const textFile = new textFile_1.TextFile();
        return textFile.anaFile(this.passNum, textFile_2.nlpFileType.TREE);
    }
    getName() {
        return this.name;
    }
    folderHasTests(folder) {
        const files = dirfuncs_1.dirfuncs.getFiles(folder);
        for (const testFile of files) {
            if (testFile.fsPath.endsWith(visualText_1.visualText.TEST_SUFFIX))
                return true;
        }
        return false;
    }
    fileHasTests(file) {
        const testFolder = file.fsPath + visualText_1.visualText.TEST_SUFFIX;
        if (fs.existsSync(testFolder))
            return true;
        return false;
    }
    testFolder(uri, outputDirFlag = false) {
        const input = visualText_1.visualText.analyzer.getInputDirectory();
        let relPath = uri.fsPath.substring(input.fsPath.length + 1, uri.fsPath.length);
        if (outputDirFlag) {
            relPath = path.dirname(relPath);
            relPath = relPath.substring(0, relPath.length - 4);
        }
        const folderName = relPath + visualText_1.visualText.TEST_SUFFIX;
        const testDir = path.join(input.fsPath, folderName);
        return vscode.Uri.file(testDir);
    }
    setWorkingDir(directory) {
        this.analyzerDir = directory;
        if (fs.existsSync(directory.fsPath)) {
            this.name = path.basename(directory.fsPath);
            this.specDir = this.constructDir(directory, anaSubDir.SPEC);
            ;
            this.inputDir = this.constructDir(directory, anaSubDir.INPUT);
            this.kbDir = this.constructDir(directory, anaSubDir.KB);
            this.logDir = this.constructDir(directory, anaSubDir.LOGS);
            this.loaded = true;
        }
        else
            this.loaded = false;
    }
    constructDir(analyzerDir, dir) {
        return vscode.Uri.file(path.join(analyzerDir.fsPath, this.anaSubDirPath(dir)));
    }
    anaSubDirPath(dir) {
        let pathStr = "";
        switch (dir) {
            case anaSubDir.INPUT:
                pathStr = "input";
                break;
            case anaSubDir.KB:
                pathStr = path.join("kb", "user");
                break;
            case anaSubDir.SPEC:
                pathStr = visualText_1.visualText.ANALYZER_SEQUENCE_FOLDER;
                break;
            case anaSubDir.LOGS:
                pathStr = "logs";
                break;
            case anaSubDir.OUTPUT:
                pathStr = "output";
                break;
        }
        return pathStr;
    }
    getAnalyzerConverting() {
        return this.getAnalyzerConverting;
    }
}
exports.Analyzer = Analyzer;
//# sourceMappingURL=analyzer.js.map