# Development

## Running

```bash
./start.sh                              # build and serve on http://127.0.0.1:8080
./start.sh dev                          # Vite with hot reload on http://127.0.0.1:5173
NAMESPACES=auth,whoami ./start.sh       # optional allowlist, default is all namespaces
KUBE_CONTEXT=my-ctx PORT=9000 ./start.sh
```

## Screenshots

A headless Chromium lives in `.browser/` (gitignored, including system libraries it needs, so no root is required).

```bash
npm run setup:browser
npm run screenshot -- http://127.0.0.1:8080/
```

Images land in `screenshots/`. README images live in `assets/`.

Headless rendering is software only, at a few frames per second. Time is capped per frame, so the scene plays in slow motion and parcel counts and rates read high. Use a real browser and the panel at the bottom right for performance numbers.

## Testing without the cluster

Some behavior needs events the cluster rarely produces. A small SSE server that serves `dist/` and sends scripted `config`, `topology`, `status`, `flows` and `process` events covers pod lifecycle, drops, HTTP, alerts and multiple nodes. The event shapes are defined by `server/topology.js`, `server/hubble.js` and `server/tetragon.js`.

## Checks after touching streams

- Events must really arrive, a green status chip only means the process started. The `proc/s` value should move on a cluster with activity.
- After closing the browser and waiting 15 seconds, nothing may be left in the pods:

```bash
kubectl exec -n kube-system ds/cilium -c cilium-agent -- sh -c 'for p in /proc/[0-9]*; do tr "\0" " " < $p/cmdline 2>/dev/null; echo; done' | grep "hubble observe"
kubectl exec -n kube-system ds/tetragon -c tetragon -- sh -c 'for p in /proc/[0-9]*; do tr "\0" " " < $p/cmdline 2>/dev/null; echo; done' | grep "tetra getevents"
```
