-- PERFORMANCE INDEXES
-- Run after 003_employee_custom_tables.sql
-- Target: query-critical columns missing indexes (December 2025 audit)

-- ============================================================
-- 1. STATUS INDEXES (frequently filtered by status)
-- ============================================================
CREATE INDEX IF NOT EXISTS ix_production_entries_status ON production_entries(status);
CREATE INDEX IF NOT EXISTS ix_production_entries_shift ON production_entries(shift);
CREATE INDEX IF NOT EXISTS ix_production_entries_date_machine ON production_entries(date, machine_code);
CREATE INDEX IF NOT EXISTS ix_production_machines_status ON machines(status);

CREATE INDEX IF NOT EXISTS ix_quality_tests_status ON quality_tests(status);
CREATE INDEX IF NOT EXISTS ix_quality_tests_type ON quality_tests(type);
CREATE INDEX IF NOT EXISTS ix_quality_approvals_status ON quality_approvals(status);

CREATE INDEX IF NOT EXISTS ix_lots_status ON lots(status);
CREATE INDEX IF NOT EXISTS ix_lots_type ON lots(type);
CREATE INDEX IF NOT EXISTS ix_lots_mill_status ON lots(mill_id, status);

CREATE INDEX IF NOT EXISTS ix_attendance_status ON attendance(status);
CREATE INDEX IF NOT EXISTS ix_attendance_employee_date ON attendance(employee_id, date);
CREATE INDEX IF NOT EXISTS ix_attendance_mill_date ON attendance(mill_id, date);

CREATE INDEX IF NOT EXISTS ix_leaves_status ON leaves(status);
CREATE INDEX IF NOT EXISTS ix_leaves_employee ON leaves(employee_id, status);

CREATE INDEX IF NOT EXISTS ix_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS ix_invoices_type ON invoices(type);
CREATE INDEX IF NOT EXISTS ix_invoices_mill_status ON invoices(mill_id, status);

CREATE INDEX IF NOT EXISTS ix_sales_orders_status ON sales_orders(status);
CREATE INDEX IF NOT EXISTS ix_sales_orders_mill_status ON sales_orders(mill_id, status);

CREATE INDEX IF NOT EXISTS ix_dispatch_orders_mill_date ON dispatches(mill_id, date);

CREATE INDEX IF NOT EXISTS ix_cotton_purchases_status ON cotton_purchases(status);
CREATE INDEX IF NOT EXISTS ix_grn_entries_status ON grn_entries(status);
CREATE INDEX IF NOT EXISTS ix_grn_entries_date ON grn_entries(date);

-- ============================================================
-- 2. FK INDEXES (for JOIN performance)
-- ============================================================
CREATE INDEX IF NOT EXISTS ix_payroll_months_processed_by ON payroll_months(processed_by);
CREATE INDEX IF NOT EXISTS ix_payroll_months_approved_by ON payroll_months(approved_by);
CREATE INDEX IF NOT EXISTS ix_payslip_entries_mill_id ON payslip_entries(mill_id);

CREATE INDEX IF NOT EXISTS ix_trips_sales_order_id ON trips(sales_order_id);
CREATE INDEX IF NOT EXISTS ix_trips_vehicle_id ON trips(vehicle_id);
CREATE INDEX IF NOT EXISTS ix_trips_customer_id ON trips(customer_id);
CREATE INDEX IF NOT EXISTS ix_trips_loader_id ON trips(loader_id);

CREATE INDEX IF NOT EXISTS ix_stock_transfers_from_wh ON stock_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS ix_stock_transfers_to_wh ON stock_transfers(to_warehouse_id);

CREATE INDEX IF NOT EXISTS ix_sales_orders_confirmed_by ON sales_orders(confirmed_by);
CREATE INDEX IF NOT EXISTS ix_sales_orders_cancelled_by ON sales_orders(cancelled_by);

CREATE INDEX IF NOT EXISTS ix_gst_entries_invoice_id ON gst_entries(invoice_id);

CREATE INDEX IF NOT EXISTS ix_bale_stock_purchase_id ON bale_stock(purchase_id);
CREATE INDEX IF NOT EXISTS ix_bale_stock_status ON bale_stock(status);
CREATE INDEX IF NOT EXISTS ix_bale_stock_bale_no ON bale_stock(bale_no);

CREATE INDEX IF NOT EXISTS ix_grn_entries_purchase_id ON grn_entries(purchase_id);

CREATE INDEX IF NOT EXISTS ix_employee_shifts_employee_id ON employee_shifts(employee_id);

CREATE INDEX IF NOT EXISTS ix_import_mappings_mill_id ON import_mappings(mill_id);
CREATE INDEX IF NOT EXISTS ix_column_dropdown_options_mill_id ON column_dropdown_options(mill_id);

-- ============================================================
-- 3. COMPOSITE INDEXES (for common query patterns)
-- ============================================================
CREATE INDEX IF NOT EXISTS ix_employees_mill_department ON employees(mill_id, department);
CREATE INDEX IF NOT EXISTS ix_employees_mill_active ON employees(mill_id, is_active);

CREATE INDEX IF NOT EXISTS ix_monthly_payroll_month_year ON monthly_payroll(month, year);
CREATE INDEX IF NOT EXISTS ix_monthly_payroll_employee_month ON monthly_payroll(employee_id, month, year);

CREATE INDEX IF NOT EXISTS ix_downtime_logs_machine_started ON downtime_logs(machine_code, started_at);

-- ============================================================
-- 4. LOTRAC TABLE INDEXES (heavy query traffic)
-- ============================================================
CREATE INDEX IF NOT EXISTS ix_trips_mill_status_created ON trips(mill_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_trips_vehicle_no ON trips(vehicle_no);
CREATE INDEX IF NOT EXISTS ix_trips_driver_name ON trips(driver_name);
CREATE INDEX IF NOT EXISTS ix_trip_items_lot_id ON trip_items(lot_id);
CREATE INDEX IF NOT EXISTS ix_trip_scan_logs_scan_type ON trip_scan_logs(scan_type);

-- ============================================================
-- 5. EMPLOYEE CUSTOM FIELD INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS ix_employee_custom_values_field_id ON employee_custom_values(field_id);
