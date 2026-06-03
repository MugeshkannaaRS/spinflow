"""initial_schema — full baseline (auto-generated)

Revision ID: 001
Revises:
Create Date: 2026-06-03
"""

from typing import Sequence, Union
from alembic import op


revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
CREATE TABLE roles (
	id VARCHAR(36) NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	description TEXT, 
	is_system BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
)""")
    op.execute("""CREATE UNIQUE INDEX ix_roles_code ON roles (code)""")
    op.execute("""
CREATE TABLE inventory_items (
	id VARCHAR(36) NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	type VARCHAR(50) NOT NULL, 
	unit VARCHAR(20) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
)""")
    op.execute("""CREATE UNIQUE INDEX ix_inventory_items_code ON inventory_items (code)""")
    op.execute("""
CREATE TABLE vehicles (
	id VARCHAR(36) NOT NULL, 
	vehicle_no VARCHAR(50) NOT NULL, 
	driver_name VARCHAR(200), 
	driver_phone VARCHAR(20), 
	transporter VARCHAR(200), 
	is_active BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (vehicle_no)
)""")
    op.execute("""
CREATE TABLE qr_scans (
	id VARCHAR(36) NOT NULL, 
	token VARCHAR(500) NOT NULL, 
	entity_type VARCHAR(50) NOT NULL, 
	entity_id VARCHAR(36) NOT NULL, 
	station VARCHAR(100) NOT NULL, 
	scanned_by VARCHAR(200), 
	scanned_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	location VARCHAR(200), 
	PRIMARY KEY (id)
)""")
    op.execute("""CREATE INDEX ix_qr_scans_token ON qr_scans (token)""")
    op.execute("""
CREATE TABLE suppliers (
	id VARCHAR(36) NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	contact_person VARCHAR(200), 
	phone VARCHAR(20), 
	email VARCHAR(200), 
	address TEXT, 
	city VARCHAR(100), 
	state VARCHAR(100), 
	gstin VARCHAR(15), 
	grade VARCHAR(10), 
	status BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (code)
)""")
    op.execute("""CREATE INDEX ix_suppliers_name ON suppliers (name)""")
    op.execute("""
CREATE TABLE cotton_bales (
	id VARCHAR(36) NOT NULL, 
	bale_number VARCHAR(50) NOT NULL, 
	supplier VARCHAR(200) NOT NULL, 
	lot_number VARCHAR(100), 
	date_received VARCHAR(10) NOT NULL, 
	micronaire FLOAT NOT NULL, 
	staple_length FLOAT, 
	strength FLOAT, 
	uniformity FLOAT, 
	short_fiber_index FLOAT, 
	moisture FLOAT, 
	trash_area FLOAT, 
	trash_grade INTEGER, 
	color_grade VARCHAR(20), 
	reflectance FLOAT, 
	yellowness FLOAT, 
	elongation FLOAT, 
	maturity FLOAT, 
	sci FLOAT, 
	quality_index FLOAT, 
	category VARCHAR(10), 
	status VARCHAR(20) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
)""")
    op.execute("""CREATE UNIQUE INDEX ix_cotton_bales_bale_number ON cotton_bales (bale_number)""")
    op.execute("""CREATE INDEX ix_cotton_bales_category ON cotton_bales (category)""")
    op.execute("""CREATE INDEX ix_cotton_bales_lot_number ON cotton_bales (lot_number)""")
    op.execute("""CREATE INDEX ix_cotton_bales_status ON cotton_bales (status)""")
    op.execute("""CREATE INDEX ix_cotton_bales_supplier ON cotton_bales (supplier)""")
    op.execute("""
CREATE TABLE vendors (
	id VARCHAR(36) NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	contact VARCHAR(100), 
	phone VARCHAR(20), 
	email VARCHAR(200), 
	category VARCHAR(100), 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (code)
)""")
    op.execute("""
CREATE TABLE document_attachments (
	id VARCHAR(36) NOT NULL, 
	entity_type VARCHAR(50) NOT NULL, 
	entity_id VARCHAR(36) NOT NULL, 
	file_name VARCHAR(500) NOT NULL, 
	file_size INTEGER NOT NULL, 
	mime_type VARCHAR(100) NOT NULL, 
	file_path VARCHAR(1000) NOT NULL, 
	uploaded_by VARCHAR(200), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
)""")
    op.execute("""CREATE INDEX ix_document_attachments_entity_id ON document_attachments (entity_id)""")
    op.execute("""CREATE INDEX ix_document_attachments_entity_type ON document_attachments (entity_type)""")
    op.execute("""
CREATE TABLE maintenance_schedule (
	id VARCHAR(36) NOT NULL, 
	machine_code VARCHAR(50) NOT NULL, 
	type VARCHAR(50) NOT NULL, 
	frequency_days INTEGER NOT NULL, 
	description TEXT, 
	last_done VARCHAR(10), 
	next_due VARCHAR(10), 
	is_active BOOLEAN NOT NULL, 
	PRIMARY KEY (id)
)""")
    op.execute("""
CREATE TABLE technicians (
	id VARCHAR(36) NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	phone VARCHAR(20), 
	specialization VARCHAR(200), 
	is_active BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (code)
)""")
    op.execute("""
CREATE TABLE machine_parameters (
	id VARCHAR(36) NOT NULL, 
	machine_code VARCHAR(50) NOT NULL, 
	parameter_name VARCHAR(200) NOT NULL, 
	standard_value VARCHAR(100), 
	min_value VARCHAR(100), 
	max_value VARCHAR(100), 
	unit VARCHAR(50), 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
)""")
    op.execute("""CREATE INDEX ix_machine_parameters_machine_code ON machine_parameters (machine_code)""")
    op.execute("""
CREATE TABLE companies (
	id VARCHAR(36) NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	gstin VARCHAR(20), 
	address TEXT, 
	phone VARCHAR(20), 
	email VARCHAR(200), 
	logo_url VARCHAR(500), 
	max_users INTEGER NOT NULL, 
	plan VARCHAR(50) NOT NULL, 
	max_employees INTEGER NOT NULL, 
	licence_fee NUMERIC(12, 2), 
	maintenance_fee NUMERIC(12, 2), 
	billing_cycle VARCHAR(20) NOT NULL, 
	plan_started_at TIMESTAMP WITH TIME ZONE, 
	plan_expires_at TIMESTAMP WITH TIME ZONE, 
	addons JSON, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
)""")
    op.execute("""CREATE UNIQUE INDEX ix_companies_code ON companies (code)""")
    op.execute("""
CREATE TABLE column_configs (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	module VARCHAR(50) NOT NULL, 
	table_key VARCHAR(50) NOT NULL, 
	columns TEXT NOT NULL, 
	updated_by VARCHAR(200), 
	placeholder_text VARCHAR(200), 
	help_text VARCHAR(500), 
	validation_regex VARCHAR(200), 
	min_value NUMERIC, 
	max_value NUMERIC, 
	default_value TEXT, 
	group_name VARCHAR(100), 
	is_searchable BOOLEAN, 
	is_sortable BOOLEAN, 
	is_exportable BOOLEAN, 
	is_importable BOOLEAN, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
)""")
    op.execute("""CREATE INDEX ix_column_configs_mill_id ON column_configs (mill_id)""")
    op.execute("""
