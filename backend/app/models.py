from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    Time,
    UniqueConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Admin(Base):
    __tablename__ = "admin_auth"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    name: Mapped[str | None] = mapped_column(String(120))
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    # owner | member. An owner has every permission and cannot be locked out
    # of the system by another admin; a member has only what is granted here.
    role: Mapped[str] = mapped_column(String(12), default="owner", nullable=False)
    # {"payroll": "write", "employees": "read", ...} — anything absent is none.
    permissions: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    invited_by: Mapped[str | None] = mapped_column(String(255))

    # Two-step sign-in. The pending secret is what a fresh setup produced but
    # nobody has proved they can read yet — only a correct code promotes it.
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    totp_secret: Mapped[str | None] = mapped_column(String(64))
    totp_pending_secret: Mapped[str | None] = mapped_column(String(64))
    totp_enabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Hashed, like passwords: a list of one-time ways back in.
    backup_codes: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class AdminSession(Base):
    """One signed-in device.

    The token carries this row's `jti`, so signing a device out is a matter of
    marking the row revoked — the token stops working on its next request
    rather than lingering until it expires.
    """

    __tablename__ = "admin_session"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    admin_id: Mapped[int] = mapped_column(
        ForeignKey("admin_auth.id", ondelete="CASCADE"), index=True, nullable=False
    )
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    # Worked out from the user agent, for a list a person can recognise.
    device: Mapped[str | None] = mapped_column(String(120))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_reason: Mapped[str | None] = mapped_column(String(64))


class Company(Base):
    """Single-company profile. One row is expected; `company_uid` is the
    human-facing identifier used on documents."""

    __tablename__ = "company"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_uid: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)

    name: Mapped[str] = mapped_column(String(180), nullable=False)
    slug: Mapped[str] = mapped_column(String(180), unique=True, index=True, nullable=False)
    company_type: Mapped[str] = mapped_column(String(32), nullable=False)
    logo_path: Mapped[str | None] = mapped_column(String(255))

    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32))
    address: Mapped[str | None] = mapped_column(Text)

    # Statutory registrations
    gstin: Mapped[str | None] = mapped_column(String(15))
    pan: Mapped[str | None] = mapped_column(String(10))
    cin: Mapped[str | None] = mapped_column(String(21))
    tan: Mapped[str | None] = mapped_column(String(10))
    pf_code: Mapped[str | None] = mapped_column(String(32))
    esic_code: Mapped[str | None] = mapped_column(String(32))
    pt_number: Mapped[str | None] = mapped_column(String(32))

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Employee(Base):
    __tablename__ = "employee"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_code: Mapped[str] = mapped_column(
        String(20), unique=True, index=True, nullable=False
    )

    # --- Personal -------------------------------------------------------
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    middle_name: Mapped[str | None] = mapped_column(String(80))
    last_name: Mapped[str] = mapped_column(String(80), nullable=False)
    gender: Mapped[str | None] = mapped_column(String(16))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    blood_group: Mapped[str | None] = mapped_column(String(8))
    marital_status: Mapped[str | None] = mapped_column(String(16))
    photo_path: Mapped[str | None] = mapped_column(String(255))

    # --- Contact --------------------------------------------------------
    work_email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    personal_email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32))
    alternate_phone: Mapped[str | None] = mapped_column(String(32))
    current_address: Mapped[str | None] = mapped_column(Text)
    permanent_address: Mapped[str | None] = mapped_column(Text)

    emergency_contact_name: Mapped[str | None] = mapped_column(String(120))
    emergency_contact_relation: Mapped[str | None] = mapped_column(String(48))
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(32))

    # --- Employment -----------------------------------------------------
    designation_id: Mapped[int | None] = mapped_column(
        ForeignKey("designation.id", ondelete="RESTRICT"), index=True
    )
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("department.id", ondelete="RESTRICT"), index=True
    )
    designation_ref: Mapped["Designation | None"] = relationship(lazy="joined")
    department_ref: Mapped["Department | None"] = relationship(lazy="joined")
    employment_type: Mapped[str] = mapped_column(String(24), nullable=False)
    work_location: Mapped[str | None] = mapped_column(String(120))
    date_of_joining: Mapped[date] = mapped_column(Date, nullable=False)
    probation_end_date: Mapped[date | None] = mapped_column(Date)
    date_of_exit: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(24), default="active", nullable=False)

    reporting_manager_id: Mapped[int | None] = mapped_column(
        ForeignKey("employee.id", ondelete="SET NULL")
    )
    reporting_manager: Mapped["Employee | None"] = relationship(
        remote_side="Employee.id", lazy="joined"
    )

    # --- Payroll & statutory --------------------------------------------
    ctc_annual: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    pan: Mapped[str | None] = mapped_column(String(10))
    # Encrypted at rest; `aadhaar_last4` is what the screens actually show.
    aadhaar_encrypted: Mapped[str | None] = mapped_column(Text)
    aadhaar_last4: Mapped[str | None] = mapped_column(String(4))
    uan: Mapped[str | None] = mapped_column(String(12))
    # The number this person is enrolled under on the biometric terminal.
    # Blank means fall back to matching their employee code.
    device_user_id: Mapped[str | None] = mapped_column(String(32), index=True)

    # Self-service sign-in. Off until an admin sets a password, so an employee
    # record on its own grants nothing.
    portal_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    password_hash: Mapped[str | None] = mapped_column(String(255))
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pf_number: Mapped[str | None] = mapped_column(String(32))
    esic_number: Mapped[str | None] = mapped_column(String(32))

    bank_account_name: Mapped[str | None] = mapped_column(String(120))
    bank_account_number: Mapped[str | None] = mapped_column(String(32))
    bank_ifsc: Mapped[str | None] = mapped_column(String(11))
    bank_name: Mapped[str | None] = mapped_column(String(120))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    documents: Mapped[list["EmployeeDocument"]] = relationship(
        back_populates="employee",
        cascade="all, delete-orphan",
        order_by="EmployeeDocument.id",
    )

    @property
    def designation(self) -> str | None:
        return self.designation_ref.name if self.designation_ref else None

    @property
    def department(self) -> str | None:
        return self.department_ref.name if self.department_ref else None

    @property
    def full_name(self) -> str:
        parts = [self.first_name, self.middle_name, self.last_name]
        return " ".join(p for p in parts if p)


