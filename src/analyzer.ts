import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { SequenceFile } from "./sequence";
import { visualText } from "./visualText";
import { JsonState } from "./jsonState";
import { dirfuncs } from "./dirfuncs";
import { TextFile } from "./textFile";
import { nlpFileType } from "./textFile";
import { logLineType } from "./logView";
import { fileOpRefresh, fileOperation } from "./fileOps";
import { sequenceView } from "./sequenceView";

export enum anaSubDir { UNKNOWN, INPUT, KB, LOGS, OUTPUT, SPEC };

export let analyzer: Analyzer;
export class Analyzer {

    public seqFile = new SequenceFile();
    private jsonState = new JsonState();
    private analyzerDir: vscode.Uri = vscode.Uri.file("");
    private specDir: vscode.Uri = vscode.Uri.file("");
    private inputDir: vscode.Uri = vscode.Uri.file("");
    private outputDir: vscode.Uri = vscode.Uri.file("");
    private kbDir: vscode.Uri = vscode.Uri.file("");
    private logDir: vscode.Uri = vscode.Uri.file("");
    private currentTextFile: vscode.Uri = vscode.Uri.file("");
    private currentPassFile: vscode.Uri = vscode.Uri.file("");
    private passNum: number = 0;;
    private loaded: boolean = false;

    public hasLogs: boolean = false;
    public timerCounter: number = 0;
    public timerID: number = 0;
    public analyzerCopyUri: vscode.Uri = vscode.Uri.file("");
    public name: string = "";

    constructor() {
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

    async modCreate(uri: vscode.Uri) {
        await vscode.window.showInputBox({ value: "filename", prompt: "Enter mod file name" }).then(newname => {
            if (newname) {
                const filepath = path.join(uri.fsPath, newname + ".nlm");
                if (fs.existsSync(filepath)) {
                    vscode.window.showWarningMessage("Mod file: " + filepath + " already exists");
                    return false;
                }
                const modUri = vscode.Uri.file(filepath);
                visualText.modFiles.push(modUri);
                dirfuncs.writeFile(filepath, "# Description goes here");
                visualText.setModFile(modUri);
                vscode.commands.executeCommand("kbView.refreshAll");
                return true;
            }
        });
    }

    hasText(): boolean {
        return this.currentTextFile.fsPath.length ? true : false;
    }

    newAnalyzer(dir: vscode.Uri): string {
        if (visualText.hasWorkspaceFolder()) {
            const exampleDir = visualText.getBlockAnalyzersPath().fsPath;
            const workDir = visualText.getWorkspaceFolder().fsPath;

            if (exampleDir == workDir) {
                const button = "Create analyzer reguardless";
                vscode.window.showInformationMessage("Any analyzer in the example analyzers folder will be lost when updated.", button).then(response => {
                    if (button === response) {
                        this.askToCreateNewAnalyzer(dir);
                    }
                });
            } else {
                this.askToCreateNewAnalyzer(dir);
            }
        }
        return "";
    }

    askToCreateNewAnalyzer(dir: vscode.Uri) {
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

    createNewAnalyzer(dir: vscode.Uri, analyzerName: string): boolean {
        visualText.readState();
        this.analyzerDir = vscode.Uri.file(path.join(dir.fsPath, analyzerName));
        if (fs.existsSync(this.analyzerDir.fsPath)) {
            vscode.window.showWarningMessage("Analyzer already exists");
            return false;
        } else if (!visualText.visualTextDirectoryExists()) {
            vscode.window.showWarningMessage("Block analyzer files missing");
            return false;
        } else {
            const items: vscode.QuickPickItem[] = [];
            let fromDir = path.join(visualText.getVisualTextDirectory("analyzers"));
            if (dirfuncs.isDir(fromDir)) {
                const files = dirfuncs.getDirectories(vscode.Uri.file(fromDir));
                const dirMap: { [key: string]: string } = {};
                for (const file of files) {
                    const basename = path.basename(file.fsPath);
                    if (dirfuncs.isDir(file.fsPath)) {
                        const readme = path.join(file.fsPath, "README.MD");
                        let descr: string, tit: string;
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
                        visualText.fileOps.startFileOps();
                        this.loaded = true;
                        return true;
                    }
                    this.makeNewAnalyzer(fromDir, "Bare Minimum");
                    const toDir = this.analyzerDir.fsPath;
                    visualText.fileOps.addFileOperation(vscode.Uri.file(fromDir), vscode.Uri.file(toDir), [fileOpRefresh.ANALYZER], fileOperation.ANASEL, "1");
                    for (const selection of selections) {
                        sequenceView.insertAnalyzerBlock(fromDir, toDir, selection.label);
                    }
                    this.loaded = true;
                    visualText.fileOps.startFileOps();
                    return true;
                });

            } else {
                fromDir = path.join(visualText.getVisualTextDirectory("visualText"));
                this.makeNewAnalyzer(fromDir, "");
                return true;
            }

        }
        return false;
    }

    public readDescription(filepath: string): { title: string, description: string } {
        if (!fs.existsSync(filepath))
            return { title: "", description: "" };
        const textFile = new TextFile(filepath);

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
            } else if (title.length > 0 && l.length > 0) {
                description += l;
                if (count > 0 && description.length > 5)
                    break;
            }
            count++;
        }

