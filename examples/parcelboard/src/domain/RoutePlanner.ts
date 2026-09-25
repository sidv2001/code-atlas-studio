import type { Shipment } from "../model/shipment";

export class RoutePlanner {
  nextStop(shipments: readonly Shipment[]): string | undefined {
    return shipments.find((shipment) => shipment.status !== "delivered")
      ?.destination;
  }
}
