# NLP++ Language Extension

## Tutorial Videos

Many of you have been asking for tutorial videos on NLP++ and here is the first set. More coming soon...
1. NLP++ tutorial videos: http://tutorials.visualtext.org
1. Analyzers used in the videos: https://github.com/VisualText/nlp-tutorials
1. VisualText tutorial videos: http://vttutorials.visualtext.org

## Glitter Chat

[![Join the chat at https://gitter.im/NLPplusplus/VisualText](https://badges.gitter.im/NLPplusplus/VisualText.svg)](https://gitter.im/NLPplusplus/VisualText?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge) Join our glitter chat room for VisualText!

## Only Computer Language Dedicated to Natural Language Processing
NLP++ is the only computer language in the world exclusively dedicated to natural language processing. It allows for creating digital human readers that use linguistic and world knowledge to parse and understand text. Whether it be for extracting or marking up "messy" text or full-blown NLP understanding, this language allows for "anything thinkable".

## NLP++ and VisualText Now Unicode

The NLP-Engine for NLP++ now works with Unicode (UTF8 via the ICU C++ Package) including the ability to work with emojis.

![NLP++ Now works with Unicode in the form of UTF8](resources/UnicodeExample.gif)

## Quick Video Guides
Find [quick video guides](http://tutorials.visualtext.org/) on how to install and use VisualText including a "hello world" video as well as an in-depth tour of VisualText.

## Introduction

This is a VSCode Language Extension for NLP++ that recreates the functionality of [VisualText](http://visualtext.org) which has run on Microsoft Windows for the last two decades. NLP++ is a open source computer language specifically dedicated to creating text analyzers that mimic human readers and includes the NLP++ language and knowledge based system called the "conceptual grammar". NLP++ is used for any type of text processing from simple tagging or extraction, to full language parsing. There is a full english parser that is free an available for use (see information below).

The language extension and the required NLP-ENGINE run on Linux, Windows, and MacOS.

## Features

The VSCode NLP++ Language Extension allows for the fast development of NLP++ analyzers allowing users to:

* Quickly generate and edit NLP++ code
* Display the syntax tree in insightful ways
* Highlight text that has matched rules in each pass
* Display the knowledge base at strategic places in the analyzer sequence
* Easily edit and modify the pass sequence and texts to be analyze
* Display syntax errors to NLP++
* Auto generate rules
* Extensive snippets
* Help lookup

## NLP++ Example Analyzers

Example analyzers can be found in the "analyzers" folder in the NLP-ENGINE folder.

![NLP++ Language Extension opening example analyzers including the full English parser](resources/OpeningAnalyzersFolder.gif)

## Requirements

In order to use the VSCode NLP++ Language Extension, the NLP-ENGINE which is in the form of an executable and directory need to be present. Version one now includes this as part of the NLP language extension.

## NLP Engine Overview

The NLP-ENGINE now comes with the NLP++ Language extension but is available separately from the [VisualText github repository](https://github.com/VisualText/nlp-engine). The engine can run as a standalone executable (nlp.exe) that runs on Linux, Windows, and MacOS or it can be embedded into c++ code.

### Types of Analyzers Commonly Written Using NLP++

There are many types of analyzers that are written by NLP++ programmers including:

* Tagging of text
* Extract emails, dates, addresses, etc from unstructured text
* Entity Extraction
* Full NLP Parsing
* Sentiment analysis
* OCR Cleanup
* Extraction of data from messy text
* Autogenerate snippets from documentation

### Analyzer state.json

This file will automatically get generated when a new analyzer is created in VisualText VSCode. It is located in the .vscode directory under the folder for an individual analyzer.

    {
        "visualText": [
            {
                "name": "Analyzer",
                "type": "state",
                "currentTextFile": "/YOUR-PATH-HERE/nlp-engine/analyzers/corporate/input/Dev/Sold.txt",
                "currentPassFile": "/YOUR-PATH-HERE/nlp-engine/analyzers/corporate/spec/lookup.pat"
            }
        ]
    }

## Known Issues

There are many details in the windows version of VisualText that are yet to be implemented in the VSCode version.

## Release Notes

### 1.61.0
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

### 1.53.1
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

# Development

## VSCode Language Extension

Follow these instructions to install the development code for VSCode extension:

    git clone https://github.com/VisualText/vscode-nlp.git
    cd vscode-nlp
    npm install
    npm run watch
    
At which point you can edit the sources and launch debug sessions via F5 and included launch configurations.

## NLP Engine

The NLP Engine which is written in C++ is also open source and can be downloaded in development mode. You can find how to download and develop the NLP Engine code at: [https://github.com/VisualText/nlp-engine](https://github.com/VisualText/nlp-engine).

# License

[MIT](https://github.com/VisualText/vscode-nlp/blob/master/LICENSE)

