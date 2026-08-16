# Minecraft Sound Studio

Minecraft Sound Studio is a local-first web app for Minecraft Java resource-pack audio. You can create or import a pack, record or import audio, edit the audio, and export a ready-to-use ZIP.

The app stores project data in your browser. It does not use a server or upload your audio. Stable Java releases from 1.21 onward are supported. Snapshots and Bedrock are not supported.

> This is an unofficial tool. Mojang and Microsoft do not approve it.

## Browser support

The app runs in current versions of Chrome, Edge, Firefox, and Safari. Safari cannot decode Ogg Vorbis audio natively. On Safari, the app decodes vanilla sounds and imported `.ogg` files with a WebAssembly decoder. On iOS, audio playback starts after your first tap on a transport button.

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
