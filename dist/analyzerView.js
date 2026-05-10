"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyzerView = exports.analyzerView = exports.AnalyzerTreeDataProvider = exports.analyzerItemType = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const path = tslib_1.__importStar(require("path"));
const fs = tslib_1.__importStar(require("fs"));
const visualText_1 = require("./visualText");
const dirfuncs_1 = require("./dirfuncs");
const textView_1 = require("./textView");
const fileOps_1 = require("./fileOps");
const sequence_1 = require("./sequence");
const textFile_1 = require("./textFile");
const analyzer_1 = require("./analyzer");
const compile_1 = require("./compile");
var analyzerItemType;
(function (analyzerItemType) {
    analyzerItemType[analyzerItemType["ANALYZER"] = 0] = "ANALYZER";
    analyzerItemType[analyzerItemType["FOLDER"] = 1] = "FOLDER";
    analyzerItemType[analyzerItemType["NLP"] = 2] = "NLP";
    analyzerItemType[analyzerItemType["SEQUENCE"] = 3] = "SEQUENCE";
    analyzerItemType[analyzerItemType["ECL"] = 4] = "ECL";
    analyzerItemType[analyzerItemType["MANIFEST"] = 5] = "MANIFEST";
    analyzerItemType[analyzerItemType["FILE"] = 6] = "FILE";
    analyzerItemType[analyzerItemType["README"] = 7] = "README";
})(analyzerItemType || (exports.analyzerItemType = analyzerItemType = {}));
class AnalyzerTreeDataProvider {
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    getChildren(analyzerItem) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            visualText_1.visualText.getAnalyzers(false);
            if (analyzerItem) {
                return this.getKeepers(analyzerItem.uri);
            }
            if (visualText_1.visualText.hasWorkspaceFolder() && visualText_1.visualText.hasAnalyzers()) {
                return this.getKeepers(visualText_1.visualText.getWorkspaceFolder());
            }
            return [];
        });
    }
    getMovement(analyzerItem) {
        analyzerItem.moveDown = false;
        analyzerItem.moveUp = false;
        const itemPath = analyzerItem.uri.fsPath;
        const parent = path.dirname(itemPath);
        const anaDir = visualText_1.visualText.getAnalyzerDir().fsPath;
        if (parent != anaDir) {
            analyzerItem.moveUp = true;
        }
        if (analyzerItem.type == analyzerItemType.FOLDER) {
            if (dirfuncs_1.dirfuncs.parentHasOtherDirs(analyzerItem.uri)) {
                analyzerItem.moveDown = true;
            }
        }
        else if (dirfuncs_1.dirfuncs.parentHasOtherDirs(vscode.Uri.file(itemPath))) {
            analyzerItem.moveDown = true;
        }
    }
    getTreeItem(analyzerItem) {
        const treeItem = new vscode.TreeItem(analyzerItem.uri, visualText_1.visualText.isAnalyzerDirectory(analyzerItem.uri) ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);
        this.getMovement(analyzerItem);
        let conVal = analyzerItem.moveDown ? 'moveDown' : '';
        if (analyzerItem.moveUp)
            conVal = conVal + 'moveUp';
        if (analyzerItem.hasReadme)
            conVal = conVal + 'readMe';
        const icon = this.fileIconFromType(analyzerItem.type);
        treeItem.iconPath = {
            light: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'light', icon)),
            dark: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'dark', icon))
        };
        if (analyzerItem.type === analyzerItemType.ANALYZER) {
            treeItem.command = { command: 'analyzerView.openAnalyzer', title: "Open Analyzer", arguments: [analyzerItem] };
            const hasLogs = treeItem.contextValue = analyzerItem.hasLogs ? 'hasLogs' : '';
            treeItem.contextValue = conVal + hasLogs + 'isAnalyzer';
            treeItem.tooltip = analyzerItem.uri.fsPath;
        }
        else if (analyzerItem.type === analyzerItemType.FOLDER) {
            treeItem.contextValue = conVal + 'isFolder';
            treeItem.tooltip = analyzerItem.uri.fsPath;
            treeItem.command = { command: 'analyzerView.openAnalyzer', title: "Open Analyzer", arguments: [analyzerItem] };
        }
        else if (analyzerItem.type === analyzerItemType.NLP) {
            treeItem.tooltip = analyzerItem.uri.fsPath;
            treeItem.collapsibleState = 0;
            treeItem.command = { command: 'analyzerView.openFile', title: "Open File", arguments: [analyzerItem] };
        }
        else {
            if (analyzerItem.uri.fsPath.endsWith('.ecl'))
                conVal = conVal + 'isECL';
            else if (analyzerItem.uri.fsPath.endsWith('.md'))
                conVal = conVal + 'isReadMe';
            treeItem.contextValue = conVal + 'isFile';
            treeItem.tooltip = analyzerItem.uri.fsPath;
            treeItem.collapsibleState = 0;
            treeItem.command = { command: 'analyzerView.openFile', title: "Open File", arguments: [analyzerItem] };
        }
        //treeItem.label = treeItem.label + ' ' + treeItem.contextValue;
        return treeItem;
    }
    getKeepers(dir) {
        const keepers = Array();
        const entries = dirfuncs_1.dirfuncs.getDirectoryTypes(dir);
        let type = analyzerItemType.ANALYZER;
        for (const entry of entries) {
            if (entry.type == vscode.FileType.Directory) {
                type = visualText_1.visualText.isAnalyzerDirectory(entry.uri) ? analyzerItemType.ANALYZER : analyzerItemType.FOLDER;
                const hasLogs = dirfuncs_1.dirfuncs.analyzerHasLogFiles(entry.uri);
                const hasReadme = dirfuncs_1.dirfuncs.hasFile(entry.uri, "README.md");
                keepers.push({ uri: entry.uri, type: type, hasLogs: hasLogs, hasPats: false, hasReadme: hasReadme, moveUp: false, moveDown: false });
            }
            else if (entry.type == vscode.FileType.File) {
                type = this.typeFromExtension(entry.uri);
                keepers.push({ uri: entry.uri, type: type, hasLogs: false, hasPats: false, hasReadme: false, moveUp: false, moveDown: false });
            }
        }
        const hasAllLogs = dirfuncs_1.dirfuncs.hasLogDirs(visualText_1.visualText.getWorkspaceFolder(), true);
        vscode.commands.executeCommand('setContext', 'analyzers.hasLogs', hasAllLogs);
        return keepers;
    }
    typeFromExtension(dir) {
        let type = analyzerItemType.FILE;
        const dirPath = dir.fsPath;
        if (dirPath.endsWith('.nlp'))
            type = analyzerItemType.NLP;
        else if (dirPath.endsWith('.seq'))
            type = analyzerItemType.SEQUENCE;
        else if (dirPath.endsWith('.ecl'))
            type = analyzerItemType.ECL;
        else if (dirPath.endsWith('.manifest'))
            type = analyzerItemType.MANIFEST;
        else if (dirPath.endsWith('.md'))
            type = analyzerItemType.README;
        return type;
    }
    fileIconFromType(type) {
        let icon = 'file.svg';
        if (type == analyzerItemType.ANALYZER) {
            icon = 'gear.svg';
        }
        else if (type == analyzerItemType.FOLDER) {
            icon = 'folder.svg';
        }
        else if (type == analyzerItemType.NLP) {
            icon = 'nlp.svg';
        }
        else if (type == analyzerItemType.SEQUENCE) {
            icon = 'seq-circle.svg';
        }
        else if (type == analyzerItemType.ECL) {
            icon = 'ecl.svg';
        }
        else if (type == analyzerItemType.MANIFEST) {
            icon = 'manifest.svg';
        }
        else if (type == analyzerItemType.README) {
            icon = 'readme.svg';
        }
        return icon;
    }
}
exports.AnalyzerTreeDataProvider = AnalyzerTreeDataProvider;
class AnalyzerView {
    constructor(context) {
        this.sequenceFile = new sequence_1.SequenceFile;
        const analyzerViewProvider = new AnalyzerTreeDataProvider();
        this.analyzerView = vscode.window.createTreeView('analyzerView', { treeDataProvider: analyzerViewProvider });
        vscode.commands.registerCommand('analyzerView.refreshAll', () => analyzerViewProvider.refresh());
        vscode.commands.registerCommand('analyzerView.newAnalyzer', (resource) => this.newAnalyzer(resource));
        vscode.commands.registerCommand('analyzerView.deleteAnalyzer', resource => this.deleteAnalyzer(resource));
        vscode.commands.registerCommand('analyzerView.deleteFile', resource => this.deleteFile(resource));
        vscode.commands.registerCommand('analyzerView.deleteFolder', resource => this.deleteFolder(resource));
        vscode.commands.registerCommand('analyzerView.loadExampleAnalyzers', resource => this.loadExampleAnalyzers());
        vscode.commands.registerCommand('analyzerView.openAnalyzer', resource => this.openAnalyzer(resource));
        vscode.commands.registerCommand('analyzerView.deleteAnalyzerLogs', resource => this.deleteAnalyzerLogs(resource));
        vscode.commands.registerCommand('analyzerView.deleteAllAnalyzerLogs', () => this.deleteAllAnalyzerLogs());
        vscode.commands.registerCommand('analyzerView.updateTitle', resource => this.updateTitle(resource));
        vscode.commands.registerCommand('analyzerView.copyAnalyzer', resource => this.copyAnalyzer(resource));
        vscode.commands.registerCommand('analyzerView.dupeAnalyzer', resource => this.dupeAnalyzer(resource));
        vscode.commands.registerCommand('analyzerView.explore', resource => this.explore(resource));
        vscode.commands.registerCommand('analyzerView.newFolder', resource => this.newFolder(resource));
        vscode.commands.registerCommand('analyzerView.moveToFolder', resource => this.moveToFolder(resource));
        vscode.commands.registerCommand('analyzerView.moveUp', resource => this.moveUp(resource));
        vscode.commands.registerCommand('analyzerView.readMe', resource => this.readMe(resource));
        vscode.commands.registerCommand('analyzerView.createReadMe', resource => this.editReadMe(resource));
        vscode.commands.registerCommand('analyzerView.editReadMe', resource => this.editReadMe(resource));
        vscode.commands.registerCommand('analyzerView.deleteReadMe', resource => this.deleteReadMe(resource));
        vscode.commands.registerCommand('analyzerView.moveDownFolder', resource => this.moveDownFolder(resource));
        vscode.commands.registerCommand('analyzerView.moveToParent', resource => this.moveToParent(resource));
        vscode.commands.registerCommand('analyzerView.renameAnalyzer', resource => this.renameAnalyzer(resource));
        vscode.commands.registerCommand('analyzerView.renameFile', resource => this.renameFile(resource));
        vscode.commands.registerCommand('analyzerView.renameFolder', resource => this.renameFolder(resource));
        vscode.commands.registerCommand('analyzerView.openFile', resource => this.openFile(resource));
        vscode.commands.registerCommand('analyzerView.importAnalyzers', resource => this.importAnalyzers(resource));
        vscode.commands.registerCommand('analyzerView.manifestGenerate', resource => this.manifestGenerate(resource));
        vscode.commands.registerCommand('analyzerView.newECLFile', resource => this.newECLFile(resource));
        vscode.commands.registerCommand('analyzerView.exploreAll', () => this.exploreAll());
        vscode.commands.registerCommand('analyzerView.copyAll', () => this.copyAll());
        vscode.commands.registerCommand('analyzerView.updateColorizer', () => this.updateColorizer());
        vscode.commands.registerCommand('analyzerView.video', () => this.video());
        vscode.commands.registerCommand('analyzerView.copyPath', () => this.copyPath());
        vscode.commands.registerCommand('analyzerView.compileAnalyzer', resource => this.compileAnalyzer(resource));
        visualText_1.visualText.colorizeAnalyzer();
        this.folderUri = undefined;
        this.converting = false;
    }
    static attach(ctx) {
        if (!exports.analyzerView) {
            exports.analyzerView = new AnalyzerView(ctx);
        }
        return exports.analyzerView;
    }
    copyPath() {
        const dir = visualText_1.visualText.getAnalyzerDir();
        vscode.env.clipboard.writeText(dir.fsPath);
    }
    checkForECLAnalyzersDir() {
        const items = visualText_1.visualText.analyzerList('analyzers');
        if (items.length == 0) {
            vscode.window.showWarningMessage('You must have an \'analyzers\' folder containing your NLP analyzers when using the ECL Plugin in order to create an ECL Manifest file.');
            return [];
        }
        return items;
    }
    newECLFile(analyzerItem) {
        if (visualText_1.visualText.hasWorkspaceFolder() && this.checkForECLAnalyzersDir().length > 0) {
            vscode.window.showInputBox({ value: 'filename', prompt: 'Enter ECL file name' }).then(newname => {
                if (newname) {
                    const dirPath = visualText_1.visualText.getWorkspaceFolder().fsPath;
                    // if (analyzerItem) {
                    // 	if (dirfuncs.isDir(analyzerItem.uri.fsPath))
                    // 		dirPath = analyzerItem.uri.fsPath;
                    // 	else
                    // 		dirPath = path.dirname(analyzerItem.uri.fsPath);
                    // }
                    this.createNewECLFile(dirPath, newname);
                }
            });
        }
    }
    createNewECLFile(dirPath, fileName) {
        const items = [];
        const fromDir = path.join(visualText_1.visualText.getVisualTextDirectory('ecl'));
        if (dirfuncs_1.dirfuncs.isDir(fromDir)) {
            const files = dirfuncs_1.dirfuncs.getFiles(vscode.Uri.file(fromDir));
            const textFile = new textFile_1.TextFile();
            for (const file of files) {
                let firstLine = textFile.readFirstLine(file.fsPath).trim();
                firstLine = firstLine.replace("// ", "");
                items.push({ label: path.basename(file.fsPath), description: ' ' + firstLine });
            }
            vscode.window.showQuickPick(items, { title: 'Creating New ECL File', canPickMany: false, placeHolder: 'Choose ecl block' }).then(selection => {
                if (!selection) {
                    return false;
                }
                const name = path.join(fromDir, selection.label);
                textFile.setFile(vscode.Uri.file(name));
                this.saveECLFile(dirPath, fileName, textFile.getText());
                return true;
            });
        }
        else {
            this.saveECLFile(dirPath, fileName, "a := 'Hello world!';\noutput(a);");
        }
        return false;
    }
    saveECLFile(dirPath, fileName, text) {
        let filePath = path.join(dirPath, fileName + '.ecl');
        if (path.extname(fileName))
            filePath = path.join(dirPath, fileName);
        dirfuncs_1.dirfuncs.writeFile(filePath, text);
        vscode.commands.executeCommand('analyzerView.refreshAll');
        vscode.window.showTextDocument(vscode.Uri.file(filePath));
    }
    manifestGenerate(analyzerItem) {
        const items = this.checkForECLAnalyzersDir();
        if (items.length == 0) {
            return;
        }
        const title = 'Generate HPCC Manifest File';
        const placeHolder = 'Choose Analyzers to Manifest';
        vscode.window.showQuickPick(items, { title, canPickMany: true, placeHolder: placeHolder }).then(selections => {
            if (!selections)
                return;
            const files = [];
            const start = visualText_1.visualText.getAnalyzerDir().fsPath.length;
            for (const selection of selections) {
                const analyzerPath = selection.description;
                if (analyzerPath) {
                    const analyzerFiles = this.getAnalyzerManifestFiles(analyzerPath);
                    for (const file of analyzerFiles) {
                        files.push(this.cleanPath(file, start));
                    }
                    // KB FILES
                    const kbPath = visualText_1.visualText.analyzer.constructDir(vscode.Uri.file(analyzerPath), analyzer_1.anaSubDir.KB);
                    const kbFiles = dirfuncs_1.dirfuncs.getFiles(kbPath, ['.dict', '.kbb', '.kb']);
                    for (const file of kbFiles) {
                        files.push(this.cleanPath(file.fsPath, start));
                    }
                    // ENGINE DATA FILES
                    // let datas = this.copyDataFolder();
                    // for (let file of datas) {
                    // 	files.push(this.cleanPath(file,start));
                    // }
                }
            }
            // Write files to manifest
            const filepath = path.parse(analyzerItem.uri.fsPath);
            const manifestFile = this.getManifestFilePath(filepath.name);
            const mannie = fs.createWriteStream(manifestFile, { flags: 'w' });
            mannie.write('<Manifest>\n');
            for (const file of files) {
                mannie.write('    <Resource filename="' + file + '" />\n');
            }
            mannie.write('</Manifest>');
            mannie.close();
            vscode.commands.executeCommand('analyzerView.refreshAll');
            vscode.window.showTextDocument(vscode.Uri.file(manifestFile));
        });
    }
    cleanPath(file, start) {
        let relative = file.substring(start);
        relative = relative.replace(new RegExp('\\\\', 'g'), '/');
        relative = relative.substring(1);
        return relative;
    }
    getManifestFilePath(elcFileName) {
        return path.join(visualText_1.visualText.getAnalyzerDir().fsPath, elcFileName + '.manifest');
    }
    getAnalyzerManifestFiles(dir) {
        const files = [];
        const specDir = path.join(dir, visualText_1.visualText.ANALYZER_SEQUENCE_FOLDER);
        this.sequenceFile.setSpecDir(specDir);
        this.sequenceFile.getPassFiles(specDir);
        files.push(path.join(specDir, visualText_1.visualText.ANALYZER_SEQUENCE_FILE));
        for (const item of this.sequenceFile.getPassItems()) {
            const p = item.uri.fsPath;
            if (p.length > 2 && fs.existsSync(p))
                files.push(item.uri.fsPath);
        }
        return files;
    }
    // No longer needed but leaving around JUST IN CASE
    copyDataFolder() {
        const files = [];
        const dataFolder = path.join(visualText_1.visualText.getAnalyzerDir().fsPath, 'data', 'rfb', visualText_1.visualText.ANALYZER_SEQUENCE_FOLDER);
        if (!fs.existsSync(dataFolder)) {
            const engineData = path.join(visualText_1.visualText.engineDirectory().fsPath, 'data', 'rfb', visualText_1.visualText.ANALYZER_SEQUENCE_FOLDER);
            visualText_1.visualText.fileOps.addFileOperation(vscode.Uri.file(engineData), vscode.Uri.file(dataFolder), [fileOps_1.fileOpRefresh.ANALYZERS], fileOps_1.fileOperation.COPY);
            visualText_1.visualText.fileOps.startFileOps();
        }
        const uris = dirfuncs_1.dirfuncs.getFiles(vscode.Uri.file(dataFolder));
        for (const uri of uris) {
            files.push(uri.fsPath);
        }
        return files;
    }
    openFile(analyzerItem) {
        if (analyzerItem.type == analyzerItemType.README)
            vscode.commands.executeCommand("markdown.showPreview", analyzerItem.uri);
        else
            vscode.window.showTextDocument(analyzerItem.uri);
    }
    video() {
        const url = 'http://vscodeanaviewer.visualtext.org';
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
    }
    renameAnalyzer(analyzerItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: path.basename(analyzerItem.uri.fsPath), prompt: 'Enter new Analyzer name' }).then(newname => {
                if (newname) {
                    const original = analyzerItem.uri;
                    if (path.extname(newname).length == 0)
                        newname = newname + path.extname(analyzerItem.uri.fsPath);
                    const newfile = vscode.Uri.file(path.join(path.dirname(analyzerItem.uri.fsPath), newname));
                    visualText_1.visualText.fileOps.addFileOperation(analyzerItem.uri, newfile, [fileOps_1.fileOpRefresh.ANALYZERS], fileOps_1.fileOperation.RENAME);
                    visualText_1.visualText.fileOps.startFileOps();
                }
            });
        }
    }
    renameFile(analyzerItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: path.basename(analyzerItem.uri.fsPath), prompt: 'Enter new file name' }).then(newname => {
                if (newname) {
                    const original = analyzerItem.uri;
                    if (path.extname(newname).length == 0)
                        newname = newname + path.extname(analyzerItem.uri.fsPath);
                    const newfile = vscode.Uri.file(path.join(path.dirname(analyzerItem.uri.fsPath), newname));
                    visualText_1.visualText.fileOps.addFileOperation(analyzerItem.uri, newfile, [fileOps_1.fileOpRefresh.ANALYZERS], fileOps_1.fileOperation.RENAME);
                    visualText_1.visualText.fileOps.startFileOps();
                }
            });
        }
    }
    renameFolder(analyzerItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: path.basename(analyzerItem.uri.fsPath), prompt: 'Enter new folder name' }).then(newname => {
                if (newname) {
                    const original = analyzerItem.uri;
                    const newfile = vscode.Uri.file(path.join(path.dirname(analyzerItem.uri.fsPath), newname));
                    visualText_1.visualText.fileOps.addFileOperation(analyzerItem.uri, newfile, [fileOps_1.fileOpRefresh.ANALYZERS], fileOps_1.fileOperation.RENAME);
                    visualText_1.visualText.fileOps.startFileOps();
                }
            });
        }
    }
    moveDownFolder(analyzerItem) {
        this.openFolder(analyzerItem.uri);
    }
    moveToParent(analyzerItem) {
        const parent = vscode.Uri.file(path.dirname(path.dirname(analyzerItem.uri.fsPath)));
        this.openFolder(parent);
    }
    openFolder(dir) {
        vscode.commands.executeCommand("vscode.openFolder", dir);
        vscode.commands.executeCommand('workbench.action.openPanel');
    }
    updateColorizer() {
        visualText_1.visualText.colorizeAnalyzer(true);
    }
    importAnalyzers(analyzerItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const seqFile = visualText_1.visualText.analyzer.seqFile;
            const options = {
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: true,
                openLabel: 'Import Analyzer(s)',
                defaultUri: seqFile.getSpecDirectory()
            };
            vscode.window.showOpenDialog(options).then(selections => {
                if (!selections) {
                    return;
                }
                let analyzerDirExists = false;
                let analyzerPath = '';
                if (analyzerItem === undefined) {
                    analyzerPath = visualText_1.visualText.analyzer.getAnalyzerDirectory().fsPath;
                }
                else {
                    analyzerPath = analyzerItem.uri.fsPath;
                    if (visualText_1.visualText.isAnalyzerDirectory(analyzerItem.uri))
                        analyzerPath = path.dirname(analyzerPath);
                }
                for (const select of selections) {
                    if (visualText_1.visualText.isAnalyzerDirectory(select)) {
                        const dirname = path.basename(select.fsPath);
                        visualText_1.visualText.fileOps.addFileOperation(select, vscode.Uri.file(path.join(analyzerPath, dirname)), [fileOps_1.fileOpRefresh.ANALYZERS], fileOps_1.fileOperation.COPY);
                        analyzerDirExists = true;
                    }
                }
                if (analyzerDirExists)
                    visualText_1.visualText.fileOps.startFileOps();
                else
                    vscode.window.showWarningMessage('No analyzers were selected');
            });
        }
    }
    newFolder(analyzerItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: 'dirname', prompt: 'Enter folder name' }).then(newdir => {
                if (newdir) {
                    let dirPath = '';
                    if (!analyzerItem) {
                        dirPath = visualText_1.visualText.getAnalyzerDir().fsPath;
                    }
                    else if (analyzerItem.type == analyzerItemType.FOLDER) {
                        dirPath = analyzerItem.uri.fsPath;
                    }
                    else {
                        dirPath = path.dirname(analyzerItem.uri.fsPath);
                    }
                    dirfuncs_1.dirfuncs.makeDir(path.join(dirPath, newdir));
                    vscode.commands.executeCommand('analyzerView.refreshAll');
                }
            });
        }
    }
    moveToFolder(analyzerItem) {
        if (this.folderUri) {
            const to = path.join(this.folderUri.fsPath, path.basename(analyzerItem.uri.fsPath));
            dirfuncs_1.dirfuncs.rename(analyzerItem.uri.fsPath, to);
            vscode.commands.executeCommand('analyzerView.refreshAll');
        }
        else {
            vscode.window.showInformationMessage('No folder selected');
        }
    }
    deleteReadMe(analyzerItem) {
        const readMe = vscode.Uri.file(path.join(analyzerItem.uri.fsPath, "README.md"));
        if (fs.existsSync(readMe.fsPath)) {
            const items = [];
            items.push({ label: 'Yes', description: 'Delete README.md?' });
            items.push({ label: 'No', description: 'Do not delete README.md' });
            vscode.window.showQuickPick(items, { title: 'README.md File', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                dirfuncs_1.dirfuncs.delFile(readMe.fsPath);
                vscode.commands.executeCommand('analyzerView.refreshAll');
            });
        }
        else {
            vscode.window.showWarningMessage('README.md does not exist');
        }
    }
    editReadMe(analyzerItem) {
        let dirPath = analyzerItem.uri.fsPath;
        if (!dirfuncs_1.dirfuncs.isDir(dirPath)) {
            dirPath = path.dirname(analyzerItem.uri.fsPath);
        }
        const readMe = path.join(dirPath, "README.md");
        if (!fs.existsSync(readMe)) {
            const content = "# TITLE\n\nDescription here.";
            dirfuncs_1.dirfuncs.writeFile(readMe, content);
        }
        vscode.window.showTextDocument(vscode.Uri.file(readMe));
        vscode.commands.executeCommand('analyzerView.refreshAll');
    }
    readMe(analyzerItem) {
        const readMe = vscode.Uri.file(path.join(analyzerItem.uri.fsPath, "README.md"));
        if (fs.existsSync(readMe.fsPath)) {
            vscode.commands.executeCommand("markdown.showPreview", readMe);
        }
    }
    moveUp(analyzerItem) {
        let parent = path.dirname(analyzerItem.uri.fsPath);
        const analyzersFolder = visualText_1.visualText.getAnalyzerDir();
        if (parent != analyzersFolder.fsPath) {
            parent = path.dirname(parent);
            const to = path.join(parent, path.basename(analyzerItem.uri.fsPath));
            dirfuncs_1.dirfuncs.rename(analyzerItem.uri.fsPath, to);
            vscode.commands.executeCommand('analyzerView.refreshAll');
        }
        else {
            vscode.window.showInformationMessage('Already at the top');
        }
    }
    explore(analyzerItem) {
        if (fs.existsSync(analyzerItem.uri.fsPath)) {
            visualText_1.visualText.openFileManager(analyzerItem.uri.fsPath);
        }
    }
    exploreAll() {
        const dir = visualText_1.visualText.getAnalyzerDir();
        if (fs.existsSync(dir.fsPath)) {
            visualText_1.visualText.openFileManager(dir.fsPath);
        }
    }
    copyAll() {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const options = {
                canSelectMany: false,
                openLabel: 'Analyzers to here',
                defaultUri: visualText_1.visualText.getWorkspaceFolder(),
                canSelectFiles: false,
                canSelectFolders: true
            };
            vscode.window.showOpenDialog(options).then(selection => {
                if (!selection) {
                    return;
                }
                const analyzers = visualText_1.visualText.getAnalyzers(false);
                const toFolder = vscode.Uri.file(selection[0].fsPath);
                for (const analyzer of analyzers) {
                    const folder = path.basename(analyzer.fsPath);
                    visualText_1.visualText.fileOps.addFileOperation(analyzer, vscode.Uri.file(path.join(toFolder.fsPath, folder)), [fileOps_1.fileOpRefresh.UNKNOWN], fileOps_1.fileOperation.COPY);
                }
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    copyAnalyzer(analyzerItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const options = {
                canSelectMany: false,
                openLabel: 'Folder to copy to',
                defaultUri: visualText_1.visualText.getWorkspaceFolder(),
                canSelectFiles: false,
                canSelectFolders: true
            };
            vscode.window.showOpenDialog(options).then(selection => {
                if (!selection) {
                    return;
                }
                const folder = path.basename(analyzerItem.uri.fsPath);
                visualText_1.visualText.fileOps.addFileOperation(analyzerItem.uri, vscode.Uri.file(path.join(selection[0].fsPath, folder)), [fileOps_1.fileOpRefresh.UNKNOWN], fileOps_1.fileOperation.COPY);
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    dupeAnalyzer(analyzerItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: path.basename(analyzerItem.uri.fsPath), prompt: 'Enter duplicate analyzer name' }).then(newname => {
                if (newname) {
                    const folder = path.dirname(analyzerItem.uri.fsPath);
                    visualText_1.visualText.fileOps.addFileOperation(analyzerItem.uri, vscode.Uri.file(path.join(folder, newname)), [fileOps_1.fileOpRefresh.ANALYZERS], fileOps_1.fileOperation.COPY);
                    visualText_1.visualText.fileOps.startFileOps();
                    vscode.commands.executeCommand('analyzerView.refreshAll');
                    vscode.commands.executeCommand('sequenceView.refreshAll');
                }
            });
        }
    }
    updateTitle(uri) {
        if (uri.fsPath.length > 0) {
            this.chosen = uri;
            const anaChosen = path.basename(uri.fsPath);
            if (anaChosen.length)
                this.analyzerView.title = `ANALYZERS (${anaChosen})`;
        }
        else {
            this.chosen = undefined;
            this.analyzerView.title = 'ANALYZERS';
        }
        vscode.commands.executeCommand('sequenceView.updateTitle');
    }
    openAnalyzer(analyzerItem) {
        visualText_1.visualText.colorizeAnalyzer();
        if (analyzerItem.type == analyzerItemType.ANALYZER) {
            visualText_1.visualText.loadAnalyzer(analyzerItem.uri);
            this.folderUri = undefined;
        }
        else {
            this.folderUri = analyzerItem.uri;
        }
    }
    deleteAnalyzer(analyzerItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const items = [];
            let deleteDescr = '';
            deleteDescr = deleteDescr.concat('Delete \'', path.basename(analyzerItem.uri.fsPath), '\' Analyzer');
            items.push({ label: 'Yes', description: deleteDescr });
            items.push({ label: 'No', description: 'Do not delete analyzer' });
            vscode.window.showQuickPick(items, { title: 'Delete Analyzer', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                visualText_1.visualText.fileOps.addFileOperation(analyzerItem.uri, analyzerItem.uri, [fileOps_1.fileOpRefresh.TEXT, fileOps_1.fileOpRefresh.KB, fileOps_1.fileOpRefresh.ANALYZERS, fileOps_1.fileOpRefresh.ANALYZER], fileOps_1.fileOperation.DELETE);
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    deleteFile(analyzerItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const items = [];
            let deleteDescr = '';
            deleteDescr = deleteDescr.concat('Delete file \'', path.basename(analyzerItem.uri.fsPath));
            items.push({ label: 'Yes', description: deleteDescr });
            items.push({ label: 'No', description: 'Do not delete file' });
            vscode.window.showQuickPick(items, { title: 'Delete File', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                visualText_1.visualText.fileOps.addFileOperation(analyzerItem.uri, analyzerItem.uri, [fileOps_1.fileOpRefresh.ANALYZERS], fileOps_1.fileOperation.DELETE);
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    deleteFolder(analyzerItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const itemCount = fs.readdirSync(analyzerItem.uri.fsPath).length;
            let yesDescr = '';
            let noDescr = '';
            let placeDescr = 'Choose Yes of No';
            yesDescr = yesDescr.concat('Delete empty folder \'', path.basename(analyzerItem.uri.fsPath), '\'');
            noDescr = 'Do not delete empty folder';
            if (fs.readdirSync(analyzerItem.uri.fsPath).length != 0) {
                yesDescr = `FOLDER NOT EMPTY: Delete folder and its ${itemCount} items?`;
                noDescr = 'Do not delete folder and all its contents';
                placeDescr = 'FOLDER NOT EMPTY: choose yes or no';
            }
            const items = [];
            items.push({ label: 'Yes', description: yesDescr });
            items.push({ label: 'No', description: noDescr });
            vscode.window.showQuickPick(items, { title: 'Delete Folder', canPickMany: false, placeHolder: placeDescr }).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                visualText_1.visualText.fileOps.addFileOperation(analyzerItem.uri, analyzerItem.uri, [fileOps_1.fileOpRefresh.ANALYZERS], fileOps_1.fileOperation.DELETE);
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    loadExampleAnalyzers() {
        this.openFolder(visualText_1.visualText.getBlockAnalyzersPath());
    }
    newAnalyzer(analyzerItem) {
        let uri;
        if (analyzerItem == undefined) {
            uri = visualText_1.visualText.getAnalyzerDir();
        }
        else {
            uri = analyzerItem.uri;
            if (analyzerItem.type == analyzerItemType.ANALYZER)
                uri = vscode.Uri.file(path.dirname(uri.fsPath));
        }
        visualText_1.visualText.analyzer.newAnalyzer(uri);
    }
    compileAnalyzer(analyzerItem) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            let analyzerDir;
            if (analyzerItem && analyzerItem.uri) {
                analyzerDir = dirfuncs_1.dirfuncs.isDir(analyzerItem.uri.fsPath) ? analyzerItem.uri : vscode.Uri.file(path.dirname(analyzerItem.uri.fsPath));
            }
            else if (visualText_1.visualText.analyzer.isLoaded()) {
                analyzerDir = visualText_1.visualText.analyzer.getAnalyzerDirectory();
            }
            else {
                vscode.window.showWarningMessage('No analyzer loaded. Open an analyzer first.');
                return;
            }
            const compile = compile_1.NLPCompile.attach();
            yield compile.compileAnalyzer(analyzerDir);
        });
    }
    deleteAllAnalyzerLogs() {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const items = [];
            let deleteDescr = '';
            deleteDescr = deleteDescr.concat('Delete log directories for all analyzers?');
            items.push({ label: 'Yes', description: deleteDescr });
            items.push({ label: 'No', description: 'Do not delete analyzers log files' });
            vscode.window.showQuickPick(items, { title: 'Delete ALL Analyzer Logs', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                this.deleteAllAnalyzerLogDirs();
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    deleteAnalyzerLogs(analyzerItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const items = [];
            let deleteDescr = '';
            const analyzerName = path.basename(analyzerItem.uri.fsPath);
            deleteDescr = deleteDescr.concat('Delete log directories for \'', analyzerName, '\'?');
            items.push({ label: 'Yes', description: deleteDescr });
            items.push({ label: 'No', description: 'Do not delete analyzer log files' });
            vscode.window.showQuickPick(items, { title: 'Delete Analyzer', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                textView_1.textView.deleteFolderLogs(analyzerItem.uri);
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    deleteLogDirs(dir) {
        const outputDir = vscode.Uri.file(path.join(dir.fsPath, "output"));
        this.deleteDirFiles(outputDir);
        const logDir = vscode.Uri.file(path.join(dir.fsPath, "logs"));
        this.deleteDirFiles(logDir);
    }
    deleteDirFiles(dir) {
        const files = dirfuncs_1.dirfuncs.getFiles(dir);
        for (const file of files) {
            visualText_1.visualText.fileOps.addFileOperation(file, file, [fileOps_1.fileOpRefresh.ANALYZERS], fileOps_1.fileOperation.DELETE);
        }
    }
    deleteAllAnalyzerLogDirs() {
        if (vscode.workspace.workspaceFolders) {
            const analyzerUris = visualText_1.visualText.getAnalyzers(true);
            for (const analyzerUri of analyzerUris) {
                const analyzerName = path.basename(analyzerUri.fsPath);
                textView_1.textView.deleteFolderLogs(analyzerUri);
            }
        }
    }
}
exports.AnalyzerView = AnalyzerView;
//# sourceMappingURL=analyzerView.js.map