import cookieParser from "cookie-parser";

const COOKIE_NAME = "kiss_ai_token";

export function createAuthMiddleware({ authService, sessionExpiryDays = 3 }) {
  const cookieMaxAgeMs = sessionExpiryDays * 24 * 60 * 60 * 1000;

  function setAuthCookie(res, token) {
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: cookieMaxAgeMs,
    });
  }

  function clearAuthCookie(res) {
    res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  }

  async function requireAuth(req, res, next) {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: "Authentication required" });

    try {
      const result = await authService.verifyAndRefreshToken(token);
      if (!result) {
        clearAuthCookie(res);
        return res.status(401).json({ error: "Authentication required" });
      }

      req.user = result.user;

      // Sliding window: re-issue cookie with fresh expiry
      setAuthCookie(res, result.freshToken);
      next();
    } catch {
      clearAuthCookie(res);
      return res.status(401).json({ error: "Authentication required" });
    }
  }

  function requireAdmin(req, res, next) {
    if (!req.user?.is_admin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  }

  function securityHeaders(_req, res, next) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  }

  return {
    clearAuthCookie,
    cookieParser: cookieParser(),
    requireAdmin,
    requireAuth,
    securityHeaders,
    setAuthCookie,
  };
}
