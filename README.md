# Minecraft Sound Studio

Minecraft Sound Studio is a local-first web app for Minecraft Java resource-pack audio. You can create or import a pack, record or import audio, edit the audio, and export a ready-to-use ZIP.

The app stores project data in your browser. It does not use a server or upload your audio. Stable Java releases from 1.21 onward are supported. Snapshots and Bedrock are not supported.

> This is an unofficial tool. Mojang and Microsoft do not approve it.

## Develop

Use Node.js 22 or 24.

```sh
npm install
npm run dev
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

## Check

```sh
npm run check
npm run test:e2e
```

Run `npm run build` to create the static site in `dist/`.
