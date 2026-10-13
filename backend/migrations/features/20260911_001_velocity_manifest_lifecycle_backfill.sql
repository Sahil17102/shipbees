-- Keep existing Velocity shipments in the new lifecycle:
-- booking creates the shipment/AWB, while pickup request starts only from manifest.
update b2c_orders
set
  pickup_status = 'pending',
  pickup_error = null,
  order_status = case
    when lower(coalesce(order_status, '')) in ('pickup_requested', 'pickup_initiated')
      then 'booked'
    else order_status
  end,
  provider_last_status = case
    when lower(coalesce(provider_last_status, '')) in ('pickup_requested', 'pickup_initiated')
      then 'booked'
    else provider_last_status
  end,
  updated_at = now()
where lower(coalesce(integration_type, '')) = 'velocity'
  and lower(coalesce(order_status, '')) not in ('cancelled', 'canceled', 'delivered', 'rto_delivered')
  and lower(coalesce(pickup_status, '')) in ('pickup_requested', 'pickup_initiated')
  and nullif(btrim(coalesce(manifest, '')), '') is null;
