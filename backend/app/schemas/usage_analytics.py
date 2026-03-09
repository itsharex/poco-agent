from pydantic import BaseModel


class UsageMetricSummary(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0


class UsageAnalyticsBucket(UsageMetricSummary):
    bucket_id: str
    label: str


class UsageAnalyticsMonthView(BaseModel):
    month: str
    buckets: list[UsageAnalyticsBucket]


class UsageAnalyticsDayView(BaseModel):
    day: str
    buckets: list[UsageAnalyticsBucket]


class UsageAnalyticsSummary(BaseModel):
    month: UsageMetricSummary
    day: UsageMetricSummary
    all_time: UsageMetricSummary


class UsageAnalyticsResponse(BaseModel):
    timezone: str
    month: str
    day: str
    summary: UsageAnalyticsSummary
    month_view: UsageAnalyticsMonthView
    day_view: UsageAnalyticsDayView