CREATE TABLE column_dropdown_options (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	column_key VARCHAR(100) NOT NULL, 
	table_name VARCHAR(100) NOT NULL, 
	option_value VARCHAR(200) NOT NULL, 
	option_label VARCHAR(200) NOT NULL, 
	display_order INTEGER, 
	is_active BOOLEAN, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	PRIMARY KEY (id)
)""")
    op.execute("""
CREATE TABLE import_mappings (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	table_name VARCHAR(100) NOT NULL, 
	excel_header VARCHAR(200) NOT NULL, 
	spinflow_field VARCHAR(100), 
	is_custom_field BOOLEAN DEFAULT 'false', 
	confidence NUMERIC(5, 2), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	PRIMARY KEY (id), 
	CONSTRAINT uq_import_mapping UNIQUE (mill_id, table_name, excel_header)
)""")
    op.execute("""
CREATE TABLE users (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	email VARCHAR(200) NOT NULL, 
	phone VARCHAR(20), 
	company_id VARCHAR(36), 
	password_hash VARCHAR(255) NOT NULL, 
	role_id VARCHAR(36) NOT NULL, 
	department VARCHAR(100), 
	mill_id VARCHAR(36), 
	mill_name VARCHAR(200), 
	is_active BOOLEAN NOT NULL, 
	last_login TIMESTAMP WITH TIME ZONE, 
	force_password_reset BOOLEAN NOT NULL, 
	must_change_password BOOLEAN NOT NULL, 
	failed_login_attempts INTEGER NOT NULL, 
	locked_until TIMESTAMP WITH TIME ZONE, 
	otp_code VARCHAR(10), 
	otp_expires_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	deleted_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(role_id) REFERENCES roles (id)
)""")
    op.execute("""CREATE INDEX ix_users_role_id ON users (role_id)""")
    op.execute("""CREATE INDEX ix_users_name ON users (name)""")
    op.execute("""CREATE INDEX ix_users_company_id ON users (company_id)""")
    op.execute("""CREATE INDEX ix_users_mill_id ON users (mill_id)""")
    op.execute("""CREATE UNIQUE INDEX ix_users_email ON users (email)""")
    op.execute("""
CREATE TABLE employee_custom_fields (
	id VARCHAR(36) NOT NULL, 
	company_id VARCHAR(36) NOT NULL, 
	field_name VARCHAR(100) NOT NULL, 
	field_type VARCHAR(20) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(company_id) REFERENCES companies (id)
)""")
    op.execute("""CREATE INDEX ix_employee_custom_fields_company_id ON employee_custom_fields (company_id)""")
    op.execute("""
CREATE TABLE maintenance_logs (
	id VARCHAR(36) NOT NULL, 
	date VARCHAR(10) NOT NULL, 
	type VARCHAR(50) NOT NULL, 
	machine_code VARCHAR(50) NOT NULL, 
	department VARCHAR(100), 
	description TEXT NOT NULL, 
	technician_id VARCHAR(36), 
	technician_name VARCHAR(200), 
	status VARCHAR(20) NOT NULL, 
	completed_at TIMESTAMP WITH TIME ZONE, 
	spare_used VARCHAR(500), 
	downtime_min INTEGER NOT NULL, 
	cost FLOAT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(technician_id) REFERENCES technicians (id)
)""")
    op.execute("""CREATE INDEX ix_maintenance_logs_status ON maintenance_logs (status)""")
    op.execute("""CREATE INDEX ix_maintenance_logs_machine_code ON maintenance_logs (machine_code)""")
    op.execute("""CREATE INDEX ix_maintenance_logs_date ON maintenance_logs (date)""")
    op.execute("""
CREATE TABLE mills (
	id VARCHAR(36) NOT NULL, 
	company_id VARCHAR(36) NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	address TEXT, 
	city VARCHAR(100), 
	state VARCHAR(100), 
	pincode VARCHAR(10), 
	phone VARCHAR(20), 
	email VARCHAR(200), 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(company_id) REFERENCES companies (id)
)""")
    op.execute("""CREATE UNIQUE INDEX ix_mills_code ON mills (code)""")
    op.execute("""CREATE INDEX ix_mills_company_id ON mills (company_id)""")
    op.execute("""
CREATE TABLE user_sessions (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	refresh_token TEXT NOT NULL, 
	device_info VARCHAR(500), 
	ip_address VARCHAR(50), 
	is_active BOOLEAN NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)""")
    op.execute("""CREATE INDEX ix_user_sessions_user_id ON user_sessions (user_id)""")
    op.execute("""
CREATE TABLE audit_logs (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	user_name VARCHAR(200), 
	role VARCHAR(50), 
	action VARCHAR(50) NOT NULL, 
	entity VARCHAR(100) NOT NULL, 
	entity_id VARCHAR(36), 
	details TEXT, 
	old_value TEXT, 
	new_value TEXT, 
	ip_address VARCHAR(50), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)""")
    op.execute("""CREATE INDEX ix_audit_logs_action ON audit_logs (action)""")
    op.execute("""CREATE INDEX ix_audit_logs_entity ON audit_logs (entity)""")
    op.execute("""CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at)""")
    op.execute("""CREATE INDEX ix_audit_logs_user_id ON audit_logs (user_id)""")
    op.execute("""
CREATE TABLE shifts (
	id VARCHAR(36) NOT NULL, 
	code VARCHAR(10) NOT NULL, 
	name VARCHAR(50) NOT NULL, 
	start_time VARCHAR(5) NOT NULL, 
	end_time VARCHAR(5) NOT NULL, 
	mill_id VARCHAR(36), 
	PRIMARY KEY (id), 
	UNIQUE (code), 
	FOREIGN KEY(mill_id) REFERENCES mills (id)
)""")
    op.execute("""CREATE INDEX ix_shifts_mill_id ON shifts (mill_id)""")
    op.execute("""
CREATE TABLE warehouses (
	id VARCHAR(36) NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	mill_id VARCHAR(36), 
	location VARCHAR(200), 
	capacity_bags INTEGER, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (code), 
	FOREIGN KEY(mill_id) REFERENCES mills (id)
)""")
    op.execute("""CREATE INDEX ix_warehouses_mill_id ON warehouses (mill_id)""")
    op.execute("""
CREATE TABLE cotton_purchases (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36), 
	date VARCHAR(10) NOT NULL, 
	invoice_no VARCHAR(100) NOT NULL, 
	supplier_id VARCHAR(36) NOT NULL, 
	supplier_name VARCHAR(200), 
	bales INTEGER NOT NULL, 
	gross_kg FLOAT NOT NULL, 
	net_kg FLOAT NOT NULL, 
	rate_per_kg FLOAT NOT NULL, 
	moisture FLOAT NOT NULL, 
	grade VARCHAR(10), 
	gst_amount FLOAT NOT NULL, 
	invoice_url VARCHAR(500), 
	status VARCHAR(20) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id), 
	FOREIGN KEY(supplier_id) REFERENCES suppliers (id)
)""")
    op.execute("""CREATE INDEX ix_cotton_purchases_mill_id ON cotton_purchases (mill_id)""")
    op.execute("""CREATE INDEX ix_cotton_purchases_date ON cotton_purchases (date)""")
    op.execute("""CREATE INDEX ix_cotton_purchases_supplier_id ON cotton_purchases (supplier_id)""")
    op.execute("""
