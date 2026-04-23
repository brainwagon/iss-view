# TODO — Future Enhancements

- **Smaller textured ISS model.** The current `iss-high.glb` is 91 MB (in LFS). Find or produce a decimated version that keeps the texture detail — target ~10–20 MB — so first-load time on slow connections is bearable and LFS bandwidth stays reasonable. `iss.glb` (~5 MB) is an untextured fallback.

- **Live cloud layer.** Replace the static `8k_earth_clouds.jpg` with a periodically-fetched composite from a live imagery source (e.g. GIBS/Worldview IR or visible daily mosaic). Cache in IndexedDB with a sensible TTL.

- **Moon surface texture.** The moon is currently a flat gray sphere. Add a lunar surface map and adjust material so the terminator shows terrain relief.

- **Next-pass predictor.** Given a user lat/lon, compute upcoming ISS passes (AOS / max elevation / LOS) from the cached TLE and show them in a small panel.

- **Earth shadow cone visualization.** Draw the umbra/penumbra cone in 3D when the ISS is near an eclipse boundary — makes the sunlight modulation self-explanatory.

- **Additional satellites.** Generalize the tracker to accept multiple TLEs (Tiangong, Hubble, Starlink subset) with per-object toggles.

- **Time scrubber.** Slider to rewind/fast-forward the simulated clock, with the ground track, lighting, moon position, and ISS orientation all following.

- **Quality presets.** Low/medium/high toggle for shadow map size, Earth texture resolution, and star count — the default is tuned for a decent desktop GPU.

- **Asset hosting off LFS.** Move the ISS model to a CDN / releases asset and fetch at runtime so the repo checkout itself stays small even without LFS set up.
