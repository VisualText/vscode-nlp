"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyzerView = exports.analyzerView = exports.AnalyzerTreeDataProvider = void 0;
const vscode = require("vscode");
const path = require("path");
const visualText_1 = require("./visualText");
const dirfuncs_1 = require("./dirfuncs");
class AnalyzerTreeDataProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh(analyzerItem) {
        this._onDidChangeTreeData.fire(analyzerItem);
    }
    getTreeItem(element) {
        return {
            resourceUri: element.uri,
            collapsibleState: void 0,
            iconPath: {
                light: path.join(__filename, '..', '..', 'resources', 'light', 'gear.svg'),
                dark: path.join(__filename, '..', '..', 'resources', 'dark', 'gear.svg')
            },
            command: {
                command: 'analyzerView.openAnalyzer',
                arguments: [element],
                title: 'Open Analyzer'
            }
        };
    }
    getChildren(element) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            const analyzers = visualText_1.visualText.getAnalyzers();
            const children = new Array();
            for (let analyzer of analyzers) {
                children.push({ uri: analyzer });
            }
            return children;
        }
        return [];
    }
}
exports.AnalyzerTreeDataProvider = AnalyzerTreeDataProvider;
class AnalyzerView {
    constructor(context) {
        const analyzerViewProvider = new AnalyzerTreeDataProvider();
        this.analyzerView = vscode.window.createTreeView('analyzerView', { treeDataProvider: analyzerViewProvider });
        vscode.commands.registerCommand('analyzerView.refreshAll', resource => analyzerViewProvider.refresh(resource));
        vscode.commands.registerCommand('analyzerView.newAnalyzer', () => this.newAnalyzer());
        vscode.commands.registerCommand('analyzerView.deleteAnalyzer', resource => this.deleteAnalyzer(resource));
        vscode.commands.registerCommand('analyzerView.openAnalyzer', resource => this.openAnalyzer(resource));
        vscode.commands.registerCommand('analyzerView.updateTitle', resource => this.updateTitle(resource));
    }
    static attach(ctx) {
        if (!exports.analyzerView) {
            exports.analyzerView = new AnalyzerView(ctx);
        }
        return exports.analyzerView;
    }
    updateTitle(analyzerItem) {
        /* Currently not compiling
        var analyzerName = path.basename(analyzerItem.uri.path);
        if (analyzerName.length)
            this.analyzerView.title = `ANALYZERS (${analyzerName})`;
        else
            this.analyzerView.title = 'ANALYZERS';
        */
    }
    openAnalyzer(analyzerItem) {
        this.updateTitle(analyzerItem);
        visualText_1.visualText.loadAnalyzer(analyzerItem.uri);
    }
    deleteAnalyzer(analyzerItem) {
        if (visualText_1.visualText.hasWorkspaceFolder()) {
            let items = [];
            var deleteDescr = '';
            deleteDescr = deleteDescr.concat('Delete \'', path.basename(analyzerItem.uri.path), '\' analzyer');
            items.push({ label: 'Yes', description: deleteDescr });
            items.push({ label: 'No', description: 'Do not delete pass' });
            vscode.window.showQuickPick(items).then(selection => {
                if (!selection || selection.label == 'No')
                    return;
                dirfuncs_1.dirfuncs.delDir(analyzerItem.uri.path);
                vscode.commands.executeCommand('analyzerView.refreshAll');
            });
        }
    }
    newAnalyzer() {
        visualText_1.visualText.analyzer.newAnalyzer();
    }
}
exports.AnalyzerView = AnalyzerView;
//# sourceMappingURL=analyzerView.js.map