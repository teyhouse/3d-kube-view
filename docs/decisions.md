# Decisions and gotchas

## Decisions

- **Local only.** The app runs on a workstation with `kubectl` access. Running it in the cluster with a ServiceAccount and Hubble Relay is not a goal.
- **Everything comes through `kubectl`.** Nothing is installed in the cluster.
- **The API only answers on localhost.** Requests to `/api/` with any other `Host` header get a 403, which blocks DNS rebinding from a malicious website.
- **Districts come from Flux.** Namespace labels are nearly all the same (`kustomize...name=namespaces`), the top level directory of the Kustomization `spec.path` is meaningful. Clusters without Flux get `system` and `other`.
- **Gates are inferred.** A flow uses a gate when its destination pod and port match a service backend and `targetPort`. Node probes and replies skip the gate.
- **Tags instead of parcel stickers.** Floating tags turned out more readable for DNS and HTTP.
- **Machines are not instanced.** Lifecycle animations move them individually and far rooms hide them. Frame rate has been stable, so this stays until a close-up gets slow.
- **Filter state is per session.** Saved views keep selection, district mode and camera, but not legend filters.

## Gotchas

### `kubectl exec` leaks without a TTY

When `kubectl exec` ends, the remote command keeps running in the pod and keeps consuming events. Remote commands therefore run under a watchdog that ends them when stdin closes, see `REMOTE_WATCHDOG` in `server/kubectl.js`. Any manual `kubectl exec ... hubble observe --follow` or `tetra getevents` leaks the same way.

### `tetra getevents` reads stdin when it is a pipe

With a pipe on stdin it reads events from there instead of from the agent, and delivers nothing while looking healthy. The watchdog keeps the pipe and gives the command `/dev/null`.

### `SIGTERM` is not always enough

Orphaned `tetra` processes with a blocked stdout ignored `SIGTERM`, so the watchdog follows up with `SIGKILL` after 3 seconds.

### Empty rules mean opposite things

In Cilium `ingress: [{}]` is default deny. In a Kubernetes NetworkPolicy the same shape allows everything. Compare with the agent when changing `policies.js`:

```bash
kubectl exec -n kube-system ds/cilium -c cilium-agent -- cilium-dbg endpoint list -o json
```

`status.policy.realized.policy-enabled` shows what is enforced, this matched 44 of 44 pods with an endpoint. It confirms enforcement on or off, not restricted versus open.

### Hubble rarely sets `destination_service`

It appeared on 2 of 1500 sampled flows, both `SOCK` traces without a destination pod. `SOCK` traces are ignored because they would otherwise appear as Internet traffic.

### Control plane and data plane look alike

`envoy-gateway` is the control plane. The data plane pods carry `gateway.envoyproxy.io/owning-gateway-name`, so entry points use labels first. Name matching is only used for tunnels.

### Tunnels dial out

A tunnel such as `cloudflared` receives its traffic over outbound connections, so its flows appear as pod to Internet. The dock routes both directions through the bay.

### One missing kind fails a whole `kubectl get`

`kubectl get a,b` errors out if `b` is not installed. Optional kinds are therefore fetched one by one with `listAll`.

### Three.js

`PCFSoftShadowMap` was removed in the installed version, `PCFShadowMap` is used instead. The raycaster also tests invisible objects, so `Picker` checks visibility itself.
