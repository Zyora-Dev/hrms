# HRMS

HRMS portal. Planned scope: employee management, payroll, attendance, plus automations.

Build it incrementally — one module at a time, working and verified before moving on. Do not
scaffold the whole system up front. Only build the module currently being asked for.

## Working agreement

- Be token-efficient. No preambles, no recaps of what was just said, no narration of obvious steps.
- Do exactly what is asked — nothing more. No unrequested refactors, extra files, or scope creep.
- No unsolicited suggestions, alternatives, or "you might also want to..." additions.
- Obey explicit orders. If an instruction is clear, follow it — don't substitute your own judgment.
- Ask only when the task is genuinely ambiguous and a wrong guess wastes work.
- Keep replies short. Report what changed and the result. Skip summaries of unchanged things.

## Stack

- Backend: FastAPI (Python 3.15) in `backend/`, venv at `backend/venv/`.
- Entrypoint: `backend/app/main.py` (`app` object).

## Commands

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 9300   # dev server
pip freeze > requirements.txt               # after installing deps
```

## Conventions

- All backend deps go in `backend/venv` and must be reflected in `backend/requirements.txt`.
- Routes live under `backend/app/`.
