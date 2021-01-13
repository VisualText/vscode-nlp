import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { visualText } from './visualText';
import { TextFile } from './textFile';

interface LogItem {
	uri: vscode.Uri;
	passNum: number;
	line: number;
	label: string;
	icon: string;
}

export class OutputTreeDataProvider implements vscode.TreeDataProvider<LogItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<LogItem> = new vscode.EventEmitter<LogItem>();
	readonly onDidChangeTreeData: vscode.Event<LogItem> = this._onDidChangeTreeData.event;

	refresh(logItem: LogItem): void {
		this._onDidChangeTreeData.fire(logItem);
	}

	constructor() { }

	public getTreeItem(logItem: LogItem): vscode.TreeItem {
		return {
			label: logItem.label,
			resourceUri: logItem.uri,
			collapsibleState: void 0,
			command: {
				command: 'logView.openFile',
				arguments: [logItem],
				title: 'Open File with Error'
			},
			iconPath: {
				light: path.join(__filename, '..', '..', 'resources', 'dark', logItem.icon),
				dark: path.join(__filename, '..', '..', 'resources', 'dark', logItem.icon)
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
	private logs: LogItem[] = new Array();

	constructor(context: vscode.ExtensionContext) {
		const logViewProvider = new OutputTreeDataProvider();
		this.logView = vscode.window.createTreeView('logView', { treeDataProvider: logViewProvider });
		vscode.commands.registerCommand('logView.refreshAll', (resource) => logViewProvider.refresh(resource));
		vscode.commands.registerCommand('logView.openFile', (resource) => this.openFile(resource));
		vscode.commands.registerCommand('logView.addMessage', (message,uri) => this.addMessage(message,uri));
		vscode.commands.registerCommand('logView.conceptualGrammar', () => this.loadCGLog());
		vscode.commands.registerCommand('logView.timing', () => this.loadTimingLog());
		vscode.commands.registerCommand('logView.makeAna', () => this.loadMakeAna());
		vscode.commands.registerCommand('logView.clear', () => this.clearLogs());
    }
    
    static attach(ctx: vscode.ExtensionContext) {
        if (!logView) {
            logView = new LogView(ctx);
        }
        return logView;
	}

	private loadTimingLog() {
		this.clearLogs();
		var cgFile = vscode.Uri.file(path.join(visualText.analyzer.getOutputDirectory().fsPath,'dbg.log'));
		this.addLogFile(cgFile);
	}

	private loadCGLog() {
		this.clearLogs();
		this.addLogFile(visualText.analyzer.logFile('cgerr'));
	}
	
	public loadMakeAna() {
		this.clearLogs();
		var errorLog = vscode.Uri.file(path.join(visualText.analyzer.getOutputDirectory().fsPath,'err.log'));
		this.addLogFile(errorLog);
		this.addLogFile(visualText.analyzer.logFile('make_ana'));
	}

	public clearLogs() {
		this.logs = [];
		vscode.commands.executeCommand('logView.refreshAll');
	}

	public addMessage(message: string, uri: vscode.Uri) {
		this.logs.push(this.messageLine(message, uri));
	}

	public addLogFile(logFileName: vscode.Uri) {
		if (fs.existsSync(logFileName.fsPath)) {
			const logFile = new TextFile(logFileName.fsPath);
			for (let line of logFile.getLines()) {
				line = line.substr(0,line.length-1);
				if (line.length) {
					let log = this.parseLogLine(line);
					this.logs.push(log);						
				}
			}
		}		
	}

	public getLogs(): LogItem[] {
		return this.logs;
	}

	private messageLine(label: string, uri: vscode.Uri): LogItem {
		return ({label: label, uri: uri, passNum: 0, line: 0, icon: 'arrow-small-right.svg'});	
	}

	private parseLogLine(line: string): LogItem {
		var uri = vscode.Uri.file('');
		var passNum = 0;
		var lineNum = -1;
		var icon = 'arrow-small-right.svg';

		if (line.length) {
			let tokens = line.split(/[\t\s]/,2);  
			if (tokens.length >= 2) {
				var seqFile = visualText.analyzer.seqFile;
				passNum = +tokens[0];
				if (passNum) {
					uri = seqFile.getUriByPassNumber(passNum);
					icon = 'gear.svg';
				}
				lineNum = +tokens[1];
			}
		}

		return ({label: line, uri: uri, passNum: passNum, line: lineNum, icon: icon});
	}

	private openFile(logItem: LogItem): void {
		if (logItem.passNum) {
			var seqFile = visualText.analyzer.seqFile;
			var passFile = seqFile.getUriByPassNumber(logItem.passNum);

			vscode.window.showTextDocument(logItem.uri).then(editor => 
				{
					var pos = new vscode.Position(logItem.line-1,0);
					editor.selections = [new vscode.Selection(pos,pos)]; 
					var range = new vscode.Range(pos, pos);
					editor.revealRange(range);
				});
		} else if (logItem.uri.fsPath.length) {
			vscode.window.showTextDocument(logItem.uri);
		}
	}
}