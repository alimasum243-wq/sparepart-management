-- MIGRATION 011: minimum-stock alert and business seed master data.
-- Seed SKUs are temporary codes; owner must finalize SKU/unit and retail price before go-live.

ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock DECIMAL(15,3) NOT NULL DEFAULT 0;

INSERT INTO suppliers (supplier_code,supplier_name,is_active)
SELECT 'SEED-INDORAYA','INDORAYA',1 WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE supplier_name='INDORAYA');
INSERT INTO suppliers (supplier_code,supplier_name,is_active)
SELECT 'SEED-ADI-JUWANA','UD ADI JUWANA',1 WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE supplier_name='UD ADI JUWANA');

INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-001','Tatakan Rinai K4','pcs',9000,9000,9000,9500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Tatakan Rinai K4');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-002','Tatakan Rinai K6','pcs',10000,10000,10000,10500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Tatakan Rinai K6');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-003','Tatakan Multi Bulat','pcs',9000,9000,9000,9500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Tatakan Multi Bulat');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-004','Tatakan Quantum Bulat','pcs',9000,9000,9000,9500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Tatakan Quantum Bulat');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-005','Catok Pengaman','pcs',6500,6500,6500,7000,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Catok Pengaman');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-006','Tatakan Hock','pcs',13500,13500,13500,14000,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Tatakan Hock');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-007','Tungku Todachi','pcs',8500,8500,8500,9000,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Tungku Todachi');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-008','Klem Stenlis','pcs',600,600,600,650,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Klem Stenlis');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-009','Klem Kupu','pcs',850,850,850,900,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Klem Kupu');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-010','Burner Rinnai RK Super 90gr','pcs',17000,17000,17000,17500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Burner Rinnai RK Super 90gr');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-011','Burner RK 31 40gr','pcs',8000,8000,8000,8500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Burner RK 31 40gr');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-012','Burner Rinnai RK Super 55gr','pcs',9000,9000,9000,9500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Burner Rinnai RK Super 55gr');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-013','Burner Rinnai RB 85gr','pcs',13000,13000,13000,13500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Burner Rinnai RB 85gr');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-014','Tungku RK STC','pcs',9000,9000,9000,9500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Tungku RK STC');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-015','Tungku Set','pcs',8000,8000,8000,8500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Tungku Set');
INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,min_stock,is_active)
SELECT 'SEED-016','Burner RK W1','pcs',13000,13000,13000,13500,0,0,1 WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name='Burner RK W1');

INSERT INTO product_price_history (product_id,effective_date,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,source)
SELECT p.id,CURRENT_DATE,p.purchase_cost,p.last_purchase_cost,p.average_cost,p.distributor_price,p.retail_price,'SEED' FROM products p WHERE p.sku LIKE 'SEED-%' AND NOT EXISTS (SELECT 1 FROM product_price_history h WHERE h.product_id=p.id AND h.source='SEED');
