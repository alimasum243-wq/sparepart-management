-- 019: print/reprint audit for distributor consignment delivery notes.
CREATE TABLE IF NOT EXISTS consignment_delivery_print_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  delivery_id BIGINT NOT NULL,
  distributor_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  printed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_consignment_print_delivery (delivery_id,printed_at),
  KEY idx_consignment_print_distributor (distributor_id,printed_at)
);
