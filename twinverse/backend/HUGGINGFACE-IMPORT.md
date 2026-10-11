# Hugging Face patient import

Imported all 8 complete rows from `joeljames270/virtual-patient-profiles-sample`, configuration `default`, split `train`, into the existing `twinverse-event-patients` table in account `977659666193`, region `us-west-2`, using profile `twinverse-event`. No infrastructure was created. All profiles remain unapproved drafts.

The exact downloaded response is saved in `sources/huggingface-patients.json`. Response SHA256: `9717458442a19fd090ac589cc1f1794154adfa19c272cdd7d3bbe3ad49d70cf2`. Every immutable database snapshot preserves its full original row, including nulls and empty arrays. Source provenance includes dataset/config/split, endpoint, row index, hashes and import actor/time. The endpoint reported total 8, partial false, and no truncated cells.

| Patient | Imported patient ID |
| --- | --- |
| Dominic Rivera | import-b94225918b391094b059c64c |
| Yvette Armstrong | import-d28497ccc8fc343d7dd5635e |
| Nisha Patel | import-5a44a66529618f4bf6f7b4bf |
| Omar Sinclair | import-a1bd10c9b3145689207b09e0 |
| Marcus Ramirez | import-0a0487247f4a984f3106ab66 |
| Walter Greene | import-1c4b081547fa6ba93f8f5152 |
| Wyatt Nelson | import-723e573c6165830038229a56 |
| Vladko Bareche | import-5dde3630b525c1fff9e77e03 |

## Storage and review

Each source profile has 15 items, written in one conditional transaction: source mapping, HEAD, DRAFT#PROFILE, immutable import snapshot, request receipt, six DRAFT#FACT section proposals (overview, demographics, clinical, medication, nutrition and psychosocial), DRAFT#DISCLOSURE_PROPOSAL, DRAFT#ASSESSMENT, DRAFT#SOURCE_METADATA and DRAFT#SOURCE_REVIEW.

The six section proposals are source data containers, not individually reviewed clinical facts. Learning opportunities remain proposed faculty objectives, separate from patient knowledge. Disclosure categories are non-executable prose proposals; no RULE items are generated. Assumptions and optional details remain separate, unconfirmed metadata. References to medical records, parent reports or nurse notes do not create reports or verify that documents exist. No portraits are supplied by this endpoint, and no portrait is borrowed from another source.

All eight names match the package CSV. Each imported profile flags that name-only overlap, preserves the corresponding CSV row/UUID as a review reference, and explicitly records `merged: false`. No CSV UUID is assigned to a Hugging Face identity. The CSV-based Wyatt (`import-d95bcab43d3144ceedd0ae8c`) is unchanged. Hugging Face's Wyatt adds diabetes, medications, laboratory units and other details absent from the CSV; its BMI values also differ internally (32 versus 32.1). These require source reconciliation before use as approved facts.

No source UUID is supplied by Hugging Face. IDs use a deterministic hash of scope, dataset/config/split and normalized name; row index is retained only as provenance, not identity. Duplicate names within the source are rejected. A renamed patient cannot automatically be recognized as the same identity and needs manual reconciliation. Repeated import of the saved response creates no duplicates. A changed response/source row is refused rather than overwriting a reviewed or edited draft. Imports are atomic per patient, not across the entire dataset; a partially completed run can be repeated.

## Teammate commands

Run from this patients-step1 directory:

```sh
node --import tsx scripts/import-huggingface.ts
node --import tsx scripts/import-huggingface.ts --write
node --import tsx scripts/load-patient.ts import-723e573c6165830038229a56 --development-preview
```

The importer reads the saved response, checks completeness, truncation, source identity and original CSV overlaps, guards the AWS account, writes only absent keys, and strongly retrieves every saved item for full content equality. Import verification is in `review/huggingface-first-import-verification.json` and `review/huggingface-import-verification.json`; first run created 8 drafts and second run created 0. TypeScript validation passed and the existing loader retrieved the richer Wyatt as preview-only with six proposed section items, zero approved facts/rules/records.

The running student server still hardcodes the original CSV Wyatt. This import does not switch existing encounters or change the AI prompt. Next integration must explicitly choose the desired source patient, consume proposed section values only in a restricted development preview, and keep teaching objectives, assumptions and disclosure proposals out of unrestricted patient responses. Do not merge the sources or repoint an existing encounter without preserving its source context.