CREATE TABLE spares (
	id VARCHAR(36) NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	mill_id VARCHAR(36), 
	category VARCHAR(100), 
	stock FLOAT NOT NULL, 
	min_stock FLOAT NOT NULL, 
	unit VARCHAR(20) NOT NULL, 
	location VARCHAR(200), 
	vendor_id VARCHAR(36), 
	vendor_name VARCHAR(200), 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id), 
	FOREIGN KEY(vendor_id) REFERENCES vendors (id)
)""")
    op.execute("""CREATE UNIQUE INDEX ix_spares_code ON spares (code)""")
    op.execute("""CREATE INDEX ix_spares_mill_id ON spares (mill_id)""")
    op.execute("""
CREATE TABLE employees (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36), 
	code VARCHAR(50) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	sl_no INTEGER, 
	employee_id VARCHAR(50), 
	joining_date DATE, 
	gen VARCHAR(10), 
	dob DATE, 
	age INTEGER, 
	gender VARCHAR(10), 
	grade VARCHAR(20), 
	designation VARCHAR(100), 
	section VARCHAR(100), 
	department_name VARCHAR(100), 
	bank_account_no VARCHAR(50), 
	basic NUMERIC(10, 2) NOT NULL, 
	house_rent NUMERIC(10, 2) NOT NULL, 
	medical NUMERIC(10, 2) NOT NULL, 
	conveyance NUMERIC(10, 2) NOT NULL, 
	food_allowance NUMERIC(10, 2) NOT NULL, 
	wages NUMERIC(10, 2) NOT NULL, 
	increment NUMERIC(10, 2) NOT NULL, 
	total_salary NUMERIC(10, 2) NOT NULL, 
	mobile_bill NUMERIC(10, 2) NOT NULL, 
	shift_benefit NUMERIC(10, 2) NOT NULL, 
	wages_of_month NUMERIC(10, 2) NOT NULL, 
	days_of_month INTEGER NOT NULL, 
	department VARCHAR(100), 
	role VARCHAR(100), 
	phone VARCHAR(20), 
	email VARCHAR(200), 
	aadhar VARCHAR(20), 
	address TEXT, 
	doj VARCHAR(10), 
	salary FLOAT NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	daily_wage FLOAT NOT NULL, 
	shift VARCHAR(10), 
	pf_no VARCHAR(50), 
	esic_no VARCHAR(50), 
	bank_account VARCHAR(50), 
	bank_ifsc VARCHAR(20), 
	pf_enrolled BOOLEAN NOT NULL, 
	esic_enrolled BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id)
)""")
    op.execute("""CREATE INDEX ix_employees_mill_id ON employees (mill_id)""")
    op.execute("""CREATE UNIQUE INDEX ix_employees_code ON employees (code)""")
    op.execute("""CREATE INDEX ix_employees_name ON employees (name)""")
    op.execute("""
CREATE TABLE payroll_months (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	month INTEGER NOT NULL, 
	year INTEGER NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	total_employees INTEGER NOT NULL, 
	total_gross FLOAT NOT NULL, 
	total_deductions FLOAT NOT NULL, 
	total_net FLOAT NOT NULL, 
	total_pf FLOAT NOT NULL, 
	total_esic FLOAT NOT NULL, 
	processed_by VARCHAR(36), 
	approved_by VARCHAR(36), 
	paid_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_payroll_month_mill_month_year UNIQUE (mill_id, month, year), 
	FOREIGN KEY(mill_id) REFERENCES mills (id), 
	FOREIGN KEY(processed_by) REFERENCES users (id), 
	FOREIGN KEY(approved_by) REFERENCES users (id)
)""")
    op.execute("""CREATE INDEX ix_payroll_months_mill_id ON payroll_months (mill_id)""")
    op.execute("""
CREATE TABLE invoices (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36), 
	invoice_no VARCHAR(50) NOT NULL, 
	date VARCHAR(10) NOT NULL, 
	customer_name VARCHAR(200) NOT NULL, 
	type VARCHAR(20) NOT NULL, 
	amount FLOAT NOT NULL, 
	gst FLOAT NOT NULL, 
	total FLOAT NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	due_date VARCHAR(10), 
	paid_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id)
)""")
    op.execute("""CREATE UNIQUE INDEX ix_invoices_invoice_no ON invoices (invoice_no)""")
    op.execute("""CREATE INDEX ix_invoices_date ON invoices (date)""")
    op.execute("""CREATE INDEX ix_invoices_mill_id ON invoices (mill_id)""")
    op.execute("""
CREATE TABLE master_departments (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	department_type VARCHAR(50) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id)
)""")
    op.execute("""CREATE INDEX ix_master_departments_code ON master_departments (code)""")
    op.execute("""CREATE INDEX ix_master_departments_mill_id ON master_departments (mill_id)""")
    op.execute("""
CREATE TABLE yarn_counts (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	count VARCHAR(20) NOT NULL, 
	count_value FLOAT NOT NULL, 
	blend VARCHAR(200), 
	twist_per_meter FLOAT, 
	standard_csp FLOAT, 
	standard_u_percent FLOAT, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id)
)""")
    op.execute("""CREATE INDEX ix_yarn_counts_mill_id ON yarn_counts (mill_id)""")
    op.execute("""
CREATE TABLE customers (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	gstin VARCHAR(20), 
	pan VARCHAR(20), 
	billing_address TEXT, 
	shipping_address TEXT, 
	city VARCHAR(100), 
	state VARCHAR(100), 
	pincode VARCHAR(10), 
	contact_person VARCHAR(200), 
	phone VARCHAR(20), 
	email VARCHAR(200), 
	credit_limit FLOAT NOT NULL, 
	payment_terms_days INTEGER NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id)
)""")
    op.execute("""CREATE UNIQUE INDEX ix_customers_code ON customers (code)""")
    op.execute("""CREATE INDEX ix_customers_mill_id ON customers (mill_id)""")
    op.execute("""
CREATE TABLE master_vehicles (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	vehicle_no VARCHAR(50) NOT NULL, 
	vehicle_type VARCHAR(20) NOT NULL, 
	make VARCHAR(100), 
	model VARCHAR(100), 
	capacity_kg FLOAT, 
	driver_name VARCHAR(200), 
	driver_phone VARCHAR(20), 
	driver_license VARCHAR(50), 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id)
)""")
    op.execute("""CREATE UNIQUE INDEX ix_master_vehicles_vehicle_no ON master_vehicles (vehicle_no)""")
    op.execute("""CREATE INDEX ix_master_vehicles_mill_id ON master_vehicles (mill_id)""")
    op.execute("""
CREATE TABLE master_routes (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	origin VARCHAR(200) NOT NULL, 
	destination VARCHAR(200) NOT NULL, 
	distance_km FLOAT, 
	estimated_hours FLOAT, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id)
)""")
    op.execute("""CREATE UNIQUE INDEX ix_master_routes_code ON master_routes (code)""")
    op.execute("""CREATE INDEX ix_master_routes_mill_id ON master_routes (mill_id)""")
    op.execute("""
