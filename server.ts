import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { execFile, spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import multer from "multer";
import { createProxyMiddleware } from "http-proxy-middleware";
import kill from "tree-kill";
import net from "net";
import dns from "dns/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { GoogleGenAI, Type } from "@google/genai";

const execFileAsync = promisify(execFile);
const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

// Base path for the managed Astro repository
const REPO_PATH = path.resolve(process.cwd(), "concordia_repo");

// Helper to prevent leaking server absolute paths to the client
const sanitizeError = (err: unknown) => {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.split(REPO_PATH).join("[REPO_DIR]").split(process.cwd()).join("[APP_DIR]");
};

// Strict path confinement inside REPO_PATH
function resolveRepoPath(targetPath: string): string | null {
  if (!targetPath || typeof targetPath !== "string" || targetPath.includes("\0")) {
    return null;
  }
  const fullPath = path.resolve(REPO_PATH, targetPath);
  if (fullPath !== REPO_PATH && !fullPath.startsWith(REPO_PATH + path.sep)) {
    return null;
  }
  return fullPath;
}

function isProtectedPath(fullPath: string): boolean {
  const rel = path.relative(REPO_PATH, fullPath);
  const top = rel.split(path.sep)[0];
  return top === ".git" || top === "node_modules" || top === "pg-data" || top === "pg-databases";
}

// Gemini client helper (server-side only)
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// SSRF guard for user-provided remote URLs
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fe80:") ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("::ffff:127.") ||
      lower.startsWith("::ffff:10.") ||
      lower.startsWith("::ffff:192.168.") ||
      lower.startsWith("::ffff:169.254.")
    );
  }
  return true;
}

async function assertSafeRemoteUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http and https URLs are supported.");
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Local or internal hostnames are not allowed.");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Private or loopback IP addresses are not allowed.");
  } else {
    const resolved = await dns.lookup(host, { all: true });
    if (!resolved.length || resolved.some((entry) => isPrivateIp(entry.address))) {
      throw new Error("Target host resolved to a restricted network address.");
    }
  }
  return parsed;
}

let astroDevServer: ChildProcess | null = null;
let devServerLogs: string[] = [];
const MAX_LOGS = 500;

function addLog(log: string) {
  devServerLogs.push(log);
  if (devServerLogs.length > MAX_LOGS) {
    devServerLogs.shift();
  }
}

