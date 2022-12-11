import * as vscode from "vscode";
import { VisualText } from './visualText';
import { AnalyzerView } from './analyzerView';
import { NLPCommands } from "./command";
import { SequenceView } from './sequenceView';
import { TextView } from './textView';
import { KBView } from './kbView';
import { OutputView } from './outputView';
import { FindView } from './findView';
import { HelpView } from './helpView';
import { LogView } from './logView';
import { NLPStatusBar } from './status';
import { visualText } from './visualText';

export function activate(ctx: vscode.ExtensionContext): void {
    LogView.attach(ctx);
    VisualText.attach(ctx);
    AnalyzerView.attach(ctx);
    TextView.attach(ctx);
    OutputView.attach(ctx);
    SequenceView.attach(ctx);
    KBView.attach(ctx);
    FindView.attach(ctx);
    HelpView.attach(ctx);
    NLPCommands.attach(ctx);
    NLPStatusBar.attach(ctx);

    visualText.startUpdater();
}