export type ShipmentStatus = "queued" | "in-transit" | "delivered";

export interface Shipment {
  id: string;
  destination: string;
  status: ShipmentStatus;
}

export function statusLabel(status: ShipmentStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "in-transit":
      return "In transit";
    case "delivered":
      return "Delivered";
  }
}
