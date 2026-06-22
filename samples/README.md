# samples

Sample documents and expected outputs for testing and developing the extraction pipeline.

```
source-documents/    Real or anonymised manufacturer PDFs for pipeline testing
expected-outputs/    Hand-verified JSON outputs for the above source documents
```

## Usage

Place a sample manufacturer PDF in `source-documents/`.
Place the hand-verified expected extraction output in `expected-outputs/` with a matching filename.
Use these pairs to evaluate and tune extraction prompts.

## Safety Note

Do not commit real manufacturer documents without permission.
Use anonymised or publicly available samples during development.
