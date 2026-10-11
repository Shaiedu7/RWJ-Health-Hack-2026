import { parseProfileText, exportProfile } from "./faculty-review.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { authenticatedStudent, activeSessionRole } from "./student-auth.js";
import { generateFacultyProfile } from "./faculty-generation.js";
import {
  FacultyError,
  requireFaculty,
  validateFacultyProfile,
  facultySchema,
  blankFacultyProfile,
  facultyStore,
} from "./faculty-patients.js";
async function body(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk as Uint8Array);
    length += bytes.length;
    if (length > 150_000)
      throw new FacultyError(413, "Draft request too large.");
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    throw new FacultyError(400, "Invalid JSON request.");
  }
}
export async function facultyRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/faculty/")) return false;
  const send = (status: number, value: unknown) => {
    res.statusCode = status;
    res.end(JSON.stringify(value));
  };
  try {
    if (
      process.env["NODE_ENV"] === "production" ||
      process.env["ENABLE_FACULTY_DEVELOPMENT"] !== "true"
    )
      throw new FacultyError(403, "Faculty development access is disabled.");
    const identity = await authenticatedStudent(req);
    if (!identity) throw new FacultyError(401, "Sign in with Cognito.");
    if (activeSessionRole(req) !== "faculty") throw new FacultyError(403, "You are signed in as a student. Sign in through Faculty to open Patient Studio.");
    const facultyId = requireFaculty(identity);
    if (!["GET", "POST", "PUT"].includes(req.method ?? ""))
      throw new FacultyError(405, "Method not supported.");
    if (
      req.method !== "GET" &&
      !["http://127.0.0.1:8443", "http://localhost:8443"].includes(
        req.headers.origin ?? "",
      )
    )
      throw new FacultyError(403, "Same-origin faculty request required.");
    const path = url.pathname.slice("/api/faculty".length);
    if (path === "/auth/me" && req.method === "GET") {
      send(200, { name: "Faculty demo", role: "faculty" });
      return true;
    }
    if (path === "/schema" && req.method === "GET") {
      send(200, facultySchema);
      return true;
    }
    const store = await facultyStore();
    if (path === "/profiles/serialize" && req.method === "POST") {
      const input = await body(req);
      const profile = validateFacultyProfile(input["profile"]);
      const format = input["format"] === "yaml" ? "yaml" : "json";
      send(200, { format, text: exportProfile(profile, format) });
      return true;
    }
    if (path === "/profiles/parse" && req.method === "POST") {
      const input = await body(req);
      send(200, { profile: parseProfileText(input["text"], input["format"]) });
      return true;
    }
    if (path === "/patients/import" && req.method === "POST") {
      const input = await body(req);
      const profile = parseProfileText(input["text"], input["format"]);
      profile["_verified"] = [];
      send(201, await store.save(facultyId, profile));
      return true;
    }
    const dismissal = path.match(
      /^\/patients\/(faculty-[0-9a-f-]{36})\/issues\/(\d+)\/dismiss$/i,
    );
    if (dismissal && req.method === "POST") {
      const input = await body(req);
      if (
        !Number.isSafeInteger(input["revision"]) ||
        typeof input["reason"] !== "string"
      )
        throw new FacultyError(
          422,
          "Supply the saved revision and review reason.",
        );
      send(200, {
        issues: await store.dismiss(
          facultyId,
          dismissal[1] ?? "",
          Number(input["revision"]),
          Number(dismissal[2]),
          input["reason"],
        ),
      });
      return true;
    }
    const action = path.match(
      /^\/patients\/(faculty-[0-9a-f-]{36})\/(check|publish|export)$/i,
    );
    if (action && req.method === "GET" && action[2] === "export") {
      const current = await store.get(facultyId, action[1] ?? "");
      const format =
        url.searchParams.get("format") === "yaml" ? "yaml" : "json";
      send(200, { format, text: exportProfile(current["profile"], format) });
      return true;
    }
    if (action && req.method === "POST") {
      const input = await body(req);
      if (!Number.isSafeInteger(input["revision"]))
        throw new FacultyError(422, "A saved draft revision is required.");
      if (action[2] === "check")
        send(200, {
          issues: await store.check(
            facultyId,
            action[1] ?? "",
            Number(input["revision"]),
          ),
        });
      else if (action[2] === "publish")
        send(
          200,
          await store.publish(
            facultyId,
            action[1] ?? "",
            Number(input["revision"]),
            input["confirmed"] === true,
          ),
        );
      else throw new FacultyError(405, "Export uses GET.");
      return true;
    }

    if (path === "/patients" && req.method === "GET") {
      send(200, await store.list(facultyId));
      return true;
    }
    if (path === "/patients" && req.method === "POST") {
      const input = await body(req);
      send(
        201,
        await store.save(facultyId, input["profile"] ?? blankFacultyProfile()),
      );
      return true;
    }
    if (path === "/patients/generate" && req.method === "POST") {
      const input = await body(req);
      if (
        typeof input["description"] !== "string" ||
        !input["description"].trim() ||
        input["description"].length > 10_000
      )
        throw new FacultyError(
          422,
          "Enter a patient description under 10,000 characters.",
        );
      if (
        input["generationMode"] !== "FICTIONAL" &&
        input["generationMode"] !== "SUPPLIED"
      )
        throw new FacultyError(
          422,
          "Choose fictional case generation or supplied-details mapping.",
        );
      const profile = await generateFacultyProfile(
        facultyId,
        input["description"].trim(),
        input["generationMode"],
      );
      send(201, await store.save(facultyId, profile));
      return true;
    }
    const match = path.match(/^\/patients\/(faculty-[0-9a-f-]{36})$/i);
    if (match && req.method === "GET") {
      send(200, await store.get(facultyId, match[1] ?? ""));
      return true;
    }
    if (match && req.method === "PUT") {
      const input = await body(req);
      send(
        200,
        await store.save(
          facultyId,
          input["profile"],
          match[1] ?? "",
          typeof input["revision"] === "number" ? input["revision"] : undefined,
        ),
      );
      return true;
    }
    throw new FacultyError(404, "This faculty feature is not connected yet.");
  } catch (error) {
    if (error instanceof FacultyError)
      send(error.status, { detail: error.message });
    else {
      console.error(
        "Faculty operation failed:",
        error instanceof Error ? error.name : "UnknownError",
      );
      send(503, {
        detail:
          "The patient database could not complete this request. Your draft has not been replaced with mock data.",
      });
    }
    return true;
  }
}
