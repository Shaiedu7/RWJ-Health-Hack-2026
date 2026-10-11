import { randomBytes, createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { CognitoJwtVerifier } from "aws-jwt-verify";

const domain = "https://twinverse-students-977659666193.auth.us-west-2.amazoncognito.com";
const clientId = "2vroalrilht0tpfr2ioeecr3ka";
const userPoolId = "us-west-2_A0Jn91CmN";
const accessVerifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: "access" });
const idVerifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: "id" });
const random = () => randomBytes(32).toString("base64url");
const pending = new Map<string, { state: string; nonce: string; verifier: string; callback: string; origin: string; destination: string; expires: number }>();
const sessions = new Map<string, { token: string; expires: number; role: "student" | "faculty"; email?: string }>();
function cookie(req: IncomingMessage, name: string) {
  return req.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);
}
function setCookie(res: ServerResponse, value: string, maxAge: number) {
  // This server is loopback-only HTTP development. HTTPS hosting must add Secure.
  res.setHeader("Set-Cookie", `twinverse_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}
function redirect(res: ServerResponse, target: string) { res.writeHead(302, { Location: target }); res.end(); }
function origin(req: IncomingMessage) {
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  if (host !== "localhost:8443" && host !== "127.0.0.1:8443") throw new Error("Invalid development origin");
  return `http://${host}`;
}
function cleanup() {
  const now = Date.now();
  for (const [key, item] of pending) if (item.expires < now) pending.delete(key);
  for (const [key, item] of sessions) if (item.expires < now) sessions.delete(key);
}
export function sessionAllowsFaculty(role: string | undefined, groups: unknown): boolean {
  return role === "faculty" && Array.isArray(groups) && groups.includes("Faculty");
}
export function activeSessionRole(req: IncomingMessage) {
  cleanup();
  return sessions.get(cookie(req, "twinverse_session") ?? "")?.role;
}
export async function authenticatedStudent(req: IncomingMessage) {
  cleanup();
  const session = sessions.get(cookie(req, "twinverse_session") ?? "");
  if (!session) return null;
  // Access tokens carry no email, so the one verified at sign-in is attached for display names.
  try { return { ...(await accessVerifier.verify(session.token)), ...(session.email ? { email: session.email } : {}) }; } catch { return null; }
}
export async function authRoute(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith("/api/auth/")) return false;
  cleanup();
  const send = (status: number, body: unknown) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  if (url.pathname === "/api/auth/session" && req.method === "GET") {
    const student = await authenticatedStudent(req);
    send(student ? 200 : 401, student ? { signedIn: true, studentId: student.sub, role: activeSessionRole(req) } : { signedIn: false });
    return true;
  }
  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    if (req.headers.origin !== origin(req)) { send(403, { message: "Invalid origin." }); return true; }
    sessions.delete(cookie(req, "twinverse_session") ?? ""); setCookie(res, "", 0);
    send(200, { logoutUrl: `${domain}/logout?${new URLSearchParams({ client_id: clientId, logout_uri: `${origin(req)}/` })}` });
    return true;
  }
  if (req.method !== "GET") { send(405, { message: "Method not allowed." }); return true; }
  if (url.pathname === "/api/auth/login") {
    const site = origin(req); const key = random(); const state = random(); const nonce = random(); const verifier = random();
    const destination = url.searchParams.get("destination") === "faculty" ? "/faculty.html" : "/";
    pending.set(key, { state, nonce, verifier, origin: site, destination, callback: `${site}/auth/callback`, expires: Date.now() + 600_000 });
    setCookie(res, key, 600);
    redirect(res, `${domain}/oauth2/authorize?${new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: `${site}/auth/callback`, scope: "openid email", state, nonce, code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url") })}`);
    return true;
  }
  if (url.pathname === "/api/auth/callback") {
    const key = cookie(req, "twinverse_session") ?? ""; const flow = pending.get(key); pending.delete(key);
    const fail = () => { setCookie(res, "", 0); redirect(res, `${origin(req)}/?authError=1`); };
    if (!flow || url.searchParams.get("state") !== flow.state || !url.searchParams.get("code")) { fail(); return true; }
    try {
      const response = await fetch(`${domain}/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, redirect_uri: flow.callback, code: url.searchParams.get("code") ?? "", code_verifier: flow.verifier }), signal: AbortSignal.timeout(15_000) });
      const tokens = await response.json() as { access_token?: string; id_token?: string };
      if (!response.ok || !tokens.access_token || !tokens.id_token) throw new Error("Token exchange failed");
      const identity = await idVerifier.verify(tokens.id_token);
      const access = await accessVerifier.verify(tokens.access_token);
      if (identity.nonce !== flow.nonce || identity.sub !== access.sub || identity.email_verified !== true) throw new Error("Identity verification failed");
      const role = flow.destination === "/faculty.html" ? "faculty" : "student";
      if (role === "faculty" && !sessionAllowsFaculty(role, access["cognito:groups"])) throw new Error("Faculty membership required");
      const id = random(); sessions.set(id, { token: tokens.access_token, expires: access.exp * 1000, role, ...(typeof identity.email === "string" ? { email: identity.email } : {}) });
      setCookie(res, id, Math.max(0, access.exp - Math.floor(Date.now() / 1000))); redirect(res, `${flow.origin}${flow.destination}`);
    } catch { fail(); }
    return true;
  }
  send(404, { message: "Unknown authentication route." }); return true;
}
