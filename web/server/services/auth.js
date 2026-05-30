import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import jwt from "jsonwebtoken";

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384; // N=2^14
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;
const SALT_BYTES = 16;

// ── Password hashing ────────────────────────────────────────────────────────

function hashPassword(plainText) {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(SALT_BYTES);

    scrypt(plainText, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELISM }, (error, derivedKey) => {
      if (error) return reject(error);
      resolve(`scrypt:${salt.toString("hex")}:${derivedKey.toString("hex")}`);
    });
  });
}

function verifyPassword(plainText, storedHash) {
  return new Promise((resolve, reject) => {
    const parts = storedHash.split(":");
    if (parts.length !== 3 || parts[0] !== "scrypt") return resolve(false);

    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");

    scrypt(plainText, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELISM }, (error, derivedKey) => {
      if (error) return reject(error);
      resolve(timingSafeEqual(derivedKey, expected));
    });
  });
}

// ── Auth service factory ────────────────────────────────────────────────────

export function createAuthService({ projectsRoot, httpError, sessionExpiryDays = 3 }) {
  const authFilePath = path.join(projectsRoot, ".kiss_ai_auth.json");
  let cachedData = null;
  let cachedMtime = 0;
  let writeLock = Promise.resolve();

  // ── File I/O with caching ───────────────────────────────────────────────

  async function readAuthFile() {
    try {
      const stat = await fs.stat(authFilePath);
      const mtime = stat.mtimeMs;

      if (cachedData && mtime === cachedMtime) return cachedData;

      const raw = await fs.readFile(authFilePath, "utf-8");
      cachedData = JSON.parse(raw);
      cachedMtime = mtime;
      return cachedData;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async function writeAuthFile(data) {
    // Serialize writes to prevent corruption
    writeLock = writeLock.then(async () => {
      await fs.writeFile(authFilePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
      cachedData = data;
      // Update cached mtime after write
      try {
        const stat = await fs.stat(authFilePath);
        cachedMtime = stat.mtimeMs;
      } catch { /* stat after write shouldn't fail, but be safe */ }
    });
    return writeLock;
  }

  // ── JWT helpers ─────────────────────────────────────────────────────────

  function signToken(user, jwtSecret) {
    const payload = {
      username: user.username,
      is_admin: user.is_admin,
      token_version: user.token_version,
    };

    return jwt.sign(payload, jwtSecret, { expiresIn: `${sessionExpiryDays}d` });
  }

  function verifyToken(token, jwtSecret) {
    return jwt.verify(token, jwtSecret);
  }

  // ── User lookup ─────────────────────────────────────────────────────────

  function findUserInData(data, username) {
    if (!data?.users) return null;
    return data.users.find((u) => u.username === username) ?? null;
  }

  async function findUser(username) {
    const data = await readAuthFile();
    return findUserInData(data, username);
  }

  // ── First-boot initialization ───────────────────────────────────────────

  async function initialize(adminPassword) {
    const existing = await readAuthFile();
    if (existing) {
      // Verify kissai_admin exists
      const admin = findUserInData(existing, "kissai_admin");
      if (!admin) {
        throw new Error("Auth file exists but kissai_admin user is missing. File may be corrupted.");
      }
      return { initialized: false, jwtSecret: existing.jwt_secret };
    }

    if (!adminPassword) {
      throw new Error(
        "Server mode requires an admin password on first boot.\n" +
        "Set KISS_AI_ADMIN_PASSWORD environment variable and restart."
      );
    }

    const jwtSecret = randomBytes(32).toString("hex");
    const passwordHash = await hashPassword(adminPassword);

    const data = {
      jwt_secret: jwtSecret,
      users: [
        {
          username: "kissai_admin",
          password_hash: passwordHash,
          firstname: "Admin",
          lastname: "User",
          is_admin: true,
          is_system: true,
          token_version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };

    await writeAuthFile(data);
    return { initialized: true, jwtSecret };
  }

  // ── Authentication ──────────────────────────────────────────────────────

  async function authenticate(username, password) {
    const data = await readAuthFile();
    if (!data) throw httpError("Authentication system not initialized.", 500, "auth_not_initialized");

    const user = findUserInData(data, username);
    if (!user) throw httpError("Invalid credentials.", 401, "invalid_credentials");

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) throw httpError("Invalid credentials.", 401, "invalid_credentials");

    const token = signToken(user, data.jwt_secret);
    return { token, user: sanitizeUser(user) };
  }

  // ── User CRUD ───────────────────────────────────────────────────────────

  function sanitizeUser(user) {
    const { password_hash, ...rest } = user;
    return rest;
  }

  async function listUsers() {
    const data = await readAuthFile();
    if (!data) return [];
    return data.users.map(sanitizeUser);
  }

  async function getUser(username) {
    const user = await findUser(username);
    if (!user) throw httpError("User not found.", 404, "user_not_found");
    return sanitizeUser(user);
  }

  async function createUser({ username, password, firstname, lastname, is_admin }) {
    const data = await readAuthFile();
    if (!data) throw httpError("Authentication system not initialized.", 500, "auth_not_initialized");

    if (findUserInData(data, username)) {
      throw httpError("Username already exists.", 409, "user_exists");
    }

    if (!username || typeof username !== "string" || !/^[a-zA-Z0-9_-]{2,50}$/.test(username)) {
      throw httpError("Username must be 2-50 characters (letters, numbers, underscores, hyphens).", 400, "invalid_username");
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      throw httpError("Password must be at least 8 characters.", 400, "invalid_password");
    }

    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    const newUser = {
      username,
      password_hash: passwordHash,
      firstname: firstname ?? "",
      lastname: lastname ?? "",
      is_admin: is_admin === true,
      is_system: false,
      token_version: 1,
      created_at: now,
      updated_at: now,
    };

    data.users.push(newUser);
    await writeAuthFile(data);
    return sanitizeUser(newUser);
  }

  async function updateUser(username, updates) {
    const data = await readAuthFile();
    if (!data) throw httpError("Authentication system not initialized.", 500, "auth_not_initialized");

    const user = findUserInData(data, username);
    if (!user) throw httpError("User not found.", 404, "user_not_found");
    if (user.is_system) throw httpError("System user cannot be edited via API.", 403, "system_user_immutable");

    const now = new Date().toISOString();
    let versionBumped = false;

    if (updates.firstname !== undefined) user.firstname = String(updates.firstname);
    if (updates.lastname !== undefined) user.lastname = String(updates.lastname);

    if (updates.is_admin !== undefined && updates.is_admin !== user.is_admin) {
      user.is_admin = updates.is_admin === true;
      user.token_version += 1;
      versionBumped = true;
    }

    user.updated_at = now;
    await writeAuthFile(data);
    return { user: sanitizeUser(user), versionBumped };
  }

  async function deleteUser(username) {
    const data = await readAuthFile();
    if (!data) throw httpError("Authentication system not initialized.", 500, "auth_not_initialized");

    const user = findUserInData(data, username);
    if (!user) throw httpError("User not found.", 404, "user_not_found");
    if (user.is_system) throw httpError("System user cannot be deleted.", 403, "system_user_immutable");

    data.users = data.users.filter((u) => u.username !== username);
    await writeAuthFile(data);
    return { deleted: true, username };
  }

  async function changePassword(username, currentPassword, newPassword) {
    const data = await readAuthFile();
    if (!data) throw httpError("Authentication system not initialized.", 500, "auth_not_initialized");

    const user = findUserInData(data, username);
    if (!user) throw httpError("User not found.", 404, "user_not_found");
    if (user.is_system) throw httpError("System user password cannot be changed via API.", 403, "system_user_immutable");

    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) throw httpError("Current password is incorrect.", 401, "incorrect_password");

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      throw httpError("New password must be at least 8 characters.", 400, "invalid_password");
    }

    user.password_hash = await hashPassword(newPassword);
    user.token_version += 1;
    user.updated_at = new Date().toISOString();
    await writeAuthFile(data);
    return { changed: true };
  }

  async function resetPassword(username, newPassword) {
    const data = await readAuthFile();
    if (!data) throw httpError("Authentication system not initialized.", 500, "auth_not_initialized");

    const user = findUserInData(data, username);
    if (!user) throw httpError("User not found.", 404, "user_not_found");
    if (user.is_system) throw httpError("System user password can only be changed via CLI.", 403, "system_user_immutable");

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      throw httpError("New password must be at least 8 characters.", 400, "invalid_password");
    }

    user.password_hash = await hashPassword(newPassword);
    user.token_version += 1;
    user.updated_at = new Date().toISOString();
    await writeAuthFile(data);
    return { reset: true };
  }

  // ── Token verification (for middleware) ─────────────────────────────────

  async function verifyAndRefreshToken(token) {
    const data = await readAuthFile();
    if (!data) return null;

    let payload;
    try {
      payload = verifyToken(token, data.jwt_secret);
    } catch {
      return null;
    }

    const user = findUserInData(data, payload.username);
    if (!user) return null;
    if (user.token_version !== payload.token_version) return null;

    // Return current user state (not JWT state) + fresh token
    const freshToken = signToken(user, data.jwt_secret);
    return { user: sanitizeUser(user), freshToken };
  }

  async function getJwtSecret() {
    const data = await readAuthFile();
    return data?.jwt_secret ?? null;
  }

  return {
    authenticate,
    changePassword,
    createUser,
    deleteUser,
    findUser,
    getJwtSecret,
    getUser,
    hashPassword,
    initialize,
    listUsers,
    resetPassword,
    sanitizeUser,
    signToken,
    updateUser,
    verifyAndRefreshToken,
    verifyPassword,
    verifyToken,
  };
}
