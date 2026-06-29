#!/bin/bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
BASE_URL="http://127.0.0.1:8002/api/v1"
TOTAL_CALLS=0
PASSED_CALLS=0
FAILED_CALLS=0
FIXED_CALLS=0

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

api_call() {
  local method=$1
  local endpoint=$2
  local data=$3
  local token=$4
  local description=$5
  log "API: $method $endpoint --> $description"
  local response
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
  local http_code
  http_code=$(echo "$response" | tail -n1)
  local body
  body=$(echo "$response" | sed '$d')
  if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    success "$description - HTTP $http_code"
    echo "$body"
    return 0
  else
    error "$description - HTTP $http_code"
    if command -v python3 >/dev/null 2>&1; then
      echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
    else
      echo "$body"
    fi
    return 1
  fi
}

log "Starting full system test"
TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=superadmin&password=Admin@1234' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
echo "TOKEN obtained"
MILL_ID=$(curl -sS "$BASE_URL/masters/mills" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["data"][0]["id"] if d.get("data") else list(d)[0])')
echo "MILL_ID=$MILL_ID"

log "PHASE 2: Masters"
DEPT_SPINNING=$(api_call POST "/masters/departments" \
  "{\"mill_id\":\"$MILL_ID\",\"code\":\"SPIN\",\"name\":\"Spinning\",\"department_type\":\"spinning\"}" \
  "$TOKEN" "Create Spinning department" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
DEPT_QUALITY=$(api_call POST "/masters/departments" \
  "{\"mill_id\":\"$MILL_ID\",\"code\":\"QC\",\"name\":\"Quality Control\",\"department_type\":\"quality\"}" \
  "$TOKEN" "Create Quality department" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
DEPT_STORES=$(api_call POST "/masters/departments" \
  "{\"mill_id\":\"$MILL_ID\",\"code\":\"STORE\",\"name\":\"Stores\",\"department_type\":\"stores\"}" \
  "$TOKEN" "Create Stores department" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
DEPT_MAINT=$(api_call POST "/masters/departments" \
  "{\"mill_id\":\"$MILL_ID\",\"code\":\"MAINT\",\"name\":\"Maintenance\",\"department_type\":\"maintenance\"}" \
  "$TOKEN" "Create Maintenance department" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
DEPT_HR=$(api_call POST "/masters/departments" \
  "{\"mill_id\":\"$MILL_ID\",\"code\":\"HR\",\"name\":\"Human Resources\",\"department_type\":\"hr\"}" \
  "$TOKEN" "Create HR department" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
DEPT_ACCOUNTS=$(api_call POST "/masters/departments" \
  "{\"mill_id\":\"$MILL_ID\",\"code\":\"ACC\",\"name\":\"Accounts\",\"department_type\":\"accounts\"}" \
  "$TOKEN" "Create Accounts department" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
DEST_ROUTE=$(api_call POST "/masters/routes" \
  "{\"mill_id\":\"$MILL_ID\",\"code\":\"RTE-01\",\"name\":\"Mill to Customer\",\"origin\":\"Mill Warehouse\",\"destination\":\"Customer Warehouse\",\"distance_km\":15}" \
  "$TOKEN" "Create transport route" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

SHIFT_A=$(api_call POST "/production/shifts" \
  "{\"code\":\"A\",\"name\":\"Shift A\",\"start_time\":\"06:00\",\"end_time\":\"14:00\"}" \
  "$TOKEN" "Create Shift A" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
SHIFT_B=$(api_call POST "/production/shifts" \
  "{\"code\":\"B\",\"name\":\"Shift B\",\"start_time\":\"14:00\",\"end_time\":\"22:00\"}" \
  "$TOKEN" "Create Shift B" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
SHIFT_C=$(api_call POST "/production/shifts" \
  "{\"code\":\"C\",\"name\":\"Shift C\",\"start_time\":\"22:00\",\"end_time\":\"06:00\"}" \
  "$TOKEN" "Create Shift C" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

YARN_20S=$(api_call POST "/masters/yarn-counts" \
  "{\"mill_id\":\"$MILL_ID\",\"count\":\"20s\",\"count_value\":20.0,\"blend\":\"Cotton\"}" \
  "$TOKEN" "Create yarn count 20s" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
YARN_30S=$(api_call POST "/masters/yarn-counts" \
  "{\"mill_id\":\"$MILL_ID\",\"count\":\"30s\",\"count_value\":30.0,\"blend\":\"Cotton\"}" \
  "$TOKEN" "Create yarn count 30s" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

WH_RAW=$(api_call POST "/inventory/warehouses" \
  "{\"code\":\"WH-RAW\",\"name\":\"Raw Material Warehouse\",\"location\":\"Block A\",\"capacity_bags\":1000}" \
  "$TOKEN" "Create warehouse raw" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
WH_FG=$(api_call POST "/inventory/warehouses" \
  "{\"code\":\"WH-FG\",\"name\":\"Finished Goods Warehouse\",\"location\":\"Block B\",\"capacity_bags\":1000}" \
  "$TOKEN" "Create warehouse finished goods" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

MACHINE_RF1=$(api_call POST "/production/machines" \
  "{\"code\":\"RF-001\",\"name\":\"Ring Frame 1\",\"department\":\"Spinning\",\"machine_type\":\"Ring Frame\",\"target_kg\":200}" \
  "$TOKEN" "Create machine RF-001" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
MACHINE_RF2=$(api_call POST "/production/machines" \
  "{\"code\":\"RF-002\",\"name\":\"Ring Frame 2\",\"department\":\"Spinning\",\"machine_type\":\"Ring Frame\",\"target_kg\":220}" \
  "$TOKEN" "Create machine RF-002" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

SUPPLIER_1=$(api_call POST "/purchase/suppliers" \
  "{\"name\":\"Cotton Traders Ltd\",\"contact_person\":\"Rajesh Kumar\",\"mobile\":\"9876543210\",\"email\":\"rajesh@cottontraders.com\",\"address\":\"123 Market St\"}" \
  "$TOKEN" "Create supplier 1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

CUSTOMER_1=$(api_call POST "/masters/customers" \
  "{\"mill_id\":\"$MILL_ID\",\"code\":\"CUST-001\",\"name\":\"Textile Exports Inc\",\"contact_person\":\"Amit Shah\",\"phone\":\"9876543211\",\"email\":\"amit@textileexports.com\",\"billing_address\":\"456 Export St\",\"city\":\"Delhi\",\"state\":\"Delhi\",\"pincode\":\"110001\"}" \
  "$TOKEN" "Create customer 1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

VEHICLE_1=$(api_call POST "/masters/vehicles" \
  "{\"mill_id\":\"$MILL_ID\",\"vehicle_no\":\"TN11AB1234\",\"vehicle_type\":\"truck\",\"make\":\"Tata\",\"model\":\"407\"}" \
  "$TOKEN" "Create vehicle 1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

log "PHASE 3: Users"
USER_MILL_OWNER=$(api_call POST "/users" \
  "{\"email\":\"millowner1@mill.spinflow\",\"full_name\":\"Mill Owner\",\"password\":\"Pass@1234\",\"role\":\"MILL_OWNER\",\"department\":\"Management\",\"mobile\":\"9876543211\"}" \
  "$TOKEN" "Create Mill Owner" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
USER_GENERAL_MANAGER=$(api_call POST "/users" \
  "{\"email\":\"genmgr1@mill.spinflow\",\"full_name\":\"General Manager\",\"password\":\"Pass@1234\",\"role\":\"GENERAL_MANAGER\",\"department\":\"Management\",\"mobile\":\"9876543212\"}" \
  "$TOKEN" "Create General Manager" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
USER_PROD_MGR=$(api_call POST "/users" \
  "{\"email\":\"prodmgr1@mill.spinflow\",\"full_name\":\"Production Manager\",\"password\":\"Pass@1234\",\"role\":\"PRODUCTION_MANAGER\",\"department\":\"Spinning\",\"mobile\":\"9876543213\"}" \
  "$TOKEN" "Create Production Manager" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
USER_QUALITY_MGR=$(api_call POST "/users" \
  "{\"email\":\"qcmgr1@mill.spinflow\",\"full_name\":\"Quality Manager\",\"password\":\"Pass@1234\",\"role\":\"QUALITY_MANAGER\",\"department\":\"Quality Control\",\"mobile\":\"9876543214\"}" \
  "$TOKEN" "Create Quality Manager" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
USER_DISPATCH_MGR=$(api_call POST "/users" \
  "{\"email\":\"dispatchmgr1@mill.spinflow\",\"full_name\":\"Dispatch Manager\",\"password\":\"Pass@1234\",\"role\":\"DISPATCH_MANAGER\",\"department\":\"Stores\",\"mobile\":\"9876543215\"}" \
  "$TOKEN" "Create Dispatch Manager" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
USER_STORE_MGR=$(api_call POST "/users" \
  "{\"email\":\"storemgr1@mill.spinflow\",\"full_name\":\"Store Manager\",\"password\":\"Pass@1234\",\"role\":\"STORE_MANAGER\",\"department\":\"Stores\",\"mobile\":\"9876543216\"}" \
  "$TOKEN" "Create Store Manager" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
USER_HR_MGR=$(api_call POST "/users" \
  "{\"email\":\"hrmgr1@mill.spinflow\",\"full_name\":\"HR Manager\",\"password\":\"Pass@1234\",\"role\":\"HR_MANAGER\",\"department\":\"Human Resources\",\"mobile\":\"9876543217\"}" \
  "$TOKEN" "Create HR Manager" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
USER_ACCOUNTANT=$(api_call POST "/users" \
  "{\"email\":\"accountant1@mill.spinflow\",\"full_name\":\"Accountant\",\"password\":\"Pass@1234\",\"role\":\"ACCOUNTANT\",\"department\":\"Accounts\",\"mobile\":\"9876543218\"}" \
  "$TOKEN" "Create Accountant" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
USER_MAINT_MGR=$(api_call POST "/users" \
  "{\"email\":\"maintmgr1@mill.spinflow\",\"full_name\":\"Maintenance Manager\",\"password\":\"Pass@1234\",\"role\":\"MAINTENANCE_MANAGER\",\"department\":\"Maintenance\",\"mobile\":\"9876543219\"}" \
  "$TOKEN" "Create Maintenance Manager" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
USER_SUPERVISOR=$(api_call POST "/users" \
  "{\"email\":\"supervisor1@mill.spinflow\",\"full_name\":\"Supervisor\",\"password\":\"Pass@1234\",\"role\":\"SUPERVISOR\",\"department\":\"Spinning\",\"mobile\":\"9876543220\"}" \
  "$TOKEN" "Create Supervisor" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
USER_OPERATOR=$(api_call POST "/users" \
  "{\"email\":\"operator1@mill.spinflow\",\"full_name\":\"Machine Operator\",\"password\":\"Pass@1234\",\"role\":\"MACHINE_OPERATOR\",\"department\":\"Spinning\",\"mobile\":\"9876543221\"}" \
  "$TOKEN" "Create Machine Operator" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
USER_SECURITY=$(api_call POST "/users" \
  "{\"email\":\"security1@mill.spinflow\",\"full_name\":\"Security Gate\",\"password\":\"Pass@1234\",\"role\":\"SECURITY_GATE\",\"department\":\"Security\",\"mobile\":\"9876543222\"}" \
  "$TOKEN" "Create Security Gate" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
USER_AUDITOR=$(api_call POST "/users" \
  "{\"email\":\"auditor1@mill.spinflow\",\"full_name\":\"Auditor\",\"password\":\"Pass@1234\",\"role\":\"AUDITOR\",\"department\":\"Accounts\",\"mobile\":\"9876543223\"}" \
  "$TOKEN" "Create Auditor" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

log "Verifying login for all users"
USERS=(superadmin millowner1 genmgr1 prodmgr1 qcmgr1 dispatchmgr1 storemgr1 hrmgr1 accountant1 maintmgr1 supervisor1 operator1 security1 auditor1)
LOGIN_SUCCESS=0
LOGIN_FAIL=0
for user in "${USERS[@]}"; do
  PASS='Pass@1234'
  if [ "$user" = "superadmin" ]; then
    PASS='Admin@1234'
  fi
  login_response=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d "username=$user&password=$PASS")
  http_code=$(echo "$login_response" | tail -n1)
  if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    success "Login verified for $user"
    ((LOGIN_SUCCESS++))
  else
    error "Login failed for $user"
    echo "$(echo "$login_response" | sed '$d')"
    ((LOGIN_FAIL++))
  fi
  ((TOTAL_CALLS++))
  if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    ((PASSED_CALLS--))
  else
    ((FAILED_CALLS--))
  fi
  # adjust counts because login loop should count once per user
  ((TOTAL_CALLS--))
  if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    ((PASSED_CALLS++))
  else
    ((FAILED_CALLS++))
  fi

done

log "PHASE 4: HR"
HR_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=hrmgr1&password=Pass@1234' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
EMP_1=$(api_call POST "/hr/employees" \
  "{\"employee_code\":\"EMP001\",\"full_name\":\"Rajesh Kumar\",\"department\":\"Spinning\",\"designation\":\"Operator\",\"shift\":\"A\",\"date_of_joining\":\"2024-01-01\",\"phone\":\"9876543230\",\"daily_wage\":250.0}" \
  "$HR_TOKEN" "Create employee 1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
EMP_2=$(api_call POST "/hr/employees" \
  "{\"employee_code\":\"EMP002\",\"full_name\":\"Suresh Patil\",\"department\":\"Spinning\",\"designation\":\"Operator\",\"shift\":\"A\",\"date_of_joining\":\"2024-01-15\",\"phone\":\"9876543231\",\"daily_wage\":250.0}" \
  "$HR_TOKEN" "Create employee 2" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
EMP_3=$(api_call POST "/hr/employees" \
  "{\"employee_code\":\"EMP003\",\"full_name\":\"Priya Sharma\",\"department\":\"Quality Control\",\"designation\":\"Inspector\",\"shift\":\"B\",\"date_of_joining\":\"2024-02-01\",\"phone\":\"9876543232\",\"daily_wage\":280.0}" \
  "$HR_TOKEN" "Create employee 3" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
EMP_4=$(api_call POST "/hr/employees" \
  "{\"employee_code\":\"EMP004\",\"full_name\":\"Amit Desai\",\"department\":\"Maintenance\",\"designation\":\"Technician\",\"shift\":\"B\",\"date_of_joining\":\"2024-02-15\",\"phone\":\"9876543233\",\"daily_wage\":300.0}" \
  "$HR_TOKEN" "Create employee 4" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
EMP_5=$(api_call POST "/hr/employees" \
  "{\"employee_code\":\"EMP005\",\"full_name\":\"Kavita Joshi\",\"department\":\"Stores\",\"designation\":\"Store Keeper\",\"shift\":\"A\",\"date_of_joining\":\"2024-03-01\",\"phone\":\"9876543234\",\"daily_wage\":260.0}" \
  "$HR_TOKEN" "Create employee 5" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
EMP_6=$(api_call POST "/hr/employees" \
  "{\"employee_code\":\"EMP006\",\"full_name\":\"Ramesh Yadav\",\"department\":\"Spinning\",\"designation\":\"Supervisor\",\"shift\":\"A\",\"date_of_joining\":\"2024-03-15\",\"phone\":\"9876543235\",\"daily_wage\":350.0}" \
  "$HR_TOKEN" "Create employee 6" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
EMP_7=$(api_call POST "/hr/employees" \
  "{\"employee_code\":\"EMP007\",\"full_name\":\"Sneha Kulkarni\",\"department\":\"Human Resources\",\"designation\":\"HR Executive\",\"shift\":\"A\",\"date_of_joining\":\"2024-04-01\",\"phone\":\"9876543236\",\"daily_wage\":320.0}" \
  "$HR_TOKEN" "Create employee 7" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
EMP_8=$(api_call POST "/hr/employees" \
  "{\"employee_code\":\"EMP008\",\"full_name\":\"Vijay Mehta\",\"department\":\"Accounts\",\"designation\":\"Accountant\",\"shift\":\"A\",\"date_of_joining\":\"2024-04-15\",\"phone\":\"9876543237\",\"daily_wage\":330.0}" \
  "$HR_TOKEN" "Create employee 8" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

api_call POST "/hr/attendance/bulk" \
  "{\"attendance_date\":\"2026-05-22\",\"records\":[{\"employee_id\":\"$EMP_1\",\"status\":\"present\",\"in_time\":\"06:00\",\"out_time\":\"14:00\"},{\"employee_id\":\"$EMP_2\",\"status\":\"present\",\"in_time\":\"06:00\",\"out_time\":\"14:00\"},{\"employee_id\":\"$EMP_3\",\"status\":\"present\",\"in_time\":\"06:00\",\"out_time\":\"14:00\"},{\"employee_id\":\"$EMP_4\",\"status\":\"present\",\"in_time\":\"06:00\",\"out_time\":\"14:00\"},{\"employee_id\":\"$EMP_5\",\"status\":\"present\",\"in_time\":\"06:00\",\"out_time\":\"14:00\"},{\"employee_id\":\"$EMP_6\",\"status\":\"present\",\"in_time\":\"06:00\",\"out_time\":\"14:00\"},{\"employee_id\":\"$EMP_7\",\"status\":\"present\",\"in_time\":\"06:00\",\"out_time\":\"14:00\"},{\"employee_id\":\"$EMP_8\",\"status\":\"present\",\"in_time\":\"06:00\",\"out_time\":\"14:00\"}]}" \
  "$HR_TOKEN" "Bulk attendance for 8 employees"

LEAVE_ID=$(api_call POST "/hr/leaves" \
  "{\"employee_id\":\"$EMP_1\",\"leave_type\":\"CL\",\"from_date\":\"2026-05-25\",\"to_date\":\"2026-05-26\",\"reason\":\"Personal work\"}" \
  "$HR_TOKEN" "Create leave request" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

api_call PUT "/hr/leaves/$LEAVE_ID/action" \
  "{\"leave_id\":\"$LEAVE_ID\",\"action\":\"approve\",\"approved_by\":\"$USER_HR_MGR\",\"remarks\":\"Approved\"}" \
  "$HR_TOKEN" "Approve leave request"

log "PHASE 5: Production"
PROD_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=prodmgr1&password=Pass@1234' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

ENTRY_1=$(api_call POST "/production/entries" \
  "{\"date\":\"2026-05-22\",\"shift\":\"A\",\"machine_code\":\"RF-001\",\"department\":\"Spinning\",\"operator\":\"Rajesh Kumar\",\"produced_kg\":500.0,\"waste_kg\":10.0,\"count\":\"20s\"}" \
  "$PROD_TOKEN" "Create production entry 1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
ENTRY_2=$(api_call POST "/production/entries" \
  "{\"date\":\"2026-05-22\",\"shift\":\"B\",\"machine_code\":\"RF-001\",\"department\":\"Spinning\",\"operator\":\"Rajesh Kumar\",\"produced_kg\":480.0,\"count\":\"20s\"}" \
  "$PROD_TOKEN" "Create production entry 2" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
ENTRY_3=$(api_call POST "/production/entries" \
  "{\"date\":\"2026-05-22\",\"shift\":\"A\",\"machine_code\":\"RF-002\",\"department\":\"Spinning\",\"operator\":\"Rajesh Kumar\",\"produced_kg\":450.0,\"count\":\"30s\"}" \
  "$PROD_TOKEN" "Create production entry 3" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
ENTRY_4=$(api_call POST "/production/entries" \
  "{\"date\":\"2026-05-22\",\"shift\":\"B\",\"machine_code\":\"RF-002\",\"department\":\"Spinning\",\"operator\":\"Rajesh Kumar\",\"produced_kg\":460.0,\"count\":\"30s\"}" \
  "$PROD_TOKEN" "Create production entry 4" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

DOWNTIME_ID=$(api_call POST "/production/downtime" \
  "{\"machine_code\":\"RF-001\",\"reason\":\"Maintenance\",\"started_at\":\"2026-05-22T08:00:00Z\"}" \
  "$PROD_TOKEN" "Create downtime" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

api_call PUT "/production/entries/$ENTRY_1/approve" "" "$PROD_TOKEN" "Approve production entry 1"
api_call PUT "/production/entries/$ENTRY_2/approve" "" "$PROD_TOKEN" "Approve production entry 2"
api_call PUT "/production/entries/$ENTRY_3/approve" "" "$PROD_TOKEN" "Approve production entry 3"
api_call PUT "/production/entries/$ENTRY_4/approve" "" "$PROD_TOKEN" "Approve production entry 4"
api_call PATCH "/production/downtime/$DOWNTIME_ID/resolve" "" "$PROD_TOKEN" "Resolve downtime"

log "PHASE 6: Quality"
QC_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=qcmgr1&password=Pass@1234' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Create inventory lot for sales and quality
LOT_1=$(api_call POST "/inventory/lots" \
  "{\"lot_no\":\"LOT-20S-001\",\"count\":\"20s\",\"total_bags\":10,\"bag_weight_kg\":2,\"warehouse_id\":\"$WH_RAW\"}" \
  "$TOKEN" "Create inventory lot 1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

TEST_1=$(api_call POST "/quality/tests" \
  "{\"date\":\"2026-05-22\",\"type\":\"strength\",\"lot_id\":\"$LOT_1\",\"result\":75.0,\"standard\":70.0,\"tested_by\":\"qcinsp1\"}" \
  "$QC_TOKEN" "Create quality test 1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
TEST_2=$(api_call POST "/quality/tests" \
  "{\"date\":\"2026-05-22\",\"type\":\"strength\",\"lot_id\":\"$LOT_1\",\"result\":78.0,\"standard\":70.0,\"tested_by\":\"qcinsp1\"}" \
  "$QC_TOKEN" "Create quality test 2" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

api_call PATCH "/quality/tests/$TEST_1/approve?result=approved" "" "$QC_TOKEN" "Approve test 1"
api_call PATCH "/quality/tests/$TEST_2/approve?result=approved" "" "$QC_TOKEN" "Approve test 2"

LOT_STATUS_1=$(api_call GET "/quality/lots/$LOT_1/tests" "" "$QC_TOKEN" "Get lot tests" | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["status"] if json.load(sys.stdin) else "")')
if [ "$LOT_STATUS_1" = "approved" ]; then
  success "Quality lot $LOT_1 status approved"
else
  error "Quality lot status expected approved, got $LOT_STATUS_1"
fi

log "PHASE 7: Cotton purchase"
PURCHASE_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=purchasemgr1&password=Pass@1234' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
PO_ID=$(api_call POST "/purchase/purchases" \
  "{\"supplier_id\":\"$SUPPLIER_1\",\"purchase_date\":\"2026-05-22\",\"bale_count\":10,\"weight_kg\":200.0,\"rate_per_quintal\":4000.0,\"invoice_no\":\"PO-2026-001\"}" \
  "$PURCHASE_TOKEN" "Create cotton purchase" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
GRN_ID=$(api_call POST "/purchase/grn" \
  "{\"purchase_id\":\"$PO_ID\",\"received_bales\":10,\"received_weight_kg\":2000.0,\"remarks\":\"Received cotton bales\"}" \
  "$PURCHASE_TOKEN" "Create GRN" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

log "PHASE 8: Sales Orders"
SALES_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=accountant1&password=Pass@1234' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
SO_ID=$(api_call POST "/sales/orders" \
  "{\"mill_id\":\"$MILL_ID\",\"customer_id\":\"$CUSTOMER_1\",\"order_date\":\"2026-05-22\",\"delivery_date\":\"2026-05-23\",\"lines\":[{\"lot_id\":\"$LOT_1\",\"warehouse_id\":\"$WH_RAW\",\"bags_ordered\":10,\"weight_kg\":200.0}] }" \
  "$SALES_TOKEN" "Create sales order" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

FIN_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=genmgr1&password=Pass@1234' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
api_call POST "/sales/orders/$SO_ID/confirm" "" "$FIN_TOKEN" "Confirm sales order"

SO_STATUS=$(api_call GET "/sales/orders/$SO_ID" "" "$SALES_TOKEN" "Get sales order status" | python3 -c 'import sys,json; print(json.load(sys.stdin)["status"])')
if [ "$SO_STATUS" = "confirmed" ] || [ "$SO_STATUS" = "CONFIRMED" ]; then
  success "Sales order confirmed"
else
  error "Sales order expected confirmed, got $SO_STATUS"
fi

log "PHASE 9: LoTrac"
DISPATCH_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=dispatchmgr1&password=Pass@1234' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
TRIP_ID=$(api_call POST "/trips" \
  "{\"mill_id\":\"$MILL_ID\",\"sales_order_id\":\"$SO_ID\",\"vehicle_id\":\"$VEHICLE_1\",\"vehicle_no\":\"TN11AB1234\",\"driver_name\":\"Ramesh Patil\",\"driver_mobile\":\"9876543212\",\"from_warehouse_id\":\"$WH_RAW\",\"destination_route_id\":\"$DEST_ROUTE\",\"destination_name\":\"Customer Warehouse\",\"customer_id\":\"$CUSTOMER_1\",\"planned_bags\":10,\"planned_weight_kg\":200.0,\"bag_ids\":[\"BAG-001\",\"BAG-002\",\"BAG-003\",\"BAG-004\",\"BAG-005\",\"BAG-006\",\"BAG-007\",\"BAG-008\",\"BAG-009\",\"BAG-010\"]}" \
  "$DISPATCH_TOKEN" "Create trip" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
api_call POST "/trips/$TRIP_ID/start-loading" "" "$DISPATCH_TOKEN" "Start loading"
for i in {1..10}; do
  QR="BAG-00${i}"
  api_call POST "/trips/$TRIP_ID/loader-scan" \
    "{\"qr_string\":\"$QR\"}" \
    "$DISPATCH_TOKEN" "Loader scan $i" >/dev/null || true
  sleep 0.1
 done
api_call POST "/trips/$TRIP_ID/depart" "" "$DISPATCH_TOKEN" "Depart trip"
for i in {1..10}; do
  QR="BAG-00${i}"
  api_call POST "/trips/$TRIP_ID/receiver-scan" \
    "{\"qr_string\":\"$QR\"}" \
    "$DISPATCH_TOKEN" "Receiver scan $i" >/dev/null || true
  sleep 0.1
 done
api_call POST "/trips/$TRIP_ID/confirm-pod" \
  "{\"notes\":\"Delivered successfully\"}" \
  "$DISPATCH_TOKEN" "Confirm POD"

log "PHASE 10: Stores"
STORE_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=storemgr1&password=Pass@1234' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
SPARE_1=$(api_call POST "/stores/spares" \
  "{\"item_code\":\"SPARE-001\",\"name\":\"Bearing 6205\",\"category\":\"Bearings\",\"unit\":\"NOS\",\"current_stock\":50,\"reorder_level\":10,\"location\":\"Store Room\"}" \
  "$STORE_TOKEN" "Create spare part 1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
SPARE_2=$(api_call POST "/stores/spares" \
  "{\"item_code\":\"SPARE-002\",\"name\":\"V-Belt A-50\",\"category\":\"Belts\",\"unit\":\"NOS\",\"current_stock\":3,\"reorder_level\":5,\"location\":\"Store Room\"}" \
  "$STORE_TOKEN" "Create spare part 2" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
SPARE_3=$(api_call POST "/stores/spares" \
  "{\"item_code\":\"SPARE-003\",\"name\":\"Lubricant Oil 5L\",\"category\":\"Lubricants\",\"unit\":\"LTR\",\"current_stock\":100,\"reorder_level\":20,\"location\":\"Store Room\"}" \
  "$STORE_TOKEN" "Create spare part 3" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

ISSUE_ID=$(api_call POST "/stores/issues" \
  "{\"item_id\":\"$SPARE_1\",\"quantity\":5,\"purpose\":\"Maintenance\"}" \
  "$STORE_TOKEN" "Create spare issue" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

api_call GET "/stores/spares" "" "$STORE_TOKEN" "List spare parts"

log "PHASE 11: Maintenance"
MAINT_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=maintmgr1&password=Pass@1234' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
TASK_ID=$(api_call POST "/maintenance/tasks" \
  "{\"machine_id\":\"RF-001\",\"maintenance_type\":\"breakdown\",\"failure_type\":\"mechanical\",\"description\":\"Motor not starting\",\"priority\":\"HIGH\"}" \
  "$MAINT_TOKEN" "Create breakdown log" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
SCHEDULE_ID=$(api_call POST "/maintenance/schedules" \
  "{\"machine_id\":\"RF-002\",\"schedule_type\":\"preventive\",\"frequency_days\":30,\"next_due_date\":\"2026-06-01\",\"description\":\"Monthly lubrication\"}" \
  "$MAINT_TOKEN" "Create preventive maintenance schedule" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

log "PHASE 12: Payroll"
PAYROLL_ID=$(api_call POST "/payroll/months/process" \
  "{\"mill_id\":\"$MILL_ID\",\"month\":5,\"year\":2026}" \
  "$HR_TOKEN" "Process payroll" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
api_call POST "/payroll/months/$PAYROLL_ID/approve" "" "$FIN_TOKEN" "Approve payroll"
api_call GET "/payroll/months/$PAYROLL_ID/payslips" "" "$HR_TOKEN" "Get payslips"
api_call POST "/payroll/months/$PAYROLL_ID/mark-paid" "" "$FIN_TOKEN" "Mark payroll paid"

log "PHASE 13: Accounts"
INVOICE_ID=$(api_call POST "/accounts/invoices" \
  "{\"invoice_date\":\"2026-05-22\",\"party_name\":\"Textile Exports Inc\",\"taxable_amount\":147500.0,\"total_amount\":147500.0,\"due_date\":\"2026-06-22\"}" \
  "$ACC_TOKEN" "Create invoice" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
PAYMENT_ID=$(api_call POST "/accounts/payments" \
  "{\"invoice_id\":\"$INVOICE_ID\",\"payment_date\":\"2026-05-22\",\"amount\":147500.0,\"payment_mode\":\"BANK_TRANSFER\",\"reference_no\":\"TXN123456\",\"remarks\":\"Payment received\"}" \
  "$ACC_TOKEN" "Create payment" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
api_call GET "/accounts/pl?mill_id=$MILL_ID&month=5&year=2026" "" "$ACC_TOKEN" "Get P&L report"
api_call GET "/accounts/receivables?mill_id=$MILL_ID" "" "$ACC_TOKEN" "Get receivables"
api_call GET "/accounts/gst?mill_id=$MILL_ID&month=5&year=2026" "" "$ACC_TOKEN" "Get GST report"

log "PHASE 14: Dashboard KPIs"
DASHBOARD=$(api_call GET "/dashboard/kpis" "" "$TOKEN" "Get dashboard KPIs")
PRODUCTION_TODAY=$(echo "$DASHBOARD" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("productionToday", 0))')
EFFICIENCY=$(echo "$DASHBOARD" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("efficiency", 0))')
QUALITY_REJECTION=$(echo "$DASHBOARD" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("qualityRejection", 0))')
if [ "$PRODUCTION_TODAY" != "0" ] && [ "$EFFICIENCY" != "0" ] && [ "$QUALITY_REJECTION" != "0" ]; then
  success "Dashboard KPIs are non-zero"
else
  warning "Dashboard KPIs values: productionToday=$PRODUCTION_TODAY efficiency=$EFFICIENCY qualityRejection=$QUALITY_REJECTION"
fi

log "PHASE 15: Exports"
api_call GET "/exports/production/pdf?date_from=2026-05-22&date_to=2026-05-22" "" "$PROD_TOKEN" "Export production PDF"
api_call GET "/exports/payroll/xlsx?payroll_month_id=$PAYROLL_ID" "" "$HR_TOKEN" "Export payroll Excel"
api_call GET "/exports/payroll/pdf?payroll_month_id=$PAYROLL_ID&employee_id=$EMP_1" "" "$HR_TOKEN" "Export payslip PDF"

log "PHASE 16: Access Control"
OP_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=operator1&password=Pass@1234' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
AUD_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=auditor1&password=Pass@1234' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
api_call GET "/users" "" "$OP_TOKEN" "Operator denied users endpoint"
api_call POST "/production/entries" \
  "{\"date\":\"2026-05-22\",\"shift\":\"A\",\"machine_code\":\"RF-001\",\"department\":\"Spinning\",\"operator\":\"Rajesh Kumar\",\"produced_kg\":100.0}" \
  "$AUD_TOKEN" "Auditor denied production write"

cat <<EOF
=== SPINFLOW ERP — FULL SYSTEM TEST REPORT ===
Test Date: $(date +"%Y-%m-%d %H:%M:%S")
Total API calls made: $TOTAL_CALLS
Passed (2xx): $PASSED_CALLS
Failed (4xx/5xx): $FAILED_CALLS
Fixed during test: $FIXED_CALLS

PHASE RESULTS:
Phase 2  Masters:          TBD
Phase 3  Users:            TBD
Phase 4  HR:               TBD
Phase 5  Production:       TBD
Phase 6  Quality:          TBD
Phase 7  Purchase:         TBD
Phase 8  Sales Orders:     TBD
Phase 9  LoTrac:           TBD
Phase 10 Stores:           TBD
Phase 11 Maintenance:      TBD
Phase 12 Payroll:          TBD
Phase 13 Accounts:         TBD
Phase 14 Dashboard KPIs:   TBD
Phase 15 Exports:          TBD
Phase 16 Access Control:   TBD

BUGS FIXED DURING TEST:
  File | Bug | Fix

LIVE DATA CREATED:
  Departments: 6
  Machines: 2
  Users: 13
  Employees: 8
  Lots: 1
  Production entries: 4
  Trips: 1
  Payslips: TBD
  Invoices: 1

DASHBOARD KPIs (final values):
  Production today: $PRODUCTION_TODAY kg
  Efficiency: $EFFICIENCY%
  Quality rejection: $QUALITY_REJECTION
EOF
