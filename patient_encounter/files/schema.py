"""The ONE patient schema. The Studio form, generator, checker and encounter all derive from it.
Add a field here and it appears in the form, import mapping and AI generation with no other code changes."""
from typing import Literal
from pydantic import BaseModel, Field as F

class Trigger(BaseModel):
    type: Literal["start", "topic_asked", "exam_requested", "after_turns", "custom_intent"] = "start"
    value: str = ""
class Item(BaseModel):  # a vital or exam finding that can be gated
    id: str = ""; label: str = ""; value: str = ""; trigger: Trigger = Trigger()

class Overview(BaseModel):
    title: str = ""; case_summary: str = ""; chief_complaint: str = ""; specialty: str = ""; care_setting: str = ""
    difficulty: Literal["beginner", "intermediate", "advanced"] = "intermediate"
class Demographics(BaseModel):
    name: str = ""; age: int = 40; sex: str = ""; gender_identity: str = ""; ethnicity: str = ""; primary_language: str = "English"
    occupation: str = ""; education: str = ""; living_situation: str = ""; marital_status: str = ""
class Allergy(BaseModel): substance: str = ""; reaction: str = ""
class Clinical(BaseModel):
    hpi: str = ""; pmh: list[str] = []; surgical_history: list[str] = []; family_history: str = ""; review_of_systems: str = ""
    allergies: list[Allergy] = []; vitals: list[Item] = []; exam: list[Item] = []
    hidden_diagnosis: str = ""; differentials: list[str] = []
class Med(BaseModel): name: str = ""; dose: str = ""; frequency: str = ""; indication: str = ""
class Medications(BaseModel):
    current: list[Med] = []; adherence: str = ""; otc_and_supplements: list[str] = []; past_medications: list[str] = []
class Nutrition(BaseModel):
    diet_pattern: str = ""; typical_daily_intake: str = ""; appetite: str = ""; weight_kg: float = 0; height_cm: float = 0
    alcohol: str = ""; caffeine: str = ""; food_allergies_intolerances: list[str] = []
class Psychosocial(BaseModel):
    personality: str = ""; communication_style: str = ""; health_literacy: Literal["low", "moderate", "high"] = "moderate"
    mood_and_emotional_state: str = ""; support_system: str = ""; tobacco_and_substance_use: str = ""; stressors: str = ""; beliefs_and_values: str = ""
class Rule(BaseModel): fact: str = ""; mode: Literal["volunteer", "if_asked", "only_if_probed"] = "if_asked"
class InformationDisclosure(BaseModel):
    opening_statement: str = ""; rules: list[Rule] = []; hidden_concerns: str = ""
class Learning(BaseModel):
    objectives: list[str] = []; key_questions_to_ask: list[str] = []; common_pitfalls: list[str] = []
    competencies: list[str] = []; debrief_points: list[str] = []
class Metadata(BaseModel):
    tags: list[str] = []; estimated_minutes: int = 15; created_by: str = ""; references: list[str] = []; notes: str = ""
class Artifact(BaseModel):
    id: str = ""; title: str = ""; kind: str = "lab"; file_url: str = ""; findings: str = ""; trigger: Trigger = Trigger()

class PatientProfile(BaseModel):
    overview: Overview = F(default_factory=Overview, title="Patient overview")
    demographics: Demographics = F(default_factory=Demographics, title="Demographics")
    clinical: Clinical = F(default_factory=Clinical, title="Clinical profile")
    medications: Medications = F(default_factory=Medications, title="Medication profile")
    nutrition: Nutrition = F(default_factory=Nutrition, title="Nutrition profile")
    psychosocial: Psychosocial = F(default_factory=Psychosocial, title="Psychosocial profile")
    disclosure: InformationDisclosure = F(default_factory=InformationDisclosure, title="Information disclosure")
    learning: Learning = F(default_factory=Learning, title="Learning profile")
    metadata: Metadata = F(default_factory=Metadata, title="Metadata")
    artifacts: list[Artifact] = []   # managed in the Artifacts tab
    knowledge: list[dict] = []       # managed in the Knowledge tab
