import * as vscode from 'vscode';
import * as path from 'path';
import { visualText } from './visualText';
import { dirfuncs } from './dirfuncs';

interface AnalyzerItem {
	uri: vscode.Uri;
}

export class AnalyzerTreeDataProvider implements vscode.TreeDataProvider<AnalyzerItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<AnalyzerItem> = new vscode.EventEmitter<AnalyzerItem>();
	readonly onDidChangeTreeData: vscode.Event<AnalyzerItem> = this._onDidChangeTreeData.event;

	refresh(analyzerItem: AnalyzerItem): void {
		this._onDidChangeTreeData.fire(analyzerItem);
	}

	constructor() { }

	public getTreeItem(element: AnalyzerItem): vscode.TreeItem {
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

	public getChildren(element?: AnalyzerItem): AnalyzerItem[] {
        if (visualText.hasWorkspaceFolder()) {
            const analyzers = visualText.getAnalyzers();
            const children: AnalyzerItem[] = new Array();
            for (let analyzer of analyzers) {
                children.push({uri: analyzer});
            }
            return children;
        }
		return [];
	}
}

export let analyzerView: AnalyzerView;
export class AnalyzerView {

	public analyzerView: vscode.TreeView<AnalyzerItem>;

	constructor(context: vscode.ExtensionContext) {
		const analyzerViewProvider = new AnalyzerTreeDataProvider();
		this.analyzerView = vscode.window.createTreeView('analyzerView', { treeDataProvider: analyzerViewProvider });
		vscode.commands.registerCommand('analyzerView.refreshAll', resource => analyzerViewProvider.refresh(resource));
		vscode.commands.registerCommand('analyzerView.newAnalyzer', () => this.newAnalyzer());
		vscode.commands.registerCommand('analyzerView.deleteAnalyzer', resource => this.deleteAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.colorizeAnalyzer', resource => this.colorizeAnalyzer());
		vscode.commands.registerCommand('analyzerView.openAnalyzer', resource => this.openAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.updateTitle', resource => this.updateTitle(resource));
    }
    
    static attach(ctx: vscode.ExtensionContext) {
        if (!analyzerView) {
            analyzerView = new AnalyzerView(ctx);
        }
        return analyzerView;
	}
	
	private updateTitle(analyzerItem: AnalyzerItem): void {
		/* Currently not compiling
		var analyzerName = path.basename(analyzerItem.uri.fsPath);
		if (analyzerName.length)
			this.analyzerView.title = `ANALYZERS (${analyzerName})`;
		else
			this.analyzerView.title = 'ANALYZERS';
		*/
	}

	private openAnalyzer(analyzerItem: AnalyzerItem): void {
		this.updateTitle(analyzerItem);
		visualText.loadAnalyzer(analyzerItem.uri);
	}

	private deleteAnalyzer(analyzerItem: AnalyzerItem): void {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete \'',path.basename(analyzerItem.uri.fsPath),'\' analzyer');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete pass'});

			vscode.window.showQuickPick(items).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				dirfuncs.delDir(analyzerItem.uri.fsPath);
				vscode.commands.executeCommand('analyzerView.refreshAll');
			});
		}
	}

	private colorizeAnalyzer() {
		if (vscode.workspace.workspaceFolders) {
			var fromFile = path.join(visualText.extensionDirectory().fsPath,'.vscode','settings.json');
			var toFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath,'.vscode','settings.json');
			dirfuncs.copyFile(fromFile,toFile);
		}
	}
	
	private newAnalyzer() {
		visualText.analyzer.newAnalyzer();
	}
}