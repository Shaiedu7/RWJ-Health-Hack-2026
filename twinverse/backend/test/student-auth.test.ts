import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { authRoute, authenticatedStudent, sessionAllowsFaculty } from "../lib/student-auth.js";

test("Cognito flow uses PKCE and rejects forged sessions and mismatched callback state", async () => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (await authRoute(req, res, url)) return;
      res.statusCode = (await authenticatedStudent(req)) ? 200 : 401; res.end();
    } catch { res.statusCode = 400; res.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { "x-forwarded-host": "127.0.0.1:8443" };
  try {
    assert.equal((await fetch(`${base}/patient`, { headers: { Cookie: "twinverse_session=forged" } })).status, 401);
    const login = await fetch(`${base}/api/auth/login`, { headers, redirect: "manual" });
    assert.equal(login.status, 302);
    const target = new URL(login.headers.get("location") ?? "");
    assert.equal(target.hostname, "twinverse-students-977659666193.auth.us-west-2.amazoncognito.com");
    assert.equal(target.searchParams.get("code_challenge_method"), "S256");
    assert.equal(target.searchParams.get("redirect_uri"), "http://127.0.0.1:8443/auth/callback");
    assert.ok(target.searchParams.get("nonce")); assert.ok(target.searchParams.get("state"));
    const cookie = login.headers.get("set-cookie") ?? "";
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/);
    const callback = await fetch(`${base}/api/auth/callback?state=forged&code=forged`, { headers: { ...headers, Cookie: cookie.split(";")[0] ?? "" }, redirect: "manual" });
    assert.equal(callback.status, 302); assert.equal(callback.headers.get("location"), "http://127.0.0.1:8443/?authError=1");
    assert.equal((await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { ...headers, Origin: "http://untrusted.example" } })).status, 403);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

 test("student login cannot grant faculty access even for a dual-role account", () => {
 assert.equal(sessionAllowsFaculty("student", ["Faculty"]), false);
 assert.equal(sessionAllowsFaculty("faculty", []), false);
 assert.equal(sessionAllowsFaculty("faculty", ["Faculty"]), true);
 assert.equal(sessionAllowsFaculty(undefined, ["Faculty"]), false);
 });
