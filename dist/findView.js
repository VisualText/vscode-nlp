"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindView = exports.findView = exports.FindTreeDataProvider = void 0;
const vscode = require("vscode");
const path = require("path");
class FindTreeDataProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh(findItem) {
        this._onDidChangeTreeData.fire(findItem);
    }
    getTreeItem(findItem) {
        var icon = 'file.svg';
        if (findItem.uri.path.endsWith('.pat')) {
            icon = 'gear.svg';
        }
        return {
            label: findItem.label,
            resourceUri: findItem.uri,
            collapsibleState: void 0,
            command: {
                command: 'findView.openFile',
                arguments: [findItem],
                title: 'Open Found File'
            },
            iconPath: {
                light: path.join(__filename, '..', '..', 'resources', 'light', icon),
                dark: path.join(__filename, '..', '..', 'resources', 'dark', icon)
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
        vscode.commands.registerCommand('findView.refreshAll', (resource) => findViewProvider.refresh(resource));
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
        vscode.commands.executeCommand('findView.refreshAll');
    }
    updateTitle() {
        /* Currently not compiling
if (this.searchWord) {
    let word = this.searchWord;
    this.findView.title = `FIND RESULTS: (${word})`;
}
this.findView.title = 'FIND RESULTS';
*/
    }
    loadFinds(searchWord, findItems) {
        this.findItems = findItems;
        this.searchWord = searchWord;
    }
    openFile(findItem) {
        vscode.window.showTextDocument(findItem.uri).then(editor => {
            var pos = new vscode.Position(findItem.line, findItem.pos);
            var posEnd = new vscode.Position(findItem.line, findItem.pos + this.searchWord.length);
            editor.selections = [new vscode.Selection(pos, posEnd)];
            var range = new vscode.Range(pos, pos);
            editor.revealRange(range);
        });
    }
}
exports.FindView = FindView;
//# sourceMappingURL=findView.js.map