app.get("/api/system-status", async (_req, res) => {
  try {
    const hasNodeModules = await fs
      .access(path.join(REPO_PATH, "node_modules"))
      .then(() => true)
      .catch(() => false);
    const hasEnv = await fs
      .access(path.join(REPO_PATH, ".env"))
      .then(() => true)
      .catch(() => false);
    res.json({ hasNodeModules, hasEnv, devServerRunning: !!astroDevServer });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

app.get("/api/dev-server/logs", (_req, res) => {
  res.json({ logs: devServerLogs, running: !!astroDevServer });
});

app.post("/api/dev-server/logs/clear", (_req, res) => {
  devServerLogs = [];
  res.json({ success: true });
});

app.post("/api/dev-server", async (req, res) => {
  try {
    const { action, packageManager } = req.body || {};

    if (action === "start") {
      if (astroDevServer) {
        return res.json({ success: true, running: true, message: "Already running" });
      }

      const hasNodeModules = await fs
        .access(path.join(REPO_PATH, "node_modules"))
        .then(() => true)
        .catch(() => false);

      if (!hasNodeModules) {
        return res.status(400).json({
          error: "Dependencies are not installed in concordia_repo. Run Install first.",
        });
      }

      const isPnpm = await fs
        .access(path.join(REPO_PATH, "pnpm-lock.yaml"))
        .then(() => true)
        .catch(() => false);
      const pm =
        packageManager === "bun" || packageManager === "pnpm" || packageManager === "npm"
          ? packageManager
          : isPnpm
          ? "pnpm"
          : "npm";

      const cmd = pm === "bun" ? "bunx" : "npx";
      const args =
        pm === "pnpm"
          ? ["pnpm", "exec", "astro", "dev", "--port", "4321", "--host", "127.0.0.1"]
          : ["astro", "dev", "--port", "4321", "--host", "127.0.0.1"];

      let exitedEarly = false;
      let earlyExitCode: number | null = null;
      const proc = spawn(cmd, args, { cwd: REPO_PATH });
      astroDevServer = proc;

      addLog(`[SYS] Starting Astro dev server (${cmd} ${args.join(" ")})`);

      proc.stdout?.on("data", (data) => {
        const text = data.toString();
        addLog(`[OUT] ${text.trimEnd()}`);
      });

      proc.stderr?.on("data", (data) => {
        const text = data.toString();
        addLog(`[ERR] ${text.trimEnd()}`);
      });

      proc.on("error", (err) => {
        addLog(`[ERR] Failed to spawn Astro: ${err.message}`);
        exitedEarly = true;
        if (astroDevServer === proc) astroDevServer = null;
      });

      proc.on("close", (code) => {
        addLog(`[SYS] Server stopped (exit code ${code ?? 0}).`);
        exitedEarly = true;
        earlyExitCode = code;
        if (astroDevServer === proc) astroDevServer = null;
      });

      await new Promise((resolve) => setTimeout(resolve, 2500));

      if (exitedEarly || !astroDevServer) {
        return res.status(500).json({
          error: `Astro dev server exited during startup (code ${earlyExitCode ?? "unknown"}). Check server logs.`,
          logs: devServerLogs.slice(-20),
        });
      }

      return res.json({ success: true, running: true, message: "Started" });
    } else if (action === "stop") {
      if (astroDevServer && astroDevServer.pid) {
        const pid = astroDevServer.pid;
        await new Promise<void>((resolve) => {
          kill(pid, "SIGTERM", () => resolve());
        });
        astroDevServer = null;
      }
      return res.json({ success: true, running: false, message: "Stopped" });
    } else if (action === "status") {
      return res.json({ running: !!astroDevServer });
    }

    res.status(400).json({ error: "Invalid action" });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// Multi-database PGlite Registry & Dynamic Socket Manager
const dbInstances = new Map<string, PGlite>();
let activeDbName = "postgres";
let activePgServer: PGLiteSocketServer | null = null;

function isValidDbName(name: string): boolean {
  return /^[a-zA-Z0-9_-]{1,63}$/.test(name);
}

function getDbStoragePath(name: string): string {
  if (name === "postgres") {
    return path.join(REPO_PATH, "pg-data");
  }
  return path.join(REPO_PATH, "pg-databases", name);
}

async function listLocalDatabases(): Promise<string[]> {
  const names = new Set<string>(["postgres"]);
  const multiDir = path.join(REPO_PATH, "pg-databases");
  try {
    const entries = await fs.readdir(multiDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && isValidDbName(entry.name)) {
        names.add(entry.name);
      }
    }
  } catch {
    // pg-databases dir not created yet
  }
  return Array.from(names).sort((a, b) => (a === "postgres" ? -1 : b === "postgres" ? 1 : a.localeCompare(b)));
}

async function openDbInstance(name: string): Promise<PGlite> {
  if (!isValidDbName(name)) {
    throw new Error("Invalid database name (use letters, numbers, _ or -)");
  }
  const existing = dbInstances.get(name);
  if (existing) return existing;

  const dir = getDbStoragePath(name);
  if (name !== "postgres") {
    await fs.mkdir(dir, { recursive: true });
  }
  const db = new PGlite(dir);
  await db.waitReady;
  dbInstances.set(name, db);
  return db;
}

async function databaseExists(name: string): Promise<boolean> {
  if (name === "postgres") return true;
  if (!isValidDbName(name)) return false;
  if (dbInstances.has(name)) return true;
  return await fs
    .access(getDbStoragePath(name))
    .then(() => true)
    .catch(() => false);
}

async function createDatabase(name: string): Promise<PGlite> {
  if (!isValidDbName(name)) {
    throw new Error("Invalid database name (letters, numbers, _ or - only)");
  }
  return await openDbInstance(name);
}

async function switchActiveDatabase(name: string): Promise<void> {
  if (!isValidDbName(name)) {
    throw new Error("Invalid database name");
  }
  const exists = await databaseExists(name);
  if (!exists) {
    throw new Error(`Database "${name}" does not exist`);
  }
  const db = await openDbInstance(name);
  if (activeDbName === name && activePgServer) return;

  if (activePgServer) {
    await activePgServer.stop().catch(() => {});
    activePgServer = null;
  }
  const pgServer = new PGLiteSocketServer({ db, port: 5432, host: "127.0.0.1" });
  await pgServer.start();
  activePgServer = pgServer;
  activeDbName = name;
  console.log(`PostgreSQL (PGlite) switched to database "${name}" on 127.0.0.1:5432`);
}

async function deleteDatabase(name: string): Promise<void> {
  if (name === "postgres") {
    throw new Error('Cannot drop default "postgres" database');
  }
  if (!isValidDbName(name)) {
    throw new Error("Invalid database name");
  }
  if (activeDbName === name) {
    await switchActiveDatabase("postgres");
  }
  const inst = dbInstances.get(name);
  if (inst) {
    await inst.close().catch(() => {});
    dbInstances.delete(name);
  }
  await fs.rm(getDbStoragePath(name), { recursive: true, force: true });
}

function extractLocalDbName(connectionString?: string): string | null {
  if (!connectionString || typeof connectionString !== "string") return null;
  try {
    const parsed = new URL(connectionString);
    const host = parsed.hostname.toLowerCase();
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
      return null;
    }
    const dbPart = parsed.pathname.replace(/^\/+/, "").split("/")[0];
    return dbPart && isValidDbName(dbPart) ? dbPart : null;
  } catch {
    return null;
  }
}

async function readRepoEnvMap(): Promise<{ raw: string; map: Record<string, string> }> {
  const envPath = path.join(REPO_PATH, ".env");
  const examplePath = path.join(REPO_PATH, ".env.example");
  let raw = "";
  try {
    raw = await fs.readFile(envPath, "utf-8");
  } catch {
    raw = await fs.readFile(examplePath, "utf-8").catch(() => "");
  }
  const map: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      map[k] = v;
    }
  }
  return { raw, map };
}

async function updateRepoEnvVars(updates: Record<string, string>): Promise<void> {
  const envPath = path.join(REPO_PATH, ".env");
  const { raw } = await readRepoEnvMap();
  const lines = raw ? raw.split("\n") : [];
  const handled = new Set<string>();

  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return line;
    const k = trimmed.slice(0, eq).trim();
    if (Object.prototype.hasOwnProperty.call(updates, k)) {
      handled.add(k);
      const val = updates[k];
      const formatted = /[\s#]/.test(val) && !val.startsWith('"') ? `"${val}"` : val;
      return `${k}=${formatted}`;
    }
    return line;
  });

  for (const [k, val] of Object.entries(updates)) {
    if (!handled.has(k)) {
      const formatted = /[\s#]/.test(val) && !val.startsWith('"') ? `"${val}"` : val;
      updatedLines.push(`${k}=${formatted}`);
    }
  }

  await fs.writeFile(envPath, updatedLines.join("\n").replace(/\n+$/, "\n"), "utf-8");
}

app.get("/api/pg-databases", async (_req, res) => {
  try {
    const databases = await listLocalDatabases();
    const { map } = await readRepoEnvMap();
    const placeholders = ["username", "password", "localhost:port", "namedb"];
    const hasPlaceholders = [map.DATABASE_URL_LOCAL, map.DATABASE_URL_TEST]
      .filter(Boolean)
      .some((u) => placeholders.some((p) => u.includes(p)));

    res.json({
      activeDb: activeDbName,
      databases,
      env: {
        useDbTest: map.USE_DB_TEST === "true",
        useProdDb: map.USE_PROD_DB === "true",
        databaseUrl: map.DATABASE_URL || "",
        databaseUrlLocal: map.DATABASE_URL_LOCAL || "",
        databaseUrlTest: map.DATABASE_URL_TEST || "",
        databaseUrlProd: map.DATABASE_URL_PROD || "",
        hasPlaceholders,
      },
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

app.post("/api/pg-databases", async (req, res) => {
  try {
    const { action, name, switchActive, bindEnvKeys, useDbTest, useProdDb, localDb, testDb } = req.body || {};

    if (action === "create") {
      const cleanName = String(name || "").trim();
      if (!isValidDbName(cleanName)) {
        return res.status(400).json({ error: "Invalid database name (use letters, numbers, _ or -)" });
      }
      await createDatabase(cleanName);
      if (switchActive) {
        await switchActiveDatabase(cleanName);
      }
      if (Array.isArray(bindEnvKeys) && bindEnvKeys.length > 0) {
        const dsn = `postgresql://postgres:postgres@127.0.0.1:5432/${cleanName}`;
        const updates: Record<string, string> = {};
        for (const k of bindEnvKeys) {
          if (["DATABASE_URL", "DATABASE_URL_LOCAL", "DATABASE_URL_TEST"].includes(k)) {
            updates[k] = dsn;
          }
        }
        if (Object.keys(updates).length > 0) await updateRepoEnvVars(updates);
      }
      return res.json({ success: true, activeDb: activeDbName, databases: await listLocalDatabases() });
    }

    if (action === "switch") {
      const cleanName = String(name || "").trim();
      await switchActiveDatabase(cleanName);
      if (Array.isArray(bindEnvKeys) && bindEnvKeys.length > 0) {
        const dsn = `postgresql://postgres:postgres@127.0.0.1:5432/${cleanName}`;
        const updates: Record<string, string> = {};
        for (const k of bindEnvKeys) {
          if (["DATABASE_URL", "DATABASE_URL_LOCAL", "DATABASE_URL_TEST"].includes(k)) {
            updates[k] = dsn;
          }
        }
        if (Object.keys(updates).length > 0) await updateRepoEnvVars(updates);
      }
      return res.json({ success: true, activeDb: activeDbName, databases: await listLocalDatabases() });
    }

    if (action === "delete") {
      const cleanName = String(name || "").trim();
      await deleteDatabase(cleanName);
      return res.json({ success: true, activeDb: activeDbName, databases: await listLocalDatabases() });
    }

    if (action === "sync-env") {
      const updates: Record<string, string> = {};
      if (typeof useDbTest === "boolean") updates.USE_DB_TEST = useDbTest ? "true" : "false";
      if (typeof useProdDb === "boolean") updates.USE_PROD_DB = useProdDb ? "true" : "false";

      const targetLocal = typeof localDb === "string" && isValidDbName(localDb.trim()) ? localDb.trim() : null;
      const targetTest = typeof testDb === "string" && isValidDbName(testDb.trim()) ? testDb.trim() : null;

      if (targetLocal) {
        await createDatabase(targetLocal);
        updates.DATABASE_URL_LOCAL = `postgresql://postgres:postgres@127.0.0.1:5432/${targetLocal}`;
        if (!useDbTest) {
          updates.DATABASE_URL = updates.DATABASE_URL_LOCAL;
        }
      }
      if (targetTest) {
        await createDatabase(targetTest);
        updates.DATABASE_URL_TEST = `postgresql://postgres:postgres@127.0.0.1:5432/${targetTest}`;
        if (useDbTest) {
          updates.DATABASE_URL = updates.DATABASE_URL_TEST;
        }
      }

      await updateRepoEnvVars(updates);

      const { map } = await readRepoEnvMap();
      const desiredActive =
        map.USE_DB_TEST === "true"
          ? extractLocalDbName(map.DATABASE_URL_TEST) || targetTest || activeDbName
          : extractLocalDbName(map.DATABASE_URL_LOCAL) || targetLocal || activeDbName;

      if (desiredActive && isValidDbName(desiredActive)) {
        await createDatabase(desiredActive);
        await switchActiveDatabase(desiredActive);
      }

      return res.json({ success: true, activeDb: activeDbName, databases: await listLocalDatabases() });
    }

    res.status(400).json({ error: "Invalid action" });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

app.post("/api/pg-query", async (req, res) => {
  try {
    const { query, params, rowMode, dbName, connectionString, autoCreateDb } = req.body || {};
    if (typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ error: "Query must be a non-empty string" });
    }
    if (params !== undefined && !Array.isArray(params)) {
      return res.status(400).json({ error: "Params must be an array" });
    }

    const trimmed = query.trim();

    // Intercept CREATE DATABASE / DROP DATABASE so users can manage local PGlite DBs via SQL
    const createDbMatch = trimmed.match(/^CREATE\s+DATABASE\s+"?([a-zA-Z0-9_-]+)"?\s*;?$/i);
    if (createDbMatch) {
      const target = createDbMatch[1];
      await createDatabase(target);
      return res.json({
        result: rowMode === "object" ? [{ database: target, status: "created" }] : [[target, "created"]],
        fields: ["database", "status"],
        rowCount: 1,
        databaseCreated: target,
      });
    }

    const dropDbMatch = trimmed.match(/^DROP\s+DATABASE\s+(?:IF\s+EXISTS\s+)?"?([a-zA-Z0-9_-]+)"?\s*;?$/i);
    if (dropDbMatch) {
      const target = dropDbMatch[1];
      await deleteDatabase(target);
      return res.json({
        result: rowMode === "object" ? [{ database: target, status: "dropped" }] : [[target, "dropped"]],
        fields: ["database", "status"],
        rowCount: 1,
        databaseDropped: target,
      });
    }

    // Intercept pg_database listing so multi-database registry is accurately reflected
    if (/SELECT\s+datname\s+FROM\s+pg_database/i.test(trimmed)) {
      const dbs = await listLocalDatabases();
      return res.json({
        result: rowMode === "object" ? dbs.map((datname) => ({ datname })) : dbs.map((d) => [d]),
        fields: ["datname"],
        rowCount: dbs.length,
      });
    }

    const targetDbName =
      (typeof dbName === "string" && isValidDbName(dbName) ? dbName : null) ||
      extractLocalDbName(connectionString) ||
      activeDbName;

    if (!(await databaseExists(targetDbName))) {
      if (autoCreateDb) {
        await createDatabase(targetDbName);
      } else {
        return res.status(404).json({
          error: `Database "${targetDbName}" does not exist yet.`,
          needsCreation: true,
          dbName: targetDbName,
        });
      }
    }

    const db = await openDbInstance(targetDbName);

    try {
      const useObjectMode = rowMode === "object";
      const queryOptions = useObjectMode ? {} : { rowMode: "array" as const };
      const result: any = await (params && params.length > 0
        ? db.query(query, params, queryOptions)
        : db.query(query, [], queryOptions));

      res.json({
        result: result.rows || [],
        fields: Array.isArray(result.fields) ? result.fields.map((f: any) => f.name) : [],
        rowCount: result.affectedRows ?? (result.rows?.length || 0),
        activeDb: targetDbName,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || String(err), code: err.code });
    }
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// Setup multer for safe image uploads
const ALLOWED_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".svg"]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dest = path.join(REPO_PATH, "public/images");
      fsSync.mkdirSync(dest, { recursive: true });
      cb(null, dest);
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e6);
      const ext = path.extname(file.originalname).toLowerCase();
      const safeBase = path
        .basename(file.originalname, ext)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 40) || "image";
      cb(null, `${safeBase}-${uniqueSuffix}${ext}`);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per image
    files: 10,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMAGE_EXTS.has(ext) || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files (.jpg, .png, .webp, .gif, .avif, .svg) are allowed."));
    }
    cb(null, true);
  },
});

app.post("/api/upload", (req, res) => {
  upload.array("files", 10)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    const uploaded = ((req.files as Express.Multer.File[]) || []).map((f) => ({
      filename: f.filename,
      originalname: f.originalname,
      size: f.size,
      mimetype: f.mimetype,
      path: `/images/${f.filename}`,
    }));
    res.json({ success: true, files: uploaded });
  });
});

// Server-side Gemini endpoints
app.post("/api/gemini/generate", async (req, res) => {
  try {
    const { mode, prompt, content } = req.body || {};
    if (!["write", "seo", "translate"].includes(mode)) {
      return res.status(400).json({ error: "Invalid generation mode" });
    }
    const ai = getGeminiClient();

    let systemInstruction = "";
    let userPrompt = "";

    if (mode === "write") {
      if (typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({ error: "Prompt is required" });
      }
      systemInstruction =
        "You are an expert editorial writer. Write a well-structured markdown section based on the user prompt. Output ONLY the markdown content.";
      userPrompt = prompt;
    } else if (mode === "seo") {
      systemInstruction =
        "You are an SEO specialist. Generate a YAML frontmatter block with title, description, and keywords based on the provided content. Output ONLY the YAML block delimited by ---.";
      userPrompt = `Generate SEO meta tags for this content:\n\n${String(content || "").substring(0, 2000)}`;
    } else {
      systemInstruction = `You are a professional translator. Translate the provided markdown content to ${
        typeof prompt === "string" && prompt.trim() ? prompt.trim() : "English"
      }. Preserve all markdown formatting and links. Output ONLY the translated markdown.`;
      userPrompt = String(content || "");
    }

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: userPrompt,
      config: { systemInstruction },
    });

    res.json({ text: response.text || "" });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

app.post("/api/gemini/alt-text", async (req, res) => {
  try {
    const { imageUrl, bilingual } = req.body || {};
    if (typeof imageUrl !== "string" || !imageUrl.trim()) {
      return res.status(400).json({ error: "imageUrl is required" });
    }

    let base64Data = "";
    let mimeType = "image/jpeg";

    if (imageUrl.startsWith("/images/")) {
      const relPath = path.join("public", imageUrl.replace(/^\/+/, ""));
      const fullPath = resolveRepoPath(relPath);
      if (!fullPath) return res.status(403).json({ error: "Invalid image path" });
      const buf = await fs.readFile(fullPath);
      base64Data = buf.toString("base64");
      const ext = path.extname(fullPath).toLowerCase();
      mimeType =
        ext === ".png"
          ? "image/png"
          : ext === ".webp"
          ? "image/webp"
          : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";
    } else {
      const safeUrl = await assertSafeRemoteUrl(imageUrl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(safeUrl.toString(), { signal: controller.signal });
        if (!resp.ok) throw new Error(`Failed to fetch image (${resp.status})`);
        const ct = resp.headers.get("content-type") || "image/jpeg";
        if (!ct.startsWith("image/")) throw new Error("URL did not return an image");
        mimeType = ct.split(";")[0];
        const ab = await resp.arrayBuffer();
        if (ab.byteLength > 5 * 1024 * 1024) {
          throw new Error("Image exceeds 5MB limit for AI inspection");
        }
        base64Data = Buffer.from(ab).toString("base64");
      } finally {
        clearTimeout(timer);
      }
    }

    const ai = getGeminiClient();

    if (bilingual) {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            {
              text: "Generate concise, accessible alt text for this image in French, English, Spanish, and Arabic.",
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              fr: { type: Type.STRING },
              en: { type: Type.STRING },
              es: { type: Type.STRING },
              ar: { type: Type.STRING },
            },
          },
        },
      });
      return res.json({ alt: JSON.parse(response.text || "{}") });
    }

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType } },
          {
            text: "Generate a short, descriptive, accessible alt text for this image in French. Return ONLY the plain sentence.",
          },
        ],
      },
    });

    res.json({ alt: (response.text || "").trim() });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

