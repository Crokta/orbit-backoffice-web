import { AwaitingService } from '../shared/AwaitingService'

/**
 * Incidents — rider SOS, collisions, anything with a person at the end of it.
 *
 * There is no incidents domain on the platform. Nothing raises one, stores one or
 * resolves one, so this page cannot be filled in from an existing service the way the
 * others can: an SOS is not a ride state, a fraud case or a compliance item, and folding
 * it into one of those would lose the thing that makes it urgent.
 *
 * Named rather than hidden from the nav, because an operations console that silently
 * has no route for "a rider pressed the panic button" is worse than one that says so.
 */
export function IncidentsPage() {
  return (
    <AwaitingService
      title="Incidents"
      what="Nothing on the platform raises, stores or resolves an incident today. This page is a placeholder for that domain rather than a view of it — an empty incident list would read as 'no incidents', which is a claim this console cannot currently make."
      needs={[
        'An incidents aggregate: raise, acknowledge, assign, resolve, with an audit trail',
        'SOS ingestion from the rider and driver apps through the websocket gateway',
        'A gRPC surface for it, and the admin BFF read endpoint the nav badge already expects',
      ]}
      insteadHref="/rides"
      insteadLabel="Rides in progress →"
    />
  )
}
