import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { dirfuncs } from './dirfuncs';

interface FindItem {
	uri: vscode.Uri;
}

export class OutputTreeDataProvider implements vscode.TreeDataProvider<FindItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<FindItem> = new vscode.EventEmitter<FindItem>();
	readonly onDidChangeTreeData: vscode.Event<FindItem> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	constructor() { }

	public getTreeItem(element: FindItem): vscode.TreeItem {
		return {
			resourceUri: element.uri,
			collapsibleState: void 0,
			command: {
				command: 'findView.openFile',
				arguments: [element.uri],
				title: 'Open File'
			}
		};
	}

	public getChildren(element?: FindItem): FindItem[] {
		return [];
	}
}

export let findView: FindView;
export class FindView {

	public findView: vscode.TreeView<FindItem>;
	private outputFiles: vscode.Uri[];
	private logDirectory: vscode.Uri;

	constructor(context: vscode.ExtensionContext) {
		const outputViewProvider = new OutputTreeDataProvider();
		this.findView = vscode.window.createTreeView('findView', { treeDataProvider: outputViewProvider });
		vscode.commands.registerCommand('findView.refreshAll', () => outputViewProvider.refresh());
		vscode.commands.registerCommand('findView.newOutput', resource => this.newOutput(resource));
		vscode.commands.registerCommand('findView.deleteOutput', resource => this.deleteOutput(resource));
		vscode.commands.registerCommand('findView.openFile', resource => this.openFile(resource));
		this.outputFiles = [];
		this.logDirectory = vscode.Uri.file('');
    }
    
    static attach(ctx: vscode.ExtensionContext) {
        if (!findView) {
            findView = new FindView(ctx);
        }
        return findView;
	}

	public directoryIsLog(path: string): boolean {
		if (!path.endsWith('_log'))
			return false;
		const filepath = path.substr(0,path.length-4);
		var stats = fs.lstatSync(filepath);
		if (!stats)
			return false;
		return stats.isFile();
	}

	public fileHasLog(path: string): boolean {
		this.logDirectory = vscode.Uri.file('');
		if (path.length == 0)
			return false;
		this.logDirectory = vscode.Uri.file(path + '_log');
		if (!fs.existsSync(this.logDirectory.path))
			return false;
		var stats = fs.lstatSync(this.logDirectory.path);
		if (!stats)
			return false;
		return stats.isDirectory();
	}

	public getOutputFiles() {
		var path = visualText.analyzer.getTextPath();
		this.outputFiles = [];
		if (path.length && this.fileHasLog(path)) {
            this.outputFiles = dirfuncs.getFiles(this.logDirectory);
        }
        return this.outputFiles;
	}

	public load(file: vscode.Uri) {

	}

	private openFile(resource: vscode.Uri): void {
        vscode.window.showTextDocument(resource);
	}

	private deleteOutput(resource: FindItem): void {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete \'',path.basename(resource.uri.path),'\' analzyer');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete pass'});

			vscode.window.showQuickPick(items).then(selection => {
			});
		}
	}
	
	private newOutput(resource: FindItem) {
		console.log('New Output code to be implemented');
	}
}