class EmployeeDocument(Base):
    __tablename__ = "employee_document"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), index=True, nullable=False
    )
    doc_type: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str | None] = mapped_column(String(160))
    file_path: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[str | None] = mapped_column(String(255))
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    employee: Mapped["Employee"] = relationship(back_populates="documents")


class Department(Base):
    __tablename__ = "department"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Designation(Base):
    __tablename__ = "designation"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class LetterTemplate(Base):
    """Admin-editable letter body with {{placeholder}} merge fields."""

    __tablename__ = "letter_template"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(48), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(48), nullable=False)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    # Employee fields that must be filled before this letter can be issued.
    required_fields: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    # Extra values the admin types at generation time.
    inputs: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Shift(Base):
    __tablename__ = "shift"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)

    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    break_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Tolerances before someone counts as late / leaving early.
    grace_in_minutes: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    grace_out_minutes: Mapped[int] = mapped_column(Integer, default=10, nullable=False)

    full_day_minutes: Mapped[int] = mapped_column(Integer, default=480, nullable=False)
    half_day_minutes: Mapped[int] = mapped_column(Integer, default=240, nullable=False)

    # How far past the end a punch still belongs to this shift's day, counted
    # in shifts rather than hours: carrying on means working another shift,
    # whole or half, so the allowance has to scale with the shift itself.
    max_continuation_shifts: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("1"), nullable=False
    )
    # How early before start a punch is accepted for this day.
    early_in_hours: Mapped[int] = mapped_column(Integer, default=4, nullable=False)

    # 0 = Monday … 6 = Sunday
    weekly_offs: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    @property
    def is_overnight(self) -> bool:
        """Night shifts end on the following calendar day."""
        return self.end_time <= self.start_time

    @property
    def paid_minutes(self) -> int:
        """Working time a full day is actually expected to produce."""
        return max(self.duration_minutes - self.break_minutes, 0)

    @property
    def duration_minutes(self) -> int:
        start = self.start_time.hour * 60 + self.start_time.minute
        end = self.end_time.hour * 60 + self.end_time.minute
        if self.is_overnight:
            end += 24 * 60
        return end - start

    @property
    def continuation_window_minutes(self) -> int:
        """How long after the end punches still count towards this day."""
        return int(
            (Decimal(self.duration_minutes) * Decimal(self.max_continuation_shifts))
            .to_integral_value()
        )


class EmployeeShift(Base):
    """Shift assignment with history, so past attendance keeps its old shift."""

    __tablename__ = "employee_shift"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), index=True, nullable=False
    )
    shift_id: Mapped[int] = mapped_column(
        ForeignKey("shift.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)

    employee: Mapped["Employee"] = relationship(lazy="joined")
    shift: Mapped["Shift"] = relationship(lazy="joined")


class AttendancePunch(Base):
    """Raw punch events — from the biometric device or entered by hand."""

    __tablename__ = "attendance_punch"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), index=True, nullable=False
    )
    punch_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, nullable=False
    )
    # "in" / "out" / "auto" when the device doesn't say
    direction: Mapped[str] = mapped_column(String(8), default="auto", nullable=False)
    source: Mapped[str] = mapped_column(String(16), default="biometric", nullable=False)
    device_id: Mapped[str | None] = mapped_column(String(64))
    # Device's own event id — used to make re-imports idempotent.
    external_id: Mapped[str | None] = mapped_column(String(80), index=True)
    note: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("employee_id", "punch_at", "external_id", name="uq_punch"),
    )


