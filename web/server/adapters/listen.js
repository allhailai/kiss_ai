export function listen(app, { port, projectsRoot, resolveCursorApiKey, mode = "standalone" }) {
  const host = mode === "server" ? "0.0.0.0" : "127.0.0.1";

  app.listen(port, host, () => {
    console.log(`kiss_ai projects UI API listening on http://${host}:${port}`);
    console.log(`kiss_ai projects root: ${projectsRoot}`);
    console.log(`kiss_ai mode: ${mode}`);
    resolveCursorApiKey().catch((error) => {
      console.warn(`[kiss_ai UI warning] Cursor API key source check failed: ${error.message}`);
    });
  });
}
