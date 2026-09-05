import { AwaitingService } from '../shared/AwaitingService'

/**
 * Corporate accounts, from the backoffice's side.
 *
 * The data exists — orbit-enterprise-bff owns corporate accounts, their cost centres and
 * their booking approvals — but it is reachable only over that BFF's own REST surface.
 * This console does not call it directly and should not: a backoffice that fans out to
 * another front end's BFF inherits its auth model, its shapes and its outages, and there
 * would then be two products deciding what a corporate account is.
 */
export function CorporatePage() {
  return (
    <AwaitingService
      title="Corporate"
      what="Corporate accounts are owned by the enterprise service. The backoffice reaches every other domain through one BFF over gRPC, and there is no such surface for corporate yet — so rather than have this console reach sideways into another front end's API, the page waits for one."
      needs={[
        'A gRPC surface on the enterprise service for accounts, cost centres and their booking policies',
        'Admin BFF gateway methods and a /v1/admin/corporate read endpoint in front of it',
      ]}
      insteadHref="/leads"
      insteadLabel="Corporate leads are in Growth →"
    />
  )
}
