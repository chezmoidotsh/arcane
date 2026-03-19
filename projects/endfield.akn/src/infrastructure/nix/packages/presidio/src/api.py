from fastapi import FastAPI
from pydantic import BaseModel
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import RecognizerResult as AnonymizerRecognizerResult
from typing import List, Dict, Any, Optional

from presidio_analyzer.nlp_engine import NlpEngineProvider

app = FastAPI(title="Presidio API")

provider = NlpEngineProvider(nlp_configuration={
    "nlp_engine_name": "spacy",
    "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}]
})
nlp_engine = provider.create_engine()

analyzer = AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=["en"])
anonymizer = AnonymizerEngine()

class AnalyzeRequest(BaseModel):
    text: str
    language: str
    entities: Optional[List[str]] = None
    correlation_id: Optional[str] = None
    score_threshold: Optional[float] = None
    return_decision_process: Optional[bool] = None

class AnonymizeRequest(BaseModel):
    text: str
    analyzer_results: List[Dict[str, Any]]
    anonymizers: Optional[Dict[str, Any]] = None

@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    results = analyzer.analyze(
        text=req.text,
        language=req.language,
        entities=req.entities,
        correlation_id=req.correlation_id,
        score_threshold=req.score_threshold,
        return_decision_process=req.return_decision_process
    )
    return [res.to_dict() for res in results]

@app.post("/anonymize")
def anonymize(req: AnonymizeRequest):
    analyzer_configs = None
    # If the user provides specific anonymizers config (e.g. custom replace text)
    if req.anonymizers:
        from presidio_anonymizer.entities import AnonymizerConfig
        analyzer_configs = {}
        for entity_type, config in req.anonymizers.items():
            analyzer_configs[entity_type] = AnonymizerConfig(
                anonymizer_name=config.get("type"),
                params=config
            )

    results = []
    for res in req.analyzer_results:
        results.append(AnonymizerRecognizerResult(
            entity_type=res.get("entity_type"),
            start=res.get("start"),
            end=res.get("end"),
            score=res.get("score")
        ))
    
    result = anonymizer.anonymize(
        text=req.text,
        analyzer_results=results,
        anonymizers_config=analyzer_configs
    )
    
    return {
        "text": result.text,
        "items": [item.to_dict() for item in result.items]
    }

@app.get("/health")
def health():
    return {"status": "ok"}
