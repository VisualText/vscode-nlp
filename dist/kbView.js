"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KBView = exports.kbView = exports.FileSystemProvider = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const path = tslib_1.__importStar(require("path"));
const visualText_1 = require("./visualText");
const findFile_1 = require("./findFile");
const findView_1 = require("./findView");
const outputView_1 = require("./outputView");
const dirfuncs_1 = require("./dirfuncs");
const textFile_1 = require("./textFile");
const fileOps_1 = require("./fileOps");
const fs = tslib_1.__importStar(require("fs"));
const analyzer_1 = require("./analyzer");
class FileSystemProvider {
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    constructor() {
        this.EMPTY_TEXT = '>> right click for libs <<';
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    getChildren(kbItem) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (kbItem) {
                return this.getKBFiles(kbItem.uri);
            }
            if (visualText_1.visualText.hasWorkspaceFolder() && visualText_1.visualText.hasAnalyzers() && visualText_1.visualText.analyzer.isLoaded()) {
                return this.getKBFiles(visualText_1.visualText.analyzer.getKBDirectory());
            }
            return [];
        });
    }
    getTreeItem(kbItem) {
        const treeItem = new vscode.TreeItem(kbItem.uri, kbItem.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        if (treeItem.label != this.EMPTY_TEXT) {
            const name = path.basename(kbItem.uri.fsPath);
            treeItem.command = { command: 'kbView.openFile', title: "Open File", arguments: [kbItem], };
            treeItem.contextValue = 'kb';
            const icon = visualText_1.visualText.fileIconFromExt(kbItem.uri.fsPath);
            treeItem.iconPath = {
                light: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'light', icon)),
                dark: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'dark', icon))
            };
            if (name.endsWith('.kbb') || name.endsWith('.dict') || name.endsWith('.kbbb') || name.endsWith('.dictt'))
                treeItem.contextValue = 'toggle';
            if (name.endsWith('.kb'))
                treeItem.contextValue = 'old';
            else if (!name.endsWith('.nlm'))
                treeItem.contextValue = treeItem.contextValue + 'nomo';
            else
                treeItem.contextValue = treeItem.contextValue + 'mod';
        }
        else {
            treeItem.contextValue = 'empty';
        }
        return treeItem;
    }
    getKBFiles(dir) {
        const files = Array();
        const entries = dirfuncs_1.dirfuncs.getDirectoryTypes(dir);
        visualText_1.visualText.mod.clear();
        visualText_1.visualText.modFiles = [];
        const order = ['.dict', '.dictt', '.kbb', '.kbbb', '.nlm', '.test', '.txt'];
        for (const ext of order) {
            for (const entry of entries) {
                if (entry.type != vscode.FileType.Directory && entry.uri.fsPath.endsWith(ext)) {
                    files.push({ uri: entry.uri, type: entry.type });
                    if (entry.uri.fsPath.endsWith('.nlm'))
                        visualText_1.visualText.modFiles.push(entry.uri);
                }
            }
        }
        // If there are no files, create a dummy "empty" item to allow for the right-click context menu
        if (files.length == 0) {
            files.push({ uri: this.EMPTY_TEXT, type: vscode.FileType.Unknown });
        }
        return files;
    }
    dirHasNonText(dir) {
        const files = dirfuncs_1.dirfuncs.getFiles(dir);
        for (const file of files) {
            if (!file.fsPath.endsWith('.txt'))
                return true;
        }
        return false;
    }
    existingFile(kbItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const options = {
                canSelectMany: true,
                openLabel: 'Add Existing File(s)',
                defaultUri: visualText_1.visualText.getWorkspaceFolder(),
                canSelectFiles: true,
                canSelectFolders: false,
                filters: {
                    'Text files': ['txt', 'xml', 'html', 'csv'],
                    'All files': ['*']
                }
            };
            vscode.window.showOpenDialog(options).then(selections => {
                if (!selections) {
                    return;
                }
                for (const sel of selections) {
                    const filename = path.basename(sel.fsPath);
                    let dir = visualText_1.visualText.analyzer.getInputDirectory().fsPath;
                    if (kbItem) {
                        dir = path.dirname(kbItem.uri.fsPath);
                    }
                    else if (visualText_1.visualText.analyzer.getTextPath()) {
                        const textPath = visualText_1.visualText.analyzer.getTextPath().fsPath;
                        if (fs.existsSync(textPath))
                            dir = path.dirname(textPath);
                        else
                            dir = visualText_1.visualText.analyzer.getInputDirectory().fsPath;
                    }
                    const newPath = vscode.Uri.file(path.join(dir, filename));
                    visualText_1.visualText.fileOps.addFileOperation(sel, newPath, [fileOps_1.fileOpRefresh.KB], fileOps_1.fileOperation.COPY);
                }
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    existingFolder(kbItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const options = {
                canSelectMany: true,
                openLabel: 'Add Existing Folder(s)',
                defaultUri: visualText_1.visualText.getWorkspaceFolder(),
                canSelectFiles: false,
                canSelectFolders: true,
            };
            vscode.window.showOpenDialog(options).then(selections => {
                if (!selections) {
                    return;
                }
                for (const sel of selections) {
                    const dirname = path.basename(sel.fsPath);
                    let dir = visualText_1.visualText.analyzer.getInputDirectory().fsPath;
                    if (kbItem) {
                        dir = path.dirname(kbItem.uri.fsPath);
                    }
                    const newPath = vscode.Uri.file(path.join(dir, dirname));
                    visualText_1.visualText.fileOps.addFileOperation(sel, newPath, [fileOps_1.fileOpRefresh.KB], fileOps_1.fileOperation.COPY);
                }
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    rename(kbItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: path.basename(kbItem.uri.fsPath), prompt: 'Enter new name for file' }).then(newname => {
                if (newname) {
                    const original = kbItem.uri;
                    if (path.extname(newname).length == 0)
                        newname = newname + path.extname(kbItem.uri.fsPath);
                    const newfile = vscode.Uri.file(path.join(path.dirname(kbItem.uri.fsPath), newname));
                    dirfuncs_1.dirfuncs.rename(original.fsPath, newfile.fsPath);
                    const logFolderOrig = vscode.Uri.file(path.join(original.fsPath + visualText_1.visualText.LOG_SUFFIX));
                    if (dirfuncs_1.dirfuncs.isDir(logFolderOrig.fsPath)) {
                        const logFolderNew = vscode.Uri.file(path.join(path.dirname(kbItem.uri.fsPath), newname + visualText_1.visualText.LOG_SUFFIX));
                        dirfuncs_1.dirfuncs.rename(logFolderOrig.fsPath, logFolderNew.fsPath);
                    }
                    vscode.commands.executeCommand('kbView.refreshAll');
                }
            });
        }
    }
    renameDir(kbItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: path.basename(kbItem.uri.fsPath), prompt: 'Enter new name for directory' }).then(newname => {
                if (newname) {
                    const original = kbItem.uri;
                    const newfile = vscode.Uri.file(path.join(path.dirname(kbItem.uri.fsPath), newname));
                    dirfuncs_1.dirfuncs.rename(original.fsPath, newfile.fsPath);
                    vscode.commands.executeCommand('kbView.refreshAll');
                }
            });
        }
    }
}
exports.FileSystemProvider = FileSystemProvider;
class KBView {
    constructor(context) {
        this.findFile = new findFile_1.FindFile();
        this.textFile = new textFile_1.TextFile();
        const treeDataProvider = new FileSystemProvider();
        this.kbView = vscode.window.createTreeView('kbView', { treeDataProvider });
        vscode.commands.registerCommand('kbView.refreshAll', () => treeDataProvider.refresh());
        vscode.commands.registerCommand('kbView.existingFile', (KBItem) => treeDataProvider.existingFile(KBItem));
        vscode.commands.registerCommand('kbView.existingFolder', (KBItem) => treeDataProvider.existingFolder(KBItem));
        vscode.commands.registerCommand('kbView.rename', (KBItem) => treeDataProvider.rename(KBItem));
        vscode.commands.registerCommand('kbView.renameDir', (KBItem) => treeDataProvider.renameDir(KBItem));
        vscode.commands.registerCommand('kbView.openFile', (KBItem) => this.openKBFile(KBItem));
        vscode.commands.registerCommand('kbView.openText', () => this.openText());
        vscode.commands.registerCommand('kbView.search', () => this.search());
        vscode.commands.registerCommand('kbView.newKBBFile', (KBItem) => this.newKBBFile(KBItem, false));
        vscode.commands.registerCommand('kbView.newDictFile', (KBItem) => this.newDictFile(KBItem, false));
        vscode.commands.registerCommand('kbView.deleteFile', (KBItem) => this.deleteFile(KBItem));
        vscode.commands.registerCommand('kbView.deleteDir', (KBItem) => this.deleteFile(KBItem));
        ;
        vscode.commands.registerCommand('kbView.updateTitle', (KBItem) => this.updateTitle(KBItem));
        vscode.commands.registerCommand('kbView.generateMain', () => this.generateMain());
        vscode.commands.registerCommand('kbView.mergeDicts', () => this.mergeDicts());
        vscode.commands.registerCommand('kbView.explore', () => this.explore());
        vscode.commands.registerCommand('kbView.existingFiles', () => this.existingFiles());
        vscode.commands.registerCommand('kbView.toggleActive', (KBItem) => this.toggleActive(KBItem));
        vscode.commands.registerCommand('kbView.copyToAnalyzer', (KBItem) => this.copyToAnalyzer(KBItem));
        vscode.commands.registerCommand('kbView.cleanFiles', () => this.cleanFiles());
        vscode.commands.registerCommand('kbView.video', () => this.video());
        vscode.commands.registerCommand('kbView.modAdd', (KBItem) => this.modAdd(KBItem));
        vscode.commands.registerCommand('kbView.modCreate', () => this.modCreate());
        vscode.commands.registerCommand('kbView.modLoad', (KBItem) => this.modLoad(KBItem));
        vscode.commands.registerCommand('kbView.langLibs', (KBItem) => this.langLibs());
        vscode.commands.registerCommand('kbView.miscLibs', () => this.miscLibs());
    }
    static attach(ctx) {
        if (!exports.kbView) {
            exports.kbView = new KBView(ctx);
        }
        return exports.kbView;
    }
    langLibs() {
        const fileDir = path.join(visualText_1.visualText.getVisualTextDirectory(), "languages");
        const items = [];
        const exts = [];
        exts.push(".dict");
        exts.push(".kbb");
        const dictFiles = dirfuncs_1.dirfuncs.getFiles(vscode.Uri.file(fileDir), exts, dirfuncs_1.getFileTypes.DIRS);
        for (const dictFile of dictFiles) {
            const descr = "";
            const language = path.basename(dictFile.fsPath);
            items.push({ label: language, description: `${language} language dictionaries, knowledge bases, mod files` });
        }
        if (items.length == 0) {
            vscode.window.showWarningMessage('Not created yet and you can help!');
            return;
        }
        vscode.window.showQuickPick(items, { title: 'Choose Language', canPickMany: false, placeHolder: 'Choose Language to see dictionaries and KB' }).then(selection => {
            if (!selection)
                return;
            if (selection.label) {
                this.chooseLibFiles('Dictionaries & Knowledge Bases', 'languages', selection.label, [".dict", ".kbb", ".nlm"]);
            }
        });
    }
    miscLibs() {
        this.chooseLibFiles('Choose File', 'misc', '', [".dict", ".kbb", ".nlm"]);
    }
    modLoad(kbItem) {
        visualText_1.visualText.mod.load(kbItem.uri);
    }
    modCreate() {
        const uri = visualText_1.visualText.analyzer.getKBDirectory();
        visualText_1.visualText.analyzer.modCreate(uri);
    }
    modAdd(kbItem) {
        visualText_1.visualText.mod.addFile(kbItem.uri, true);
    }
    video() {
        const url = 'http://vscodekbviewer.visualtext.org';
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
    }
    cleanFiles() {
        const fileDir = visualText_1.visualText.analyzer.getKBDirectory().fsPath;
        const items = [];
        const files = [];
        const allStr = 'ALL FILES BELOW';
        const allButValidStr = 'ALL BUT VALID KB FILES';
        const dictFiles = dirfuncs_1.dirfuncs.getFiles(vscode.Uri.file(fileDir), [], dirfuncs_1.getFileTypes.FILES);
        if (dictFiles.length == 0) {
            vscode.window.showWarningMessage('No KB files to delete');
            return;
        }
        items.push({ label: allStr, description: 'All the files listed below (non .KB files)' });
        items.push({ label: allButValidStr, description: 'All files except .KB, .KBB, and .DICT files' });
        const dictFiles2 = dirfuncs_1.dirfuncs.getFiles(vscode.Uri.file(fileDir), [], dirfuncs_1.getFileTypes.FILES);
        for (const dictFile of dictFiles2) {
            if (path.extname(dictFile.fsPath) == '.kb')
                continue;
            items.push({ label: path.basename(dictFile.fsPath), description: dictFile.fsPath });
            files.push(dictFile);
        }
        if (items.length <= 1) {
            vscode.window.showWarningMessage('No files to clean');
            return;
        }
        vscode.window.showQuickPick(items, { title: 'Clean Dictionary', canPickMany: true, placeHolder: 'Choose files to delete' }).then(selections => {
            if (!selections)
                return;
            let found = false;
            if (selections[0].label == allStr) {
                for (const file of files) {
                    found = true;
                    visualText_1.visualText.fileOps.addFileOperation(file, file, [fileOps_1.fileOpRefresh.KB], fileOps_1.fileOperation.DELETE);
                }
            }
            else if (selections[0].label == allButValidStr) {
                for (const file of files) {
                    const ext = path.extname(file.fsPath);
                    if (ext != '.kb' && ext != '.kbb' && ext != '.dict') {
                        found = true;
                        visualText_1.visualText.fileOps.addFileOperation(file, file, [fileOps_1.fileOpRefresh.KB], fileOps_1.fileOperation.DELETE);
                    }
                }
            }
            else {
                for (const selection of selections) {
                    if (selection.description) {
                        const uri = vscode.Uri.file(selection.description);
                        found = true;
                        visualText_1.visualText.fileOps.addFileOperation(uri, uri, [fileOps_1.fileOpRefresh.KB], fileOps_1.fileOperation.DELETE);
                    }
                }
            }
            if (!found) {
                vscode.window.showWarningMessage('No files to clean');
            }
            else {
                visualText_1.visualText.fileOps.startFileOps();
            }
        });
    }
    chooseLibFiles(prompt, dirName, subDir, exts) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const items = yield visualText_1.visualText.chooseLibFiles(prompt, dirName, subDir, exts);
            for (const item of items) {
                if (exts[0] == '.nlm') {
                    const filepath = path.join(visualText_1.visualText.getVisualTextDirectory(), dirName, subDir, item.label);
                    visualText_1.visualText.mod.load(vscode.Uri.file(filepath));
                }
                else
                    this.insertLibraryFile(path.join(dirName, subDir), item.label);
            }
        });
    }
    insertLibraryFile(dir, filename) {
        const filepath = path.join(visualText_1.visualText.getVisualTextDirectory(), dir, filename);
        const newfile = path.join(visualText_1.visualText.analyzer.getKBDirectory().fsPath, filename);
        if (!fs.existsSync(filepath)) {
            vscode.window.showWarningMessage("Not created yet and YOU can help: " + filename);
        }
        else {
            visualText_1.visualText.fileOps.addFileOperation(vscode.Uri.file(filepath), vscode.Uri.file(newfile), [fileOps_1.fileOpRefresh.KB], fileOps_1.fileOperation.COPY);
            visualText_1.visualText.fileOps.startFileOps();
        }
    }
    copyToAnalyzer(KBItem) {
        const kbDir = visualText_1.visualText.analyzer.anaSubDirPath(analyzer_1.anaSubDir.KB);
        outputView_1.outputView.copyFileToAnalyzer(KBItem.uri, kbDir, "Copy file to another analyzer", "Copy file to the KB directory of:");
    }
    toggleActive(KBItem) {
        const filepath = KBItem.uri.fsPath;
        if (KBItem && filepath.length) {
            const filename = path.basename(filepath);
            const parsed = path.parse(filename);
            let ext = '.kbb';
            if (filename.endsWith('.kbb')) {
                ext = '.kbbb';
            }
            else if (filename.endsWith('.kbbb')) {
                ext = '.kbb';
            }
            else if (filename.endsWith('.dict')) {
                ext = '.dictt';
            }
            else if (filename.endsWith('.dictt')) {
                ext = '.dict';
            }
            const newFilename = path.join(path.dirname(filepath), parsed.name + ext);
            visualText_1.visualText.fileOps.addFileOperation(KBItem.uri, vscode.Uri.file(newFilename), [fileOps_1.fileOpRefresh.KB], fileOps_1.fileOperation.RENAME);
            visualText_1.visualText.fileOps.startFileOps();
        }
        this.kbView.title = 'KB';
    }
    existingFiles() {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const options = {
                canSelectMany: true,
                openLabel: 'Import Existing File(s)',
                defaultUri: visualText_1.visualText.getWorkspaceFolder(),
                canSelectFiles: true,
                canSelectFolders: false,
                filters: {
                    'KB files': ['dict', 'kb', 'kbb', 'nlm'],
                    'All files': ['*']
                }
            };
            vscode.window.showOpenDialog(options).then(selections => {
                if (!selections) {
                    return;
                }
                const kbdir = visualText_1.visualText.analyzer.getKBDirectory().fsPath;
                for (const sel of selections) {
                    const filename = path.basename(sel.fsPath);
                    const newPath = vscode.Uri.file(path.join(kbdir, filename));
                    visualText_1.visualText.fileOps.addFileOperation(sel, newPath, [fileOps_1.fileOpRefresh.KB], fileOps_1.fileOperation.COPY);
                }
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    explore() {
        const kbDir = visualText_1.visualText.analyzer.getKBDirectory().fsPath;
        if (dirfuncs_1.dirfuncs.isDir(kbDir))
            visualText_1.visualText.openFileManager(kbDir);
    }
    search() {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            if (visualText_1.visualText.hasWorkspaceFolder()) {
                vscode.window.showInputBox({ value: 'searchword', prompt: 'Enter term to search' }).then(searchWord => {
                    if (searchWord) {
                        this.findFile.searchFiles(visualText_1.visualText.analyzer.getKBDirectory(), searchWord, ['.kb', '.kbb', '.dict', '.nlm']);
                        findView_1.findView.loadFinds(searchWord, this.findFile.getMatches());
                        findView_1.findView.setSearchWord(searchWord);
                        vscode.commands.executeCommand('findView.updateTitle');
                        vscode.commands.executeCommand('findView.refreshAll');
                    }
                });
            }
        }
    }
    openText() {
        if (visualText_1.visualText.analyzer.hasText())
            visualText_1.visualText.colorizeAnalyzer();
        vscode.window.showTextDocument(visualText_1.visualText.analyzer.getTextPath());
        vscode.commands.executeCommand('status.update');
    }
    updateTitle(resource) {
        const filepath = resource.fsPath;
        if (resource && filepath.length) {
            const filename = path.basename(resource.fsPath);
            if (filename.length) {
                this.kbView.title = `KB (${filename})`;
                return;
            }
        }
        this.kbView.title = 'KB';
    }
    mergeDicts() {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const items = [];
            const deleteDescr = '';
            items.push({ label: 'Yes', description: 'Merge all the dictionary files into all.dict?' });
            items.push({ label: 'No', description: 'Do not merge dictionary files' });
            vscode.window.showQuickPick(items, { title: 'Dict Files Merge', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                const kbDir = visualText_1.visualText.analyzer.getKBDirectory();
                const appFile = vscode.Uri.file(path.join(visualText_1.visualText.analyzer.getKBDirectory().fsPath, "all.dict"));
                visualText_1.visualText.fileOps.addFileOperation(kbDir, appFile, [fileOps_1.fileOpRefresh.KB], fileOps_1.fileOperation.APPEND, ".dict", "");
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    generateMain() {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const items = [];
            let deleteDescr = '';
            deleteDescr = deleteDescr.concat('Generate main.kb file');
            items.push({ label: 'Yes', description: deleteDescr });
            items.push({ label: 'No', description: 'Do not generate main.kb' });
            vscode.window.showQuickPick(items, { title: 'Generate main.kb', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                const kbPath = visualText_1.visualText.analyzer.getKBDirectory();
                const filePath = path.join(kbPath.fsPath, 'main.kb');
                const files = dirfuncs_1.dirfuncs.getFiles(kbPath);
                let attrs = '';
                let words = '';
                for (const file of files) {
                    const filename = path.basename(file.fsPath);
                    if (filename.startsWith('attr')) {
                        attrs += "take \"kb/user/" + filename + "\"\n";
                    }
                    else if (filename.startsWith('word')) {
                        words += "take \"kb/user/" + filename + "\"\n";
                    }
                }
                let content = '';
                content += "take \"kb/user/hier.kb\"\nbind sys\n";
                content += words;
                content += "take \"kb/user/phr.kb\"\n";
                content += attrs;
                content += "quit\n";
                dirfuncs_1.dirfuncs.writeFile(filePath, content);
                visualText_1.visualText.debugMessage('main.kb generated');
            });
        }
    }
    openKBFile(kbItem) {
        if (kbItem.uri.fsPath.endsWith('.nlm'))
            visualText_1.visualText.setModFile(kbItem.uri);
        this.openFile(kbItem.uri);
    }
    openFile(uri) {
        this.updateTitle(uri);
        visualText_1.visualText.colorizeAnalyzer();
        vscode.window.showTextDocument(uri);
        visualText_1.visualText.analyzer.saveCurrentFile(uri);
        vscode.commands.executeCommand('status.update');
    }
    deleteFile(kbItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const items = [];
            let deleteDescr = '';
            const filename = path.basename(kbItem.uri.fsPath);
            deleteDescr = deleteDescr.concat('Delete \'', filename, '\'?');
            items.push({ label: 'Yes', description: deleteDescr });
            items.push({ label: 'No', description: 'Do not delete ' + filename });
            vscode.window.showQuickPick(items, { title: 'Delete File', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                visualText_1.visualText.fileOps.addFileOperation(kbItem.uri, kbItem.uri, [fileOps_1.fileOpRefresh.KB], fileOps_1.fileOperation.DELETE);
                visualText_1.visualText.fileOps.startFileOps();
            });
        }
    }
    newKBBFile(kbItem, top) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: 'filename', prompt: 'Enter KBB file name' }).then(newname => {
                if (newname) {
                    let dirPath = visualText_1.visualText.analyzer.getKBDirectory().fsPath;
                    if (kbItem && !top)
                        dirPath = dirfuncs_1.dirfuncs.getDirPath(kbItem.uri.fsPath);
                    let filepath = path.join(dirPath, newname + '.kbb');
                    if (path.extname(newname))
                        filepath = path.join(dirPath, newname);
                    dirfuncs_1.dirfuncs.writeFile(filepath, "topconcept\n  child: attr=[value,value2]\n    grandchild one\n    grandchild two\n");
                    this.openFile(vscode.Uri.file(filepath));
                    vscode.commands.executeCommand('kbView.refreshAll');
                }
            });
        }
    }
    newDictFile(kbItem, top) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            vscode.window.showInputBox({ value: 'filename', prompt: 'Enter Dictionary file name' }).then(newname => {
                if (newname) {
                    let dirPath = visualText_1.visualText.analyzer.getKBDirectory().fsPath;
                    if (kbItem && !top)
                        dirPath = dirfuncs_1.dirfuncs.getDirPath(kbItem.uri.fsPath);
                    let filepath = path.join(dirPath, newname + '.dict');
                    if (path.extname(newname))
                        filepath = path.join(dirPath, newname);
                    dirfuncs_1.dirfuncs.writeFile(filepath, "word s=suggestedNode attr=value");
                    this.openFile(vscode.Uri.file(filepath));
                    vscode.commands.executeCommand('kbView.refreshAll');
                }
            });
        }
    }
}
exports.KBView = KBView;
//# sourceMappingURL=kbView.js.map