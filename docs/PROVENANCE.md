# Provenance and collection decisions

AI Buildcraft collects Anand Pareek's applications, reusable skills and learning material in one reviewable repository. The collection was assembled on 2 October 2026 and subsequently curated to 50 substantive learning entries after a depth review. Source repositories and source commits are recorded in each exported package's `SOURCE.json`; the three media migrations also have a detailed `BUILDCRAFT.md`.

## What is included

- Selected tracked source snapshots of independently maintained applications and skills. Earlier Git histories, deployment state and private account data are not imported.
- Local author-maintained Agentlane Diagram and Deck from Template skills, and an ESCI relevance-data preparation lab.
- An author-maintained visual learning library, including additional educational artifacts recovered from the author's Claude account. Platform viewer code, account metadata and authentication state are removed. The learning catalog records per-item provenance.
- Screenshots selected from the author's [portfolio](https://anand-pareek.vercel.app/#projects). These show historical interfaces and prepared examples, and are not proof of new live API runs. They can contain illustrative third-party products and trademarks; no affiliation is implied.

## Changes made for this edition

Demo Studio, Plotline and Jhalak use direct Gemini image APIs; Plotline and Jhalak use Veo for video. This is a code and configuration migration, with mocked HTTP contract tests, rather than a rename of an existing provider. See each app's verification receipt.

Application examples and operational documentation were reviewed to remove former employer identifiers, internal architecture, hosted resource IDs, machine paths and private business material. Brand-analysis fixtures now use fictional examples. The explicitly retained PixelBin Claude Skill describes the public PixelBin API; it contains no private company context.

Notebook outputs are cleared. Model results retained in prose are labeled historical, illustrative or scoped to the original experiment. They are not presented as newly reproduced benchmarks.

## Excluded material

Personal knowledge-base contents, session histories, credentials, account exports, operational receipts, employer architecture and pricing documents, internal business datasets, copied course archives and unverified third-party projects are excluded. Large runtime downloads and generated data generally remain outside Git. LLM Anatomy carries a small documented set of redistributable teaching/model assets under its own notices.

The learning collection preserves public references and framework attribution. AI assistance was used in the development of source projects and educational material. Authorship of a lesson does not imply authorship of the underlying algorithm or third-party example it explains.

## Why this structure

The collection is organized around building, inspecting, evaluating and understanding AI systems. It includes runnable source and local learning pages, with evidence and limitations beside them. A large link-only list was rejected because it would make readers leave the collection before they could inspect how a project works.

Original repositories and deployed applications were left unchanged. The new repository remains private until the owner separately approves publication.
