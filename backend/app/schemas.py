import re
from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal

from pydantic import (
    BaseModel,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


class AdminLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime


class LoginResult(BaseModel):
    """Either a session, or the demand for a second step."""

    access_token: str | None = None
    token_type: str = "bearer"
    expires_at: datetime | None = None
    mfa_required: bool = False
    challenge_token: str | None = None


class MfaLogin(BaseModel):
    challenge_token: str
    code: str = Field(min_length=6, max_length=12)


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=10, max_length=128)


class MfaVerify(BaseModel):
    code: str = Field(min_length=6, max_length=10)


class MfaDisable(BaseModel):
    password: str = Field(min_length=1)


class MfaSetupOut(BaseModel):
    secret: str
    otpauth_uri: str
    qr_png: str


class BackupCodesOut(BaseModel):
    codes: list[str] = []


class SessionOut(BaseModel):
    id: int
    device: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    revoked_at: datetime | None = None
    revoked_reason: str | None = None
    is_current: bool = False


class AccountOut(BaseModel):
    id: int
    email: EmailStr
    name: str | None = None
    is_active: bool
    created_at: datetime
    password_changed_at: datetime | None = None
    totp_enabled: bool = False
    totp_enabled_at: datetime | None = None
    backup_codes_left: int = 0
    active_sessions: int = 0


class AdminOut(BaseModel):
    id: int
    email: EmailStr
    name: str | None = None
    is_active: bool
    created_at: datetime
    # The console hides what the caller cannot use, rather than letting them
    # click into a 403.
    role: str = "owner"
    permissions: dict[str, str] = {}

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------
# Company
# --------------------------------------------------------------------------

CompanyType = Literal["proprietorship", "partnership_llp", "private_limited"]

# Statutory formats (India). Kept permissive on case — values are upper-cased.
GSTIN_RE = r"^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$"
PAN_RE = r"^[A-Z]{5}\d{4}[A-Z]$"
CIN_RE = r"^[LUu]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$"
TAN_RE = r"^[A-Z]{4}\d{5}[A-Z]$"


