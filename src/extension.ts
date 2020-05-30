import * as vscode from "vscode";
import { NLPCommands } from "./command";
import { AnalyzerSequence } from './analyzerSequence';

export function activate(ctx: vscode.ExtensionContext): void {
    NLPCommands.attach(ctx);

    new AnalyzerSequence(ctx);
}
