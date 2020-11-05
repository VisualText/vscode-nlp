import * as vscode from 'vscode';
import * as path from 'path';
import { visualText } from './visualText';

interface AnalyzerItem {
	uri: vscode.Uri;
}

export class AnalyzerTreeDataProvider implements vscode.TreeDataProvider<AnalyzerItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<AnalyzerItem> = new vscode.EventEmitter<AnalyzerItem>();
	readonly onDidChangeTreeData: vscode.Event<AnalyzerItem> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	constructor() { }

	public getTreeItem(element: AnalyzerItem): vscode.TreeItem {
		return {
			resourceUri: element.uri,
			collapsibleState: void 0,
			iconPath: {
				light: path.join(__filename, '..', '..', 'fileicons', 'images', 'light', 'gear.svg'),
				dark: path.join(__filename, '..', '..', 'fileicons', 'images', 'dark', 'gear.svg')
			},
			command: {
				command: 'analyzerView.openAnalyzer',
				arguments: [element.uri],
				title: 'Open Analyzer'
			}
		};
	}

	public getChildren(element?: AnalyzerItem): AnalyzerItem[] {
        if (visualText.hasWorkingDirectory()) {
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
		vscode.commands.registerCommand('analyzerView.refreshAll', () => analyzerViewProvider.refresh());
		vscode.commands.registerCommand('analyzerView.newAnalyzer', resource => this.newAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.deleteAnalyzer', resource => this.deleteAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.openAnalyzer', resource => this.openAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.updateTitle', resource => this.updateTitle(resource));
    }
    
    static attach(ctx: vscode.ExtensionContext) {
        if (!analyzerView) {
            analyzerView = new AnalyzerView(ctx);
        }
        return analyzerView;
	}
	
	private updateTitle(resource: vscode.Uri): void {
		var analyzerName = path.basename(resource.path);
		if (analyzerName.length)
			this.analyzerView.title = `ANALYZERS (${analyzerName})`;
		else
			this.analyzerView.title = 'ANALYZERS';
	}

	private openAnalyzer(resource: vscode.Uri): void {
		this.updateTitle(resource);
		visualText.loadAnalyzer(resource);
	}

	private deleteAnalyzer(resource: AnalyzerItem): void {
		if (visualText.hasWorkingDirectory()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete \'',path.basename(resource.uri.path),'\' analzyer');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete pass'});

			vscode.window.showQuickPick(items).then(selection => {
			});
		}
	}
	
	private newAnalyzer(resource: AnalyzerItem) {
		console.log('New Analyzer code to be implemented');
	}
}