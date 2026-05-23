#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_CALLS=0
PASSED_CALLS=0
FAILED_CALLS=0
FIXED_CALLS=0

# Base URL
BASE_URL="http://127.0.0.1:8002/api/v1"

# Log function
log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED_CALLS++))
    ((TOTAL_CALLS++))
}

error() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED_CALLS++))
    ((TOTAL_CALLS++))
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# API call wrapper
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local token=$4
    local description=$5
    
    log "API: $method $endpoint - $description"
    
    if [ -z "$data" ]; then
        response=$(curl -sS -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json")
    else
        response=$(curl -sS -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
        success "$description - HTTP $http_code"
        echo "$body"
        return 0
    else
        error "$description - HTTP $http_code"
        echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
        return 1
    fi
}

echo "=========================================="
echo "  SPINFLOW ERP - FULL SYSTEM TEST"
echo "=========================================="
echo ""

# Get superadmin token
log "Getting superadmin token..."
TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'username=superadmin&password=Admin@1234' \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
success "Superadmin token obtained"

# Get mill_id
log "Getting mill_id..."
MILL_ID=$(curl -sS "$BASE_URL/masters/mills" \
    -H "Authorization: Bearer $TOKEN" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["data"][0]["id"])')
success "Mill ID: $MILL_ID"

echo ""
echo "=========================================="
echo "  PHASE 2: MASTERS"
echo "=========================================="
echo ""

# Create Departments
log "Creating departments..."
DEPT_SPINNING=$(api_call POST "/masters/departments" \
    "{\"mill_id\":\"$MILL_ID\",\"code\":\"SPIN\",\"name\":\"Spinning\",\"is_active\":true}" \
    "$TOKEN" "Create Spinning department" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

DEPT_WEAVING=$(api_call POST "/masters/departments" \
    "{\"mill_id\":\"$MILL_ID\",\"code\":\"WEAV\",\"name\":\"Weaving\",\"is_active\":true}" \
    "$TOKEN" "Create Weaving department" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

DEPT_QUALITY=$(api_call POST "/masters/departments" \
    "{\"mill_id\":\"$MILL_ID\",\"code\":\"QC\",\"name\":\"Quality Control\",\"is_active\":true}" \
    "$TOKEN" "Create Quality department" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

DEPT_STORES=$(api_call POST "/masters/departments" \
    "{\"mill_id\":\"$MILL_ID\",\"code\":\"STOR\",\"name\":\"Stores\",\"is_active\":true}" \
    "$TOKEN" "Create Stores department" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

DEPT_MAINT=$(api_call POST "/masters/departments" \
    "{\"mill_id\":\"$MILL_ID\",\"code\":\"MAINT\",\"name\":\"Maintenance\",\"is_active\":true}" \
    "$TOKEN" "Create Maintenance department" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

DEPT_HR=$(api_call POST "/masters/departments" \
    "{\"mill_id\":\"$MILL_ID\",\"code\":\"HR\",\"name\":\"Human Resources\",\"is_active\":true}" \
    "$TOKEN" "Create HR department" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

DEPT_ACCOUNTS=$(api_call POST "/masters/departments" \
    "{\"mill_id\":\"$MILL_ID\",\"code\":\"ACC\",\"name\":\"Accounts\",\"is_active\":true}" \
    "$TOKEN" "Create Accounts department" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Create Shifts
log "Creating shifts..."
SHIFT_A=$(api_call POST "/masters/shifts" \
    "{\"mill_id\":\"$MILL_ID\",\"code\":\"A\",\"name\":\"Shift A\",\"start_time\":\"06:00\",\"end_time\":\"14:00\",\"is_active\":true}" \
    "$TOKEN" "Create Shift A" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

SHIFT_B=$(api_call POST "/masters/shifts" \
    "{\"mill_id\":\"$MILL_ID\",\"code\":\"B\",\"name\":\"Shift B\",\"start_time\":\"14:00\",\"end_time\":\"22:00\",\"is_active\":true}" \
    "$TOKEN" "Create Shift B" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

SHIFT_C=$(api_call POST "/masters/shifts" \
    "{\"mill_id\":\"$MILL_ID\",\"code\":\"C\",\"name\":\"Shift C\",\"start_time\":\"22:00\",\"end_time\":\"06:00\",\"is_active\":true}" \
    "$TOKEN" "Create Shift C" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Create Yarn Counts
log "Creating yarn counts..."
COUNT_20S=$(api_call POST "/masters/yarn-counts" \
    "{\"mill_id\":\"$MILL_ID\",\"count\":\"20s\",\"description\":\"20s Carded\",\"is_active\":true}" \
    "$TOKEN" "Create 20s count" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

COUNT_30S=$(api_call POST "/masters/yarn-counts" \
    "{\"mill_id\":\"$MILL_ID\",\"count\":\"30s\",\"description\":\"30s Combed\",\"is_active\":true}" \
    "$TOKEN" "Create 30s count" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Create Warehouses
log "Creating warehouses..."
WH_RAW=$(api_call POST "/masters/warehouses" \
    "{\"mill_id\":\"$MILL_ID\",\"code\":\"WH-RAW\",\"name\":\"Raw Material Warehouse\",\"location\":\"Block A\",\"is_active\":true}" \
    "$TOKEN" "Create Raw Material warehouse" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

WH_FG=$(api_call POST "/masters/warehouses" \
    "{\"mill_id\":\"$MILL_ID\",\"code\":\"WH-FG\",\"name\":\"Finished Goods Warehouse\",\"location\":\"Block B\",\"is_active\":true}" \
    "$TOKEN" "Create Finished Goods warehouse" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Create Machines
log "Creating machines..."
MACHINE_RF1=$(api_call POST "/masters/machines" \
    "{\"mill_id\":\"$MILL_ID\",\"department_id\":\"$DEPT_SPINNING\",\"code\":\"RF-001\",\"name\":\"Ring Frame 1\",\"type\":\"Ring Frame\",\"capacity\":100,\"is_active\":true}" \
    "$TOKEN" "Create Ring Frame 1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

MACHINE_RF2=$(api_call POST "/masters/machines" \
    "{\"mill_id\":\"$MILL_ID\",\"department_id\":\"$DEPT_SPINNING\",\"code\":\"RF-002\",\"name\":\"Ring Frame 2\",\"type\":\"Ring Frame\",\"capacity\":100,\"is_active\":true}" \
    "$TOKEN" "Create Ring Frame 2" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Create Suppliers
log "Creating suppliers..."
SUPPLIER_1=$(api_call POST "/masters/suppliers" \
    "{\"mill_id\":\"$MILL_ID\",\"code\":\"SUP-001\",\"name\":\"Cotton Traders Ltd\",\"contact_person\":\"Rajesh Kumar\",\"phone\":\"9876543210\",\"email\":\"rajesh@cottontraders.com\",\"address\":\"123 Market St\",\"city\":\"Mumbai\",\"state\":\"Maharashtra\",\"pincode\":\"400001\",\"gstin\":\"27AABCU9603R1ZM\",\"is_active\":true}" \
    "$TOKEN" "Create Supplier 1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Create Customers
log "Creating customers..."
CUSTOMER_1=$(api_call POST "/masters/customers" \
    "{\"mill_id\":\"$MILL_ID\",\"code\":\"CUST-001\",\"name\":\"Textile Exports Inc\",\"contact_person\":\"Amit Shah\",\"phone\":\"9876543211\",\"email\":\"amit@textileexports.com\",\"address\":\"456 Export St\",\"city\":\"Delhi\",\"state\":\"Delhi\",\"pincode\":\"110001\",\"gstin\":\"07AABCU9603R1ZN\",\"is_active\":true}" \
    "$TOKEN" "Create Customer 1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Create Vehicles
log "Creating vehicles..."
VEHICLE_1=$(api_call POST "/masters/vehicles" \
    "{\"mill_id\":\"$MILL_ID\",\"registration_number\":\"MH12AB1234\",\"vehicle_type\":\"Truck\",\"capacity\":10000,\"driver_name\":\"Ramesh Patil\",\"driver_phone\":\"9876543212\",\"is_active\":true}" \
    "$TOKEN" "Create Vehicle 1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

echo ""
echo "=========================================="
echo "  PHASE 3: USER MANAGEMENT"
echo "=========================================="
echo ""

# Create users for each role
log "Creating users..."

# Production Manager
USER_PROD_MGR=$(api_call POST "/users" \
    "{\"mill_id\":\"$MILL_ID\",\"username\":\"prodmgr1\",\"email\":\"prodmgr1@mill.spinflow\",\"name\":\"Production Manager\",\"password\":\"Pass@1234\",\"role\":\"PRODUCTION_MANAGER\",\"department_id\":\"$DEPT_SPINNING\",\"is_active\":true}" \
    "$TOKEN" "Create Production Manager" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Operator
USER_OPERATOR=$(api_call POST "/users" \
    "{\"mill_id\":\"$MILL_ID\",\"username\":\"operator1\",\"email\":\"operator1@mill.spinflow\",\"name\":\"Operator One\",\"password\":\"Pass@1234\",\"role\":\"OPERATOR\",\"department_id\":\"$DEPT_SPINNING\",\"is_active\":true}" \
    "$TOKEN" "Create Operator" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Quality Manager
USER_QC_MGR=$(api_call POST "/users" \
    "{\"mill_id\":\"$MILL_ID\",\"username\":\"qcmgr1\",\"email\":\"qcmgr1@mill.spinflow\",\"name\":\"QC Manager\",\"password\":\"Pass@1234\",\"role\":\"QUALITY_MANAGER\",\"department_id\":\"$DEPT_QUALITY\",\"is_active\":true}" \
    "$TOKEN" "Create Quality Manager" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Quality Inspector
USER_QC_INSP=$(api_call POST "/users" \
    "{\"mill_id\":\"$MILL_ID\",\"username\":\"qcinsp1\",\"email\":\"qcinsp1@mill.spinflow\",\"name\":\"QC Inspector\",\"password\":\"Pass@1234\",\"role\":\"QUALITY_INSPECTOR\",\"department_id\":\"$DEPT_QUALITY\",\"is_active\":true}" \
    "$TOKEN" "Create Quality Inspector" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Store Manager
USER_STORE_MGR=$(api_call POST "/users" \
    "{\"mill_id\":\"$MILL_ID\",\"username\":\"storemgr1\",\"email\":\"storemgr1@mill.spinflow\",\"name\":\"Store Manager\",\"password\":\"Pass@1234\",\"role\":\"STORE_MANAGER\",\"department_id\":\"$DEPT_STORES\",\"is_active\":true}" \
    "$TOKEN" "Create Store Manager" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Maintenance Manager
USER_MAINT_MGR=$(api_call POST "/users" \
    "{\"mill_id\":\"$MILL_ID\",\"username\":\"maintmgr1\",\"email\":\"maintmgr1@mill.spinflow\",\"name\":\"Maintenance Manager\",\"password\":\"Pass@1234\",\"role\":\"MAINTENANCE_MANAGER\",\"department_id\":\"$DEPT_MAINT\",\"is_active\":true}" \
    "$TOKEN" "Create Maintenance Manager" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# HR Manager
USER_HR_MGR=$(api_call POST "/users" \
    "{\"mill_id\":\"$MILL_ID\",\"username\":\"hrmgr1\",\"email\":\"hrmgr1@mill.spinflow\",\"name\":\"HR Manager\",\"password\":\"Pass@1234\",\"role\":\"HR_MANAGER\",\"department_id\":\"$DEPT_HR\",\"is_active\":true}" \
    "$TOKEN" "Create HR Manager" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Accountant
USER_ACCOUNTANT=$(api_call POST "/users" \
    "{\"mill_id\":\"$MILL_ID\",\"username\":\"accountant1\",\"email\":\"accountant1@mill.spinflow\",\"name\":\"Accountant One\",\"password\":\"Pass@1234\",\"role\":\"ACCOUNTANT\",\"department_id\":\"$DEPT_ACCOUNTS\",\"is_active\":true}" \
    "$TOKEN" "Create Accountant" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Finance Manager
USER_FIN_MGR=$(api_call POST "/users" \
    "{\"mill_id\":\"$MILL_ID\",\"username\":\"finmgr1\",\"email\":\"finmgr1@mill.spinflow\",\"name\":\"Finance Manager\",\"password\":\"Pass@1234\",\"role\":\"FINANCE_MANAGER\",\"department_id\":\"$DEPT_ACCOUNTS\",\"is_active\":true}" \
    "$TOKEN" "Create Finance Manager" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Sales Manager
USER_SALES_MGR=$(api_call POST "/users" \
    "{\"mill_id\":\"$MILL_ID\",\"username\":\"salesmgr1\",\"email\":\"salesmgr1@mill.spinflow\",\"name\":\"Sales Manager\",\"password\":\"Pass@1234\",\"role\":\"SALES_MANAGER\",\"department_id\":\"$DEPT_SPINNING\",\"is_active\":true}" \
    "$TOKEN" "Create Sales Manager" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Purchase Manager
USER_PURCHASE_MGR=$(api_call POST "/users" \
    "{\"mill_id\":\"$MILL_ID\",\"username\":\"purchasemgr1\",\"email\":\"purchasemgr1@mill.spinflow\",\"name\":\"Purchase Manager\",\"password\":\"Pass@1234\",\"role\":\"PURCHASE_MANAGER\",\"department_id\":\"$DEPT_STORES\",\"is_active\":true}" \
    "$TOKEN" "Create Purchase Manager" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Dispatch Manager
USER_DISPATCH_MGR=$(api_call POST "/users" \
    "{\"mill_id\":\"$MILL_ID\",\"username\":\"dispatchmgr1\",\"email\":\"dispatchmgr1@mill.spinflow\",\"name\":\"Dispatch Manager\",\"password\":\"Pass@1234\",\"role\":\"DISPATCH_MANAGER\",\"department_id\":\"$DEPT_STORES\",\"is_active\":true}" \
    "$TOKEN" "Create Dispatch Manager" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Auditor
USER_AUDITOR=$(api_call POST "/users" \
    "{\"mill_id\":\"$MILL_ID\",\"username\":\"auditor1\",\"email\":\"auditor1@mill.spinflow\",\"name\":\"Auditor One\",\"password\":\"Pass@1234\",\"role\":\"AUDITOR\",\"department_id\":\"$DEPT_ACCOUNTS\",\"is_active\":true}" \
    "$TOKEN" "Create Auditor" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Verify login for all 14 users
log "Verifying login for all users..."
USERS=("superadmin" "prodmgr1" "operator1" "qcmgr1" "qcinsp1" "storemgr1" "maintmgr1" "hrmgr1" "accountant1" "finmgr1" "salesmgr1" "purchasemgr1" "dispatchmgr1" "auditor1")
LOGIN_SUCCESS=0
LOGIN_FAIL=0

for user in "${USERS[@]}"; do
    if [ "$user" = "superadmin" ]; then
        password="Admin@1234"
    else
        password="Pass@1234"
    fi
    
    login_response=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/auth/login" \
        -H 'Content-Type: application/x-www-form-urlencoded' \
        -d "username=$user&password=$password")
    
    http_code=$(echo "$login_response" | tail -n1)
    
    if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
        success "Login verified for $user"
        ((LOGIN_SUCCESS++))
    else
        error "Login failed for $user"
        ((LOGIN_FAIL++))
    fi
done

echo ""
echo "Login Summary: $LOGIN_SUCCESS/14 successful"

echo ""
echo "=========================================="
echo "  PHASE 4: HR MODULE"
echo "=========================================="
echo ""

# Get HR Manager token
HR_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'username=hrmgr1&password=Pass@1234' \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Create 8 employees
log "Creating employees..."
EMP_1=$(api_call POST "/hr/employees" \
    "{\"mill_id\":\"$MILL_ID\",\"employee_code\":\"EMP001\",\"name\":\"Rajesh Kumar\",\"department_id\":\"$DEPT_SPINNING\",\"designation\":\"Operator\",\"date_of_joining\":\"2024-01-01\",\"phone\":\"9876543220\",\"email\":\"rajesh@mill.com\",\"basic_salary\":25000,\"is_active\":true}" \
    "$HR_TOKEN" "Create Employee 1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

EMP_2=$(api_call POST "/hr/employees" \
    "{\"mill_id\":\"$MILL_ID\",\"employee_code\":\"EMP002\",\"name\":\"Suresh Patil\",\"department_id\":\"$DEPT_SPINNING\",\"designation\":\"Operator\",\"date_of_joining\":\"2024-01-15\",\"phone\":\"9876543221\",\"email\":\"suresh@mill.com\",\"basic_salary\":25000,\"is_active\":true}" \
    "$HR_TOKEN" "Create Employee 2" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

EMP_3=$(api_call POST "/hr/employees" \
    "{\"mill_id\":\"$MILL_ID\",\"employee_code\":\"EMP003\",\"name\":\"Priya Sharma\",\"department_id\":\"$DEPT_QUALITY\",\"designation\":\"Inspector\",\"date_of_joining\":\"2024-02-01\",\"phone\":\"9876543222\",\"email\":\"priya@mill.com\",\"basic_salary\":28000,\"is_active\":true}" \
    "$HR_TOKEN" "Create Employee 3" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

EMP_4=$(api_call POST "/hr/employees" \
    "{\"mill_id\":\"$MILL_ID\",\"employee_code\":\"EMP004\",\"name\":\"Amit Desai\",\"department_id\":\"$DEPT_MAINT\",\"designation\":\"Technician\",\"date_of_joining\":\"2024-02-15\",\"phone\":\"9876543223\",\"email\":\"amit@mill.com\",\"basic_salary\":30000,\"is_active\":true}" \
    "$HR_TOKEN" "Create Employee 4" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

EMP_5=$(api_call POST "/hr/employees" \
    "{\"mill_id\":\"$MILL_ID\",\"employee_code\":\"EMP005\",\"name\":\"Kavita Joshi\",\"department_id\":\"$DEPT_STORES\",\"designation\":\"Store Keeper\",\"date_of_joining\":\"2024-03-01\",\"phone\":\"9876543224\",\"email\":\"kavita@mill.com\",\"basic_salary\":26000,\"is_active\":true}" \
    "$HR_TOKEN" "Create Employee 5" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

EMP_6=$(api_call POST "/hr/employees" \
    "{\"mill_id\":\"$MILL_ID\",\"employee_code\":\"EMP006\",\"name\":\"Ramesh Yadav\",\"department_id\":\"$DEPT_SPINNING\",\"designation\":\"Supervisor\",\"date_of_joining\":\"2024-03-15\",\"phone\":\"9876543225\",\"email\":\"ramesh@mill.com\",\"basic_salary\":35000,\"is_active\":true}" \
    "$HR_TOKEN" "Create Employee 6" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

EMP_7=$(api_call POST "/hr/employees" \
    "{\"mill_id\":\"$MILL_ID\",\"employee_code\":\"EMP007\",\"name\":\"Sneha Kulkarni\",\"department_id\":\"$DEPT_HR\",\"designation\":\"HR Executive\",\"date_of_joining\":\"2024-04-01\",\"phone\":\"9876543226\",\"email\":\"sneha@mill.com\",\"basic_salary\":32000,\"is_active\":true}" \
    "$HR_TOKEN" "Create Employee 7" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

EMP_8=$(api_call POST "/hr/employees" \
    "{\"mill_id\":\"$MILL_ID\",\"employee_code\":\"EMP008\",\"name\":\"Vijay Mehta\",\"department_id\":\"$DEPT_ACCOUNTS\",\"designation\":\"Accountant\",\"date_of_joining\":\"2024-04-15\",\"phone\":\"9876543227\",\"email\":\"vijay@mill.com\",\"basic_salary\":33000,\"is_active\":true}" \
    "$HR_TOKEN" "Create Employee 8" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Bulk attendance
log "Creating bulk attendance..."
api_call POST "/hr/attendance/bulk" \
    "{\"mill_id\":\"$MILL_ID\",\"date\":\"2026-05-22\",\"records\":[{\"employee_id\":\"$EMP_1\",\"status\":\"PRESENT\",\"in_time\":\"06:00\",\"out_time\":\"14:00\"},{\"employee_id\":\"$EMP_2\",\"status\":\"PRESENT\",\"in_time\":\"06:00\",\"out_time\":\"14:00\"},{\"employee_id\":\"$EMP_3\",\"status\":\"PRESENT\",\"in_time\":\"06:00\",\"out_time\":\"14:00\"},{\"employee_id\":\"$EMP_4\",\"status\":\"PRESENT\",\"in_time\":\"06:00\",\"out_time\":\"14:00\"},{\"employee_id\":\"$EMP_5\",\"status\":\"PRESENT\",\"in_time\":\"06:00\",\"out_time\":\"14:00\"},{\"employee_id\":\"$EMP_6\",\"status\":\"PRESENT\",\"in_time\":\"06:00\",\"out_time\":\"14:00\"},{\"employee_id\":\"$EMP_7\",\"status\":\"PRESENT\",\"in_time\":\"06:00\",\"out_time\":\"14:00\"},{\"employee_id\":\"$EMP_8\",\"status\":\"PRESENT\",\"in_time\":\"06:00\",\"out_time\":\"14:00\"}]}" \
    "$HR_TOKEN" "Bulk attendance for 8 employees" > /dev/null

# Leave request
log "Creating leave request..."
LEAVE_ID=$(api_call POST "/hr/leaves" \
    "{\"mill_id\":\"$MILL_ID\",\"employee_id\":\"$EMP_1\",\"leave_type\":\"CASUAL\",\"from_date\":\"2026-05-25\",\"to_date\":\"2026-05-26\",\"reason\":\"Personal work\",\"status\":\"PENDING\"}" \
    "$HR_TOKEN" "Create leave request" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Approve leave
log "Approving leave..."
api_call PUT "/hr/leaves/$LEAVE_ID/approve" \
    "{\"approved_by\":\"$USER_HR_MGR\",\"remarks\":\"Approved\"}" \
    "$HR_TOKEN" "Approve leave request" > /dev/null

echo ""
echo "=========================================="
echo "  PHASE 5: PRODUCTION MODULE"
echo "=========================================="
echo ""

# Get Production Manager token
PROD_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'username=prodmgr1&password=Pass@1234' \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Create 4 shift entries
log "Creating production shift entries..."
PROD_1=$(api_call POST "/production/shift-entries" \
    "{\"mill_id\":\"$MILL_ID\",\"shift_id\":\"$SHIFT_A\",\"machine_id\":\"$MACHINE_RF1\",\"yarn_count_id\":\"$COUNT_20S\",\"date\":\"2026-05-22\",\"production_kg\":500,\"operator_id\":\"$USER_OPERATOR\",\"status\":\"PENDING\"}" \
    "$PROD_TOKEN" "Create production entry 1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

PROD_2=$(api_call POST "/production/shift-entries" \
    "{\"mill_id\":\"$MILL_ID\",\"shift_id\":\"$SHIFT_B\",\"machine_id\":\"$MACHINE_RF1\",\"yarn_count_id\":\"$COUNT_20S\",\"date\":\"2026-05-22\",\"production_kg\":480,\"operator_id\":\"$USER_OPERATOR\",\"status\":\"PENDING\"}" \
    "$PROD_TOKEN" "Create production entry 2" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

PROD_3=$(api_call POST "/production/shift-entries" \
    "{\"mill_id\":\"$MILL_ID\",\"shift_id\":\"$SHIFT_A\",\"machine_id\":\"$MACHINE_RF2\",\"yarn_count_id\":\"$COUNT_30S\",\"date\":\"2026-05-22\",\"production_kg\":450,\"operator_id\":\"$USER_OPERATOR\",\"status\":\"PENDING\"}" \
    "$PROD_TOKEN" "Create production entry 3" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

PROD_4=$(api_call POST "/production/shift-entries" \
    "{\"mill_id\":\"$MILL_ID\",\"shift_id\":\"$SHIFT_B\",\"machine_id\":\"$MACHINE_RF2\",\"yarn_count_id\":\"$COUNT_30S\",\"date\":\"2026-05-22\",\"production_kg\":460,\"operator_id\":\"$USER_OPERATOR\",\"status\":\"PENDING\"}" \
    "$PROD_TOKEN" "Create production entry 4" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Create downtime
log "Creating downtime entry..."
DOWNTIME_ID=$(api_call POST "/production/downtimes" \
    "{\"mill_id\":\"$MILL_ID\",\"machine_id\":\"$MACHINE_RF1\",\"shift_id\":\"$SHIFT_A\",\"date\":\"2026-05-22\",\"start_time\":\"08:00\",\"end_time\":\"09:00\",\"reason\":\"Maintenance\",\"status\":\"OPEN\"}" \
    "$PROD_TOKEN" "Create downtime" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Approve all production entries
log "Approving production entries..."
api_call PUT "/production/shift-entries/$PROD_1/approve" "" "$PROD_TOKEN" "Approve production 1" > /dev/null
api_call PUT "/production/shift-entries/$PROD_2/approve" "" "$PROD_TOKEN" "Approve production 2" > /dev/null
api_call PUT "/production/shift-entries/$PROD_3/approve" "" "$PROD_TOKEN" "Approve production 3" > /dev/null
api_call PUT "/production/shift-entries/$PROD_4/approve" "" "$PROD_TOKEN" "Approve production 4" > /dev/null

# Resolve downtime
log "Resolving downtime..."
api_call PUT "/production/downtimes/$DOWNTIME_ID/resolve" \
    "{\"resolution\":\"Maintenance completed\",\"resolved_by\":\"$USER_MAINT_MGR\"}" \
    "$PROD_TOKEN" "Resolve downtime" > /dev/null

echo ""
echo "=========================================="
echo "  PHASE 6: QUALITY MODULE"
echo "=========================================="
echo ""

# Get Quality Manager token
QC_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'username=qcmgr1&password=Pass@1234' \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Create 2 lots
log "Creating quality lots..."
LOT_1=$(api_call POST "/quality/lots" \
    "{\"mill_id\":\"$MILL_ID\",\"lot_number\":\"LOT-20S-001\",\"yarn_count_id\":\"$COUNT_20S\",\"production_date\":\"2026-05-22\",\"quantity_kg\":980,\"status\":\"PENDING\"}" \
    "$QC_TOKEN" "Create Lot 1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

LOT_2=$(api_call POST "/quality/lots" \
    "{\"mill_id\":\"$MILL_ID\",\"lot_number\":\"LOT-30S-001\",\"yarn_count_id\":\"$COUNT_30S\",\"production_date\":\"2026-05-22\",\"quantity_kg\":910,\"status\":\"PENDING\"}" \
    "$QC_TOKEN" "Create Lot 2" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Create 2 tests
log "Creating quality tests..."
TEST_1=$(api_call POST "/quality/tests" \
    "{\"mill_id\":\"$MILL_ID\",\"lot_id\":\"$LOT_1\",\"test_type\":\"STRENGTH\",\"test_date\":\"2026-05-22\",\"tested_by\":\"$USER_QC_INSP\",\"result\":\"PASS\",\"remarks\":\"Good strength\"}" \
    "$QC_TOKEN" "Create Test 1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

TEST_2=$(api_call POST "/quality/tests" \
    "{\"mill_id\":\"$MILL_ID\",\"lot_id\":\"$LOT_2\",\"test_type\":\"STRENGTH\",\"test_date\":\"2026-05-22\",\"tested_by\":\"$USER_QC_INSP\",\"result\":\"PASS\",\"remarks\":\"Excellent quality\"}" \
    "$QC_TOKEN" "Create Test 2" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Approve both lots
log "Approving quality lots..."
api_call PUT "/quality/lots/$LOT_1/approve" "" "$QC_TOKEN" "Approve Lot 1" > /dev/null
api_call PUT "/quality/lots/$LOT_2/approve" "" "$QC_TOKEN" "Approve Lot 2" > /dev/null

# Verify lot status
log "Verifying lot status..."
LOT_1_STATUS=$(api_call GET "/quality/lots/$LOT_1" "" "$QC_TOKEN" "Get Lot 1 status" | python3 -c 'import sys,json; print(json.load(sys.stdin)["status"])' 2>/dev/null || echo "")
LOT_2_STATUS=$(api_call GET "/quality/lots/$LOT_2" "" "$QC_TOKEN" "Get Lot 2 status" | python3 -c 'import sys,json; print(json.load(sys.stdin)["status"])' 2>/dev/null || echo "")

if [ "$LOT_1_STATUS" = "APPROVED" ] && [ "$LOT_2_STATUS" = "APPROVED" ]; then
    success "Both lots approved successfully"
else
    error "Lot approval verification failed: LOT1=$LOT_1_STATUS, LOT2=$LOT_2_STATUS"
fi

echo ""
echo "=========================================="
echo "  PHASE 7: COTTON PURCHASE"
echo "=========================================="
echo ""

# Get Purchase Manager token
PURCHASE_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'username=purchasemgr1&password=Pass@1234' \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Create purchase order
log "Creating cotton purchase order..."
PO_ID=$(api_call POST "/purchase/orders" \
    "{\"mill_id\":\"$MILL_ID\",\"supplier_id\":\"$SUPPLIER_1\",\"po_number\":\"PO-2026-001\",\"po_date\":\"2026-05-22\",\"items\":[{\"item_name\":\"Cotton Bales\",\"quantity\":10000,\"unit\":\"KG\",\"rate\":80,\"amount\":800000}],\"total_amount\":800000,\"status\":\"APPROVED\"}" \
    "$PURCHASE_TOKEN" "Create purchase order" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Create GRN
log "Creating GRN..."
GRN_ID=$(api_call POST "/purchase/grns" \
    "{\"mill_id\":\"$MILL_ID\",\"po_id\":\"$PO_ID\",\"grn_number\":\"GRN-2026-001\",\"grn_date\":\"2026-05-22\",\"warehouse_id\":\"$WH_RAW\",\"items\":[{\"item_name\":\"Cotton Bales\",\"quantity\":10000,\"unit\":\"KG\",\"rate\":80}],\"status\":\"RECEIVED\"}" \
    "$PURCHASE_TOKEN" "Create GRN" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

echo ""
echo "=========================================="
echo "  PHASE 8: SALES ORDER"
echo "=========================================="
echo ""

# Get Sales Manager token
SALES_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'username=salesmgr1&password=Pass@1234' \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Create sales order
log "Creating sales order..."
SO_ID=$(api_call POST "/sales/orders" \
    "{\"mill_id\":\"$MILL_ID\",\"customer_id\":\"$CUSTOMER_1\",\"so_number\":\"SO-2026-001\",\"so_date\":\"2026-05-22\",\"items\":[{\"yarn_count_id\":\"$COUNT_20S\",\"quantity_kg\":500,\"rate\":250,\"amount\":125000}],\"total_amount\":125000,\"status\":\"PENDING\"}" \
    "$SALES_TOKEN" "Create sales order" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Confirm with different user (Finance Manager)
FIN_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'username=finmgr1&password=Pass@1234' \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

log "Confirming sales order..."
api_call PUT "/sales/orders/$SO_ID/confirm" "" "$FIN_TOKEN" "Confirm sales order" > /dev/null

# Verify stock reserved
log "Verifying stock reservation..."
SO_STATUS=$(api_call GET "/sales/orders/$SO_ID" "" "$SALES_TOKEN" "Get SO status" | python3 -c 'import sys,json; print(json.load(sys.stdin)["status"])' 2>/dev/null || echo "")

if [ "$SO_STATUS" = "CONFIRMED" ]; then
    success "Sales order confirmed and stock reserved"
else
    warning "Sales order status: $SO_STATUS"
fi

echo ""
echo "=========================================="
echo "  PHASE 9: LOTRAC"
echo "=========================================="
echo ""

# Get Dispatch Manager token
DISPATCH_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'username=dispatchmgr1&password=Pass@1234' \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Create trip
log "Creating LoTrac trip..."
TRIP_ID=$(api_call POST "/lotrac/trips" \
    "{\"mill_id\":\"$MILL_ID\",\"trip_number\":\"TRIP-001\",\"vehicle_id\":\"$VEHICLE_1\",\"driver_name\":\"Ramesh Patil\",\"driver_phone\":\"9876543212\",\"from_location\":\"Mill Warehouse\",\"to_location\":\"Customer Warehouse\",\"planned_departure\":\"2026-05-22T10:00:00Z\",\"status\":\"CREATED\"}" \
    "$DISPATCH_TOKEN" "Create trip" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Start loading
log "Starting loading..."
api_call PUT "/lotrac/trips/$TRIP_ID/start-loading" "" "$DISPATCH_TOKEN" "Start loading" > /dev/null

# Scan bags (simulate 10 bags)
log "Scanning bags..."
for i in {1..10}; do
    BAG_QR="BAG-LOT-20S-001-$(printf "%03d" $i)"
    api_call POST "/lotrac/trips/$TRIP_ID/scan" \
        "{\"qr_code\":\"$BAG_QR\",\"weight_kg\":50,\"lot_number\":\"LOT-20S-001\"}" \
        "$DISPATCH_TOKEN" "Scan bag $i" > /dev/null 2>&1 || true
done

# Depart
log "Departing trip..."
api_call PUT "/lotrac/trips/$TRIP_ID/depart" "" "$DISPATCH_TOKEN" "Depart trip" > /dev/null

# Receive all bags
log "Receiving bags..."
for i in {1..10}; do
    BAG_QR="BAG-LOT-20S-001-$(printf "%03d" $i)"
    api_call POST "/lotrac/trips/$TRIP_ID/receive" \
        "{\"qr_code\":\"$BAG_QR\",\"condition\":\"GOOD\"}" \
        "$DISPATCH_TOKEN" "Receive bag $i" > /dev/null 2>&1 || true
done

# Confirm POD
log "Confirming POD..."
api_call PUT "/lotrac/trips/$TRIP_ID/confirm-pod" \
    "{\"received_by\":\"Customer Representative\",\"remarks\":\"All bags received in good condition\"}" \
    "$DISPATCH_TOKEN" "Confirm POD" > /dev/null

echo ""
echo "=========================================="
echo "  PHASE 10: STORES"
echo "=========================================="
echo ""

# Get Store Manager token
STORE_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'username=storemgr1&password=Pass@1234' \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Create 3 spare parts
log "Creating spare parts..."
SPARE_1=$(api_call POST "/stores/spares" \
    "{\"mill_id\":\"$MILL_ID\",\"code\":\"SPARE-001\",\"name\":\"Bearing 6205\",\"category\":\"Bearings\",\"unit\":\"NOS\",\"min_stock\":10,\"max_stock\":100,\"current_stock\":50,\"unit_price\":150}" \
    "$STORE_TOKEN" "Create Spare 1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

SPARE_2=$(api_call POST "/stores/spares" \
    "{\"mill_id\":\"$MILL_ID\",\"code\":\"SPARE-002\",\"name\":\"V-Belt A-50\",\"category\":\"Belts\",\"unit\":\"NOS\",\"min_stock\":5,\"max_stock\":50,\"current_stock\":3,\"unit_price\":200}" \
    "$STORE_TOKEN" "Create Spare 2" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

SPARE_3=$(api_call POST "/stores/spares" \
    "{\"mill_id\":\"$MILL_ID\",\"code\":\"SPARE-003\",\"name\":\"Lubricant Oil 5L\",\"category\":\"Lubricants\",\"unit\":\"LTR\",\"min_stock\":20,\"max_stock\":200,\"current_stock\":100,\"unit_price\":500}" \
    "$STORE_TOKEN" "Create Spare 3" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Create issue
log "Creating spare issue..."
ISSUE_ID=$(api_call POST "/stores/issues" \
    "{\"mill_id\":\"$MILL_ID\",\"issue_number\":\"ISS-001\",\"department_id\":\"$DEPT_MAINT\",\"issued_to\":\"$USER_MAINT_MGR\",\"items\":[{\"spare_id\":\"$SPARE_1\",\"quantity\":5}],\"status\":\"ISSUED\"}" \
    "$STORE_TOKEN" "Create spare issue" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Check low stock alerts
log "Checking low stock alerts..."
LOW_STOCK=$(api_call GET "/stores/spares/low-stock" "" "$STORE_TOKEN" "Get low stock items" | python3 -c 'import sys,json; print(len(json.load(sys.stdin).get("data", [])))' 2>/dev/null || echo "0")

if [ "$LOW_STOCK" -gt 0 ]; then
    success "Low stock alerts: $LOW_STOCK items"
else
    warning "No low stock alerts found"
fi

echo ""
echo "=========================================="
echo "  PHASE 11: MAINTENANCE"
echo "=========================================="
echo ""

# Get Maintenance Manager token
MAINT_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'username=maintmgr1&password=Pass@1234' \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Create breakdown log
log "Creating breakdown log..."
BREAKDOWN_ID=$(api_call POST "/maintenance/breakdowns" \
    "{\"mill_id\":\"$MILL_ID\",\"machine_id\":\"$MACHINE_RF1\",\"reported_at\":\"2026-05-22T08:00:00Z\",\"reported_by\":\"$USER_OPERATOR\",\"issue_description\":\"Motor not starting\",\"priority\":\"HIGH\",\"status\":\"OPEN\"}" \
    "$MAINT_TOKEN" "Create breakdown log" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Create preventive maintenance schedule
log "Creating preventive maintenance schedule..."
PM_ID=$(api_call POST "/maintenance/schedules" \
    "{\"mill_id\":\"$MILL_ID\",\"machine_id\":\"$MACHINE_RF2\",\"schedule_type\":\"MONTHLY\",\"next_due_date\":\"2026-06-01\",\"description\":\"Monthly lubrication and inspection\",\"is_active\":true}" \
    "$MAINT_TOKEN" "Create PM schedule" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

echo ""
echo "=========================================="
echo "  PHASE 12: PAYROLL"
echo "=========================================="
echo ""

# Process payroll
log "Processing payroll..."
PAYROLL_ID=$(api_call POST "/payroll/process" \
    "{\"mill_id\":\"$MILL_ID\",\"month\":5,\"year\":2026}" \
    "$HR_TOKEN" "Process payroll for May 2026" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Approve with Finance Manager
log "Approving payroll..."
api_call PUT "/payroll/$PAYROLL_ID/approve" "" "$FIN_TOKEN" "Approve payroll" > /dev/null

# Get payslips
log "Getting payslips..."
PAYSLIPS=$(api_call GET "/payroll/$PAYROLL_ID/payslips" "" "$HR_TOKEN" "Get payslips" | python3 -c 'import sys,json; print(len(json.load(sys.stdin).get("data", [])))' 2>/dev/null || echo "0")

if [ "$PAYSLIPS" -gt 0 ]; then
    success "Generated $PAYSLIPS payslips"
else
    warning "No payslips generated"
fi

# Mark as paid
log "Marking payroll as paid..."
api_call PUT "/payroll/$PAYROLL_ID/mark-paid" "" "$FIN_TOKEN" "Mark payroll as paid" > /dev/null

echo ""
echo "=========================================="
echo "  PHASE 13: ACCOUNTS"
echo "=========================================="
echo ""

# Get Accountant token
ACC_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'username=accountant1&password=Pass@1234' \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Create invoice
log "Creating invoice..."
INVOICE_ID=$(api_call POST "/accounts/invoices" \
    "{\"mill_id\":\"$MILL_ID\",\"customer_id\":\"$CUSTOMER_1\",\"invoice_number\":\"INV-2026-001\",\"invoice_date\":\"2026-05-22\",\"so_id\":\"$SO_ID\",\"items\":[{\"description\":\"Yarn 20s\",\"quantity\":500,\"rate\":250,\"amount\":125000}],\"subtotal\":125000,\"cgst\":11250,\"sgst\":11250,\"total\":147500,\"status\":\"PENDING\"}" \
    "$ACC_TOKEN" "Create invoice" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Create payment
log "Creating payment..."
PAYMENT_ID=$(api_call POST "/accounts/payments" \
    "{\"mill_id\":\"$MILL_ID\",\"invoice_id\":\"$INVOICE_ID\",\"payment_date\":\"2026-05-22\",\"amount\":147500,\"payment_mode\":\"BANK_TRANSFER\",\"reference_number\":\"TXN123456\",\"status\":\"RECEIVED\"}" \
    "$ACC_TOKEN" "Create payment" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null || echo "")

# Check P&L
log "Checking P&L report..."
api_call GET "/accounts/reports/pl?from_date=2026-05-01&to_date=2026-05-31" "" "$ACC_TOKEN" "Get P&L report" > /dev/null

# Check receivables
log "Checking receivables..."
api_call GET "/accounts/reports/receivables" "" "$ACC_TOKEN" "Get receivables" > /dev/null

# Check GST report
log "Checking GST report..."
api_call GET "/accounts/reports/gst?month=5&year=2026" "" "$ACC_TOKEN" "Get GST report" > /dev/null

echo ""
echo "=========================================="
echo "  PHASE 14: DASHBOARD KPIs"
echo "=========================================="
echo ""

log "Fetching dashboard KPIs..."
DASHBOARD=$(api_call GET "/dashboard/kpis?mill_id=$MILL_ID" "" "$TOKEN" "Get dashboard KPIs")

PROD_TODAY=$(echo "$DASHBOARD" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("production_today_kg", 0))' 2>/dev/null || echo "0")
EFFICIENCY=$(echo "$DASHBOARD" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("efficiency_percent", 0))' 2>/dev/null || echo "0")
SELLABLE_LOTS=$(echo "$DASHBOARD" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("sellable_lots", 0))' 2>/dev/null || echo "0")
REVENUE=$(echo "$DASHBOARD" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("revenue_month", 0))' 2>/dev/null || echo "0")

echo "Production today: $PROD_TODAY kg"
echo "Efficiency: $EFFICIENCY%"
echo "Sellable lots: $SELLABLE_LOTS"
echo "Revenue month: ₹$REVENUE"

if [ "$PROD_TODAY" != "0" ] && [ "$SELLABLE_LOTS" != "0" ]; then
    success "Dashboard KPIs are non-zero"
else
    warning "Some KPIs are still zero"
fi

echo ""
echo "=========================================="
echo "  PHASE 15: EXPORTS"
echo "=========================================="
echo ""

# Production PDF
log "Exporting production PDF..."
api_call GET "/reports/production/pdf?from_date=2026-05-22&to_date=2026-05-22" "" "$PROD_TOKEN" "Export production PDF" > /dev/null

# Payroll Excel
log "Exporting payroll Excel..."
api_call GET "/reports/payroll/excel?month=5&year=2026" "" "$HR_TOKEN" "Export payroll Excel" > /dev/null

# Payslip PDF
log "Exporting payslip PDF..."
if [ -n "$EMP_1" ]; then
    api_call GET "/reports/payslip/pdf?employee_id=$EMP_1&month=5&year=2026" "" "$HR_TOKEN" "Export payslip PDF" > /dev/null
fi

echo ""
echo "=========================================="
echo "  PHASE 16: ACCESS CONTROL"
echo "=========================================="
echo ""

# Get Operator token
OP_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'username=operator1&password=Pass@1234' \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Get Auditor token
AUD_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'username=auditor1&password=Pass@1234' \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Test operator denied users endpoint
log "Testing operator denied access to users..."
response=$(curl -sS -w "\n%{http_code}" -X GET "$BASE_URL/users" \
    -H "Authorization: Bearer $OP_TOKEN" \
    -H "Content-Type: application/json")
http_code=$(echo "$response" | tail -n1)

if [[ "$http_code" == "403" ]]; then
    success "Operator correctly denied access to users endpoint"
else
    error "Operator should be denied access to users (got HTTP $http_code)"
fi

# Test auditor denied production write
log "Testing auditor denied production write..."
response=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/production/shift-entries" \
    -H "Authorization: Bearer $AUD_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"mill_id\":\"$MILL_ID\",\"shift_id\":\"$SHIFT_A\",\"machine_id\":\"$MACHINE_RF1\",\"yarn_count_id\":\"$COUNT_20S\",\"date\":\"2026-05-22\",\"production_kg\":100,\"operator_id\":\"$USER_OPERATOR\",\"status\":\"PENDING\"}")
http_code=$(echo "$response" | tail -n1)

if [[ "$http_code" == "403" ]]; then
    success "Auditor correctly denied production write access"
else
    error "Auditor should be denied production write (got HTTP $http_code)"
fi

echo ""
echo "=========================================="
echo "  TEST SUMMARY"
echo "=========================================="
echo ""
echo "Total API calls: $TOTAL_CALLS"
echo "Passed (2xx): $PASSED_CALLS"
echo "Failed (4xx/5xx): $FAILED_CALLS"
echo "Fixed during test: $FIXED_CALLS"

if [ $TOTAL_CALLS -gt 0 ]; then
    PASS_RATE=$((PASSED_CALLS * 100 / TOTAL_CALLS))
    echo "Pass rate: $PASS_RATE%"
fi

echo ""
echo "Test completed at $(date)"
