# Linux Setup

Use this guide to run the `kiss_ai` web application locally on Linux.

## What You Need

- The `kiss_ai_projects` folder, containing `_kiss_ai/`.
- Node.js 20 or newer from <https://nodejs.org/>.
- A Cursor API key if you want the web app to run AI builds.

You do not need to work directly in Cursor or Obsidian for normal project use. The web app is the main interface.

## Folder Layout

Put `kiss_ai_projects` somewhere easy to find, such as your home directory:

```text
kiss_ai_projects/
  _kiss_ai/
  your_project_name/   # created later by the web app
```

Keep research projects as siblings of `_kiss_ai/`, not inside `_kiss_ai/`.

## Start The Web App

Open a terminal in `kiss_ai_projects/`, then run:

```sh
cd _kiss_ai/web
npm install
npm run dev
```

Then open the local web address shown in the terminal.

## Cursor API Key

AI builds launched from the web app need a Cursor API key.

### Option 1: OS Credential Store (recommended)

The web app can read and write secrets using `secret-tool`, which is part of the freedesktop.org Secret Service API. This works with GNOME Keyring, KDE Wallet (via `ksecretservice`), and KeePassXC.

Install `secret-tool` if it is not already available:

```sh
# Debian / Ubuntu
sudo apt install libsecret-tools

# Fedora
sudo dnf install libsecret

# Arch
sudo pacman -S libsecret
```

Then store your key:

```sh
echo -n "cursor_..." | secret-tool store --label="kiss_ai cursor_api_key" service cursor_api_key
```

You can verify it was saved:

```sh
secret-tool lookup service cursor_api_key
```

The web app Settings page can also save the key for you through the browser.

### Option 2: Environment file

You can put a local-only key in `_kiss_ai/web/.env`:

```sh
CURSOR_API_KEY="cursor_..."
```

### Option 3: Environment variable

Export the key before starting the web app:

```sh
export CURSOR_API_KEY="cursor_..."
npm run dev
```

Do not commit `.env` files or share API keys.

## Headless / No-Desktop Environments

If you are running on a headless server, Docker container, or WSL without a desktop session, the `secret-tool` credential store will not be available (it requires a D-Bus session). Use the environment variable or `.env` file options instead.

## Next Step

Once the app is open, create or select a project in the browser. See [`create-new-research-project.md`](create-new-research-project.md).

## Privacy

Your project data stays local unless you choose to upload or share it. Do not put private client, patient, employer, or personal data into public repositories.
