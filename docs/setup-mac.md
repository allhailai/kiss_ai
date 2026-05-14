# Mac Setup

Use this guide to run the `kiss_ai` web application locally on macOS.

## What You Need

- The `kiss_ai_projects` folder, containing `_kiss_ai/`.
- Node.js 20 or newer from <https://nodejs.org/>.
- A Cursor API key if you want the web app to run AI builds.

You do not need to work directly in Cursor or Obsidian for normal project use. The web app is the main interface.

## Folder Layout

Put `kiss_ai_projects` somewhere easy to find, such as your Documents folder:

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

AI builds launched from the web app need a Cursor API key. The safest persistent Mac option is Keychain:

```sh
security add-generic-password -a "$USER" -s cursor_api_key -w "cursor_..."
```

You can also put a local-only key in `_kiss_ai/web/.env`:

```sh
CURSOR_API_KEY="cursor_..."
```

Do not commit `.env` files or share API keys.

## Next Step

Once the app is open, create or select a project in the browser. See [`create-new-research-project.md`](create-new-research-project.md).

## Privacy

Your project data stays local unless you choose to upload or share it. Do not put private client, patient, employer, or personal data into public repositories.