class AttendanceDay(Base):
    """One computed row per employee per attendance date."""

    __tablename__ = "attendance_day"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), index=True, nullable=False
    )
    attendance_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    shift_id: Mapped[int | None] = mapped_column(
        ForeignKey("shift.id", ondelete="SET NULL")
    )

    first_in: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_out: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    worked_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    overtime_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    late_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    early_exit_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Set when the employee worked past the end of their shift.
    is_continued: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    continued_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Set when the spill reached the following shift's window.
    continued_into_shift_id: Mapped[int | None] = mapped_column(
        ForeignKey("shift.id", ondelete="SET NULL")
    )

    status: Mapped[str] = mapped_column(String(16), default="absent", nullable=False)
    has_manual_punch: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    # auto | forced | excluded. Continuation is normally derived from the
    # punches; the admin can declare one the device missed, or dismiss a spill
    # caused by a stray scan. Survives recompute because it lives on the row.
    continuation_mode: Mapped[str] = mapped_column(
        String(12), default="auto", nullable=False
    )
    continuation_override_minutes: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    continuation_note: Mapped[str | None] = mapped_column(String(255))

    # Set when an admin marks the day by hand (present, absent, on leave …).
    # Beats whatever the punches say and survives recompute.
    status_override: Mapped[str | None] = mapped_column(String(16))
    status_note: Mapped[str | None] = mapped_column(String(255))

    remarks: Mapped[str | None] = mapped_column(String(255))
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    employee: Mapped["Employee"] = relationship(lazy="joined")
    shift: Mapped["Shift | None"] = relationship(
        lazy="joined", foreign_keys=[shift_id]
    )

    __table_args__ = (
        UniqueConstraint("employee_id", "attendance_date", name="uq_attendance_day"),
    )


class AttendanceSettings(Base):
    """Organisation-wide attendance policy. Single row (id = 1).

    Per-shift timings stay on the shift; this is the policy that applies
    across all of them and feeds payroll.
    """

    __tablename__ = "attendance_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    # How a payable unit is counted. Attendance is shift-based by default:
    # hours actually worked against the shift, not calendar days.
    payroll_basis: Mapped[str] = mapped_column(
        String(24), default="shift_hours", nullable=False
    )
    standard_monthly_days: Mapped[int] = mapped_column(
        Integer, default=26, nullable=False
    )

    # Punches are rounded to this many minutes before pairing (0 = off).
    round_punch_minutes: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    overtime_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    overtime_min_minutes: Mapped[int] = mapped_column(
        Integer, default=30, nullable=False
    )
    overtime_max_minutes_per_day: Mapped[int] = mapped_column(
        Integer, default=240, nullable=False
    )
    overtime_multiplier: Mapped[Decimal] = mapped_column(
        Numeric(4, 2), default=Decimal("1.50"), nullable=False
    )
    # A shift that runs into the next one: paid as overtime, or just recorded.
    continuation_counts_as_overtime: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    auto_absent_without_punch: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    allow_manual_punch: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    manual_punch_requires_reason: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    week_starts_on: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PayrollSettings(Base):
    """Organisation-wide payroll policy. Single row (id = 1).

    Everything that would otherwise be a constant in the calculation lives
    here so it can be changed without a code change.
    """

    __tablename__ = "payroll_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    # How a day of pay is derived from the monthly salary.
    lop_basis: Mapped[str] = mapped_column(
        String(24), default="standard_days", nullable=False
    )
    standard_days_per_month: Mapped[int] = mapped_column(
        Integer, default=26, nullable=False
    )
    # Rupees to round the net pay to (0 = no rounding).
    round_net_to: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    pay_overtime: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    overtime_rate_basis: Mapped[str] = mapped_column(
        String(16), default="basic", nullable=False
    )
    overtime_multiplier: Mapped[Decimal] = mapped_column(
        Numeric(4, 2), default=Decimal("1.50"), nullable=False
    )

    # Leave handling at period close.
    leave_encashment_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    encashment_basis: Mapped[str] = mapped_column(
        String(16), default="basic", nullable=False
    )

    # Statutory — rates and ceilings, never hardcoded.
    pf_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    pf_employee_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("12.00"), nullable=False
    )
    pf_employer_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("12.00"), nullable=False
    )
    pf_wage_ceiling: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("15000"), nullable=False
    )
    pf_cap_at_ceiling: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    esi_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    esi_employee_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("0.75"), nullable=False
    )
    esi_employer_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("3.25"), nullable=False
    )
    esi_gross_ceiling: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("21000"), nullable=False
    )

    pt_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    pt_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=Decimal("200"), nullable=False
    )

    # Income tax deducted at source on salary.
    tds_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tds_default_regime: Mapped[str] = mapped_column(
        String(8), default="new", nullable=False
    )

    # Default payslip layout; can still be overridden per download.
    payslip_template: Mapped[str] = mapped_column(
        String(16), default="classic", nullable=False
    )

    # --- Statutory bonus (Payment of Bonus Act) -------------------------
    bonus_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Employees earning above this monthly wage are not covered.
    bonus_eligibility_ceiling: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("21000"), nullable=False
    )
    # Bonus is computed on wage capped at this, or the minimum wage if higher.
    bonus_calculation_ceiling: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("7000"), nullable=False
    )
    bonus_minimum_wage: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    bonus_min_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("8.33"), nullable=False
    )
    bonus_max_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("20"), nullable=False
    )
    bonus_rate_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("8.33"), nullable=False
    )
    # Days worked in the accounting year to qualify.
    bonus_min_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    # basic | basic_da | gross
    bonus_basis: Mapped[str] = mapped_column(
        String(12), default="basic_da", nullable=False
    )

    # --- Salary advance -------------------------------------------------
    advance_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    advance_default_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("30"), nullable=False
    )
    # Most of a month's salary that may be drawn early, in total.
    advance_max_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("50"), nullable=False
    )
    advance_allow_custom_amount: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    # basic | gross — what the percentage applies to.
    advance_basis: Mapped[str] = mapped_column(
        String(12), default="gross", nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class SalaryComponent(Base):
    """A line on the payslip. Earnings and deductions are both defined here."""

    __tablename__ = "salary_component"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(24), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    # "earning" | "deduction"
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    # "percent_of_gross" | "percent_of_basic" | "fixed" | "balance"
    calculation: Mapped[str] = mapped_column(String(24), nullable=False)
    value: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )

    # Does a loss-of-pay day reduce this line?
    prorate_on_lop: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    is_taxable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Counts towards the PF / ESI wage base.
    include_in_pf: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    include_in_esi: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class LeaveType(Base):
    """Leave policy — accrual and what happens to an unused balance."""

    __tablename__ = "leave_type"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)

    monthly_accrual: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("1.5"), nullable=False
    )
    annual_cap: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    is_paid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # What happens to the leftover at period close.
    carry_forward: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    carry_forward_cap: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    encash_unused: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    encashment_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("100"), nullable=False
    )

    # --- Application rules ------------------------------------------------
    requires_approval: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    allow_half_day: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    min_notice_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_consecutive_days: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    allow_negative_balance: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    # Days of service before an employee may apply.
    applicable_after_days: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    # all | male | female — for maternity/paternity style leave.
    applies_to: Mapped[str] = mapped_column(String(8), default="all", nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class LeaveBalance(Base):
    """One row per employee, leave type and payroll period."""

    __tablename__ = "leave_balance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), index=True, nullable=False
    )
    leave_type_id: Mapped[int] = mapped_column(
        ForeignKey("leave_type.id", ondelete="CASCADE"), index=True, nullable=False
    )
    period: Mapped[date] = mapped_column(Date, index=True, nullable=False)

    opening: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False
    )
    accrued: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False
    )
    used: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False
    )
    encashed: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False
    )
    lapsed: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False
    )
    closing: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False
    )

    leave_type: Mapped["LeaveType"] = relationship(lazy="joined")

    __table_args__ = (
        UniqueConstraint(
            "employee_id", "leave_type_id", "period", name="uq_leave_balance"
        ),
    )


