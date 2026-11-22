"""Built-in letter templates, seeded once and editable thereafter."""

P = "<p>{}</p>"


def para(*lines: str) -> str:
    return "\n".join(P.format(line) for line in lines)


SIGN = (
    '<div class="sign"><p>For <b>{{company_name}}</b></p>'
    "<p>&nbsp;</p><p>Authorised Signatory<br/>Human Resources</p></div>"
)

DEFAULT_TEMPLATES: list[dict] = [
    {
        "key": "offer_letter",
        "name": "Offer Letter",
        "category": "Hiring & onboarding",
        "subject": "Offer of Employment",
        "required_fields": ["designation", "date_of_joining", "ctc_annual"],
        "inputs": [],
        "body": para(
            "Dear {{salutation}},",
            "We are pleased to offer you the position of <b>{{designation}}</b> in the "
            "{{department}} department at {{company_name}}.",
            "Your annual cost to company will be <b>{{ctc_annual}}</b> "
            "(approximately {{ctc_monthly}} per month). Your date of joining will be "
            "<b>{{date_of_joining}}</b> and you will be based at {{work_location}}.",
            "This offer is subject to verification of your documents and references. "
            "Please confirm your acceptance by signing and returning a copy of this letter.",
            "We look forward to welcoming you to the team.",
        )
        + SIGN,
    },
    {
        "key": "appointment_letter",
        "name": "Appointment Letter",
        "category": "Hiring & onboarding",
        "subject": "Letter of Appointment",
        "required_fields": ["designation", "date_of_joining"],
        "inputs": [],
        "body": para(
            "Dear {{salutation}},",
            "Further to your acceptance of our offer, we confirm your appointment as "
            "<b>{{designation}}</b> ({{employment_type}}) with {{company_name}} with "
            "effect from <b>{{date_of_joining}}</b>.",
            "Your employee code is <b>{{employee_code}}</b>. You will be based at "
            "{{work_location}} and will report as advised by the {{department}} department.",
            "Your employment is governed by the company's policies as amended from time "
            "to time. You are expected to maintain confidentiality of all company "
            "information during and after your employment.",
        )
        + SIGN,
    },
    {
        "key": "joining_report",
        "name": "Joining Report",
        "category": "Hiring & onboarding",
        "subject": "Joining Report",
        "required_fields": ["date_of_joining"],
        "inputs": [],
        "body": para(
            "I, <b>{{employee_name}}</b>, hereby report for duty at {{company_name}} on "
            "<b>{{date_of_joining}}</b> as {{designation}} in the {{department}} department.",
        )
        + '<table><tr><th>Employee code</th><td>{{employee_code}}</td></tr>'
        "<tr><th>Designation</th><td>{{designation}}</td></tr>"
        "<tr><th>Department</th><td>{{department}}</td></tr>"
        "<tr><th>Work location</th><td>{{work_location}}</td></tr>"
        "<tr><th>Date of joining</th><td>{{date_of_joining}}</td></tr></table>"
        + para("<p>&nbsp;</p>", "Signature of Employee: ______________________"),
    },
    {
        "key": "confirmation_letter",
        "name": "Confirmation Letter",
        "category": "Employment",
        "subject": "Confirmation of Employment",
        "required_fields": ["designation", "probation_end_date"],
        "inputs": [],
        "body": para(
            "Dear {{salutation}},",
            "We are pleased to inform you that, on successful completion of your probation "
            "on <b>{{probation_end_date}}</b>, your services with {{company_name}} are "
            "confirmed as <b>{{designation}}</b> with effect from that date.",
            "We appreciate your contribution during the probation period and look forward "
            "to your continued association with us.",
        )
        + SIGN,
    },
    {
        "key": "salary_certificate",
        "name": "Salary Certificate",
        "category": "Payroll",
        "subject": "Salary Certificate",
        "required_fields": ["designation", "date_of_joining", "ctc_annual"],
        "inputs": [],
        "body": para(
            "This is to certify that <b>{{employee_name}}</b> (Employee Code "
            "{{employee_code}}) is employed with {{company_name}} as "
            "<b>{{designation}}</b> since <b>{{date_of_joining}}</b>.",
        )
        + "<table><tr><th>Annual CTC</th><td>{{ctc_annual}}</td></tr>"
        "<tr><th>Monthly CTC</th><td>{{ctc_monthly}}</td></tr>"
        "<tr><th>Department</th><td>{{department}}</td></tr>"
        "<tr><th>PAN</th><td>{{pan}}</td></tr></table>"
        + para(
            "This certificate is issued on request for the purpose of "
            "{{purpose}} and does not constitute a guarantee of continued employment."
        )
        + SIGN,
        "inputs_override": True,
    },
    {
        "key": "experience_letter",
        "name": "Experience Letter",
        "category": "Exit",
        "subject": "Experience Certificate",
        "required_fields": ["designation", "date_of_joining", "date_of_exit"],
        "inputs": [],
        "body": para(
            "This is to certify that <b>{{employee_name}}</b> was employed with "
            "{{company_name}} as <b>{{designation}}</b> in the {{department}} department "
            "from <b>{{date_of_joining}}</b> to <b>{{date_of_exit}}</b>, a period of "
            "{{tenure}}.",
            "During the tenure, we found {{first_name}} to be sincere, hardworking and "
            "professional in conduct.",
            "We wish {{first_name}} success in all future endeavours.",
        )
        + SIGN,
    },
    {
        "key": "relieving_letter",
        "name": "Relieving Letter",
        "category": "Exit",
        "subject": "Relieving Letter",
        "required_fields": ["designation", "date_of_exit"],
        "inputs": [],
        "body": para(
            "Dear {{salutation}},",
            "This is to confirm that you have been relieved from your duties as "
            "<b>{{designation}}</b> at {{company_name}} at the close of business on "
            "<b>{{date_of_exit}}</b>.",
            "We confirm that you have handed over all company property and completed the "
            "exit formalities. All dues payable to you will be settled as per policy.",
            "We thank you for your service and wish you the best.",
        )
        + SIGN,
    },
    # ---- Letters that need details typed at generation time -----------------
    {
        "key": "increment_letter",
        "name": "Increment / Appraisal Letter",
        "category": "Payroll",
        "subject": "Salary Revision",
        "required_fields": ["designation"],
        "inputs": [
            {"name": "new_ctc", "label": "Revised annual CTC", "type": "text", "required": True},
            {"name": "effective_date", "label": "Effective from", "type": "date", "required": True},
            {"name": "new_designation", "label": "Revised designation (optional)", "type": "text", "required": False},
        ],
        "body": para(
            "Dear {{salutation}},",
            "In recognition of your performance and contribution, we are pleased to inform "
            "you that your annual cost to company has been revised to <b>{{new_ctc}}</b> "
            "with effect from <b>{{effective_date}}</b>.",
            "Your designation will be <b>{{new_designation}}</b>. All other terms and "
            "conditions of your employment remain unchanged.",
            "We congratulate you and look forward to your continued contribution.",
        )
        + SIGN,
    },
    {
        "key": "warning_letter",
        "name": "Warning Letter",
        "category": "Discipline",
        "subject": "Warning Letter",
        "required_fields": [],
        "inputs": [
            {"name": "incident_date", "label": "Date of incident", "type": "date", "required": True},
            {"name": "reason", "label": "Reason / observed conduct", "type": "textarea", "required": True},
            {"name": "expected_action", "label": "Expected corrective action", "type": "textarea", "required": False},
        ],
        "body": para(
            "Dear {{salutation}},",
            "This letter is to place on record our concern regarding the following, "
            "observed on <b>{{incident_date}}</b>:",
            "<i>{{reason}}</i>",
            "This conduct is not in line with the standards expected at {{company_name}}. "
            "{{expected_action}}",
            "You are advised to ensure this is not repeated. Failure to show improvement "
            "may result in further disciplinary action.",
        )
        + SIGN,
    },
    {
        "key": "transfer_letter",
        "name": "Transfer Letter",
        "category": "Employment",
        "subject": "Transfer Order",
        "required_fields": ["designation"],
        "inputs": [
            {"name": "new_location", "label": "New location", "type": "text", "required": True},
            {"name": "new_department", "label": "New department (optional)", "type": "text", "required": False},
            {"name": "effective_date", "label": "Effective from", "type": "date", "required": True},
        ],
        "body": para(
            "Dear {{salutation}},",
            "You are hereby transferred from {{work_location}} to <b>{{new_location}}</b> "
            "with effect from <b>{{effective_date}}</b>. Your department will be "
            "{{new_department}}.",
            "Your designation as {{designation}} and all other terms of employment remain "
            "unchanged. You are requested to report to the new location on the effective date.",
        )
        + SIGN,
    },
    {
        "key": "termination_letter",
        "name": "Termination Letter",
        "category": "Exit",
        "subject": "Termination of Employment",
        "required_fields": ["designation"],
        "inputs": [
            {"name": "last_working_day", "label": "Last working day", "type": "date", "required": True},
            {"name": "reason", "label": "Reason for termination", "type": "textarea", "required": True},
            {"name": "notice_details", "label": "Notice / settlement details", "type": "textarea", "required": False},
        ],
        "body": para(
            "Dear {{salutation}},",
            "We regret to inform you that your employment with {{company_name}} as "
            "<b>{{designation}}</b> stands terminated with effect from the close of "
            "business on <b>{{last_working_day}}</b>.",
            "Reason: <i>{{reason}}</i>",
            "{{notice_details}}",
            "You are requested to hand over all company property and complete the exit "
            "formalities on or before your last working day.",
        )
        + SIGN,
    },
    {
        "key": "appreciation_letter",
        "name": "Appreciation Letter",
        "category": "Recognition",
        "subject": "Letter of Appreciation",
        "required_fields": [],
        "inputs": [
            {"name": "achievement", "label": "Achievement / contribution", "type": "textarea", "required": True},
        ],
        "body": para(
            "Dear {{salutation}},",
            "We would like to place on record our appreciation for your contribution:",
            "<i>{{achievement}}</i>",
            "Your effort has been noticed and valued by the team at {{company_name}}. "
            "Thank you for the commitment you continue to show.",
            "Keep up the excellent work.",
        )
        + SIGN,
    },
]

# The salary certificate asks for a purpose at generation time.
for _t in DEFAULT_TEMPLATES:
    if _t.pop("inputs_override", False):
        _t["inputs"] = [
            {
                "name": "purpose",
                "label": "Purpose (e.g. visa application, bank loan)",
                "type": "text",
                "required": True,
            }
        ]