app.post("/api/gemini/translate", async (req, res) => {
  try {
    const { sourceLang, targetLang, payload, kind } = req.body || {};
    if (!targetLang || !payload) {
      return res.status(400).json({ error: "targetLang and payload are required" });
    }
    const ai = getGeminiClient();

    const prompt =
      kind === "i18n"
        ? `Translate the following flat JSON dictionary of UI strings from ${sourceLang || "reference"} into language code "${targetLang}". Keep all keys EXACTLY identical and return ONLY a valid JSON object with the translated string values:\n\n${JSON.stringify(payload, null, 2)}`
        : `Translate the text values inside this CMS JSON object from "${sourceLang || "fr"}" to "${targetLang}". ONLY translate human-readable text fields (such as headline, alternativeHeadline, articleBody, excerpt, title, description, seoTitle, seoDescription, seoKeywords). DO NOT change keys, IDs, slugs, URLs, dates, or booleans. Return ONLY valid JSON:\n\n${JSON.stringify(payload, null, 2)}`;

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json({ translated: parsed });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Ensure repo path exists
async function ensureRepo() {
  const GIT_REPO_URL = process.env.GIT_REPO_URL || "https://github.com/ishaq74/concordia.git";
  try {
    await fs.access(path.join(REPO_PATH, ".git"));
  } catch {
    console.log(`Cloning repository from ${GIT_REPO_URL}...`);
    try {
      await fs.rm(REPO_PATH, { recursive: true, force: true }).catch(() => {});
      await execFileAsync("git", ["clone", GIT_REPO_URL, REPO_PATH]);
      await execFileAsync("npx", ["pnpm", "install"], { cwd: REPO_PATH });
    } catch (e) {
      console.error("Error during repo setup:", e);
    }
  }

  try {
    await fs.access(path.join(REPO_PATH, ".env"));
  } catch {
    try {
      await fs.copyFile(path.join(REPO_PATH, ".env.example"), path.join(REPO_PATH, ".env"));
    } catch {
      // ignore if no .env.example
    }
  }
}

// Filesystem API Routes
app.get("/api/fs/read", async (req, res) => {
  try {
    const targetPath = req.query.path as string;
    const fullPath = resolveRepoPath(targetPath);
    if (!fullPath) {
      return res.status(targetPath ? 403 : 400).json({ error: targetPath ? "Access denied" : "Path is required" });
    }

    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      const children = await fs.readdir(fullPath);
      return res.json({ type: "directory", children });
    } else {
      const content = await fs.readFile(fullPath, "utf-8");
      return res.json({ type: "file", content });
    }
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return res.status(404).json({ error: "File not found" });
    }
    res.status(500).json({ error: sanitizeError(error) });
  }
});

app.get("/api/fs/raw", async (req, res) => {
  try {
    const targetPath = req.query.path as string;
    const fullPath = resolveRepoPath(targetPath);
    if (!fullPath) {
      return res.status(targetPath ? 403 : 400).json({ error: targetPath ? "Access denied" : "Path is required" });
    }

    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        return res.status(400).json({ error: "Cannot serve directory" });
      }
      res.sendFile(fullPath, (err) => {
        if (err && !res.headersSent) {
          res.status(404).json({ error: "File not found" });
        }
      });
    } catch {
      res.status(404).json({ error: "File not found" });
    }
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

app.post("/api/fs/write", async (req, res) => {
  try {
    const { path: targetPath, content, createBackup } = req.body || {};
    if (!targetPath || content === undefined) {
      return res.status(400).json({ error: "Path and content are required" });
    }
    if (typeof content !== "string") {
      return res.status(400).json({ error: "Content must be a string" });
    }

    const fullPath = resolveRepoPath(targetPath);
    if (!fullPath || isProtectedPath(fullPath)) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (createBackup) {
      try {
        await fs.copyFile(fullPath, `${fullPath}.bak`);
      } catch {
        // Ignore if file doesn't exist yet
      }
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

app.post("/api/fs/delete", async (req, res) => {
  try {
    const { path: targetPath } = req.body || {};
    if (!targetPath) return res.status(400).json({ error: "Path is required" });

    const fullPath = resolveRepoPath(targetPath);
    if (!fullPath || isProtectedPath(fullPath) || fullPath === REPO_PATH) {
      return res.status(403).json({ error: "Access denied" });
    }

    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: "Directory deletion is not permitted" });
    }

    await fs.unlink(fullPath);
    res.json({ success: true });
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return res.status(404).json({ error: "File not found" });
    }
    res.status(500).json({ error: sanitizeError(error) });
  }
});

const SCAN_IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  ".astro",
  "pg-data",
  "pg-databases",
  "test-results",
  "reports",
]);

