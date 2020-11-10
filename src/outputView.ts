import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { dirfuncs } from './dirfuncs';

interface OutputItem {
	uri: vscode.Uri;
}

export class OutputTreeDataProvider implements vscode.TreeDataProvider<OutputItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<OutputItem> = new vscode.EventEmitter<OutputItem>();
	readonly onDidChangeTreeData: vscode.Event<OutputItem> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	constructor() { }

	public getTreeItem(element: OutputItem): vscode.TreeItem {
		return {
			resourceUri: element.uri,
			collapsibleState: void 0,
			command: {
				command: 'outputView.openFile',
				arguments: [element.uri],
				title: 'Open Output File'
			}
		};
	}

	public getChildren(element?: OutputItem): OutputItem[] {
        if (visualText.hasWorkspaceFolder()) {
            const children: OutputItem[] = new Array();
            for (let folder of outputView.getOutputFiles()) {
				var base = path.basename(folder.path);
				if (!(base.startsWith('ana') && (base.endsWith('.log') || base.endsWith('.txxt') || base.endsWith('.kb'))))
					children.push({uri: folder});
            }
            return children;
        }

		return [];
	}
}

export let outputView: OutputView;
export class OutputView {

	public outputView: vscode.TreeView<OutputItem>;
	private outputFiles: vscode.Uri[];
	private logDirectory: vscode.Uri;

	constructor(context: vscode.ExtensionContext) {
		const outputViewProvider = new OutputTreeDataProvider();
		this.outputView = vscode.window.createTreeView('outputView', { treeDataProvider: outputViewProvider });
		vscode.commands.registerCommand('outputView.refreshAll', () => outputViewProvider.refresh());
		vscode.commands.registerCommand('outputView.newOutput', resource => this.newOutput(resource));
		vscode.commands.registerCommand('outputView.deleteOutput', resource => this.deleteOutput(resource));
		vscode.commands.registerCommand('outputView.openFile', resource => this.openFile(resource));
		this.outputFiles = [];
		this.logDirectory = vscode.Uri.file('');
    }
    
    static attach(ctx: vscode.ExtensionContext) {
        if (!outputView) {
            outputView = new OutputView(ctx);
        }
        return outputView;
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
		this.outputFiles = [];
		if (visualText.analyzer.hasText()) {
			var path = visualText.analyzer.getTextPath().path;
			this.outputFiles = [];
			if (path.length && this.fileHasLog(path)) {
				this.outputFiles = dirfuncs.getFiles(this.logDirectory);
			}			
		}
        return this.outputFiles;
	}
	
	private openFile(resource: vscode.Uri): void {
        vscode.window.showTextDocument(resource);
	}

	private deleteOutput(resource: OutputItem): void {
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
	
	private newOutput(resource: OutputItem) {
		console.log('New Output code to be implemented');
	}
}