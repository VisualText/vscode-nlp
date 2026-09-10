// Standalone entry point for the NLP++ debug adapters.
//
// Runs a DAP session over stdin/stdout as its own process. Which session depends
// on how it was started:
//
//   node dist/debugAdapter.js          replay a finished run's .tree dumps
//   node dist/debugAdapter.js --live   drive a running engine, rule by rule
//
// The mode is an argv flag rather than a launch-config field because DAP settles
// capabilities at `initialize`, before any launch arguments arrive -- and the two
// sessions genuinely differ there (only replay can step backward). VSCode picks
// the flag from `mode` in the launch config; see src/debug/debugConfig.ts. Any
// other DAP-speaking editor can launch either directly.

import { NlpDebugSession } from "./nlpDebugSession";
import { NlpLiveDebugSession } from "./nlpLiveDebugSession";

if (process.argv.includes("--live")) {
	NlpLiveDebugSession.run(NlpLiveDebugSession);
} else {
	NlpDebugSession.run(NlpDebugSession);
}
