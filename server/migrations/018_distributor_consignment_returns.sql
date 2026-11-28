-- 018: Distributor returns of unsold consignment stock, owner approval required.
-- Additive schema only. Requests do not move stock or affect accounting until approved.
CREATE TABLE IF NOT EXISTS distributor_consignment_return_requests (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  request_code VARCHAR(60) NOT NULL,
  distributor_id BIGINT NOT NULL,
  request_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  notes VARCHAR(1000) NULL,
  submitted_by_user_id BIGINT NULL,
  reviewed_by_user_id BIGINT NULL,
  reviewed_at TIMESTAMP NULL,
  rejection_reason VARCHAR(1000) NULL,
  posted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_consignment_return_request_code (request_code),
  KEY idx_consignment_return_distributor_status (distributor_id,status,request_date),
  KEY idx_consignment_return_status_date (status,request_date)
);
CREATE TABLE IF NOT EXISTS distributor_consignment_return_request_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  request_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  product_name_snapshot VARCHAR(150) NOT NULL,
  quantity DECIMAL(15,3) NOT NULL,
  item_condition VARCHAR(20) NOT NULL,
  unit_cost_snapshot DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_consignment_return_request_item (request_id,product_id,item_condition),
  KEY idx_consignment_return_item_product (product_id)
);
