"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindView = exports.findView = exports.FindTreeDataProvider = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const path = tslib_1.__importStar(require("path"));
const visualText_1 = require("./visualText");
class FindTreeDataProvider {
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    getTreeItem(findItem) {
        let icon = 'file.svg';
        if (findItem.uri.fsPath.endsWith('.nlp') || findItem.uri.fsPath.endsWith('.pat')) {
            icon = 'gear.svg';
        }
        return {
            label: findItem.highlighted,
            resourceUri: findItem.uri,
            collapsibleState: void 0,
            command: {
                command: 'findView.openFile',
                arguments: [findItem],
                title: 'Open Found File'
            },
            iconPath: {
                light: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'light', icon)),
                dark: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'dark', icon))
            },
        };
    }
    getChildren(element) {
        return exports.findView.getFinds();
    }
}
exports.FindTreeDataProvider = FindTreeDataProvider;
class FindView {
    constructor(context) {
        this.filepath = vscode.Uri.file('');
        this.line = 0;
        this.pos = -1;
        this.text = '';
        this.findItems = [];
        this.searchWord = '';
        const findViewProvider = new FindTreeDataProvider();
        this.findView = vscode.window.createTreeView('findView', { treeDataProvider: findViewProvider });
        vscode.commands.registerCommand('findView.refreshAll', () => findViewProvider.refresh());
        vscode.commands.registerCommand('findView.openFile', (resource) => this.openFile(resource));
        vscode.commands.registerCommand('findView.updateTitle', () => this.updateTitle());
        vscode.commands.registerCommand('findView.clearAll', () => this.clearAll());
    }
    static attach(ctx) {
        if (!exports.findView) {
            exports.findView = new FindView(ctx);
        }
        return exports.findView;
    }
    getFinds() {
        return this.findItems;
    }
    clearAll() {
        this.findItems = [];
        this.setSearchWord('');
        this.updateTitle();
        vscode.commands.executeCommand('findView.refreshAll');
    }
    updateTitle() {
        if (this.searchWord) {
            const word = this.searchWord;
            this.findView.title = `FIND RESULTS: (${word})`;
        }
        else
            this.findView.title = 'FIND RESULTS';
    }
    setSearchWord(word) {
        this.searchWord = word;
    }
    loadFinds(searchWord, findItems) {
        this.findItems = findItems;
        if (findItems.length == 0) {
            findItems.push({ uri: vscode.Uri.file(''), label: 'NOT FOUND:  ' + searchWord, line: '', lineNum: 0, pos: 0, highlighted: '' });
        }
        else if (findItems.length == 1) {
            this.openFile(findItems[0]);
        }
        this.searchWord = searchWord;
    }
    openFile(findItem) {
        visualText_1.visualText.colorizeAnalyzer();
        vscode.window.showTextDocument(findItem.uri).then(editor => {
            const pos = new vscode.Position(findItem.lineNum, findItem.pos);
            const posEnd = new vscode.Position(findItem.lineNum, findItem.pos + this.searchWord.length);
            editor.selections = [new vscode.Selection(pos, posEnd)];
            const range = new vscode.Range(pos, pos);
            editor.revealRange(range);
        });
    }
}
exports.FindView = FindView;
//# sourceMappingURL=findView.js.map