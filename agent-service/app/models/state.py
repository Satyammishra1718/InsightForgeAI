import operator
from typing import List, Dict, Any, Optional, Annotated
from typing_extensions import TypedDict
from pydantic import BaseModel, Field

# --- Pydantic Models for REST API & Structured Outputs ---

class SourceCitation(BaseModel):
    title: str = ""
    url: str = ""
    snippet: str = ""

class SubQuestion(BaseModel):
    id: str
    question: str
    focusArea: Optional[str] = None

class ResearchFinding(BaseModel):
    subQuestionId: str
    subQuestion: str
    findings: str
    sources: List[SourceCitation] = Field(default_factory=list)

class VerifiedClaim(BaseModel):
    claim: str
    status: str = "verified" # "verified" | "flagged" | "unsupported"
    reason: str = ""
    sources: List[SourceCitation] = Field(default_factory=list)

class ReportSection(BaseModel):
    heading: str
    body: str
    citations: List[str] = Field(default_factory=list)

class ReportData(BaseModel):
    title: str
    content: str
    executiveSummary: Optional[str] = ""
    sections: List[ReportSection] = Field(default_factory=list)
    sources: List[SourceCitation] = Field(default_factory=list)

class TraceItem(BaseModel):
    agentName: str
    step: str
    input: Dict[str, Any]
    output: Dict[str, Any]
    timestamp: str

# --- API Request and Response Models ---

class ResearchRequest(BaseModel):
    sessionId: str
    query: str

class ResearchResponse(BaseModel):
    sessionId: str
    query: str
    status: str
    report: ReportData
    subQuestions: List[str] = Field(default_factory=list)
    researchFindings: List[ResearchFinding] = Field(default_factory=list)
    verifiedClaims: List[VerifiedClaim] = Field(default_factory=list)
    flaggedClaims: List[VerifiedClaim] = Field(default_factory=list)
    traces: List[TraceItem] = Field(default_factory=list)

# --- LangGraph Graph State (TypedDict) ---

class GraphState(TypedDict):
    sessionId: str
    originalQuery: str
    subQuestions: List[str]
    researchFindings: Annotated[List[Dict[str, Any]], operator.add]
    verifiedClaims: List[Dict[str, Any]]
    flaggedClaims: List[Dict[str, Any]]
    finalReport: Dict[str, Any]
    traces: Annotated[List[Dict[str, Any]], operator.add]
