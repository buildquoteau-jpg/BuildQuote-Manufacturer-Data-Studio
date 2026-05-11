# Prompt: Verification Assistant

**Status: placeholder — refine after first verification UI build.**

---

## Purpose

Assist human reviewers in spotting discrepancies between the original source document and the AI-generated system card during visual verification.

## Usage Context

This prompt is used optionally during Phase 5 (Visual Verification UI) to surface potential issues before the human makes their approve/reject decision.

## Expected Input

- `source_text`: the raw extracted text/table from the relevant source page
- `generated_card`: the AI-suggested system card record (JSON)

## Expected Output

A plain-language summary of:
1. Fields that look consistent with the source
2. Fields that look uncertain or inconsistent
3. Fields that appear to be missing from the source

## Prompt Template

```
You are assisting a human reviewer verifying AI-extracted manufacturer data against the original source document.

Source content:
{{source_text}}

AI-generated record:
{{generated_card}}

Compare the two. Report:
1. Which fields appear consistent with the source (brief, bullet list)
2. Which fields appear uncertain, inconsistent, or possibly wrong (brief, bullet list)
3. Which fields appear absent from the source (brief, bullet list)

Be concise. The human makes the final call — your role is to surface potential issues, not to make decisions.
```