        return { title, description };
    }

    makeNewAnalyzer(fromDir: string, analyzer: string) {
        fromDir = path.join(fromDir, analyzer);
        if (!dirfuncs.makeDir(this.analyzerDir.fsPath)) {
            vscode.window.showWarningMessage(`Could not make directory: ${fromDir}`);
            return false;
        }
        visualText.fileOps.addFileOperation(vscode.Uri.file(fromDir), this.analyzerDir, [fileOpRefresh.ANALYZERS], fileOperation.COPY);
        visualText.fileOps.addFileOperation(vscode.Uri.file(fromDir), this.analyzerDir, [fileOpRefresh.ANALYZERS], fileOperation.ANALOAD);
    }

    createAnaSequenceFile(content: string = ""): boolean {
        const cont = content.length ? content : "#\ntokenize	nil	# Gen:   Convert input to token list.";
        if (this.getSpecDirectory()) {
            const anaFile = path.join(this.getSpecDirectory().fsPath, visualText.ANALYZER_SEQUENCE_FILE);
            return dirfuncs.writeFile(anaFile, cont);
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
        const stateJsonDefault: any = {
            "visualText": [
                {
                    "name": "Analyzer",
                    "type": "state",
                    "currentTextFile": this.currentTextFile.fsPath,
                    "currentPassFile": this.currentPassFile.fsPath
                }
            ]
        }
        this.jsonState.saveFile(this.analyzerDir.fsPath, "state", stateJsonDefault);
    }

    getCurrentFile(): vscode.Uri {
        return this.currentTextFile;
    }

    saveCurrentFile(currentFile: vscode.Uri) {
        this.currentTextFile = currentFile;
        this.outputDirectory();
        this.saveAnalyzerState();
    }

    saveCurrentPass(passFile: vscode.Uri, passNum: number) {
        this.currentPassFile = passFile;
        this.passNum = passNum;
        this.saveAnalyzerState();
    }

    load(analyzerDir: vscode.Uri) {
        this.setWorkingDir(analyzerDir);
        this.readState();
        this.seqFile.init();
        this.checkHierFile();
        vscode.commands.executeCommand("analyzerView.updateTitle", analyzerDir);
        if (this.currentTextFile.fsPath.length > 2)
            vscode.commands.executeCommand("textView.updateTitle", vscode.Uri.file(this.currentTextFile.fsPath));
    }

    checkHierFile() {
        const kbPath = visualText.analyzer.getKBDirectory();
        const hierPath = path.join(kbPath.fsPath, "hier.kb");
        if (fs.existsSync(hierPath)) {
            const currHierText = new TextFile(hierPath);
            visualText.getExtensionDirs();
            const extPath = visualText.getExtensionPath();
            const extHierPath = path.join(extPath.fsPath, "nlp-engine", "visualtext", "analyzers", "basic", "kb", "user", "hier.kb");
            if (fs.existsSync(extHierPath)) {
                const basicHierText = new TextFile(extHierPath);
                if (basicHierText.getText() != currHierText.getText()) {
                    visualText.debugMessage("Updating hier.kb file", logLineType.UPDATER);
                    currHierText.setText(basicHierText.getText());
                    currHierText.saveFile();
                }
            }
        }
    }

    outputDirectory() {
        if (this.currentTextFile.fsPath.length > 2) {
            this.outputDir = vscode.Uri.file(this.currentTextFile.fsPath + visualText.LOG_SUFFIX);
        } else {
            this.outputDir = vscode.Uri.file(path.join(this.analyzerDir.fsPath, "output"));
        }
    }

    clearOutputDirectory() {
        if (fs.lstatSync(this.outputDir.fsPath).isDirectory()) {
            fs.readdir(this.outputDir.fsPath, (err, files) => {
                if (err) throw err;

                for (const file of files) {
                    fs.unlink(path.join(this.outputDir.fsPath, file), err => {
                        if (err) throw err;
                    });
                }
            });
        }
    }

    treeFile(name: string): vscode.Uri {
        if (this.logDir.fsPath.length) {
            let pather = path.join(this.logDir.fsPath, name);
            pather = pather.concat(".log");
            return vscode.Uri.file(pather);
        }
        return vscode.Uri.file("");
    }

    isLoaded(): boolean {
        return this.loaded;
    }

    setCurrentTextFile(filePath: vscode.Uri) {
        this.currentTextFile = filePath;
    }

    getAnalyzerDirectory(subDir: string = ""): vscode.Uri {
        return vscode.Uri.file(path.join(this.analyzerDir.fsPath, subDir));
    }

    getInputDirectory(): vscode.Uri {
        return this.inputDir;
    }

    getSpecDirectory(): vscode.Uri {
        return this.specDir;
    }

    getOutputDirectory(filename: string = ""): vscode.Uri {
        if (filename.length)
            return vscode.Uri.file(path.join(visualText.analyzer.getOutputDirectory().fsPath, filename));
        return this.outputDir;
    }

    getLogDirectory(): vscode.Uri {
        return this.logDir;
    }

    getKBDirectory(): vscode.Uri {
        return this.kbDir;
    }

    getTextPath(): vscode.Uri {
        return this.currentTextFile;
    }

    getPassPath(): vscode.Uri {
        return this.currentPassFile;
    }

    getTreeFile(): vscode.Uri {
        const textFile = new TextFile();
        return textFile.anaFile(this.passNum, nlpFileType.TREE);
    }

    getName(): string {
        return this.name;
    }

    folderHasTests(folder: vscode.Uri): boolean {
        const files = dirfuncs.getFiles(folder);
        for (const testFile of files) {
            if (testFile.fsPath.endsWith(visualText.TEST_SUFFIX))
                return true;
        }
        return false;
    }

    fileHasTests(file: vscode.Uri): boolean {
        const testFolder = file.fsPath + visualText.TEST_SUFFIX;
        if (fs.existsSync(testFolder))
            return true;
        return false;
    }

    testFolder(uri: vscode.Uri, outputDirFlag: boolean = false): vscode.Uri {
        const input = visualText.analyzer.getInputDirectory();
        let relPath = uri.fsPath.substring(input.fsPath.length + 1, uri.fsPath.length);
        if (outputDirFlag) {
            relPath = path.dirname(relPath);
            relPath = relPath.substring(0, relPath.length - 4);
        }
        const folderName = relPath + visualText.TEST_SUFFIX;
        const testDir = path.join(input.fsPath, folderName);
        return vscode.Uri.file(testDir);
    }

    setWorkingDir(directory: vscode.Uri) {
        this.analyzerDir = directory;
        if (fs.existsSync(directory.fsPath)) {
            this.name = path.basename(directory.fsPath);
            this.specDir = this.constructDir(directory, anaSubDir.SPEC);;
            this.inputDir = this.constructDir(directory, anaSubDir.INPUT);
            this.kbDir = this.constructDir(directory, anaSubDir.KB);
            this.logDir = this.constructDir(directory, anaSubDir.LOGS);
            this.loaded = true;
        }
        else
            this.loaded = false;
    }

    constructDir(analyzerDir: vscode.Uri, dir: anaSubDir): vscode.Uri {
        return vscode.Uri.file(path.join(analyzerDir.fsPath, this.anaSubDirPath(dir)));
    }

    anaSubDirPath(dir: anaSubDir): string {
        let pathStr = "";
        switch (dir) {
            case anaSubDir.INPUT:
                pathStr = "input";
                break;
            case anaSubDir.KB:
                pathStr = path.join("kb", "user");
                break;
            case anaSubDir.SPEC:
                pathStr = visualText.ANALYZER_SEQUENCE_FOLDER;
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
