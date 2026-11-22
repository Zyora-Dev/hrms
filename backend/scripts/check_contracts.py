"""Compare the TypeScript types in the frontend with the API's own schema.

Most of the bugs that reached the screen in this project were the same shape:
a field named one thing in Pydantic and another in TypeScript, read as
`undefined` and rendered as a blank. Nothing warns about that — `string | null`
on an object that never carries the key is perfectly valid TypeScript.

So this reads the OpenAPI schema straight out of the app, reads every object
type in `frontend/src/lib`, and reports fields the frontend expects that no
response model actually returns.

Usage: python -m scripts.check_contracts
"""

import re
import sys
from pathlib import Path

from app.main import app

FRONTEND = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib"

# Types that describe what we *send*, or are built client-side, so they have
# no matching response model.
SKIP_TYPES = {
    "LoginResponse",
    "ExpensePayload",
    "ExpenseFilters",
    "AuditQuery",
    "AttendanceQuery",
    "PayslipFilters",
    "DevicePayload",
    "ShiftPayload",
    "EmployeeFormValues",
    "PayrollSettingsPayload",
    "EmailSettingsPayload",
    "TaxBand",
    "DeclarationItem",
    "LeaveBalance",
    # Server-sent events are not described by OpenAPI.
    "LiveEvent",
    # A free-form {from, to} pair inside an audit entry's JSON column.
    "AuditChange",
}

# Query-parameter shapes rather than response bodies.
SKIP_SUFFIXES = ("Payload", "Params", "Query", "Filters")

# Fields the client adds for its own use.
SKIP_FIELDS = {"file_url", "photo_url", "page_size"}

DECLARATION = re.compile(r"export type (\w+)\s*=\s*\{")
FIELD = re.compile(r"^\s*(\w+)\??\s*:", re.M)


def object_types(text: str) -> list[tuple[str, str]]:
    """Every `export type X = { ... }` with its own body.

    Brace counting rather than a regex: a type can be written on one line, and
    a field can itself be an object. Matching to the first `\n};` merged
    neighbouring types together and produced nonsense.
    """
    out: list[tuple[str, str]] = []

    for match in DECLARATION.finditer(text):
        start = match.end() - 1
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    out.append((match.group(1), text[start + 1 : i]))
                    break

    return out


def top_level_fields(body: str) -> set[str]:
    """Field names at the outermost level, ignoring nested object shapes."""
    flattened = []
    depth = 0
    for char in body:
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
        elif depth == 0:
            flattened.append(char)
        # A nested object leaves a gap, which is enough to break the line.

    return set(FIELD.findall("\n".join(
        line for line in "".join(flattened).splitlines()
    )))


def schema_fields() -> dict[str, set[str]]:
    """Every property name each component in the OpenAPI schema defines."""
    components = app.openapi().get("components", {}).get("schemas", {})
    return {
        name: set(body.get("properties", {}))
        for name, body in components.items()
    }


def known_fields(schemas: dict[str, set[str]]) -> set[str]:
    """Every field name the API returns anywhere."""
    out: set[str] = set()
    for fields in schemas.values():
        out |= fields
    return out


def best_match(fields: set[str], schemas: dict[str, set[str]]):
    """The response model this type most likely describes.

    Matched on how much of the frontend type the model covers, so a near-miss
    like `closing` against a model that calls it `available` still lands on
    the right model and reports the difference.
    """
    best = None
    best_score = 0.0

    for name, model in schemas.items():
        if not model:
            continue
        shared = len(fields & model)
        if not shared:
            continue
        # Favour models that explain most of the type without being huge.
        score = shared / len(fields | model)
        if score > best_score:
            best, best_score = name, score

    return (best, best_score)


def main() -> int:
    schemas = schema_fields()
    everything = known_fields(schemas)

    unknown_anywhere: list[str] = []
    wrong_model: list[str] = []
    checked = 0

    for file in sorted(FRONTEND.glob("*.ts")):
        text = file.read_text()

        for name, body in object_types(text):
            if name in SKIP_TYPES or name.endswith(SKIP_SUFFIXES):
                continue

            fields = top_level_fields(body) - SKIP_FIELDS
            if not fields:
                continue
            checked += 1

            # A field no response model anywhere defines can only ever read
            # as undefined.
            unknown = sorted(f for f in fields if f not in everything)
            if unknown:
                unknown_anywhere.append(f"{file.name} · {name}: {', '.join(unknown)}")
                continue

            # If any model carries every field, the type is satisfiable and
            # there is nothing to report — which model it came from does not
            # matter.
            if any(fields <= model for model in schemas.values()):
                continue

            model, score = best_match(fields, schemas)
            if model is None or score < 0.4:
                # Too little in common to say which model it describes.
                continue

            missing = sorted(fields - schemas[model])
            if missing:
                wrong_model.append(
                    f"{file.name} · {name} (looks like {model}): "
                    f"{', '.join(missing)}"
                )

    print(f"checked {checked} frontend types against {len(schemas)} API models\n")

    if unknown_anywhere:
        print("fields no response model defines anywhere:")
        for line in unknown_anywhere:
            print(f"  {line}")
        print()

    if wrong_model:
        print("fields missing from the model the type appears to describe:")
        for line in wrong_model:
            print(f"  {line}")
        print()

    if not unknown_anywhere and not wrong_model:
        print("every frontend type lines up with a response model")
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
