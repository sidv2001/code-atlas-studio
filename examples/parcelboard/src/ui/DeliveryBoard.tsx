import type { Shipment } from "../model/shipment";
import { RoutePlanner } from "../domain/RoutePlanner";
import { StatusBadge } from "./StatusBadge";

export function DeliveryBoard({ shipments }: { shipments: readonly Shipment[] }) {
  const nextStop = new RoutePlanner().nextStop(shipments);

  return (
    <section aria-label="Delivery board">
      <h2>Deliveries</h2>
      <p>Next stop: {nextStop ?? "No pending stops"}</p>
      <ul>
        {shipments.map((shipment) => (
          <li>
            {shipment.destination}: <StatusBadge status={shipment.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}
