-- MIGRATION 011: minimum-stock alert and business seed master data.
-- Seed SKUs are temporary codes; owner must finalize SKU/unit and retail price before go-live.

ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock DECIMAL(15,3) NOT NULL DEFAULT 0;

INSERT INTO suppliers (supplier_code,supplier_name,is_active)
SELECT 'SEED-INDORAYA','INDORAYA',1 WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE supplier_name='INDORAYA')
  AND NOT EXISTS (SELECT 1 FROM suppliers WHERE supplier_code='SEED-INDORAYA');
INSERT INTO suppliers (supplier_code,supplier_name,is_active)
SELECT 'SEED-ADI-JUWANA','UD ADI JUWANA',1 WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE supplier_name='UD ADI JUWANA')
  AND NOT EXISTS (SELECT 1 FROM suppliers WHERE supplier_code='SEED-ADI-JUWANA');

INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-001','Tatakan Rinai K4','pcs',9000,9000,9000,9500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Tatakan Rinai K4')
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku='SEED-001');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-002','Tatakan Rinai K6','pcs',10000,10000,10000,10500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Tatakan Rinai K6')
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku='SEED-002');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-003','Tatakan Multi Bulat','pcs',9000,9000,9000,9500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Tatakan Multi Bulat')
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku='SEED-003');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-004','Tatakan Quantum Bulat','pcs',9000,9000,9000,9500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Tatakan Quantum Bulat')
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku='SEED-004');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-005','Catok Pengaman','pcs',6500,6500,6500,7000,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Catok Pengaman')
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku='SEED-005');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-006','Tatakan Hock','pcs',13500,13500,13500,14000,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Tatakan Hock')
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku='SEED-006');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-007','Tungku Todachi','pcs',8500,8500,8500,9000,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Tungku Todachi')
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku='SEED-007');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-008','Klem Stenlis','pcs',600,600,600,650,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Klem Stenlis')
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku='SEED-008');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-009','Klem Kupu','pcs',850,850,850,900,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Klem Kupu')
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku='SEED-009');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-010','Burner Rinnai RK Super 90gr','pcs',17000,17000,17000,17500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Burner Rinnai RK Super 90gr')
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku='SEED-010');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-011','Burner RK 31 40gr','pcs',8000,8000,8000,8500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Burner RK 31 40gr')
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku='SEED-011');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-012','Burner Rinnai RK Super 55gr','pcs',9000,9000,9000,9500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Burner Rinnai RK Super 55gr')
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku='SEED-012');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-013','Burner Rinnai RB 85gr','pcs',13000,13000,13000,13500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Burner Rinnai RB 85gr')
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku='SEED-013');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-014','Tungku RK STC','pcs',9000,9000,9000,9500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Tungku RK STC')
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku='SEED-014');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-015','Tungku Set','pcs',8000,8000,8000,8500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Tungku Set')
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku='SEED-015');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-016','Burner RK W1','pcs',13000,13000,13000,13500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Burner RK W1')
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku='SEED-016');

INSERT INTO product_price_history (product_id,effective_date,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,source)
SELECT p.id,CURRENT_DATE,p.purchase_cost,p.last_purchase_cost,p.average_cost,p.distributor_price,p.retail_price,'SEED' FROM products p WHERE p.sku LIKE 'SEED-%' AND NOT EXISTS (SELECT 1 FROM product_price_history h WHERE h.product_id=p.id AND h.source='SEED');
