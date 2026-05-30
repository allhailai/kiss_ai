// ── Login rate limiter (in-memory, per real client IP) ───────────────────────

function createLoginRateLimiter({ maxAttempts = 5, windowMs = 60_000 } = {}) {
  const attempts = new Map();

  // Clean up expired entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of attempts) {
      if (now - record.windowStart > windowMs) attempts.delete(ip);
    }
  }, windowMs).unref();

  return function rateLimitLogin(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    let record = attempts.get(ip);

    if (!record || now - record.windowStart > windowMs) {
      record = { count: 0, windowStart: now };
      attempts.set(ip, record);
    }

    record.count += 1;

    if (record.count > maxAttempts) {
      return res.status(429).json({ error: "Too many login attempts. Try again later." });
    }

    next();
  };
}

// ── Route registration ──────────────────────────────────────────────────────

export function registerAuthRoutes(app, { authService, authMiddleware, httpError }) {
  const rateLimitLogin = createLoginRateLimiter();

  // ── Login ─────────────────────────────────────────────────────────────

  app.post("/api/auth/login", rateLimitLogin, async (req, res, next) => {
    try {
      const { username, password } = req.body ?? {};

      if (!username || !password) {
        throw httpError("Username and password are required.", 400, "missing_credentials");
      }

      const { token, user } = await authService.authenticate(String(username), String(password));
      authMiddleware.setAuthCookie(res, token);
      res.json({ ok: true, user });
    } catch (error) {
      next(error);
    }
  });

  // ── Logout ────────────────────────────────────────────────────────────

  app.post("/api/auth/logout", (req, res) => {
    authMiddleware.clearAuthCookie(res);
    res.json({ ok: true });
  });

  // ── Current user ──────────────────────────────────────────────────────

  app.get("/api/auth/me", authMiddleware.requireAuth, (req, res) => {
    res.json(req.user);
  });

  // ── Change own password ───────────────────────────────────────────────

  app.post("/api/auth/me/password", authMiddleware.requireAuth, async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body ?? {};

      if (!currentPassword || !newPassword) {
        throw httpError("Current password and new password are required.", 400, "missing_fields");
      }

      await authService.changePassword(req.user.username, String(currentPassword), String(newPassword));

      // Clear cookie — user must re-login with new password
      authMiddleware.clearAuthCookie(res);
      res.json({ ok: true, message: "Password changed. Please log in again." });
    } catch (error) {
      next(error);
    }
  });

  // ── User management (admin only) ──────────────────────────────────────

  app.get("/api/auth/users", authMiddleware.requireAuth, authMiddleware.requireAdmin, async (_req, res, next) => {
    try {
      res.json({ users: await authService.listUsers() });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/users", authMiddleware.requireAuth, authMiddleware.requireAdmin, async (req, res, next) => {
    try {
      const { username, password, firstname, lastname, is_admin } = req.body ?? {};

      if (!username || !password) {
        throw httpError("Username and password are required.", 400, "missing_fields");
      }

      const user = await authService.createUser({
        username: String(username),
        password: String(password),
        firstname: firstname != null ? String(firstname) : "",
        lastname: lastname != null ? String(lastname) : "",
        is_admin: is_admin === true,
      });

      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/users/:username", authMiddleware.requireAuth, authMiddleware.requireAdmin, async (req, res, next) => {
    try {
      res.json(await authService.getUser(req.params.username));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/auth/users/:username", authMiddleware.requireAuth, authMiddleware.requireAdmin, async (req, res, next) => {
    try {
      const { firstname, lastname, is_admin } = req.body ?? {};
      const { user } = await authService.updateUser(req.params.username, { firstname, lastname, is_admin });
      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/auth/users/:username", authMiddleware.requireAuth, authMiddleware.requireAdmin, async (req, res, next) => {
    try {
      res.json(await authService.deleteUser(req.params.username));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/users/:username/reset-password", authMiddleware.requireAuth, authMiddleware.requireAdmin, async (req, res, next) => {
    try {
      const { newPassword } = req.body ?? {};

      if (!newPassword) {
        throw httpError("New password is required.", 400, "missing_fields");
      }

      await authService.resetPassword(req.params.username, String(newPassword));
      res.json({ ok: true, message: "Password has been reset." });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/users/:username/password", authMiddleware.requireAuth, authMiddleware.requireAdmin, async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body ?? {};

      if (!currentPassword || !newPassword) {
        throw httpError("Current password and new password are required.", 400, "missing_fields");
      }

      await authService.changePassword(req.params.username, String(currentPassword), String(newPassword));
      res.json({ ok: true, message: "Password changed." });
    } catch (error) {
      next(error);
    }
  });
}
