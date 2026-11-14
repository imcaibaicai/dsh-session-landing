// dsh-session-landing: host-side no-op carrier.
// The capability is browser-only; this loader row must exist host-side so the
// client-modules scan picks up the package's `dsh.client` declaration.
export const name = "dsh-session-landing";

export function apply() {
  // no host behavior
}
