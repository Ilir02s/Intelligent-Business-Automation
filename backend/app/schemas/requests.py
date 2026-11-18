from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Category = Literal["Billing", "Customer support", "IT support", "Sales", "General inquiries"]
Priority = Literal["Low", "Normal", "High", "Critical"]


class RequestInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    text: str = Field(min_length=1, max_length=8000)


class Entity(BaseModel):
    type: Literal["Email", "Reference", "Amount", "Date"]
    value: str = Field(min_length=1, max_length=200)


class AnalysisContent(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    category: Category
    priority: Priority
    summary: str = Field(min_length=1, max_length=600)
    entities: list[Entity] = Field(max_length=30)


class Analysis(AnalysisContent):
    department: str
    recommended_actions: list[str]
    processing_method: Literal["rules", "ollama"]


class Decision(BaseModel):
    decision: Literal["approve", "reject"]
