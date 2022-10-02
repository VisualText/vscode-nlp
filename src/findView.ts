import * as vscode from 'vscode';
import * as path from 'path';
import { FindItem } from './findFile';

export class FindTreeDataProvider implements vscode.TreeDataProvider<FindItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<FindItem> = new vscode.EventEmitter<FindItem>();
	readonly onDidChangeTreeData: vscode.Event<FindItem> = this._onDidChangeTreeData.event;

	refresh(findItem: FindItem): void {
		this._onDidChangeTreeData.fire(findItem);
	}

	constructor() { }

	public getTreeItem(findItem: FindItem): vscode.TreeItem {
		var icon = 'file.svg';
		if (findItem.uri.fsPath.endsWith('.nlp') || findItem.uri.fsPath.endsWith('.pat')) {
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

	public getChildren(element?: FindItem): FindItem[] {
		return findView.getFinds();
	}
}

export let findView: FindView;
export class FindView {

	public findView: vscode.TreeView<FindItem>;
	public filepath: vscode.Uri = vscode.Uri.file('');
	public line: number = 0;
	public pos: number = -1;
	public text: string = '';
	public findItems: FindItem[] = [];
	private searchWord: string = '';

	constructor(context: vscode.ExtensionContext) {
		const findViewProvider = new FindTreeDataProvider();
		this.findView = vscode.window.createTreeView('findView', { treeDataProvider: findViewProvider });
		vscode.commands.registerCommand('findView.refreshAll', (resource) => findViewProvider.refresh(resource));
		vscode.commands.registerCommand('findView.openFile', (resource) => this.openFile(resource));
		vscode.commands.registerCommand('findView.updateTitle', () => this.updateTitle());
		vscode.commands.registerCommand('findView.clearAll', () => this.clearAll());
    }
    
    static attach(ctx: vscode.ExtensionContext) {
        if (!findView) {
            findView = new FindView(ctx);
        }
        return findView;
	}

	public getFinds(): FindItem[] {
		return this.findItems;
	}

	private clearAll() {
		this.findItems = [];
		vscode.commands.executeCommand('findView.refreshAll');
	}

	private updateTitle(): void {
		if (this.searchWord) {
			let word = this.searchWord;
			this.findView.title = `FIND RESULTS: (${word})`;				
		}
		this.findView.title = 'FIND RESULTS';
	}

	public loadFinds(searchWord: string, findItems: FindItem[]) {
		this.findItems = findItems;
		if (findItems.length == 0) {
			findItems.push({uri: vscode.Uri.file(''), label: 'NOT FOUND:  ' + searchWord, line: 0, pos: 0, text: ''});
		} else if (findItems.length == 1) {
			this.openFile(findItems[0]);
		}
		this.searchWord = searchWord;
	}

	private openFile(findItem: FindItem): void {
		vscode.window.showTextDocument(findItem.uri).then(editor => 
			{
				var pos = new vscode.Position(findItem.line,findItem.pos);
				var posEnd = new vscode.Position(findItem.line,findItem.pos+this.searchWord.length);
				editor.selections = [new vscode.Selection(pos,posEnd)]; 
				var range = new vscode.Range(pos, pos);
				editor.revealRange(range);
			});
	}
}