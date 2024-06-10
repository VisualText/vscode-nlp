import * as vscode from 'vscode';
import * as path from 'path';
import { FindItem } from './findFile';
import { visualText } from './visualText';

export class FindTreeDataProvider implements vscode.TreeDataProvider<FindItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<FindItem | undefined | null | void> = new vscode.EventEmitter<FindItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<FindItem | undefined | null | void> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	constructor() { }

	public getTreeItem(findItem: FindItem): vscode.TreeItem {
		var icon = 'file.svg';
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
		vscode.commands.registerCommand('findView.refreshAll', () => findViewProvider.refresh());
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
		this.setSearchWord('');
		this.updateTitle();
		vscode.commands.executeCommand('findView.refreshAll');
	}

	private updateTitle(): void {
		if (this.searchWord) {
			let word = this.searchWord;
			this.findView.title = `FIND RESULTS: (${word})`;				
		}
		else
			this.findView.title = 'FIND RESULTS';
	}

	public setSearchWord(word: string) {
		this.searchWord = word;
	}

	public loadFinds(searchWord: string, findItems: FindItem[]) {
		this.findItems = findItems;
		if (findItems.length == 0) {
			findItems.push({uri: vscode.Uri.file(''), label: 'NOT FOUND:  ' + searchWord, line: '', lineNum: 0, pos: 0, highlighted: ''});
		} else if (findItems.length == 1) {
			this.openFile(findItems[0]);
		}
		this.searchWord = searchWord;
	}

	public openFile(findItem: FindItem): void {
		visualText.colorizeAnalyzer();
		vscode.window.showTextDocument(findItem.uri).then(editor => 
			{
				var pos = new vscode.Position(findItem.lineNum,findItem.pos);
				var posEnd = new vscode.Position(findItem.lineNum,findItem.pos+this.searchWord.length);
				editor.selections = [new vscode.Selection(pos,posEnd)]; 
				var range = new vscode.Range(pos, pos);
				editor.revealRange(range);
			});
	}
}