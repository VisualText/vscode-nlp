# Change Log
All notable changes to the [VSCode NLP++ extension](http://vscode.visualtext.org) will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

### 3.2.3
Toolbar cleanup: moved the **Video** and **Create Claude Prompt** actions (Analyzers view) and **Video** (Output view) from the title bar into the `...` overflow. The Run Regression Test button stays on the Analyzers toolbar.

### 3.2.2
Help announcements, an LLM prompt library, and polish.

- **Announcements**: version-independent broadcast pages (`Help/markdown/vscode/announcements/<id>.md`) that show once per user on the next relogin, even without an extension update. New **Announcements** node in the Help view and a **Show Latest Announcement** (📣) button.
- The **NLP++ Textbook** is now featured on the Help home page and listed in the Help view.
- **LLM Prompts**: a new Help-view node lists reusable prompt files (`Help/markdown/vscode/prompts/<name>.md`) whose `{{...}}` placeholders are filled with this machine's engine/analyzer/library paths and opened in a new editor. Authorable in the VisualText files. **Create Claude Prompt** now opens the first prompt.

### 3.2.0
Added an in-extension Help system and a built-in regression-test runner.

- **Help view** in the NLP++ sidebar plus a 📖 book button on the view toolbars, opening markdown help pages (Quick Start, Compiling, Regression Testing, Lazy Loading) and an **NLP++** reference node (functions, variables, etc.). Help content lives in the VisualText files under `Help/markdown/vscode/`.
- **Version notes**: on first install the Help home opens; on upgrade the newest unseen `versions/<ver>.md` opens automatically (tracked in globalState).
- **Create Claude Prompt to Build an Analyzer** (Help view + Analyzers toolbar): opens a new editor with a generated prompt containing this machine's engine, example/template analyzer, and library paths.
- **Built-in regression runner**: "Run Regression Test" / "Bless Regression Goldens" now run natively and stream `PASS`/`FAIL`/`MISSING` into the **Logging** view (no terminal, no Python dependency). Set `analyzer.regressionTerminal` to use the old `nlp_regress.py` terminal path. A 🧪 test icon and right-click items on each Text-view file/folder scope a run to that item.
- The Logging view now **auto-scrolls** to the newest line, and a regression run **clears the log** before starting.

### 3.1.30
Added a whole-analyzer regression tester to the Analyzers panel.

- New **"Run Regression Test (All Files)"** toolbar button (and analyzer right-click item) runs `nlp_regress.py` over every file in the analyzer's `input/` directory in an "NLP++ Regression" terminal, showing live PASS/FAIL output. It compares the structured extraction semantically (id-stripped, order-insensitive), so it is stable across cosmetic engine drift while still catching real extraction changes.
- New **"Bless Regression Goldens (All Files)"** command captures the goldens. It only shows the overwrite confirmation when goldens already exist under `test/expected/`; the first bless (nothing to overwrite) just creates them.
- Complements the existing per-file, line-by-line "Run Regression Test".

### 3.1.29
Fixed two issues with python passes placed before the tokenizer.

- A python pass now always shows the Python icon. `getPassFiles` was overwriting every pass's uri with `<name>.nlp`, so a python pass pointed at a non-existent `.nlp`, read as "missing", and fell back to the default dot icon. Python passes now keep their `.py` uri.
- Clicking a python pass inserted before the tokenizer now opens its `.py` file. The sequence view treated "pass 1" as the tokenizer (opening the sequence file / tree / rule matches); a python pass at pass 1 is now excluded from that special-casing.

### 3.1.28
Simplified the Python pass type into a single, position-aware pass.

- Removed the separate `pythonpre` flavor. There is now one **Python** pass that runs wherever it sits in the sequence: place it before the tokenizer to run on raw text, or after the tokenizer to run post-tokenization. It is the only pass type allowed before tokenization.
- "Insert > Python" now just prompts for a name (no pre/post choice). The generated `.py` stub documents the positional pre/post behavior the engine passes as its phase argument.
- The tokenizer's right-click menu gains **"Insert Python Pass Before Tokenizer"**, so a python pass can be placed ahead of the tokenizer (previously the menu only inserted after the selected pass).
- Existing `pythonpre` passes are still recognized when read, so older analyzers keep working.

### 3.1.27
Added support for the native **Python pass** type in the analyzer sequence: a Python icon in the sequence tree, an "Insert > Python" command that creates a `.py` stub in `spec/`, and `.py` pass handling in the sequence model.

### 3.1.26
Gave the analyzer-only compile its own library name and a matching run mode.

- "Compile Analyzer Only" now produces `analyzer.dll` (`analyzer.so` / `analyzer.dylib`) instead of `<analyzerName>.dll`; the analyzer-named library is reserved for "Compile Analyzer and KB", which compiles both together.
- The run-mode status bar now cycles through four modes: Interpreted -> Compiled KB -> Compiled Analyzer -> Compiled. In Compiled Analyzer mode the analyzer is run from `analyzer.dll` while the KB stays interpreted.
- The KB view now also surfaces `analyzer.dll` alongside `kb.dll` and the analyzer-named library.

### 3.1.25
Added **"Compile Analyzer Only to C++ Library"**, which invokes `nlp.exe -COMPILEANA` (requires NLP-engine 3.6.0+).

- Regenerates only the analyzer C++ (`run/`) and rebuilds the analyzer library, reusing the already-generated KB C++ (`kb/`) — a fast recompile when only NLP++ rules changed, skipping KB regeneration.
- Available from the Analyzers view title menu and an analyzer's context menu, alongside "Compile Analyzer and KB" and "Compile KB".
- Warns if no KB C++ exists yet (run "Compile Analyzer and KB" or "Compile KB" once first).

### 3.1.10
Added the ability to compile only the knowledge base (KB) and to run an interpreted analyzer against the compiled KB.

- Renamed the existing analyzer compile command to **"Compile Analyzer and KB to C++ Library"** to reflect that it produces both.
- **"Compile KB to C++ Library"** now invokes `nlp.exe -COMPILEKB` and produces `kb.dll` (`kb.so` / `kb.dylib` on Linux/macOS) in the analyzer directory.
- The run-mode status bar now cycles through three modes: Interpreted -> Compiled -> Compiled KB. In Compiled KB mode the analyzer is run interpreted while the compiled KB library is loaded.

### 3.0.0
Added support for compiling analyzers and the knowledge base (KB).
Benefits: faster execution and protection of native NLP++ source code when analyzers are distributed to customers without access to the NLP++ source.

### 2.49.6
Now has different colorization for light and dark themes.

### 2.48.5
Opens the local html files in the browser instead of online.

### 2.47.1
Fixing display for light themes. This is not complete. There must be a way to make it automatifc for textmate colorization. See settings-light.json.

### 2.46.1
Put add mod back into the sequence view.

### 2.45.5
Added load python library files.

### 2.44.4
No longer displaying old KB files.

### 2.43.8
Fixing duplicate pass with folders, the N("$text",1) snippet, and copying context line from file above.

### 2.43.0
Added file comparison to library files in the sequence.

### 2.42.4
Allows for selecting multiple analyzer blocks when creating analyzer and to insert analyzer blocks into an existing sequence.

### 2.40.4
Fixed folder creation and moving.

### 2.39.0
Added highlighting of dictionary matches.

### 2.36.4
Added capability to call Python scripts that run on the text in a text window.

### 2.35.0
Reorganization of library dictionaries, kbs, and mod files

### 2.34.2
Added Portuguese dictionaries in KB context menu.

### 2.33.2
Updated vscode extension path for linux.

### 2.32.3
Added readme files editing in Analyzer window anywhere. Misc fixes.

### 2.31.3
When loading an analyzer, check to see if the hier.kb file needs updating (added the "emoji" path recently).

### 2.30.1
Can now create an ECL file.

### 2.29.1
Removed icu library transfers for Linux and Macos because no longer needed.

### 2.28.11
Fixed error display (again)

### 2.27.3
Overhauled the reformat rule in general. It also now includes the suggested node and ending @@. Also, it now has reformat to one line and reformat with paren attributes listed on separate lines.

### 2.26.2
Added [HPCC Systems](https://github.com/hpcc-systems) manifest file generation to the analyzer view. This allows for sending NLP++ files to the HPCC Server to run using the HPCC Systems NLP++ Plugin.

### 2.25.7
Added fast load option for the TextView for large number of files

### 2.24.4
Can now display fired rules from dictionaries.

### 2.23.0
Enhanced search for sequence files.

### 2.22.2
Can now turn off auto updates.

### 2.21.0
Can now choose log flag for all logs, final logs only, and completely silent.

### 2.20.10
One-level sequence folders should now be working.

### 2.19.4
Adding testing files for regression testing.

### 2.18.0
If a pass exists, replace it when inserting a library pass. This in effect "updates" the file which is often the case with KBFuncs.nlp.

### 2.17.13
Added mod files allowing for saving and loading multiple files together in one file.

### 2.16.3
Put active toggle on sequence passes.

### 2.15.0
Now opening files to the side that are modified or called by a context menu.

### 2.14.6
Renaming now changes header comment. Dupliation intelligently increments end number.

### 2.13.8
Added icon buttons to directly open tutorial videos.

### 2.12.5
Can copy input files and folders to another analyzer. Fixed delete log files bug in the analyzerView. Added icons to the log output lines.

### 2.11.5
Can now move the VisualText editor up or down in the analyzer view.

### 2.10.0
Added library files for dictionaires and KBs.

### 2.9.2
Copy kb files to a sister analyzer.

### 2.8.2
Added toggle active / inactive for kbb and dict files. Added attr and val while loops in snipper.

### 2.7.2
Insert and delete orphan(s), icon variety in KB, duplidate line shortcut in dict and kbb, explore output directory, import analyzer

### 2.6.2
NLP Engine couts are now displayed in the logview after the run.

### 2.5.1
Users can now quickly move an output file to sister analyzer's text or kb.

### 2.4.4
Dict type in output view, explore in sequence view, and bug fixes.

### 2.3.1
Added move file from output to kb directory.

### 2.2.2
Added the ability to copy files to the KB directory.

### 2.1.2
Comments now follow VSCode standard of ctrl-/

### 2.0.2
New version: KB Browser with .dict files and .kbb files which make dictionary and knowledge base building much easier. Is in conjunciton with version 2 of the NLP Engine.

### 1.65.1
Removed boost and used std::filesystem and std::regex

### 1.64.5
Added download of the boost file system library

### 1.63.3
Added new and library pass submenus

### 1.62.4
Added README files to analyzer view

### 1.61.4
Complete overhaul of updater

### 1.60.5
Enhanced error reporting in log view

### 1.59.3
Added move folders to the text view

### 1.58.0
Added folders to the analyzer view

### 1.57.1
Advises on NLP-ENGINE update fail. Also opens file browser for any file or directory on all three platforms.

### 1.56.1
Colorization of NLP++ folders added automatically

### 1.55.3
Added merge .dict files to the KB View context menu

### 1.54.11
Added generate main.kb

### 1.53.11
Added help for special variables with dollar signs

### 1.52.0
Added analyzer processing queue for running multiple folders

### 1.51.2
Added "Split directory" to textview to split large directories into smaller subdirectories

### 1.50.1
Added keybindings for reformat rule, final tree, and pass tree for .nlp and unfold all for .tree

### v1.49.3
Added descriptive tooltip to tokenizer path in the analyzer sequence. Fixed renaming.

### v1.48.0
Add properties to files and folders. Sped up file operations, fixed log deletion bugs, added cancel file operations, added file operation counts display.

### v1.47.5
Added struniquechars to NLP++ and snippets

### v1.46.3
Added refresh treeviews array to fileops

### v1.45.0
Added .dict files to be text files for dictionaries where each meaning for each word occupies one line

### v1.44.0
Added webitekb function

### v1.43.4
Added a KB View List

### v1.42.2
Unicode fixes for colorizing

### v1.42.1
Major fixes to the textview conext menu

### v1.42.0
Check for older pat files more obvious and clean, misc fixes.

### v1.41.7
Added cross reference context menu items in nlp files, tree files, and txxt files

### v1.40.0
Lexer improvements

### v1.39.7
Added duplicate analyzer in the same folder. Fixed delete messages, generate exact rule, deleting analyzer logs, and comments that were removing $ variables.

### v1.38.0
Added fold and unfold recursively in trees and kbb displays

### v1.37.1
Added chartok tokenize which breaks apart all characters

### v1.36.0
Added windows Help.chm file in context menu for windows only

### v1.35.0
Added cancel analyzer during processing

### v1.34.2
Don't open text file when analyzing. Also @MULTI fixes and other fixes.

### v1.33.5
Fixed numerous problems with fileOps

### v1.33.0
Added "Generate @PATH" from tree

### v1.32.0
Added icons to output view

### v1.31.3
Fixed version number bug in linux and mac

### v1.31.2
Added unicode character offsets to trees

### v1.30.16
Mac and Linux fixes

### v1.30.8
Security updates

### v1.30.7
Now uses the unicode version of the nlp-engine

### v1.30.0
Now handles utf8 files and characters (unicode)

### v1.21.4
Various minor issues fixed

### v1.20.7
Added stable file and directory deletes and copies

### v1.19.0
Added copy single analyzer or all analyzers to chosen folder

### v1.18.2
Added analyzer operation queue

### v1.17.1
Added sort & unique to text files

### v1.16.2
Major overhaul on updater

### v1.15.10
Reveals sequence number for an nlp file. This will eventually select the sequence item once Microsoft fully implements the reveal function for tree items.

### v1.14.3
Added delete logs to textview. Initialization messages now to LOGGING tab.

### v1.13.1
Simple search for function. This is a workable hack.

### v1.12.2
Added online browser lookup help where links work. This is to fix the fact that links don't work in the WebView inside VSCode.

### v1.11.1
Add clearing log folders for all analyzers for archiving analyzers

### v1.10.0
Copies settings.json file to the current work file for special NLP++ colorization

### v1.9.6
Added comment / uncomment lines

### v1.8.0
Added first version progress bar

### v1.7.8
Fixed autogenerate rule

### v1.7.7
Analyzer log files now have the extension .tree, added duplicate pass, update nlp-engine fix

### v1.6.1
Added updating VisualText files version separately allowing for independently updating

### v1.5.2
Now checks nlp-engine version and updates if newer exists. v1.5.2 improved lexer.

### v1.4.1
Allow for creating different type analyzers including basic and English

### v1.3.0
Changed all the pat files to nlp but still will process both extensions. Now downloads the latest version of nlp-engine at installation time, no longer included in the extension.

### v1.2.0
Fixed one line bug for the sequence file and allow for multiple pass selections for inserting.

### v1.1.2
Allows for dicttok, dicttokz, and cmltok variations of the tokenizer. Also delete and remame files also changes the log files directory name correctly in the textView.

### v1.1.1
Analyze a folder of texts

### v1.0.11
Fixed color highlights rule rewrite line

### v1.0.8
Updated NLP Engine with empty tmp folders

### v1.0.5
Added duplicate line for rule editor

### v1.0.4

The NLP engine executable and engine directory are now included in the NLP language extension for VSCode. The location of the engine is located in a subdirectory of the nlp extensions located in the extension directory located on the local computer. See documentation for VSCODE if you want to know the location of the directory which is different for different platforms.

### v0.9.29
Crash in reading the text files into the text view

### v0.9.28
Fixed sequence editor problems

### v0.9.27
Fixing paths for calling nlp.exe and missing npm package

## v0.9.23
- Changed fs.path to fs.fsPath

## v0.9.23
- Fixing highlight to rule fired logic

## v0.9.22
- Fixed mixed highlighting rule-fired bug

## v0.9.21
- Fixed delete directory bug

## v0.9.16
- Initial release with minor fixes
