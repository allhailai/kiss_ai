export function listen(app, { port, projectsRoot, resolveCursorApiKey }) {
  app.listen(port, "127.0.0.1", () => {
    console.log(`kiss_ai projects UI API listening on http://127.0.0.1:${port}`);
    console.log(`kiss_ai projects root: ${projectsRoot}`);
    resolveCursorApiKey().catch((error) => {
      console.warn(`[kiss_ai UI warning] Cursor API key source check failed: ${error.message}`);
    });
  });
}
