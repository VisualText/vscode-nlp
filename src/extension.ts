import * as vscode from "vscode";
import { NLPCommands } from "./command";

export function activate(ctx: vscode.ExtensionContext): void {
    NLPCommands.attach(ctx);
}
