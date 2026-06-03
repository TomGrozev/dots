#!/usr/bin/env bash
# switch-provider.sh
# Switches the LLM provider between nano-gpt and opencode-go
# for all agents and subagents in the opencode config.
#
# Model mappings:
#   nano-gpt/minimax/minimax-m2.5       <-> opencode-go/minimax-m2.7
#   nano-gpt/moonshotai/kimi-k2.6:thinking <-> opencode-go/kimi-k2.6
#   nano-gpt/zai-org/glm-5:thinking     <-> opencode-go/glm-5.1

set -euo pipefail

CONFIG_DIR="${CONFIG_DIR:-$HOME/.config/opencode}"
JSON_FILE="$CONFIG_DIR/opencode.json"
AGENTS_DIR="$CONFIG_DIR/agents"

if [[ ! -f "$JSON_FILE" ]]; then
    echo "Error: $JSON_FILE not found." >&2
    exit 1
fi

# Detect current provider from the top-level model field
current_provider=$(grep -oE '"model": "[^"]+"' "$JSON_FILE" | head -1 | sed 's/.*"\([^/]*\)\/.*/\1/')

if [[ "$current_provider" == "nano-gpt" ]]; then
    direction="nano-gpt -> opencode-go"
elif [[ "$current_provider" == "opencode-go" ]]; then
    direction="opencode-go -> nano-gpt"
else
    echo "Error: Could not detect current provider (found: $current_provider)." >&2
    exit 1
fi

read -rp "Switch provider ($direction)? Press Enter to continue or Ctrl+C to cancel."

echo "Switching provider ($direction)..."

if [[ "$current_provider" == "nano-gpt" ]]; then
    # nano-gpt -> opencode-go
    sed -i.bak \
        -e 's|nano-gpt/minimax/minimax-m2.5|opencode-go/minimax-m2.7|g' \
        -e 's|nano-gpt/moonshotai/kimi-k2.6:thinking|opencode-go/kimi-k2.6|g' \
        -e 's|nano-gpt/zai-org/glm-5:thinking|opencode-go/glm-5.1|g' \
        "$JSON_FILE"
    rm -f "$JSON_FILE.bak"

    for f in "$AGENTS_DIR"/*.md; do
        if [[ -f "$f" ]]; then
            sed -i.bak \
                -e 's|nano-gpt/minimax/minimax-m2.5|opencode-go/minimax-m2.7|g' \
                -e 's|nano-gpt/moonshotai/kimi-k2.6:thinking|opencode-go/kimi-k2.6|g' \
                -e 's|nano-gpt/zai-org/glm-5:thinking|opencode-go/glm-5.1|g' \
                "$f"
            rm -f "$f.bak"
        fi
    done
else
    # opencode-go -> nano-gpt
    sed -i.bak \
        -e 's|opencode-go/minimax-m2.7|nano-gpt/minimax/minimax-m2.5|g' \
        -e 's|opencode-go/kimi-k2.6|nano-gpt/moonshotai/kimi-k2.6:thinking|g' \
        -e 's|opencode-go/glm-5.1|nano-gpt/zai-org/glm-5:thinking|g' \
        "$JSON_FILE"
    rm -f "$JSON_FILE.bak"

    for f in "$AGENTS_DIR"/*.md; do
        if [[ -f "$f" ]]; then
            sed -i.bak \
                -e 's|opencode-go/minimax-m2.7|nano-gpt/minimax/minimax-m2.5|g' \
                -e 's|opencode-go/kimi-k2.6|nano-gpt/moonshotai/kimi-k2.6:thinking|g' \
                -e 's|opencode-go/glm-5.1|nano-gpt/zai-org/glm-5:thinking|g' \
                "$f"
            rm -f "$f.bak"
        fi
    done
fi

echo "Done. Provider switched."
