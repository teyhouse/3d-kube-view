# Known limits

## Not yet seen on real data

The development cluster did not produce these, they only ran against mock data:

- More than one node.
- Policy drops and their signs.
- HTTP flows, because no L7 HTTP policy is active.
- TracingPolicy alerts on real events.
- Inbound Internet traffic to `traefik` or the Envoy gateway. Depending on how the LoadBalancer is implemented, it may appear as coming from the node, and then it does not pass through the dock.

## Rough edges

- Machines and conveyors are individual meshes, a large room in close-up costs a few hundred draw calls.
- Tubes can pass through tall walls at long range.
- Floating tags on the same machine can overlap.
- `privileged exec` alerts fire for anything with `CAP_SYS_ADMIN`, which includes the Cilium and Tetragon agents themselves. There is no way to mute them yet.

## Behavior to expect

- Replay uses the current topology. Pods that are gone route to the hatch of their room.
- Replay only covers what this browser received since it opened, at most 5 minutes and 120000 items.
- Hidden namespaces are not streamed, so their activity dots only react to traffic that touches a visible namespace, and replay has no data for them.
- Tetragon events without a pod (host processes) are ignored.
- Entry point detection for tunnels depends on the workload name (`cloudflared`, `tailscale`, `ngrok`, `frpc`, `inlets`).

## Security

- The server listens on `127.0.0.1`, but does not check the `Host` header. A malicious website could use DNS rebinding to read `/api/events` from the browser while the app runs, which exposes topology, flows and process events.
