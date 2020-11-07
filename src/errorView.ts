import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { dirfuncs } from './dirfuncs';

interface ErrorItem {
	uri: vscode.Uri;
}

export class OutputTreeDataProvider implements vscode.TreeDataProvider<ErrorItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<ErrorItem> = new vscode.EventEmitter<ErrorItem>();
	readonly onDidChangeTreeData: vscode.Event<ErrorItem> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	constructor() { }

	public getTreeItem(element: ErrorItem): vscode.TreeItem {
		return {
			resourceUri: element.uri,
			collapsibleState: void 0,
			command: {
				command: 'errorView.openFile',
				arguments: [element.uri],
				title: 'Open File with Error'
			}
		};
	}

	public getChildren(element?: ErrorItem): ErrorItem[] {
		return [];
	}
}

export let errorView: ErrorView;
export class ErrorView {

	public errorView: vscode.TreeView<ErrorItem>;
	private outputFiles: vscode.Uri[];
	private logDirectory: vscode.Uri;

	constructor(context: vscode.ExtensionContext) {
		const outputViewProvider = new OutputTreeDataProvider();
		this.errorView = vscode.window.createTreeView('errorView', { treeDataProvider: outputViewProvider });
		vscode.commands.registerCommand('errorView.refreshAll', () => outputViewProvider.refresh());
		vscode.commands.registerCommand('errorView.openFile', resource => this.openFile(resource));
		this.outputFiles = [];
		this.logDirectory = vscode.Uri.file('');
    }
    
    static attach(ctx: vscode.ExtensionContext) {
        if (!errorView) {
            errorView = new ErrorView(ctx);
        }
        return errorView;
	}

	private openFile(resource: vscode.Uri): void {
        vscode.window.showTextDocument(resource);
	}
}