class PayrollRun(Base):
    __tablename__ = "payroll_run"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    period: Mapped[date] = mapped_column(Date, unique=True, index=True, nullable=False)
    # draft | approved | paid
    status: Mapped[str] = mapped_column(String(16), default="draft", nullable=False)

    total_gross: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), nullable=False
    )
    total_deductions: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), nullable=False
    )
    total_net: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), nullable=False
    )
    employee_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    notes: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    payslips: Mapped[list["Payslip"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )


class Payslip(Base):
    __tablename__ = "payslip"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(
        ForeignKey("payroll_run.id", ondelete="CASCADE"), index=True, nullable=False
    )
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), index=True, nullable=False
    )

    monthly_gross: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    payable_days: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False
    )
    period_days: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False
    )
    lop_days: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False
    )
    worked_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    overtime_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # [{code, name, kind, amount, note}]
    earnings: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    deductions: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    employer_contributions: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )

    gross_pay: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    total_deductions: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    net_pay: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )

    run: Mapped["PayrollRun"] = relationship(back_populates="payslips")
    employee: Mapped["Employee"] = relationship(lazy="joined")

    __table_args__ = (UniqueConstraint("run_id", "employee_id", name="uq_payslip"),)


class PayslipLayout(Base):
    """A saved payslip design: a base skeleton plus editable options."""

    __tablename__ = "payslip_layout"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    # classic | modern | compact — the underlying skeleton
    base: Mapped[str] = mapped_column(String(16), default="classic", nullable=False)
    options: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class LeaveRequest(Base):
    __tablename__ = "leave_request"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), index=True, nullable=False
    )
    leave_type_id: Mapped[int] = mapped_column(
        ForeignKey("leave_type.id", ondelete="RESTRICT"), index=True, nullable=False
    )

    start_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    # Stored rather than derived: half days and weekly offs change the count.
    days: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    is_half_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    reason: Mapped[str | None] = mapped_column(Text)
    # pending | approved | rejected | cancelled
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    decision_note: Mapped[str | None] = mapped_column(String(255))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    employee: Mapped["Employee"] = relationship(lazy="joined")
    leave_type: Mapped["LeaveType"] = relationship(lazy="joined")


