from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import httpx

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

EXA_KEY = "02a9604e-9b89-4692-a1db-46ed63d69ed1"

@app.post("/search")
async def search(body: dict):
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(
            "https://api.exa.ai/search",
            headers={
                "x-api-key": EXA_KEY,
                "Content-Type": "application/json",
            },
            json={
    "query": body.get("q"),
    "numResults": 6,
    "useAutoprompt": True,
    "startPublishedDate": "2026-01-01",  # ✅ faqat 2026 yil
    "contents": {
        "text": {
            "maxCharacters": 2000,
        }
    },
},
        )
        data = res.json()

    results = data.get("results", [])
    
    # Matnni to'liq qaytaradi
    formatted = "\n\n---\n\n".join([
        f"Source: {r.get('title', '')}\n{r.get('text', '') or r.get('summary', 'No content')}"
        for r in results
    ])

    return {
        "results": [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "text": r.get("text", "") or r.get("summary", "")
            }
            for r in results
        ],
        "formatted": formatted
    }