class CompanyBase(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    slug: str | None = Field(default=None, max_length=180)
    company_type: CompanyType
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=32)
    address: str | None = None

    gstin: str | None = Field(default=None, max_length=15)
    pan: str | None = Field(default=None, max_length=10)
    cin: str | None = Field(default=None, max_length=21)
    tan: str | None = Field(default=None, max_length=10)
    pf_code: str | None = Field(default=None, max_length=32)
    esic_code: str | None = Field(default=None, max_length=32)
    pt_number: str | None = Field(default=None, max_length=32)

    @field_validator(
        "slug", "phone", "address", "pf_code", "esic_code", "pt_number", mode="before"
    )
    @classmethod
    def _blank_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v.strip() if isinstance(v, str) else v

    @field_validator("gstin", "pan", "cin", "tan", mode="before")
    @classmethod
    def _upper_or_none(cls, v):
        if isinstance(v, str):
            v = v.strip().upper()
            return v or None
        return v

    @field_validator("slug")
    @classmethod
    def _slug_format(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.lower()
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", v):
            raise ValueError(
                "Slug may contain lowercase letters, numbers and single hyphens only"
            )
        return v

    @field_validator("gstin")
    @classmethod
    def _gstin_format(cls, v: str | None) -> str | None:
        if v and not re.fullmatch(GSTIN_RE, v):
            raise ValueError("GSTIN must be 15 characters, e.g. 29ABCDE1234F1Z5")
        return v

    @field_validator("pan")
    @classmethod
    def _pan_format(cls, v: str | None) -> str | None:
        if v and not re.fullmatch(PAN_RE, v):
            raise ValueError("PAN must be 10 characters, e.g. ABCDE1234F")
        return v

    @field_validator("cin")
    @classmethod
    def _cin_format(cls, v: str | None) -> str | None:
        if v and not re.fullmatch(CIN_RE, v):
            raise ValueError("CIN must be 21 characters, e.g. U72200KA2015PTC012345")
        return v

    @field_validator("tan")
    @classmethod
    def _tan_format(cls, v: str | None) -> str | None:
        if v and not re.fullmatch(TAN_RE, v):
            raise ValueError("TAN must be 10 characters, e.g. BLRA12345C")
        return v


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(CompanyBase):
    """Same rules as create — the edit form submits the whole profile."""


class CompanyOut(BaseModel):
    id: int
    company_uid: str
    name: str
    slug: str
    company_type: CompanyType
    logo_path: str | None
    logo_url: str | None = None
    email: EmailStr | None
    phone: str | None
    address: str | None
    gstin: str | None
    pan: str | None
    cin: str | None
    tan: str | None
    pf_code: str | None
    esic_code: str | None
    pt_number: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------
# Employee
# --------------------------------------------------------------------------

Gender = Literal["male", "female", "other"]
MaritalStatus = Literal["single", "married", "divorced", "widowed"]
EmploymentType = Literal["full_time", "part_time", "contract", "intern", "consultant"]
EmployeeStatus = Literal[
    "active", "probation", "notice_period", "resigned", "terminated", "on_leave"
]
DocType = Literal[
    "id_proof", "address_proof", "degree_certificate", "experience_letter",
    "offer_letter", "payslip", "letter", "other",
]

IFSC_RE = r"^[A-Z]{4}0[A-Z0-9]{6}$"

_OPTIONAL_TEXT = (
    "middle_name", "blood_group", "phone", "alternate_phone", "current_address",
    "permanent_address", "emergency_contact_name", "emergency_contact_relation",
    "emergency_contact_phone", "work_location",
    "pf_number", "esic_number", "bank_account_name", "bank_account_number",
    "bank_name",
)


class EmployeeBase(BaseModel):
    # Personal
    first_name: str = Field(min_length=1, max_length=80)
    middle_name: str | None = Field(default=None, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    gender: Gender | None = None
    date_of_birth: date | None = None
    blood_group: str | None = Field(default=None, max_length=8)
    marital_status: MaritalStatus | None = None

    # Contact
    work_email: EmailStr
    personal_email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=32)
    alternate_phone: str | None = Field(default=None, max_length=32)
    current_address: str | None = None
    permanent_address: str | None = None
    emergency_contact_name: str | None = Field(default=None, max_length=120)
    emergency_contact_relation: str | None = Field(default=None, max_length=48)
    emergency_contact_phone: str | None = Field(default=None, max_length=32)

    # Employment
    designation_id: int | None = None
    department_id: int | None = None
    employment_type: EmploymentType = "full_time"
    work_location: str | None = Field(default=None, max_length=120)
    date_of_joining: date
    probation_end_date: date | None = None
    date_of_exit: date | None = None
    status: EmployeeStatus = "active"
    reporting_manager_id: int | None = None

    # Payroll & statutory
    ctc_annual: Decimal | None = Field(default=None, ge=0, le=Decimal("9999999999"))
    pan: str | None = Field(default=None, max_length=10)
    aadhaar: str | None = Field(default=None, max_length=12)
    uan: str | None = Field(default=None, max_length=12)
    pf_number: str | None = Field(default=None, max_length=32)
    esic_number: str | None = Field(default=None, max_length=32)
    bank_account_name: str | None = Field(default=None, max_length=120)
    bank_account_number: str | None = Field(default=None, max_length=32)
    bank_ifsc: str | None = Field(default=None, max_length=11)
    bank_name: str | None = Field(default=None, max_length=120)

    @field_validator(*_OPTIONAL_TEXT, mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        if isinstance(v, str):
            return v.strip() or None
        return v

    @field_validator("personal_email", "pan", "aadhaar", "uan", "bank_ifsc", mode="before")
    @classmethod
    def _empty_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @field_validator("pan", "bank_ifsc", mode="before")
    @classmethod
    def _upper(cls, v):
        return v.strip().upper() if isinstance(v, str) else v

    @field_validator("pan")
    @classmethod
    def _pan_format(cls, v):
        if v and not re.fullmatch(PAN_RE, v):
            raise ValueError("PAN must be 10 characters, e.g. ABCDE1234F")
        return v

    @field_validator("bank_ifsc")
    @classmethod
    def _ifsc_format(cls, v):
        if v and not re.fullmatch(IFSC_RE, v):
            raise ValueError("IFSC must be 11 characters, e.g. HDFC0001234")
        return v

    @field_validator("aadhaar")
    @classmethod
    def _aadhaar_format(cls, v):
        if v:
            digits = re.sub(r"\s+", "", v)
            if not re.fullmatch(r"\d{12}", digits):
                raise ValueError("Aadhaar must be 12 digits")
            return digits
        return v

    @field_validator("uan")
    @classmethod
    def _uan_format(cls, v):
        if v and not re.fullmatch(r"\d{12}", v.strip()):
            raise ValueError("UAN must be 12 digits")
        return v.strip() if v else v

    @model_validator(mode="after")
    def _check_dates(self):
        if self.date_of_exit and self.date_of_exit < self.date_of_joining:
            raise ValueError("Date of exit cannot be before the date of joining")
        if self.date_of_birth and self.date_of_birth >= self.date_of_joining:
            raise ValueError("Date of birth must be before the date of joining")
        return self


class EmployeeCreate(EmployeeBase):
    # Only honoured when manual codes are enabled in employee settings.
    employee_code: str | None = Field(default=None, max_length=20)


class EmployeeUpdate(EmployeeBase):
    """The edit form submits the whole record."""


class EmployeeDocumentOut(BaseModel):
    id: int
    doc_type: DocType
    title: str | None
    file_path: str
    file_url: str | None = None
    original_name: str | None
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class EmployeeOut(EmployeeBase):
    id: int
    # Never the number itself: the screens show the mask, and an admin with
    # write access can ask for the full value through its own endpoint.
    aadhaar_masked: str | None = None
    employee_code: str
    full_name: str
    designation: str | None = None
    department: str | None = None
    photo_path: str | None
    photo_url: str | None = None
    reporting_manager_name: str | None = None
    documents: list[EmployeeDocumentOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EmployeeListItem(BaseModel):
    id: int
    employee_code: str
    full_name: str
    work_email: EmailStr
    designation: str | None
    department: str | None
    employment_type: EmploymentType
    status: EmployeeStatus
    date_of_joining: date
    photo_url: str | None = None

    model_config = {"from_attributes": True}


class EmployeePage(BaseModel):
    items: list[EmployeeListItem]
    total: int
    page: int
    page_size: int
    pages: int


# --------------------------------------------------------------------------
# Lookups (departments / designations)
# --------------------------------------------------------------------------


class LookupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name", mode="before")
    @classmethod
    def _clean(cls, v):
        if isinstance(v, str):
            # Collapse internal whitespace so "Senior  Engineer" can't shadow
            # an existing "Senior Engineer".
            return re.sub(r"\s+", " ", v).strip()
        return v


class LookupUpdate(LookupCreate):
    is_active: bool = True


class LookupOut(BaseModel):
    id: int
    name: str
    is_active: bool
    in_use: int = 0

    model_config = {"from_attributes": True}



# --------------------------------------------------------------------------
# Letter templates
# --------------------------------------------------------------------------


class TemplateInput(BaseModel):
    name: str = Field(min_length=1, max_length=48)
    label: str = Field(min_length=1, max_length=120)
    type: Literal["text", "textarea", "date"] = "text"
    required: bool = False


class LetterTemplateBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    category: str = Field(min_length=1, max_length=48)
    subject: str = Field(min_length=2, max_length=200)
    body: str = Field(min_length=10)
    required_fields: list[str] = []
    inputs: list[TemplateInput] = []
    is_active: bool = True


class LetterTemplateCreate(LetterTemplateBase):
    key: str = Field(min_length=2, max_length=48)

    @field_validator("key")
    @classmethod
    def _key_format(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.fullmatch(r"[a-z0-9_]+", v):
            raise ValueError("Key may contain lowercase letters, numbers and underscores")
        return v


class LetterTemplateUpdate(LetterTemplateBase):
    pass


class LetterTemplateOut(LetterTemplateBase):
    id: int
    key: str
    is_builtin: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LetterTemplateListItem(BaseModel):
    id: int
    key: str
    name: str
    category: str
    subject: str
    inputs: list[TemplateInput] = []
    required_fields: list[str] = []
    is_active: bool
    is_builtin: bool

    model_config = {"from_attributes": True}


class LetterRenderRequest(BaseModel):
    values: dict[str, str] = {}


class LetterPreviewOut(BaseModel):
    subject: str
    html: str
    missing_fields: list[str] = []
    unknown_placeholders: list[str] = []


class MergeFieldOut(BaseModel):
    name: str
    label: str


# --------------------------------------------------------------------------
# Shifts & attendance
# --------------------------------------------------------------------------

AttendanceStatus = Literal[
    "present",
    "half_day",
    "absent",
    "weekly_off",
    "holiday",
    "on_leave",
    "not_marked",
]
# What an admin may set by hand; `None` hands the day back to the punches.
ManualStatus = Literal["present", "half_day", "absent", "on_leave", "holiday"]
PunchSource = Literal["biometric", "manual", "web", "import"]
ContinuationMode = Literal["auto", "forced", "excluded"]
PunchDirection = Literal["in", "out", "auto"]


class ShiftBase(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    code: str = Field(min_length=1, max_length=16)
    start_time: time
    end_time: time
    break_minutes: int = Field(default=60, ge=0, le=480)
    grace_in_minutes: int = Field(default=10, ge=0, le=180)
    grace_out_minutes: int = Field(default=10, ge=0, le=180)
    full_day_minutes: int | None = Field(default=None, ge=0, le=1440)
    half_day_minutes: int | None = Field(default=None, ge=0, le=1440)
    # In shifts: 1 = may carry on for another whole shift, 0.5 = half of one.
    # No ceiling — how far a shift may carry on is the company's call.
    max_continuation_shifts: Decimal = Field(default=Decimal("1"), ge=0)
    early_in_hours: int = Field(default=4, ge=0, le=12)
    weekly_offs: list[int] = Field(default_factory=list)
    is_active: bool = True

    @field_validator("code", mode="before")
    @classmethod
    def _code(cls, v):
        return v.strip().upper() if isinstance(v, str) else v

    @field_validator("weekly_offs")
    @classmethod
    def _offs(cls, v: list[int]) -> list[int]:
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("Weekly offs must be 0 (Monday) to 6 (Sunday)")
        return sorted(set(v))

    @model_validator(mode="after")
    def _times(self):
        if self.start_time == self.end_time:
            raise ValueError("Start and end time cannot be the same")
        return self


class ShiftCreate(ShiftBase):
    pass


class ShiftUpdate(ShiftBase):
    pass


class ShiftOut(ShiftBase):
    id: int
    is_overnight: bool
    duration_minutes: int
    paid_minutes: int
    continuation_window_minutes: int = 0
    assigned_count: int = 0

    model_config = {"from_attributes": True}


class ShiftAssignmentCreate(BaseModel):
    employee_ids: list[int] = Field(min_length=1)
    shift_id: int
    effective_from: date
    effective_to: date | None = None

    @model_validator(mode="after")
    def _range(self):
        if self.effective_to and self.effective_to < self.effective_from:
            raise ValueError("Effective to cannot be before effective from")
        return self


class ShiftAssignmentOut(BaseModel):
    id: int
    employee_id: int
    employee_name: str | None = None
    employee_code: str | None = None
    shift_id: int
    shift_name: str | None = None
    effective_from: date
    effective_to: date | None

    model_config = {"from_attributes": True}


class PunchIn(BaseModel):
    """One raw event, as sent by a device or typed in by an admin."""

    employee_id: int | None = None
    employee_code: str | None = None
    punch_at: datetime
    direction: PunchDirection = "auto"
    source: PunchSource = "biometric"
    device_id: str | None = None
    external_id: str | None = None
    note: str | None = None

    @model_validator(mode="after")
    def _identifier(self):
        if self.employee_id is None and not self.employee_code:
            raise ValueError("Provide employee_id or employee_code")
        return self


class PunchBatch(BaseModel):
    punches: list[PunchIn] = Field(min_length=1, max_length=5000)


class PunchOut(BaseModel):
    id: int
    employee_id: int
    punch_at: datetime
    direction: PunchDirection
    source: PunchSource
    device_id: str | None
    note: str | None

    model_config = {"from_attributes": True}


class PunchIngestResult(BaseModel):
    received: int
    stored: int
    duplicates: int
    unmatched: list[str] = []
    recomputed_days: int


class AttendanceDayOut(BaseModel):
    id: int
    employee_id: int
    employee_name: str | None = None
    employee_code: str | None = None
    attendance_date: date
    shift_id: int | None
    shift_name: str | None = None
    first_in: datetime | None
    last_out: datetime | None
    worked_minutes: int
    overtime_minutes: int
    late_minutes: int
    early_exit_minutes: int
    is_continued: bool
    continued_minutes: int
    # How much of a shift the spill amounts to: 0.5 is half a shift, 1 a whole
    # one. Hours alone say nothing without the shift they are measured against.
    continued_shifts: Decimal = Decimal("0")
    continued_into_shift_id: int | None
    continued_into_shift_name: str | None = None
    status: AttendanceStatus
    has_manual_punch: bool
    continuation_mode: ContinuationMode = "auto"
    continuation_override_minutes: int = 0
    continuation_note: str | None = None
    status_override: str | None = None
    status_note: str | None = None
    remarks: str | None
    punches: list[PunchOut] = []

    model_config = {"from_attributes": True}


class DayStatusUpdate(BaseModel):
    employee_id: int
    attendance_date: date
    status: ManualStatus | None = None
    note: str | None = Field(default=None, max_length=255)


class DayRosterEntry(BaseModel):
    employee_id: int
    employee_name: str | None = None
    employee_code: str | None = None
    department: str | None = None
    shift_id: int | None = None
    shift_name: str | None = None
    shift_window: str | None = None
    day: AttendanceDayOut | None = None
    status: AttendanceStatus = "not_marked"
    is_overridden: bool = False
    punches: list[PunchOut] = []


class DayRoster(BaseModel):
    attendance_date: date
    is_closed: bool = False
    entries: list[DayRosterEntry] = []


class ContinuationUpdate(BaseModel):
    mode: ContinuationMode
    minutes: int = Field(default=0, ge=0, le=24 * 60)
    note: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def _minutes_required(self):
        if self.mode == "forced" and self.minutes <= 0:
            raise ValueError("Say how long the shift continued for")
        return self


class MatrixCell(BaseModel):
    day: int
    status: AttendanceStatus | None = None
    worked_minutes: int = 0
    overtime_minutes: int = 0
    late_minutes: int = 0
    is_continued: bool = False
    continuation_mode: ContinuationMode = "auto"
    shift_code: str | None = None


class MatrixRow(BaseModel):
    employee_id: int
    employee_name: str | None = None
    employee_code: str | None = None
    department: str | None = None
    cells: list[MatrixCell] = []
    present: Decimal = Decimal("0")
    absent: int = 0
    leave: int = 0
    off: int = 0
    worked_minutes: int = 0
    overtime_minutes: int = 0
    continued: int = 0


class AttendanceMatrix(BaseModel):
    month: str
    days: int
    rows: list[MatrixRow] = []


class AttendancePage(BaseModel):
    items: list[AttendanceDayOut]
    total: int
    page: int
    page_size: int
    pages: int


class AttendanceSummary(BaseModel):
    employees: int
    present: int
    half_day: int
    absent: int
    weekly_off: int
    continued: int
    total_overtime_minutes: int


class RecomputeRequest(BaseModel):
    date_from: date
    date_to: date
    employee_id: int | None = None

    @model_validator(mode="after")
    def _range(self):
        if self.date_to < self.date_from:
            raise ValueError("date_to cannot be before date_from")
        if (self.date_to - self.date_from).days > 186:
            raise ValueError("Recompute at most six months at a time")
        return self


class RecomputeResult(BaseModel):
    days: int
    employees: int


# --------------------------------------------------------------------------
# Shift roster (rotation chart)
# --------------------------------------------------------------------------


class RosterShift(BaseModel):
    id: int
    name: str
    code: str
    start_time: time
    end_time: time
    is_overnight: bool


class RosterEmployee(BaseModel):
    employee_id: int
    employee_name: str
    employee_code: str
    department: str | None = None
    designation: str | None = None
    # date (ISO) -> shift id, or None when unassigned / weekly off
    days: dict[str, int | None] = {}
    offs: list[str] = []


class RosterOut(BaseModel):
    date_from: date
    date_to: date
    dates: list[date]
    shifts: list[RosterShift]
    employees: list[RosterEmployee]
    total: int


class AssignmentHistoryItem(BaseModel):
    id: int
    employee_id: int
    employee_name: str
    employee_code: str
    shift_id: int
    shift_name: str
    shift_code: str
    effective_from: date
    effective_to: date | None
    is_current: bool


class AssignmentHistoryPage(BaseModel):
    items: list[AssignmentHistoryItem]
    total: int
    page: int
    page_size: int
    pages: int


# --------------------------------------------------------------------------
# Attendance settings
# --------------------------------------------------------------------------

PayrollBasis = Literal["shift_hours", "working_days", "calendar_days"]


class AttendanceSettingsBase(BaseModel):
    payroll_basis: PayrollBasis = "shift_hours"
    standard_monthly_days: int = Field(default=26, ge=1, le=31)
    round_punch_minutes: int = Field(default=0, ge=0, le=60)
    overtime_enabled: bool = True
    overtime_min_minutes: int = Field(default=30, ge=0, le=480)
    overtime_max_minutes_per_day: int = Field(default=240, ge=0, le=960)
    overtime_multiplier: Decimal = Field(
        default=Decimal("1.50"), ge=Decimal("0"), le=Decimal("5")
    )
    continuation_counts_as_overtime: bool = True
    auto_absent_without_punch: bool = True
    allow_manual_punch: bool = True
    manual_punch_requires_reason: bool = False
    week_starts_on: int = Field(default=0, ge=0, le=6)


class AttendanceSettingsUpdate(AttendanceSettingsBase):
    pass


class AttendanceSettingsOut(AttendanceSettingsBase):
    id: int
    updated_at: datetime

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------
# Payroll
# --------------------------------------------------------------------------

LopBasis = Literal["standard_days", "calendar_days", "working_days", "shift_hours"]
RateBasis = Literal["basic", "gross"]
ComponentKind = Literal["earning", "deduction"]
ComponentCalc = Literal["percent_of_gross", "percent_of_basic", "fixed", "balance"]
RunStatus = Literal["draft", "approved", "paid"]
PayslipTemplate = Literal["classic", "modern", "compact"]


class PayrollSettingsBase(BaseModel):
    lop_basis: LopBasis = "standard_days"
    standard_days_per_month: int = Field(default=26, ge=1, le=31)
    round_net_to: int = Field(default=1, ge=0, le=100)
    pay_overtime: bool = True
    overtime_rate_basis: RateBasis = "basic"
    overtime_multiplier: Decimal = Field(default=Decimal("1.50"), ge=0, le=5)
    leave_encashment_enabled: bool = True
    encashment_basis: RateBasis = "basic"
    pf_enabled: bool = True
    pf_employee_percent: Decimal = Field(default=Decimal("12"), ge=0, le=100)
    pf_employer_percent: Decimal = Field(default=Decimal("12"), ge=0, le=100)
    pf_wage_ceiling: Decimal = Field(default=Decimal("15000"), ge=0)
    pf_cap_at_ceiling: bool = True
    esi_enabled: bool = True
    esi_employee_percent: Decimal = Field(default=Decimal("0.75"), ge=0, le=100)
    esi_employer_percent: Decimal = Field(default=Decimal("3.25"), ge=0, le=100)
    esi_gross_ceiling: Decimal = Field(default=Decimal("21000"), ge=0)
    pt_enabled: bool = True
    pt_amount: Decimal = Field(default=Decimal("200"), ge=0)
    tds_enabled: bool = False
    tds_default_regime: Literal["new", "old"] = "new"
    payslip_template: PayslipTemplate = "classic"
    bonus_enabled: bool = True
    bonus_eligibility_ceiling: Decimal = Field(default=Decimal("21000"), ge=0)
    bonus_calculation_ceiling: Decimal = Field(default=Decimal("7000"), ge=0)
    bonus_minimum_wage: Decimal = Field(default=Decimal("0"), ge=0)
    bonus_min_percent: Decimal = Field(default=Decimal("8.33"), ge=0, le=100)
    bonus_max_percent: Decimal = Field(default=Decimal("20"), ge=0, le=100)
    bonus_rate_percent: Decimal = Field(default=Decimal("8.33"), ge=0, le=100)
    bonus_min_days: int = Field(default=30, ge=0, le=366)
    bonus_basis: Literal["basic", "basic_da", "gross"] = "basic_da"
    advance_enabled: bool = True
    advance_default_percent: Decimal = Field(default=Decimal("30"), ge=0, le=100)
    advance_max_percent: Decimal = Field(default=Decimal("50"), ge=0, le=100)
    advance_allow_custom_amount: bool = True
    advance_basis: Literal["basic", "gross"] = "gross"


class PayrollSettingsUpdate(PayrollSettingsBase):
    pass


class PayrollSettingsOut(PayrollSettingsBase):
    id: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class SalaryComponentBase(BaseModel):
    code: str = Field(min_length=1, max_length=24)
    name: str = Field(min_length=1, max_length=80)
    kind: ComponentKind
    calculation: ComponentCalc
    value: Decimal = Field(default=Decimal("0"), ge=0)
    prorate_on_lop: bool = True
    is_taxable: bool = True
    include_in_pf: bool = False
    include_in_esi: bool = True
    sort_order: int = 0
    is_active: bool = True

    @field_validator("code", mode="before")
    @classmethod
    def _code(cls, v):
        return re.sub(r"\s+", "_", v.strip()).upper() if isinstance(v, str) else v


class SalaryComponentCreate(SalaryComponentBase):
    pass


class SalaryComponentOut(SalaryComponentBase):
    id: int

    model_config = {"from_attributes": True}


class LeaveTypeBase(BaseModel):
    code: str = Field(min_length=1, max_length=16)
    name: str = Field(min_length=1, max_length=80)
    monthly_accrual: Decimal = Field(default=Decimal("1.5"), ge=0, le=31)
    annual_cap: Decimal | None = Field(default=None, ge=0)
    is_paid: bool = True
    carry_forward: bool = False
    carry_forward_cap: Decimal | None = Field(default=None, ge=0)
    encash_unused: bool = True
    encashment_percent: Decimal = Field(default=Decimal("100"), ge=0, le=100)
    requires_approval: bool = True
    allow_half_day: bool = True
    min_notice_days: int = Field(default=0, ge=0, le=365)
    max_consecutive_days: Decimal | None = Field(default=None, ge=0)
    allow_negative_balance: bool = False
    applicable_after_days: int = Field(default=0, ge=0, le=3650)
    applies_to: AppliesTo = "all"
    is_active: bool = True

    @field_validator("code", mode="before")
    @classmethod
    def _code(cls, v):
        return v.strip().upper() if isinstance(v, str) else v


class LeaveTypeCreate(LeaveTypeBase):
    pass


class LeaveTypeOut(LeaveTypeBase):
    id: int

    model_config = {"from_attributes": True}


class PayslipLine(BaseModel):
    code: str
    name: str
    amount: Decimal
    note: str | None = None


class LeaveLine(BaseModel):
    code: str
    name: str
    opening: Decimal
    accrued: Decimal
    used: Decimal
    encashed: Decimal
    lapsed: Decimal
    closing: Decimal
    encashment_amount: Decimal


class PayslipOut(BaseModel):
    id: int
    run_id: int
    employee_id: int
    employee_name: str | None = None
    employee_code: str | None = None
    designation: str | None = None
    monthly_gross: Decimal
    period_days: Decimal
    payable_days: Decimal
    lop_days: Decimal
    worked_minutes: int
    overtime_minutes: int
    earnings: list[PayslipLine] = []
    deductions: list[PayslipLine] = []
    employer_contributions: list[PayslipLine] = []
    leave: list[LeaveLine] = []
    gross_pay: Decimal
    total_deductions: Decimal
    net_pay: Decimal

    model_config = {"from_attributes": True}


class PayrollRunOut(BaseModel):
    id: int
    period: date
    status: RunStatus
    total_gross: Decimal
    total_deductions: Decimal
    total_net: Decimal
    employee_count: int
    notes: str | None
    created_at: datetime
    computed_at: datetime | None

    model_config = {"from_attributes": True}


class PayrollRunDetail(PayrollRunOut):
    payslips: list[PayslipOut] = []


class PayrollRunCreate(BaseModel):
    period: date
    notes: str | None = None


class PayrollRunStatusUpdate(BaseModel):
    status: RunStatus


class PayslipLayoutBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    base: PayslipTemplate = "classic"
    options: dict = {}
    is_default: bool = False


class PayslipLayoutCreate(PayslipLayoutBase):
    pass


class PayslipLayoutOut(PayslipLayoutBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PayslipPreviewRequest(BaseModel):
    """Preview an unsaved design, optionally against a real payslip."""

    base: PayslipTemplate = "classic"
    options: dict = {}
    run_id: int | None = None
    employee_id: int | None = None


class PayslipPreviewOut(BaseModel):
    html: str
    sample: bool


# --------------------------------------------------------------------------
# Leave requests & payroll inputs
# --------------------------------------------------------------------------

LeaveStatus = Literal["pending", "approved", "rejected", "cancelled"]
AppliesTo = Literal["all", "male", "female"]
InputKind = Literal[
    "bonus", "incentive", "reimbursement", "arrear", "overtime",
    "lop_reversal", "deduction", "advance", "loan_emi",
]


class LeaveRequestCreate(BaseModel):
    employee_id: int
    leave_type_id: int
    start_date: date
    end_date: date
    is_half_day: bool = False
    reason: str | None = None

    @model_validator(mode="after")
    def _range(self):
        if self.end_date < self.start_date:
            raise ValueError("End date cannot be before the start date")
        if self.is_half_day and self.end_date != self.start_date:
            raise ValueError("A half day must start and end on the same date")
        return self


class LeaveDecision(BaseModel):
    status: LeaveStatus
    decision_note: str | None = None


class LeaveRequestOut(BaseModel):
    id: int
    employee_id: int
    employee_name: str | None = None
    employee_code: str | None = None
    leave_type_id: int
    leave_type_name: str | None = None
    leave_type_code: str | None = None
    is_paid: bool = True
    start_date: date
    end_date: date
    days: Decimal
    is_half_day: bool
    reason: str | None
    status: LeaveStatus
    decision_note: str | None
    decided_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class LeaveRequestPage(BaseModel):
    items: list[LeaveRequestOut]
    total: int
    page: int
    page_size: int
    pages: int


class LeaveBalanceOut(BaseModel):
    leave_type_id: int
    code: str
    name: str
    entitled: Decimal
    used: Decimal
    pending: Decimal
    available: Decimal
    carry_forward: bool
    encash_unused: bool


class EmployeeLeaveBalances(BaseModel):
    employee_id: int
    employee_name: str
    employee_code: str
    period: date
    balances: list[LeaveBalanceOut]


class PayrollInputBase(BaseModel):
    employee_id: int
    period: date
    kind: InputKind
    label: str = Field(min_length=1, max_length=80)
    amount: Decimal = Field(default=Decimal("0"), ge=0)
    hours: Decimal | None = Field(default=None, ge=0, le=744)
    include_in_pf: bool = False
    include_in_esi: bool = True
    note: str | None = Field(default=None, max_length=255)
    # LOP reversal: which month is being corrected, and how many days.
    reference_period: date | None = None
    days: Decimal | None = Field(default=None, ge=0, le=31)

    @model_validator(mode="after")
    def _value(self):
        if self.kind == "overtime":
            if not self.hours and self.amount <= 0:
                raise ValueError("Give overtime as hours or as an amount")
        elif self.kind == "lop_reversal":
            if not self.reference_period:
                raise ValueError("Choose the month the LOP is being reversed from")
            if not self.days or self.days <= 0:
                raise ValueError("Enter how many LOP days to reverse")
        elif self.amount <= 0:
            raise ValueError("Amount must be greater than zero")
        return self


class PayrollInputCreate(PayrollInputBase):
    pass


class PayrollInputOut(PayrollInputBase):
    id: int
    employee_name: str | None = None
    employee_code: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------
# TDS challans
# --------------------------------------------------------------------------


class TdsChallanBase(BaseModel):
    period: date
    deposit_date: date
    bsr_code: str = Field(min_length=7, max_length=7)
    challan_serial: str = Field(min_length=1, max_length=5)
    section: str = Field(default="392", max_length=8)
    mode: Literal["online", "offline"] = "online"
    tds_amount: Decimal = Field(default=Decimal("0"), ge=0)
    surcharge: Decimal = Field(default=Decimal("0"), ge=0)
    education_cess: Decimal = Field(default=Decimal("0"), ge=0)
    interest: Decimal = Field(default=Decimal("0"), ge=0)
    late_fee: Decimal = Field(default=Decimal("0"), ge=0)
    note: str | None = Field(default=None, max_length=255)

    @field_validator("bsr_code")
    @classmethod
    def _bsr(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"\d{7}", v):
            raise ValueError("BSR code must be exactly 7 digits")
        return v

    @field_validator("challan_serial")
    @classmethod
    def _serial(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"\d{1,5}", v):
            raise ValueError("Challan serial must be up to 5 digits")
        return v.zfill(5)

    @model_validator(mode="after")
    def _dates(self):
        if self.deposit_date < self.period:
            raise ValueError("Deposit date cannot be before the deduction month")
        return self


class TdsChallanCreate(TdsChallanBase):
    pass


class TdsChallanOut(TdsChallanBase):
    id: int
    total_amount: Decimal
    created_at: datetime
    # Derived in the router; defaulted so the ORM row validates.
    cin: str = ""
    financial_year: str = ""
    quarter: int = 0
    due_date: date | None = None
    is_late: bool = False

    model_config = {"from_attributes": True}


class TdsMonthRow(BaseModel):
    period: date
    deducted: Decimal
    deposited: Decimal
    difference: Decimal
    employees: int
    challans: int
    due_date: date
    is_late: bool
    status: Literal["matched", "short", "excess", "not_deposited", "nothing_due"]


class TdsReconciliation(BaseModel):
    financial_year: str
    quarter: int | None
    return_due_date: date | None
    total_deducted: Decimal
    total_deposited: Decimal
    difference: Decimal
    months: list[TdsMonthRow]


class TdsEmployeeRow(BaseModel):
    employee_id: int
    employee_name: str
    employee_code: str
    pan: str | None
    amount: Decimal
    months: int



# --------------------------------------------------------------------------
# Loans & advances
# --------------------------------------------------------------------------

LoanKind = Literal["loan"]
InterestMethod = Literal["none", "flat", "reducing"]
LoanStatus = Literal["active", "closed", "on_hold"]


class LoanCreate(BaseModel):
    employee_id: int
    kind: LoanKind = "loan"
    principal: Decimal = Field(gt=0, le=Decimal("99999999"))
    interest_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    interest_method: InterestMethod = "none"
    instalments: int = Field(ge=1, le=240)
    start_period: date
    purpose: str | None = Field(default=None, max_length=160)
    note: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def _interest(self):
        if self.interest_method != "none" and self.interest_rate <= 0:
            raise ValueError("Give an interest rate, or set the method to none")
        if self.interest_method == "none":
            self.interest_rate = Decimal("0")
        return self


class LoanInstalmentOut(BaseModel):
    id: int
    seq: int
    due_period: date
    principal_part: Decimal
    interest_part: Decimal
    amount: Decimal
    status: Literal["pending", "paid", "skipped", "waived"]
    paid_in_run_id: int | None

    model_config = {"from_attributes": True}


class LoanOut(BaseModel):
    id: int
    reference: str
    employee_id: int
    employee_name: str | None = None
    employee_code: str | None = None
    kind: LoanKind
    principal: Decimal
    interest_rate: Decimal
    interest_method: InterestMethod
    instalments: int
    start_period: date
    status: LoanStatus
    purpose: str | None
    note: str | None
    created_at: datetime

    total_payable: Decimal = Decimal("0")
    paid_amount: Decimal = Decimal("0")
    outstanding: Decimal = Decimal("0")
    paid_instalments: int = 0
    next_due: date | None = None
    emi: Decimal = Decimal("0")

    model_config = {"from_attributes": True}


class LoanDetail(LoanOut):
    schedule: list[LoanInstalmentOut] = []


class LoanAction(BaseModel):
    action: Literal["hold", "resume", "close", "foreclose"]
    note: str | None = Field(default=None, max_length=255)


# --------------------------------------------------------------------------
# Statutory bonus
# --------------------------------------------------------------------------


class BonusRow(BaseModel):
    employee_id: int
    employee_name: str
    employee_code: str
    months: int
    days_worked: Decimal
    wage_total: Decimal
    capped_wage_total: Decimal
    rate: Decimal
    amount: Decimal
    eligible: bool
    reason: str | None = None


class BonusPreview(BaseModel):
    financial_year: str
    rate: Decimal
    basis: str
    eligibility_ceiling: Decimal
    calculation_ceiling: Decimal
    total: Decimal
    eligible_count: int
    rows: list[BonusRow]


class BonusApply(BaseModel):
    financial_year: int
    period: date
    rate: Decimal | None = Field(default=None, ge=0, le=100)
    label: str = Field(default="Statutory bonus", max_length=80)


# --------------------------------------------------------------------------
# Salary advance — part of the month's own salary, paid early
# --------------------------------------------------------------------------

AdvanceStatus = Literal["pending", "paid", "recovered", "cancelled"]


class SalaryAdvanceCreate(BaseModel):
    employee_id: int
    period: date
    # Give either a percentage of the month's salary, or a flat amount.
    percent: Decimal | None = Field(default=None, gt=0, le=100)
    amount: Decimal | None = Field(default=None, gt=0)
    paid_on: date | None = None
    payment_mode: Literal["bank", "cash", "upi", "cheque"] = "bank"
    reference: str | None = Field(default=None, max_length=64)
    note: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def _either(self):
        if self.percent is None and self.amount is None:
            raise ValueError("Give a percentage or an amount")
        return self


class SalaryAdvanceOut(BaseModel):
    id: int
    employee_id: int
    employee_name: str | None = None
    employee_code: str | None = None
    period: date
    percent: Decimal | None
    amount: Decimal
    salary_basis: Decimal
    paid_on: date | None
    payment_mode: str
    reference: str | None
    status: AdvanceStatus
    recovered_in_run_id: int | None
    note: str | None
    created_at: datetime
    # How much of the month's salary this represents.
    percent_of_salary: Decimal = Decimal("0")

    model_config = {"from_attributes": True}


class SalaryAdvanceAction(BaseModel):
    action: Literal["mark_paid", "cancel"]
    paid_on: date | None = None
    reference: str | None = Field(default=None, max_length=64)


class AdvanceEligibility(BaseModel):
    employee_id: int
    period: date
    monthly_salary: Decimal
    basis: str
    default_percent: Decimal
    max_percent: Decimal
    max_amount: Decimal
    already_taken: Decimal
    available: Decimal


# --------------------------------------------------------------------------
# Employee settings
# --------------------------------------------------------------------------


class EmployeeSettingsBase(BaseModel):
    code_pattern: str = Field(default="EMP-{SEQ}", min_length=1, max_length=60)
    code_padding: int = Field(default=4, ge=1, le=10)
    code_next_number: int = Field(default=1, ge=1)
    code_reset: Literal["never", "yearly"] = "never"
    allow_manual_code: bool = False
    default_probation_days: int = Field(default=0, ge=0, le=730)

    @field_validator("code_pattern")
    @classmethod
    def _pattern(cls, v: str) -> str:
        from app.employee_codes import validate

        return validate(v)


class EmployeeSettingsUpdate(EmployeeSettingsBase):
    pass


class EmployeeSettingsOut(EmployeeSettingsBase):
    id: int
    code_reset_year: int | None
    updated_at: datetime
    preview: list[str] = []

    model_config = {"from_attributes": True}


class CodePreviewRequest(BaseModel):
    code_pattern: str = Field(min_length=1, max_length=60)
    code_padding: int = Field(default=4, ge=1, le=10)
    code_next_number: int = Field(default=1, ge=1)


class CodeTokenOut(BaseModel):
    token: str
    description: str


# --------------------------------------------------------------------------
# Holidays
# --------------------------------------------------------------------------

HolidayKind = Literal["public", "restricted", "company"]


class HolidayBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    holiday_date: date
    kind: HolidayKind = "public"
    is_paid: bool = True
    location: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=255)

    @field_validator("location", "note", mode="before")
    @classmethod
    def _blank(cls, v):
        if isinstance(v, str):
            return v.strip() or None
        return v


class HolidayCreate(HolidayBase):
    pass


class HolidayOut(HolidayBase):
    id: int
    weekday: str = ""
    created_at: datetime

    model_config = {"from_attributes": True}


class HolidayBulk(BaseModel):
    holidays: list[HolidayCreate] = Field(min_length=1, max_length=200)
    replace_year: int | None = None


class HolidayImportResult(BaseModel):
    added: int
    skipped: int
    removed: int


# --------------------------------------------------------------------------
# Income tax
# --------------------------------------------------------------------------

RegimeCode = Literal["new", "old"]


class TaxBandOut(BaseModel):
    id: int
    seq: int
    upto: Decimal | None
    rate_percent: Decimal

    model_config = {"from_attributes": True}


class TaxBandIn(BaseModel):
    upto: Decimal | None = Field(default=None, ge=0)
    rate_percent: Decimal = Field(ge=0, le=100)


class TaxRegimeBase(BaseModel):
    financial_year: int = Field(ge=1970, le=2200)
    code: RegimeCode
    name: str = Field(min_length=1, max_length=80)
    standard_deduction: Decimal = Field(default=Decimal("0"), ge=0)
    rebate_income_limit: Decimal = Field(default=Decimal("0"), ge=0)
    rebate_max_amount: Decimal = Field(default=Decimal("0"), ge=0)
    marginal_relief: bool = True
    cess_percent: Decimal = Field(default=Decimal("4"), ge=0, le=100)
    surcharge_cap_percent: Decimal = Field(default=Decimal("37"), ge=0, le=100)
    allow_chapter_vi: bool = False
    is_default: bool = False
    is_active: bool = True


class TaxRegimeUpdate(TaxRegimeBase):
    slabs: list[TaxBandIn] = Field(min_length=1)
    surcharges: list[TaxBandIn] = []

    @model_validator(mode="after")
    def _ordered(self):
        bounded = [b.upto for b in self.slabs if b.upto is not None]
        if bounded != sorted(bounded):
            raise ValueError("Slab upper bounds must increase")
        if sum(1 for b in self.slabs if b.upto is None) > 1:
            raise ValueError("Only the top slab may be open-ended")
        return self


class TaxRegimeOut(TaxRegimeBase):
    id: int
    slabs: list[TaxBandOut] = []
    surcharges: list[TaxBandOut] = []

    model_config = {"from_attributes": True}


class DeductionSectionBase(BaseModel):
    code: str = Field(min_length=1, max_length=24)
    name: str = Field(min_length=1, max_length=120)
    max_amount: Decimal | None = Field(default=None, ge=0)
    allowed_in_old: bool = True
    allowed_in_new: bool = False
    sort_order: int = 0
    is_active: bool = True
    note: str | None = Field(default=None, max_length=255)

    @field_validator("code", mode="before")
    @classmethod
    def _code(cls, v):
        return re.sub(r"\s+", "", v).upper() if isinstance(v, str) else v


class DeductionSectionOut(DeductionSectionBase):
    id: int

    model_config = {"from_attributes": True}


class DeclarationItem(BaseModel):
    code: str
    amount: Decimal = Field(ge=0)


class TaxDeclarationBase(BaseModel):
    financial_year: int = Field(ge=1970, le=2200)
    regime_code: RegimeCode = "new"
    items: list[DeclarationItem] = []
    hra_rent_paid: Decimal = Field(default=Decimal("0"), ge=0)
    hra_metro: bool = False
    other_income: Decimal = Field(default=Decimal("0"), ge=0)
    verified: bool = False
    note: str | None = Field(default=None, max_length=255)


class TaxDeclarationUpdate(TaxDeclarationBase):
    pass


class TaxDeclarationOut(TaxDeclarationBase):
    id: int
    employee_id: int
    employee_name: str | None = None
    employee_code: str | None = None
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaxLine(BaseModel):
    label: str
    amount: Decimal
    note: str | None = None


class TaxComputationOut(BaseModel):
    employee_id: int
    employee_name: str | None = None
    employee_code: str | None = None
    financial_year: int
    regime_code: RegimeCode
    regime_name: str

    gross_salary: Decimal
    other_income: Decimal
    exemptions: list[TaxLine] = []
    deductions: list[TaxLine] = []
    total_exemptions: Decimal
    total_deductions: Decimal
    taxable_income: Decimal

    slab_tax: Decimal
    rebate: Decimal
    tax_after_rebate: Decimal
    surcharge: Decimal
    cess: Decimal
    annual_tax: Decimal

    already_deducted: Decimal
    remaining_months: int
    monthly_tds: Decimal

    months_elapsed: int = 0
    earned_so_far: Decimal = Decimal("0")
    projected_remaining: Decimal = Decimal("0")


class RegimeComparison(BaseModel):
    employee_id: int
    financial_year: int
    new_regime: TaxComputationOut
    old_regime: TaxComputationOut
    better: RegimeCode
    saving: Decimal


# --------------------------------------------------------------------------
# Dashboard
# --------------------------------------------------------------------------


class HeadcountOut(BaseModel):
    active: int
    joined_this_month: int
    exits_this_month: int
    on_probation: int


class AttendanceTodayOut(BaseModel):
    present: int
    half_day: int
    absent: int
    weekly_off: int
    holiday: int
    on_leave: int
    late: int
    overtime_hours: float
    not_marked: int
    expected: int
    rate: float


class TrendPointOut(BaseModel):
    date: date
    present: int
    half_day: int
    absent: int
    on_leave: int
    weekly_off: int
    holiday: int
    rate: float


class DepartmentSliceOut(BaseModel):
    name: str
    count: int
    pct: float


class ShiftCoverageOut(BaseModel):
    shift_id: int
    name: str
    code: str
    start_time: time
    end_time: time
    assigned: int
    present: int
    pct: float


class PendingLeaveOut(BaseModel):
    id: int
    employee_name: str | None = None
    employee_code: str | None = None
    leave_type: str | None = None
    start_date: date
    end_date: date
    days: Decimal
    applied_on: date
    starts_in_days: int


class LeaveBlockOut(BaseModel):
    pending_count: int
    pending: list[PendingLeaveOut] = []


class PayrollBlockOut(BaseModel):
    period: date | None = None
    status: str | None = None
    total_net: Decimal = Decimal("0")
    total_gross: Decimal = Decimal("0")
    employee_count: int = 0
    change_pct: float | None = None


class UpcomingHolidayOut(BaseModel):
    name: str
    holiday_date: date
    kind: str
    days_away: int


class JoinerOut(BaseModel):
    id: int
    name: str | None = None
    employee_code: str | None = None
    department: str | None = None
    date_of_joining: date
    days_ago: int


class CelebrationOut(BaseModel):
    employee_id: int
    name: str | None = None
    employee_code: str | None = None
    kind: Literal["birthday", "anniversary"]
    on_date: date
    years: int | None = None


class PunchFeedOut(BaseModel):
    id: int
    employee_name: str | None = None
    employee_code: str | None = None
    punch_at: datetime
    direction: str
    source: str


class DashboardOut(BaseModel):
    today: date
    headcount: HeadcountOut
    attendance: AttendanceTodayOut
    trend: list[TrendPointOut] = []
    departments: list[DepartmentSliceOut] = []
    shifts: list[ShiftCoverageOut] = []
    leave: LeaveBlockOut
    payroll: PayrollBlockOut
    holidays: list[UpcomingHolidayOut] = []
    joiners: list[JoinerOut] = []
    celebrations: list[CelebrationOut] = []
    punches: list[PunchFeedOut] = []
    without_salary: int = 0


# --------------------------------------------------------------------------
# Biometric devices
# --------------------------------------------------------------------------


class DeviceBase(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    host: str = Field(min_length=3, max_length=120)
    port: int = Field(default=4370, ge=1, le=65535)
    password: int = Field(default=0, ge=0)
    timeout_seconds: int = Field(default=10, ge=1, le=120)
    force_udp: bool = False
    omit_ping: bool = True
    location: str | None = Field(default=None, max_length=120)
    clear_after_fetch: bool = False
    is_active: bool = True

    @field_validator("host", mode="before")
    @classmethod
    def _host(cls, v):
        return v.strip() if isinstance(v, str) else v


class DeviceCreate(DeviceBase):
    pass


class DeviceOut(DeviceBase):
    id: int
    serial_number: str | None = None
    model: str | None = None
    last_sync_at: datetime | None = None
    last_punch_at: datetime | None = None
    last_error: str | None = None

    model_config = {"from_attributes": True}


class DeviceTestResult(BaseModel):
    reachable: bool
    serial_number: str | None = None
    model: str | None = None
    firmware: str | None = None
    platform: str | None = None
    device_time: datetime | None = None
    users: int = 0
    records: int = 0
    # Minutes the terminal's clock is away from the server's.
    clock_drift_minutes: int | None = None
    message: str | None = None


class DeviceFetchResult(BaseModel):
    received: int = 0
    stored: int = 0
    duplicates: int = 0
    unmatched: list[str] = []
    recomputed_days: int = 0
    first_punch_at: datetime | None = None
    last_punch_at: datetime | None = None


# --------------------------------------------------------------------------
# Audit trail
# --------------------------------------------------------------------------


class AuditEntryOut(BaseModel):
    id: int
    at: datetime
    admin_id: int | None = None
    admin_email: str | None = None
    action: str
    entity: str
    entity_id: str | None = None
    label: str | None = None
    summary: str | None = None
    changes: dict = {}
    method: str | None = None
    path: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None

    model_config = {"from_attributes": True}


class AuditPage(BaseModel):
    items: list[AuditEntryOut]
    total: int
    page: int
    page_size: int
    pages: int


class AuditFacets(BaseModel):
    actions: list[str] = []
    entities: list[str] = []
    admins: list[str] = []


# --------------------------------------------------------------------------
# Reports
# --------------------------------------------------------------------------


class AttendanceReportRow(BaseModel):
    employee_id: int
    employee_code: str | None = None
    employee_name: str | None = None
    department: str | None = None
    present: int = 0
    half_day: int = 0
    absent: int = 0
    on_leave: int = 0
    weekly_off: int = 0
    holiday: int = 0
    not_marked: int = 0
    payable_days: Decimal = Decimal("0")
    worked_minutes: int = 0
    overtime_minutes: int = 0
    late_minutes: int = 0
    late_days: int = 0
    continued_days: int = 0


class AttendanceReport(BaseModel):
    date_from: date
    date_to: date
    rows: list[AttendanceReportRow] = []
    employees: int = 0
    present: int = 0
    absent: int = 0
    on_leave: int = 0
    worked_minutes: int = 0
    overtime_minutes: int = 0


class PayrollReportRow(BaseModel):
    period: date
    status: str
    employees: int = 0
    gross: Decimal = Decimal("0")
    deductions: Decimal = Decimal("0")
    net: Decimal = Decimal("0")
    pf: Decimal = Decimal("0")
    employer_pf: Decimal = Decimal("0")
    esi: Decimal = Decimal("0")
    employer_esi: Decimal = Decimal("0")
    pt: Decimal = Decimal("0")
    tds: Decimal = Decimal("0")
    lop_days: Decimal = Decimal("0")
    overtime_minutes: int = 0


class PayrollReport(BaseModel):
    date_from: date
    date_to: date
    rows: list[PayrollReportRow] = []
    gross: Decimal = Decimal("0")
    deductions: Decimal = Decimal("0")
    net: Decimal = Decimal("0")
    employer_cost: Decimal = Decimal("0")


class StatutoryRow(BaseModel):
    employee_id: int
    employee_code: str | None = None
    employee_name: str | None = None
    uan: str | None = None
    esic_number: str | None = None
    pan: str | None = None
    gross: Decimal = Decimal("0")
    pf_employee: Decimal = Decimal("0")
    pf_employer: Decimal = Decimal("0")
    esi_employee: Decimal = Decimal("0")
    esi_employer: Decimal = Decimal("0")
    pt: Decimal = Decimal("0")
    tds: Decimal = Decimal("0")


class StatutoryReport(BaseModel):
    period: date
    rows: list[StatutoryRow] = []
    pf_total: Decimal = Decimal("0")
    esi_total: Decimal = Decimal("0")
    pt_total: Decimal = Decimal("0")
    tds_total: Decimal = Decimal("0")


class LeaveReportRow(BaseModel):
    employee_id: int
    employee_code: str | None = None
    employee_name: str | None = None
    department: str | None = None
    leave_type: str
    taken: Decimal = Decimal("0")
    balance: Decimal = Decimal("0")
    pending: Decimal = Decimal("0")


class LeaveReport(BaseModel):
    year: int
    rows: list[LeaveReportRow] = []
    taken: Decimal = Decimal("0")
    balance: Decimal = Decimal("0")


class HeadcountMonth(BaseModel):
    period: date
    opening: int = 0
    joined: int = 0
    left: int = 0
    closing: int = 0
    attrition_percent: float = 0


class HeadcountReport(BaseModel):
    date_from: date
    date_to: date
    months: list[HeadcountMonth] = []
    departments: dict[str, int] = {}
    joined: int = 0
    left: int = 0
    closing: int = 0


class OutstandingRow(BaseModel):
    kind: Literal["loan", "advance"]
    employee_id: int
    employee_code: str | None = None
    employee_name: str | None = None
    reference: str | None = None
    principal: Decimal = Decimal("0")
    recovered: Decimal = Decimal("0")
    outstanding: Decimal = Decimal("0")
    started: date | None = None
    note: str | None = None


class OutstandingReport(BaseModel):
    rows: list[OutstandingRow] = []
    loans: Decimal = Decimal("0")
    advances: Decimal = Decimal("0")


# --------------------------------------------------------------------------
# Employee self-service
# --------------------------------------------------------------------------


class EmployeeLogin(BaseModel):
    employee_code: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1)


class EmployeePasswordChange(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=10, max_length=128)


class EmployeeMeOut(BaseModel):
    id: int
    employee_code: str
    full_name: str | None = None
    work_email: str | None = None
    designation: str | None = None
    department: str | None = None
    date_of_joining: date
    photo_path: str | None = None
    must_change_password: bool = False


class PortalAccessUpdate(BaseModel):
    """Admin turning self-service on, off, or resetting the password."""

    enabled: bool = True
    password: str | None = Field(default=None, min_length=10, max_length=128)
    must_change_password: bool = True


class PortalAccessOut(BaseModel):
    employee_id: int
    employee_code: str
    portal_enabled: bool
    must_change_password: bool
    last_login_at: datetime | None = None
    password_changed_at: datetime | None = None
    # Only ever filled when the server generated one.
    temporary_password: str | None = None


# --------------------------------------------------------------------------
# Reimbursement
# --------------------------------------------------------------------------

ReimbursementStatus = Literal["pending", "approved", "rejected", "paid", "cancelled"]
Settlement = Literal["payroll", "separate"]

REIMBURSEMENT_CATEGORIES = [
    "travel",
    "food",
    "accommodation",
    "fuel",
    "phone",
    "medical",
    "equipment",
    "training",
    "other",
]


class ClaimCreate(BaseModel):
    category: str = Field(max_length=32)
    title: str = Field(min_length=2, max_length=120)
    description: str | None = None
    spent_on: date
    amount: Decimal = Field(gt=0)

    @field_validator("category")
    @classmethod
    def _category(cls, v: str) -> str:
        value = v.strip().lower()
        if value not in REIMBURSEMENT_CATEGORIES:
            raise ValueError("Pick one of the listed categories")
        return value

    @field_validator("spent_on")
    @classmethod
    def _not_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("You cannot claim for a date in the future")
        return v


class ClaimDecision(BaseModel):
    status: Literal["approved", "rejected"]
    approved_amount: Decimal | None = Field(default=None, ge=0)
    settlement: Settlement = "payroll"
    note: str | None = Field(default=None, max_length=255)


class ClaimOut(BaseModel):
    id: int
    reference: str
    employee_id: int
    employee_code: str | None = None
    employee_name: str | None = None
    category: str
    title: str
    description: str | None = None
    spent_on: date
    amount: Decimal
    approved_amount: Decimal | None = None
    receipt_path: str | None = None
    settlement: Settlement = "payroll"
    status: ReimbursementStatus
    decision_note: str | None = None
    decided_at: datetime | None = None
    decided_by: str | None = None
    paid_period: date | None = None
    paid_on: date | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------
# What an employee sees of their own records
# --------------------------------------------------------------------------


class MyAttendanceDay(BaseModel):
    attendance_date: date
    status: AttendanceStatus
    shift_name: str | None = None
    first_in: datetime | None = None
    last_out: datetime | None = None
    worked_minutes: int = 0
    overtime_minutes: int = 0
    late_minutes: int = 0
    is_continued: bool = False


class MyAttendanceMonth(BaseModel):
    month: str
    days: list[MyAttendanceDay] = []
    present: Decimal = Decimal("0")
    absent: int = 0
    on_leave: int = 0
    weekly_off: int = 0
    holiday: int = 0
    worked_minutes: int = 0
    overtime_minutes: int = 0
    late_days: int = 0


class MyPayslip(BaseModel):
    run_id: int
    period: date
    status: str
    gross_pay: Decimal
    total_deductions: Decimal
    net_pay: Decimal
    lop_days: Decimal
    payable_days: Decimal
    earnings: list = []
    deductions: list = []


class MyDocument(BaseModel):
    id: int
    kind: str
    title: str
    file_path: str
    uploaded_at: datetime | None = None


class MyLeaveRequest(BaseModel):
    """What an employee sends. Who they are comes from the session."""

    leave_type_id: int
    start_date: date
    end_date: date
    is_half_day: bool = False
    reason: str | None = None


class MyProfile(BaseModel):
    """Everything an employee may see about themselves."""

    id: int
    employee_code: str
    full_name: str | None = None
    photo_path: str | None = None
    status: str

    gender: str | None = None
    date_of_birth: date | None = None
    blood_group: str | None = None
    marital_status: str | None = None

    work_email: str | None = None
    personal_email: str | None = None
    phone: str | None = None
    alternate_phone: str | None = None
    current_address: str | None = None
    permanent_address: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_relation: str | None = None
    emergency_contact_phone: str | None = None

    designation: str | None = None
    department: str | None = None
    employment_type: str | None = None
    work_location: str | None = None
    date_of_joining: date
    probation_end_date: date | None = None
    reporting_manager: str | None = None
    shift_name: str | None = None

    # Their own identifiers, with the one that must not be shown in full
    # reduced to its last four digits.
    pan: str | None = None
    aadhaar_masked: str | None = None
    uan: str | None = None
    pf_number: str | None = None
    esic_number: str | None = None

    bank_name: str | None = None
    bank_account_masked: str | None = None
    bank_ifsc: str | None = None

    last_login_at: datetime | None = None


# --------------------------------------------------------------------------
# Notifications
# --------------------------------------------------------------------------


class NotificationOut(BaseModel):
    id: int
    kind: str
    title: str
    body: str | None = None
    link: str | None = None
    entity: str | None = None
    entity_id: int | None = None
    actor: str | None = None
    created_at: datetime
    read_at: datetime | None = None

    model_config = {"from_attributes": True}


class PendingCounts(BaseModel):
    """What is waiting on the admin, for the badges beside the menu."""

    leave: int = 0
    claims: int = 0


class NotificationSummary(BaseModel):
    unread: int = 0
    pending: PendingCounts = PendingCounts()


# --------------------------------------------------------------------------
# Attendance regularisation
# --------------------------------------------------------------------------


class RegularisationCreate(BaseModel):
    attendance_date: date
    requested_status: ManualStatus | None = None
    requested_in: time | None = None
    requested_out: time | None = None
    reason: str = Field(min_length=5, max_length=500)

    @model_validator(mode="after")
    def _asks_for_something(self):
        if not self.requested_status and not self.requested_in and not self.requested_out:
            raise ValueError("Say what should change — a status or the times")
        return self

    @field_validator("attendance_date")
    @classmethod
    def _not_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("You cannot correct a day that has not happened")
        return v


class RegularisationDecision(BaseModel):
    status: Literal["approved", "rejected"]
    note: str | None = Field(default=None, max_length=255)


class RegularisationOut(BaseModel):
    id: int
    employee_id: int
    employee_code: str | None = None
    employee_name: str | None = None
    attendance_date: date
    current_status: str | None = None
    requested_status: str | None = None
    requested_in: time | None = None
    requested_out: time | None = None
    reason: str
    status: str
    decision_note: str | None = None
    decided_at: datetime | None = None
    decided_by: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MyHoliday(BaseModel):
    name: str
    holiday_date: date
    kind: str
    weekday: str
    is_past: bool = False


class MyNotification(BaseModel):
    id: int
    kind: str
    title: str
    body: str | None = None
    link: str | None = None
    created_at: datetime
    read_at: datetime | None = None


class MyFormYear(BaseModel):
    year: int
    label: str
    gross: Decimal = Decimal("0")
    tds: Decimal = Decimal("0")
    months: int = 0


# --------------------------------------------------------------------------
# Admin users
# --------------------------------------------------------------------------

PermissionLevel = Literal["none", "read", "write"]


class TeamMemberCreate(BaseModel):
    email: EmailStr
    name: str | None = Field(default=None, max_length=120)
    password: str | None = Field(default=None, min_length=10, max_length=128)
    permissions: dict[str, PermissionLevel] = {}


class TeamMemberUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    permissions: dict[str, PermissionLevel] | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=10, max_length=128)


class TeamMemberOut(BaseModel):
    id: int
    email: EmailStr
    name: str | None = None
    role: str
    permissions: dict[str, str] = {}
    is_active: bool
    invited_by: str | None = None
    created_at: datetime
    password_changed_at: datetime | None = None
    totp_enabled: bool = False
    last_seen_at: datetime | None = None
    # Filled when the server generated one, and shown only once.
    temporary_password: str | None = None


class ModuleOut(BaseModel):
    key: str
    label: str


class BackupOut(BaseModel):
    name: str
    size_bytes: int
    created_at: datetime


# --------------------------------------------------------------------------
# Automations
# --------------------------------------------------------------------------

Cadence = Literal["every_minutes", "daily", "monthly"]


class AutomationUpdate(BaseModel):
    is_enabled: bool | None = None
    cadence: Cadence | None = None
    every_minutes: int | None = Field(default=None, ge=1, le=1440)
    run_at: time | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=28)
    options: dict | None = None


class AutomationRunOut(BaseModel):
    id: int
    started_at: datetime
    finished_at: datetime | None = None
    status: str
    message: str | None = None
    triggered_by: str

    model_config = {"from_attributes": True}


class AutomationOut(BaseModel):
    id: int
    key: str
    name: str
    description: str
    is_enabled: bool
    cadence: Cadence
    every_minutes: int
    run_at: time
    day_of_month: int
    options: dict = {}
    last_run_at: datetime | None = None
    last_status: str | None = None
    last_message: str | None = None
    next_run_at: datetime | None = None
    recent: list[AutomationRunOut] = []


# --------------------------------------------------------------------------
# Document library
# --------------------------------------------------------------------------


class LibraryDocument(BaseModel):
    id: int
    employee_id: int
    employee_code: str | None = None
    employee_name: str | None = None
    department: str | None = None
    doc_type: str
    title: str | None = None
    original_name: str | None = None
    file_path: str
    file_url: str | None = None
    uploaded_at: datetime


class LibraryFolder(BaseModel):
    employee_id: int
    employee_code: str
    employee_name: str | None = None
    department: str | None = None
    designation: str | None = None
    photo_path: str | None = None
    documents: int = 0
    kinds: list[str] = []
    latest_at: datetime | None = None


class LibraryPage(BaseModel):
    folders: list[LibraryFolder] = []
    total_documents: int = 0
    total_employees: int = 0
    missing: list[str] = []


# --------------------------------------------------------------------------
# Expenses
# --------------------------------------------------------------------------

PaymentMode = Literal["cash", "bank", "card", "upi", "cheque", "other"]
ExpenseStatus = Literal["recorded", "approved", "paid"]


class ExpenseCategoryBase(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    code: str = Field(min_length=1, max_length=16)
    monthly_budget: Decimal | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=255)
    is_active: bool = True
    sort_order: int = 0

    @field_validator("code", mode="before")
    @classmethod
    def _code(cls, v):
        return re.sub(r"\s+", "_", v.strip()).upper() if isinstance(v, str) else v


class ExpenseCategoryOut(ExpenseCategoryBase):
    id: int
    spent_this_month: Decimal = Decimal("0")

    model_config = {"from_attributes": True}


class ExpenseBase(BaseModel):
    category_id: int
    title: str = Field(min_length=2, max_length=160)
    description: str | None = None
    vendor: str | None = Field(default=None, max_length=160)
    spent_on: date
    amount: Decimal = Field(gt=0)
    tax_amount: Decimal = Field(default=Decimal("0"), ge=0)
    payment_mode: PaymentMode = "bank"
    payment_reference: str | None = Field(default=None, max_length=80)
    invoice_number: str | None = Field(default=None, max_length=80)
    gstin: str | None = Field(default=None, max_length=15)
    status: ExpenseStatus = "recorded"
    paid_on: date | None = None
    employee_id: int | None = None

    @field_validator("spent_on")
    @classmethod
    def _not_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("That date has not happened yet")
        return v


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseOut(ExpenseBase):
    id: int
    reference: str
    total_amount: Decimal
    # Named apart from the relationship, which pydantic would otherwise try
    # to read as a string and refuse.
    category_name: str | None = None
    category_code: str | None = None
    employee_name: str | None = None
    employee_code: str | None = None
    receipt_path: str | None = None
    recorded_by: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExpensePage(BaseModel):
    items: list[ExpenseOut] = []
    total: int = 0
    page: int = 1
    page_size: int = 50
    pages: int = 1
    sum_amount: Decimal = Decimal("0")


class CategorySpend(BaseModel):
    category_id: int | None = None
    name: str
    code: str | None = None
    spent: Decimal = Decimal("0")
    budget: Decimal | None = None
    share: float = 0
    over_budget: bool = False
    # Reimbursements are counted but not editable here.
    from_claims: bool = False


class MonthSpend(BaseModel):
    period: date
    spent: Decimal = Decimal("0")
    claims: Decimal = Decimal("0")


class ExpenseSummary(BaseModel):
    date_from: date
    date_to: date
    direct: Decimal = Decimal("0")
    claims: Decimal = Decimal("0")
    total: Decimal = Decimal("0")
    unpaid: Decimal = Decimal("0")
    budget: Decimal = Decimal("0")
    categories: list[CategorySpend] = []
    months: list[MonthSpend] = []


# --------------------------------------------------------------------------
# Email
# --------------------------------------------------------------------------


class EmailSettingsBase(BaseModel):
    is_enabled: bool = False
    from_name: str | None = Field(default=None, max_length=120)
    from_email: EmailStr | None = None
    reply_to: EmailStr | None = None
    redirect_to: EmailStr | None = None
    send_payslips: bool = True
    send_leave_decisions: bool = True
    send_claim_decisions: bool = True
    send_portal_invites: bool = True
    send_admin_alerts: bool = True


class EmailSettingsOut(EmailSettingsBase):
    id: int
    # Read from .env, shown so an admin can see whether it is set up.
    provider_ready: bool = False
    provider_url: str | None = None
    env_from_address: str | None = None
    queued: int = 0
    failed: int = 0
    sent_today: int = 0

    model_config = {"from_attributes": True}


class EmailTest(BaseModel):
    to_email: EmailStr


class EmailMessageOut(BaseModel):
    id: int
    kind: str
    to_email: str
    to_name: str | None = None
    subject: str
    status: str
    attempts: int
    last_error: str | None = None
    created_at: datetime
    sent_at: datetime | None = None

    model_config = {"from_attributes": True}


class PayslipOptionsOut(BaseModel):
    """Every switch the payslip editor exposes.

    Declared rather than returned as a loose dict so the frontend's type and
    this one can be checked against each other.
    """

    accent_color: str = "#072869"
    title: str = "Payslip"
    show_logo: bool = True
    logo_source: Literal["company", "custom"] = "company"
    logo_path: str | None = None
    logo_height: int = 34
    logo_align: Literal["left", "center", "right"] = "left"
    show_company_address: bool = True
    show_employee_meta: bool = True
    show_attendance_stats: bool = True
    show_notes: bool = True
    show_leave_table: bool = True
    show_employer_contributions: bool = True
    show_net_in_words: bool = True
    show_signature: bool = False
    signature_label: str = "Authorised Signatory"
    footer_note: str = (
        "This is a computer-generated payslip and does not require a signature."
    )
    density: Literal["comfortable", "compact"] = "comfortable"
