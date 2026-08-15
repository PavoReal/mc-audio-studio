# Third-party notices

Minecraft Sound Studio includes open-source dependencies listed in `package-lock.json`.

The browser Ogg Vorbis encoder is distributed from
`@nikhilbadveli/custom-ogg-encoder` under the MIT License and contains WebAssembly
compiled from the Xiph.Org Foundation's reference `libogg` and `libvorbis`
implementations. The applicable license texts are shipped in:

- `public/licenses/custom-ogg-encoder-MIT.txt`
- `public/licenses/libogg-COPYING.txt`
- `public/licenses/libvorbis-COPYING.txt`

The browser Ogg Vorbis decoder is distributed from
`@wasm-audio-decoders/ogg-vorbis` under the MIT License. The app loads it on
browsers that cannot decode Ogg Vorbis natively (Safari). It contains
WebAssembly compiled from the Xiph.Org Foundation's reference `libogg` and
`libvorbis` implementations. Its `codec-parser` dependency is distributed
under the GNU LGPL 3.0 and its `@eshaz/web-worker` dependency is distributed
under the Apache License 2.0. The applicable license texts are shipped in:

- `public/licenses/wasm-audio-decoders-MIT.txt`
- `public/licenses/codec-parser-LGPL-3.0.txt`
- `public/licenses/web-worker-Apache-2.0.txt`
- `public/licenses/libogg-COPYING.txt`
- `public/licenses/libvorbis-COPYING.txt`

Minecraft is a trademark of Microsoft. This project is an unofficial tool and
is not approved by or associated with Mojang or Microsoft.
