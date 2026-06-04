"""
Canonical field alias maps per module.
Each key is a SpinFlow system field name.
Each value is a list of Excel column header variants (lowercase, stripped).
"""

FIELD_ALIASES_BY_MODULE: dict[str, dict[str, list[str]]] = {
    "machines": {
        "code": [
            "code", "mc code", "machine code", "machine no", "machine number",
            "mc no", "mc_code", "machinecode", "item code", "asset code",
            "equipment code", "sl no", "si no", "serial no", "serial number",
            "sr no", "id", "machine id", "asset no", "asset number",
            "unit no", "unit number", "equipment no", "plant code",
            "m/c code", "m/c no", "mach code", "mach no",
        ],
        "name": [
            "name", "name of item", "item name", "machine name", "description",
            "machine description", "equipment name", "asset name", "item",
            "particulars", "name of machine", "model name",
        ],
        "machine_type": [
            "type no", "type number", "type", "model", "model no", "model number",
            "make", "manufacturer model", "machine type", "type of machine",
            "equipment type", "asset type",
        ],
        "department": [
            "department", "dept", "section", "area", "location", "dept name",
            "department name", "division",
        ],
        "target_kg": [
            "target kg", "target", "production target", "daily target",
            "target output", "daily output",
        ],
        "spindles": [
            "spindles", "spindle count", "no of spindles",
            "number of spindles", "spindle no", "no of delivery head",
            "delivery head", "heads", "no of heads", "delivery heads",
        ],
        "current_status": [
            "status", "condition", "machine status", "working status",
            "state", "operational status",
        ],
        "manufacturing_year": [
            "manufacturing year", "mfg year", "year", "year of manufacture",
            "manufacture year", "built year", "year made", "yom",
        ],
        "installation_date": [
            "installation date", "installed date", "comm date",
            "commissioning date", "commission date", "start date",
            "date of installation", "induction date", "purchase date",
        ],
        "serial_no": [
            "serial no", "serial number", "sr no", "asset serial",
        ],
        "remarks": ["remarks", "notes", "comment", "comments", "note", "observation"],
    },

    "employees": {
        "employee_code": [
            "employee code", "emp code", "emp no", "employee no",
            "staff id", "id", "code", "sl no", "si no", "serial no",
            "emp id", "staff no", "worker id", "sr no",
        ],
        "full_name": [
            "full name", "name", "employee name", "staff name",
            "worker name", "emp name", "employee",
        ],
        "department": ["department", "dept", "section", "division", "dept name"],
        "designation": [
            "designation", "post", "position", "job title",
            "cadre", "grade name", "rank", "role",
        ],
        "grade": ["grade", "pay grade", "level", "category", "class", "scale"],
        "gender": ["gender", "sex", "m/f", "male/female", "gen"],
        "basic": [
            "basic", "basic salary", "basic pay", "bs", "base pay",
            "basic wage", "basic amount",
        ],
        "wages": ["wages", "wage", "daily wage", "daily rate", "da"],
        "total_salary": [
            "total salary", "gross salary", "gross pay", "ctc",
            "total pay", "total", "gross",
        ],
        "house_rent": ["house rent", "hra", "house rent allowance", "rent allowance"],
        "medical": ["medical", "medical allowance", "medical allow"],
        "conveyance": ["conveyance", "conveyance allowance", "travel allowance", "ta"],
        "food_allowance": ["food allowance", "food allow", "food", "meal allowance"],
        "mobile_bill": ["mobile bill", "mobile", "phone bill", "mobile allowance"],
        "shift_benefit": [
            "shift benefit", "shift benifit", "shift allow", "shift allowance",
        ],
        "joining_date": [
            "joining date", "date of joining", "doj", "join date",
            "start date", "hired date", "joining",
        ],
        "date_of_birth": ["date of birth", "dob", "birth date", "born"],
        "phone": ["phone", "mobile no", "contact no", "cell", "phone no"],
        "aadhar": ["aadhar", "aadhaar", "aadhar no", "uid", "aadhar number"],
        "pf_no": ["pf no", "pf number", "provident fund no", "epf no"],
        "esic_no": ["esi no", "esi number", "esic no"],
        "bank_account": ["bank account", "account no", "bank ac", "acc no"],
        "bank_ifsc": ["ifsc", "ifsc code", "bank ifsc"],
        "shift": ["shift", "shift name", "working shift"],
        "days_of_month": ["days of month", "working days", "days", "month days"],
        "increment": ["increment", "increment amount"],
    },

    "departments": {
        "code": ["code", "dept code", "department code", "id"],
        "name": ["name", "department name", "dept name", "department"],
        "description": ["description", "details", "remarks"],
        "department_type": ["department type", "dept type", "type of department", "type"],
    },

    "customers": {
        "code": ["code", "customer code", "cust code", "id", "customer id"],
        "name": ["name", "customer name", "company name", "firm name", "party name"],
        "gstin": ["gstin", "gst no", "gst number", "gstin no"],
        "phone": ["phone", "mobile", "contact", "phone no", "telephone", "tel"],
        "city": ["city", "town", "location", "place"],
        "state": ["state", "province", "region"],
        "credit_limit": ["credit limit", "credit", "limit", "outstanding limit"],
        "payment_terms_days": ["payment terms", "terms", "payment days", "credit days"],
        "email": ["email", "email id", "mail"],
    },

    "yarn_counts": {
        "count": ["count", "yarn count", "ne", "count ne", "count value", "ne count"],
        "count_value": ["count value", "ne value", "value"],
        "blend": ["blend", "fibre", "fiber", "material", "composition"],
        "standard_csp": ["standard csp", "std csp", "csp", "csp value"],
        "twist_per_meter": ["twist per meter", "tpm", "twist"],
    },

    "vehicles": {
        "vehicle_no": [
            "vehicle no", "vehicle number", "reg no", "registration no",
            "plate no", "lorry no", "truck no", "vehicle",
        ],
        "vehicle_type": ["vehicle type", "type of vehicle", "transport type", "type"],
        "capacity_kg": ["capacity", "capacity kg", "load capacity", "weight capacity"],
        "driver_name": ["driver", "driver name", "driver's name", "operator"],
        "driver_phone": ["driver phone", "driver mobile", "driver contact", "driver no"],
        "make": ["make", "brand", "manufacturer"],
        "model": ["model", "model no", "vehicle model"],
    },

    "routes": {
        "code": ["code", "route code", "route id", "id"],
        "name": ["name", "route name", "route description"],
        "origin": ["origin", "from", "source", "start", "from location"],
        "destination": ["destination", "to", "end", "to location", "dest"],
        "distance_km": ["distance", "distance km", "km", "kilometres", "kilometers"],
        "estimated_hours": ["hours", "estimated hours", "travel time", "time hrs"],
    },
}
