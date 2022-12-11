import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { visualText } from './visualText';
import { TextFile } from './textFile';

export enum logLineType { INFO, SYNTAX_ERROR, DOWNLOAD_ERROR, UPDATER_TIMEOUT, JSON_ERROR }

interface LogItem {
	uri?: vscode.Uri | undefined;
	passNum: number;
	line: number;
	label: string;
	icon: string;
	type: logLineType;
}

export class OutputTreeDataProvider implements vscode.TreeDataProvider<LogItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<LogItem | undefined | null | void> = new vscode.EventEmitter<LogItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<LogItem | undefined | null | void> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
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

	panel: vscode.WebviewPanel | undefined;
	exists: boolean;
	ctx: vscode.ExtensionContext;

	public logView: vscode.TreeView<LogItem>;
	private logs: LogItem[] = new Array();

	constructor(context: vscode.ExtensionContext) {
		const logViewProvider = new OutputTreeDataProvider();
		this.logView = vscode.window.createTreeView('logView', { treeDataProvider: logViewProvider });
		vscode.commands.registerCommand('logView.refreshAll', () => logViewProvider.refresh());
		vscode.commands.registerCommand('logView.openFile', (resource) => this.openFile(resource));
		vscode.commands.registerCommand('logView.addMessage', (message,uri) => this.addMessage(message,uri));
		vscode.commands.registerCommand('logView.conceptualGrammar', () => this.loadCGLog());
		vscode.commands.registerCommand('logView.timing', () => this.loadTimingLog());
		vscode.commands.registerCommand('logView.makeAna', () => this.loadMakeAna());
		vscode.commands.registerCommand('logView.clear', () => this.clearLogs());
		vscode.commands.registerCommand('logView.stopFileOps', () => this.stopFileOps());
		vscode.commands.registerCommand('logView.exploreEngineDir', () => this.exploreEngineDir());
		vscode.commands.registerCommand('logView.downloadHelp', () => this.downloadHelp());
		vscode.commands.registerCommand('logView.updaterHelp', () => this.updaterHelp());

		this.exists = false;
		this.ctx = context;
        this.panel = undefined;
    }

    static attach(ctx: vscode.ExtensionContext) {
        if (!logView) {
            logView = new LogView(ctx);
        }
        return logView;
	}

	downloadHelp() {
		visualText.displayHTMLFile('Download Help','DOWNLOADHELP.html');
	}

	updaterHelp() {
		visualText.displayHTMLFile('Updater Help','UPDATERHELP.html');
	}

	private loadTimingLog() {
		this.clearLogs();
		var cgFile = vscode.Uri.file(path.join(visualText.analyzer.getOutputDirectory().fsPath,'dbg.log'));
		this.addLogFile(cgFile);
	}

	private loadCGLog() {
		this.clearLogs();
		this.addLogFile(visualText.analyzer.treeFile('cgerr'));
	}
	
	public loadMakeAna() {
		this.clearLogs();
		var errorLog = vscode.Uri.file(path.join(visualText.analyzer.getOutputDirectory().fsPath,'err.log'));
		this.addLogFile(errorLog);
		this.addLogFile(visualText.analyzer.treeFile('make_ana'));
	}

	public clearLogs() {
		this.logs = [];
		vscode.commands.executeCommand('logView.refreshAll');			
	}

	public addMessage(message: string, uri: vscode.Uri | undefined) {
		this.logs.push(this.parseLogLine(message, uri));
	}

	public addLogFile(logFileName: vscode.Uri) {
		if (fs.existsSync(logFileName.fsPath)) {
			const logFile = new TextFile(logFileName.fsPath);
			for (let line of logFile.getLines()) {
				line = line.substring(0,line.length);
				if (line.length) {
					let log = this.parseLogLine(line,undefined);
					this.logs.push(log);		
				}
			}
		}		
	}

	public getLogs(): LogItem[] {
		return this.logs;
	}

	private parseLogLine(line: string, uri: vscode.Uri | undefined): LogItem {
		var passNum = 0;
		var lineNum = -1;
		var type = logLineType.INFO;
		var icon = 'arrow-small-right.svg';
		var firstTwoNumbers = false;

		let tokens = line.split(/[\t\s]/,2);  
		if (tokens.length >= 2) {
			passNum = +tokens[0];
			lineNum = +tokens[1];
			if (!isNaN(passNum) && !isNaN(lineNum) && lineNum > 0) {
				firstTwoNumbers = true;
			}
		}

		if (line.length) {
			if (firstTwoNumbers) {
				if (visualText.analyzer.isLoaded()) {
					var seqFile = visualText.analyzer.seqFile;
					uri = seqFile.getUriByPassNumber(passNum);
					type = logLineType.SYNTAX_ERROR;
				}
			} else if (line.startsWith('FAILED download')) {
				type = logLineType.DOWNLOAD_ERROR;
			} else if (line.startsWith('Jason file error:')) {
				type = logLineType.JSON_ERROR;
			} else if (line.startsWith('Updater timed out')) {
				type = logLineType.UPDATER_TIMEOUT;
			}
		}
		if (type != logLineType.INFO) {
			icon = 'error.svg';
		}

		return ({label: line, uri: uri, passNum: passNum, line: lineNum, icon: icon, type: type});
	}

	private openFile(logItem: LogItem): void {
		let line = logItem.label;
		visualText.colorizeAnalyzer();

		switch (logItem.type) {
			case logLineType.SYNTAX_ERROR: 
				var seqFile = visualText.analyzer.seqFile;
				if (logItem.uri) {
					vscode.window.showTextDocument(logItem.uri).then(editor => 
						{
							var pos = new vscode.Position(logItem.line-1,0);
							editor.selections = [new vscode.Selection(pos,pos)]; 
							var range = new vscode.Range(pos, pos);
							editor.revealRange(range);
						});
				}
				break;

			case logLineType.UPDATER_TIMEOUT:
				this.updaterHelp();
				break;

			case logLineType.DOWNLOAD_ERROR:
				this.downloadHelp();
				break;

			case logLineType.JSON_ERROR:
				let pos = line.indexOf('.json');
				let filepath = line.substring(18,pos+5);
				let msg = 'Json error(s) in file: ' + filepath;
				vscode.window.showErrorMessage(msg, "Click to edit file").then(response => {
					vscode.window.showTextDocument(vscode.Uri.file(filepath));
				});
				break;
		}
	}

	public updateTitle(message: string): void {
		if (message.length)
			this.logView.title = `LOGGING (${message})`;
		else
			this.logView.title = 'LOGGING';
	}

	private stopFileOps(): void {
		visualText.stopFileOps();
	}

	exploreEngineDir() {
		let dir = visualText.engineDirectory();
		visualText.openFileManager(dir.fsPath);
	}
}