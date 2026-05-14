#!/usr/bin/env bash
set -euo pipefail

KISS_AI_PROJECTS_ROOT="${KISS_AI_PROJECTS_ROOT:-$HOME/Documents/kiss_ai_projects}"
KISS_AI_REPO_URL="${KISS_AI_REPO_URL:-https://github.com/all-hail-ai/kiss_ai.git}"
KISS_AI_BRANCH="${KISS_AI_BRANCH:-main}"
KISS_AI_APP_DIR="$KISS_AI_PROJECTS_ROOT/_kiss_ai"

print_step() {
  printf "\n==> %s\n" "$1"
}

load_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    return
  fi

  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

ensure_git() {
  if git --version >/dev/null 2>&1; then
    return
  fi

  print_step "Installing Apple Command Line Tools"
  xcode-select --install || true
  echo "When that installation finishes, run the install command again."
  exit 1
}

has_node_20() {
  if ! command -v node >/dev/null 2>&1; then
    return 1
  fi

  local major
  major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
  [ "$major" -ge 20 ]
}

ensure_homebrew() {
  load_homebrew

  if command -v brew >/dev/null 2>&1; then
    return
  fi

  print_step "Installing Homebrew"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  load_homebrew
}

ensure_node() {
  if has_node_20; then
    return
  fi

  ensure_homebrew
  print_step "Installing Node.js"
  brew install node
}

download_or_update_kiss_ai() {
  print_step "Preparing $KISS_AI_PROJECTS_ROOT"
  mkdir -p "$KISS_AI_PROJECTS_ROOT"

  if [ -d "$KISS_AI_APP_DIR/.git" ]; then
    print_step "Updating kiss_ai"
    git -C "$KISS_AI_APP_DIR" pull --ff-only
    return
  fi

  if [ -e "$KISS_AI_APP_DIR" ]; then
    echo "$KISS_AI_APP_DIR already exists but is not a Git checkout."
    echo "Move it aside or delete it, then run this installer again."
    exit 1
  fi

  print_step "Downloading kiss_ai"
  git clone --branch "$KISS_AI_BRANCH" "$KISS_AI_REPO_URL" "$KISS_AI_APP_DIR"
}

start_app() {
  print_step "Installing app dependencies"
  cd "$KISS_AI_APP_DIR/web"
  npm install

  print_step "Starting kiss_ai"
  echo "When the app is ready, open the local web address shown below."
  npm run dev
}

ensure_git
ensure_node
download_or_update_kiss_ai
start_app
