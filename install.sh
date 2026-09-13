#!/usr/bin/env sh
set -eu

VERSION="0.3.0"
VSIX="vsc-execute-$VERSION.vsix"

if ! command -v code >/dev/null 2>&1; then
  echo "The 'code' command was not found." >&2
  echo "Install VS Code, add 'code' to your PATH, then re-run this script." >&2
  exit 1
fi

if [ -f "$VSIX" ]; then
  EXT="$VSIX"
else
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  EXT="$TMP/$VSIX"
  echo "Downloading $VSIX ..."
  curl -fsSL -o "$EXT" "https://raw.githubusercontent.com/taze292/VSC-Execute/main/$VSIX"
fi

echo "Installing $VSIX ..."
code --install-extension "$EXT" --force
echo "Done. Reload VS Code if prompted."