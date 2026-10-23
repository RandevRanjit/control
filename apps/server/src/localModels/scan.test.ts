import { describe, expect, it } from "vite-plus/test";

import { modelName, serveScriptFlags } from "./scan.ts";

const SERVE_SH = `#!/usr/bin/env bash
# llama-server launcher for Example-14B.
set -euo pipefail
MODEL_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
MODEL="$MODEL_DIR/Example-14B-Q4_K_M.gguf"
MMPROJ="$MODEL_DIR/mmproj-Example-14B-f16.gguf"
PORT="\${PORT:-8080}"
CTX="\${CTX:-65536}"
ALIAS=example-14b

MM=()
if [[ -f "$MMPROJ" ]]; then
  MM=(--mmproj "$MMPROJ")
fi

exec llama-server \\
  -m "$MODEL" \\
  \${MM[@]+"\${MM[@]}"} \\
  -a "$ALIAS" \\
  --host 127.0.0.1 --port "$PORT" \\
  -c "$CTX" \\
  -ngl 999 \\
  --jinja \\
  --temp 0.7 \\
  --cache-ram "\${CACHE_RAM:-16384}" \\
  --chat-template-file "$TEMPLATE" \\
  "$@"
`;

describe("reading a serve.sh beside the model", () => {
  it("keeps its flags with the variables' defaults, and drops what CONTROL sets", () => {
    expect(serveScriptFlags(SERVE_SH)).toEqual([
      "-a",
      "example-14b",
      "-c",
      "65536",
      "-ngl",
      "999",
      "--jinja",
      "--temp",
      "0.7",
      "--cache-ram",
      "16384",
    ]);
  });

  it("follows a server picked by a variable, as a launcher with a patched build has", () => {
    const script = `#!/usr/bin/env bash
set -euo pipefail
MODEL="$MODEL_DIR/Example-27B-Q4_K_P.gguf"
MTP="\${MTP:-1}"
CTX="\${CTX:-262144}"
SERVER=llama-server
SPEC=()
case "$MTP" in
  1) SPEC=(--spec-type draft-mtp) ;;
  fast)
    SERVER="$HOME/Models/llama.cpp-patched/build/bin/llama-server" ;;
esac

exec "$SERVER" \\
  -m "$MODEL" \\
  \${SPEC[@]+"\${SPEC[@]}"} \\
  -a example-27b \\
  --host 127.0.0.1 --port "$PORT" \\
  -c "$CTX" \\
  --jinja \\
  --cache-ram "\${CACHE_RAM:-32768}" \\
  "$@"
`;
    expect(serveScriptFlags(script)).toEqual([
      "-a",
      "example-27b",
      "-c",
      "262144",
      "--jinja",
      "--cache-ram",
      "32768",
    ]);
  });

  it("finds nothing in a script that doesn't run llama-server", () => {
    expect(
      serveScriptFlags("#!/bin/sh\n# llama-server is started elsewhere\nexec mlx_lm.server\n"),
    ).toBeNull();
  });
});

describe("naming a model from its file", () => {
  it("drops the extension and the quantisation", () => {
    expect(modelName("Qwen3.8-27B-Uncensored-Q4_K_M.gguf")).toBe("Qwen3.8-27B-Uncensored");
    expect(modelName("llama-3.3-70b-instruct.IQ3_XS.gguf")).toBe("llama-3.3-70b-instruct");
    expect(modelName("gemma-3-12b-it-BF16.gguf")).toBe("gemma-3-12b-it");
    expect(modelName("phi-4.gguf")).toBe("phi-4");
  });
});
