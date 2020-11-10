import * as vscode from 'vscode';
import * as fs from 'fs';
import { visualText } from './visualText';
import { SequenceFile } from './sequence';
import { TextFile } from './textFile';

interface LogItem {
	uri: vscode.Uri;
	passNum: number;
	line: number;
	label: string;
}

export class OutputTreeDataProvider implements vscode.TreeDataProvider<LogItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<LogItem> = new vscode.EventEmitter<LogItem>();
	readonly onDidChangeTreeData: vscode.Event<LogItem> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	constructor() { }

	public getTreeItem(element: LogItem): vscode.TreeItem {
		return {
			label: element.label,
			resourceUri: element.uri,
			collapsibleState: void 0,
			command: {
				command: 'logView.openFile',
				arguments: [element],
				title: 'Open File with Error'
			}
		};
	}

	public getChildren(element?: LogItem): LogItem[] {
        if (visualText.hasWorkspaceFolder()) {
            return logView.getLogs();
		}
		
		return [];
	}
}

export let logView: LogView;
export class LogView {

	public logView: vscode.TreeView<LogItem>;

	constructor(context: vscode.ExtensionContext) {
		const logViewProvider = new OutputTreeDataProvider();
		this.logView = vscode.window.createTreeView('logView', { treeDataProvider: logViewProvider });
		vscode.commands.registerCommand('logView.refreshAll', () => logViewProvider.refresh());
		vscode.commands.registerCommand('logView.openFile', resource => this.openFile(resource));
    }
    
    static attach(ctx: vscode.ExtensionContext) {
        if (!logView) {
            logView = new LogView(ctx);
        }
        return logView;
	}

	getLogs(): LogItem[] {
		const logs: LogItem[] = new Array();

		if (visualText.analyzer.hasText()) {
			const makeAna = visualText.analyzer.logFile('make_ana');
			if (fs.existsSync(makeAna.path)) {
				const logFile = new TextFile(makeAna.path);
				var seqFile = new SequenceFile();
				seqFile.init();

				for (let line of logFile.getLines()) {
					line = line.substr(0,line.length-1);
					if (line.length) {
						let log = this.parseLogLine(line);
						logs.push(log);						
					}
				}
			}
		}

		return logs;
	}

	private parseLogLine(line: string): LogItem {
		var uri = vscode.Uri.file('');
		var passNum = 0;
		var lineNum = -1;

		if (line.length) {
			let tokens = line.split(/[\t\s]/,2);  
			if (tokens.length >= 2) {
				var seqFile = new SequenceFile();
				seqFile.init();
				passNum = +tokens[0];
				if (passNum)
					uri = vscode.Uri.file(seqFile.getFileByNumber(passNum));
				lineNum = +tokens[1];
			}
		}

		return ({label: line, uri: uri, passNum: passNum, line: lineNum});
	}

	private openFile(logItem: LogItem): void {
		if (logItem.passNum) {
			var seqFile = new SequenceFile();
			seqFile.init();
			var passFile = vscode.Uri.file(seqFile.getFileByNumber(logItem.passNum));

			vscode.window.showTextDocument(logItem.uri).then(editor => 
				{
					var pos = new vscode.Position(logItem.line-1,0);
					editor.selections = [new vscode.Selection(pos,pos)]; 
					var range = new vscode.Range(pos, pos);
					editor.revealRange(range);
				});
		}
	}
}