class PayrollInput(Base):
    """One-off money for a period: bonus, incentive, deduction, extra overtime.

    Kept separate from the salary structure, which is the recurring part.
    """

    __tablename__ = "payroll_input"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), index=True, nullable=False
    )
    period: Mapped[date] = mapped_column(Date, index=True, nullable=False)

    # bonus | incentive | reimbursement | arrear | overtime | deduction | advance
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    # For overtime entered as time rather than money.
    hours: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    # For a LOP reversal: the month being corrected, and how many days.
    reference_period: Mapped[date | None] = mapped_column(Date)
    days: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))

    # Does this line attract PF / ESI?
    include_in_pf: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    include_in_esi: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    note: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    employee: Mapped["Employee"] = relationship(lazy="joined")


class TdsChallan(Base):
    """A TDS deposit. The CIN that identifies it is BSR code + date + serial.

    Recorded per deduction month, because the quarterly return has to map
    every deduction to the challan it was paid under.
    """

    __tablename__ = "tds_challan"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # First day of the month the TDS was deducted for.
    period: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    deposit_date: Mapped[date] = mapped_column(Date, nullable=False)

    bsr_code: Mapped[str] = mapped_column(String(7), nullable=False)
    challan_serial: Mapped[str] = mapped_column(String(5), nullable=False)

    # Section under the Income-tax Act 2025; 392 is salary TDS (was 192).
    section: Mapped[str] = mapped_column(String(8), default="392", nullable=False)
    mode: Mapped[str] = mapped_column(String(16), default="online", nullable=False)

    tds_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), nullable=False
    )
    surcharge: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), nullable=False
    )
    education_cess: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), nullable=False
    )
    interest: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), nullable=False
    )
    late_fee: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), nullable=False
    )
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), nullable=False
    )

    note: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "bsr_code", "deposit_date", "challan_serial", name="uq_tds_cin"
        ),
    )


class EmployeeLoan(Base):
    """A salary advance or a loan — the same ledger, different terms.

    An advance is simply a loan at 0% over a short tenure, so both share one
    schedule rather than duplicating the amortisation.
    """

    __tablename__ = "employee_loan"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reference: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # Kept for existing rows; new records are always "loan".
    kind: Mapped[str] = mapped_column(String(16), default="loan", nullable=False)
    principal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    interest_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("0"), nullable=False
    )
    # none | flat | reducing
    interest_method: Mapped[str] = mapped_column(
        String(12), default="none", nullable=False
    )
    instalments: Mapped[int] = mapped_column(Integer, nullable=False)
    # Month the first instalment is deducted.
    start_period: Mapped[date] = mapped_column(Date, nullable=False)

    # active | closed | on_hold
    status: Mapped[str] = mapped_column(String(12), default="active", nullable=False)
    purpose: Mapped[str | None] = mapped_column(String(160))
    note: Mapped[str | None] = mapped_column(String(255))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    employee: Mapped["Employee"] = relationship(lazy="joined")
    schedule: Mapped[list["LoanInstalment"]] = relationship(
        back_populates="loan",
        cascade="all, delete-orphan",
        order_by="LoanInstalment.seq",
    )


class LoanInstalment(Base):
    __tablename__ = "loan_instalment"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    loan_id: Mapped[int] = mapped_column(
        ForeignKey("employee_loan.id", ondelete="CASCADE"), index=True, nullable=False
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    due_period: Mapped[date] = mapped_column(Date, index=True, nullable=False)

    principal_part: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    interest_part: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    # pending | paid | skipped | waived
    status: Mapped[str] = mapped_column(String(10), default="pending", nullable=False)
    paid_in_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("payroll_run.id", ondelete="SET NULL")
    )

    loan: Mapped["EmployeeLoan"] = relationship(back_populates="schedule")

    __table_args__ = (UniqueConstraint("loan_id", "seq", name="uq_loan_seq"),)


class SalaryAdvance(Base):
    """Part of the month's own salary, paid out early.

    Not a loan: there is no repayment schedule and nothing carries forward.
    The amount is simply netted off the same month's payslip, so the employee
    receives the balance of what they had already earned.
    """

    __tablename__ = "salary_advance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # The salary month this is drawn against and recovered from.
    period: Mapped[date] = mapped_column(Date, index=True, nullable=False)

    # Requested as a percentage of the month's salary, or as a flat amount.
    percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # What the percentage was applied to, kept for the audit trail.
    salary_basis: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )

    paid_on: Mapped[date | None] = mapped_column(Date)
    payment_mode: Mapped[str] = mapped_column(
        String(16), default="bank", nullable=False
    )
    reference: Mapped[str | None] = mapped_column(String(64))

    # pending | paid | recovered | cancelled
    status: Mapped[str] = mapped_column(String(12), default="pending", nullable=False)
    recovered_in_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("payroll_run.id", ondelete="SET NULL")
    )
    note: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    employee: Mapped["Employee"] = relationship(lazy="joined")


