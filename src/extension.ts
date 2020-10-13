import * as vscode from "vscode";
import { NLPCommands } from "./command";
import { AnalyzerSequence } from './analyzerSequence';
import { LogFile } from './logfile';

export function activate(ctx: vscode.ExtensionContext): void {
    NLPCommands.attach(ctx);
    AnalyzerSequence.attach(ctx);
}
