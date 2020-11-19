import * as vscode from "vscode";
import { VisualText } from './visualText';
import { AnalyzerView } from './analyzerView';
import { NLPCommands } from "./command";
import { SequenceView } from './sequenceView';
import { TextView } from './textView';
import { OutputView } from './outputView';
import { FindView } from './findView';
import { LogView } from './logView';
import { NLPStatusBar } from './status';

export function activate(ctx: vscode.ExtensionContext): void {
    VisualText.attach(ctx);
    AnalyzerView.attach(ctx);
    TextView.attach(ctx);
    OutputView.attach(ctx);
    SequenceView.attach(ctx);
    FindView.attach(ctx);
    LogView.attach(ctx);
    NLPCommands.attach(ctx);
    NLPStatusBar.attach(ctx);
}

