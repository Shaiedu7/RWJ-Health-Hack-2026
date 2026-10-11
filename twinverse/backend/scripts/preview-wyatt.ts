import { mkdirSync, writeFileSync } from "node:fs";
import { buildDraft, DEFAULT_PACKAGE, readWyattSource } from "./wyatt-draft.js";

const source = readWyattSource(process.argv[2] ?? DEFAULT_PACKAGE);
const items = buildDraft(
  source,
  "SET_AT_IMPORT",
  "SET_FROM_VERIFIED_CALLER",
  "arn:aws:iam::977659666193:role/WSParticipantRole",
);
mkdirSync("review", { recursive: true });
writeFileSync(
  "review/wyatt-import-preview.json",
  JSON.stringify({ status: "PREVIEW_ONLY", items }, null, 2) + "\n",
);
console.log(
  `Prepared ${items.length} items for one unapproved draft; no AWS calls or file uploads.`,
);
