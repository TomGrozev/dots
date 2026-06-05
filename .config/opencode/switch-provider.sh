#!/usr/bin/env bash
# switch-provider.sh
# Switches the LLM provider between nano-gpt and opencode-go
# for all agents and subagents in the opencode config.
#
# Model mappings:
#   nano-gpt/minimax/minimax-m3                  <-> opencode-go/minimax-m3
#   nano-gpt/zai-org/glm-5:thinking              <-> opencode-go/glm-5.1
#   nano-gpt/moonshotai/kimi-k2.6:thinking       <-> opencode-go/qwen3.7-max
#   nano-gpt/mimo/mimo-v2.5-pro                  <-> opencode-go/mimo-v2.5-pro
#   nano-gpt/deepseek/deepseek-v4-pro:thinking   <-> opencode-go/deepseek-v4-pro
#   nano-gpt/deepseek/deepseek-v4-flash          <-> opencode-go/deepseek-v4-flash

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
        -e 's|nano-gpt/minimax/minimax-m3|opencode-go/minimax-m3|g' \
        -e 's|nano-gpt/zai-org/glm-5:thinking|opencode-go/glm-5.1|g' \
        -e 's|nano-gpt/moonshotai/kimi-k2.6:thinking|opencode-go/qwen3.7-max|g' \
        -e 's|nano-gpt/mimo/mimo-v2.5-pro|opencode-go/mimo-v2.5-pro|g' \
        -e 's|nano-gpt/deepseek/deepseek-v4-pro:thinking|opencode-go/deepseek-v4-pro|g' \
        -e 's|nano-gpt/deepseek/deepseek-v4-flash|opencode-go/deepseek-v4-flash|g' \
        "$JSON_FILE"
    rm -f "$JSON_FILE.bak"

    for f in "$AGENTS_DIR"/*.md; do
        if [[ -f "$f" ]]; then
            sed -i.bak \
                -e 's|nano-gpt/minimax/minimax-m3|opencode-go/minimax-m3|g' \
                -e 's|nano-gpt/zai-org/glm-5:thinking|opencode-go/glm-5.1|g' \
                -e 's|nano-gpt/moonshotai/kimi-k2.6:thinking|opencode-go/qwen3.7-max|g' \
                -e 's|nano-gpt/mimo/mimo-v2.5-pro|opencode-go/mimo-v2.5-pro|g' \
                -e 's|nano-gpt/deepseek/deepseek-v4-pro:thinking|opencode-go/deepseek-v4-pro|g' \
                -e 's|nano-gpt/deepseek/deepseek-v4-flash|opencode-go/deepseek-v4-flash|g' \
                "$f"
            rm -f "$f.bak"
        fi
    done
else
    # opencode-go -> nano-gpt
    # NOTE: longer/more-specific opencode-go model strings must come before shorter ones
    # to avoid partial matches. deepseek-v4-pro is listed before deepseek-v4-flash as a safeguard.
    sed -i.bak \
        -e 's|opencode-go/deepseek-v4-pro|nano-gpt/deepseek/deepseek-v4-pro:thinking|g' \
        -e 's|opencode-go/deepseek-v4-flash|nano-gpt/deepseek/deepseek-v4-flash|g' \
        -e 's|opencode-go/minimax-m3|nano-gpt/minimax/minimax-m3|g' \
        -e 's|opencode-go/qwen3.7-max|nano-gpt/moonshotai/kimi-k2.6:thinking|g' \
        -e 's|opencode-go/mimo-v2.5-pro|nano-gpt/mimo/mimo-v2.5-pro|g' \
        -e 's|opencode-go/glm-5.1|nano-gpt/zai-org/glm-5:thinking|g' \
        "$JSON_FILE"
    rm -f "$JSON_FILE.bak"

    for f in "$AGENTS_DIR"/*.md; do
        if [[ -f "$f" ]]; then
            sed -i.bak \
                -e 's|opencode-go/deepseek-v4-pro|nano-gpt/deepseek/deepseek-v4-pro:thinking|g' \
                -e 's|opencode-go/deepseek-v4-flash|nano-gpt/deepseek/deepseek-v4-flash|g' \
                -e 's|opencode-go/minimax-m3|nano-gpt/minimax/minimax-m3|g' \
                -e 's|opencode-go/qwen3.7-max|nano-gpt/moonshotai/kimi-k2.6:thinking|g' \
                -e 's|opencode-go/mimo-v2.5-pro|nano-gpt/mimo/mimo-v2.5-pro|g' \
                -e 's|opencode-go/glm-5.1|nano-gpt/zai-org/glm-5:thinking|g' \
                "$f"
            rm -f "$f.bak"
        fi
    done
fi

echo "Done. Provider switched."
