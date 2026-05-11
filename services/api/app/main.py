from fastapi import FastAPI

app = FastAPI(
    title="BuildQuote Data Studio API",
    description="Manufacturer data ingestion, verification and publishing service.",
    version="0.1.0",
)


@app.get("/")
def root():
    return {"service": "buildquote-data-studio-api", "status": "placeholder"}


@app.get("/health")
def health():
    return {"status": "ok"}