CREATE TABLE company_modules (
	id VARCHAR(36) NOT NULL, 
	company_id VARCHAR(36) NOT NULL, 
	module_name VARCHAR(100) NOT NULL, 
	is_enabled BOOLEAN NOT NULL, 
	enabled_by VARCHAR(36), 
	enabled_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(company_id) REFERENCES companies (id) ON DELETE CASCADE, 
	FOREIGN KEY(enabled_by) REFERENCES users (id)
)""")
    op.execute("""CREATE INDEX ix_company_modules_company_id ON company_modules (company_id)""")
    op.execute("""
CREATE TABLE mill_settings (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	working_hours_per_day INTEGER NOT NULL, 
	shifts_per_day INTEGER NOT NULL, 
	production_target_kg FLOAT NOT NULL, 
	currency VARCHAR(10) NOT NULL, 
	timezone VARCHAR(50) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id) ON DELETE CASCADE
)""")
    op.execute("""CREATE UNIQUE INDEX ix_mill_settings_mill_id ON mill_settings (mill_id)""")
    op.execute("""
CREATE TABLE machines (
	id VARCHAR(36) NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name VARCHAR(200), 
	machine_type VARCHAR(50), 
	department VARCHAR(100), 
	mill_id VARCHAR(36), 
	department_id VARCHAR(36), 
	serial_no VARCHAR(100), 
	make VARCHAR(100), 
	model VARCHAR(100), 
	spindles INTEGER, 
	installation_date DATE, 
	amc_expiry DATE, 
	status BOOLEAN NOT NULL, 
	current_status VARCHAR(20) NOT NULL, 
	target_kg FLOAT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id), 
	FOREIGN KEY(department_id) REFERENCES master_departments (id)
)""")
    op.execute("""CREATE INDEX ix_machines_department ON machines (department)""")
    op.execute("""CREATE UNIQUE INDEX ix_machines_code ON machines (code)""")
    op.execute("""CREATE INDEX ix_machines_mill_id ON machines (mill_id)""")
    op.execute("""CREATE INDEX ix_machines_department_id ON machines (department_id)""")
    op.execute("""
CREATE TABLE lots (
	id VARCHAR(36) NOT NULL, 
	lot_no VARCHAR(50) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	type VARCHAR(50) NOT NULL, 
	department VARCHAR(100), 
	quantity FLOAT NOT NULL, 
	unit VARCHAR(20) NOT NULL, 
	location VARCHAR(200), 
	warehouse_id VARCHAR(36), 
	grade VARCHAR(10), 
	produced_date VARCHAR(10), 
	status VARCHAR(20) NOT NULL, 
	total_bags INTEGER NOT NULL, 
	quality_status VARCHAR(20) NOT NULL, 
	qr_code VARCHAR(500), 
	qr_token VARCHAR(500), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id), 
	FOREIGN KEY(warehouse_id) REFERENCES warehouses (id)
)""")
    op.execute("""CREATE INDEX ix_lots_mill_id ON lots (mill_id)""")
    op.execute("""CREATE UNIQUE INDEX ix_lots_lot_no ON lots (lot_no)""")
    op.execute("""
CREATE TABLE bale_stock (
	id VARCHAR(36) NOT NULL, 
	purchase_id VARCHAR(36) NOT NULL, 
	bale_no VARCHAR(50) NOT NULL, 
	weight_kg FLOAT NOT NULL, 
	grade VARCHAR(10), 
	location VARCHAR(200), 
	status VARCHAR(20) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(purchase_id) REFERENCES cotton_purchases (id)
)""")
    op.execute("""
CREATE TABLE grn_entries (
	id VARCHAR(36) NOT NULL, 
	date VARCHAR(10) NOT NULL, 
	grn_no VARCHAR(50) NOT NULL, 
	purchase_id VARCHAR(36) NOT NULL, 
	supplier_name VARCHAR(200), 
	bales_received INTEGER NOT NULL, 
	net_kg FLOAT NOT NULL, 
	received_by VARCHAR(200), 
	remarks TEXT, 
	status VARCHAR(20) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (grn_no), 
	FOREIGN KEY(purchase_id) REFERENCES cotton_purchases (id)
)""")
    op.execute("""
CREATE TABLE spare_issues (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36), 
	date VARCHAR(10) NOT NULL, 
	spare_id VARCHAR(36) NOT NULL, 
	spare_code VARCHAR(50), 
	spare_name VARCHAR(200), 
	quantity FLOAT NOT NULL, 
	issued_to VARCHAR(200), 
	department VARCHAR(100), 
	purpose TEXT, 
	issued_by VARCHAR(200), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id), 
	FOREIGN KEY(spare_id) REFERENCES spares (id)
)""")
    op.execute("""CREATE INDEX ix_spare_issues_spare_id ON spare_issues (spare_id)""")
    op.execute("""CREATE INDEX ix_spare_issues_mill_id ON spare_issues (mill_id)""")
    op.execute("""
CREATE TABLE monthly_payroll (
	id VARCHAR(36) NOT NULL, 
	employee_id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	month INTEGER NOT NULL, 
	year INTEGER NOT NULL, 
	days_of_month INTEGER NOT NULL, 
	calculate_days NUMERIC(5, 2) NOT NULL, 
	actual_attendance INTEGER NOT NULL, 
	day_off INTEGER NOT NULL, 
	cl INTEGER NOT NULL, 
	sl INTEGER NOT NULL, 
	el INTEGER NOT NULL, 
	comp_leave INTEGER NOT NULL, 
	festival_holiday INTEGER NOT NULL, 
	absent_days INTEGER NOT NULL, 
	payable_days NUMERIC(5, 2) NOT NULL, 
	payable_salary NUMERIC(10, 2) NOT NULL, 
	ot_hours NUMERIC(5, 2) NOT NULL, 
	ot_amount NUMERIC(10, 2) NOT NULL, 
	festival_duty_benefit NUMERIC(10, 2) NOT NULL, 
	festival_holiday_allowance NUMERIC(10, 2) NOT NULL, 
	ifter_days INTEGER NOT NULL, 
	ifter_allowance NUMERIC(10, 2) NOT NULL, 
	special_food NUMERIC(10, 2) NOT NULL, 
	attendance_bonus NUMERIC(10, 2) NOT NULL, 
	arrear_others NUMERIC(10, 2) NOT NULL, 
	shift_qty INTEGER NOT NULL, 
	shift_amount NUMERIC(10, 2) NOT NULL, 
	roster_qty INTEGER NOT NULL, 
	roster_amount NUMERIC(10, 2) NOT NULL, 
	absent_deduction NUMERIC(10, 2) NOT NULL, 
	advance_deduction NUMERIC(10, 2) NOT NULL, 
	tax_deduction NUMERIC(10, 2) NOT NULL, 
	net_payable NUMERIC(10, 2) NOT NULL, 
	is_finalized BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(employee_id) REFERENCES employees (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id)
)""")
    op.execute("""CREATE INDEX ix_monthly_payroll_mill_id ON monthly_payroll (mill_id)""")
    op.execute("""CREATE INDEX ix_monthly_payroll_employee_id ON monthly_payroll (employee_id)""")
    op.execute("""
