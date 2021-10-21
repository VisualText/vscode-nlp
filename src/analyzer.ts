import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SequenceFile } from './sequence';
import { visualText } from './visualText';
import { JsonState } from './jsonState';
import { dirfuncs } from './dirfuncs';
import { LogFile } from './logfile';
import { nlpFileType } from './textFile';

export enum analyzerStatus { UNKNOWN, RUNNING, DONE }
export enum analyzerOperation { UNKNOWN, COPY, DELETE, DONE }
export enum analyzerOperationStatus { UNKNOWN, RUNNING, FAILED, DONE }

interface analyzerOperations {
    uriAnalyzer: vscode.Uri;
    uriAnalyzer2: vscode.Uri;
    operation: analyzerOperation;
    status: analyzerOperationStatus;
}

export let analyzer: Analyzer;
export class Analyzer {

    public seqFile = new SequenceFile();
    private jsonState = new JsonState();
    private analyzerDir: vscode.Uri = vscode.Uri.file('');
    private specDir: vscode.Uri = vscode.Uri.file('');
    private inputDir: vscode.Uri = vscode.Uri.file('');
    private outputDir: vscode.Uri = vscode.Uri.file('');
    private logDir: vscode.Uri = vscode.Uri.file('');
    private currentTextFile: vscode.Uri = vscode.Uri.file('');
    private currentPassFile: vscode.Uri = vscode.Uri.file('');
    private passNum: number = 0;;
    private loaded: boolean = false;

    public timerStatus: analyzerStatus = analyzerStatus.UNKNOWN;
    public analyzerQueue: analyzerOperations[] = new Array();
    public timerCounter: number = 0;
    public timerID: number = 0;
    public analyzerCopyUri: vscode.Uri = vscode.Uri.file('');

	constructor() {
    }

	readState() {
        if (this.jsonState.jsonParse(this.analyzerDir,'state','visualText')) {
            var parse = this.jsonState.json.visualText[0];
            if (parse.currentTextFile) {
                var currentFile = parse.currentTextFile;
                if (fs.existsSync(currentFile))
                    this.currentTextFile = vscode.Uri.file(currentFile);
                else
                    this.currentTextFile = vscode.Uri.file(path.join(this.getInputDirectory().fsPath,currentFile));

                if (parse.currentPassFile) {
                    currentFile = parse.currentPassFile;
                    if (fs.existsSync(currentFile))
                        this.currentPassFile = vscode.Uri.file(currentFile);
                    else
                        this.currentPassFile = vscode.Uri.file(path.join(this.getSpecDirectory().fsPath,currentFile));                    
                }

                vscode.commands.executeCommand('status.update');
                this.outputDirectory();               
            }
        }
    }

    startOperations() {
        this.timerCounter = 0;
        if (this.timerID == 0) {
            visualText.debugMessage('Starting analyzer operations...');
            this.timerID = +setInterval(this.analyzerTimer,1000);
        }
    }

    addAnalyzerOperation(analyzerUri: vscode.Uri, analyzerUri2: vscode.Uri, operation: analyzerOperation) {
        this.analyzerQueue.push({uriAnalyzer: analyzerUri, uriAnalyzer2: analyzerUri2, operation: operation, status: analyzerOperationStatus.UNKNOWN})
    }

    analyzerDelete(uri: vscode.Uri) {
        this.addAnalyzerOperation(uri,vscode.Uri.file(''),analyzerOperation.DELETE);
    }

    copyAnalyzer(fromUri: vscode.Uri, toUri: vscode.Uri) {
        this.addAnalyzerOperation(fromUri,toUri,analyzerOperation.COPY);
    }

