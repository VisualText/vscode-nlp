import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SequenceFile } from './sequence';
import { visualText } from './visualText';
import { JsonState } from './jsonState';
import { dirfuncs } from './dirfuncs';
import { LogFile } from './logfile';
import { nlpFileType } from './textFile';

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

    hasText(): boolean {
        return this.currentTextFile.fsPath.length ? true : false;
    }

    newAnalyzer(): string {
        if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'newanalyzer', prompt: 'Enter new analyzer name' }).then(newname => {
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
            vscode.window.showWarningMessage('NLP Engine not set. Set in state.json in main directory.');
            return false;
        } else {
            var fromDir = path.join(visualText.getVisualTextDirectory('analyzer'));
            if (!dirfuncs.makeDir(this.analyzerDir.fsPath)) {
                vscode.window.showWarningMessage(`Could not make directory: ${fromDir}`);
                return false;
            }
            if (!dirfuncs.copyDirectory(fromDir,this.analyzerDir.fsPath)) {
                vscode.window.showWarningMessage('Copy directory for new analyzer failed');
                return false;
            }
            this.load(this.analyzerDir);
            vscode.commands.executeCommand('textView.refreshAll');
            vscode.commands.executeCommand('outputView.refreshAll');
            vscode.commands.executeCommand('sequenceView.refreshAll');
            vscode.commands.executeCommand('analyzerView.refreshAll');
            this.loaded = true;
            return true; 
        }
    }

    createAnaSequenceFile(content: string=''): boolean {
        var cont = content.length ? content : '#\ntokenize	nil	# Gen:   Convert input to token list.';
        if (this.getSpecDirectory()) {
            var anaFile = path.join(this.getSpecDirectory().fsPath,'analyzer.seq');
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
            this.outputDir = vscode.Uri.file(this.currentTextFile.fsPath + '_log');
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