# Video Wizard Slideshow Generator

A local browser app for turning selected photos and optional music into an MP4 slideshow. Motion frames are rendered client-side with Canvas, then encoded locally with `ffmpeg.wasm`; selected media is not uploaded to a server.

## Run

```bash
python3 server.py
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765).

If port `8765` is busy, the server prints the next available local URL.

The app uses the browser File System Access API for direct output saving when available. In browsers without that API, it falls back to a standard browser download.