    analyzerTimer() {
        let debug = false;

        if (visualText.analyzer.timerCounter++ >= 45) {
            visualText.debugMessage('Analyzer processing timed out');
            visualText.analyzer.timerStatus = analyzerStatus.DONE;
        }

        //if (debug) visualText.debugMessage('status: ' + visualText.updaterStatusStrs[visualText.updaterGlobalStatus] + ' ' + visualText.updaterCounter.toString());

        // Cycle through operations and find the one to work on
        if (visualText.analyzer.analyzerQueue.length == 0) {
            visualText.analyzer.timerStatus = analyzerStatus.DONE;
        }
        let ana = visualText.analyzer.analyzerQueue[0];
        let alldone = true;
        for (let a of visualText.analyzer.analyzerQueue) {
            if (a.status == analyzerOperationStatus.UNKNOWN || a.status == analyzerOperationStatus.RUNNING) {
                ana = a;
                alldone = false;
                break;
            }
            else if (a.status != analyzerOperationStatus.FAILED && a.status != analyzerOperationStatus.DONE) {
                alldone = false;
            }
        }
        if (alldone)
            visualText.analyzer.timerStatus = analyzerStatus.DONE;
        else
            visualText.analyzer.timerStatus = analyzerStatus.RUNNING;

        switch (visualText.analyzer.timerStatus) {
            case analyzerStatus.RUNNING: {

                switch (ana.operation) {
                    case analyzerOperation.COPY: {
                        if (ana.status == analyzerOperationStatus.UNKNOWN) {
                            var copydir = require('copy-dir');
                            if (!fs.existsSync(ana.uriAnalyzer.fsPath)) {
                                if (!dirfuncs.makeDir(ana.uriAnalyzer.fsPath))
                                    visualText.analyzer.timerStatus = analyzerStatus.DONE;
                            }
                            visualText.debugMessage('Copying analyzer: ' + ana.uriAnalyzer.fsPath);
                            copydir(ana.uriAnalyzer.fsPath,ana.uriAnalyzer2.fsPath, function(err) {
                                if (err) {
                                    visualText.debugMessage('Analyzer copy failed');
                                    ana.status = analyzerOperationStatus.FAILED;
                                }
                                visualText.analyzer.load(ana.uriAnalyzer2);
                                visualText.analyzer.loaded = true;
                                visualText.debugMessage('ANALYZER COPIED TO: ' + ana.uriAnalyzer2.fsPath);
                                ana.status = analyzerOperationStatus.DONE;
                            });
                            ana.status = analyzerOperationStatus.RUNNING;
                        }
                    }
                    case analyzerOperation.DELETE: {
                        if (ana.status == analyzerOperationStatus.UNKNOWN) {
                            visualText.debugMessage('Deleting analzyer: ' + ana.uriAnalyzer.fsPath);
                            if (dirfuncs.delDir(ana.uriAnalyzer.fsPath)) {
                                ana.status = analyzerOperationStatus.DONE;
                                visualText.debugMessage('ANALYZER DELETED: ' + ana.uriAnalyzer.fsPath);
                            }
                            else {
                                ana.status = analyzerOperationStatus.FAILED;
                                visualText.debugMessage('ANALYZER DELETE FAILED: ' + ana.uriAnalyzer2.fsPath);
                            }
                        }
                    }
                }
                break;
            }
            case analyzerStatus.DONE: {
                clearInterval(visualText.analyzer.timerID);
                visualText.analyzer.timerID = 0;
                visualText.analyzer.analyzerQueue = [];
                vscode.commands.executeCommand('analyzerView.refreshAll');
                visualText.debugMessage('ANALYZER PROCESSING COMPLETE');
                break;
            }
        }
    }

    hasText(): boolean {
        return this.currentTextFile.fsPath.length ? true : false;
    }

