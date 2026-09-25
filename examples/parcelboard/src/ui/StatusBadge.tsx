import { statusLabel, type ShipmentStatus } from "../model/shipment";

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  return <span>{statusLabel(status)}</span>;
}
