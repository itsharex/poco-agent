from typing import Any


def parse_usage_int(value: Any) -> int | None:
    """Parse numeric usage values from callback payloads."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return int(float(stripped))
        except ValueError:
            return None
    return None


def normalize_usage_payload(usage_data: dict[str, Any] | None) -> dict[str, int]:
    """Normalize token counters for persistence and analytics."""
    normalized = {
        "input_tokens": max(
            parse_usage_int((usage_data or {}).get("input_tokens")) or 0, 0
        ),
        "output_tokens": max(
            parse_usage_int((usage_data or {}).get("output_tokens")) or 0, 0
        ),
        "cache_creation_input_tokens": max(
            parse_usage_int((usage_data or {}).get("cache_creation_input_tokens")) or 0,
            0,
        ),
        "cache_read_input_tokens": max(
            parse_usage_int((usage_data or {}).get("cache_read_input_tokens")) or 0,
            0,
        ),
    }
    normalized["total_tokens"] = sum(normalized.values())
    return normalized