CREATE TABLE attendance (
	id VARCHAR(36) NOT NULL, 
	date VARCHAR(10) NOT NULL, 
	employee_id VARCHAR(36) NOT NULL, 
	employee_name VARCHAR(200), 
	department VARCHAR(100), 
	shift VARCHAR(10) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	check_in VARCHAR(5), 
	check_out VARCHAR(5), 
	overtime_hours FLOAT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(employee_id) REFERENCES employees (id)
)""")
    op.execute("""CREATE INDEX ix_attendance_date ON attendance (date)""")
    op.execute("""CREATE INDEX ix_attendance_employee_id ON attendance (employee_id)""")
    op.execute("""
CREATE TABLE leaves (
	id VARCHAR(36) NOT NULL, 
	employee_id VARCHAR(36) NOT NULL, 
	employee_name VARCHAR(200), 
	department VARCHAR(100), 
	from_date VARCHAR(10) NOT NULL, 
	to_date VARCHAR(10) NOT NULL, 
	type VARCHAR(50) NOT NULL, 
	reason TEXT, 
	status VARCHAR(20) NOT NULL, 
	approved_by VARCHAR(200), 
	approved_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(employee_id) REFERENCES employees (id)
)""")
    op.execute("""CREATE INDEX ix_leaves_employee_id ON leaves (employee_id)""")
    op.execute("""
CREATE TABLE employee_shifts (
	id VARCHAR(36) NOT NULL, 
	employee_id VARCHAR(36) NOT NULL, 
	shift VARCHAR(10) NOT NULL, 
	effective_from VARCHAR(10) NOT NULL, 
	effective_to VARCHAR(10), 
	PRIMARY KEY (id), 
	FOREIGN KEY(employee_id) REFERENCES employees (id)
)""")
    op.execute("""
CREATE TABLE employee_custom_values (
	id VARCHAR(36) NOT NULL, 
	employee_id VARCHAR(36) NOT NULL, 
	field_id VARCHAR(36) NOT NULL, 
	value TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(employee_id) REFERENCES employees (id), 
	FOREIGN KEY(field_id) REFERENCES employee_custom_fields (id)
)""")
    op.execute("""CREATE INDEX ix_employee_custom_values_employee_id ON employee_custom_values (employee_id)""")
    op.execute("""
CREATE TABLE payslip_entries (
	id VARCHAR(36) NOT NULL, 
	payroll_month_id VARCHAR(36) NOT NULL, 
	employee_id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	month INTEGER NOT NULL, 
	year INTEGER NOT NULL, 
	present_days INTEGER NOT NULL, 
	absent_days INTEGER NOT NULL, 
	half_days INTEGER NOT NULL, 
	overtime_hours FLOAT NOT NULL, 
	daily_wage FLOAT NOT NULL, 
	basic_wage FLOAT NOT NULL, 
	overtime_amount FLOAT NOT NULL, 
	gross_wage FLOAT NOT NULL, 
	pf_employee FLOAT NOT NULL, 
	pf_employer FLOAT NOT NULL, 
	esic_employee FLOAT NOT NULL, 
	esic_employer FLOAT NOT NULL, 
	other_deductions FLOAT NOT NULL, 
	net_wage FLOAT NOT NULL, 
	payment_mode VARCHAR(20) NOT NULL, 
	payment_ref VARCHAR(200), 
	paid_at TIMESTAMP WITH TIME ZONE, 
	status VARCHAR(20) NOT NULL, 
	remarks TEXT, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_payslip_month_employee UNIQUE (payroll_month_id, employee_id), 
	FOREIGN KEY(payroll_month_id) REFERENCES payroll_months (id) ON DELETE CASCADE, 
	FOREIGN KEY(employee_id) REFERENCES employees (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id)
)""")
    op.execute("""CREATE INDEX ix_payslip_entries_payroll_month_id ON payslip_entries (payroll_month_id)""")
    op.execute("""CREATE INDEX ix_payslip_entries_employee_id ON payslip_entries (employee_id)""")
    op.execute("""
CREATE TABLE payments (
	id VARCHAR(36) NOT NULL, 
	invoice_id VARCHAR(36) NOT NULL, 
	date VARCHAR(10) NOT NULL, 
	amount FLOAT NOT NULL, 
	mode VARCHAR(50), 
	reference VARCHAR(200), 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(invoice_id) REFERENCES invoices (id)
)""")
    op.execute("""CREATE INDEX ix_payments_invoice_id ON payments (invoice_id)""")
    op.execute("""
CREATE TABLE gst_entries (
	id VARCHAR(36) NOT NULL, 
	invoice_id VARCHAR(36) NOT NULL, 
	gstin VARCHAR(50), 
	hsn_code VARCHAR(20), 
	taxable_value FLOAT NOT NULL, 
	cgst FLOAT NOT NULL, 
	sgst FLOAT NOT NULL, 
	igst FLOAT NOT NULL, 
	total_gst FLOAT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(invoice_id) REFERENCES invoices (id)
)""")
    op.execute("""
CREATE TABLE sales_orders (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	so_no VARCHAR(50) NOT NULL, 
	customer_id VARCHAR(36) NOT NULL, 
	status VARCHAR(30) NOT NULL, 
	order_date VARCHAR(10) NOT NULL, 
	delivery_date VARCHAR(10), 
	yarn_count VARCHAR(20), 
	total_bags INTEGER NOT NULL, 
	total_weight_kg FLOAT NOT NULL, 
	rate_per_kg FLOAT, 
	total_value FLOAT, 
	incoterms VARCHAR(50), 
	notes TEXT, 
	confirmed_by VARCHAR(36), 
	confirmed_at TIMESTAMP WITH TIME ZONE, 
	cancelled_by VARCHAR(36), 
	cancelled_at TIMESTAMP WITH TIME ZONE, 
	created_by VARCHAR(36) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id), 
	FOREIGN KEY(customer_id) REFERENCES customers (id), 
	FOREIGN KEY(confirmed_by) REFERENCES users (id), 
	FOREIGN KEY(cancelled_by) REFERENCES users (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
)""")
    op.execute("""CREATE INDEX ix_sales_orders_customer_id ON sales_orders (customer_id)""")
    op.execute("""CREATE UNIQUE INDEX ix_sales_orders_so_no ON sales_orders (so_no)""")
    op.execute("""CREATE INDEX ix_sales_orders_mill_id ON sales_orders (mill_id)""")
    op.execute("""
CREATE TABLE production_entries (
	id VARCHAR(36) NOT NULL, 
	date VARCHAR(10) NOT NULL, 
	shift VARCHAR(1) NOT NULL, 
	machine_code VARCHAR(50) NOT NULL, 
	department VARCHAR(100) NOT NULL, 
	operator VARCHAR(200) NOT NULL, 
	produced_kg FLOAT NOT NULL, 
	waste_kg FLOAT NOT NULL, 
	count VARCHAR(20), 
	status VARCHAR(20) NOT NULL, 
	approved_by VARCHAR(200), 
	approved_at TIMESTAMP WITH TIME ZONE, 
	entered_by VARCHAR(200), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(machine_code) REFERENCES machines (code)
)""")
    op.execute("""CREATE INDEX ix_production_entries_date ON production_entries (date)""")
    op.execute("""CREATE INDEX ix_production_entries_machine_code ON production_entries (machine_code)""")
    op.execute("""
