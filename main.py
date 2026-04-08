from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from gemilive import mount_gemilive

app = FastAPI(title="gemilive — Dev Demo")

# Two lines to add Gemini Live AI to any FastAPI app
mount_gemilive(app)

# Serve the dev demo UI (not part of the published package)
app.mount("/gemilive-js", StaticFiles(directory="gemilive-js/src"), name="gemilive-js")
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