app.get("/api/fs/scan", async (_req, res) => {
  try {
    async function getFiles(dir: string): Promise<string[]> {
      const dirents = await fs.readdir(dir, { withFileTypes: true });
      const files = await Promise.all(
        dirents.map(async (dirent) => {
          if (SCAN_IGNORED_DIRS.has(dirent.name)) return [];
          const resPath = path.resolve(dir, dirent.name);
          return dirent.isDirectory() ? await getFiles(resPath) : [resPath];
        })
      );
      return files.flat();
    }

    const allFiles = await getFiles(REPO_PATH);
    const relativeFiles = allFiles
      .map((f) => path.relative(REPO_PATH, f).split(path.sep).join("/"))
      .sort();
    res.json({ files: relativeFiles });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// Seeds API (supports *Seed, *Data, user, etc. — any exported Array)
app.get("/api/seeds-all", async (_req, res) => {
  try {
    const dataDir = path.join(REPO_PATH, "src/database/data");
    const files = (await fs.readdir(dataDir).catch(() => [])).sort();
    const seedFiles = files.filter((f) => /^[a-zA-Z0-9_-]+\.data\.ts$/.test(f));

    const allData: Record<string, { exportKey: string; items: any[] }> = {};

    for (const file of seedFiles) {
      try {
        const fullPath = path.join(dataDir, file);
        const modUrl = `${pathToFileURL(fullPath).href}?update=${Date.now()}`;
        const module = await import(modUrl);
        const exportKey =
          Object.keys(module).find((key) => key.endsWith("Seed") && Array.isArray(module[key])) ||
          Object.keys(module).find((key) => Array.isArray(module[key]));
        if (exportKey && Array.isArray(module[exportKey])) {
          allData[file] = { exportKey, items: module[exportKey] };
        }
      } catch (e) {
        console.warn(`Skipping seed file ${file}:`, e);
      }
    }

    res.json({ success: true, data: allData });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

app.get("/api/seeds/:file", async (req, res) => {
  try {
    const { file } = req.params;
    if (!/^[a-zA-Z0-9_-]+\.data\.ts$/.test(file)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    const fullPath = path.join(REPO_PATH, "src/database/data", file);

    await fs.access(fullPath);

    const modUrl = `${pathToFileURL(fullPath).href}?update=${Date.now()}`;
    const module = await import(modUrl);

    const exportKey =
      Object.keys(module).find((key) => key.endsWith("Seed") && Array.isArray(module[key])) ||
      Object.keys(module).find((key) => Array.isArray(module[key]));

    if (exportKey && Array.isArray(module[exportKey])) {
      res.json({ success: true, data: module[exportKey], exportKey });
    } else {
      res.status(400).json({ error: "Could not find exported array in seed file" });
    }
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return res.status(404).json({ error: "Seed file not found" });
    }
    res.status(500).json({ error: sanitizeError(error) });
  }
});

app.post("/api/seeds/:file", async (req, res) => {
  try {
    const { file } = req.params;
    const { data, exportKey } = req.body || {};

    if (!/^[a-zA-Z0-9_-]+\.data\.ts$/.test(file)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    if (!Array.isArray(data) || typeof exportKey !== "string" || !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(exportKey)) {
      return res.status(400).json({ error: "Valid array data and identifier exportKey are required" });
    }

    const fullPath = path.join(REPO_PATH, "src/database/data", file);
    await fs.access(fullPath);

    // Preserve any leading comment block from the original file
    const existing = await fs.readFile(fullPath, "utf-8").catch(() => "");
    const headerLines: string[] = [];
    for (const line of existing.split("\n")) {
      if (line.trim().startsWith("//")) {
        headerLines.push(line);
      } else {
        break;
      }
    }
    const header = headerLines.length > 0 ? headerLines.join("\n") + "\n" : "";

    const jsonStr = JSON.stringify(data, null, 4);
    const tsCode =
      `${header}export const ${exportKey} = ` +
      jsonStr.replace(/"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)"/g, 'new Date("$1")') +
      ";\n";

    await fs.writeFile(fullPath, tsCode, "utf-8");

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// Safe Command Runner (NO shell: true!)
const ALLOWED_COMMANDS = new Set(["npm", "npx", "pnpm", "bun", "bunx", "git", "node", "grep"]);
const ALLOWED_GIT_SUBCOMMANDS = new Set(["status", "branch", "log", "diff", "show", "rev-parse"]);

app.post("/api/script-runner", async (req, res) => {
  try {
    const { command, args, cwd } = req.body || {};
    if (typeof command !== "string" || !ALLOWED_COMMANDS.has(command)) {
      return res.status(403).json({ error: "Command not allowed" });
    }

    const cleanArgs: string[] = Array.isArray(args)
      ? args.map((a) => String(a))
      : [];

    if (cleanArgs.length > 20 || cleanArgs.some((a) => a.includes("\0"))) {
      return res.status(400).json({ error: "Invalid arguments" });
    }

    if (command === "node" && cleanArgs.some((a) => a === "-e" || a === "--eval" || a === "-p" || a === "--print")) {
      return res.status(403).json({ error: "Inline node evaluation is not allowed" });
    }

    if (command === "git") {
      const sub = cleanArgs[0];
      if (!sub || !ALLOWED_GIT_SUBCOMMANDS.has(sub)) {
        return res.status(403).json({ error: "Git subcommand not allowed" });
      }
    }

    const execCwd = cwd ? resolveRepoPath(cwd) : REPO_PATH;
    if (!execCwd) {
      return res.status(403).json({ error: "Access denied" });
    }

    try {
      const { stdout, stderr } = await execFileAsync(command, cleanArgs, {
        cwd: execCwd,
        timeout: 120000,
        maxBuffer: 4 * 1024 * 1024,
      });
      res.json({ stdout, stderr, exitCode: 0 });
    } catch (error: any) {
      const sanitizeObj = (str?: string) =>
        (str || "").split(REPO_PATH).join("[REPO_DIR]").split(process.cwd()).join("[APP_DIR]");

      // grep exits with code 1 when 0 matches are found
      if (command === "grep" && error.code === 1) {
        return res.json({ stdout: "", stderr: "", exitCode: 1 });
      }

      res.status(500).json({
        error: sanitizeError(error),
        stdout: sanitizeObj(error.stdout),
        stderr: sanitizeObj(error.stderr),
        exitCode: error.code ?? 1,
      });
    }
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

app.get("/api/package-scripts", async (_req, res) => {
  try {
    const pkgPath = path.join(REPO_PATH, "package.json");
    const content = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(content);
    res.json({ scripts: pkg.scripts || {} });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

let isPublishing = false;

app.post("/api/git/push", async (_req, res) => {
  if (isPublishing) {
    return res.status(429).json({ error: "A publication is already in progress." });
  }
  isPublishing = true;

  try {
    // 1. Run non-watch test suite
    try {
      await execFileAsync("npm", ["run", "test:all"], { cwd: REPO_PATH, timeout: 120000 });
    } catch (testError: any) {
      return res.status(400).json({
        error: "Tests failed. Cannot publish.",
        details: sanitizeError(testError.stdout || testError.stderr || testError.message),
      });
    }

    // 2. Stage changes
    await execFileAsync("git", ["add", "."], { cwd: REPO_PATH });

    // 3. Commit
    try {
      await execFileAsync("git", ["commit", "-m", "Update via Concordia CMS"], { cwd: REPO_PATH });
    } catch (commitError: any) {
      const out = `${commitError.stdout || ""}${commitError.stderr || ""}`;
      if (out.includes("nothing to commit")) {
        return res.json({ success: true, message: "Nothing to commit — repository is up to date." });
      }
      throw commitError;
    }

    // 4. Rebase against origin/main
    try {
      await execFileAsync("git", ["pull", "--rebase", "origin", "main"], { cwd: REPO_PATH });
    } catch (pullError: any) {
      await execFileAsync("git", ["rebase", "--abort"], { cwd: REPO_PATH }).catch(() => {});
      return res.status(409).json({
        error: "Git pull conflict detected. Publication aborted.",
        details: sanitizeError(pullError.stdout || pullError.stderr || pullError.message),
      });
    }

    // 5. Push
    await execFileAsync("git", ["push", "origin", "main"], { cwd: REPO_PATH });

    res.json({ success: true, message: "Successfully published changes." });
  } catch (error) {
    res.status(500).json({
      error: "Publication failed.",
      details: sanitizeError(error),
    });
  } finally {
    isPublishing = false;
  }
});

async function startServer() {
  await ensureRepo();
  try {
    // Auto-select local/test DB configured in concordia_repo/.env if valid, otherwise default to "postgres"
    const { map } = await readRepoEnvMap();
    const envTarget =
      map.USE_DB_TEST === "true"
        ? extractLocalDbName(map.DATABASE_URL_TEST)
        : extractLocalDbName(map.DATABASE_URL_LOCAL) || extractLocalDbName(map.DATABASE_URL);
    const initialDb = envTarget && (await databaseExists(envTarget)) ? envTarget : "postgres";
    await switchActiveDatabase(initialDb);
  } catch (err) {
    console.error("Failed to start internal PostgreSQL server:", err);
  }

  // Proxy Astro dev server routes
  const astroProxy = createProxyMiddleware({
    target: "http://127.0.0.1:4321",
    changeOrigin: true,
    ws: true,
    pathRewrite: (p) => {
      if (p.startsWith("/preview-site")) {
        return p.replace("/preview-site", "") || "/";
      }
      return p;
    },
  });

  app.use(
    [
      "/preview-site",
      "/_astro",
      "/@vite",
      "/@fs",
      "/@id",
      "/__astro_ping",
      "/__vite_ping",
      "/__dev_overlay",
      "/_image",
      "/ar",
      "/es",
      "/fr",
      "/en",
    ],
    (req, res, next) => {
      if (astroDevServer) {
        astroProxy(req, res, next);
      } else if (req.path.startsWith("/preview-site")) {
        res.status(503).send(`
          <html>
            <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #f8fafc; margin: 0;">
              <div style="text-align: center; color: #475569; max-width: 360px; padding: 24px;">
                <h2 style="color: #0f172a; margin-bottom: 8px; font-size: 18px;">Astro Dev Server Stopped</h2>
                <p style="font-size: 14px; line-height: 1.5;">Click <strong>Start Dev Server</strong> in Workspace &rarr; Preview to launch the live Astro preview.</p>
              </div>
            </body>
          </html>
        `);
      } else {
        next();
      }
    }
  );

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