CREATE TABLE downtime_logs (
	id VARCHAR(36) NOT NULL, 
	machine_code VARCHAR(50) NOT NULL, 
	reason TEXT NOT NULL, 
	started_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	ended_at TIMESTAMP WITH TIME ZONE, 
	duration_min INTEGER NOT NULL, 
	resolved BOOLEAN NOT NULL, 
	reported_by VARCHAR(200), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(machine_code) REFERENCES machines (code)
)""")
    op.execute("""CREATE INDEX ix_downtime_logs_machine_code ON downtime_logs (machine_code)""")
    op.execute("""
CREATE TABLE quality_tests (
	id VARCHAR(36) NOT NULL, 
	date VARCHAR(10) NOT NULL, 
	type VARCHAR(50) NOT NULL, 
	lot_id VARCHAR(36), 
	lot_no VARCHAR(50), 
	machine_code VARCHAR(50), 
	sample_ref VARCHAR(50), 
	result FLOAT NOT NULL, 
	unit VARCHAR(20), 
	standard FLOAT NOT NULL, 
	u_percent FLOAT, 
	csp FLOAT, 
	status VARCHAR(20) NOT NULL, 
	tested_by VARCHAR(200), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(lot_id) REFERENCES lots (id)
)""")
    op.execute("""CREATE INDEX ix_quality_tests_date ON quality_tests (date)""")
    op.execute("""CREATE INDEX ix_quality_tests_lot_id ON quality_tests (lot_id)""")
    op.execute("""
CREATE TABLE lab_reports (
	id VARCHAR(36) NOT NULL, 
	lot_id VARCHAR(36), 
	lot_no VARCHAR(50), 
	report_date VARCHAR(10) NOT NULL, 
	csp FLOAT, 
	count_ne FLOAT, 
	moisture FLOAT, 
	strength FLOAT, 
	uster_cv FLOAT, 
	remarks TEXT, 
	tested_by VARCHAR(200), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(lot_id) REFERENCES lots (id)
)""")
    op.execute("""CREATE INDEX ix_lab_reports_lot_id ON lab_reports (lot_id)""")
    op.execute("""
CREATE TABLE quality_approvals (
	id VARCHAR(36) NOT NULL, 
	lot_id VARCHAR(36) NOT NULL, 
	lot_no VARCHAR(50) NOT NULL, 
	department VARCHAR(100) NOT NULL, 
	produced_kg FLOAT NOT NULL, 
	sample_date VARCHAR(10) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	approved_by VARCHAR(200), 
	approved_at TIMESTAMP WITH TIME ZONE, 
	remarks TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(lot_id) REFERENCES lots (id)
)""")
    op.execute("""CREATE INDEX ix_quality_approvals_lot_id ON quality_approvals (lot_id)""")
    op.execute("""
CREATE TABLE stock_movements (
	id VARCHAR(36) NOT NULL, 
	lot_id VARCHAR(36), 
	lot_no VARCHAR(50), 
	from_location VARCHAR(200), 
	to_location VARCHAR(200), 
	quantity FLOAT NOT NULL, 
	unit VARCHAR(20) NOT NULL, 
	type VARCHAR(50) NOT NULL, 
	reference VARCHAR(200), 
	transferred_by VARCHAR(200), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(lot_id) REFERENCES lots (id)
)""")
    op.execute("""CREATE INDEX ix_stock_movements_lot_id ON stock_movements (lot_id)""")
    op.execute("""
CREATE TABLE inventory_bags (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	lot_id VARCHAR(36) NOT NULL, 
	bag_no VARCHAR(50) NOT NULL, 
	lot_no VARCHAR(50) NOT NULL, 
	yarn_count VARCHAR(20), 
	weight_kg FLOAT NOT NULL, 
	qr_code VARCHAR(1000), 
	status VARCHAR(30) NOT NULL, 
	warehouse_id VARCHAR(36), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_lot_bag_no UNIQUE (lot_id, bag_no), 
	FOREIGN KEY(mill_id) REFERENCES mills (id), 
	FOREIGN KEY(lot_id) REFERENCES lots (id), 
	FOREIGN KEY(warehouse_id) REFERENCES warehouses (id)
)""")
    op.execute("""CREATE INDEX ix_inventory_bags_bag_no ON inventory_bags (bag_no)""")
    op.execute("""CREATE INDEX ix_inventory_bags_lot_id ON inventory_bags (lot_id)""")
    op.execute("""CREATE INDEX ix_inventory_bags_mill_id ON inventory_bags (mill_id)""")
    op.execute("""CREATE INDEX ix_inventory_bags_warehouse_id ON inventory_bags (warehouse_id)""")
    op.execute("""
CREATE TABLE dispatches (
	id VARCHAR(36) NOT NULL, 
	dispatch_no VARCHAR(50) NOT NULL, 
	date VARCHAR(10) NOT NULL, 
	order_no VARCHAR(50), 
	customer VARCHAR(200) NOT NULL, 
	lot_id VARCHAR(36), 
	lot_no VARCHAR(50), 
	quantity_kg FLOAT NOT NULL, 
	vehicle_no VARCHAR(50), 
	driver_name VARCHAR(200), 
	driver_phone VARCHAR(20), 
	eway_bill_no VARCHAR(100), 
	invoice_no VARCHAR(50), 
	total_bags INTEGER NOT NULL, 
	total_weight_kg FLOAT NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	scanned_by VARCHAR(200), 
	scanned_at TIMESTAMP WITH TIME ZONE, 
	approved_by VARCHAR(200), 
	approved_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(lot_id) REFERENCES lots (id)
)""")
    op.execute("""CREATE INDEX ix_dispatches_status ON dispatches (status)""")
    op.execute("""CREATE INDEX ix_dispatches_date ON dispatches (date)""")
    op.execute("""CREATE UNIQUE INDEX ix_dispatches_dispatch_no ON dispatches (dispatch_no)""")
    op.execute("""
CREATE TABLE trips (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	trip_no VARCHAR(50) NOT NULL, 
	sales_order_id VARCHAR(36), 
	vehicle_id VARCHAR(36), 
	vehicle_no VARCHAR(50), 
	driver_name VARCHAR(200), 
	driver_mobile VARCHAR(20), 
	from_warehouse_id VARCHAR(36) NOT NULL, 
	destination_route_id VARCHAR(36), 
	destination_name VARCHAR(200), 
	customer_id VARCHAR(36), 
	status VARCHAR(30) NOT NULL, 
	planned_bags INTEGER NOT NULL, 
	loaded_bags INTEGER NOT NULL, 
	delivered_bags INTEGER NOT NULL, 
	planned_weight_kg FLOAT NOT NULL, 
	loaded_weight_kg FLOAT NOT NULL, 
	delivered_weight_kg FLOAT NOT NULL, 
	loader_id VARCHAR(36), 
	receiver_id VARCHAR(36), 
	loading_started_at TIMESTAMP WITH TIME ZONE, 
	loading_completed_at TIMESTAMP WITH TIME ZONE, 
	departure_at TIMESTAMP WITH TIME ZONE, 
	arrived_at TIMESTAMP WITH TIME ZONE, 
	delivered_at TIMESTAMP WITH TIME ZONE, 
	pod_confirmed_at TIMESTAMP WITH TIME ZONE, 
	pod_confirmed_by VARCHAR(36), 
	notes TEXT, 
	created_by VARCHAR(36) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id), 
	FOREIGN KEY(sales_order_id) REFERENCES sales_orders (id), 
	FOREIGN KEY(vehicle_id) REFERENCES master_vehicles (id), 
	FOREIGN KEY(from_warehouse_id) REFERENCES warehouses (id), 
	FOREIGN KEY(destination_route_id) REFERENCES master_routes (id), 
	FOREIGN KEY(customer_id) REFERENCES customers (id), 
	FOREIGN KEY(loader_id) REFERENCES users (id), 
	FOREIGN KEY(receiver_id) REFERENCES users (id), 
	FOREIGN KEY(pod_confirmed_by) REFERENCES users (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
)""")
    op.execute("""CREATE INDEX ix_trips_status ON trips (status)""")
    op.execute("""CREATE UNIQUE INDEX ix_trips_trip_no ON trips (trip_no)""")
    op.execute("""CREATE INDEX ix_trips_mill_id ON trips (mill_id)""")
    op.execute("""