class EmployeeSettings(Base):
    """Employee defaults, chiefly how the employee code is built."""

    __tablename__ = "employee_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    # Literal text plus tokens: {SEQ} {YYYY} {YY} {MM} {DEPT}
    code_pattern: Mapped[str] = mapped_column(
        String(60), default="EMP-{SEQ}", nullable=False
    )
    code_padding: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    code_next_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # never | yearly — whether the sequence restarts each financial year.
    code_reset: Mapped[str] = mapped_column(
        String(10), default="never", nullable=False
    )
    code_reset_year: Mapped[int | None] = mapped_column(Integer)
    # Let an admin type a code instead of generating one.
    allow_manual_code: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    default_probation_days: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Holiday(Base):
    """A non-working day that is still paid.

    Without this, a festival day has no punches and is marked absent, which
    silently becomes loss of pay.
    """

    __tablename__ = "holiday"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    holiday_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)

    # public | restricted | company
    kind: Mapped[str] = mapped_column(String(16), default="public", nullable=False)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Null applies everywhere; otherwise matched against the work location.
    location: Mapped[str | None] = mapped_column(String(120))
    note: Mapped[str | None] = mapped_column(String(255))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("holiday_date", "location", "name", name="uq_holiday"),
    )


class TaxRegime(Base):
    """Slab structure for one regime in one financial year.

    Rates are revised by each Finance Act, so everything here is data.
    """

    __tablename__ = "tax_regime"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    financial_year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    code: Mapped[str] = mapped_column(String(8), nullable=False)  # new | old
    name: Mapped[str] = mapped_column(String(80), nullable=False)

    standard_deduction: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    # Rebate under s.87A (s.156 of the 2025 Act).
    rebate_income_limit: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    rebate_max_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    marginal_relief: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    cess_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("4"), nullable=False
    )
    surcharge_cap_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("37"), nullable=False
    )
    # Whether Chapter VI-A deductions (80C, 80D, HRA …) may be claimed.
    allow_chapter_vi: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    slabs: Mapped[list["TaxSlab"]] = relationship(
        back_populates="regime",
        cascade="all, delete-orphan",
        order_by="TaxSlab.seq",
        lazy="selectin",
    )
    surcharges: Mapped[list["TaxSurcharge"]] = relationship(
        back_populates="regime",
        cascade="all, delete-orphan",
        order_by="TaxSurcharge.seq",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("financial_year", "code", name="uq_tax_regime"),
    )


class TaxSlab(Base):
    __tablename__ = "tax_slab"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    regime_id: Mapped[int] = mapped_column(
        ForeignKey("tax_regime.id", ondelete="CASCADE"), index=True, nullable=False
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    # Upper bound of the band; null means no upper bound.
    upto: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    rate_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)

    regime: Mapped["TaxRegime"] = relationship(back_populates="slabs")


class TaxSurcharge(Base):
    __tablename__ = "tax_surcharge"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    regime_id: Mapped[int] = mapped_column(
        ForeignKey("tax_regime.id", ondelete="CASCADE"), index=True, nullable=False
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    upto: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    rate_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)

    regime: Mapped["TaxRegime"] = relationship(back_populates="surcharges")


class DeductionSection(Base):
    """A claimable deduction, e.g. 80C with a 1,50,000 ceiling."""

    __tablename__ = "deduction_section"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(24), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    max_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    allowed_in_old: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    allowed_in_new: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    note: Mapped[str | None] = mapped_column(String(255))


class TaxDeclaration(Base):
    """What an employee has declared for the year."""

    __tablename__ = "tax_declaration"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), index=True, nullable=False
    )
    financial_year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    regime_code: Mapped[str] = mapped_column(String(8), default="new", nullable=False)

    # [{"code": "80C", "amount": "150000"}]
    items: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    hra_rent_paid: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    hra_metro: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    other_income: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )

    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    note: Mapped[str | None] = mapped_column(String(255))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    employee: Mapped["Employee"] = relationship(lazy="joined")

    __table_args__ = (
        UniqueConstraint("employee_id", "financial_year", name="uq_tax_declaration"),
    )


