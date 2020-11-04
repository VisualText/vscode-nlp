import * as vscode from "vscode";
import { VisualText } from './visualText';
import { AnalyzerView } from './analyzerView';
import { NLPCommands } from "./command";
import { SequenceView } from './sequenceView';
import { TextView } from './textView';

export function activate(ctx: vscode.ExtensionContext): void {
    VisualText.attach(ctx);
    NLPCommands.attach(ctx);
    AnalyzerView.attach(ctx);
    SequenceView.attach(ctx);
    TextView.attach(ctx);
}