CREATE TABLE stock_ledger (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	lot_id VARCHAR(36), 
	warehouse_id VARCHAR(36) NOT NULL, 
	move_type VARCHAR(50) NOT NULL, 
	qty_in FLOAT NOT NULL, 
	qty_out FLOAT NOT NULL, 
	weight_in_kg FLOAT NOT NULL, 
	weight_out_kg FLOAT NOT NULL, 
	ref_doc_type VARCHAR(50), 
	ref_doc_id VARCHAR(36), 
	lot_no VARCHAR(50), 
	yarn_count VARCHAR(20), 
	warehouse_code VARCHAR(50), 
	user_id VARCHAR(36) NOT NULL, 
	shift_id VARCHAR(36), 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id), 
	FOREIGN KEY(lot_id) REFERENCES lots (id), 
	FOREIGN KEY(warehouse_id) REFERENCES warehouses (id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	FOREIGN KEY(shift_id) REFERENCES shifts (id)
)""")
    op.execute("""CREATE INDEX ix_stock_ledger_created_at ON stock_ledger (created_at)""")
    op.execute("""CREATE INDEX ix_stock_ledger_mill_id ON stock_ledger (mill_id)""")
    op.execute("""CREATE INDEX ix_stock_ledger_user_id ON stock_ledger (user_id)""")
    op.execute("""CREATE INDEX ix_stock_ledger_lot_id ON stock_ledger (lot_id)""")
    op.execute("""CREATE INDEX ix_stock_ledger_warehouse_id ON stock_ledger (warehouse_id)""")
    op.execute("""CREATE INDEX ix_stock_ledger_ref_doc_id ON stock_ledger (ref_doc_id)""")
    op.execute("""
CREATE TABLE stock_balance (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	lot_id VARCHAR(36) NOT NULL, 
	warehouse_id VARCHAR(36) NOT NULL, 
	fg_state VARCHAR(30) NOT NULL, 
	qty_on_hand FLOAT NOT NULL, 
	qty_reserved FLOAT NOT NULL, 
	qty_quarantine FLOAT NOT NULL, 
	weight_on_hand_kg FLOAT NOT NULL, 
	weight_reserved_kg FLOAT NOT NULL, 
	last_move_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_balance_mill_lot_wh UNIQUE (mill_id, lot_id, warehouse_id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id), 
	FOREIGN KEY(lot_id) REFERENCES lots (id), 
	FOREIGN KEY(warehouse_id) REFERENCES warehouses (id)
)""")
    op.execute("""CREATE INDEX ix_stock_balance_mill_id ON stock_balance (mill_id)""")
    op.execute("""
CREATE TABLE sales_order_lines (
	id VARCHAR(36) NOT NULL, 
	so_id VARCHAR(36) NOT NULL, 
	lot_id VARCHAR(36) NOT NULL, 
	warehouse_id VARCHAR(36) NOT NULL, 
	bags_ordered INTEGER NOT NULL, 
	bags_delivered INTEGER NOT NULL, 
	bags_reserved INTEGER NOT NULL, 
	weight_kg FLOAT NOT NULL, 
	rate_per_kg FLOAT, 
	line_amount FLOAT, 
	status VARCHAR(30) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(so_id) REFERENCES sales_orders (id) ON DELETE CASCADE, 
	FOREIGN KEY(lot_id) REFERENCES lots (id), 
	FOREIGN KEY(warehouse_id) REFERENCES warehouses (id)
)""")
    op.execute("""CREATE INDEX ix_sales_order_lines_so_id ON sales_order_lines (so_id)""")
    op.execute("""
CREATE TABLE stock_transfers (
	id VARCHAR(36) NOT NULL, 
	mill_id VARCHAR(36) NOT NULL, 
	transfer_no VARCHAR(50) NOT NULL, 
	from_warehouse_id VARCHAR(36) NOT NULL, 
	to_warehouse_id VARCHAR(36) NOT NULL, 
	status VARCHAR(30) NOT NULL, 
	lot_id VARCHAR(36) NOT NULL, 
	bags_count INTEGER NOT NULL, 
	weight_kg FLOAT NOT NULL, 
	notes TEXT, 
	created_by VARCHAR(36) NOT NULL, 
	confirmed_by VARCHAR(36), 
	completed_by VARCHAR(36), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(mill_id) REFERENCES mills (id), 
	FOREIGN KEY(from_warehouse_id) REFERENCES warehouses (id), 
	FOREIGN KEY(to_warehouse_id) REFERENCES warehouses (id), 
	FOREIGN KEY(lot_id) REFERENCES lots (id), 
	FOREIGN KEY(created_by) REFERENCES users (id), 
	FOREIGN KEY(confirmed_by) REFERENCES users (id), 
	FOREIGN KEY(completed_by) REFERENCES users (id)
)""")
    op.execute("""CREATE UNIQUE INDEX ix_stock_transfers_transfer_no ON stock_transfers (transfer_no)""")
    op.execute("""CREATE INDEX ix_stock_transfers_mill_id ON stock_transfers (mill_id)""")
    op.execute("""
CREATE TABLE dispatch_items (
	id VARCHAR(36) NOT NULL, 
	dispatch_id VARCHAR(36) NOT NULL, 
	lot_no VARCHAR(50) NOT NULL, 
	quantity_kg FLOAT NOT NULL, 
	package_type VARCHAR(50), 
	package_count INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(dispatch_id) REFERENCES dispatches (id)
)""")
    op.execute("""CREATE INDEX ix_dispatch_items_dispatch_id ON dispatch_items (dispatch_id)""")
    op.execute("""
CREATE TABLE trip_items (
	id VARCHAR(36) NOT NULL, 
	trip_id VARCHAR(36) NOT NULL, 
	lot_id VARCHAR(36) NOT NULL, 
	bag_id VARCHAR(36), 
	bag_no VARCHAR(50) NOT NULL, 
	lot_no VARCHAR(50) NOT NULL, 
	yarn_count VARCHAR(20), 
	planned_weight_kg FLOAT NOT NULL, 
	loaded_weight_kg FLOAT, 
	delivered_weight_kg FLOAT, 
	qr_code VARCHAR(1000), 
	loader_scan_at TIMESTAMP WITH TIME ZONE, 
	loader_scan_by VARCHAR(36), 
	receiver_scan_at TIMESTAMP WITH TIME ZONE, 
	receiver_scan_by VARCHAR(36), 
	item_status VARCHAR(30) NOT NULL, 
	wrong_destination_detected BOOLEAN NOT NULL, 
	wrong_destination_scanned_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(trip_id) REFERENCES trips (id) ON DELETE CASCADE, 
	FOREIGN KEY(lot_id) REFERENCES lots (id), 
	FOREIGN KEY(bag_id) REFERENCES inventory_bags (id), 
	FOREIGN KEY(loader_scan_by) REFERENCES users (id), 
	FOREIGN KEY(receiver_scan_by) REFERENCES users (id)
)""")
    op.execute("""CREATE INDEX ix_trip_items_trip_id ON trip_items (trip_id)""")
    op.execute("""CREATE INDEX ix_trip_items_item_status ON trip_items (item_status)""")
    op.execute("""