class BiometricDevice(Base):
    """An attendance terminal the server pulls punches from.

    eSSL and ZKTeco terminals (MB20ID among them) speak the same protocol on
    TCP 4370, so one record covers the lot.
    """

    __tablename__ = "biometric_device"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    host: Mapped[str] = mapped_column(String(120), nullable=False)
    port: Mapped[int] = mapped_column(Integer, default=4370, nullable=False)
    # Devices with a comms password refuse everything without it.
    password: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    force_udp: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    omit_ping: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    location: Mapped[str | None] = mapped_column(String(120))
    serial_number: Mapped[str | None] = mapped_column(String(80))
    model: Mapped[str | None] = mapped_column(String(80))

    # Clearing the device after a successful fetch keeps its small log from
    # filling up, at the cost of the records existing only here afterwards.
    clear_after_fetch: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_punch_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(255))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AuditLog(Base):
    """Who changed what, when, and what it was before.

    Append-only: nothing in the application updates or deletes a row here.
    """

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True, nullable=False
    )

    # The admin is kept by id *and* by email, so the trail still reads
    # correctly after an account is renamed or removed.
    admin_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_auth.id", ondelete="SET NULL")
    )
    admin_email: Mapped[str | None] = mapped_column(String(255))

    # create | update | delete | login | login_failed | logout | action
    action: Mapped[str] = mapped_column(String(24), index=True, nullable=False)
    entity: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64), index=True)
    # What the record is, in words, as it stood at the time.
    label: Mapped[str | None] = mapped_column(String(255))
    summary: Mapped[str | None] = mapped_column(String(500))

    # {"field": {"from": ..., "to": ...}}
    changes: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    method: Mapped[str | None] = mapped_column(String(8))
    path: Mapped[str | None] = mapped_column(String(255))
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(255))

    __table_args__ = (Index("ix_audit_entity_row", "entity", "entity_id"),)



class EmployeeSession(Base):
    """One signed-in employee device, revocable the same way an admin's is."""

    __tablename__ = "employee_session"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), index=True, nullable=False
    )
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    device: Mapped[str | None] = mapped_column(String(120))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_reason: Mapped[str | None] = mapped_column(String(64))


class ReimbursementClaim(Base):
    """An expense an employee asks to be paid back for.

    Raised by the employee, approved by an admin. Settlement is a choice the
    company makes: paid through payroll (it becomes a one-off payroll input
    for the month) or settled separately, in which case this record is the
    only trace.
    """

    __tablename__ = "reimbursement_claim"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reference: Mapped[str] = mapped_column(
        String(20), unique=True, index=True, nullable=False
    )
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), index=True, nullable=False
    )

    category: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    spent_on: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # What was actually agreed, which can be less than what was asked for.
    approved_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    receipt_path: Mapped[str | None] = mapped_column(String(255))

    # payroll | separate
    settlement: Mapped[str] = mapped_column(
        String(12), default="payroll", nullable=False
    )
    # pending | approved | rejected | paid | cancelled
    status: Mapped[str] = mapped_column(String(12), default="pending", nullable=False)
    decision_note: Mapped[str | None] = mapped_column(String(255))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_by: Mapped[str | None] = mapped_column(String(255))

    # Set when it was pushed into a pay run, so it is never paid twice.
    paid_period: Mapped[date | None] = mapped_column(Date)
    payroll_input_id: Mapped[int | None] = mapped_column(
        ForeignKey("payroll_input.id", ondelete="SET NULL")
    )
    paid_on: Mapped[date | None] = mapped_column(Date)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    employee: Mapped["Employee"] = relationship(lazy="joined")


class Notification(Base):
    """Something that happened and an admin should know about.

    Written by whatever caused it — an employee applying for leave, a claim
    being raised — and read from the bell in the header. Read state is per
    notification, not per admin, because there is a single admin account; it
    moves to a join table the day roles arrive.
    """

    __tablename__ = "notification"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str | None] = mapped_column(String(400))

    # Where to send the admin when they click it.
    link: Mapped[str | None] = mapped_column(String(255))
    entity: Mapped[str | None] = mapped_column(String(64))
    entity_id: Mapped[int | None] = mapped_column(Integer)

    actor: Mapped[str | None] = mapped_column(String(160))

    # Null means it is for the admin; set means it belongs to that employee.
    employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True, nullable=False
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))



class AttendanceRegularisation(Base):
    """An employee's request to correct one day of their attendance.

    The scans are what they are; this is the paper trail for changing what
    the day counted as, and who agreed to it.
    """

    __tablename__ = "attendance_regularisation"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), index=True, nullable=False
    )
    attendance_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)

    # What the day says now, kept so the request still reads correctly after
    # the day has been changed.
    current_status: Mapped[str | None] = mapped_column(String(16))

    # What is being asked for: a status, a corrected in/out time, or both.
    requested_status: Mapped[str | None] = mapped_column(String(16))
    requested_in: Mapped[time | None] = mapped_column(Time)
    requested_out: Mapped[time | None] = mapped_column(Time)

    reason: Mapped[str] = mapped_column(Text, nullable=False)

    # pending | approved | rejected | cancelled
    status: Mapped[str] = mapped_column(String(12), default="pending", nullable=False)
    decision_note: Mapped[str | None] = mapped_column(String(255))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_by: Mapped[str | None] = mapped_column(String(255))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    employee: Mapped["Employee"] = relationship(lazy="joined")

    __table_args__ = (
        Index("ix_regularisation_employee_date", "employee_id", "attendance_date"),
    )


