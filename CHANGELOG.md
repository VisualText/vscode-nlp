# Change Log
All notable changes to the "nlp" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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
