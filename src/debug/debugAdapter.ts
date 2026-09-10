// Standalone entry point for the NLP++ replay debug adapter.
//
// Runs the DAP session over stdin/stdout as its own process. VSCode starts this
// via a DebugAdapterExecutable (see src/debug/debugConfig.ts); any other
// DAP-speaking editor can launch `node dist/debugAdapter.js` the same way.

import { NlpDebugSession } from "./nlpDebugSession";

NlpDebugSession.run(NlpDebugSession);