CREATE TABLE trip_scan_logs (
	id VARCHAR(36) NOT NULL, 
	trip_id VARCHAR(36) NOT NULL, 
	trip_item_id VARCHAR(36), 
	scan_type VARCHAR(30) NOT NULL, 
	qr_code VARCHAR(1000) NOT NULL, 
	scanned_by VARCHAR(36) NOT NULL, 
	scanned_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	result VARCHAR(30) NOT NULL, 
	device_info VARCHAR(500), 
	ip_address VARCHAR(50), 
	payload_data JSON, 
	PRIMARY KEY (id), 
	FOREIGN KEY(trip_id) REFERENCES trips (id), 
	FOREIGN KEY(trip_item_id) REFERENCES trip_items (id), 
	FOREIGN KEY(scanned_by) REFERENCES users (id)
)""")
    op.execute("""CREATE INDEX ix_trip_scan_logs_scanned_at ON trip_scan_logs (scanned_at)""")
    op.execute("""CREATE INDEX ix_trip_scan_logs_trip_id ON trip_scan_logs (trip_id)""")


def downgrade() -> None:
    op.execute("""DROP TABLE IF EXISTS trip_scan_logs CASCADE""")
    op.execute("""DROP TABLE IF EXISTS trip_items CASCADE""")
    op.execute("""DROP TABLE IF EXISTS dispatch_items CASCADE""")
    op.execute("""DROP TABLE IF EXISTS trips CASCADE""")
    op.execute("""DROP TABLE IF EXISTS stock_transfers CASCADE""")
    op.execute("""DROP TABLE IF EXISTS stock_movements CASCADE""")
    op.execute("""DROP TABLE IF EXISTS stock_ledger CASCADE""")
    op.execute("""DROP TABLE IF EXISTS stock_balance CASCADE""")
    op.execute("""DROP TABLE IF EXISTS sales_order_lines CASCADE""")
    op.execute("""DROP TABLE IF EXISTS quality_tests CASCADE""")
    op.execute("""DROP TABLE IF EXISTS quality_approvals CASCADE""")
    op.execute("""DROP TABLE IF EXISTS production_entries CASCADE""")
    op.execute("""DROP TABLE IF EXISTS lab_reports CASCADE""")
    op.execute("""DROP TABLE IF EXISTS inventory_bags CASCADE""")
    op.execute("""DROP TABLE IF EXISTS downtime_logs CASCADE""")
    op.execute("""DROP TABLE IF EXISTS dispatches CASCADE""")
    op.execute("""DROP TABLE IF EXISTS spare_issues CASCADE""")
    op.execute("""DROP TABLE IF EXISTS sales_orders CASCADE""")
    op.execute("""DROP TABLE IF EXISTS payslip_entries CASCADE""")
    op.execute("""DROP TABLE IF EXISTS payments CASCADE""")
    op.execute("""DROP TABLE IF EXISTS monthly_payroll CASCADE""")
    op.execute("""DROP TABLE IF EXISTS machines CASCADE""")
    op.execute("""DROP TABLE IF EXISTS lots CASCADE""")
    op.execute("""DROP TABLE IF EXISTS leaves CASCADE""")
    op.execute("""DROP TABLE IF EXISTS gst_entries CASCADE""")
    op.execute("""DROP TABLE IF EXISTS grn_entries CASCADE""")
    op.execute("""DROP TABLE IF EXISTS employee_shifts CASCADE""")
    op.execute("""DROP TABLE IF EXISTS employee_custom_values CASCADE""")
    op.execute("""DROP TABLE IF EXISTS bale_stock CASCADE""")
    op.execute("""DROP TABLE IF EXISTS attendance CASCADE""")
    op.execute("""DROP TABLE IF EXISTS yarn_counts CASCADE""")
    op.execute("""DROP TABLE IF EXISTS warehouses CASCADE""")
    op.execute("""DROP TABLE IF EXISTS user_sessions CASCADE""")
    op.execute("""DROP TABLE IF EXISTS spares CASCADE""")
    op.execute("""DROP TABLE IF EXISTS shifts CASCADE""")
    op.execute("""DROP TABLE IF EXISTS payroll_months CASCADE""")
    op.execute("""DROP TABLE IF EXISTS mill_settings CASCADE""")
    op.execute("""DROP TABLE IF EXISTS master_vehicles CASCADE""")
    op.execute("""DROP TABLE IF EXISTS master_routes CASCADE""")
    op.execute("""DROP TABLE IF EXISTS master_departments CASCADE""")
    op.execute("""DROP TABLE IF EXISTS invoices CASCADE""")
    op.execute("""DROP TABLE IF EXISTS employees CASCADE""")
    op.execute("""DROP TABLE IF EXISTS customers CASCADE""")
    op.execute("""DROP TABLE IF EXISTS cotton_purchases CASCADE""")
    op.execute("""DROP TABLE IF EXISTS company_modules CASCADE""")
    op.execute("""DROP TABLE IF EXISTS audit_logs CASCADE""")
    op.execute("""DROP TABLE IF EXISTS users CASCADE""")
    op.execute("""DROP TABLE IF EXISTS mills CASCADE""")
    op.execute("""DROP TABLE IF EXISTS maintenance_logs CASCADE""")
    op.execute("""DROP TABLE IF EXISTS employee_custom_fields CASCADE""")
    op.execute("""DROP TABLE IF EXISTS vendors CASCADE""")
    op.execute("""DROP TABLE IF EXISTS vehicles CASCADE""")
    op.execute("""DROP TABLE IF EXISTS technicians CASCADE""")
    op.execute("""DROP TABLE IF EXISTS suppliers CASCADE""")
    op.execute("""DROP TABLE IF EXISTS roles CASCADE""")
    op.execute("""DROP TABLE IF EXISTS qr_scans CASCADE""")
    op.execute("""DROP TABLE IF EXISTS maintenance_schedule CASCADE""")
    op.execute("""DROP TABLE IF EXISTS machine_parameters CASCADE""")
    op.execute("""DROP TABLE IF EXISTS inventory_items CASCADE""")
    op.execute("""DROP TABLE IF EXISTS import_mappings CASCADE""")
    op.execute("""DROP TABLE IF EXISTS document_attachments CASCADE""")
    op.execute("""DROP TABLE IF EXISTS cotton_bales CASCADE""")
    op.execute("""DROP TABLE IF EXISTS companies CASCADE""")
    op.execute("""DROP TABLE IF EXISTS column_dropdown_options CASCADE""")
    op.execute("""DROP TABLE IF EXISTS column_configs CASCADE""")