class Automation(Base):
    """A job the server runs on its own, and how often.

    One row per job; the code behind each one lives in `app/jobs.py`. Keeping
    the schedule in the database means an admin can change it without a
    deploy, and the last result is right there when something stops working.
    """

    __tablename__ = "automation"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(48), unique=True, index=True, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # every_minutes | daily | monthly
    cadence: Mapped[str] = mapped_column(String(16), default="daily", nullable=False)
    every_minutes: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    # Wall-clock time for daily and monthly runs, in the org timezone.
    run_at: Mapped[time] = mapped_column(Time, default=time(2, 0), nullable=False)
    day_of_month: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Free-form knobs a single job cares about.
    options: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_status: Mapped[str | None] = mapped_column(String(12))
    last_message: Mapped[str | None] = mapped_column(String(400))
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AutomationRun(Base):
    """What happened the last few times a job ran."""

    __tablename__ = "automation_run"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    automation_id: Mapped[int] = mapped_column(
        ForeignKey("automation.id", ondelete="CASCADE"), index=True, nullable=False
    )
    key: Mapped[str] = mapped_column(String(48), index=True, nullable=False)

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True, nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # ok | failed | skipped
    status: Mapped[str] = mapped_column(String(12), default="ok", nullable=False)
    message: Mapped[str | None] = mapped_column(String(400))
    triggered_by: Mapped[str] = mapped_column(
        String(16), default="schedule", nullable=False
    )


class ExpenseCategory(Base):
    """A heading expenses are filed under, with an optional monthly budget."""

    __tablename__ = "expense_category"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    monthly_budget: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    note: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Expense(Base):
    """Money the company spent, as opposed to money it paid its staff.

    Employee reimbursements live in `reimbursement_claim` and are not copied
    here; the summary adds them in so the month's picture is complete without
    the same rupee being recorded twice.
    """

    __tablename__ = "expense"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reference: Mapped[str] = mapped_column(
        String(20), unique=True, index=True, nullable=False
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey("expense_category.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )

    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    vendor: Mapped[str | None] = mapped_column(String(160))

    spent_on: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    # cash | bank | card | upi | cheque | other
    payment_mode: Mapped[str] = mapped_column(
        String(12), default="bank", nullable=False
    )
    payment_reference: Mapped[str | None] = mapped_column(String(80))
    invoice_number: Mapped[str | None] = mapped_column(String(80))
    gstin: Mapped[str | None] = mapped_column(String(15))

    # recorded | approved | paid
    status: Mapped[str] = mapped_column(String(12), default="recorded", nullable=False)
    paid_on: Mapped[date | None] = mapped_column(Date)

    # Who it was for, when the spending relates to one person.
    employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employee.id", ondelete="SET NULL"), index=True
    )

    receipt_path: Mapped[str | None] = mapped_column(String(255))
    recorded_by: Mapped[str | None] = mapped_column(String(255))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    category: Mapped["ExpenseCategory"] = relationship(lazy="joined")
    employee: Mapped["Employee | None"] = relationship(lazy="joined")


class EmailSettings(Base):
    """Which events send mail, and who they appear to come from.

    One row. The provider credentials are not here — they live in `.env`,
    because a key that can send mail as the company should not be editable
    from a browser session.
    """

    __tablename__ = "email_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Blank falls back to the address configured in `.env`.
    from_name: Mapped[str | None] = mapped_column(String(120))
    from_email: Mapped[str | None] = mapped_column(String(255))
    reply_to: Mapped[str | None] = mapped_column(String(255))
    # Everything goes here instead of to the real recipient, for testing.
    redirect_to: Mapped[str | None] = mapped_column(String(255))

    # Which events actually send mail.
    send_payslips: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    send_leave_decisions: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    send_claim_decisions: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    send_portal_invites: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    send_admin_alerts: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
        nullable=False,
    )


class EmailMessage(Base):
    """One queued email.

    Nothing is sent inside the request that caused it: a slow or broken mail
    server would otherwise make approving leave hang or fail. The row is
    written, the request returns, and a background flush does the sending.
    """

    __tablename__ = "email_message"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), index=True, nullable=False)

    to_email: Mapped[str] = mapped_column(String(255), nullable=False)
    to_name: Mapped[str | None] = mapped_column(String(160))
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    body_text: Mapped[str | None] = mapped_column(Text)

    # [{"filename": "payslip.pdf", "path": "/uploads/..."}]
    attachments: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    entity: Mapped[str | None] = mapped_column(String(64))
    entity_id: Mapped[int | None] = mapped_column(Integer)

    # queued | sent | failed | cancelled
    status: Mapped[str] = mapped_column(String(12), default="queued", index=True,
                                        nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[str | None] = mapped_column(String(400))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True, nullable=False
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