    newAnalyzer(): string {
        if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'newanalyzer', prompt: 'Enter new visualText.analyzer name' }).then(newname => {
				if (newname) {
                    this.createNewAnalyzer(newname);
                    return newname;
				}
			});
        }
        return '';
    }

    zeroAnalyzer() {
        this.analyzerDir = vscode.Uri.file('');
        this.specDir = vscode.Uri.file('');
        this.inputDir = vscode.Uri.file('');
        this.outputDir = vscode.Uri.file('');
        this.currentTextFile = vscode.Uri.file('');
        this.passNum = 0;
        this.loaded = false;
    }

    createNewAnalyzer(analyzerName: string): boolean {
        visualText.readState();
        this.analyzerDir = vscode.Uri.file(path.join(visualText.getWorkspaceFolder().fsPath,analyzerName));
        if (fs.existsSync(this.analyzerDir.fsPath)) {
            vscode.window.showWarningMessage('Analyzer folder already exists');
            return false;
        } else if (!visualText.visualTextDirectoryExists()) {
            vscode.window.showWarningMessage('NLP Engine not found');
            return false;
        } else {
            let items: vscode.QuickPickItem[] = [];
            var fromDir = path.join(visualText.getVisualTextDirectory('analyzers'));
            if (dirfuncs.isDir(fromDir)) {
                let files = dirfuncs.getDirectories(vscode.Uri.file(fromDir));
                for (let file of files) {
                    if (dirfuncs.isDir(file.fsPath)) {
                        items.push({label: path.basename(file.fsPath), description: ' (visualText.analyzer template)'});
                    }
                }
                vscode.window.showQuickPick(items).then(selection => {
                    if (!selection) {
                    return false;
                    }
                    this.makeNewAnalyzer(fromDir,selection.label);
                    this.loaded = true;
                    return true;
                });

            } else {
                fromDir = path.join(visualText.getVisualTextDirectory('visualText'));
                this.makeNewAnalyzer(fromDir,'');
            }

        }
        return false;
    }

    makeNewAnalyzer(fromDir: string, analyzer: string) {
        fromDir = path.join(fromDir,analyzer);
        if (!dirfuncs.makeDir(this.analyzerDir.fsPath)) {
            vscode.window.showWarningMessage(`Could not make directory: ${fromDir}`);
            return false;
        }
        this.addAnalyzerOperation(vscode.Uri.file(fromDir),this.analyzerDir,analyzerOperation.COPY);
        this.startOperations();
    }

    createAnaSequenceFile(content: string=''): boolean {
        var cont = content.length ? content : '#\ntokenize	nil	# Gen:   Convert input to token list.';
        if (this.getSpecDirectory()) {
            var anaFile = path.join(this.getSpecDirectory().fsPath,'visualText.analyzer.seq');
            return dirfuncs.writeFile(anaFile,cont);
        }
        return false;
    }

    saveStateFile() {
        if (this.currentPassFile.fsPath.length == 0 || this.currentTextFile.fsPath.length == 0) {
            if (this.jsonState.jsonParse(this.analyzerDir,'state','visualText')) {
                var parse = this.jsonState.json.visualText[0];
                if (parse.currentTextFile && this.currentPassFile.fsPath.length == 0) {
                    var currentFile = parse.currentTextFile;
                    if (fs.existsSync(currentFile))
                        this.currentTextFile = vscode.Uri.file(currentFile);
                    else
                        this.currentTextFile = vscode.Uri.file(path.join(this.getInputDirectory().fsPath,currentFile));           
                }
                if (parse.currentPassFile && this.currentPassFile.fsPath.length == 0) {
                    var currentFile = parse.currentPassFile;
                    if (fs.existsSync(currentFile))
                        this.currentPassFile = vscode.Uri.file(currentFile);
                    else
                        this.currentPassFile = vscode.Uri.file(path.join(this.getSpecDirectory().fsPath,currentFile));           
                }
            }            
        }

        var stateJsonDefault: any = {
            "visualText": [
                {
                    "name": "Analyzer",
                    "type": "state",
                    "currentTextFile": this.currentTextFile.fsPath,
                    "currentPassFile": this.currentPassFile.fsPath
                }
            ]
        }
        this.jsonState.saveFile(this.analyzerDir.fsPath, 'state', stateJsonDefault);  
        this.outputDirectory();
    }

    saveCurrentFile(currentFile: vscode.Uri) {
        this.currentTextFile = currentFile;
        this.saveStateFile();
    }

    saveCurrentPass(passFile: vscode.Uri, passNum: number) {
        this.currentPassFile = passFile;
        this.passNum = passNum;
        this.saveStateFile();
    }

    load(analyzerDir: vscode.Uri) {
        this.setWorkingDir(analyzerDir);
        this.readState();
        this.seqFile.init();
        vscode.commands.executeCommand('analyzerView.updateTitle',analyzerDir);
        if (this.currentTextFile.fsPath.length)
            vscode.commands.executeCommand('textView.updateTitle',vscode.Uri.file(this.currentTextFile.fsPath));
    }

    outputDirectory() {
        if (this.currentTextFile.fsPath.length) {
            this.outputDir = vscode.Uri.file(this.currentTextFile.fsPath + visualText.LOG_SUFFIX);
        } else {
            this.outputDir = vscode.Uri.file(path.join(this.analyzerDir.fsPath,'output'));
        }
    }

    clearOutputDirectory() {
        if (fs.lstatSync(this.outputDir.fsPath).isDirectory()) {
            fs.readdir(this.outputDir.fsPath, (err, files) => {
                if (err) throw err;
            
                for (const file of files) {
                    fs.unlink(path.join(this.outputDir.fsPath, file), err => {
                        if (err) throw err;
                    });
                }
            });            
        }
    }

    logFile(name: string): vscode.Uri {
        if (this.logDir.fsPath.length) {
            var pather = path.join(this.logDir.fsPath,name);
            pather = pather.concat('.log');
            return vscode.Uri.file(pather);        
        }
        return vscode.Uri.file('');
    }

    isLoaded(): boolean {
        return this.loaded;
    }

    getAnalyzerDirectory(subDir: string=''): vscode.Uri {
        return vscode.Uri.file(path.join(this.analyzerDir.fsPath,subDir));
    }

    getInputDirectory(): vscode.Uri {
        return this.inputDir;
    }

    getSpecDirectory(): vscode.Uri {
		return this.specDir;
	}

    getOutputDirectory(): vscode.Uri {
        return this.outputDir;
    }
    
    getLogDirectory(): vscode.Uri {
        return this.logDir;
    }

    getTextPath(): vscode.Uri {
        return this.currentTextFile;
    }

    getPassPath(): vscode.Uri {
        return this.currentPassFile;
    }

    getAnaLogFile(): vscode.Uri {
        var logFile = new LogFile();
        return logFile.anaFile(this.passNum, nlpFileType.TREE);
    }

	setWorkingDir(directory: vscode.Uri) {
        this.analyzerDir = directory;
        if (fs.existsSync(directory.fsPath)) {
            this.specDir = vscode.Uri.file(path.join(directory.fsPath,'spec'));
            this.inputDir = vscode.Uri.file(path.join(directory.fsPath,'input'));
            this.logDir = vscode.Uri.file(path.join(directory.fsPath,'logs'));
            this.loaded = true;          
        }
        else
            this.loaded = false;
	}
}