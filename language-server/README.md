# nlpplus-language-server

A [Language Server Protocol](https://microsoft.github.io/language-server-protocol/) server for
[NLP++](https://visualtext.org), the programming language for natural language processing.
It is the same server that powers the [VisualText](https://marketplace.visualstudio.com/items?itemName=dehilster.nlp)
extension for VS Code, packaged so any LSP-capable editor can use it.

## Features

- Outline and breadcrumbs: `@` regions, rules, and `@DECL` functions
- Hover on built-in functions (with a link to the function's help page), keywords, and node accessors
- Go to definition, find references, and rename across every pass file in the analyzer, plus concepts declared in `.kbb` knowledge-base files
- Workspace symbol search
- Completion for region markers, built-ins, keywords, rule-element modifiers, rules, concepts, and user functions
- Signature help
- Folding
- Semantic highlighting
- Diagnostics, plus a quick fix for misspelled function calls
- Document and range formatting

## Install

Requires Node.js 18 or newer.

```sh
npm install -g nlpplus-language-server
```

This puts `nlpplus-language-server` on your `PATH`. It speaks LSP over stdio by default.
`--stdio`, `--node-ipc`, `--pipe=<name>` and `--socket=<port>` are also accepted.

Open the **analyzer folder** (the one that contains `spec/`) as your project root. The server
indexes every `.nlp`, `.pat` and `.kbb` file under the root, so cross-pass navigation works.

## Editor setup

NLP++ pass files use the extensions `.nlp` and `.pat`. Most editors don't recognize them yet,
so each snippet below also registers the file type.

### Neovim (0.11+)

```lua
vim.filetype.add({ extension = { nlp = "nlp", pat = "nlp" } })

vim.lsp.config("nlpplus", {
  -- npm installs a .cmd shim on Windows, and Neovim spawns it only by its full name.
  cmd = { vim.fn.has("win32") == 1 and "nlpplus-language-server.cmd" or "nlpplus-language-server", "--stdio" },
  filetypes = { "nlp" },
  root_markers = { "spec", ".git" },
})
vim.lsp.enable("nlpplus")
```

### Helix

In `languages.toml`:

```toml
[language-server.nlpplus]
command = "nlpplus-language-server"
args = ["--stdio"]

[[language]]
name = "nlp"
scope = "source.nlp"
file-types = ["nlp", "pat"]
roots = ["spec"]
comment-tokens = ["#"]
block-comment-tokens = { start = "/*", end = "*/" }
indent = { tab-width = 4, unit = "\t" }
language-servers = ["nlpplus"]
```

### Emacs (Eglot)

```elisp
(define-derived-mode nlp-mode prog-mode "NLP++"
  (setq-local comment-start "# "))
(add-to-list 'auto-mode-alist '("\\.\\(nlp\\|pat\\)\\'" . nlp-mode))

(with-eval-after-load 'eglot
  (add-to-list 'eglot-server-programs
               '(nlp-mode "nlpplus-language-server" "--stdio")))
```

### Sublime Text (LSP package)

Install the NLP++ grammar from [nlpplus-tmbundle](https://github.com/VisualText/nlpplus-tmbundle)
so `.nlp` files get the `source.nlp` scope. Then add this in *Preferences → Package Settings → LSP → Settings*:

```json
{
  "clients": {
    "nlpplus": {
      "enabled": true,
      "command": ["nlpplus-language-server", "--stdio"],
      "selector": "source.nlp"
    }
  }
}
```

### Other editors

Run `nlpplus-language-server --stdio` for files of language id `nlp`.

On Windows, npm installs the command as `nlpplus-language-server.cmd`. An editor that starts
processes directly, without a shell, may need that full name.

## Settings

The server asks the client for the `nlp.format` section through `workspace/configuration`.
If the client doesn't provide it, the defaults below apply.

| Setting | Values | Default |
|---|---|---|
| `nlp.format.enable` | `true`, `false` | `true` |
| `nlp.format.indentStyle` | `"tabs"`, `"spaces"`, `"editor"` | `"tabs"` |
| `nlp.format.tabSize` | number | `4` |
| `nlp.format.braceStyle` | `"allman"`, `"keep"` | `"allman"` |

For example, in Neovim:

```lua
vim.lsp.config("nlpplus", {
  settings = { nlp = { format = { indentStyle = "spaces", tabSize = 2 } } },
})
```

## Syntax highlighting

The server provides semantic tokens, which editors layer on top of a syntax grammar. Grammars
for NLP++ and its knowledge-base formats are available as TextMate grammars in
[nlpplus-tmbundle](https://github.com/VisualText/nlpplus-tmbundle).

## Telemetry

None. The server sends no data anywhere. The VisualText extension for VS Code counts feature
use anonymously, and that counting is done on the extension side, only when the extension is
the client.

## License

MIT. Source: [github.com/VisualText/vscode-nlp](https://github.com/VisualText/vscode-nlp/tree/master/language-server)
(the server lives in `src/server`).
